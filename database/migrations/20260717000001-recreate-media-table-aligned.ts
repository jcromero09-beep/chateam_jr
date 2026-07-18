import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Fase A.1 storage/media] Recrea la tabla `media` ALINEADA con models/Media.ts.
 *
 * Contexto: la migración previa 20250101000001-create-media-table.ts creaba una tabla
 * `Media` (mayúscula, camelCase, columnas incompletas) que NO coincide con el modelo,
 * que espera `media` (minúscula, snake_case, underscored:true) — mismo bug modelo≠tabla
 * que tumbó integraciones con 500. La tabla nunca llegó a existir en la BD (0 filas,
 * information_schema vacío), así que recrear es sin riesgo de pérdida de datos.
 *
 * ⚠️ NO EJECUTAR con `npm run db:migrate`: el runner está DESINCRONIZADO (32 registradas
 * en SequelizeMeta vs 384 archivos en disco) → intentaría aplicar ~352 migraciones y
 * romper la BD. Esta migración se aplica de forma QUIRÚRGICA (solo su `up`) o vía SQL
 * equivalente, y SOLO cuando se decida el object storage (Fase D) y se configuren las
 * env S3_* — cablear la ruta de media sin backend S3 daría endpoints que fallan al subir.
 *
 * FKs: apuntan a "Companies"/"Users" (nombres REALES en BD, con mayúscula), no a
 * companies/users en minúscula como declara el modelo (otro desajuste latente del
 * sistema muerto; aquí se corrige).
 *
 * Extra vs modelo: se añade `content_hash` (sha256) + índice (company_id, content_hash)
 * para habilitar la deduplicación de Fase B sin una segunda migración.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Limpia la tabla mal formada anterior si por algún medio llegó a existir.
    await queryInterface.dropTable("Media", { cascade: true }).catch(() => undefined);
    await queryInterface.dropTable("media", { cascade: true }).catch(() => undefined);

    await queryInterface.createTable("media", {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      original_name: { type: DataTypes.STRING(255), allowNull: false },
      filename: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: false },
      size_bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      // sha256 del contenido — clave de la deduplicación (Fase B). Nullable para
      // filas legadas migradas antes de calcular el hash.
      content_hash: { type: DataTypes.CHAR(64), allowNull: true },
      storage_provider: {
        type: DataTypes.ENUM("local", "s3", "minio"),
        allowNull: false,
        defaultValue: "s3",
      },
      storage_key: { type: DataTypes.TEXT, allowNull: false },
      storage_bucket: { type: DataTypes.STRING(100), allowNull: true },
      storage_region: { type: DataTypes.STRING(50), allowNull: true },
      url: { type: DataTypes.TEXT, allowNull: true },
      thumbnail_url: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM("active", "expired", "deleted", "processing"),
        allowNull: false,
        defaultValue: "active",
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      notified_at: { type: DataTypes.DATE, allowNull: true },
      references_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_legal_hold: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: true, defaultValue: [] },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });

    // Índices del modelo (models/Media.ts:373-398) + el de dedup.
    await queryInterface.addIndex("media", ["company_id"]);
    await queryInterface.addIndex("media", ["status"]);
    await queryInterface.addIndex("media", ["expires_at"]);
    await queryInterface.addIndex("media", ["storage_provider"]);
    await queryInterface.addIndex("media", ["is_legal_hold"]);
    await queryInterface.addIndex("media", ["uploaded_by"]);
    await queryInterface.addIndex("media", ["company_id", "status"]);
    await queryInterface.addIndex("media", ["expires_at", "is_legal_hold"]);
    // Dedup: buscar rápido si un contenido ya existe para una empresa.
    await queryInterface.addIndex("media", ["company_id", "content_hash"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("media", { cascade: true });
  },
};
