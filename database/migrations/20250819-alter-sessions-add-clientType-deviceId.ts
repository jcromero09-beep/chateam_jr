import { QueryInterface, DataTypes } from "sequelize";

/**
 * Idempotente: la migración 20250101000000-create-sessions-table ya crea las
 * columnas clientType, deviceId y lastSeenAt. Si por compatibilidad con bases
 * existentes ya migradas en orden distinto las columnas no existen, las
 * agregamos. Si existen, no hacemos nada. Mismo criterio para el índice.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDescription: Record<string, any> = await queryInterface
      .describeTable("Sessions")
      .catch(() => ({}));

    if (!tableDescription.clientType) {
      await queryInterface.addColumn("Sessions", "clientType", {
        type: DataTypes.ENUM("web", "app"),
        allowNull: false,
        defaultValue: "web"
      });
    }

    if (!tableDescription.deviceId) {
      await queryInterface.addColumn("Sessions", "deviceId", {
        type: DataTypes.STRING(128),
        allowNull: true
      });
    }

    if (!tableDescription.lastSeenAt) {
      await queryInterface.addColumn("Sessions", "lastSeenAt", {
        type: DataTypes.DATE,
        allowNull: true
      });
    }

    // Índice (userId, clientType) — crear sólo si no existe.
    try {
      const [indexes]: any = await queryInterface.sequelize.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'Sessions'`
      );
      const names: string[] = (indexes || []).map((r: any) => r.indexname);
      const targetName = "sessions_user_id_client_type";
      if (!names.includes(targetName)) {
        await queryInterface
          .addIndex("Sessions", ["userId", "clientType"], { name: targetName })
          .catch(() => undefined);
      }
    } catch {
      // Motores no Postgres: dejar que addIndex tire si ya existe; tragamos.
      await queryInterface
        .addIndex("Sessions", ["userId", "clientType"])
        .catch(() => undefined);
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // No-op intencional: la tabla la quita la migración original.
  }
};
