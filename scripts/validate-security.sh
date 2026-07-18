#!/bin/bash

# ============================================================================
# SCRIPT DE VALIDACIÓN DE SEGURIDAD - CRÍTICO PARA PRODUCCIÓN
# ============================================================================
# Verifica vulnerabilidades, configuración de seguridad y cumplimiento
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
echo -e "${BLUE}║   VALIDACIÓN DE SEGURIDAD - JR CHATEAM v6.0.0        ║${NC}"
echo -e "${BLUE}║   Estado: CRÍTICO para producción                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="security-reports"
mkdir -p $LOG_DIR

TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# ============================================================================
# FUNCIÓN: Incrementar contadores
# ============================================================================
check_pass() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
}

check_fail() {
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
}

check_warn() {
    WARNINGS=$((WARNINGS + 1))
}

# ============================================================================
# [1/10] NPM AUDIT - Vulnerabilidades en Dependencias
# ============================================================================
echo -e "${BLUE}[1/10] Verificando vulnerabilidades en dependencias...${NC}"

if npm audit --json > "$LOG_DIR/npm-audit-$TIMESTAMP.json" 2>&1; then
    VULN_COUNT=$(cat "$LOG_DIR/npm-audit-$TIMESTAMP.json" | jq '.metadata.vulnerabilities.total' 2>/dev/null || echo "0")
    CRITICAL=$(cat "$LOG_DIR/npm-audit-$TIMESTAMP.json" | jq '.metadata.vulnerabilities.critical' 2>/dev/null || echo "0")
    HIGH=$(cat "$LOG_DIR/npm-audit-$TIMESTAMP.json" | jq '.metadata.vulnerabilities.high' 2>/dev/null || echo "0")

    if [ "$VULN_COUNT" = "0" ]; then
        echo -e "${GREEN}✓ Sin vulnerabilidades detectadas${NC}"
        check_pass
    elif [ "$CRITICAL" = "0" ] && [ "$HIGH" = "0" ]; then
        echo -e "${YELLOW}⚠ $VULN_COUNT vulnerabilidades (baja/media prioridad)${NC}"
        check_warn
        check_pass
    else
        echo -e "${RED}✗ CRÍTICO: $CRITICAL vulnerabilidades críticas, $HIGH altas${NC}"
        echo -e "${YELLOW}   Ejecutar: npm audit fix${NC}"
        check_fail
    fi
else
    echo -e "${YELLOW}⚠ npm audit no disponible o sin package-lock.json${NC}"
    check_warn
fi

# Generar reporte legible
npm audit > "$LOG_DIR/npm-audit-report-$TIMESTAMP.txt" 2>&1 || true

echo ""

# ============================================================================
# [2/10] Verificar Variables de Entorno Sensibles
# ============================================================================
echo -e "${BLUE}[2/10] Verificando variables de entorno...${NC}"

MISSING_VARS=()

# Variables críticas que deben estar configuradas
REQUIRED_VARS=(
    "JWT_SECRET"
    "JWT_REFRESH_SECRET"
    "DB_PASS"
    "REDIS_URI"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] && ! grep -q "^$var=" .env 2>/dev/null; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ Variables de entorno críticas configuradas${NC}"
    check_pass
else
    echo -e "${RED}✗ Variables faltantes: ${MISSING_VARS[*]}${NC}"
    check_fail
fi

# Verificar longitud de secrets
if [ -f ".env" ]; then
    JWT_LEN=$(grep "^JWT_SECRET=" .env | cut -d'=' -f2 | wc -c)
    if [ "$JWT_LEN" -lt 32 ]; then
        echo -e "${YELLOW}⚠ JWT_SECRET debería tener al menos 32 caracteres${NC}"
        check_warn
    fi
fi

echo ""

# ============================================================================
# [3/10] Verificar Archivos Sensibles No Commiteados
# ============================================================================
echo -e "${BLUE}[3/10] Verificando archivos sensibles...${NC}"

SENSITIVE_FILES=(
    ".env"
    ".env.production"
    "config/database.json"
    "*.pem"
    "*.key"
    "id_rsa*"
)

FOUND_SENSITIVE=0

for pattern in "${SENSITIVE_FILES[@]}"; do
    if git ls-files "$pattern" 2>/dev/null | grep -q .; then
        echo -e "${RED}✗ Archivo sensible en git: $pattern${NC}"
        FOUND_SENSITIVE=$((FOUND_SENSITIVE + 1))
        check_fail
    fi
done

if [ $FOUND_SENSITIVE -eq 0 ]; then
    echo -e "${GREEN}✓ Sin archivos sensibles en repositorio${NC}"
    check_pass
fi

# Verificar .gitignore
if grep -q "\.env" .gitignore 2>/dev/null; then
    echo -e "${GREEN}✓ .env está en .gitignore${NC}"
