#!/bin/bash

# ==========================================
# CHATEAM PRODUCTION DEPLOYMENT SCRIPT
# ==========================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_ROOT}/backups"
LOG_FILE="${PROJECT_ROOT}/deployment.log"

# Default values
VERSION="${VERSION:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"
DRY_RUN="${DRY_RUN:-false}"

# ==========================================
# HELPER FUNCTIONS
# ==========================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"
}

check_prerequisites() {
    log "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Check environment file
    if [[ ! -f "${PROJECT_ROOT}/.env.production" ]]; then
        log_error "Production environment file not found"
        exit 1
    fi

    # Check disk space (minimum 10GB)
    AVAILABLE_SPACE=$(df "${PROJECT_ROOT}" | awk 'NR==2 {print $4}')
    if [[ $AVAILABLE_SPACE -lt 10485760 ]]; then # 10GB in KB
        log_warning "Low disk space detected. Consider cleaning up before deployment."
    fi

    log_success "Prerequisites check completed"
}

backup_data() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warning "Skipping backup as requested"
        return 0
    fi

    log "Creating backup..."

    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="${BACKUP_DIR}/${BACKUP_TIMESTAMP}"

    mkdir -p "$BACKUP_PATH"

    # Backup database
    log "Backing up database..."
    docker exec chateam-postgres-prod pg_dump -U chateam chateam_prod | gzip > "${BACKUP_PATH}/database.sql.gz"

    # Backup Redis data
    log "Backing up Redis data..."
    docker exec chateam-redis-prod redis-cli BGSAVE
    sleep 5
    docker cp chateam-redis-prod:/data/dump.rdb "${BACKUP_PATH}/redis_dump.rdb"

    # Backup configuration files
    log "Backing up configuration..."
    cp -r "${PROJECT_ROOT}/.env.production" "${BACKUP_PATH}/"
    cp -r "${PROJECT_ROOT}/monitoring" "${BACKUP_PATH}/"

    # Create backup manifest
    cat > "${BACKUP_PATH}/manifest.json" << EOF
{
  "timestamp": "${BACKUP_TIMESTAMP}",
  "version_before": "$(docker ps --format 'table {{.Image}}' | grep chateam/app | head -1 | cut -d':' -f2)",
  "version_after": "${VERSION}",
  "environment": "${ENVIRONMENT}",
  "files": [
    "database.sql.gz",
    "redis_dump.rdb",
    ".env.production",
    "monitoring/"
  ]
}
EOF

    log_success "Backup created at ${BACKUP_PATH}"
    echo "BACKUP_PATH=${BACKUP_PATH}" >> "$LOG_FILE"
}

run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping tests as requested"
        return 0
    fi

    log "Running pre-deployment tests..."

    # Health checks
    log "Testing current health endpoints..."
    if curl -f -s http://localhost:3000/health > /dev/null; then
        log_success "Application health check passed"
    else
        log_warning "Application health check failed (this may be expected during maintenance)"
    fi

    # Database connectivity
    log "Testing database connectivity..."
    if docker exec chateam-postgres-prod pg_isready -U chateam; then
        log_success "Database connectivity test passed"
    else
        log_error "Database connectivity test failed"
        exit 1
    fi

    # Redis connectivity
    log "Testing Redis connectivity..."
    if docker exec chateam-redis-prod redis-cli ping | grep -q PONG; then
        log_success "Redis connectivity test passed"
    else
        log_error "Redis connectivity test failed"
        exit 1
    fi

    log_success "Pre-deployment tests completed"
}

pull_images() {
    log "Pulling Docker images..."

    # Set version in environment
    export VERSION

    # Pull application images
    docker-compose -f "${PROJECT_ROOT}/docker-compose.production.yml" pull

    log_success "Docker images pulled successfully"
}

deploy_application() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN: Would deploy application with version ${VERSION}"
        return 0
    fi

    log "Deploying application version ${VERSION}..."

    cd "$PROJECT_ROOT"

    # Set version in environment
    export VERSION

    # Deploy with rolling update
    log "Starting rolling deployment..."

    # Update application containers first
    docker-compose -f docker-compose.production.yml up -d --no-deps app worker audit-service

    # Wait for health checks
    log "Waiting for application to be ready..."
    for i in {1..30}; do
        if curl -f -s http://localhost:3000/health/ready > /dev/null; then
            log_success "Application is ready"
            break
        fi

        if [[ $i -eq 30 ]]; then
            log_error "Application failed to become ready within timeout"
            exit 1
        fi

        log "Waiting for application to be ready... ($i/30)"
        sleep 10
    done

    # Update remaining services
    log "Updating remaining services..."
    docker-compose -f docker-compose.production.yml up -d

    log_success "Application deployment completed"
}

run_migrations() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN: Would run database migrations"
        return 0
    fi

    log "Running database migrations..."

    # Run migrations in a temporary container
    docker run --rm \
        --network chateam_chateam-network \
        --env-file "${PROJECT_ROOT}/.env.production" \
        "chateam/app:${VERSION}" \
        npm run migrate

    log_success "Database migrations completed"
}

