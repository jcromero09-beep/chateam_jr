// [Fase3·N2.0] Modelo de Roles configurables por empresa.
// Presets del sistema (companyId=null, isSystem=true) sembrados por migración; una empresa puede
// clonarlos/editarlos. El acceso efectivo es doble filtro: permisos_del_plan ∩ permisos_del_rol.
// - unrestricted=true  => el rol no restringe (admin de empresa / super): el plan decide todo.
// - unrestricted=false => allow-list en `permissions` (InterfacePermissions); módulo ausente = denegado.
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
  Default,
  AllowNull,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "Roles" })
class Role extends Model<Role> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  // null => plantilla de sistema (preset global). Con valor => rol propio de la empresa.
  @ForeignKey(() => Company)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  companyId: number | null;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @Column(DataType.STRING)
  name: string;

  // slug estable: 'super_admin' | 'company_admin' | 'supervisor' | 'agent' | 'marketing' | ...
  @AllowNull(false)
  @Column(DataType.STRING)
  key: string;

  // preset del sistema no borrable (sí clonable/editable como copia).
  @Default(false)
  @Column(DataType.BOOLEAN)
  isSystem: boolean;

  // true => no restringe por rol (el plan manda). Para admin de empresa / super.
  @Default(false)
  @Column(DataType.BOOLEAN)
  unrestricted: boolean;

  // el admin de empresa puede ajustar módulos (dentro de lo que el plan compró).
  @Default(true)
  @Column(DataType.BOOLEAN)
  editable: boolean;

  // InterfacePermissions (mismo shape que Plan.interfacePermissions). Allow-list cuando unrestricted=false.
  @Default("{}")
  @Column(DataType.JSONB)
  permissions: object;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Role;
