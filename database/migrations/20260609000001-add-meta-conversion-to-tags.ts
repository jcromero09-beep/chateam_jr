import { QueryInterface, DataTypes } from "sequelize";

/**
 * Conversiones personalizadas Meta por etiqueta Kanban.
 *
 * Migración ADITIVA (BD SAGRADA): solo agrega columnas si no existen.
 * No toca datos existentes. `down()` es no-op para no perder histórico.
 *
 * Columnas:
 *  - sendMetaConversion     → check "Enviar conversión a Meta" (gate maestro)
 *  - metaConversionName     → nombre de la custom conversion en Meta
 *  - metaEventName          → evento base CAPI (ej: "Contact", "Lead", "Schedule")
 *  - metaLeadStatus         → lead_status enviado en custom_data (ej: "interest")
 *  - metaCustomEventType    → custom_event_type de Meta (ej: "CONTACT", "OTHER")
 *  - metaRule               → regla JSON que Meta evalúa para contar la conversión
 *  - metaCustomConversionId → ID de la custom conversion creada/reusada en Meta
 *  - metaConversionStatus   → estado de sincronización: pending|synced|failed|disabled
 *  - metaLastSyncAt         → última sincronización exitosa con Meta
 *  - metaLastError          → último error de Meta (texto)
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Tags");

    const addIfMissing = async (
      name: string,
      definition: Parameters<QueryInterface["addColumn"]>[2]
    ) => {
      if (!columns[name]) {
        await queryInterface.addColumn("Tags", name, definition);
        // eslint-disable-next-line no-console
        console.log(`✅ Columna ${name} agregada a Tags`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`⏭️ Columna ${name} ya existe en Tags, skip`);
      }
    };

    await addIfMissing("sendMetaConversion", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Si true, al caer un ticket en esta etapa se envía conversión a Meta"
    });
    await addIfMissing("metaConversionName", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Nombre de la custom conversion en Meta"
    });
    await addIfMissing("metaEventName", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Evento base CAPI enviado (ej: Contact, Lead, Schedule)"
    });
    await addIfMissing("metaLeadStatus", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "lead_status enviado en custom_data"
    });
    await addIfMissing("metaCustomEventType", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "custom_event_type de Meta (ej: CONTACT, OTHER)"
    });
    await addIfMissing("metaRule", {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Regla JSON que Meta evalúa para contar la conversión"
    });
    await addIfMissing("metaCustomConversionId", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "ID de la custom conversion creada/reusada en Meta"
    });
    await addIfMissing("metaConversionStatus", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Estado sync: pending|synced|failed|disabled"
    });
    await addIfMissing("metaLastSyncAt", {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Última sincronización exitosa con Meta"
    });
    await addIfMissing("metaLastError", {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Último error de Meta al sincronizar"
    });
  },

  // BD SAGRADA: no eliminamos columnas para no perder configuración histórica.
  down: async () => {
    // no-op intencional
  }
};
