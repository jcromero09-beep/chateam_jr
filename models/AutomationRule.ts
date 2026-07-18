import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  AutoIncrement,
  DataType,
  Default
} from "sequelize-typescript";

import Company from "./Company";

// [Fase E] Motor de reglas de ticket (evento -> condiciones AND -> acciones). Ver spec/modules/automation-rules-spec.md
@Table({ tableName: "AutomationRules" })
class AutomationRule extends Model<AutomationRule> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  event: string; // ticket_created | ticket_status_updated | ticket_queue_updated

  @Column(DataType.JSONB)
  conditions: Array<{ field: string; op: string; value: any }>;

  @Column(DataType.JSONB)
  actions: Array<{ type: string; [k: string]: any }>;

  @Default(true)
  @Column(DataType.BOOLEAN)
  active: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  priority: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;
}

export default AutomationRule;
