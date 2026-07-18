# Guía de Integración: API Connect

## Endpoint

```
POST /api/connect
```

**URL completa**: `https://tu-servidor-chateam.com/api/connect`

---

## Request

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "email": "usuario@empresa.com",
  "password": "contraseña123"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| email | string | Sí | Email del usuario registrado en Chateam |
| password | string | Sí | Contraseña del usuario |

---

## Responses

### Éxito (200 OK)

```json
{
  "success": true,
  "data": {
    "whatsappId": 5,
    "token": "abc123xyz789...",
    "companyId": 1,
    "whatsappName": "Ventas Principal",
    "whatsappNumber": "593963626697",
    "status": "CONNECTED",
    "channel": "whatsapp"
  }
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| whatsappId | number | ID de la conexión WhatsApp (usar para enviar mensajes) |
| token | string | Token de autenticación para la API de mensajes |
| companyId | number | ID de la empresa |
| whatsappName | string | Nombre descriptivo de la conexión |
| whatsappNumber | string | Número de WhatsApp de la conexión |
| status | string | Estado de la conexión ("CONNECTED") |
| channel | string | Canal de la conexión ("whatsapp", "telegram", etc.) |

---

### Errores

#### 400 - Error de Validación
```json
{
  "success": false,
  "error": "ERR_EMAIL_REQUIRED",
  "code": "VALIDATION_ERROR"
}
```

Posibles mensajes de error:
- `ERR_EMAIL_REQUIRED` - Email no proporcionado
- `ERR_PASSWORD_REQUIRED` - Password no proporcionado
- `ERR_INVALID_EMAIL_FORMAT` - Formato de email inválido

#### 401 - Usuario No Encontrado
```json
{
  "success": false,
  "error": "Usuario no encontrado",
  "code": "USER_NOT_FOUND"
}
```

#### 401 - Contraseña Incorrecta
```json
{
  "success": false,
  "error": "Contraseña incorrecta",
  "code": "INVALID_PASSWORD"
}
```

#### 404 - Sin Conexión WhatsApp
```json
{
  "success": false,
  "error": "No hay conexión WhatsApp disponible para esta empresa",
  "code": "NO_WHATSAPP_CONNECTION"
}
```

#### 500 - Sin Token Configurado
```json
{
  "success": false,
  "error": "La conexión WhatsApp no tiene token configurado",
  "code": "NO_API_TOKEN"
}
```

---

## Ejemplos de Implementación

### cURL
```bash
curl -X POST https://tu-servidor-chateam.com/api/connect \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@empresa.com",
    "password": "miPassword123"
  }'
```

### JavaScript (fetch)
```javascript
const response = await fetch('https://tu-servidor-chateam.com/api/connect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'usuario@empresa.com',
    password: 'miPassword123'
  })
});

const result = await response.json();

if (result.success) {
  // Guardar credenciales para usar la API de mensajes
  const { whatsappId, token, companyId } = result.data;
  console.log('Conexión obtenida:', whatsappId);
} else {
  console.error('Error:', result.code, result.error);
}
```

### PHP
```php
<?php
$url = 'https://tu-servidor-chateam.com/api/connect';
$data = [
    'email' => 'usuario@empresa.com',
    'password' => 'miPassword123'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$result = json_decode($response, true);

if ($result['success']) {
    $whatsappId = $result['data']['whatsappId'];
    $token = $result['data']['token'];
    $companyId = $result['data']['companyId'];
    echo "Conexión exitosa. WhatsApp ID: $whatsappId";
} else {
    echo "Error: " . $result['code'] . " - " . $result['error'];
}
?>
```

### Python
```python
import requests

url = 'https://tu-servidor-chateam.com/api/connect'
payload = {
    'email': 'usuario@empresa.com',
    'password': 'miPassword123'
}

response = requests.post(url, json=payload)
result = response.json()

if result['success']:
    data = result['data']
    whatsapp_id = data['whatsappId']
    token = data['token']
    company_id = data['companyId']
    print(f'Conexión exitosa. WhatsApp ID: {whatsapp_id}')
else:
    print(f'Error: {result["code"]} - {result["error"]}')
```

---

## Flujo de Integración

```
┌─────────────────────┐
│  Sistema Externo    │
└──────────┬──────────┘
           │
           │ POST /api/connect
           │ { email, password }
           ▼
┌─────────────────────┐
│   Chateam API       │
│   /api/connect      │
└──────────┬──────────┘
           │
           │ Valida credenciales
           │ Busca conexión por defecto
           ▼
┌─────────────────────┐
│  Respuesta JSON     │
│  { whatsappId,      │
│    token,           │
│    companyId, ... } │
└──────────┬──────────┘
           │
           │ Guardar credenciales
           ▼
┌─────────────────────┐
│  Usar API Messages  │
│  con el token       │
└─────────────────────┘
```

---

## Notas Importantes

1. **Seguridad**: Siempre usa HTTPS en producción
2. **Almacenamiento**: Guarda el token de forma segura en tu sistema
3. **Renovación**: El token no expira, pero puede cambiar si se reconfigura la conexión
4. **Conexión por defecto**: Si el usuario tiene varias conexiones, se devuelve la marcada como default o la primera conectada
