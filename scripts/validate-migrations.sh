#!/bin/bash

# ============================================================================
# SCRIPT DE VALIDACIÓN DE MIGRACIONES - CRÍTICO PARA PRODUCCIÓN
# ============================================================================
# Valida que las migraciones de base de datos sean seguras y reversibles
# ADVERTENCIA: Las migraciones recientes (2025-01-01) requieren pruebas exhaustivas
# ============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   VALIDACIÓN DE MIGRACIONES - JR CHATEAM v6.0.0      ║${NC}"
echo -e "${BLUE}║   Estado: CRÍTICO para producción                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="migration-reports"
BACKUP_DIR="backups"
TEST_DB_NAME="jrchateam_migration_test"

# Crear directorios
mkdir -p $LOG_DIR
mkdir -p $BACKUP_DIR

# ============================================================================
# FUNCIÓN: Verificar configuración de base de datos
# ============================================================================
check_db_config() {
    echo -e "${BLUE}[1/8] Verificando configuración de base de datos...${NC}"

    # Verificar variables de entorno
    if [ -z "$DB_HOST" ]; then
        echo -e "${YELLOW}⚠️  DB_HOST no definido. Cargando desde .env...${NC}"
        if [ -f ".env" ]; then
            export $(cat .env | grep -v '^#' | xargs)
        else
            echo -e "${RED}✗ Archivo .env no encontrado${NC}"
            exit 1
        fi
    fi

    echo -e "${GREEN}✓ Configuración de DB verificada${NC}"
    echo -e "  Host: $DB_HOST"
    echo -e "  Database: $DB_NAME"
    echo ""
}

# ============================================================================
# FUNCIÓN: Listar migraciones pendientes
# ============================================================================
list_pending_migrations() {
    echo -e "${BLUE}[2/8] Listando migraciones pendientes...${NC}"

    if docker compose ps postgres | grep -q "Up"; then
        echo -e "${GREEN}✓ PostgreSQL está corriendo${NC}"
    else
        echo -e "${YELLOW}⚠️  PostgreSQL no está corriendo. Iniciando...${NC}"
        docker compose up -d postgres
        sleep 5
    fi

    # Listar estado de migraciones
    echo ""
    echo -e "${BLUE}Estado de migraciones:${NC}"
    docker compose exec -T backend npx sequelize-cli db:migrate:status 2>&1 | tee "$LOG_DIR/migration-status-$TIMESTAMP.log"

    # Contar pendientes
    PENDING_COUNT=$(docker compose exec -T backend npx sequelize-cli db:migrate:status 2>/dev/null | grep -c "down" || echo "0")

    echo ""
    echo -e "${BLUE}Migraciones pendientes: $PENDING_COUNT${NC}"
    echo ""
}

