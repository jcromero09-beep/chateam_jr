#!/bin/bash

# ============================================================================
# MASTER PRE-DEPLOY CHECKLIST - JR CHATEAM v6.0.0
# ============================================================================
# Script maestro que ejecuta TODAS las validaciones críticas
# antes de desplegar a producción
# ============================================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Banner
clear
echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        🚀 MASTER PRE-DEPLOY VALIDATION CHECKLIST 🚀              ║
║                                                                  ║
║                   JR CHATEAM v6.0.0                             ║
║                                                                  ║
║    Este script ejecuta TODAS las validaciones críticas          ║
║    necesarias antes de desplegar a producción                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

# Variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MASTER_LOG_DIR="pre-deploy-validation-$TIMESTAMP"
mkdir -p "$MASTER_LOG_DIR"

TOTAL_SUITES=6
PASSED_SUITES=0
FAILED_SUITES=0
WARNINGS=0

# ============================================================================
# FUNCIONES DE REPORTE
# ============================================================================

log_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

log_success() {
    PASSED_SUITES=$((PASSED_SUITES + 1))
    echo -e "${GREEN}✓ $1${NC}"
}

log_fail() {
    FAILED_SUITES=$((FAILED_SUITES + 1))
    echo -e "${RED}✗ $1${NC}"
}

log_warning() {
    WARNINGS=$((WARNINGS + 1))
    echo -e "${YELLOW}⚠ $1${NC}"
}

# ============================================================================
# VALIDACIÓN 0: Pre-requisitos
# ============================================================================
log_section "PRE-REQUISITOS: Verificando herramientas"

check_tool() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $1 instalado"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $1 no instalado (opcional)"
        return 1
    fi
}

check_tool "docker"
check_tool "docker-compose" || check_tool "docker compose"
check_tool "npm"
check_tool "node"
check_tool "curl"
check_tool "jq"

echo ""
echo -e "${BLUE}Directorio de trabajo:${NC} $(pwd)"
echo -e "${BLUE}Timestamp:${NC} $TIMESTAMP"
echo -e "${BLUE}Logs se guardarán en:${NC} $MASTER_LOG_DIR/"

sleep 2

# ============================================================================
# SUITE 1: VALIDACIÓN DE ESTRUCTURA
# ============================================================================
log_section "SUITE 1/6: VALIDACIÓN DE ESTRUCTURA DE MÓDULOS"

echo "Ejecutando: node scripts/validate-modules.js"
if node scripts/validate-modules.js 2>&1 | tee "$MASTER_LOG_DIR/01-modules.log"; then
    log_success "Suite 1: Estructura de módulos - APROBADA"
else
    log_fail "Suite 1: Estructura de módulos - FALLIDA"
fi

echo ""
sleep 1

# ============================================================================
# SUITE 2: VALIDACIÓN DE TESTS
# ============================================================================
log_section "SUITE 2/6: VALIDACIÓN DE TESTS"

# Hacer ejecutable el script
chmod +x scripts/validate-tests.sh 2>/dev/null || true

echo "Ejecutando: bash scripts/validate-tests.sh"
if bash scripts/validate-tests.sh 2>&1 | tee "$MASTER_LOG_DIR/02-tests.log"; then
    log_success "Suite 2: Tests - APROBADA"
else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Suite 2: Tests - APROBADA CON ADVERTENCIAS"
        log_warning "Revisar log: $MASTER_LOG_DIR/02-tests.log"
    else
        log_fail "Suite 2: Tests - FALLIDA"
    fi
fi

echo ""
sleep 1

# ============================================================================
# SUITE 3: VALIDACIÓN DE MIGRACIONES
# ============================================================================
log_section "SUITE 3/6: VALIDACIÓN DE MIGRACIONES DE BASE DE DATOS"

chmod +x scripts/validate-migrations.sh 2>/dev/null || true

echo "Ejecutando: bash scripts/validate-migrations.sh"
if bash scripts/validate-migrations.sh 2>&1 | tee "$MASTER_LOG_DIR/03-migrations.log"; then
    log_success "Suite 3: Migraciones - APROBADA"
