# Spec — Roles, Usuarios y Asientos por Plan

> Módulo: `roles-usuarios` · Estado: **PROPUESTO** (sin implementar) · Fecha: 2026-07-15
> Origen: requerimiento del usuario — jerarquía de roles + plantillas configurables + límite de asientos.
> **Es cimiento de** [`navegacion-ia-spec.md`](navegacion-ia-spec.md): el eje ROL de la navegación (N2.1)
> no puede gatear por tipos de rol que hoy no existen. **Este módulo va antes.**

---

## 1. Requerimiento (enunciado del negocio)

1. Jerarquía: **super admin** (plataforma) → **admin de empresa** (dueño del tenant) → **usuarios** que el
   admin de empresa crea con **tipos de rol** (agente de atención, marketing que revisa pautas, etc.).
2. Roles **preestablecidos pero configurables** (plantillas editables por empresa).
3. **Control de usuarios por el número de asientos del plan contratado** (no crear más usuarios de los que
   el plan permite).

## 2. Auditoría — estado actual medido (2026-07-15)

| Capacidad | Hoy | Evidencia |
|---|---|---|
| Super admin | ✅ | `User.super: boolean` (`models/User.ts:74`) |
| Admin de empresa | 🟡 | `profile='admin'` + `companyId`; pero en la práctica solo se usan `"admin"` e implícito `"user"` (grep: 6× "admin", supervisor/user reales ~0) |
| Modelo de Roles/Permisos | ❌ | **No existe** tabla/modelo Role ni Permission. `profile` es **string libre**. |
| Permisos configurables | 🟡 pero por PLAN | `InterfacePermissions` (JSON) + `DEFAULT_PLAN_PERMISSIONS` (`utils/permissions.ts:904`). Los permisos cuelgan del **plan**, no del **rol**. |
| Tipos de rol (agente/marketing/…) | ❌ | No existen. |
| Límite de asientos | 🟡 campo sí, enforcement no | `Plan.users: number` (`models/Plan.ts:29`) existe, pero **`UserController.store` NO valida** el conteo contra el plan antes de crear. |

**Conclusión**: hay que **construir la capa de roles** (modelo + plantillas + asignación) y **cablear el
enforcement de asientos**. Los permisos por plan **se conservan**: el resultado es doble filtro
`visible = permisos_del_plan ∩ permisos_del_rol`.

## 3. Modelo propuesto

### 3.1 Jerarquía (3 niveles)

```
super admin (plataforma, User.super=true) — ve TODO, todas las empresas, Sistema
   └─ admin de empresa (profile='admin', scope=companyId) — administra SU empresa y SUS usuarios
        └─ usuario con ROL (agente / marketing / supervisor / …) — ve lo que su rol permite
```

### 3.2 Roles como plantillas (preset + configurable)

Nuevo modelo **`Role`** (por empresa, con presets sembrados):

| Campo | Tipo | Nota |
|---|---|---|
| `id` | pk | |
| `companyId` | fk | null ⇒ plantilla global de sistema (preset base) |
| `name` | string | "Agente de atención", "Marketing", … |
| `key` | string | slug estable (`agent`, `marketing`, `supervisor`, `company_admin`) |
| `isSystem` | boolean | true = preset no borrable (sí clonable/editable copia) |
| `permissions` | JSON | `InterfacePermissions` (mismo shape que hoy el plan) |
| `editable` | boolean | el admin de empresa puede ajustar módulos dentro de lo que el plan compró |

`User` gana `roleId` (fk) además de `profile`/`super` (compat). Migración: `profile='admin'`→rol
`company_admin`; `profile='user'`→rol `agent` por defecto.

### 3.3 Presets sembrados (borrador — se validan con usuarios como en `navegacion-ia`)

