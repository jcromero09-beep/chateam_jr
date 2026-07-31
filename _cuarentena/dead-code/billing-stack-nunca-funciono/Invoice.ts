import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface InvoiceAttributes {
  id: number;
  company_id: number;
  stripe_invoice_id: string;
  stripe_subscription_id?: string;
  invoice_number: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amount_due_cents: number;
  amount_paid_cents: number;
  amount_remaining_cents: number;
  currency: string;
  description?: string;
  invoice_pdf_url?: string;
  hosted_invoice_url?: string;
  payment_intent_id?: string;
  period_start?: Date;
  period_end?: Date;
  due_date?: Date;
  paid_at?: Date;
  voided_at?: Date;
  attempt_count: number;
  next_payment_attempt?: Date;
  billing_reason?: string;
  tax_amount_cents?: number;
  discount_amount_cents?: number;
  subtotal_cents: number;
  total_cents: number;
  metadata?: any;
  paymentMethod?: string;
  paypalOrderId?: string;
  created_at: Date;
  updated_at: Date;
}

interface InvoiceCreationAttributes extends Optional<InvoiceAttributes,
  'id' | 'attempt_count' | 'subtotal_cents' | 'total_cents' | 'created_at' | 'updated_at'
> {}

class Invoice extends Model<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  public id!: number;
  public company_id!: number;
  public stripe_invoice_id!: string;
  public stripe_subscription_id?: string;
  public invoice_number!: string;
  public status!: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  public amount_due_cents!: number;
  public amount_paid_cents!: number;
  public amount_remaining_cents!: number;
  public currency!: string;
  public description?: string;
  public invoice_pdf_url?: string;
  public hosted_invoice_url?: string;
  public payment_intent_id?: string;
  public period_start?: Date;
  public period_end?: Date;
  public due_date?: Date;
  public paid_at?: Date;
  public voided_at?: Date;
  public attempt_count!: number;
  public next_payment_attempt?: Date;
  public billing_reason?: string;
  public tax_amount_cents?: number;
  public discount_amount_cents?: number;
  public subtotal_cents!: number;
  public total_cents!: number;
  public metadata?: any;
  public paymentMethod?: string;
  public paypalOrderId?: string;
  public created_at!: Date;
  public updated_at!: Date;

  // Métodos de instancia
  public isPaid(): boolean {
    return this.status === 'paid';
  }

  public isOverdue(): boolean {
    if (!this.due_date || this.isPaid()) return false;
    return new Date() > this.due_date;
  }

  public getFormattedAmount(): string {
    const amount = this.total_cents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency.toUpperCase()
    }).format(amount);
  }

  public getDaysOverdue(): number {
    if (!this.isOverdue()) return 0;
    const diff = new Date().getTime() - this.due_date!.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}

Invoice.init({
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
  stripe_invoice_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  stripe_subscription_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  invoice_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'),
    allowNull: false,
    defaultValue: 'open',
  },
  amount_due_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount_paid_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  amount_remaining_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'usd',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  invoice_pdf_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  hosted_invoice_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  payment_intent_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  period_start: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  period_end: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  due_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  voided_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  attempt_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  next_payment_attempt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  billing_reason: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  tax_amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  discount_amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  subtotal_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  total_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  paypalOrderId: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
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
  tableName: 'invoices',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['stripe_invoice_id'] },
    { fields: ['stripe_subscription_id'] },
    { fields: ['status'] },
    { fields: ['due_date'] },
    { fields: ['paid_at'] },
  ]
});

export default Invoice;