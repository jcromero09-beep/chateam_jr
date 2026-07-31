import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface RefundAttributes {
  id: number;
  company_id: number;
  invoice_id: number;
  stripe_refund_id: string;
  stripe_charge_id: string;
  amount_cents: number;
  currency: string;
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'expired_uncaptured_charge' | 'other';
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  failure_reason?: string;
  description?: string;
  receipt_number?: string;
  refunded_by: number; // user_id
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

interface RefundCreationAttributes extends Optional<RefundAttributes,
  'id' | 'created_at' | 'updated_at'
> {}

class Refund extends Model<RefundAttributes, RefundCreationAttributes> implements RefundAttributes {
  public id!: number;
  public company_id!: number;
  public invoice_id!: number;
  public stripe_refund_id!: string;
  public stripe_charge_id!: string;
  public amount_cents!: number;
  public currency!: string;
  public reason!: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'expired_uncaptured_charge' | 'other';
  public status!: 'pending' | 'succeeded' | 'failed' | 'canceled';
  public failure_reason?: string;
  public description?: string;
  public receipt_number?: string;
  public refunded_by!: number;
  public metadata?: any;
  public created_at!: Date;
  public updated_at!: Date;

  // Métodos de instancia
  public isSuccessful(): boolean {
    return this.status === 'succeeded';
  }

  public getFormattedAmount(): string {
    const amount = this.amount_cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency.toUpperCase()
    }).format(amount);
  }

  public getReasonDescription(): string {
    const descriptions = {
      'duplicate': 'Duplicate charge',
      'fraudulent': 'Fraudulent transaction',
      'requested_by_customer': 'Customer requested refund',
      'expired_uncaptured_charge': 'Expired uncaptured charge',
      'other': 'Other reason'
    };
    return descriptions[this.reason] || 'Unknown reason';
  }
}

Refund.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  invoice_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'invoices',
      key: 'id'
    }
  },
  stripe_refund_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  stripe_charge_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'usd',
  },
  reason: {
    type: DataTypes.ENUM('duplicate', 'fraudulent', 'requested_by_customer', 'expired_uncaptured_charge', 'other'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'canceled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  receipt_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  refunded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  tableName: 'refunds',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['invoice_id'] },
    { fields: ['stripe_refund_id'] },
    { fields: ['stripe_charge_id'] },
    { fields: ['status'] },
    { fields: ['refunded_by'] },
  ]
});

export default Refund;