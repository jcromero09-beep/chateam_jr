# Runbook — separar producción del árbol de desarrollo

> **Este runbook NO lo ejecuta el agente.** Implica reiniciar `chateam-node` y
> `chateam-worker`, que sostienen sesiones vivas de Baileys. Es una operación con
> corte, no un cambio de código. Lo lanza JC en la ventana que elija.

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
| `public/` | **17 GB de adjuntos reales de clientes.** | **Symlink**, nunca copia. |
| `.env` | Secretos. No está en git. | Copiar a mano, verificar permisos. |
| Sesión de Baileys | Credenciales de las conexiones de WhatsApp. | Ver dónde las guarda la config; si se pierden, todas las conexiones piden QR otra vez. |
| `logs/` | Histórico. | Dejar el viejo donde está. |

⚠️ **Confirmar dónde vive la sesión de Baileys ANTES de reiniciar.** Si está dentro
del árbol y no se migra, el resultado es todas las conexiones en `qrcode` y hay que
re-escanear una por una. Es el riesgo principal de esta operación.

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
cd /opt/chateam && pm2 start ecosystem.config.cjs
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
cd /home/jcromero09/chateam_jr && pm2 start ecosystem.config.cjs && pm2 save
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
