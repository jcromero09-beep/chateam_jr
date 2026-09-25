# Pruebas de los módulos de visión clásica (`docs/`)

Todos los paquetes de visión (`audio`, `forensic`, `video`, `safety`, `health`, `agriculture`,
`aquaculture`, `environment`, `inspection`, `logistics`, `tools`, `vehicle`) traen suites
`unittest` con **señales/imágenes sintéticas** — sin modelos pesados, sin GPU, sin red, sin AGPL.
El detector/decoder real siempre se **inyecta** (se sustituye por uno falso en las pruebas).

## Runner único

```bash
python docs/run_tests.py                 # corre TODO y da un total
python docs/run_tests.py audio forensic  # solo esos paquetes
python docs/run_tests.py --list          # lista lo que correría, sin ejecutar
python docs/run_tests.py -q              # solo el resumen
```

Cada `test_*.py` se ejecuta **en su propio directorio y en un subproceso aislado** (cada suite hace
`sys.path.insert(0, dirname)` para importar sus módulos hermanos), así un fallo de import en un
paquete no tumba al resto. Termina con código `!= 0` si algo falla.

## Gate de CI

```bash
bash docs/ci-gate.sh            # todo (falla si alguna prueba falla)
bash docs/ci-gate.sh audio      # un paquete
PYTHON=python3.11 bash docs/ci-gate.sh
```

Es un gate **liviano y local**: solo pruebas de Python. NO hace builds, migraciones ni despliegues
(eso requiere autorización explícita, ver `AGENTS.md §4`), y es independiente de
`scripts/ci-gate.sh` (el gate vivo con Playwright del producto Node).

## Estado actual

```
agriculture   19 · aquaculture  41 · audio        48 · environment  44
forensic      93 · health       12 · inspection   33 · logistics    18
safety        58 · tools        16 · vehicle      12 · video        173
------------------------------------------------------------
TOTAL: 567 pruebas en 48 archivos — todo verde
```

Regenera este conteo con `python docs/run_tests.py`.
