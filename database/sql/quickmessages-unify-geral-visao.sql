-- Backfill: cualquier respuesta rapida marcada como global debe tener ambos flags consistentes.
-- Idempotente -- se puede ejecutar N veces.
-- Contexto: la UI usa `geral` como flag "Global" pero el backend filtraba por `visao`.
-- A partir de este fix `geral` es la fuente unica de verdad y `visao` queda como espejo legado.
BEGIN;

-- 1) Donde geral=true pero visao no es true -> corregir
UPDATE "QuickMessages"
   SET "visao" = true
 WHERE "geral" = true
   AND ("visao" IS DISTINCT FROM true);

-- 2) Donde visao=true pero geral no es true -> corregir (caso inverso, por simetria)
UPDATE "QuickMessages"
   SET "geral" = true
 WHERE "visao" = true
   AND ("geral" IS DISTINCT FROM true);

-- Reporte de filas con desincronizacion (despues del fix debe devolver 0)
SELECT COUNT(*) AS desincronizados
  FROM "QuickMessages"
 WHERE COALESCE("geral", false) <> COALESCE("visao", false);

COMMIT;
