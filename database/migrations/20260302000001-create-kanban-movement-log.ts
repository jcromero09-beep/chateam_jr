import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Verificar si la tabla ya existe (idempotente)
    const tables = await queryInterface.showAllTables();
    if (tables.includes("KanbanMovementLogs")) {
      console.log("⏭️ Tabla KanbanMovementLogs ya existe, skip");
      return;
    }

    await queryInterface.createTable("KanbanMovementLogs", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fromTagId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Tag/etapa de origen (null si es primera asignación)",
      },
      toTagId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Tag/etapa de destino",
      },
      movedBy: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "system",
        comment: "Quién movió: system | user | ai",
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "ID del usuario si movedBy=user",
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Razón del movimiento (ej: timeLane expirado, clasificación IA)",
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: "Datos adicionales del movimiento",
      },
      aiConfidence: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: true,
        comment: "Confianza de la clasificación IA (0.0000-1.0000)",
      },
      aiModelUsed: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Modelo IA usado para la clasificación",
      },
      wasOverriddenByUser: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Si un usuario corrigió esta clasificación IA (<30min)",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    // Índices para consultas frecuentes
    await queryInterface.addIndex("KanbanMovementLogs", ["ticketId"], {
      name: "idx_kanban_movement_ticket",
    });

    await queryInterface.addIndex("KanbanMovementLogs", ["companyId", "createdAt"], {
      name: "idx_kanban_movement_company_date",
    });

    await queryInterface.addIndex("KanbanMovementLogs", ["movedBy"], {
      name: "idx_kanban_movement_moved_by",
    });

    console.log("✅ Tabla KanbanMovementLogs creada con índices");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("KanbanMovementLogs");
  },
};
