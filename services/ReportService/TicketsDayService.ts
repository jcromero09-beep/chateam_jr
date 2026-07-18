import sequelize from "../../database/index";
import { QueryTypes } from "sequelize";

interface Return {
  data: {};
  count: number;
}

interface Request {
  initialDate: string;
  finalDate: string;
  companyId: number;
}

interface DataReturn {
  total: number;
  data?: number;
  horario?: string;
}

// [Seguridad] Igual que TicketsAttendance: fechas normalizadas + SQL parametrizado.
// Antes se interpolaban crudas (inyección vía query) y sin fechas daba 'undefined' => 500.
const isValidDate = (s?: string): boolean => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

const normalizeRange = (initialDate?: string, finalDate?: string) => {
  const today = new Date();
  const fallbackFinal = today.toISOString().slice(0, 10);
  const fallbackInitial = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  return {
    from: isValidDate(initialDate) ? (initialDate as string) : fallbackInitial,
    to: isValidDate(finalDate) ? (finalDate as string) : fallbackFinal
  };
};

export const TicketsDayService = async ({ initialDate, finalDate, companyId }: Request): Promise<Return> => {

  let sql = '';
  let count = 0;

  const { from, to } = normalizeRange(initialDate, finalDate);
  // Mismo día => desglose por hora; rango => desglose por día.
  const sameDay = from === to;

  if (sameDay) {
    sql = `
    SELECT
      COUNT(*) AS total,
      extract(hour from tick."createdAt") AS horario
    FROM
      "Tickets" tick
    WHERE
      tick."companyId" = :companyId
      and DATE(tick."createdAt") >= :from
      AND DATE(tick."createdAt") <= :to
    GROUP BY
      extract(hour from tick."createdAt")
    ORDER BY
      horario asc;
    `
  } else {
    sql = `
    SELECT
    COUNT(*) AS total,
    to_char(DATE(tick."createdAt"), 'dd/mm/YYYY') as data
  FROM
    "Tickets" tick
  WHERE
    tick."companyId" = :companyId
    and DATE(tick."createdAt") >= :from
    AND DATE(tick."createdAt") <= :to
  GROUP BY
    to_char(DATE(tick."createdAt"), 'dd/mm/YYYY')
  ORDER BY
    data asc;
  `
  }

  const data: DataReturn[] = await sequelize.query(sql, {
    replacements: { companyId, from, to },
    type: QueryTypes.SELECT
  });

  data.forEach((register) => {
    count += Number(register.total);
  })

  return { data, count };

}