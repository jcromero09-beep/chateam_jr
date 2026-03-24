import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    Default,
    AutoIncrement,
    DataType,
    BelongsTo,
    ForeignKey
} from "sequelize-typescript";
import Whatsapp from "./Whatsapp";

@Table({ tableName: "ApiFailedMessages" })
class ApiFailedMessage extends Model<ApiFailedMessage> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;

    @Default(0)
    @Column(DataType.INTEGER)
    companyId: number;

    @Default(null)
    @ForeignKey(() => Whatsapp)
    @Column(DataType.INTEGER)
    whatsappId: number;
    @BelongsTo(() => Whatsapp)
    whatsapp: Whatsapp;

    @Default(null)
    @Column(DataType.STRING)
    number: string;

    @Default(null)
    @Column(DataType.TEXT)
    message: string;

    @Default(null)
    @Column(DataType.TEXT)
    error: string;

    @Default(null)
    @Column(DataType.STRING)
    errorCode: string;

    @Default(null)
    @Column(DataType.STRING)
    errorSubcode: string;

    @Default(null)
    @Column(DataType.STRING)
    fbtraceId: string;

    @Default("pending")
    @Column(DataType.STRING)
    status: string; // pending, retried, failed

    @Default(0)
    @Column(DataType.INTEGER)
    retryCount: number;

    @Default(null)
    @Column(DataType.INTEGER)
    ticketId: number;

    @Default("send-template")
    @Column(DataType.STRING)
    endpoint: string; // send, send-template, send/linkImage

    @Default(null)
    @Column(DataType.JSONB)
    metadata: any; // Para guardar params, template_id, etc

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

export default ApiFailedMessage;
