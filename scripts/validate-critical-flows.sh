#!/bin/bash

# ============================================================================
# SCRIPT DE PRUEBAS FUNCIONALES CRÍTICAS - PRE-PRODUCCIÓN
# ============================================================================
# Valida que los flujos críticos del negocio funcionen correctamente
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
echo -e "${BLUE}║   PRUEBAS FUNCIONALES CRÍTICAS - JR CHATEAM v6.0.0   ║${NC}"
echo -e "${BLUE}║   Validación de flujos de negocio                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Variables
API_URL="${API_URL:-http://localhost:3000/api}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3001}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="functional-tests"
mkdir -p $LOG_DIR

TOKEN=""
USER_ID=""
COMPANY_ID=""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# ============================================================================
# FUNCIONES AUXILIARES
# ============================================================================

test_pass() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo -e "${GREEN}✓ $1${NC}"
}

test_fail() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    FAILED_TESTS=$((FAILED_TESTS + 1))
    echo -e "${RED}✗ $1${NC}"
}

# ============================================================================
# [1/12] HEALTH CHECK - Verificar que la API está corriendo
# ============================================================================
echo -e "${BLUE}[1/12] Health Check - Verificando API...${NC}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    test_pass "API está respondiendo (HTTP 200)"
else
    test_fail "API no responde correctamente (HTTP $HTTP_CODE)"
    echo -e "${RED}ERROR: La API no está accesible. Abortando tests.${NC}"
    exit 1
fi

echo ""

# ============================================================================
# [2/12] FRONTEND - Verificar que el frontend está corriendo
# ============================================================================
echo -e "${BLUE}[2/12] Frontend Check - Verificando aplicación web...${NC}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    test_pass "Frontend está respondiendo (HTTP 200)"
else
    test_fail "Frontend no responde correctamente (HTTP $HTTP_CODE)"
fi

echo ""

# ============================================================================
# [3/12] AUTENTICACIÓN - Login de usuario
# ============================================================================
echo -e "${BLUE}[3/12] Test de Autenticación - Login...${NC}"

# Credenciales de test (ajustar según tu configuración)
LOGIN_EMAIL="${TEST_USER_EMAIL:-admin@jrchateam.com}"
LOGIN_PASSWORD="${TEST_USER_PASSWORD:-admin123}"

echo "Intentando login con: $LOGIN_EMAIL"

LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$LOGIN_EMAIL\",\"password\":\"$LOGIN_PASSWORD\"}" \
    2>&1 | tee "$LOG_DIR/login-response-$TIMESTAMP.json")

# Extraer token (asumiendo que viene en campo "token")
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token' 2>/dev/null || echo "")

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    test_pass "Login exitoso - Token obtenido"
    USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id' 2>/dev/null || echo "")
    COMPANY_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.companyId' 2>/dev/null || echo "")
    echo "  User ID: $USER_ID"
    echo "  Company ID: $COMPANY_ID"
else
    test_fail "Login falló - No se pudo obtener token"
    echo -e "${YELLOW}⚠ ADVERTENCIA: Tests subsiguientes que requieren autenticación fallarán${NC}"
    echo ""
    echo "Respuesta del servidor:"
    echo "$LOGIN_RESPONSE"
fi

echo ""

# ============================================================================
# [4/12] VERIFICAR PERFIL DE USUARIO
# ============================================================================
echo -e "${BLUE}[4/12] Test de Perfil de Usuario...${NC}"

if [ -n "$TOKEN" ]; then
    PROFILE_RESPONSE=$(curl -s -X GET "$API_URL/users/me" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1)

    USER_EMAIL=$(echo "$PROFILE_RESPONSE" | jq -r '.email' 2>/dev/null || echo "")

    if [ -n "$USER_EMAIL" ] && [ "$USER_EMAIL" != "null" ]; then
        test_pass "Perfil de usuario obtenido correctamente"
        echo "  Email: $USER_EMAIL"
    else
        test_fail "No se pudo obtener perfil de usuario"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [5/12] LISTAR TICKETS
# ============================================================================
echo -e "${BLUE}[5/12] Test de Listado de Tickets...${NC}"

