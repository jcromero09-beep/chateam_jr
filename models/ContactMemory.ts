import {
  Table,
  Column,
  Model,
  PrimaryKey,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Ticket from "./Ticket";

export type MemoryType = "preference" | "fact" | "objection" | "interest" | "decision";

export interface ContactMemoryAttributes {
  id?: string;
  contactId: number;
  companyId: number;
  memoryType: MemoryType;
  content: string;
  embedding?: number[];
  confidence: number;
  sourceTicketId?: number;
  verified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastConfirmedAt?: Date;
}

@Table({
  tableName: "contact_memory",
  timestamps: true,
  createdAt: "createdAt",
  updatedAt: "updatedAt"
})
class ContactMemory extends Model<ContactMemoryAttributes> {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4
  })
  id!: string;

  @ForeignKey(() => Contact)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  contactId!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Index
  @Column({
    type: DataType.STRING(30),
    allowNull: false
  })
  memoryType!: MemoryType;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  content!: string;

  @Column({
    type: DataType.ARRAY(DataType.FLOAT),
    allowNull: true
  })
  embedding?: number[];

  @Default(1.0)
  @Column({
    type: DataType.FLOAT,
    allowNull: false
  })
  confidence!: number;

  @ForeignKey(() => Ticket)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  sourceTicketId?: number;

  @Default(true)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false
  })
  verified!: boolean;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  lastConfirmedAt?: Date;

  // Associations
  @BelongsTo(() => Contact)
  contact!: Contact;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => Ticket)
  ticket!: Ticket;
}

export default ContactMemory;