verify_deployment() {
    log "Verifying deployment..."

    # Check container status
    log "Checking container status..."
    FAILED_CONTAINERS=$(docker-compose -f "${PROJECT_ROOT}/docker-compose.production.yml" ps --filter "status=exited" --format "table {{.Names}}")

    if [[ -n "$FAILED_CONTAINERS" && "$FAILED_CONTAINERS" != "NAMES" ]]; then
        log_error "Some containers failed to start:"
        echo "$FAILED_CONTAINERS"
        exit 1
    fi

    # Health checks
    log "Running health checks..."

    # Application health
    if ! curl -f -s http://localhost:3000/health | jq -e '.status == "healthy"' > /dev/null; then
        log_error "Application health check failed"
        exit 1
    fi

    # Prometheus health
    if ! curl -f -s http://localhost:9090/-/healthy > /dev/null; then
        log_error "Prometheus health check failed"
        exit 1
    fi

    # Grafana health
    if ! curl -f -s http://localhost:3001/api/health > /dev/null; then
        log_error "Grafana health check failed"
        exit 1
    fi

    log_success "Deployment verification completed"
}

cleanup() {
    log "Cleaning up old images and containers..."

    # Remove old images (keep last 3 versions)
    docker images "chateam/*" --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | \
        tail -n +2 | sort -k2 -r | \
        awk 'seen[$1]++ >= 3 {print $1}' | \
        xargs -r docker rmi

    # Clean up stopped containers
    docker container prune -f

    # Clean up unused networks
    docker network prune -f

    log_success "Cleanup completed"
}

rollback() {
    local backup_path="$1"

    log_error "Rolling back deployment..."

    if [[ ! -d "$backup_path" ]]; then
        log_error "Backup path not found: $backup_path"
        exit 1
    fi

    # Stop current services
    docker-compose -f "${PROJECT_ROOT}/docker-compose.production.yml" down

    # Restore database
    log "Restoring database from backup..."
    zcat "${backup_path}/database.sql.gz" | docker exec -i chateam-postgres-prod psql -U chateam -d chateam_prod

    # Restore Redis
    log "Restoring Redis from backup..."
    docker cp "${backup_path}/redis_dump.rdb" chateam-redis-prod:/data/dump.rdb
    docker restart chateam-redis-prod

    # Restore configuration
    cp "${backup_path}/.env.production" "${PROJECT_ROOT}/"

    # Start services with previous version
    local previous_version
    previous_version=$(jq -r '.version_before' "${backup_path}/manifest.json")
    VERSION="$previous_version" docker-compose -f "${PROJECT_ROOT}/docker-compose.production.yml" up -d

    log_success "Rollback completed"
}

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy Chateam to production environment.

OPTIONS:
    -v, --version VERSION     Docker image version to deploy (default: latest)
    -e, --environment ENV     Environment name (default: production)
    --skip-backup            Skip backup creation
    --skip-tests             Skip pre-deployment tests
    --dry-run                Show what would be done without executing
    --rollback PATH          Rollback to backup at PATH
    -h, --help               Show this help message

EXAMPLES:
    $0                       Deploy latest version
    $0 -v 1.2.3             Deploy version 1.2.3
    $0 --dry-run             Preview deployment
    $0 --rollback /path/to/backup  Rollback to backup

ENVIRONMENT VARIABLES:
    VERSION                  Override version
    SKIP_BACKUP             Skip backup (true/false)
    SKIP_TESTS              Skip tests (true/false)
    DRY_RUN                 Dry run mode (true/false)

EOF
}

# ==========================================
# MAIN EXECUTION
# ==========================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --skip-backup)
                SKIP_BACKUP="true"
                shift
                ;;
            --skip-tests)
                SKIP_TESTS="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --rollback)
                ROLLBACK_PATH="$2"
                shift 2
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Handle rollback
    if [[ -n "${ROLLBACK_PATH:-}" ]]; then
        rollback "$ROLLBACK_PATH"
        exit 0
    fi

    # Create log file
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"

    log "Starting Chateam production deployment"
    log "Version: ${VERSION}"
    log "Environment: ${ENVIRONMENT}"
    log "Dry run: ${DRY_RUN}"

    # Trap errors for cleanup
    trap 'log_error "Deployment failed at step: ${CURRENT_STEP}"' ERR

    # Deployment steps
    CURRENT_STEP="prerequisites"
    check_prerequisites

    CURRENT_STEP="tests"
    run_tests

    CURRENT_STEP="backup"
    backup_data

    CURRENT_STEP="images"
    pull_images

    CURRENT_STEP="migrations"
    run_migrations

    CURRENT_STEP="deployment"
    deploy_application

    CURRENT_STEP="verification"
    verify_deployment

    CURRENT_STEP="cleanup"
    cleanup

    log_success "🎉 Deployment completed successfully!"
    log "Version ${VERSION} is now running in ${ENVIRONMENT}"
    log "Logs available at: ${LOG_FILE}"

    # Show service status
    echo ""
    log "Service Status:"
    docker-compose -f "${PROJECT_ROOT}/docker-compose.production.yml" ps
}

# Run main function
main "$@"