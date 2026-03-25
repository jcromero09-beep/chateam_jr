/**
 * MetaMessageEditService — Editar mensaje vía Meta Cloud API
 *
 * Comportamiento: Meta Cloud API NO soporta edicion real de mensajes.
 * Esta funcion es un placeholder que retorna vacio.
 * La marca real en BD la hace el caller (EditWhatsAppMessage).
 */

interface EditMetaMessageRequest {
  messageId: string | number;
  companyId: number;
  newBody: string;
}

export default async function MetaMessageEditService({
  messageId,
  companyId,
  newBody
}: EditMetaMessageRequest): Promise<void> {
  console.log(`[MetaMessageEditService] Marcando mensaje ${messageId} como editado para companyId ${companyId} (Meta — sin llamada real a API de Meta)`);
  return;
}
