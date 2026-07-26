# Estándar de API — Envelope HTTP (W5-API-01 · NFR-020)

> Convención + plan de adopción incremental. 2026-07-26. Origen: `audit/parts/api-contratos.md` C-01
> (3 formas coexistiendo: `{success,message,data}` en 82 controllers, ~1137 `res.json` plano,
> `{error,message}` en el handler global).

## Problema
No hay una forma única de respuesta → el front parsea a la defensiva (`data.tickets || data`,
`data.records`, etc.). Cambiar la forma de un endpoint existente **puede romper** al consumidor front,
por eso NO se migra en masa.

## Forma canónica (obligatoria para endpoints NUEVOS)
```jsonc
// éxito
{ "success": true, "data": <payload>, "message"?: "texto" }
// error
{ "success": false, "message": "texto", "code"?: "ERR_ALGO", ...extra }
```
Helper: `helpers/apiResponse.ts` → `ok(res, data, message?, status?)` y
`fail(res, message, status?, extra?)`.

```ts
import { ok, fail } from "../helpers/apiResponse";
// ...
return ok(res, campaigns, undefined);        // 200 { success:true, data:campaigns }
return fail(res, "ERR_NO_ACCESS", 403);       // 403 { success:false, message:"ERR_NO_ACCESS" }
```

## Reglas
1. **Todo endpoint NUEVO** usa `ok`/`fail`. Sin excepción.
2. **Migración de existentes = incremental y COORDINADA con el front**, endpoint por endpoint:
   - Verificar cómo consume el front ese endpoint (qué shape espera).
   - Migrar backend a `ok/fail` + actualizar el parseo del front en el mismo cambio.
   - Sonda de regresión de esa pantalla.
   - **Nunca** un cambio masivo automático (rompería el parseo defensivo actual).
3. **Orden sugerido de migración:** empezar por endpoints ya cercanos a la forma canónica (los 82
   `{success,...}`) → adoptan el helper sin cambio de comportamiento (riesgo cero). Luego los planos,
   uno a uno con su pantalla.
4. El handler de error global debe converger a `{ success:false, message, code? }` (hoy tiene 4
   variantes) — cambio transversal, hacer con verificación del front.

## Estado
- **Fundación creada** (helper + esta convención). Migración de los ~891 endpoints = backlog
  incremental, no un lote. NFR-020 pasa de AUSENTE a **EN CURSO** (fundación lista).
