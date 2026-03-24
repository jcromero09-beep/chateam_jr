import { Router } from "express";
import ContactTemperatureController from "../controllers/ContactTemperatureController";
import isAuth from "../middleware/isAuth";

const router = Router();

// Distribución de temperaturas (hot/warm/cold counts)
router.get(
  "/contact-temperature/distribution",
  isAuth,
  ContactTemperatureController.getDistribution
);

// Listar contactos por categoría (hot/warm/cold)
router.get(
  "/contact-temperature/contacts/:category",
  isAuth,
  ContactTemperatureController.getContactsByCategory
);

// Obtener temperatura de un contacto específico
router.get(
  "/contact-temperature/:contactId",
  isAuth,
  ContactTemperatureController.getContactTemperature
);

// Trigger manual de recálculo
router.post(
  "/contact-temperature/recalculate",
  isAuth,
  ContactTemperatureController.triggerRecalculate
);

export default router;