else
    echo -e "${YELLOW}⚠ .env no está en .gitignore${NC}"
    check_warn
fi

echo ""

# ============================================================================
# [4/10] Verificar Configuración de SSL/TLS
# ============================================================================
echo -e "${BLUE}[4/10] Verificando configuración SSL/TLS...${NC}"

# Verificar certificados en nginx
if [ -f "nginx/nginx.conf" ]; then
    if grep -q "ssl_certificate" nginx/nginx.conf; then
        echo -e "${GREEN}✓ SSL configurado en Nginx${NC}"
        check_pass

        # Verificar protocols
        if grep -q "ssl_protocols TLSv1.2 TLSv1.3" nginx/nginx.conf; then
            echo -e "${GREEN}✓ Protocolos TLS seguros configurados${NC}"
        else
            echo -e "${YELLOW}⚠ Verificar protocolos TLS en nginx.conf${NC}"
            check_warn
        fi
    else
        echo -e "${YELLOW}⚠ SSL no configurado en Nginx${NC}"
        check_warn
    fi
else
    echo -e "${YELLOW}⚠ nginx.conf no encontrado${NC}"
    check_warn
fi

echo ""

# ============================================================================
# [5/10] Verificar Headers de Seguridad
# ============================================================================
echo -e "${BLUE}[5/10] Verificando headers de seguridad en Nginx...${NC}"

SECURITY_HEADERS=(
    "Strict-Transport-Security"
    "X-Frame-Options"
    "X-Content-Type-Options"
    "X-XSS-Protection"
)

MISSING_HEADERS=0

if [ -f "nginx/nginx.conf" ]; then
    for header in "${SECURITY_HEADERS[@]}"; do
        if ! grep -q "$header" nginx/nginx.conf; then
            echo -e "${YELLOW}⚠ Header faltante: $header${NC}"
            MISSING_HEADERS=$((MISSING_HEADERS + 1))
            check_warn
        fi
    done

    if [ $MISSING_HEADERS -eq 0 ]; then
        echo -e "${GREEN}✓ Headers de seguridad configurados${NC}"
        check_pass
    else
        echo -e "${YELLOW}⚠ $MISSING_HEADERS headers de seguridad faltantes${NC}"
    fi
else
    echo -e "${YELLOW}⚠ nginx.conf no encontrado${NC}"
    check_warn
fi

echo ""

# ============================================================================
# [6/10] Verificar Configuración de CORS
# ============================================================================
echo -e "${BLUE}[6/10] Verificando configuración de CORS...${NC}"

# Buscar configuración de CORS en código
if grep -r "cors" app.ts server.ts 2>/dev/null | grep -q "origin"; then
    echo -e "${GREEN}✓ CORS configurado en aplicación${NC}"
    check_pass
else
    echo -e "${YELLOW}⚠ Verificar configuración de CORS${NC}"
    check_warn
fi

echo ""

# ============================================================================
# [7/10] Verificar Rate Limiting
# ============================================================================
echo -e "${BLUE}[7/10] Verificando rate limiting...${NC}"

if [ -f "middleware/rateLimiter.ts" ]; then
    echo -e "${GREEN}✓ Middleware de rate limiting existe${NC}"

    # Verificar implementación en app.ts
    if grep -q "rateLimiter\|rateLimit" app.ts server.ts 2>/dev/null; then
        echo -e "${GREEN}✓ Rate limiting implementado${NC}"
        check_pass
    else
        echo -e "${YELLOW}⚠ Rate limiting no aplicado en app.ts${NC}"
        check_warn
    fi
else
    echo -e "${YELLOW}⚠ Middleware de rate limiting no encontrado${NC}"
    check_warn
fi

echo ""

# ============================================================================
# [8/10] Verificar Permisos de Archivos
# ============================================================================
echo -e "${BLUE}[8/10] Verificando permisos de archivos...${NC}"

# Verificar archivos con permisos 777 (peligrosos)
UNSAFE_PERMS=$(find . -type f -perm 0777 2>/dev/null | wc -l)

if [ $UNSAFE_PERMS -eq 0 ]; then
    echo -e "${GREEN}✓ Sin archivos con permisos 777${NC}"
    check_pass
else
    echo -e "${YELLOW}⚠ $UNSAFE_PERMS archivos con permisos 777 (peligroso)${NC}"
    find . -type f -perm 0777 | head -5
    check_warn
fi

# Verificar que .env no sea world-readable
if [ -f ".env" ]; then
    ENV_PERMS=$(stat -c %a .env 2>/dev/null || stat -f %OLp .env 2>/dev/null || echo "000")
    if [ "$ENV_PERMS" = "600" ] || [ "$ENV_PERMS" = "640" ]; then
        echo -e "${GREEN}✓ .env tiene permisos seguros ($ENV_PERMS)${NC}"
    else
        echo -e "${YELLOW}⚠ .env tiene permisos: $ENV_PERMS (recomendado: 600)${NC}"
        check_warn
    fi
