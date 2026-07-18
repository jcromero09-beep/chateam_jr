# Spec · Cifrado de tokens Meta en reposo (Plan Fase 2 · Ola A · A3.1)

## Qué (comportamiento)
- Los tokens de Meta se guardan **cifrados en reposo** (AES-256-GCM): `Whatsapps.tokenMeta` y `CompaniesSettings.facebookSystemUserToken`.
- El cifrado es **transparente**: getters/setters del modelo cifran al escribir y descifran al leer, sin cambiar el resto del código.
- **Retrocompatible**: valores en texto plano (no migrados) se leen tal cual (passthrough); `encryptSecret` es idempotente.
- Llave: derivada por `scryptSync` de `process.env.ENCRYPTION_KEY` (acepta cualquier longitud; la key del proyecto es de 33 chars).

## Componentes
- `helpers/secretCrypto.ts` — `encryptSecret`/`decryptSecret`/`isEncrypted`. Formato `enc:v1:<iv>:<tag>:<ct>` (hex). GCM autenticado (anti-tamper).
- `models/Whatsapp.ts` — getter/setter en `tokenMeta`.
- `models/CompaniesSettings.ts` — getter/setter en `facebookSystemUserToken`.
- **Excepciones arregladas** (el cifrado no-determinístico las rompía):
  1. `MetaWebhookController` hacía `findOne({where:{tokenMeta: token}})` → cambiado a `findAll({provider:meta,channel:meta})` + `find(w => w.tokenMeta === token)` (compara descifrado; el getter descifra).
  2. `TokenManager` escribía con `CompaniesSettings.update` **estático** (bypass del setter) → cifra explícito con `encryptSecret(...)`.
- `scripts/encrypt-meta-tokens.ts` — migración/reversión (transformer stdin→SQL, mismo `secretCrypto`; verificación round-trip por fila).

## Aceptación (verificada 2026-07-13)
1. ✅ En reposo: 14/14 `tokenMeta` + 6/6 `facebookSystemUserToken` con prefijo `enc:v1:` (0 en plano) — ilegibles en `psql`.
2. ✅ Getter descifra en el runtime del app (token válido recuperado).
3. ✅ **Live**: `GET /webhook/metaws` con el token descifrado de una conexión meta → **HTTP 200** (getter + find funcionan en producción; el envío WhatsApp Cloud y CAPI usan el mismo acceso por propiedad).
4. ✅ Reversible: `MODE=decrypt` descifra las 20 sin fallos (recuperable con la misma key).
5. ✅ Gate verde (11 E2E) sin regresión.

## Riesgos / notas
- **Dependencia de `ENCRYPTION_KEY`**: si se pierde/rota la key, los tokens cifrados son irrecuperables. Backup de la key fuera de banda. (Rotación de key = descifrar con vieja + re-cifrar con nueva vía el script.)
- **Escrituras futuras**: `Model.create` e `instance.update` corren el setter (cifran). Un `Model.update` **estático** nuevo con estas columnas NO cifraría → usar `encryptSecret()` explícito (como en `TokenManager`). El passthrough del getter evita que una lectura se rompa aunque quedara algún plano.
- **Pendiente (fuera de A3.1)**: `Whatsapp.pageAccessToken`, `facebookAppSecret` y las API keys de proveedores IA también son secretos en claro → candidatos a la misma técnica en una tanda posterior.
