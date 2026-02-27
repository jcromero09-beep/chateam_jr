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
    DataType
} from "sequelize-typescript";
import Company from "./Company";
import Whatsapp from "./Whatsapp";
import Contact from "./Contact";
import Message from "./Message";
import Campaign from "./Campaign";

@Table({ tableName: "FacebookConversionEvents" })
class FacebookConversionEvent extends Model<FacebookConversionEvent> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;

    @ForeignKey(() => Company)
    @Column(DataType.INTEGER)
    companyId: number;

    @BelongsTo(() => Company)
    company: Company;

    @ForeignKey(() => Whatsapp)
    @Column(DataType.INTEGER)
    whatsappId: number;

    @BelongsTo(() => Whatsapp)
    whatsapp: Whatsapp;

    @ForeignKey(() => Contact)
    @Column(DataType.INTEGER)
    contactId: number;

    @BelongsTo(() => Contact)
    contact: Contact;

    @ForeignKey(() => Message)
    @Column(DataType.INTEGER)
    messageId: number;

    @BelongsTo(() => Message)
    message: Message;

    @ForeignKey(() => Campaign)
    @Column(DataType.INTEGER)
    campaignId: number;

    @BelongsTo(() => Campaign)
    campaign: Campaign;

    @Column(DataType.STRING)
    eventName: string;

    @Column(DataType.BIGINT)
    eventTime: number;

    @Column(DataType.TEXT)
    eventSourceUrl: string;

    @Column({ type: DataType.STRING, defaultValue: "chat" })
    actionSource: string;

    @Column(DataType.ENUM("whatsapp", "messenger", "instagram"))
    messagingChannel: string;

    @Column(DataType.STRING)
    ctwaClid: string;

    @Column(DataType.JSON)
    userData: object;

    @Column(DataType.JSON)
    customData: object;

    @Column(DataType.STRING)
    datasetId: string;

    @Column(DataType.STRING)
    facebookEventId: string;

    @Column({ type: DataType.ENUM("pending", "sent", "success", "failed"), defaultValue: "pending" })
    responseStatus: string;

    @Column(DataType.JSON)
    fbResponse: object;

    @Column(DataType.TEXT)
    errorMessage: string;

    @Column(DataType.DATE)
    sentAt: Date;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

export default FacebookConversionEvent;
