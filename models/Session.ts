import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    AllowNull,
    Default,
    ForeignKey,
    CreatedAt,
    UpdatedAt
  } from "sequelize-typescript";
  import User from "./User";
  
  export type ClientType = "web" | "app";
  
  @Table({ tableName: "Sessions" })
  export default class Session extends Model<Session> {
    @PrimaryKey
    @Column(DataType.STRING(36))
    declare id: string;
  
    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare userId: number;
  
    @AllowNull(false)
    @Column(DataType.STRING(128))
    declare refreshTokenHash: string;
  
    @Column(DataType.STRING(512))
    declare userAgent: string | null;
  
    @Column(DataType.STRING(64))
    declare ip: string | null;
  
    @AllowNull(false)
    @Default("web")
    @Column(DataType.ENUM("web", "app"))
    declare clientType: ClientType;
  
    @Column(DataType.STRING(128))
    declare deviceId: string | null;
  
    @Column(DataType.DATE)
    declare lastSeenAt: Date | null;

    // [Multi-empresa] Empresa activa de la sesión. La fija /switch-company y la lee
    // RefreshTokenService para que el switch SOBREVIVA a los refresh del token
    // (sin esto, un refresh vuelve a la empresa home del refresh token).
    @Column(DataType.INTEGER)
    declare activeCompanyId: number | null;
  
    @AllowNull(false)
    @Column(DataType.DATE)
    declare expiresAt: Date;
  
    @Column(DataType.DATE)
    declare revokedAt: Date | null;
  
    @CreatedAt
    declare createdAt: Date;
  
    @UpdatedAt
    declare updatedAt: Date;
  }
  