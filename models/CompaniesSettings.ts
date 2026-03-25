/** 
 * @TercioSantos-0 |
 * model/CompaniesSettings |
 * @descrição:modelo para tratar as configurações das empresas 
 */
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
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";


@Table({ tableName: "CompaniesSettings" })
class CompaniesSettings extends Model<CompaniesSettings> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING)
hoursCloseTicketsAuto: string;

  @Column(DataType.STRING)
chatBotType: string;

  @Column(DataType.STRING)
acceptCallWhatsapp: string;

  //inicio de opções: enabled ou disabled
  @Column(DataType.STRING)
userRandom: string; 

  @Column(DataType.STRING)
sendGreetingMessageOneQueues: string; 

  @Column(DataType.STRING)
sendSignMessage: string; 

  @Column(DataType.STRING)
sendFarewellWaitingTicket: string; 

  @Column(DataType.STRING)
userRating: string; 

  @Column(DataType.STRING)
sendGreetingAccepted: string; 

  @Column(DataType.STRING)
CheckMsgIsGroup: string; 

  @Column(DataType.STRING)
sendQueuePosition: string; 

  @Column(DataType.STRING)
scheduleType: string; 

  @Column(DataType.STRING)
acceptAudioMessageContact: string; 

  @Column(DataType.STRING)
sendMsgTransfTicket: string;

  @Column(DataType.STRING)
enableLGPD: string; 

  @Column(DataType.STRING)
requiredTag: string; 

  @Column(DataType.STRING)
lgpdDeleteMessage: string; 

  @Column(DataType.STRING)
lgpdHideNumber: string; 

  @Column(DataType.STRING)
lgpdConsent: string;

  @Column(DataType.STRING)
  lgpdLink: string;

  //fim de opções: enabled ou disabled
  @Column(DataType.STRING)
  lgpdMessage: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
DirectTicketsToWallets: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
closeTicketOnTransfer: boolean;

  @Default("")
  @Column(DataType.STRING)
  transferMessage: string;

  @Default("")
  @Column(DataType.STRING)
  greetingAcceptedMessage: string;

  @Default("")
  @Column(DataType.STRING)
  AcceptCallWhatsappMessage: string;

  @Default("")
  @Column(DataType.STRING)
  sendQueuePositionMessage: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  showNotificationPending: boolean;

  // Facebook/Instagram App Credentials
  @Column(DataType.STRING)
  facebookAppId: string;

  @Column(DataType.STRING)
  facebookAppSecret: string;

  @Column(DataType.STRING)
  instagramAppId: string;

  @Column(DataType.STRING)
  instagramAppSecret: string;

  // ═══════════════════════════════════════════════════════════════════
  // Facebook Ads Account Configuration (único por Company)
  // Permite conectar cada Company a una cuenta publicitaria diferente
  // dentro del mismo Business Portfolio
  // ═══════════════════════════════════════════════════════════════════

  @Column(DataType.STRING)
  facebookAdAccountId: string;       // act_123456789

  @Column(DataType.STRING)
  facebookBusinessId: string;        // 123456789 (Business Manager ID)

  @Column(DataType.TEXT)
  facebookSystemUserToken: string;   // Token con permisos: ads_read, ads_management, business_management

  // Marketing OAuth tracking
  @Column(DataType.STRING)
  facebookMarketingUserId: string;   // ID del usuario que conectó

  @Column(DataType.STRING)
  facebookMarketingUserName: string; // Nombre del usuario que conectó

  @Column(DataType.DATE)
  facebookMarketingConnectedAt: Date; // Fecha de conexión

  // Google Calendar OAuth Credentials (per company)
  @Column(DataType.STRING)
  googleClientId: string;

  @Column(DataType.STRING)
  googleClientSecret: string;

  // Theme Color Configuration
  @Default("#5BC2D2")
  @Column(DataType.STRING)
  themePrimaryLight: string;

  @Default("#6FD4E4")
  @Column(DataType.STRING)
  themePrimaryDark: string;

  @Default("#4caf50")
  @Column(DataType.STRING)
  themeSecondaryLight: string;

  @Default("#4caf50")
  @Column(DataType.STRING)
  themeSecondaryDark: string;

  @Default(300)
  @Column(DataType.INTEGER)
  aiCacheTTL: number;

  // ═══════════════════════════════════════════════════════════════════
  // Alerta WhatsApp al crear nueva empresa
  // ═══════════════════════════════════════════════════════════════════

  @Default("disabled")
  @Column(DataType.STRING)
  newCompanyAlertEnabled: string;

  @Column(DataType.STRING)
  newCompanyAlertPhone: string;  // Múltiples números separados por comas

  @Column(DataType.INTEGER)
  newCompanyAlertWhatsappId: number;

  // ═══════════════════════════════════════════════════════════════════
  // WhatsApp Cloud API / Coexistencia Meta (solo superadmin)
  // ═══════════════════════════════════════════════════════════════════

  @Default(false)
  @Column(DataType.BOOLEAN)
  cloudAPIEnabled: boolean;

  // ═══════════════════════════════════════════════════════════════════
  // TikTok Credentials (por Company)
  // Login Kit + Business API para comentarios
  // ═══════════════════════════════════════════════════════════════════

  @Column(DataType.STRING)
  tiktokClientKey: string;           // Login Kit App ID

  @Column(DataType.STRING)
  tiktokClientSecret: string;        // Login Kit App Secret

  @Column(DataType.STRING)
  tiktokBusinessAppId: string;       // Business API App ID

  @Column(DataType.STRING)
  tiktokBusinessSecret: string;      // Business API Secret

  // ═══════════════════════════════════════════════════════════════════
  // Google Drive Backup — OAuth + Tokens
  // ═══════════════════════════════════════════════════════════════════

  @Default(false)
  @Column(DataType.BOOLEAN)
  googleDriveEnabled: boolean;        // true cuando OAuth completada

  @Column(DataType.JSONB)
  googleDriveTokens: string;          // { access_token, refresh_token, expiry_date }

  @Column(DataType.DATE)
  lastDriveBackupAt: Date;            // última fecha de backup exitoso

  @Column(DataType.STRING)
  googleDriveFolderId: string;        // ID de la carpeta en Drive (creada por ensureDriveFolder)
}

export default CompaniesSettings;