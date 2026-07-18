// [Fase2·Ola F · F2.1] API de aprobación mensual (la consume el panel web y la app Flutter del día 25).
import { Request, Response } from "express";
import CampaignApproval from "../models/CampaignApproval";
import * as Svc from "../services/CampaignApprovalService";

const wrap = (fn: (req: Request, res: Response) => Promise<Response>) =>
  async (req: Request, res: Response) => {
    try { return await fn(req, res); }
    catch (e: any) { return res.status(e?.statusCode || 500).json({ success: false, message: e.message }); }
  };

export const getCurrent = wrap(async (req, res) => {
  const { companyId } = req.user;
  const pkg = await Svc.getOrCreatePackage(companyId, req.query.period as string | undefined);
  return res.status(200).json({ success: true, package: pkg });
});

export const list = wrap(async (req, res) => {
  const { companyId } = req.user;
  const rows = await CampaignApproval.findAll({ where: { companyId }, order: [["period", "DESC"]], limit: 24 });
  return res.status(200).json({ success: true, packages: rows });
});

export const setPieces = wrap(async (req, res) => {
  const { companyId } = req.user;
  const pkg = await Svc.getOrCreatePackage(companyId, req.body.period);
  pkg.pieces = req.body.pieces ?? pkg.pieces;
  if (req.body.title) pkg.title = req.body.title;
  await pkg.save();
  return res.status(200).json({ success: true, package: pkg });
});

export const submit = wrap(async (req, res) => {
  const { companyId } = req.user;
  return res.status(200).json({ success: true, package: await Svc.submit(companyId, Number(req.params.id)) });
});
export const approve = wrap(async (req, res) => {
  const { companyId, id: userId } = req.user;
  return res.status(200).json({ success: true, package: await Svc.approve(companyId, Number(req.params.id), userId) });
});
export const reject = wrap(async (req, res) => {
  const { companyId } = req.user;
  return res.status(200).json({ success: true, package: await Svc.reject(companyId, Number(req.params.id), req.body.feedback) });
});
export const requestRevision = wrap(async (req, res) => {
  const { companyId } = req.user;
  return res.status(200).json({ success: true, package: await Svc.requestRevision(companyId, Number(req.params.id), req.body.feedback) });
});
export const canLaunch = wrap(async (req, res) => {
  const { companyId } = req.user;
  return res.status(200).json({ success: true, ...(await Svc.canLaunch(companyId, req.query.period as string | undefined)) });
});
