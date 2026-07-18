import { Router } from "express";
import * as FacebookConversionController from "../controllers/FacebookConversionController";
import isAuth from "../middleware/isAuth";

const router = Router();

router.get(
    "/facebook-conversions/policies",
    isAuth,
    FacebookConversionController.getConversionPolicies
);

router.put(
    "/facebook-conversions/policies",
    isAuth,
    FacebookConversionController.upsertConversionPolicy
);

// Send conversion event (legacy — mantenido para retrocompatibilidad)
router.post(
    "/facebook-conversions/send",
    isAuth,
    FacebookConversionController.sendConversion
);

// Enviar TODAS las conversiones Purchase pendientes (con valor). ?dryRun=true solo cuenta.
router.post(
    "/facebook-conversions/send-all-pending",
    isAuth,
    FacebookConversionController.sendAllPending
);

// Track conversion event (unificado: CompleteRegistration | StartTrial | Purchase | Login)
router.post(
    "/facebook-conversions/track",
    isAuth,
    FacebookConversionController.trackEvent
);

// Estado de eventos enviados por contactId / campaignMessageId
router.get(
    "/facebook-conversions/tracked-events",
    isAuth,
    FacebookConversionController.getTrackedEvents
);

// Send test conversion event
router.post(
    "/facebook-conversions/test",
    isAuth,
    FacebookConversionController.sendTestConversion
);

// Get conversion events for a company
router.get(
    "/facebook-conversions/events",
    isAuth,
    FacebookConversionController.getConversionEvents
);

// Get conversion statistics
router.get(
    "/facebook-conversions/stats",
    isAuth,
    FacebookConversionController.getConversionStats
);

// Sync all datasets
router.post(
    "/facebook-conversions/sync-datasets",
    isAuth,
    FacebookConversionController.syncDatasets
);

// Sync dataset for specific connection (Facebook/Instagram/WhatsApp)
router.post(
    "/facebook-conversions/sync-datasets/:whatsappId",
    isAuth,
    FacebookConversionController.syncDatasetForConnection
);

// Retry failed conversion events
router.post(
    "/facebook-conversions/retry-failed",
    isAuth,
    FacebookConversionController.retryFailedEvents
);

// [Fase2·B5.1] Registrar monto de venta de un ticket (alimenta el ROAS)
router.post(
    "/facebook-conversions/register-sale",
    isAuth,
    FacebookConversionController.registerSale
);

// Get datasets for a company
router.get(
    "/facebook-conversions/datasets",
    isAuth,
    FacebookConversionController.getDatasets
);

// [Fase2·A4.1/B6.1] Monitor de senales (semaforo + stats por dia + EMQ)
router.get(
    "/facebook-conversions/signal-monitor",
    isAuth,
    FacebookConversionController.signalMonitor
);

// [Diagnóstico] Alineación app↔secret↔token para appsecret_proof (super-only)
router.get(
  "/facebook-conversions/appsecret-diagnostic",
  isAuth,
  FacebookConversionController.appSecretDiagnostic
);

export default router;
