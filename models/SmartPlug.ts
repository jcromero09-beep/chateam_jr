/**
 * Model: SmartPlug
 * Tomacorriente inteligente WiFi (TP-Link Tapo P100/P105/P110/P115) registrado
 * por una company. El pareo a la red WiFi lo hace el usuario final con la app
 * Tapo; aca guardamos la direccion resultante en la LAN y la credencial de la
 * cuenta Tapo para abrir la sesion local contra el dispositivo.
 *
 * La contrasena se cifra en reposo (AES-256-GCM) via getter/setter, igual que
 * los tokens de Whatsapp. Ver helpers/secretCrypto.ts
 */

import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  Index,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import { encryptSecret, decryptSecret } from "../helpers/secretCrypto";

// Estado de alcanzabilidad de la toma desde el backend.
// "unknown" = registrada pero todavia no consultada.
export type SmartPlugStatus = "unknown" | "online" | "offline" | "error";

// Fabricante soportado. Hoy solo Tapo; el campo existe para no tener que
// migrar la tabla cuando entre Tasmota/Shelly (ver spec, seccion "Extension").
export type SmartPlugVendor = "tapo";

// Lectura de consumo del P110/P115 (get_energy_usage). Los modelos sin
// medicion (P100/P105) devuelven null.
export interface SmartPlugEnergy {
  currentPowerMw?: number;
  todayEnergyWh?: number;
  monthEnergyWh?: number;
  todayRuntimeMin?: number;
  monthRuntimeMin?: number;
  readAt?: string;
}

@Table({
  tableName: "SmartPlugs",
  timestamps: true
})
class SmartPlug extends Model<SmartPlug> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_smart_plugs_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @BelongsTo(() => Company)
  company?: Company;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @Default("tapo")
  @AllowNull(false)
  @Column(DataType.STRING(50))
  vendor!: SmartPlugVendor;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  model?: string;

  // IP o hostname en la LAN donde vive la toma.
  @AllowNull(false)
  @Column(DataType.STRING(255))
  host!: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  macAddress?: string;

  // device_id reportado por el propio dispositivo.
  @AllowNull(true)
  @Column(DataType.STRING(255))
  vendorDeviceId?: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  tapoEmail!: string;

  // Cifrado transparente en reposo: el getter descifra (passthrough si es
  // texto plano legacy), el setter cifra.
  @AllowNull(false)
  @Column({
    type: DataType.TEXT,
    get() {
      return decryptSecret(this.getDataValue("tapoPassword"));
    },
    set(value: string) {
      this.setDataValue("tapoPassword", encryptSecret(value) as any);
    }
  })
  tapoPassword!: string;

  @Default("unknown")
  @AllowNull(false)
  @Index("idx_smart_plugs_company_status")
  @Column(DataType.STRING(20))
  status!: SmartPlugStatus;

  // Ultimo estado conocido del rele. null mientras no se haya consultado.
  @AllowNull(true)
  @Column(DataType.BOOLEAN)
  relayOn?: boolean;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastSeenAt?: Date;

  @AllowNull(true)
  @Column(DataType.TEXT)
  lastError?: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  lastEnergy?: SmartPlugEnergy;

  @Default({})
  @AllowNull(false)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  active!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  /**
   * Vista segura para respuestas HTTP: nunca expone la credencial Tapo.
   * Todo endpoint que devuelva una toma debe pasar por aca.
   */
  toSafeJSON(): Record<string, unknown> {
    return {
      id: this.id,
      companyId: this.companyId,
      name: this.name,
      vendor: this.vendor,
      model: this.model,
      host: this.host,
      macAddress: this.macAddress,
      vendorDeviceId: this.vendorDeviceId,
      tapoEmail: this.tapoEmail,
      status: this.status,
      relayOn: this.relayOn,
      lastSeenAt: this.lastSeenAt,
      lastError: this.lastError,
      lastEnergy: this.lastEnergy,
      metadata: this.metadata,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export default SmartPlug;
