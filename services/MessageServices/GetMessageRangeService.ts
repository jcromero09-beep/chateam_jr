import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import { QueryTypes } from "sequelize";
import sequelize from "../../database";

interface Request {
    companyId: number;
    startDate: string;
    lastDate: string;
}

const GetMessageRangeService = async ({ companyId, startDate, lastDate }: Request): Promise<Message[]> => {
    // SEGURIDAD: antes se interpolaban companyId/fechas DIRECTO en el SQL crudo → SQL injection
    // (p.ej. companyId="1 OR 1=1" volcaba todas las empresas). Ahora: companyId numérico validado,
    // fechas con formato estricto YYYY-MM-DD, y query PARAMETRIZADA con replacements.
    const cid = Number(companyId);
    if (!Number.isInteger(cid) || cid <= 0) {
        throw new AppError("companyId inválido", 400);
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(String(startDate)) || !dateRe.test(String(lastDate))) {
        throw new AppError("Rango de fechas inválido (formato esperado YYYY-MM-DD)", 400);
    }

    const messages = await sequelize.query(
        `select * from "Messages" m where "companyId" = :companyId and "createdAt" between :start and :end`,
        {
            replacements: {
                companyId: cid,
                start: `${startDate} 00:00:00`,
                end: `${lastDate} 23:59:59`
            },
            type: QueryTypes.SELECT
        }
    );

    if (!messages) {
        throw new AppError("MESSAGES_NOT_FIND");
    }

    return messages as unknown as Message[];
};

export default GetMessageRangeService;