fi

echo ""

# ============================================================================
# [9/10] Verificar Secrets Hardcodeados
# ============================================================================
echo -e "${BLUE}[9/10] Buscando secrets hardcodeados en código...${NC}"

PATTERNS=(
    "password\s*=\s*['\"][^'\"]+['\"]"
    "api[_-]?key\s*=\s*['\"][^'\"]+['\"]"
    "secret\s*=\s*['\"][^'\"]+['\"]"
    "token\s*=\s*['\"][^'\"]+['\"]"
)

SECRETS_FOUND=0

for pattern in "${PATTERNS[@]}"; do
    MATCHES=$(grep -rE "$pattern" --include="*.ts" --include="*.js" controllers/ services/ 2>/dev/null | grep -v "process.env" | wc -l || echo 0)
    if [ "$MATCHES" -gt 0 ]; then
        echo -e "${YELLOW}⚠ Posibles secrets hardcodeados: $MATCHES matches${NC}"
        SECRETS_FOUND=$((SECRETS_FOUND + MATCHES))
        check_warn
    fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
    echo -e "${GREEN}✓ Sin secrets hardcodeados evidentes${NC}"
    check_pass
else
    echo -e "${YELLOW}⚠ Total de posibles secrets hardcodeados: $SECRETS_FOUND${NC}"
    echo -e "${YELLOW}   Revisar manualmente y mover a variables de entorno${NC}"
fi

echo ""

# ============================================================================
# [10/10] Verificar Dockerfile Security
# ============================================================================
echo -e "${BLUE}[10/10] Verificando seguridad de Dockerfile...${NC}"

if [ -f "Dockerfile" ]; then
    # Verificar que no corre como root
    if grep -q "USER" Dockerfile; then
        echo -e "${GREEN}✓ Dockerfile usa usuario no-root${NC}"
        check_pass
    else
        echo -e "${YELLOW}⚠ Dockerfile no especifica USER (correrá como root)${NC}"
        check_warn
    fi

    # Verificar que no copia .env
    if grep -q "COPY.*\.env" Dockerfile; then
        echo -e "${RED}✗ Dockerfile copia .env (peligroso)${NC}"
        check_fail
    else
        echo -e "${GREEN}✓ Dockerfile no copia .env${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Dockerfile no encontrado${NC}"
    check_warn
fi

echo ""

# ============================================================================
# GENERAR REPORTE FINAL
# ============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           RESUMEN DE VALIDACIÓN DE SEGURIDAD        ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

echo -e "Total de verificaciones: $TOTAL_CHECKS"
echo -e "${GREEN}Verificaciones exitosas: $PASSED_CHECKS${NC}"
echo -e "${RED}Verificaciones fallidas: $FAILED_CHECKS${NC}"
echo -e "${YELLOW}Advertencias: $WARNINGS${NC}"
echo ""

# Calcular score
SCORE=0
if [ $TOTAL_CHECKS -gt 0 ]; then
    SCORE=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
fi

echo -e "${BLUE}Score de Seguridad: $SCORE/100${NC}"
echo ""

# Guardar reporte JSON
cat > "$LOG_DIR/security-report-$TIMESTAMP.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "totalChecks": $TOTAL_CHECKS,
  "passed": $PASSED_CHECKS,
  "failed": $FAILED_CHECKS,
  "warnings": $WARNINGS,
  "score": $SCORE,
  "status": "$([ $FAILED_CHECKS -eq 0 ] && echo 'PASS' || echo 'FAIL')"
}
EOF

# Decisión final
if [ $FAILED_CHECKS -eq 0 ]; then
    if [ $WARNINGS -gt 5 ]; then
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}⚠ APROBADO CON ADVERTENCIAS${NC}"
        echo -e "${YELLOW}  El sistema puede proceder pero debe atender ${WARNINGS} warnings${NC}"
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        exit 0
    else
        echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}✓ SEGURIDAD APROBADA${NC}"
        echo -e "${GREEN}  El sistema cumple con los estándares de seguridad${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
        exit 0
    fi
else
    echo -e "${RED}════════════════════════════════════════════════════${NC}"
    echo -e "${RED}✗ SEGURIDAD NO APROBADA${NC}"
    echo -e "${RED}  Se detectaron $FAILED_CHECKS problemas críticos${NC}"
    echo -e "${RED}  DEBE corregir antes de desplegar a producción${NC}"
    echo -e "${RED}════════════════════════════════════════════════════${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Reportes guardados en: $LOG_DIR/${NC}"
ls -lh $LOG_DIR/*$TIMESTAMP* 2>/dev/null
echo ""
