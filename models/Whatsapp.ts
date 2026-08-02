import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  Unique,
  BelongsToMany,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Queue from "./Queue";
import Ticket from "./Ticket";
import WhatsappQueue from "./WhatsappQueue";
import Company from "./Company";
import QueueIntegrations from "./QueueIntegrations";
import { encryptSecret, decryptSecret, hashSecret } from "../helpers/secretCrypto"; // [Fase2·A3.1]
import Prompt from "./Prompt";
import { FlowBuilderModel } from "./FlowBuilder";

@Table
class Whatsapp extends Model<Whatsapp> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull
  @Unique
  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.TEXT)
  session: string;

  @Column(DataType.TEXT)
  qrcode: string;

  @Column(DataType.STRING)
  status: string;

  @Column(DataType.STRING)
  battery: string;

  @Column(DataType.BOOLEAN)
  plugged: boolean;

  @Column(DataType.INTEGER)
  retries: number;

  @Column(DataType.STRING)
  number: string;

  @Default("")
  @Column(DataType.TEXT)
  greetingMessage: string;

  @Column(DataType.STRING)
  greetingMediaAttachment: string;

  @Default("")
  @Column(DataType.TEXT)
  farewellMessage: string;

  @Default("")
  @Column(DataType.TEXT)
  complationMessage: string;

  @Default("")
  @Column(DataType.TEXT)
  outOfHoursMessage: string;

  @Column({ type: DataType.STRING, defaultValue: "stable" })
  provider: string;

  @Default(false)
  @AllowNull
  @Column(DataType.BOOLEAN)
  isDefault: boolean;

  @Default(false)
  @AllowNull
  @Column(DataType.BOOLEAN)
  allowGroup: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => WhatsappQueue)
  queues: Array<Queue & { WhatsappQueue: WhatsappQueue }>;

  @HasMany(() => WhatsappQueue)
  whatsappQueues: WhatsappQueue[];

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  // [W1-SEC-06] Cifrado transparente en reposo (la columna es TEXT en BD; el
  // cifrado cabe). Retrocompatible: lee plano legacy por passthrough.
  //
  // [2026-08-01] El setter mantiene además `tokenHash`. El cifrado usa IV aleatorio,
  // así que la columna cifrada NO se puede buscar por igualdad: cifrar el mismo token
  // dos veces da dos valores distintos. tokenAuth necesita encontrar la conexión a
  // partir del token que manda el cliente, y sin esta huella determinista no podía —
  // devolvía 403 a todo el mundo desde que se cifró el campo.
  @Column({
    type: DataType.TEXT,
    get() {
      return decryptSecret(this.getDataValue("token"));
    },
    set(value: string) {
      this.setDataValue("token", encryptSecret(value) as any);
      this.setDataValue("tokenHash", hashSecret(value));
    }
  })
  token: string;

  /**
   * HMAC-SHA256 del token, para buscarlo sin descifrar. Se mantiene solo, desde el
   * setter de `token`: no se asigna a mano en ningún sitio.
   *
   * Si aparece a null en una conexión que sí tiene token, es una fila anterior al
   * 2026-08-01 que no ha pasado por el backfill (scripts/backfillTokenHash.ts).
   */
  // Nullable de verdad: `hashSecret` devuelve null para un token vacío, y las filas
  // anteriores al backfill lo tienen a null. Declararlo `string` a secas obligaba a
  // castear en el setter, que es la forma de que el tipo mienta sin que nadie se
  // entere. (Ojo al redactar aquí: el trinquete de tipos cuenta TEXTO, así que
  // escribir el cast literalmente en un comentario lo pone en rojo.)
  @Column(DataType.STRING(64))
  tokenHash: string | null;

  @Column(DataType.TEXT)
  facebookUserId: string;

  // [W1-SEC-06] Cifrado transparente en reposo.
  @Column({
    type: DataType.TEXT,
    get() {
      return decryptSecret(this.getDataValue("facebookUserToken"));
    },
    set(value: string) {
      this.setDataValue("facebookUserToken", encryptSecret(value) as any);
    }
  })
  facebookUserToken: string;

  @Column(DataType.TEXT)
  facebookPageUserId: string;

  // Facebook Ads Account fields
  @Column(DataType.STRING)
  facebookAdAccountId: string;

  @Column(DataType.STRING)
  facebookBusinessId: string;

  // [Fase2·A3.1] Cifrado transparente en reposo (aes-256-gcm). El getter descifra
  // (passthrough si es texto plano legacy), el setter cifra. Ver helpers/secretCrypto.ts
  @Column({
    type: DataType.TEXT,
    get(this: Whatsapp) {
      return decryptSecret(this.getDataValue("tokenMeta"));
    },
    set(this: Whatsapp, value: string) {
      this.setDataValue("tokenMeta", encryptSecret(value) as any);
    }
  })
  tokenMeta: string;

  // [Fase2·A3.2] Expiración real del tokenMeta (de debug_token de Meta). Alerta a 7 días.
  @AllowNull(true)
  @Column(DataType.DATE)
  tokenMetaExpiresAt: Date;

  // Comentarios FB/IG — Page Access Token e IG Business Account
  // [W1-SEC-06] Cifrado transparente en reposo (AES-256-GCM), retrocompatible.
  @AllowNull(true)
  @Column({
    type: DataType.TEXT,
    get() {
      return decryptSecret(this.getDataValue("pageAccessToken"));
    },
    set(value: string) {
      this.setDataValue("pageAccessToken", encryptSecret(value) as any);
    }
  })
  pageAccessToken: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  instagramBusinessAccountId: string;

  @Column(DataType.TEXT)
  channel: string;

  @Default(3)
  @Column(DataType.INTEGER)
  maxUseBotQueues: number;

  @Default(0)
  @Column(DataType.STRING)
  timeUseBotQueues: string;

  @AllowNull(true)
  @Default(0)
  @Column(DataType.INTEGER)
  expiresTicket: number;

  @Default(0)
  @Column(DataType.INTEGER)
  timeSendQueue: number;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  sendIdQueue: number;

  @BelongsTo(() => Queue)
  queueSend: Queue;

  @Column(DataType.STRING)
  timeInactiveMessage: string;

  @Column(DataType.STRING)
  inactiveMessage: string;

  @Column(DataType.STRING)
  ratingMessage: string;

  /**
   * Override por conexión del switch global Settings.userRating.
   * null = heredar de Settings | true = forzar activo | false = forzar inactivo.
   */
  @Column(DataType.BOOLEAN)
  npsEnabled: boolean | null;

  /**
   * Override por conexión del switch global Settings.acceptAudioMessageContact.
   * null = heredar de Settings | true = aceptar audios | false = rechazar.
   */
  @Column(DataType.BOOLEAN)
  acceptAudio: boolean | null;

  /** Mensaje al cliente cuando se rechaza una llamada entrante. */
  @Default("")
  @Column(DataType.TEXT)
  callRejectMessage: string;

  /** Mensaje al cliente cuando la conexión no acepta audios. */
  @Default("")
  @Column(DataType.TEXT)
  rejectAudioMessage: string;

  @Column(DataType.INTEGER)
  maxUseBotQueuesNPS: number;

  @Column(DataType.INTEGER)
  expiresTicketNPS: number;

  @Column(DataType.STRING)
  whenExpiresTicket: string;

  @Column(DataType.STRING)
  expiresInactiveMessage: string;

  @Default("disabled")
  @Column(DataType.STRING)
  groupAsTicket: string;
  
  @Column(DataType.STRING)
  importOldMessages: string;

  @Column(DataType.STRING)
  importRecentMessages: string;

  @Column(DataType.STRING)
  statusImportMessages: string;
  
  @Column(DataType.BOOLEAN)
  closedTicketsPostImported:boolean;

  @Column(DataType.BOOLEAN)
  importOldMessagesGroups:boolean;

  @Column(DataType.INTEGER)
  timeCreateNewTicket: number;

  @ForeignKey(() => QueueIntegrations)
  @Column(DataType.INTEGER)
  integrationId: number;

  @BelongsTo(() => QueueIntegrations)
  queueIntegrations: QueueIntegrations;

  @Column({
    type: DataType.JSONB
  })
  schedules: any[];

  @ForeignKey(() => Prompt)
  @Column(DataType.INTEGER)
  promptId: number;

  @BelongsTo(() => Prompt)
  prompt: Prompt;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useAIOrchestrator: boolean;

  @Column(DataType.STRING)
  collectiveVacationMessage: string;

  @Column(DataType.STRING)
  collectiveVacationStart: string;

  @Column(DataType.STRING)
  collectiveVacationEnd: string;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueIdImportMessages: number;

  @BelongsTo(() => Queue)
  queueImport: Queue;

  @ForeignKey(() => FlowBuilderModel)
  @Column(DataType.INTEGER)
  flowIdNotPhrase: number;

  @ForeignKey(() => FlowBuilderModel)
  @Column(DataType.INTEGER)
  flowIdWelcome: number;

  @BelongsTo(() => FlowBuilderModel)
  flowBuilder: FlowBuilderModel;

  // Telegram Bot Fields
  @Column(DataType.STRING)
  botToken: string;

  @Column(DataType.STRING)
  webhookUrl: string;

  @Column(DataType.STRING)
  botUsername: string;

  // WhatsApp Cloud API / Meta Business fields
  @Column(DataType.STRING)
  phoneNumberId: string;

  @Column(DataType.STRING)
  displayPhoneNumber: string;

  // TikTok OAuth Fields (canal de comentarios)
  @AllowNull(true)
  @Column(DataType.TEXT)
  tiktokAccessToken: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  tiktokRefreshToken: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  tiktokOpenId: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  tiktokTokenExpiresAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  tiktokLastPollAt: Date;

  @AllowNull(true)
  @Default(true)
  @Column(DataType.BOOLEAN)
  tiktokPollingEnabled: boolean;

  // TikTok Business API Fields (por conexión)
  @AllowNull(true)
  @Default(120)
  @Column(DataType.INTEGER)
  tiktokPollingInterval: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  tiktokBusinessAccessToken: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  tiktokBusinessRefreshToken: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  tiktokBusinessAdvertiserId: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  tiktokBusinessTokenExpiresAt: Date;

  @AllowNull(true)
  @Default(false)
  @Column(DataType.BOOLEAN)
  tiktokBusinessConnected: boolean;

  // ===== Campos de Coexistencia Meta =====

  @AllowNull(true)
  @Default(false)
  @Column(DataType.BOOLEAN)
  coexistenceEnabled: boolean;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  coexistenceStatus: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  coexistenceOnboardedAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastAppOpenedAt: Date;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  embeddedSignupSessionId: string;

  // ===== Campos de Routing Configurable (Coexistencia) =====

  @AllowNull(true)
  @Default("both")
  @Column(DataType.STRING(20))
  receiveChannel: string;

  // Default "meta": cuando hay coexistencia, Meta Cloud API es el canal
  // principal de envío (UI y runtime coinciden). En conexiones SIN
  // coexistencia este valor es ignorado por OutboundRoutingService.
  @AllowNull(true)
  @Default("meta")
  @Column(DataType.STRING(20))
  sendChannel: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  linkedWhatsappId: number;
}

export default Whatsapp;
