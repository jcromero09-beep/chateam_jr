import Mustache from "mustache";
import Ticket from "../models/Ticket";

/**
 * FlowVariables - Sistema unificado de variables dinamicas para FlowBuilder.
 *
 * Soporta ambas sintaxis:
 *   - {variable}    (una llave, estilo FlowBuilder)
 *   - {{variable}}  (doble llave, estilo Mustache)
 *
 * Resolucion de variables (orden de precedencia):
 *   1. Variables fijas del sistema (contacto, ticket, empresa, fecha)
 *   2. Custom fields del contacto (contact.extraInfo) por name (case-insensitive)
 *   3. Si no existe -> string vacio (NO rompe el mensaje)
 *
 * Variables soportadas:
 *   Contacto:  {name}, {firstName}, {lastName}, {number}, {email}, {channel}, {picture}
 *   Ticket:    {ticketId}, {protocol}, {queue}, {user}, {status}
 *   Empresa:   {company}, {connection}
 *   Fecha:     {date}, {time}, {datetime}, {weekday}
 *   Custom:    {cualquierCampoExtraInfo}
 */

type NumberPhrase = "" | { number: string; name: string; email: string };

interface BuildViewArgs {
  ticket?: Ticket | any;
  numberPhrase?: NumberPhrase;
}

/* ========== Helpers internos de fecha ========== */

const pad = (n: number): string => ("0" + n).slice(-2);

const formatDate = (d: Date): string =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const formatTime = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const WEEKDAYS_ES = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado"
];

/**
 * Genera protocolo en formato YYYYMMDDmmssms + ticketId (mismo formato que Mustache.ts actual).
 */
const buildProtocol = (ticketId?: number): string => {
  const d = new Date();
  const yyyy = d.getFullYear().toString();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const minute = d.getMinutes().toString();
  const second = d.getSeconds().toString();
  const millisecond = d.getMilliseconds().toString();
  return (
    yyyy + mm + dd + minute + second + millisecond + (ticketId ? ticketId.toString() : "")
  );
};

/**
 * Construye el objeto `view` con TODAS las variables disponibles.
 * Expuesto para que el frontend pueda mostrar la lista de variables (futuro).
 */
export const buildFlowView = ({
  ticket,
  numberPhrase = ""
}: BuildViewArgs): Record<string, string> => {
  const contact = ticket?.contact;
  const company = ticket?.company;
  const whatsapp = ticket?.whatsapp;
  const queue = ticket?.queue;
  const user = ticket?.user;

  // Datos del contacto (prioridad: numberPhrase > contact)
  const contactName =
    typeof numberPhrase === "object" && numberPhrase?.name
      ? numberPhrase.name
      : contact?.name || "";
  const contactNumber =
    typeof numberPhrase === "object" && numberPhrase?.number
      ? numberPhrase.number
      : contact?.number || "";
  const contactEmail =
    typeof numberPhrase === "object" && numberPhrase?.email
      ? numberPhrase.email
      : contact?.email || "";

  const nameParts = (contactName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const now = new Date();

  const view: Record<string, string> = {
    // ----- Contacto -----
    name: contactName,
    firstName,
    lastName,
    number: contactNumber,
    email: contactEmail,
    channel: contact?.channel || "",
    picture: contact?.urlPicture || contact?.profilePicUrl || "",

    // ----- Ticket -----
    ticketId: ticket?.id ? String(ticket.id) : "",
    ticket_id: ticket?.id ? String(ticket.id) : "", // alias legacy
    protocol: buildProtocol(ticket?.id),
    queue: queue?.name || "",
    user: user?.name || "",
    userName: user?.name || "", // alias legacy
    status: ticket?.status || "",

    // ----- Empresa / Conexion -----
    company: company?.name || "",
    name_company: company?.name || "", // alias legacy
    connection: whatsapp?.name || "",

    // ----- Fecha / Hora -----
    date: formatDate(now),
    time: formatTime(now),
    hour: formatTime(now), // alias legacy
    datetime: `${formatDate(now)} ${formatTime(now)}`,
    data_hora: `${formatDate(now)} as ${formatTime(now)}`, // alias legacy
    weekday: WEEKDAYS_ES[now.getDay()]
  };

  // ----- Custom Fields del contacto (contact.extraInfo) -----
  // Cada campo se registra con su nombre original, lowercase y con espacios -> underscore.
  const extra = contact?.extraInfo;
  if (Array.isArray(extra)) {
    for (const cf of extra) {
      if (!cf || !cf.name) continue;
      const val = cf.value == null ? "" : String(cf.value);
      const keyRaw = String(cf.name).trim();
      const keyLower = keyRaw.toLowerCase();
      const keySnake = keyLower.replace(/\s+/g, "_");

      // No sobrescribir variables fijas (prioridad sistema > custom)
      if (!Object.prototype.hasOwnProperty.call(view, keyRaw)) view[keyRaw] = val;
      if (!Object.prototype.hasOwnProperty.call(view, keyLower)) view[keyLower] = val;
      if (!Object.prototype.hasOwnProperty.call(view, keySnake)) view[keySnake] = val;
    }
  }

  return view;
};

/**
 * Normaliza el body convirtiendo `{var}` (una llave) a `{{var}}` (Mustache).
 * - Solo convierte tokens con nombres validos: letras, numeros, guion, guion bajo.
 * - Respeta los que ya estan en formato Mustache `{{var}}`.
 * - No toca llaves con espacios internos o simbolos (ej: JSON literales).
 */
const normalizeSingleBraces = (body: string): string => {
  if (!body) return "";
  // Marcadores temporales ASCII improbables para proteger `{{...}}` existentes.
  const OPEN = "@@FLOW_OPEN@@";
  const CLOSE = "@@FLOW_CLOSE@@";

  let out = body.split("{{").join(OPEN).split("}}").join(CLOSE);

  // Reemplaza {nombreVariable} -> {{nombreVariable}} SOLO con caracteres validos
  out = out.replace(/\{\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\}/g, "{{$1}}");

  // Restaurar los {{ }} originales
  out = out.split(OPEN).join("{{").split(CLOSE).join("}}");

  return out;
};

/**
 * Renderiza un body aplicando todas las variables del flow.
 * Acepta tanto `{var}` como `{{var}}`. Variables no encontradas -> string vacio.
 */
export const formatBodyFlow = (
  body: string,
  ticket?: Ticket | any,
  numberPhrase: NumberPhrase = ""
): string => {
  if (!body) return "";

  try {
    const view = buildFlowView({ ticket, numberPhrase });
    const normalized = normalizeSingleBraces(body);
    return Mustache.render(normalized, view);
  } catch {
    // Si Mustache falla (tag invalido, etc.), devolver el body sin procesar
    return body;
  }
};

export default formatBodyFlow;
