import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  AllowNull,
  Default,
  Unique,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";

export type MetaOfficialMcpStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "error";

@Table({ tableName: "MetaOfficialMcpConnections" })
class MetaOfficialMcpConnection extends Model<MetaOfficialMcpConnection> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Unique
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default("meta_official_mcp")
  @Column(DataType.STRING(40))
  provider: string;

  @Default("not_connected")
  @Column(DataType.STRING(20))
  status: MetaOfficialMcpStatus;

  @Default("https://mcp.facebook.com/ads")
  @Column(DataType.STRING(255))
  mcpServerUrl: string;

  // PKCE + OAuth state (válidos solo durante el flow OAuth)
  @AllowNull(true)
  @Column(DataType.STRING(128))
  oauthState: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  codeVerifier: string | null;

  // Tokens MCP — ALMACENADOS EN PLANO (cifrar AES-256 en V2 — ver SECURITY_DEBT.md)
  @AllowNull(true)
  @Column(DataType.TEXT)
  accessToken: string | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  refreshToken: string | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  expiresAt: Date | null;

  @Default([])
  @Column(DataType.JSONB)
  scopes: string[];

  @AllowNull(true)
  @Column(DataType.DATE)
  lastToolsListAt: Date | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastConnectedAt: Date | null;

  @AllowNull(true)
  @Column(DataType.TEXT)
  lastError: string | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default MetaOfficialMcpConnection;
