/**
 * ResolveStoppedFlowService — prepara el contexto que los tres canales necesitan
 * para reanudar un flow detenido (`ticket.flowStopped`).
 *
 * [Ola 3 verificabilidad] Segunda pieza unificada. `flowBuilderQueue` existe por
 * triplicado —wbot, meta y facebook— y las tres hacen lo mismo en este tramo:
 * cargar el FlowBuilderModel de `ticket.flowStopped`, sacar `nodes` y `connections`
 * de su columna `flow`, y montar `{number, name, email}` del contacto. Después cada
 * una llama a su propio ActionsWebhook*Service, que es lo que sí es del canal.
 *
 * ## Las guardas NO se unifican: se hacen explícitas
 *
 * Al comparar las tres aparecieron divergencias que NO son del canal, y esta firma
 * las obliga a declararse en la llamada en vez de esconderlas en el cuerpo:
 *
 *   | comprobación            | wbot | meta | facebook |
 *   |-------------------------|------|------|----------|
 *   | filtra `active: true`   | sí   | sí   | **no**   |
 *   | comprueba flow == null  | no   | sí   | **no**   |
 *   | guarda por status       | sí   | sí   | **no**   |
 *
 * Son tres arreglos que se hicieron en un canal y no se propagaron. Los dos primeros
 * son bugs latentes: sin `active` se reanudan flows desactivados, y sin el null-check
 * `flow.flow["nodes"]` lanza TypeError cuando el flow no existe — meta lo arregló,
 * wbot y facebook no.
 *
 * **Este servicio NO los corrige**: `requireActive` y `onMissing` reproducen la
 * conducta de cada llamante tal cual. Cambiarla es un cambio de conducta y necesita
 * su propia decisión y su propio test. Lo que cambia hoy es que la divergencia se ve
 * en la firma en lugar de estar escondida en tres cuerpos casi iguales.
 */
import { FlowBuilderModel } from "../../models/FlowBuilder";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { IConnections, INodes } from "./DispatchWebHookService";

export interface StoppedFlowContext {
  nodes: INodes[];
  connections: IConnections[];
  contactData: { number: string; name: string; email: string };
}

export const buildFlowContactData = (contact: Contact) => ({
  number: contact.number,
  name: contact.name,
  email: contact.email
});

export const resolveStoppedFlow = async (
  ticket: Ticket,
  contact: Contact,
  opts: {
    /** wbot y meta filtran por `active: true`; facebook no. */
    requireActive: boolean;
    /**
     * Qué hacer si no hay flow. `"null"` devuelve null (conducta de meta);
     * `"throw"` deja explotar el acceso a `flow.flow` como hoy en wbot y facebook.
     */
    onMissing: "null" | "throw";
  }
): Promise<StoppedFlowContext | null> => {
  const where: { id: string; active?: boolean } = { id: ticket.flowStopped };
  if (opts.requireActive) where.active = true;

  const flow = await FlowBuilderModel.findOne({ where });

  if (!flow) {
    if (opts.onMissing === "null") return null;
    // Conducta preservada: los llamantes que no comprobaban null accedían a
    // `flow.flow[...]` y lanzaban TypeError. Se lanza igual, pero con un mensaje
    // que dice qué pasó en vez de "Cannot read properties of null".
    throw new TypeError(
      `[resolveStoppedFlow] no hay flow ${ticket.flowStopped} ` +
        `(active=${opts.requireActive}) para el ticket ${ticket.id}`
    );
  }

  return {
    nodes: flow.flow["nodes"],
    connections: flow.flow["connections"],
    contactData: buildFlowContactData(contact)
  };
};

export default resolveStoppedFlow;
