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
    DataType,
    Index
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Message from "./Message";
import Ticket from "./Ticket";
import Whatsapp from "./Whatsapp";

/**
 * CampaignMessage - Almacena mensajes que provienen de campañas publicitarias
 * de Facebook, Instagram, WhatsApp (Click-to-WhatsApp Ads)
 *
 * Se crea DESPUÉS de crear el Message normal, vinculándolos por messageId
 */
@Table({ tableName: "CampaignMessages" })
class CampaignMessage extends Model<CampaignMessage> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;

    @ForeignKey(() => Company)
    @Column(DataType.INTEGER)
    companyId: number;

    @BelongsTo(() => Company)
    company: Company;

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

    @ForeignKey(() => Ticket)
    @Column(DataType.INTEGER)
    ticketId: number;

    @BelongsTo(() => Ticket)
    ticket: Ticket;

    @ForeignKey(() => Whatsapp)
    @Column(DataType.INTEGER)
    whatsappId: number;

    @BelongsTo(() => Whatsapp)
    whatsapp: Whatsapp;

    // ============================================
    // Datos de la campaña/anuncio
    // ============================================

    @Column(DataType.STRING)
    sourceId: string; // = ad_id

    @Column(DataType.STRING)
    sourceType: string;

    // [Fase2·C2.1] Cadena de atribución NORMALIZADA (antes solo en rawData JSON) →
    // consultable/agregable por SQL para ROAS por campaña/conjunto/anuncio.
    @Column(DataType.STRING)
    adName: string;

    @Index
    @Column(DataType.STRING)
    adSetId: string;

    @Column(DataType.STRING)
    adSetName: string;

    @Index
    @Column(DataType.STRING)
    campaignId: string;

    @Column(DataType.STRING)
    campaignName: string;

    @Column(DataType.TEXT)
    sourceUrl: string;

    @Column(DataType.STRING)
    headline: string;

    @Column(DataType.TEXT)
    body: string;

    @Index
    @Column(DataType.STRING)
    ctwaClid: string;

    @Column(DataType.TEXT)
    thumbnail: string;

    // ============================================
    // Metadata
    // ============================================

    @Column(DataType.STRING)
    channel: string;

    @Column(DataType.JSON)
    rawData: object;

    // ============================================
    // Conversión/Venta (llenado manual)
    // ============================================

    @Column(DataType.STRING)
    conversionNote: string;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

export default CampaignMessage;