else
    log_fail "Suite 3: Migraciones - FALLIDA"
fi

echo ""
sleep 1

# ============================================================================
# SUITE 4: VALIDACIÓN DE SEGURIDAD
# ============================================================================
log_section "SUITE 4/6: VALIDACIÓN DE SEGURIDAD"

chmod +x scripts/validate-security.sh 2>/dev/null || true

echo "Ejecutando: bash scripts/validate-security.sh"
if bash scripts/validate-security.sh 2>&1 | tee "$MASTER_LOG_DIR/04-security.log"; then
    log_success "Suite 4: Seguridad - APROBADA"
else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Suite 4: Seguridad - APROBADA CON ADVERTENCIAS"
        log_warning "Revisar log: $MASTER_LOG_DIR/04-security.log"
    else
        log_fail "Suite 4: Seguridad - FALLIDA"
    fi
fi

echo ""
sleep 1

# ============================================================================
# SUITE 5: VALIDACIÓN FUNCIONAL
# ============================================================================
log_section "SUITE 5/6: PRUEBAS FUNCIONALES CRÍTICAS"

chmod +x scripts/validate-critical-flows.sh 2>/dev/null || true

echo "Ejecutando: bash scripts/validate-critical-flows.sh"
if bash scripts/validate-critical-flows.sh 2>&1 | tee "$MASTER_LOG_DIR/05-functional.log"; then
    log_success "Suite 5: Pruebas Funcionales - APROBADA"
else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Suite 5: Pruebas Funcionales - APROBADA CON OBSERVACIONES"
        log_warning "Revisar log: $MASTER_LOG_DIR/05-functional.log"
    else
        log_fail "Suite 5: Pruebas Funcionales - FALLIDA"
    fi
fi

echo ""
sleep 1

# ============================================================================
# SUITE 6: VALIDACIÓN DE INFRAESTRUCTURA
# ============================================================================
log_section "SUITE 6/6: VALIDACIÓN DE INFRAESTRUCTURA"

echo "Ejecutando: node scripts/validate-infrastructure.js"
if node scripts/validate-infrastructure.js 2>&1 | tee "$MASTER_LOG_DIR/06-infrastructure.log"; then
    log_success "Suite 6: Infraestructura - APROBADA"
else
    log_fail "Suite 6: Infraestructura - FALLIDA"
fi

echo ""
sleep 1

# ============================================================================
# REPORTE FINAL
# ============================================================================
echo ""
echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════════╗
║                     REPORTE FINAL DE VALIDACIÓN                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

echo -e "${BOLD}RESUMEN EJECUTIVO:${NC}"
echo ""
echo -e "  Total de Suites Ejecutadas: ${BOLD}$TOTAL_SUITES${NC}"
echo -e "  ${GREEN}Suites Aprobadas: $PASSED_SUITES${NC}"
echo -e "  ${RED}Suites Fallidas: $FAILED_SUITES${NC}"
echo -e "  ${YELLOW}Advertencias: $WARNINGS${NC}"
echo ""

# Calcular porcentaje
SUCCESS_RATE=0
if [ $TOTAL_SUITES -gt 0 ]; then
    SUCCESS_RATE=$(( (PASSED_SUITES * 100) / TOTAL_SUITES ))
fi

echo -e "${BOLD}Tasa de Éxito: $SUCCESS_RATE%${NC}"
echo ""

# Guardar reporte JSON
cat > "$MASTER_LOG_DIR/master-report.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "version": "6.0.0",
  "totalSuites": $TOTAL_SUITES,
  "passedSuites": $PASSED_SUITES,
  "failedSuites": $FAILED_SUITES,
  "warnings": $WARNINGS,
  "successRate": "$SUCCESS_RATE%",
  "status": "$([ $FAILED_SUITES -eq 0 ] && echo 'APPROVED' || echo 'REJECTED')",
  "logDirectory": "$MASTER_LOG_DIR"
}
EOF

