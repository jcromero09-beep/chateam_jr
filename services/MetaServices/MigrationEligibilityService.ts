/**
 * MigrationEligibilityService — Verifica si una conexión Baileys puede migrar a Meta Coexistencia
 *
 * Verifica:
 * 1. La conexión existe y es Baileys (provider: "stable")
 * 2. El número está identificado
 * 3. Cuenta de tickets activos que serán afectados
 * 4. No hay otra migración en curso
 * 5. No existe ya una conexión Meta con el mismo número
 */
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import { Op } from "sequelize";
import logger from "../../utils/logger";

export interface EligibilityResult {
  eligible: boolean;
  whatsappId: number;
  connectionName: string;
  phoneNumber: string | null;
  provider: string;
  channel: string;
  status: string;
  reasons: string[];
  warnings: string[];
  ticketSummary: {
    open: number;
    pending: number;
    closed: number;
    total: number;
  };
  existingMetaConnection: {
    exists: boolean;
    id?: number;
    name?: string;
    status?: string;
  };
}

const MigrationEligibilityService = async (
  whatsappId: number,
  companyId: number
): Promise<EligibilityResult> => {
  logger.info(`[MigrationEligibility] Verificando elegibilidad para Whatsapp #${whatsappId}, company ${companyId}`);

  const reasons: string[] = [];
  const warnings: string[] = [];
  let eligible = true;

  // 1. Buscar la conexión
  const whatsapp = await Whatsapp.findOne({
    where: { id: whatsappId, companyId },
  });

  if (!whatsapp) {
    return {
      eligible: false,
      whatsappId,
      connectionName: "",
      phoneNumber: null,
      provider: "",
      channel: "",
      status: "",
      reasons: ["Conexion no encontrada o no pertenece a esta empresa"],
      warnings: [],
      ticketSummary: { open: 0, pending: 0, closed: 0, total: 0 },
      existingMetaConnection: { exists: false },
    };
  }

  // 2. Verificar que sea Baileys
  if (whatsapp.provider !== "stable" || whatsapp.channel !== "whatsapp") {
    eligible = false;
    reasons.push(
      `La conexion usa provider="${whatsapp.provider}", channel="${whatsapp.channel}". Solo se pueden migrar conexiones Baileys (provider="stable", channel="whatsapp").`
    );
  }

  // 3. Verificar que el número esté identificado
  if (!whatsapp.number) {
    eligible = false;
    reasons.push("La conexion no tiene un numero de telefono identificado. Debe estar conectada al menos una vez.");
  }

  // 4. Verificar que no esté en proceso de migración
  if (whatsapp.coexistenceStatus === "migrating") {
    eligible = false;
    reasons.push("Ya hay una migracion en curso para esta conexion.");
  }

  if (whatsapp.coexistenceStatus === "migrated") {
    eligible = false;
    reasons.push("Esta conexion ya fue migrada a Meta Coexistencia.");
  }

  // 5. Verificar que esté conectada o al menos tenga sesión
  if (whatsapp.status === "OPENING" || whatsapp.status === "PAIRING") {
    warnings.push("La conexion esta en proceso de conexion. Se recomienda esperar a que se estabilice.");
  }

  // 6. Contar tickets afectados
  const [openCount, pendingCount, closedCount] = await Promise.all([
    Ticket.count({ where: { whatsappId, companyId, status: "open" } }),
    Ticket.count({ where: { whatsappId, companyId, status: "pending" } }),
    Ticket.count({ where: { whatsappId, companyId, status: "closed" } }),
  ]);

  const totalTickets = openCount + pendingCount + closedCount;

  if (openCount > 0) {
    warnings.push(
      `Hay ${openCount} ticket(s) abiertos en esta conexion. Seran reasignados a la nueva conexion Meta.`
    );
  }

  if (pendingCount > 0) {
    warnings.push(
      `Hay ${pendingCount} ticket(s) pendientes. Seran reasignados automaticamente.`
    );
  }

  // 7. Verificar si ya existe conexión Meta con el mismo número
  const existingMeta = whatsapp.number
    ? await Whatsapp.findOne({
        where: {
          companyId,
          number: whatsapp.number,
          provider: "meta",
          channel: "meta",
          id: { [Op.ne]: whatsappId },
        },
      })
    : null;

  const existingMetaConnection = existingMeta
    ? {
        exists: true,
        id: existingMeta.id,
        name: existingMeta.name,
        status: existingMeta.status,
      }
    : { exists: false };

  if (existingMeta) {
    warnings.push(
      `Ya existe una conexion Meta (#${existingMeta.id} "${existingMeta.name}") con el mismo numero. Los tickets se migraran a esa conexion existente.`
    );
  }

  // 8. Advertencia sobre cooldown
  warnings.push(
    "Importante: Si este numero tuvo un WABA previo, puede haber un periodo de cooldown de 1-2 meses antes de poder registrar el Embedded Signup."
  );

  return {
    eligible,
    whatsappId,
    connectionName: whatsapp.name,
    phoneNumber: whatsapp.number,
    provider: whatsapp.provider || "stable",
    channel: whatsapp.channel || "whatsapp",
    status: whatsapp.status,
    reasons,
    warnings,
    ticketSummary: {
      open: openCount,
      pending: pendingCount,
      closed: closedCount,
      total: totalTickets,
    },
    existingMetaConnection,
  };
};

export default MigrationEligibilityService;
