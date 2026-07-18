import { QueryInterface, DataTypes } from "sequelize";

/**
 * Metadatos de configuración para FacebookDatasets.
 *
 * BD SAGRADA: migración aditiva. No toca eventos ni datasets existentes.
 * Permite distinguir datasets manuales vs automáticos y mostrar un nombre claro
 * en UI sin depender de cómo Meta nombró el asset internamente.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("FacebookDatasets");

    const addIfMissing = async (
      name: string,
      definition: Parameters<QueryInterface["addColumn"]>[2]
    ) => {
      if (!columns[name]) {
        await queryInterface.addColumn("FacebookDatasets", name, definition);
        // eslint-disable-next-line no-console
        console.log(`✅ Columna ${name} agregada a FacebookDatasets`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`⏭️ Columna ${name} ya existe en FacebookDatasets, skip`);
      }
    };

    await addIfMissing("datasetName", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Nombre visible del dataset/pixel para administración"
    });

    await addIfMissing("datasetSource", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Origen de configuración: manual|auto|legacy"
    });

    await addIfMissing("validationStatus", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Estado de validación contra Meta: valid|failed|pending"
    });

    await addIfMissing("validationError", {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Último error al validar el dataset con Meta"
    });

    await addIfMissing("validatedAt", {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha de última validación exitosa contra Meta"
    });
  },

  down: async () => {
    // no-op intencional: no eliminamos metadatos de configuración en producción.
  }
};
