import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    Default,
    AutoIncrement,
    DataType
} from "sequelize-typescript";

@Table({ tableName: "ApiUsages" })
class ApiUsages extends Model<ApiUsages> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;

    @Default(0)
    @Column(DataType.INTEGER)
    companyId: number;

    @Default(null)
    @Column(DataType.STRING)
    dateUsed: string;

    @Default(0)
    @Column(DataType.INTEGER)
    usedOnDay: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedText: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedPDF: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedImage: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedVideo: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedOther: number;

    @Default(0)
    @Column(DataType.INTEGER)
    usedCheckNumber: number;

    // Nuevos campos para tracking de éxito/fallo
    @Default(0)
    @Column(DataType.INTEGER)
    successCount: number;

    @Default(0)
    @Column(DataType.INTEGER)
    failedCount: number;

    @Default(0)
    @Column(DataType.INTEGER)
    totalSent: number;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

export default ApiUsages;