| Rol preset | Ámbito (hubs/secciones visibles) | Escritura |
|---|---|---|
| **Agente de atención** | Inbox, Contactos, Chats internos, Respuestas rápidas, Programados, Pipeline | en su trabajo; config solo lectura/oculta |
| **Marketing** | Agente + Marketing (Campañas, UGC, Email, Ads, Insights) + Canales (plantillas/comentarios) | en marketing; sin usuarios/config/sistema |
| **Supervisor** | Agente + Reportes + Colas + Automatización + ver equipo | + gestionar colas/reglas |
| **Admin de empresa** | Todo el ámbito de la empresa (todos los hubs + Configuración + **Usuarios**) | total dentro de la empresa; **no** Sistema |
| **Super admin** | Todo + Sistema (Empresas, Planes, Logs, Dev) | plataforma |

> Presets = punto de partida. El admin de empresa **clona/edita** dentro de lo que el **plan** habilita
> (nunca puede conceder un módulo que el plan no compró: `rol ∩ plan`).

### 3.4 Doble filtro (une este módulo con navegación)

```
canAccess(module) = hasAccessByPlan(plan, module)   // ya existe
                    ∩ hasAccessByRole(rol, module)   // NUEVO
super lo saltea todo.
```

## 4. Asientos por plan (enforcement)

- Fuente: `Plan.users` (asientos comprados).
- **En `CreateUserService`**: contar usuarios **activos** de la `companyId` y **rechazar** si
  `count >= plan.users` con error claro (`ERR_SEAT_LIMIT`, 409) y CTA a "ampliar plan".
- **UI**: en gestión de usuarios mostrar `usados / totales` (p.ej. "7 / 10 asientos") y deshabilitar
  "Crear usuario" al tope.
- **Casos borde**: usuarios inactivos/deshabilitados no cuentan; downgrade de plan por debajo del uso
  actual ⇒ no borrar usuarios, bloquear altas nuevas y avisar (decisión de negocio a confirmar).

## 5. Alcance

**Dentro**: modelo `Role` + `User.roleId` + migración compat; `CreateUserService` con enforcement de
asientos; seed de presets; UI de gestión de roles y usuarios (admin de empresa); doble filtro en
`canAccess`.

**Fuera**: cambio de la estructura del menú (eso es `navegacion-ia` N2.1, que **consume** este módulo);
planes/billing (solo se lee `Plan.users`).

## 6. Criterios de aceptación (resumen; detalle en `acceptance/roles-usuarios.md`)

1. Existe modelo `Role` con 5 presets sembrados (`isSystem=true`), clonables/editables por empresa.
2. Crear usuario **falla con 409** cuando `count >= Plan.users`; UI muestra `usados/totales`.
3. `canAccess` aplica `plan ∩ rol`; un **agente** y un **admin** con el mismo plan ven menús distintos
   (hoy ven lo mismo — es el bug raíz de `navegacion-ia` §2.0).
4. Un admin de empresa **no** puede conceder a un rol un módulo que el plan no compró.
5. Migración: usuarios `admin`→`company_admin`, resto→`agent`, sin pérdida de acceso para nadie.
6. `tsc` limpio + `ci-gate.sh` VERDE + a11y 0 críticas en las pantallas nuevas.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Migrar `profile`→`roleId` rompe gating existente | Mantener `profile`/`super` en paralelo; `roleId` aditivo; probar con cuentas de cada rol |
| Ocultar por rol algo que un rol necesita | Presets validados con usuarios (ya OK en `navegacion-ia` N1.0) + ⌘K como red (ya desplegado) |
| Enforcement de asientos bloquea operación legítima | Contar solo activos; mensaje claro + ruta a ampliar plan; feature-flag para activar gradual |
| Doble filtro `plan ∩ rol` mal compuesto deja a alguien sin acceso | Regla: `super` siempre pasa; `company_admin` = todo el plan; tests por rol |

## 8. Pendiente de verificar

- ¿`Plan.users` está poblado en los planes reales o es 0/null? (si null ⇒ tratar como ilimitado o pedir dato).
- ¿Hay un flujo de "usuario deshabilitado" (soft-disable) para excluir del conteo de asientos?
- Catálogo final de presets: **se cierra con el mismo tree testing** de `navegacion-ia` N1 (los roles ya
  fueron OK'd a alto nivel; falta granularidad de módulos por rol).
