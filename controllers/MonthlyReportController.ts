// [Fase2·Ola F · F4.1] Informe de cierre: HTML y PDF.
import { Request, Response } from "express";
import { buildReportHtml, buildReportPdf } from "../services/MonthlyReportService";
import { currentPeriod } from "../services/CampaignApprovalService";

export const html = async (req: Request, res: Response): Promise<void> => {
  try {
    let { companyId } = req.user;
    const isSuper = req.user?.super === true;
    const q = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (isSuper && q) companyId = q;
    const period = (req.query.period as string) || currentPeriod();
    res.status(200).type("html").send(await buildReportHtml(companyId, period));
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ success: false, message: e.message });
  }
};

export const pdf = async (req: Request, res: Response): Promise<void> => {
  try {
    let { companyId } = req.user;
    const isSuper = req.user?.super === true;
    const q = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (isSuper && q) companyId = q;
    const period = (req.query.period as string) || currentPeriod();
    const buf = await buildReportPdf(companyId, period);
    res.status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `attachment; filename="cierre-${period}.pdf"`)
      .send(buf);
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ success: false, message: e.message });
  }
};
