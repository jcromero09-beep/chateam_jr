# Auditoría · Permisos por plan (acceso a interfaces) — 2026-07-08

## Veredicto
El control de acceso **por plan** es **prácticamente COSMÉTICO**: oculta ítems del menú, pero **no impide el acceso real** a las funciones premium. Ni el frontend bloquea las rutas por plan, ni el backend valida el plan en los endpoints. Un usuario con un plan que NO incluye una feature igual puede usarla por **URL directa** o por **API directa**.

## Cómo se supone que funciona vs. cómo funciona
| | Esperado | Real |
|---|---|---|
| Booleanos `plan.useX` | ocultar menú **y** bloquear acceso | **solo ocultan el menú** (`AppLayout`) |
| Rutas frontend | bloquear si el plan no incluye | `ProtectedRoute` **no tiene** `planFeature`; el acceso lo decide `interfacePermissions`, que por **default abre casi todo** |
| `interfacePermissions` (BD) | definido por plan | **solo el Demo lo tiene**; los 4 planes de pago están **vacíos** → DEFAULT abre casi todo |
| Backend (API) | validar el plan | **no hay middleware de plan**; solo `isAuth`. 3 excepciones inline (WhatsApp/Telegram/UGC) |

## Hallazgos priorizados
- **🔴 P0-1 — Bypass por API (backend no valida el plan).** Campañas, IA/OpenAI (agentes), Integraciones, Citas, Email Marketing/Automation, Kanban, WebChat, API Externa, Schedules, FlowBuilder responden solo con `isAuth`. Cualquier usuario autenticado los invoca aunque su plan no los incluya. (No hay `checkPlanFeature` en `middleware/`.)
- **🔴 P0-2 — Frontend no bloquea rutas por plan.** `ProtectedRoute` carece de prop `planFeature`; `App.tsx` no la usa. Un plan con `useCampaigns=false` entra por URL a `/campaigns`, `/openai/*`, etc.
- **🔴 P0-3 — Acceso premium abierto por defecto.** `interfacePermissions` vacío (4/5 planes) + `DEFAULT_PLAN_PERMISSIONS` con casi todo `true` → los módulos premium quedan accesibles.
- **🟠 P1 — Dos fuentes de verdad divergentes.** Booleanos `useX` (capa A, solo menú) vs `interfacePermissions` (capa B, rutas). No se sincronizan; un plan puede negar y permitir el mismo módulo según la capa.
- **🟠 P1 — `email_marketing` mapea a propiedad inexistente** en el tipo `Plan` del frontend (`as keyof Plan` silencia el error).
- **🟠 P2 — Módulos premium sin ningún control de plan:** Citas, WebChat, Flowbuilder, Auto-Responder (ni booleano ni `interfacePermissions`).
- **🟡 P3 — Mapeos incorrectos:** UGC se habilita con el flag de `campaigns` (no propio).

## Lo que SÍ funciona (balance)
- Bypass de **superadmin** (`user.super`) correcto.
- **Multi-tenancy** (`companyId`) y control por **rol** (admin/supervisor/user) — funcionan (son otro eje, no el del plan).
- Enforcement real en 3 puntos: crear conexión **WhatsApp/Telegram** (`useWhatsapp`/`useFacebook`) y crear campaña **UGC** (`useUgc`).
- Validación de **créditos de IA** (saldo) vía `validateAICredits` (aunque no valida la feature `useOpenAi`).

## Recomendación (orden de impacto)
1. **Backend — middleware `checkPlanFeature(feature)`** (lo más importante: cierra el bypass real). Carga el plan de la company y valida; aplicarlo a los grupos de rutas premium (campaigns, ai, integrations, appointments, email, webchat, api externa, schedules, kanban, flowbuilder).
2. **Unificar la fuente de verdad:** elegir UN mecanismo (recomendado: los booleanos `useX`, que son explícitos) y derivar de ahí tanto el menú como el gating. Sincronizar `interfacePermissions` o deprecarlo.
3. **Configurar `interfacePermissions` en todos los planes** o cambiar el DEFAULT a "cerrado" para módulos premium (mitiga P0-3 sin tocar código).
4. **Frontend — añadir `planFeature` a `ProtectedRoute`** para UX coherente (mostrar "mejora tu plan" en vez de solo ocultar el menú).
5. Añadir features faltantes (Citas, WebChat) y arreglar mapeos (`email_marketing`, UGC).

## Nota
El arreglo #1 es de **seguridad/negocio** (evita que planes bajos usen features de pago). Los #2–#5 son consistencia y UX. Ninguno borra datos; el middleware es aditivo.
