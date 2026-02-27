import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    AllowNull,
    BelongsTo,
    DataType
} from "sequelize-typescript";
import Company from "./Company";
import Plan from "./Plan";

@Table({ tableName: "ApplePurchases" })
class ApplePurchase extends Model<ApplePurchase> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    declare id: number;

    @ForeignKey(() => Company)
    @Column(DataType.INTEGER)
    declare companyId: number;

    @BelongsTo(() => Company)
    declare company: Company;

    @ForeignKey(() => Plan)
    @Column(DataType.INTEGER)
    declare planId: number;

    @BelongsTo(() => Plan)
    declare plan: Plan;

    @Column(DataType.INTEGER)
    declare userId: number;

    @Column(DataType.STRING)
    declare transactionId: string;

    @Column(DataType.STRING)
    declare originalTransactionId: string;

    @Column(DataType.STRING)
    declare productId: string;

    @Column(DataType.STRING)
    declare bundleId: string;

    @AllowNull(true)
    @Column(DataType.TEXT)
    declare receiptData: string;

    @Column(DataType.STRING)
    declare platform: string;

    @Column(DataType.STRING)
    declare status: string; // 'verified', 'pending', 'failed', 'expired', 'refunded'

    @AllowNull(true)
    @Column(DataType.DATE)
    declare purchaseDate: Date;

    @AllowNull(true)
    @Column(DataType.DATE)
    declare expiresDate: Date;

    @AllowNull(true)
    @Column(DataType.DATE)
    declare verifiedAt: Date;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}

export default ApplePurchase;