if [ -n "$TOKEN" ]; then
    TICKETS_RESPONSE=$(curl -s -X GET "$API_URL/tickets" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/tickets-list-$TIMESTAMP.json")

    HAS_TICKETS=$(echo "$TICKETS_RESPONSE" | jq 'has("tickets")' 2>/dev/null || echo "false")

    if [ "$HAS_TICKETS" = "true" ]; then
        TICKET_COUNT=$(echo "$TICKETS_RESPONSE" | jq '.count' 2>/dev/null || echo "0")
        test_pass "Listado de tickets exitoso ($TICKET_COUNT tickets)"
    else
        test_fail "Error al listar tickets"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [6/12] LISTAR CONTACTOS
# ============================================================================
echo -e "${BLUE}[6/12] Test de Listado de Contactos...${NC}"

if [ -n "$TOKEN" ]; then
    CONTACTS_RESPONSE=$(curl -s -X GET "$API_URL/contacts" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/contacts-list-$TIMESTAMP.json")

    HAS_CONTACTS=$(echo "$CONTACTS_RESPONSE" | jq 'has("contacts")' 2>/dev/null || echo "false")

    if [ "$HAS_CONTACTS" = "true" ]; then
        CONTACT_COUNT=$(echo "$CONTACTS_RESPONSE" | jq '.count' 2>/dev/null || echo "0")
        test_pass "Listado de contactos exitoso ($CONTACT_COUNT contactos)"
    else
        test_fail "Error al listar contactos"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [7/12] CREAR CONTACTO (Test CRUD)
# ============================================================================
echo -e "${BLUE}[7/12] Test de Creación de Contacto...${NC}"

if [ -n "$TOKEN" ]; then
    TEST_NUMBER="55119$(date +%s | tail -c 8)"  # Número único
    TEST_NAME="Test Contact $(date +%H%M%S)"

    CREATE_CONTACT_RESPONSE=$(curl -s -X POST "$API_URL/contacts" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"number\":\"$TEST_NUMBER\",\"name\":\"$TEST_NAME\"}" \
        2>&1 | tee "$LOG_DIR/contact-create-$TIMESTAMP.json")

    CONTACT_ID=$(echo "$CREATE_CONTACT_RESPONSE" | jq -r '.id' 2>/dev/null || echo "")

    if [ -n "$CONTACT_ID" ] && [ "$CONTACT_ID" != "null" ]; then
        test_pass "Contacto creado exitosamente (ID: $CONTACT_ID)"
    else
        test_fail "Error al crear contacto"
        echo "Respuesta: $CREATE_CONTACT_RESPONSE"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [8/12] DASHBOARD - Obtener datos
# ============================================================================
echo -e "${BLUE}[8/12] Test de Dashboard (KPIs)...${NC}"

if [ -n "$TOKEN" ]; then
    DASHBOARD_RESPONSE=$(curl -s -X GET "$API_URL/dashboard" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/dashboard-$TIMESTAMP.json")

    HAS_DATA=$(echo "$DASHBOARD_RESPONSE" | jq 'has("data") or has("tickets")' 2>/dev/null || echo "false")

    if [ "$HAS_DATA" = "true" ]; then
        test_pass "Dashboard data obtenida correctamente"
    else
        test_fail "Error al obtener dashboard data"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [9/12] VERIFICAR CONEXIONES (WhatsApp/Telegram)
# ============================================================================
echo -e "${BLUE}[9/12] Test de Conexiones WhatsApp/Telegram...${NC}"

if [ -n "$TOKEN" ]; then
    CONNECTIONS_RESPONSE=$(curl -s -X GET "$API_URL/whatsapp" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/connections-$TIMESTAMP.json")

    # Verificar que la respuesta sea un array o tenga campo whatsapps
    IS_ARRAY=$(echo "$CONNECTIONS_RESPONSE" | jq 'type == "array"' 2>/dev/null || echo "false")
    HAS_WHATSAPPS=$(echo "$CONNECTIONS_RESPONSE" | jq 'has("whatsapps")' 2>/dev/null || echo "false")

    if [ "$IS_ARRAY" = "true" ] || [ "$HAS_WHATSAPPS" = "true" ]; then
        test_pass "Listado de conexiones obtenido"
    else
        test_fail "Error al obtener conexiones"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [10/12] VERIFICAR COLAS (Queues)
# ============================================================================
echo -e "${BLUE}[10/12] Test de Colas (Queues)...${NC}"

if [ -n "$TOKEN" ]; then
    QUEUES_RESPONSE=$(curl -s -X GET "$API_URL/queue" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/queues-$TIMESTAMP.json")

    IS_ARRAY=$(echo "$QUEUES_RESPONSE" | jq 'type == "array"' 2>/dev/null || echo "false")
    HAS_QUEUES=$(echo "$QUEUES_RESPONSE" | jq 'has("queues")' 2>/dev/null || echo "false")

    if [ "$IS_ARRAY" = "true" ] || [ "$HAS_QUEUES" = "true" ]; then
        test_pass "Listado de colas obtenido"
    else
        test_fail "Error al obtener colas"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [11/12] VERIFICAR RESPUESTAS RÁPIDAS
# ============================================================================
echo -e "${BLUE}[11/12] Test de Respuestas Rápidas...${NC}"

if [ -n "$TOKEN" ]; then
    QUICK_MESSAGES_RESPONSE=$(curl -s -X GET "$API_URL/quick-messages" \
        -H "Authorization: Bearer $TOKEN" \
        2>&1 | tee "$LOG_DIR/quick-messages-$TIMESTAMP.json")

    HAS_MESSAGES=$(echo "$QUICK_MESSAGES_RESPONSE" | jq 'has("quickMessages") or type == "array"' 2>/dev/null || echo "false")

    if [ "$HAS_MESSAGES" = "true" ]; then
        test_pass "Respuestas rápidas obtenidas"
    else
        test_fail "Error al obtener respuestas rápidas"
    fi
else
    test_fail "Skipped - Sin token de autenticación"
fi

echo ""

# ============================================================================
# [12/12] TEST DE WEBSOCKET (opcional - requiere wscat)
# ============================================================================
echo -e "${BLUE}[12/12] Test de WebSocket...${NC}"

if command -v wscat &> /dev/null; then
    echo "Testing WebSocket connection..."
    # Test simple de conexión (timeout 5 segundos)
    timeout 5 wscat -c "ws://localhost:3000" --execute "ping" &>/dev/null && \
        test_pass "WebSocket conecta correctamente" || \
        test_fail "WebSocket no responde"
else
    echo -e "${YELLOW}⚠ wscat no instalado - Test de WebSocket omitido${NC}"
    echo "  Instalar con: npm install -g wscat"
fi

echo ""

# ============================================================================
# GENERAR REPORTE FINAL
# ============================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}      RESUMEN DE PRUEBAS FUNCIONALES CRÍTICAS        ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

echo -e "Total de pruebas: $TOTAL_TESTS"
echo -e "${GREEN}Pruebas exitosas: $PASSED_TESTS${NC}"
echo -e "${RED}Pruebas fallidas: $FAILED_TESTS${NC}"
echo ""

# Calcular porcentaje
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    echo -e "${BLUE}Tasa de éxito: $SUCCESS_RATE%${NC}"
fi

echo ""

# Guardar reporte JSON
cat > "$LOG_DIR/functional-tests-report-$TIMESTAMP.json" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "totalTests": $TOTAL_TESTS,
  "passed": $PASSED_TESTS,
  "failed": $FAILED_TESTS,
  "successRate": "$SUCCESS_RATE%",
  "apiUrl": "$API_URL",
  "frontendUrl": "$FRONTEND_URL",
  "status": "$([ $FAILED_TESTS -eq 0 ] && echo 'PASS' || echo 'FAIL')"
}
EOF

# Decisión final
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ PRUEBAS FUNCIONALES APROBADAS${NC}"
    echo -e "${GREEN}  Todos los flujos críticos funcionan correctamente${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    exit 0
elif [ $FAILED_TESTS -le 2 ]; then
    echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}⚠ APROBADO CON OBSERVACIONES${NC}"
    echo -e "${YELLOW}  $FAILED_TESTS pruebas fallaron (no crítico)${NC}"
    echo -e "${YELLOW}  Revisar logs en: $LOG_DIR/${NC}"
    echo -e "${YELLOW}════════════════════════════════════════════════════${NC}"
    exit 0
else
    echo -e "${RED}════════════════════════════════════════════════════${NC}"
    echo -e "${RED}✗ PRUEBAS FUNCIONALES FALLIDAS${NC}"
    echo -e "${RED}  $FAILED_TESTS pruebas críticas fallaron${NC}"
    echo -e "${RED}  DEBE corregir antes de desplegar${NC}"
    echo -e "${RED}════════════════════════════════════════════════════${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Logs guardados en: $LOG_DIR/${NC}"
ls -lh $LOG_DIR/*$TIMESTAMP* 2>/dev/null
echo ""
