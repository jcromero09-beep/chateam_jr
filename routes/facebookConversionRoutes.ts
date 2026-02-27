import { Router } from "express";
import * as FacebookConversionController from "../controllers/FacebookConversionController";
import isAuth from "../middleware/isAuth";

const router = Router();

// Send conversion event
router.post(
    "/facebook-conversions/send",
    isAuth,
    FacebookConversionController.sendConversion
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

// Get datasets for a company
router.get(
    "/facebook-conversions/datasets",
    isAuth,
    FacebookConversionController.getDatasets
);

export default router;
