/**
 * [Fase2·Ola F · F2.1/F3.1] Aprobación mensual de paquetes + gating de lanzamiento.
 *
 * Un paquete por (empresa, período YYYY-MM). El ciclo del calendario (F1.1):
 * borrador → submitted (día 20, plazo 48h) → approved/rejected/revision (día 25).
 * F3.1: no se puede lanzar una campaña si el paquete del mes no está aprobado.
 */
import CampaignApproval from "../models/CampaignApproval";
import AppError from "../errors/AppError";
import logger from "../utils/logger";

const PREFIX = "[CampaignApproval]";

export const currentPeriod = (d = new Date()): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const getOrCreatePackage = async (companyId: number, period?: string): Promise<CampaignApproval> => {
  const p = period || currentPeriod();
  const [pkg] = await CampaignApproval.findOrCreate({
    where: { companyId, period: p } as any,
    defaults: { companyId, period: p, status: "draft", title: `Paquete ${p}` } as any
  });
  return pkg;
};

/** ¿Puede lanzarse una campaña este período? (F3.1) */
export const canLaunch = async (
  companyId: number,
  period?: string
): Promise<{ allowed: boolean; reason?: string; status?: string; period: string }> => {
  const p = period || currentPeriod();
  const pkg = await CampaignApproval.findOne({ where: { companyId, period: p } as any });
  if (!pkg) {
    return { allowed: false, period: p, reason: `No hay paquete de aprobación para ${p}. Créalo y apruébalo antes de lanzar.` };
  }
  if (pkg.status !== "approved") {
    return { allowed: false, period: p, status: pkg.status, reason: `El paquete de ${p} está en estado "${pkg.status}", no aprobado. No se puede lanzar.` };
  }
  return { allowed: true, period: p, status: "approved" };
};

const act = async (
  companyId: number,
  id: number,
  fn: (pkg: CampaignApproval) => Promise<void>
): Promise<CampaignApproval> => {
  const pkg = await CampaignApproval.findOne({ where: { id, companyId } as any });
  if (!pkg) throw new AppError("ERR_APPROVAL_NOT_FOUND", 404);
  await fn(pkg);
  await pkg.reload();
  logger.info(`${PREFIX} company=${companyId} pkg=${id} -> ${pkg.status}`);
  return pkg;
};

export const submit = (companyId: number, id: number) => act(companyId, id, p => p.submit());
export const approve = (companyId: number, id: number, userId?: number) => act(companyId, id, p => p.approve(userId));
export const reject = (companyId: number, id: number, feedback: string) => {
  if (!feedback?.trim()) throw new AppError("ERR_APPROVAL_FEEDBACK_REQUIRED: un rechazo necesita comentario", 400);
  return act(companyId, id, p => p.reject(feedback));
};
export const requestRevision = (companyId: number, id: number, feedback: string) => {
  if (!feedback?.trim()) throw new AppError("ERR_APPROVAL_FEEDBACK_REQUIRED: pedir cambios necesita comentario", 400);
  return act(companyId, id, p => p.requestRevision(feedback));
};

export default { currentPeriod, getOrCreatePackage, canLaunch, submit, approve, reject, requestRevision };
