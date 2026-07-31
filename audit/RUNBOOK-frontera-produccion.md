# Runbook — separar producción del árbol de desarrollo

> ## ✅ EJECUTADO el 2026-07-30. Producción corre desde `/opt/chateam`.
>
> Se deja el runbook porque documenta el procedimiento y, sobre todo, **las cinco
> cosas que salieron mal**. La versión original de este documento tenía
> instrucciones equivocadas; abajo están corregidas.
>
> ### Lo que este runbook decía mal
>
> 1. **"La sesión de Baileys es el riesgo principal."** Falso. Las credenciales
>    viven en **Redis** (`sessions:{whatsappId}:*` vía `cacheLayer`), no en disco.
>    Mover el checkout no las toca y el reinicio las relee. El riesgo que más
>    miedo daba no existía.
> 2. **`pm2 start ecosystem.config.cjs`.** Ese fichero está obsoleto: apunta a
>    `/home/deploy/chateam_jr` (ruta inexistente aquí) y define apps `node-1`/
>    `node-2`, no `chateam-node`. Habría roto producción. El bueno es
>    `ecosystem.chateam.local.config.cjs`.
> 3. **`public/` son 17 GB.** Son **4,9 GB**. El symlink sigue siendo correcto.
> 4. **Faltaba "pushear primero".** No se pudo (gate de permisos), y da igual: se
>    clona del árbol LOCAL, que ya tiene los commits. Lo que NO hay que hacer es
>    `git fetch origin && git checkout main` después de repuntar el remoto a
>    GitHub — traería el estado viejo.
> 5. **No mencionaba `--require tsx/cjs`.** Sin él el worker entra en bucle de
>    reinicio (ver abajo).
>
> ### Los tres bugs que la operación DESTAPÓ (y que se arreglaron)
>
> - **8 ficheros escribían fuera del repo.** `config/*.ts` y `helpers/addLogs.ts`
>   están a un nivel de la raíz y usaban `../..`, que apunta al PADRE del repo.
>   Invisible con el padre en `/home/jcromero09` (escribible); en `/opt` el
>   arranque muere con `EACCES: mkdir '/opt/private'`. La app llevaba escribiendo
>   36 ficheros de log en `/home/jcromero09/logs`, fuera del repo, sin que nadie
>   lo supiera.
> - **PM2 no reconocía el ecosystem.** `pm2 start` decide por EXTENSIÓN;
>   `ecosystem.chateam.local.cjs` no encajaba y PM2 lo arrancó **como script**:
>   un proceso llamado `ecosystem.chateam.local` en vez de las dos apps.
>   Renombrado a `.config.cjs`.
> - **Faltaba `--require tsx/cjs`** en el ecosystem. `queues.ts` hace `require()`
>   de ficheros `.ts`; sin el hook, el worker cargaba 5 colas en vez de 17 y
>   moría en bucle. Los procesos viejos SÍ lo llevaban — prueba de que nunca se
>   habían arrancado desde ese fichero.
>
> **Ninguno de los tres lo causó la frontera. Los tres estaban ahí y ella los
> expuso**, que es exactamente para lo que sirve tener una segunda copia.

## El problema

```
pm2: chateam-node    cwd=/home/jcromero09/chateam_jr   ← el árbol que se edita
pm2: chateam-worker  cwd=/home/jcromero09/chateam_jr
```

El proceso carga desde el directorio de trabajo. **No hay artefacto de build, ni
checkout separado, ni staging.** Consecuencias:

- Un guardado accidental llega a producción en el siguiente reinicio.
- No hay rollback que no sea `git`.
- No se puede probar un cambio sin arriesgar el servicio.
- Un `git checkout` de otra rama para revisar algo cambia lo que corre.

Mientras esto siga así, el eje de ops tiene techo haga lo que haga el resto del plan.

## Estado antes de empezar (verificar)

```bash
pm2 jlist | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  JSON.parse(d).filter(p=>/chateam/.test(p.name))
    .forEach(p=>console.log(p.name, p.pm2_env.status, p.pm2_env.pm_cwd))})"
```

Anotar el commit que corre ahora — es el punto de rollback:

```bash
cd /home/jcromero09/chateam_jr && git rev-parse HEAD
```

## Requisitos previos

1. **Los 20 commits pendientes, pusheados.** El checkout nuevo clona de `origin`;
   lo que no esté ahí no llega.
   ```bash
   cd /home/jcromero09/chateam_jr && git push origin main checkpoint/wip-3meses-2026-07-18
   ```
2. **Ventana de corte acordada.** El reinicio tira las sesiones de Baileys: las
   conexiones se reconectan solas, pero hay minutos sin ingesta. Fuera de horario.
