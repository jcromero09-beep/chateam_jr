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

@Table({ tableName: "FacebookDatasets" })
class FacebookDataset extends Model<FacebookDataset> {
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

    @Column(DataType.STRING)
    datasetId: string;

    @Column(DataType.STRING)
    channelSpecificId: string;

    @Column(DataType.STRING)
    channel: string;

    @Column(DataType.STRING)
    channelIdentifier: string;

    @Column(DataType.STRING)
    pixelId: string;

    @Column(DataType.ENUM("active", "inactive"))
    status: string;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

export default FacebookDataset;
