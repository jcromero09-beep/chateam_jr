import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  HasMany,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  DataType
} from "sequelize-typescript";
import ContactCustomField from "./ContactCustomField";
import Ticket from "./Ticket";
import Company from "./Company";
import Schedule from "./Schedule";
import ContactTag from "./ContactTag";
import Tag from "./Tag";
import ContactWallet from "./ContactWallet";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Appointment from "./Appointments/Appointment";

@Table
class Contact extends Model<Contact> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @AllowNull(false)
  @Column(DataType.STRING)
  number: string;

  @AllowNull(false)
  @Default("")
  @Column(DataType.STRING)
  email: string;

  @Default("")
  @Column(DataType.STRING)
  profilePicUrl: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isGroup: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  disableBot: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  acceptAudioMessage: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  active: boolean;

  @Default("whatsapp")
  @Column(DataType.STRING)
  channel: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @HasMany(() => ContactCustomField)
  extraInfo: ContactCustomField[];

  @HasMany(() => ContactTag)
  contactTags: ContactTag[];

  @BelongsToMany(() => Tag, () => ContactTag)
  tags: Tag[];

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @HasMany(() => Schedule, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  schedules: Schedule[];

  @Column(DataType.STRING)
  remoteJid: string;

  @Column(DataType.DATE)
  lgpdAcceptedAt?: Date;

  @Column(DataType.BOOLEAN)
  pictureUpdated: boolean;

  @Column(DataType.STRING)
  get urlPicture(): string | null {
    if (this.getDataValue("urlPicture")) {

      return this.getDataValue("urlPicture") === 'nopicture.png' ? `${process.env.FRONTEND_URL}/nopicture.png` :
        `${process.env.BACKEND_URL}${process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : ""}/public/company${this.companyId}/contacts/${this.getDataValue("urlPicture")}`

    }
    return null;
  }

  @BelongsToMany(() => User, () => ContactWallet, "contactId", "walletId")
  wallets: ContactWallet[];

  @HasMany(() => ContactWallet)
  contactWallets: ContactWallet[];

  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @AllowNull(true)
  @Column(DataType.STRING)
  telegramUserId: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  tiktokUserId: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  phoneNumberId: string;

  // Address fields for Facebook Conversion API
  @AllowNull(true)
  @Column(DataType.STRING)
  city: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  state: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  country: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  zipcode: string;

  @Default({})
  @Column(DataType.JSON)
  metadata: Record<string, any>;

  // Appointments relation
  @HasMany(() => Appointment)
  appointments: Appointment[];
}

export default Contact;
