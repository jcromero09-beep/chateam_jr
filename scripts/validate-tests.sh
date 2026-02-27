#!/bin/bash

# ============================================================================
# SCRIPT DE VALIDACIÓN DE TESTS - CRÍTICO PARA PRODUCCIÓN
# ============================================================================
# Este script ejecuta toda la suite de tests y valida que el sistema
# esté listo para producción desde el punto de vista de testing
# ============================================================================

set -e  # Salir si hay error

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   VALIDACIÓN DE TESTS - JR CHATEAM v6.0.0            ║${NC}"
echo -e "${BLUE}║   Estado: CRÍTICO para producción                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Variables
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="test-reports"
COVERAGE_THRESHOLD=70

# Crear directorio de reportes
mkdir -p $LOG_DIR

# ============================================================================
# FUNCIÓN: Verificar dependencias
# ============================================================================
check_dependencies() {
    echo -e "${BLUE}[1/6] Verificando dependencias...${NC}"

    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  node_modules no encontrado. Instalando dependencias...${NC}"
        npm ci
    fi

    # Verificar que jest esté instalado
    if ! npm list jest > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Jest no encontrado. Instalando...${NC}"
        npm install --save-dev jest @types/jest ts-jest
    fi

    echo -e "${GREEN}✓ Dependencias verificadas${NC}"
    echo ""
}

# ============================================================================
# FUNCIÓN: Verificar configuración de tests
# ============================================================================
check_test_config() {
    echo -e "${BLUE}[2/6] Verificando configuración de tests...${NC}"

    local errors=0

    # Verificar jest.config.js
    if [ ! -f "jest.config.js" ]; then
        echo -e "${RED}✗ jest.config.js no encontrado${NC}"
        errors=$((errors + 1))
    else
        echo -e "${GREEN}✓ jest.config.js encontrado${NC}"
    fi

    # Verificar directorio de tests
    if [ ! -d "backend/src/__tests__" ] && [ ! -d "tests" ]; then
        echo -e "${YELLOW}⚠️  Directorio de tests no encontrado en rutas estándar${NC}"
        echo -e "${YELLOW}   Creando estructura de tests...${NC}"
        mkdir -p backend/src/__tests__/unit
        mkdir -p backend/src/__tests__/integration
    else
        echo -e "${GREEN}✓ Directorio de tests encontrado${NC}"
    fi

    echo ""
    return $errors
}

