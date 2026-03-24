/**
 * Model: AgentDevice
 * Represents a physical Android device in the device farm used
 * for automated social media interactions by agent identities.
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
import AgentIdentity from "./AgentIdentity";

// Estados posibles de un dispositivo del farm
export type AgentDeviceStatus = "online" | "offline" | "busy" | "cooldown" | "banned";

// Configuracion de proxy del dispositivo
export interface DeviceProxyConfig {
  type?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

// Huella digital del dispositivo para anti-deteccion
export interface DeviceFingerprint {
  userAgent?: string;
  screenRes?: string;
  language?: string;
  timezone?: string;
}

@Table({
  tableName: "AgentDevices",
  timestamps: true
})
class AgentDevice extends Model<AgentDevice> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_agent_devices_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @AllowNull(false)
  @Index("idx_agent_devices_device_id")
  @Column({
    type: DataType.STRING(255),
    unique: true
  })
  deviceId!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  name?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  model?: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  androidVersion?: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  ip?: string;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  proxyConfig!: DeviceProxyConfig;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  fingerprint!: DeviceFingerprint;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  simNumber?: string;

  @ForeignKey(() => AgentIdentity)
  @AllowNull(true)
  @Index("idx_agent_devices_identity")
  @Column(DataType.INTEGER)
  assignedIdentityId?: number;

  @Default("offline")
  @AllowNull(false)
  @Index("idx_agent_devices_status")
  @Column(DataType.STRING(50))
  status!: AgentDeviceStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastHeartbeat?: Date;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  dailyActionCount!: number;

  @Default(100)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  dailyActionLimit!: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  cooldownUntil?: Date;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => AgentIdentity, "assignedIdentityId")
  assignedIdentity?: AgentIdentity;

  // --- Metodos auxiliares ---

  isOnline(): boolean {
    return this.status === "online";
  }

  isAvailable(): boolean {
    return this.status === "online" && this.dailyActionCount < this.dailyActionLimit;
  }

  isBanned(): boolean {
    return this.status === "banned";
  }

  isInCooldown(): boolean {
    if (this.status !== "cooldown" || !this.cooldownUntil) return false;
    return new Date() < new Date(this.cooldownUntil);
  }

  async markOnline(ip?: string): Promise<void> {
    this.status = "online";
    this.lastHeartbeat = new Date();
    if (ip) this.ip = ip;
    await this.save();
  }

  async markOffline(): Promise<void> {
    this.status = "offline";
    await this.save();
  }

  async incrementActionCount(): Promise<void> {
    this.dailyActionCount += 1;
    if (this.dailyActionCount >= this.dailyActionLimit) {
      this.status = "cooldown";
      const cooldown = new Date();
      cooldown.setHours(cooldown.getHours() + 1);
      this.cooldownUntil = cooldown;
    }
    await this.save();
  }

  async resetDailyActions(): Promise<void> {
    this.dailyActionCount = 0;
    if (this.status === "cooldown") {
      this.status = "online";
      this.cooldownUntil = undefined;
    }
    await this.save();
  }
}

export default AgentDevice;
