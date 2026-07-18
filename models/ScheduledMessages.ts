import { Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, DataType, BelongsTo, ForeignKey, HasMany, AllowNull, Default } from "sequelize-typescript";
import Contact from "./Contact";
import Tag from "./Tag";

@Table
class ScheduledMessages extends Model<ScheduledMessages> {
    
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;

    @Column(DataType.INTEGER)
    data_mensagem_programada: Date;

    @Column(DataType.STRING)
    id_conexao: string;

    @Column(DataType.STRING)
    intervalo: string;

    @Column(DataType.STRING)
    valor_intervalo: string;

    @Column(DataType.TEXT)
    mensagem: string;

    @Column(DataType.STRING)
    tipo_dias_envio: string;

    @Default(false)
    @Column(DataType.BOOLEAN)
    mostrar_usuario_mensagem: boolean;

    @Default(false)
    @Column(DataType.BOOLEAN)
    criar_ticket: boolean;

    @Column({ type: DataType.JSONB })
    contatos: string[];

    @Column({ type: DataType.JSONB })
    tags: string[];

    @Column(DataType.INTEGER)
    companyId: number;

    @Column(DataType.STRING)
    nome: string;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;

    @Column(DataType.STRING)
    mediaPath: string;

    @Column(DataType.STRING)
    mediaName: string;

    @Column(DataType.STRING)
    tipo_arquivo: string;

    @Column(DataType.STRING)
    usuario_envio: string;

    @Column(DataType.STRING)
    enviar_quantas_vezes: string;

    @Column(DataType.STRING)
    key: string;

    @Column(DataType.DATE)
    data_envio: Date;
}

export default ScheduledMessages;