# ============================================================================
# DECISIÓN FINAL
# ============================================================================
echo -e "${BOLD}DECISIÓN FINAL:${NC}"
echo ""

if [ $FAILED_SUITES -eq 0 ]; then
    if [ $WARNINGS -le 5 ]; then
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}║  ✓✓✓ SISTEMA APROBADO PARA PRODUCCIÓN ✓✓✓                ║${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}║  Todas las validaciones críticas han pasado exitosamente ║${NC}"
        echo -e "${GREEN}║  El sistema está listo para desplegar a producción       ║${NC}"
        echo -e "${GREEN}║                                                           ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${BLUE}Próximos pasos:${NC}"
        echo "  1. Revisar PRE_DEPLOYMENT_CHECKLIST.md"
        echo "  2. Ejecutar despliegue según DEPLOYMENT_RUNBOOK.md"
        echo "  3. Ejecutar smoke tests post-deploy"
        echo ""
        EXIT_STATUS=0
    else
        echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║                                                           ║${NC}"
        echo -e "${YELLOW}║  ⚠ APROBADO CON OBSERVACIONES ⚠                          ║${NC}"
        echo -e "${YELLOW}║                                                           ║${NC}"
        echo -e "${YELLOW}║  El sistema puede desplegarse pero hay $WARNINGS advertencias    ║${NC}"
        echo -e "${YELLOW}║  Se recomienda revisar antes de proceder                 ║${NC}"
        echo -e "${YELLOW}║                                                           ║${NC}"
        echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${BLUE}Advertencias encontradas:${NC}"
        echo "  - Revisar logs en: $MASTER_LOG_DIR/"
        echo "  - Considerar resolver advertencias antes de deploy"
        echo ""
        EXIT_STATUS=0
    fi
elif [ $FAILED_SUITES -le 1 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                           ║${NC}"
    echo -e "${YELLOW}║  ⚠ APROBADO CONDICIONAL ⚠                                 ║${NC}"
    echo -e "${YELLOW}║                                                           ║${NC}"
    echo -e "${YELLOW}║  1 suite falló (no crítica)                              ║${NC}"
    echo -e "${YELLOW}║  Revisar y corregir antes de producción                  ║${NC}"
    echo -e "${YELLOW}║                                                           ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    EXIT_STATUS=0
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                           ║${NC}"
    echo -e "${RED}║  ✗✗✗ SISTEMA NO APROBADO PARA PRODUCCIÓN ✗✗✗             ║${NC}"
    echo -e "${RED}║                                                           ║${NC}"
    echo -e "${RED}║  $FAILED_SUITES suites críticas fallaron                            ║${NC}"
    echo -e "${RED}║  DEBE corregir los problemas antes de desplegar          ║${NC}"
    echo -e "${RED}║                                                           ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}${BOLD}BLOQUEO DE DESPLIEGUE${NC}"
    echo ""
    echo "Problemas críticos detectados:"
    echo "  - Revisar logs en: $MASTER_LOG_DIR/"
    echo "  - Corregir todos los fallos críticos"
    echo "  - Re-ejecutar este script"
    echo ""
    EXIT_STATUS=1
fi

# ============================================================================
# INFORMACIÓN ADICIONAL
# ============================================================================
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}INFORMACIÓN DE REPORTES:${NC}"
echo ""
echo "Todos los logs han sido guardados en:"
echo "  📁 $MASTER_LOG_DIR/"
echo ""
echo "Contenido:"
ls -lh "$MASTER_LOG_DIR/" | tail -n +2
echo ""

echo -e "${BLUE}Reporte maestro:${NC}"
echo "  📄 $MASTER_LOG_DIR/master-report.json"
echo ""

cat "$MASTER_LOG_DIR/master-report.json" | jq '.' 2>/dev/null || cat "$MASTER_LOG_DIR/master-report.json"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Timestamp de Validación:${NC} $TIMESTAMP"
echo -e "${BOLD}Fecha y Hora:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================================================
# SALIR CON CÓDIGO APROPIADO
# ============================================================================
exit $EXIT_STATUS
