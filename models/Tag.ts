import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  BelongsToMany,
  ForeignKey,
  BelongsTo,
  HasMany
,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import TicketTag from "./TicketTag";
import Contact from "./Contact";
import ContactTag from "./ContactTag";

@Table
class Tag extends Model<Tag> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  color: string;

  @Column(DataType.STRING)
  key: string;

  @Column(DataType.INTEGER)
  kanban: number;

  @HasMany(() => TicketTag)
  ticketTags: TicketTag[];

  @BelongsToMany(() => Ticket, {
    through: () => TicketTag,
    foreignKey: 'tagId',
    otherKey: 'ticketId'
  })
  tickets: Ticket[];

  @BelongsToMany(() => Contact, () => ContactTag)
  contacts: Array<Contact & { ContactTag: ContactTag }>;

  @HasMany(() => ContactTag)
  contactTags: ContactTag[];

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column(DataType.INTEGER)
  timeLane: number;

	@Column(DataType.INTEGER)
  nextLaneId: number;
	
  @Column(DataType.STRING)
  greetingMessageLane: string;

  @Column(DataType.INTEGER)
  rollbackLaneId: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  enableFollowup: boolean;

  @Column({
    type: DataType.STRING,
    defaultValue: "multiple"
  })
  followupType: string;
}

export default Tag;
