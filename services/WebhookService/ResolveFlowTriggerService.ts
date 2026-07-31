/**
 * ResolveFlowTriggerService — decide QUÉ flow hay que disparar para un mensaje
 * entrante, según las cuatro prioridades del FlowBuilder.
 *
 * [Ola 3 verificabilidad] Tercera pieza unificada. `flowbuilderIntegration` existía
 * por triplicado y las versiones de **meta y facebook eran copias literales** la una
 * de la otra: mismas cuatro prioridades, mismos `where`, mismos argumentos, hasta los
 * mismos comentarios de sección. Lo único distinto era de dónde sale el body y a qué
 * `ActionsWebhook*Service` se llama.
 *
 * Este servicio resuelve; NO ejecuta. Devuelve un descriptor y cada canal lo pasa a
 * su propio servicio de ejecución, que es lo que sí es suyo.
 *
 * ## Las cuatro prioridades (conducta preservada, no rediseñada)
 *
 *   1. Palabra clave — alguna `FlowCampaign.phrase` de esa conexión aparece en el
 *      body (comparación normalizada: sin diacríticos, minúsculas, trim).
 *   2. Continuación — el ticket ya está dentro de un flujo (`flowWebhook`) y tiene
 *      `flowStopped` + `lastFlowId`.
 *   3. `flowIdWelcome` — hay ticket previo (`isFirstMsg` truthy).
 *   4. `flowIdNotPhrase` — no hay ticket previo.
 *
 * Solo se dispara UNO por mensaje: en cuanto una prioridad coincide se decide, aunque
 * su flow resulte no existir o estar inactivo. Ese matiz es conducta original y está
 * preservado: si la prioridad coincide pero el flow no aparece, se devuelve `null` y
 * el llamante sale — NO cae a la prioridad siguiente.
 *
 * ## Por qué wbot no usa esto (todavía)
 *
 * Su prioridad 2 tiene un sub-camino que los otros dos canales no tienen: si hay un
 * `WebhookModel` con `hash_id = ticket.hashFlowId`, continúa por ahí pasando
 * `dataWebhook`, `config.details` y `hashFlowId` a `ActionsWebhookService`, que
 * además recibe el `msg` de Baileys como argumento extra. Eso no es duplicación: es
 * una funcionalidad que solo existe en ese canal. Meterla aquí a la fuerza obligaría
 * a un descriptor con campos muertos para dos de los tres. Cuando se decida si esa
 * continuación por webhook debe existir en Meta y Facebook, este es el sitio.
 */
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { IConnections, INodes } from "./DispatchWebHookService";
import { buildFlowContactData } from "./ResolveStoppedFlowService";

/** Sin diacríticos, minúsculas y sin espacios en los extremos. */
export const normalizeFlowText = (text: string): string =>
  (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export interface FlowTrigger {
  prioridad: 1 | 2 | 3 | 4;
  /** Para el log del canal: "Palabra clave → hola", "Continuación flujo activo", … */
  motivo: string;
  flowId: number;
  nodes: INodes[];
  connections: IConnections[];
  /** Nodo por el que empieza: el primero del flow, salvo en la continuación. */
  startNodeId: string;
  /** Se pasa como `body` al servicio de ejecución. Solo la prioridad 2 lo usa. */
  bodyArg: string | null;
  contactData: { number: string; name: string; email: string };
}

export const resolveFlowTrigger = async (
  ticket: Ticket,
  whatsapp: Whatsapp,
  contact: Contact,
  body: string,
  isFirstMsg: Ticket | null | undefined
): Promise<FlowTrigger | null> => {
  const contactData = buildFlowContactData(contact);
  const bodyNorm = normalizeFlowText(body);

  const armar = (
    prioridad: FlowTrigger["prioridad"],
    motivo: string,
    flowId: number,
    flow: FlowBuilderModel,
    startNodeId: string,
    bodyArg: string | null
  ): FlowTrigger => ({
    prioridad,
    motivo,
    flowId,
    nodes: flow.flow["nodes"],
    connections: flow.flow["connections"],
    startNodeId,
    bodyArg,
    contactData
  });

  // ─── PRIORIDAD 1: palabra clave (FlowCampaign) ───
  const listPhrase = await FlowCampaignModel.findAll({
    where: { whatsappId: whatsapp.id }
  });
  const flowDispar = listPhrase.find(i =>
    bodyNorm.includes(normalizeFlowText(i.phrase))
  );

  if (flowDispar) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: flowDispar.flowId, active: true }
    });
    // Coincidió la prioridad: se decide aquí aunque el flow no exista.
    if (!flow) return null;
    return armar(
      1,
      `Palabra clave → ${flowDispar.phrase}`,
      flowDispar.flowId,
      flow,
      flow.flow["nodes"][0].id,
      null
    );
  }

  // ─── PRIORIDAD 2: continuación de flujo activo ───
  if (!!ticket.flowWebhook && ticket.flowStopped && ticket.lastFlowId) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: ticket.flowStopped, active: true }
    });
    if (!flow) return null;
    return armar(
      2,
      "Continuación flujo activo",
      parseInt(ticket.flowStopped),
      flow,
      String(ticket.lastFlowId),
      body
    );
  }

  // ─── PRIORIDAD 3: hay ticket previo → flowIdWelcome ───
  if (isFirstMsg && whatsapp.flowIdWelcome) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdWelcome, active: true }
    });
    if (!flow) return null;
    return armar(
      3,
      "Contacto con ticket → flowIdWelcome",
      whatsapp.flowIdWelcome,
      flow,
      flow.flow["nodes"][0].id,
      null
    );
  }

  // ─── PRIORIDAD 4: sin ticket previo → flowIdNotPhrase ───
  if (!isFirstMsg && whatsapp.flowIdNotPhrase) {
    const flow = await FlowBuilderModel.findOne({
      where: { id: whatsapp.flowIdNotPhrase, active: true }
    });
    if (!flow) return null;
    return armar(
      4,
      "Contacto NUEVO → flowIdNotPhrase",
      whatsapp.flowIdNotPhrase,
      flow,
      flow.flow["nodes"][0].id,
      null
    );
  }

  return null;
};

export default resolveFlowTrigger;