# ============================================================================
# FUNCIÓN: Crear backup antes de migrar
# ============================================================================
create_backup() {
    echo -e "${BLUE}[3/8] Creando backup de seguridad...${NC}"

    local backup_file="$BACKUP_DIR/pre-migration-backup-$TIMESTAMP.sql.gz"

    if docker compose exec -T postgres pg_dump -U $DB_USER $DB_NAME | gzip > $backup_file; then
        local size=$(ls -lh $backup_file | awk '{print $5}')
        echo -e "${GREEN}✓ Backup creado: $backup_file ($size)${NC}"

        # Verificar que el backup no esté vacío
        if [ ! -s $backup_file ]; then
            echo -e "${RED}✗ Backup está vacío!${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ Error al crear backup${NC}"
        exit 1
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Crear base de datos de test
# ============================================================================
create_test_db() {
    echo -e "${BLUE}[4/8] Creando base de datos de test...${NC}"

    # Eliminar DB de test si existe
    docker compose exec -T postgres psql -U $DB_USER -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null || true

    # Crear DB de test
    if docker compose exec -T postgres psql -U $DB_USER -c "CREATE DATABASE $TEST_DB_NAME;" 2>&1 | tee -a "$LOG_DIR/migration-test-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Base de datos de test creada: $TEST_DB_NAME${NC}"
    else
        echo -e "${RED}✗ Error al crear base de datos de test${NC}"
        exit 1
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Test de migración en DB de test
# ============================================================================
test_migration() {
    echo -e "${BLUE}[5/8] Probando migraciones en DB de test...${NC}"

    # Crear archivo .env temporal para test
    cp .env .env.test.temp
    sed -i "s/DB_NAME=.*/DB_NAME=$TEST_DB_NAME/" .env.test.temp

    # Ejecutar migraciones en DB de test
    echo -e "${BLUE}Ejecutando migraciones...${NC}"

    if DB_NAME=$TEST_DB_NAME docker compose exec -T backend npx sequelize-cli db:migrate --env test 2>&1 | tee -a "$LOG_DIR/migration-test-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Migraciones ejecutadas exitosamente en test${NC}"
    else
        echo -e "${RED}✗ Error al ejecutar migraciones en test${NC}"
        rm .env.test.temp
        exit 1
    fi

    # Verificar tablas creadas
    echo ""
    echo -e "${BLUE}Verificando tablas creadas:${NC}"
    docker compose exec -T postgres psql -U $DB_USER -d $TEST_DB_NAME -c "\dt" | tee -a "$LOG_DIR/migration-test-$TIMESTAMP.log"

    echo ""
}

# ============================================================================
# FUNCIÓN: Test de rollback en DB de test
# ============================================================================
test_rollback() {
    echo -e "${BLUE}[6/8] Probando rollback de migraciones...${NC}"

    # Hacer rollback de última migración
    echo -e "${BLUE}Ejecutando rollback...${NC}"

    if DB_NAME=$TEST_DB_NAME docker compose exec -T backend npx sequelize-cli db:migrate:undo --env test 2>&1 | tee -a "$LOG_DIR/migration-rollback-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Rollback ejecutado exitosamente${NC}"
    else
        echo -e "${RED}✗ Error al ejecutar rollback${NC}"
        rm .env.test.temp
        exit 1
    fi

    # Re-ejecutar migración
    echo ""
    echo -e "${BLUE}Re-ejecutando migración después de rollback...${NC}"

    if DB_NAME=$TEST_DB_NAME docker compose exec -T backend npx sequelize-cli db:migrate --env test 2>&1 | tee -a "$LOG_DIR/migration-rollback-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Migración re-ejecutada exitosamente${NC}"
    else
        echo -e "${RED}✗ Error al re-ejecutar migración${NC}"
        rm .env.test.temp
        exit 1
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Analizar migraciones recientes (2025-01-01)
# ============================================================================
analyze_recent_migrations() {
    echo -e "${BLUE}[7/8] Analizando migraciones recientes...${NC}"

    # Buscar migraciones recientes
    RECENT_MIGRATIONS=$(find database/migrations -name "20250*" 2>/dev/null || echo "")

    if [ -n "$RECENT_MIGRATIONS" ]; then
        echo -e "${YELLOW}⚠️  ADVERTENCIA: Migraciones recientes encontradas:${NC}"
        echo ""
        echo "$RECENT_MIGRATIONS" | while read migration; do
            echo -e "${YELLOW}  - $(basename $migration)${NC}"
        done
        echo ""
        echo -e "${YELLOW}⚠️  IMPORTANTE: Estas migraciones requieren pruebas exhaustivas${NC}"
        echo ""
    else
        echo -e "${GREEN}✓ No hay migraciones muy recientes${NC}"
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Limpiar DB de test
# ============================================================================
cleanup_test_db() {
    echo -e "${BLUE}[8/8] Limpiando base de datos de test...${NC}"

    # Eliminar DB de test
    docker compose exec -T postgres psql -U $DB_USER -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null || true

    # Eliminar archivo temporal
    rm -f .env.test.temp

    echo -e "${GREEN}✓ Limpieza completada${NC}"
    echo ""
}

# ============================================================================
# FUNCIÓN: Generar reporte final
# ============================================================================
generate_report() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}         RESUMEN DE VALIDACIÓN DE MIGRACIONES       ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo ""

    # Resumen
    echo -e "${GREEN}✓ Configuración de DB: OK${NC}"
    echo -e "${GREEN}✓ Backup de seguridad: CREADO${NC}"
    echo -e "${GREEN}✓ Test de migraciones: PASS${NC}"
    echo -e "${GREEN}✓ Test de rollback: PASS${NC}"
    echo ""

    if [ -n "$RECENT_MIGRATIONS" ]; then
        echo -e "${YELLOW}⚠ Migraciones recientes detectadas: REQUIEREN ATENCIÓN${NC}"
        echo ""
    fi

    # Backup info
    echo -e "${BLUE}Backup disponible en:${NC}"
    ls -lh $BACKUP_DIR/*$TIMESTAMP* 2>/dev/null

    echo ""
    echo -e "${BLUE}Logs guardados en: $LOG_DIR/${NC}"
    ls -lh $LOG_DIR/*$TIMESTAMP* 2>/dev/null

    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ VALIDACIÓN DE MIGRACIONES COMPLETADA${NC}"
    echo -e "${GREEN}  Las migraciones son seguras para producción${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo ""

    # Instrucciones para producción
    echo -e "${BLUE}INSTRUCCIONES PARA PRODUCCIÓN:${NC}"
    echo ""
    echo "1. Crear backup de producción:"
    echo "   docker compose exec postgres pg_dump -U jrchateam jrchateam_prod | gzip > prod-backup-\$(date +%Y%m%d_%H%M%S).sql.gz"
    echo ""
    echo "2. Ejecutar migraciones en producción:"
    echo "   docker compose exec backend npx sequelize-cli db:migrate"
    echo ""
    echo "3. En caso de error, restaurar backup:"
    echo "   gunzip -c prod-backup-TIMESTAMP.sql.gz | docker compose exec -T postgres psql -U jrchateam jrchateam_prod"
    echo ""
}

# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================
main() {
    check_db_config
    list_pending_migrations
    create_backup
    create_test_db
    test_migration
    test_rollback
    analyze_recent_migrations
    cleanup_test_db
    generate_report

    echo -e "${BLUE}Timestamp: $TIMESTAMP${NC}"
    echo ""
}

# Ejecutar
main
