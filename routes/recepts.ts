import express from "express";
import { Router } from "express";
import * as ReceiptController from "../controllers/ReceiptController";
import multer from "multer";

import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);


const receiptsRoutes = Router();

// Listar recibos con búsqueda y paginación
receiptsRoutes.get("/recepts/", isAuth, isSuper, ReceiptController.index);

// Obtener un recibo por su ID
receiptsRoutes.get("/recepts/:id", isAuth, isSuper, ReceiptController.show);

// Crear un nuevo recibo
receiptsRoutes.post("/recepts/", isAuth, upload.single("file"), ReceiptController.store);

// Actualizar un recibo por su ID
receiptsRoutes.put("/recepts/:id", isAuth, isSuper, ReceiptController.update);

// Eliminar un recibo por su ID
receiptsRoutes.delete("/recepts/:id", isAuth, isSuper, ReceiptController.remove);


export default receiptsRoutes;
