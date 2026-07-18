# Aceptación — Roles, Usuarios y Asientos

> Spec: [`spec/modules/roles-usuarios-spec.md`](../modules/roles-usuarios-spec.md) · Fecha verificación: 2026-07-15
> Regla: evidencia antes de afirmar.

## A. Modelo y datos — ✅ VERIFICADO

- [x] **A1** Modelo `Role` + tabla `Roles` (migración `database/migrations/fase3-roles-usuarios.sql`, aplicada).
- [x] **A2** 5 presets sembrados (`isSystem=true`, `companyId=NULL`):
      `super_admin`+`company_admin` (unrestricted), `supervisor` (22 mods), `agent` (12), `marketing` (40).
      Evidencia: `SELECT key,unrestricted,#permKeys FROM Roles` → 5 filas correctas.
- [x] **A3** `User.roleId` nullable + FK. **roleId=null ⇒ comportamiento actual** (solo-plan). Cero filas
      de `Users` alteradas por la migración ⇒ cero regresión.

## B. Doble filtro `canAccess = plan ∩ rol` — ✅ VERIFICADO EN VIVO

- [x] **B1** `role` viaja al frontend en **login** (`LoginSessionService`+`SerializeUser`) y en **`/me`**
      (`ShowUserService`+`SessionController.me` — requirió añadir `roleId` al whitelist de atributos Y al
      return inline del controlador; ambos eran fugas).
- [x] **B2** `usePermissions`: `canAccess`/`canWrite`/`accessibleModules` aplican `plan ∩ rol`; sin rol o
      `unrestricted` ⇒ pasa (compat).
- [x] **B3** **PRUEBA DEFINITIVA**: cuenta `qa-role-agent@chateam.com` (profile=user, super=false,
      roleId=agent) en la MISMA empresa full-plan que el super. Resultado medido por sonda ⌘K:
      - Super (sin rol): **98 comandos, 10 secciones**.
      - Agente (rol=agent): **11 comandos, 3 secciones** (INICIO, OPERATIVO, CLASIFICACIÓN).
      - **89% menos**, sin Marketing/IA/Canales/Herramientas/Afiliados/Sistema/Configuración.
      ⇒ *"un agente y un admin con el mismo plan ven menús distintos"* — cumplido.
- [x] **B4** `super` siempre pasa (bypass). Gate VERDE (RBAC+E2E 11/11+a11y 0/0/0) tras el deploy.

## C. Asientos por plan — ✅ (existente + refinado)

- [x] **C1** `CreateUserService` cuenta usuarios de la empresa y **rechaza al llegar a `Plan.users`**
      (ya existía). Refinado a **409 `ERR_SEAT_LIMIT`** con mensaje `usados/totales`; `users<=0` ⇒ sin límite.
- [x] **C2** Caso real presente: company 10 con plan.users=3 y 3 usados (al tope). Enforcement activo.
- [ ] **C3** UI de asientos `usados/totales` + botón "Crear usuario" deshabilitado al tope → *pendiente
      (parte de la UI de gestión, D)*.

## D. UI de gestión (admin de empresa) — ✅ VERIFICADO

- [x] **D1** Página `pages/RolesManagement.tsx` (ruta `/roles-management`, menú CONFIGURACIÓN): banner de
      asientos `usados/totales` con barra + aviso al tope, tabla de usuarios con **dropdown de rol**, tabla
      de roles con nº de módulos + clonar. Sonda: banner ✓, 5 usuarios, 5 roles, 5 dropdowns, 0 errores.
- [x] **D2** Clonar preset → rol de empresa editable (`POST /roles` con `fromRoleId`). Editar/borrar solo
      roles propios, nunca presets de sistema (guard `ERR_ROLE_NOT_EDITABLE`).
- [x] **D3** Endpoints (`controllers/RoleController.ts` + `routes/roleRoutes.ts`, montado en raíz):
      `GET /roles` (5 roles), `GET /roles/seats` (`{used:5,total:999}`), `POST/PUT/DELETE /roles`,
      y asignación vía `PUT /users/:id {roleId}` (guard anti-privesc en `UpdateUserService`).
- [x] **D4** Gate VERDE + a11y dashboard 0/0/0. **Asignación probada end-to-end**: PUT roleId → 200 → BD
      refleja → revert → BD vuelve.
- [x] **C3** Banner de asientos con barra + estado "al límite" implementado en D1.

## RESULTADO: N2.0 COMPLETO ✅ (modelo + filtro + asientos + UI, todo probado en vivo)

## Notas

- Cuenta QA: `qa-role-agent@chateam.com` / `QaRole.2026` (id 70, company 1, rol agent) — dejada para
  validar el eje rol; NO usar para operar. Complementa `qa-agent` (super).
- Backend `chateam-node` reiniciado 3× durante la implementación; estable (health 401).
