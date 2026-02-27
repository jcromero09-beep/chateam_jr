import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany
,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import ContactListItem from "./ContactListItem";

@Table({ tableName: "ContactLists" })
class ContactList extends Model<ContactList> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  // Acelle Mail fields
  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isEmailList: boolean;

  @Column(DataType.STRING)
  acelleListUid: string;

  @Column(DataType.STRING)
  fromEmail: string;

  @Column(DataType.STRING)
  fromName: string;

  @Column(DataType.STRING)
  contactCompany: string;

  @Column(DataType.STRING)
  contactState: string;

  @Column(DataType.STRING)
  contactAddress1: string;

  @Column(DataType.STRING)
  contactAddress2: string;

  @Column(DataType.STRING)
  contactCity: string;

  @Column(DataType.STRING)
  contactZip: string;

  @Column(DataType.STRING)
  contactPhone: string;

  @Column(DataType.STRING)
  contactCountryId: string;

  @Column(DataType.STRING)
  contactEmail: string;

  @Column(DataType.STRING)
  contactUrl: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  subscribeConfirmation: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  sendWelcomeEmail: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  unsubscribeNotification: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @HasMany(() => ContactListItem, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  contacts: ContactListItem[];
}

export default ContactList;