3. **Backup de la BD reciente** (`scripts/backup.sh`). Este runbook no toca la BD,
   pero un reinicio con código nuevo puede sacar a la luz una migración pendiente.

## Qué NO se puede copiar sin pensar

Estas rutas viven dentro del árbol actual y **no** deben duplicarse:

| Ruta | Qué es | Qué hacer |
|---|---|---|
| `public/` | **4,9 GB de adjuntos reales de clientes.** | **Symlink**, nunca copia. |
| `.env` | Secretos. No está en git. | Copiar a mano, verificar permisos. |
| Sesión de Baileys | Credenciales de WhatsApp. | **Nada que hacer: viven en Redis**, no en disco. Verificado en `helpers/useMultiFileAuthState.ts`. |
| `logs/` | Histórico. | Dejar el viejo donde está. |

✅ **Resuelto: la sesión de Baileys vive en Redis** (`sessions:{whatsappId}:*`), no en
disco. Era el riesgo que este runbook marcaba como principal y no existía.

## Procedimiento

```bash
# 1. Clonar en la ruta de producción
sudo mkdir -p /opt/chateam && sudo chown "$USER" /opt/chateam
git clone /home/jcromero09/chateam_jr /opt/chateam
cd /opt/chateam
git remote set-url origin git@github.com:jcromero09-beep/chateam_jr.git
git fetch origin && git checkout main

# 2. Secretos y datos que no van por git
cp /home/jcromero09/chateam_jr/.env /opt/chateam/.env
chmod 600 /opt/chateam/.env

# 3. public/ por SYMLINK (17 GB — no copiar)
rm -rf /opt/chateam/public
ln -s /home/jcromero09/chateam_jr/public /opt/chateam/public
#    Mejor a medio plazo: mover public/ a /var/lib/chateam/public y que ambos
#    árboles apunten ahí, para que desarrollo no sea dueño de datos de producción.

# 4. Dependencias
cd /opt/chateam && npm ci

# 5. Comprobar que arranca ANTES de tocar PM2 (Ctrl-C tras ver el banner)
cd /opt/chateam && npx tsx server-distributed.ts
#    Buscar en la salida:
#      [tenantScope] modo=enforce · api=observe · N modelos …
#      y NINGÚN grito de assertMetaSignatureConfig()

# 6. Repuntar PM2  ← AQUÍ EMPIEZA EL CORTE
pm2 delete chateam-node chateam-worker
cd /opt/chateam && pm2 start ecosystem.chateam.local.config.cjs
#    NO ecosystem.config.cjs: está obsoleto (apunta a /home/deploy) y define
#    apps node-1/node-2, no chateam-node.
pm2 save                     # sin esto, un reboot lo pierde

# 7. Verificar
pm2 jlist | grep -o '"pm_cwd":"[^"]*"' | sort -u    # debe decir /opt/chateam
pm2 logs chateam-node --lines 50
```

## Verificación de que la frontera existe

La prueba real no es que arranque, es que **editar desarrollo ya no afecte a
producción**:

```bash
# En el árbol de desarrollo, tocar algo inocuo:
echo "// probe $(date +%s)" >> /home/jcromero09/chateam_jr/utils/version.ts
# Reiniciar producción:
pm2 restart chateam-node
# El cambio NO debe aparecer:
grep -c "probe" /opt/chateam/utils/version.ts     # → 0
# Limpiar:
cd /home/jcromero09/chateam_jr && git checkout utils/version.ts
```

Si eso da 0, la frontera existe.

## Rollback

```bash
pm2 delete chateam-node chateam-worker
cd /home/jcromero09/chateam_jr && pm2 start ecosystem.chateam.local.config.cjs && pm2 save
```

Vuelve a la situación de partida. Por eso el paso 3 usa symlink y no `mv`: nada
se movió, `public/` sigue donde estaba.

## Cómo se despliega a partir de entonces

```bash
cd /opt/chateam
git fetch origin && git checkout <tag-o-commit>
npm ci                       # solo si cambió package-lock.json
pm2 reload chateam-node      # reload, no restart: recarga sin tirar el proceso
```

Y el rollback pasa a ser trivial:

```bash
cd /opt/chateam && git checkout <commit-anterior> && pm2 reload chateam-node
```

## Después: lo que esto habilita

- **Desplegar por tag.** Saber qué commit corre deja de ser arqueología.
- **`chateam_test` con la compose de staging** (`docker-compose.staging.yml` ya
  está en el repo, sin usar).
- **CI puede desplegar.** El job `deploy-production` existe pero solo hace `echo`.
- **Editar sin miedo.** Que es lo que hace que todo lo demás del plan sea barato.
