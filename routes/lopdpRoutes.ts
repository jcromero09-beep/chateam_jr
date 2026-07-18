// [Fase2·N3 LOPDP] Rutas de consentimiento y supresión.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as Svc from "../services/FacebookConversionService/LopdpService";

const r = Router();
r.post("/lopdp/contacts/:id/consent", isAuth, async (req: any, res) => {
  try {
    const c = await Svc.setConsent(req.user.companyId, Number(req.params.id), req.body.consent);
    return res.status(200).json({ success: true, contact: c });
  } catch (e: any) { return res.status(e?.statusCode || 500).json({ success: false, message: e.message }); }
});
r.post("/lopdp/contacts/:id/erase", isAuth, async (req: any, res) => {
  try {
    const result = await Svc.eraseContact(req.user.companyId, Number(req.params.id));
    return res.status(200).json({ success: true, ...result });
  } catch (e: any) { return res.status(e?.statusCode || 500).json({ success: false, message: e.message }); }
});
export default r;
