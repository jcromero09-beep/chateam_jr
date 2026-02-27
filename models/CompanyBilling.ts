import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface CompanyBillingAttributes {
  id: number;
  company_id: number;
  stripe_customer_id: string;
  stripe_subscription_id?: string;
  stripe_price_id?: string;
  status: 'active' | 'inactive' | 'past_due' | 'canceled' | 'unpaid';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start?: Date;
  current_period_end?: Date;
  cancel_at_period_end: boolean;
  cancel_at?: Date;
  trial_start?: Date;
  trial_end?: Date;
  payment_method_id?: string;
  last_payment_date?: Date;
  next_payment_date?: Date;
  amount_cents: number;
  currency: string;
  tax_rate?: number;
  discount_percent?: number;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

interface CompanyBillingCreationAttributes extends Optional<CompanyBillingAttributes,
  'id' | 'cancel_at_period_end' | 'amount_cents' | 'currency' | 'created_at' | 'updated_at'
> {}

class CompanyBilling extends Model<CompanyBillingAttributes, CompanyBillingCreationAttributes> implements CompanyBillingAttributes {
  public id!: number;
  public company_id!: number;
  public stripe_customer_id!: string;
  public stripe_subscription_id?: string;
  public stripe_price_id?: string;
  public status!: 'active' | 'inactive' | 'past_due' | 'canceled' | 'unpaid';
  public billing_cycle!: 'monthly' | 'yearly';
  public current_period_start?: Date;
  public current_period_end?: Date;
  public cancel_at_period_end!: boolean;
  public cancel_at?: Date;
  public trial_start?: Date;
  public trial_end?: Date;
  public payment_method_id?: string;
  public last_payment_date?: Date;
  public next_payment_date?: Date;
  public amount_cents!: number;
  public currency!: string;
  public tax_rate?: number;
  public discount_percent?: number;
  public metadata?: any;
  public created_at!: Date;
  public updated_at!: Date;

  // Métodos de instancia
  public isActive(): boolean {
    return this.status === 'active';
  }

  public isInTrial(): boolean {
    if (!this.trial_end) return false;
    return new Date() < this.trial_end;
  }

  public daysUntilRenewal(): number {
    if (!this.current_period_end) return 0;
    const diff = this.current_period_end.getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  public getFormattedAmount(): string {
    const amount = this.amount_cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency.toUpperCase()
    }).format(amount);
  }
}

CompanyBilling.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  stripe_customer_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  stripe_subscription_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  stripe_price_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'past_due', 'canceled', 'unpaid'),
    allowNull: false,
    defaultValue: 'inactive',
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly',
  },
  current_period_start: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  current_period_end: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  cancel_at_period_end: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  cancel_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  trial_start: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  trial_end: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  payment_method_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  last_payment_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  next_payment_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'usd',
  },
  tax_rate: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: true,
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
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
  tableName: 'company_billing',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['stripe_customer_id'] },
    { fields: ['stripe_subscription_id'] },
    { fields: ['status'] },
    { fields: ['billing_cycle'] },
  ]
});

export default CompanyBilling;