import sequelize from "../../database/index";
import { QueryTypes } from "sequelize";

interface Return {
  data: {};
}

interface Request {
  initialDate: string;
  finalDate: string;
  companyId: number;
}

interface DataReturn {
  quantidade: number;
  data?: number;
  nome?: string;
}

interface dataUser {
  name: string;
}

// [Seguridad] Fechas normalizadas + consultas PARAMETRIZADAS (replacements).
// Antes se interpolaban crudas en el SQL (`'${initialDate} 00:00:00'`) => inyección SQL vía
// query string, y si faltaban daba 'undefined 00:00:00' => 500. Ahora: sin fechas válidas se
// usa por defecto el mes en curso y los valores viajan como bind params.
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

export const TicketsAttendance = async ({ initialDate, finalDate, companyId }: Request): Promise<Return> => {

  const { from, to } = normalizeRange(initialDate, finalDate);

  const sqlUsers = `select u.name from "Users" u where u."companyId" = :companyId`

  const users: dataUser[] = await sequelize.query(sqlUsers, {
    replacements: { companyId },
    type: QueryTypes.SELECT
  });

  const sql = `
  select
    COUNT(*) AS quantidade,
    u.name AS nome
  from
    "Tickets" tt
    left join "Users" u on u.id = tt."userId"
  where
    tt."companyId" = :companyId
    and tt."userId" is not null
    and tt."createdAt" >= :from
    and tt."createdAt" <= :to
  group by
    nome
  ORDER BY
    nome asc`

  const data: DataReturn[] = await sequelize.query(sql, {
    replacements: { companyId, from: `${from} 00:00:00`, to: `${to} 23:59:59` },
    type: QueryTypes.SELECT
  });

  users.map(user => {
    const indexCreated = data.findIndex((item) => item.nome === user.name);

    if (indexCreated === -1) {
      data.push({ quantidade: 0, nome: user.name })
    }

  })

  return { data };
}
