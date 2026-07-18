import { Request, Response } from "express";
import GetMessageRangeService from "../../services/MessageServices/GetMessageRangeService";

type IndexQuery = {
    companyId: number;
    startDate: string;
    lastDate: string;
};
export const show = async (req: Request, res: Response): Promise<Response> => {
    // SEGURIDAD: el companyId se toma de la IDENTIDAD autenticada (req.user), NUNCA del body.
    // Antes venía del body → cualquiera con el token global podía leer mensajes de otra empresa.
    const { companyId } = (req.user || {}) as { companyId?: number };
    if (!companyId) {
        return res.status(401).json({ error: "No autorizado" });
    }
    const { startDate, lastDate } = (req.body || {}) as IndexQuery;
    const messages = await GetMessageRangeService({ companyId, startDate, lastDate });
    return res.status(200).json(messages);
};