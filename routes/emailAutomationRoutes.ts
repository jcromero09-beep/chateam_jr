import express from "express";
import isAuth from "../middleware/isAuth";

import * as EmailAutomationController from "../controllers/EmailAutomationController";
import * as EmailAbTestController from "../controllers/EmailAbTestController";

const emailAutomationRoutes = express.Router();

// ========== Email Automations ==========
emailAutomationRoutes.get("/email-automations", isAuth, EmailAutomationController.index);
emailAutomationRoutes.post("/email-automations", isAuth, EmailAutomationController.store);
emailAutomationRoutes.get("/email-automations/:id", isAuth, EmailAutomationController.show);
emailAutomationRoutes.put("/email-automations/:id", isAuth, EmailAutomationController.update);
emailAutomationRoutes.delete("/email-automations/:id", isAuth, EmailAutomationController.remove);
emailAutomationRoutes.post("/email-automations/:id/activate", isAuth, EmailAutomationController.activate);
emailAutomationRoutes.post("/email-automations/:id/pause", isAuth, EmailAutomationController.pause);
emailAutomationRoutes.get("/email-automations/:id/stats", isAuth, EmailAutomationController.stats);

// ========== Email A/B Tests ==========
emailAutomationRoutes.get("/email-ab-tests", isAuth, EmailAbTestController.index);
emailAutomationRoutes.post("/email-ab-tests", isAuth, EmailAbTestController.store);
emailAutomationRoutes.get("/email-ab-tests/:id", isAuth, EmailAbTestController.show);
emailAutomationRoutes.post("/email-ab-tests/:id/start", isAuth, EmailAbTestController.start);
emailAutomationRoutes.post("/email-ab-tests/:id/declare-winner", isAuth, EmailAbTestController.declareWinner);
emailAutomationRoutes.delete("/email-ab-tests/:id", isAuth, EmailAbTestController.remove);

// ========== Email Segmentation ==========
// Los endpoints de segmentacion usan lazy import del servicio
emailAutomationRoutes.get("/email-segments/stats", isAuth, async (req, res) => {
  const { companyId } = req.user;
  try {
    const { getSegmentStats } = require("../services/EmailMarketing/SegmentationService");
    const stats = await getSegmentStats(Number(companyId));
    return res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error al obtener segmentos" });
  }
});

emailAutomationRoutes.get("/email-segments/query", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const {
    minOpenRate, maxOpenRate,
    minClickRate, maxClickRate,
    inactiveDays, activeDays,
    minBounces, maxBounces,
    contactListId,
    createdAfter, createdBefore
  } = req.query;

  try {
    const { buildCustomSegment } = require("../services/EmailMarketing/SegmentationService");

    const criteria: Record<string, unknown> = {};
    if (minOpenRate) criteria.minOpenRate = Number(minOpenRate);
    if (maxOpenRate) criteria.maxOpenRate = Number(maxOpenRate);
    if (minClickRate) criteria.minClickRate = Number(minClickRate);
    if (maxClickRate) criteria.maxClickRate = Number(maxClickRate);
    if (inactiveDays) criteria.inactiveDays = Number(inactiveDays);
    if (activeDays) criteria.activeDays = Number(activeDays);
    if (minBounces) criteria.minBounces = Number(minBounces);
    if (maxBounces) criteria.maxBounces = Number(maxBounces);
    if (contactListId) criteria.contactListId = Number(contactListId);
    if (createdAfter) criteria.createdAfter = String(createdAfter);
    if (createdBefore) criteria.createdBefore = String(createdBefore);

    const result = await buildCustomSegment(Number(companyId), criteria);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Error en query de segmentos" });
  }
});

// Segmentos predefinidos
emailAutomationRoutes.get("/email-segments/engaged", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const { minOpenRate = "30" } = req.query;
  try {
    const { getEngagedContacts } = require("../services/EmailMarketing/SegmentationService");
    const result = await getEngagedContacts(Number(companyId), Number(minOpenRate));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

emailAutomationRoutes.get("/email-segments/cold", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const { inactiveDays = "30" } = req.query;
  try {
    const { getColdContacts } = require("../services/EmailMarketing/SegmentationService");
    const result = await getColdContacts(Number(companyId), Number(inactiveDays));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

emailAutomationRoutes.get("/email-segments/hot", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const { minClickRate = "10" } = req.query;
  try {
    const { getHotContacts } = require("../services/EmailMarketing/SegmentationService");
    const result = await getHotContacts(Number(companyId), Number(minClickRate));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

emailAutomationRoutes.get("/email-segments/new", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const { daysNew = "7" } = req.query;
  try {
    const { getNewContacts } = require("../services/EmailMarketing/SegmentationService");
    const result = await getNewContacts(Number(companyId), Number(daysNew));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

emailAutomationRoutes.get("/email-segments/bounced", isAuth, async (req, res) => {
  const { companyId } = req.user;
  const { minBounces = "1" } = req.query;
  try {
    const { getBouncedContacts } = require("../services/EmailMarketing/SegmentationService");
    const result = await getBouncedContacts(Number(companyId), Number(minBounces));
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default emailAutomationRoutes;