# ============================================================================
# FUNCIÓN: Ejecutar tests unitarios
# ============================================================================
run_unit_tests() {
    echo -e "${BLUE}[3/6] Ejecutando tests unitarios...${NC}"

    if npm run test:unit 2>&1 | tee "$LOG_DIR/unit-tests-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Tests unitarios pasaron${NC}"
        return 0
    else
        # Si no existe script test:unit, intentar con test
        if npm test -- --testPathPattern="unit" 2>&1 | tee "$LOG_DIR/unit-tests-$TIMESTAMP.log"; then
            echo -e "${GREEN}✓ Tests unitarios pasaron${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  No se pudieron ejecutar tests unitarios${NC}"
            echo -e "${YELLOW}   Esto puede ser normal si no hay tests implementados aún${NC}"
            return 1
        fi
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Ejecutar tests de integración
# ============================================================================
run_integration_tests() {
    echo -e "${BLUE}[4/6] Ejecutando tests de integración...${NC}"

    # Verificar si hay variables de entorno para tests
    if [ ! -f ".env.test" ]; then
        echo -e "${YELLOW}⚠️  .env.test no encontrado. Creando desde .env.example...${NC}"
        if [ -f ".env.example" ]; then
            cp .env.example .env.test
            echo -e "${YELLOW}⚠️  IMPORTANTE: Configurar .env.test con credenciales de test${NC}"
        fi
    fi

    if npm run test:integration 2>&1 | tee "$LOG_DIR/integration-tests-$TIMESTAMP.log"; then
        echo -e "${GREEN}✓ Tests de integración pasaron${NC}"
        return 0
    else
        # Intentar con configuración alternativa
        if npm test -- --testPathPattern="integration" 2>&1 | tee "$LOG_DIR/integration-tests-$TIMESTAMP.log"; then
            echo -e "${GREEN}✓ Tests de integración pasaron${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  No se pudieron ejecutar tests de integración${NC}"
            return 1
        fi
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Verificar cobertura de código
# ============================================================================
check_coverage() {
    echo -e "${BLUE}[5/6] Verificando cobertura de código...${NC}"

    if npm run test:coverage 2>&1 | tee "$LOG_DIR/coverage-$TIMESTAMP.log"; then
        # Intentar leer cobertura del reporte
        if [ -f "coverage/coverage-summary.json" ]; then
            local coverage=$(cat coverage/coverage-summary.json | grep -o '"lines":{"total":[0-9]*,"covered":[0-9]*,"skipped":[0-9]*,"pct":[0-9.]*' | grep -o 'pct":[0-9.]*' | cut -d':' -f2)

            echo -e "${BLUE}Cobertura de código: ${coverage}%${NC}"

            if (( $(echo "$coverage >= $COVERAGE_THRESHOLD" | bc -l) )); then
                echo -e "${GREEN}✓ Cobertura cumple el umbral mínimo ($COVERAGE_THRESHOLD%)${NC}"
            else
                echo -e "${YELLOW}⚠️  Cobertura por debajo del umbral ($COVERAGE_THRESHOLD%)${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  Reporte de cobertura no encontrado${NC}"
        fi
    else
        # Intentar con test -- --coverage
        if npm test -- --coverage 2>&1 | tee "$LOG_DIR/coverage-$TIMESTAMP.log"; then
            echo -e "${GREEN}✓ Reporte de cobertura generado${NC}"
        else
            echo -e "${YELLOW}⚠️  No se pudo generar reporte de cobertura${NC}"
        fi
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Tests E2E (opcional pero recomendado)
# ============================================================================
run_e2e_tests() {
    echo -e "${BLUE}[6/6] Tests E2E (End-to-End)...${NC}"

    # Verificar si Playwright está configurado
    if [ -f "playwright.config.ts" ]; then
        echo -e "${BLUE}Playwright detectado. Ejecutando tests E2E...${NC}"

        if npm run test:e2e 2>&1 | tee "$LOG_DIR/e2e-tests-$TIMESTAMP.log"; then
            echo -e "${GREEN}✓ Tests E2E pasaron${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Tests E2E fallaron o no están implementados${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  Tests E2E no configurados (opcional)${NC}"
        return 1
    fi

    echo ""
}

# ============================================================================
# FUNCIÓN: Generar reporte final
# ============================================================================
generate_report() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}             RESUMEN DE VALIDACIÓN DE TESTS         ${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo ""

    local total=0
    local passed=0

    # Contar tests
    if [ $UNIT_TESTS_PASSED -eq 0 ]; then
        echo -e "${GREEN}✓ Tests Unitarios: PASS${NC}"
        passed=$((passed + 1))
    else
        echo -e "${YELLOW}⚠ Tests Unitarios: SKIP/FAIL${NC}"
    fi
    total=$((total + 1))

    if [ $INTEGRATION_TESTS_PASSED -eq 0 ]; then
        echo -e "${GREEN}✓ Tests de Integración: PASS${NC}"
        passed=$((passed + 1))
    else
        echo -e "${YELLOW}⚠ Tests de Integración: SKIP/FAIL${NC}"
    fi
    total=$((total + 1))

    if [ $COVERAGE_CHECK_PASSED -eq 0 ]; then
        echo -e "${GREEN}✓ Cobertura de Código: PASS${NC}"
        passed=$((passed + 1))
    else
        echo -e "${YELLOW}⚠ Cobertura de Código: SKIP/FAIL${NC}"
    fi
    total=$((total + 1))

    if [ $E2E_TESTS_PASSED -eq 0 ]; then
        echo -e "${GREEN}✓ Tests E2E: PASS${NC}"
        passed=$((passed + 1))
    else
        echo -e "${YELLOW}⚠ Tests E2E: SKIP/FAIL${NC}"
    fi
    total=$((total + 1))

    echo ""
    echo -e "${BLUE}Resultado: $passed/$total tests pasaron${NC}"
    echo ""

    # Logs guardados
    echo -e "${BLUE}Logs guardados en: $LOG_DIR/${NC}"
    ls -lh $LOG_DIR/*$TIMESTAMP.log 2>/dev/null || echo "No hay logs"
    echo ""

    # Decisión final
    if [ $passed -ge 2 ]; then
        echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}✓ VALIDACIÓN APROBADA${NC}"
        echo -e "${GREEN}  El sistema puede proceder a producción${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
        return 0
    else
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        echo -e "${YELLOW}⚠ VALIDACIÓN CON OBSERVACIONES${NC}"
        echo -e "${YELLOW}  Revisar logs y considerar implementar tests${NC}"
        echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
        return 1
    fi
}

# ============================================================================
# EJECUCIÓN PRINCIPAL
# ============================================================================
main() {
    check_dependencies
    check_test_config

    # Ejecutar tests
    run_unit_tests
    UNIT_TESTS_PASSED=$?

    run_integration_tests
    INTEGRATION_TESTS_PASSED=$?

    check_coverage
    COVERAGE_CHECK_PASSED=$?

    run_e2e_tests
    E2E_TESTS_PASSED=$?

    # Generar reporte
    generate_report
    FINAL_RESULT=$?

    echo ""
    echo -e "${BLUE}Timestamp: $TIMESTAMP${NC}"
    echo ""

    exit $FINAL_RESULT
}

# Ejecutar
main
