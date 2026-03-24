import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  Index,
  Unique
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";

@Table({
  tableName: "ContactTemperatures",
  timestamps: true
})
class ContactTemperature extends Model<ContactTemperature> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @ForeignKey(() => Contact)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  contactId!: number;

  @Default(0)
  @Column({
    type: DataType.FLOAT,
    allowNull: false,
    comment: "Escala 0-100 de temperatura del contacto"
  })
  temperature!: number;

  @Default("cold")
  @Column({
    type: DataType.ENUM("cold", "warm", "hot"),
    allowNull: false
  })
  category!: "cold" | "warm" | "hot";

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: "Última fecha de mensaje del contacto"
  })
  lastMessageAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
    comment: "Última fecha de ticket del contacto"
  })
  lastTicketAt!: Date;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: "Cantidad de mensajes en los últimos 30 días"
  })
  messageCount30d!: number;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: "Cantidad de tickets en los últimos 30 días"
  })
  ticketCount30d!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    comment: "Key del tag actual del contacto (attraction, hot-lead, etc.)"
  })
  tagKey!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Array de factores que influyeron en la temperatura"
  })
  reasons!: Record<string, number>[];

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
    comment: "Último recálculo de temperatura"
  })
  lastRecalculatedAt!: Date;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => Contact)
  contact!: Contact;
}

export default ContactTemperature;
