import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  BeforeCreate
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import Company from "./Company";
import Whatsapp from "./Whatsapp";
import Queue from "./Queue";

@Table({
  tableName: "WebChatWidgets",
  timestamps: true
})
class WebChatWidget extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING)
  name: string;

  // Conexión a usar
  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @Default("whatsapp")
  @Column(DataType.STRING)
  channel: string; // "whatsapp" | "telegram" | "facebook" | "instagram"

  // Configuración visual
  @Default("#2196F3")
  @Column(DataType.STRING)
  primaryColor: string;

  @Default("#FFC107")
  @Column(DataType.STRING)
  secondaryColor: string;

  @Default("bottom-right")
  @Column(DataType.STRING)
  position: string; // "bottom-right" | "bottom-left" | "top-right" | "top-left"

  @Default("medium")
  @Column(DataType.STRING)
  size: string; // "small" | "medium" | "large"

  @Default(16)
  @Column(DataType.INTEGER)
  borderRadius: number;

  // Mensajes
  @Default("¡Hola! ¿En qué podemos ayudarte hoy?")
  @Column(DataType.TEXT)
  welcomeMessage: string;

  @Default("Lo sentimos, estamos fuera de línea. Déjanos un mensaje y te responderemos pronto.")
  @Column(DataType.TEXT)
  offlineMessage: string;

  @Default("Escribe tu mensaje...")
  @Column(DataType.STRING)
  placeholderText: string;

  // Comportamiento
  @Default(false)
  @Column(DataType.BOOLEAN)
  autoOpen: boolean;

  @Default(3)
  @Column(DataType.INTEGER)
  autoOpenDelay: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  showAvatar: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  showAgentName: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  enableSound: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  enableFileUpload: boolean;

  // Horario
  @Default(false)
  @Column(DataType.BOOLEAN)
  workingHoursEnabled: boolean;

  @Column(DataType.STRING)
  workingHours: string; // "Lun-Vie: 9:00-18:00"

  @Default("America/Santiago")
  @Column(DataType.STRING)
  timezone: string;

  // Seguridad
  @Column(DataType.TEXT)
  allowedDomains: string; // JSON array de dominios permitidos

  @Column({
    type: DataType.STRING,
    unique: true
  })
  apiKey: string; // Para autenticar el widget

  // IA y Cola
  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  // CSS personalizado
  @Column(DataType.TEXT)
  customCSS: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  status: boolean;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @BelongsTo(() => Queue)
  queue: Queue;

  // Hook para generar apiKey automáticamente
  @BeforeCreate
  static generateApiKey(instance: WebChatWidget): void {
    if (!instance.apiKey) {
      instance.apiKey = `wgt_${uuidv4().replace(/-/g, "")}`;
    }
  }
}

export default WebChatWidget;
