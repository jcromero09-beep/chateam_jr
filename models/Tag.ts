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

  @Column({
    type: DataType.STRING(10),
    defaultValue: "hours"
  })
  timeLaneUnit: string;

  @Column({
    type: DataType.TEXT,
  })
  description: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  followupEnabled: boolean;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 1
  })
  followupCount: number;

  @Column({
    type: DataType.TEXT,
  })
  followupMessage1: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 1
  })
  followupDelay1: number;

  @Column({
    type: DataType.TEXT,
  })
  followupMessage2: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 3
  })
  followupDelay2: number;

  @Column({
    type: DataType.TEXT,
  })
  followupMessage3: string;

  @Column({
    type: DataType.INTEGER,
    defaultValue: 4
  })
  followupDelay3: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 1"
  })
  aiGuidance1: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 2"
  })
  aiGuidance2: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Prompt de contexto IA para mensaje de seguimiento 3"
  })
  aiGuidance3: string;
}

export default Tag;
