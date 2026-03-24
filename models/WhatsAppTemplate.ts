/**
 * WhatsAppTemplate Model
 * Plantillas de mensajes para WhatsApp Business API (Meta)
 *
 * Las plantillas son requeridas para iniciar conversaciones fuera de la
 * ventana de 24 horas de servicio al cliente.
 */

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
  ForeignKey,
  BelongsTo,
  Unique
} from "sequelize-typescript";
import Company from "./Company";
import Whatsapp from "./Whatsapp";

// Categorías de plantillas según Meta
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

// Estados de aprobación de Meta
export type TemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";

// Tipos de encabezado
export type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

// Tipos de botones
export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

// Formato de parámetros (variables)
export type ParameterFormat = "named" | "positional";

// Parámetro con nombre para ejemplos
export interface NamedParam {
  param_name: string;
  example: string;
}

// Botón de plantilla (con ID automático generado)
export interface TemplateButton {
  id: string;              // ID automático: "btn_0_abc123"
  index: number;           // Índice del botón (0, 1, 2)
  type: ButtonType;
  text: string;            // Título del botón
  url?: string;            // URL para botones URL (puede contener {{1}}, {{2}}...)
  phoneNumber?: string;    // Teléfono para botones PHONE_NUMBER
  example?: string;        // Ejemplo de URL dinámica
}

// Helper: generar ID automático para botón
export const generateButtonId = (index: number): string => {
  const crypto = require('crypto');
  return `btn_${index}_${crypto.randomBytes(4).toString('hex')}`;
};

// Botón de plantilla (entrada del usuario en creación)
export interface TemplateButtonInput {
  type: ButtonType;
  text: string;
  url?: string;          // Para botones URL (puede contener {{1}}, {{2}}...)
  phoneNumber?: string;  // Para botones de teléfono
  example?: string;      // Ejemplo de URL dinámica
}

// Botón en formato Meta API (diferente a nuestro TemplateButton interno)
export interface MetaButton {
  type: "reply" | "url" | "phone_number" | "copy_code";
  reply?: {
    id: string;
    title: string;
  };
  url?: string;
  example?: string[];
  phone_number?: string;
  copy_code?: string;
}

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: HeaderType;
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];           // Para parámetros posicionales
    body_text_named_params?: NamedParam[];  // Para parámetros con nombre
    header_handle?: string[];
  };
  buttons?: TemplateButton[] | MetaButton[];  // Soporta ambos formatos
}

@Table({ tableName: "WhatsAppTemplates" })
class WhatsAppTemplate extends Model<WhatsAppTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  // Nombre único del template (solo minúsculas, números y guiones bajos)
  @AllowNull(false)
  @Column(DataType.STRING)
  name: string;

  // ID del template en Meta (asignado después de crear)
  @AllowNull(true)
  @Column(DataType.STRING)
  metaTemplateId: string;

  // Categoría de la plantilla
  @AllowNull(false)
  @Default("UTILITY")
  @Column(DataType.ENUM("MARKETING", "UTILITY", "AUTHENTICATION"))
  category: TemplateCategory;

  // Código de idioma (es, en, pt_BR, etc.)
  @AllowNull(false)
  @Default("es")
  @Column(DataType.STRING(10))
  language: string;

  // Formato de parámetros: named ({{nombre}}) o positional ({{1}})
  @AllowNull(false)
  @Default("positional")
  @Column(DataType.ENUM("named", "positional"))
  parameterFormat: ParameterFormat;

  // Estado de aprobación en Meta
  @AllowNull(false)
  @Default("PENDING")
  @Column(DataType.ENUM("PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"))
  status: TemplateStatus;

  // Razón del rechazo (si aplica)
  @AllowNull(true)
  @Column(DataType.TEXT)
  rejectedReason: string;

  // Tipo de encabezado
  @AllowNull(false)
  @Default("NONE")
  @Column(DataType.ENUM("NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"))
  headerType: HeaderType;

  // Contenido del encabezado (texto o URL del media)
  @AllowNull(true)
  @Column(DataType.TEXT)
  headerContent: string;

  // Handle del media en Meta (para imágenes/videos/docs pre-subidos)
  @AllowNull(true)
  @Column(DataType.STRING)
  headerMediaHandle: string;

  // Cuerpo del mensaje (contenido principal)
  @AllowNull(false)
  @Column(DataType.TEXT)
  bodyContent: string;

  // Pie de página (opcional, máx 60 caracteres)
  @AllowNull(true)
  @Column(DataType.STRING(60))
  footerContent: string;

  // Botones de la plantilla (JSON) - incluye ID automático generado
  @AllowNull(true)
  @Column(DataType.JSONB)
  buttons: TemplateButton[];

  // Número de variables en el template
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  variablesCount: number;

  // Ejemplos de variables posicionales (requerido por Meta para aprobación)
  @AllowNull(true)
  @Column(DataType.JSONB)
  variableExamples: string[];

  // Ejemplos de variables con nombre (para parameter_format: "named")
  @AllowNull(true)
  @Column(DataType.JSONB)
  namedVariableExamples: NamedParam[];

  // Componentes completos del template (formato Meta API)
  @AllowNull(true)
  @Column(DataType.JSONB)
  components: TemplateComponent[];

  // Contador de uso
  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  usageCount: number;

  // Última vez que se usó
  @AllowNull(true)
  @Column(DataType.DATE)
  lastUsedAt: Date;

  // Activo/Inactivo (control interno)
  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  // Relación con Company (multi-tenant)
  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  // Relación con Whatsapp (conexión específica, opcional)
  @ForeignKey(() => Whatsapp)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default WhatsAppTemplate;
