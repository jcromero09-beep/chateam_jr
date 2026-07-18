/**
 * MetaMessageDeleteService — Eliminar mensaje vía Meta Cloud API
 *
 * Comportamiento: Meta Cloud API NO soporta eliminacion real de mensajes.
 * Esta funcion es un placeholder que retorna vacio.
 * La marca real en BD la hace el caller (DeleteWhatsAppMessage).
 * Solo verificamos que el messageId sea valido para logs.
 */

interface DeleteMetaMessageRequest {
  messageId: string | number;
  companyId: number;
}

export default async function MetaMessageDeleteService({
  messageId,
  companyId
}: DeleteMetaMessageRequest): Promise<void> {
  console.log(`[MetaMessageDeleteService] Marcando mensaje ${messageId} como eliminado para companyId ${companyId} (Meta — sin llamada real a API de Meta)`);
  return;
}
