import express from "express";
import isAuth from "../middleware/isAuth";
import * as CustomerOriginController from "../controllers/CustomerOriginController";

const customerOriginRoutes = express.Router();

// CRUD endpoints
customerOriginRoutes.get("/customer-origins", isAuth, CustomerOriginController.index);
customerOriginRoutes.get("/customer-origins/report", isAuth, CustomerOriginController.getReport);
customerOriginRoutes.get("/customer-origins/:id", isAuth, CustomerOriginController.show);
customerOriginRoutes.post("/customer-origins", isAuth, CustomerOriginController.store);
customerOriginRoutes.put("/customer-origins/:id", isAuth, CustomerOriginController.update);
customerOriginRoutes.delete("/customer-origins/:id", isAuth, CustomerOriginController.remove);

export default customerOriginRoutes;
