import * as Yup from "yup";

import AppError from "../../errors/AppError";
import ScheduledMessages from "../../models/ScheduledMessages";
import ShowService from "./ShowService";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";

interface ScheduleData {
  data_mensagem_programada: Date;
  id_conexao: string;
  intervalo: string;
  valor_intervalo: string;
  mensagem: string;
  tipo_dias_envio: string;
  mostrar_usuario_mensagem: string;
  criar_ticket: boolean;
  contatos: [];
  tags: [];
  companyId: number;
  nome: string;
  tipo_arquivo: string;
  usuario_envio: string;
  enviar_quantas_vezes: string;
  mediaName: string,
  mediaPath: string
}

interface Request {
  scheduleData: ScheduleData;
  id: string | number;
  // [2026-08-01 · IDOR] Mismo caso que TagServices: ShowService(id) sin companyId
  // busca el agendamiento SIN filtrar por empresa (Sequelize ignora un
  // `companyId: undefined` en el where). El controller ya lo tenía extraído.
  companyId: string | number;
  mediaPath: string | null,
  mediaName: string | null,
}

const UpdateUserService = async ({
  scheduleData,
  id,
  mediaPath,
  mediaName,
  companyId,
}: Request): Promise<ScheduledMessages | undefined> => {
  const schedule = await ShowService(id, companyId);

  const {
    data_mensagem_programada,
    id_conexao,
    intervalo,
    valor_intervalo,
    mensagem,
    tipo_dias_envio,
    mostrar_usuario_mensagem,
    criar_ticket,
    contatos,
    tags,
    nome,
    tipo_arquivo,
    usuario_envio,
    enviar_quantas_vezes,
  } = scheduleData;

  const data = {
    data_mensagem_programada,
    id_conexao,
    intervalo,
    valor_intervalo,
    mensagem,
    tipo_dias_envio,
    mostrar_usuario_mensagem,
    criar_ticket,
    contatos: String(contatos).split(','),
    tags: String(tags).split(','),
    nome,
    tipo_arquivo,
    usuario_envio: mostrar_usuario_mensagem == 'true' ? usuario_envio : null,
    enviar_quantas_vezes
  } as ScheduleData;


  if (!!mediaName && !!mediaPath) {
    data.mediaName = mediaName;
    data.mediaPath = mediaPath;
  }

  console.log(data);

  await schedule.update({
    ...data,
    mostrar_usuario_mensagem: data.mostrar_usuario_mensagem === 'true'
  } as any);

  await schedule.reload();
  return schedule;
};

export default UpdateUserService;
