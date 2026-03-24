import dns from "dns";
import { promisify } from "util";
import logger from "../../utils/logger";

const resolveMx = promisify(dns.resolveMx);

// ============================================================================
// Interfaces
// ============================================================================

interface ValidateEmailResponse {
  valid: boolean;
  reason?: string;
}

// ============================================================================
// ValidateEmailService
// ============================================================================

/**
 * Servicio de validacion de direcciones de email.
 *
 * Realiza dos niveles de validacion:
 * 1. Formato: Valida la sintaxis del email con regex
 * 2. MX Records: Verifica que el dominio tenga registros MX configurados
 *
 * No verifica si el buzon existe (eso requiere SMTP VRFY que la mayoria
 * de servidores bloquean).
 */
const ValidateEmailService = async (
  email: string
): Promise<ValidateEmailResponse> => {

  // 1. Validar que el email no este vacio
  if (!email || email.trim() === "") {
    return {
      valid: false,
      reason: "El email esta vacio"
    };
  }

  const trimmedEmail = email.trim().toLowerCase();

  // 2. Validar formato con regex
  // RFC 5322 simplificado: local@domain.tld
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(trimmedEmail)) {
    return {
      valid: false,
      reason: "Formato de email invalido"
    };
  }

  // 3. Extraer dominio
  const parts = trimmedEmail.split("@");
  if (parts.length !== 2) {
    return {
      valid: false,
      reason: "Formato de email invalido: falta @"
    };
  }

  const domain = parts[1];

  // 4. Validar longitud
  if (parts[0].length > 64) {
    return {
      valid: false,
      reason: "La parte local del email excede 64 caracteres"
    };
  }

  if (domain.length > 253) {
    return {
      valid: false,
      reason: "El dominio del email excede 253 caracteres"
    };
  }

  // 5. Verificar registros MX del dominio
  try {
    const mxRecords = await resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      return {
        valid: false,
        reason: `El dominio "${domain}" no tiene registros MX configurados`
      };
    }

    logger.info(
      `[ValidateEmailService] Email valido: ${trimmedEmail}, ` +
      `MX records=${mxRecords.length}, ` +
      `primary=${mxRecords.sort((a, b) => a.priority - b.priority)[0]?.exchange}`
    );

    return { valid: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const errorCode = (error as NodeJS.ErrnoException).code;

    // ENOTFOUND = dominio no existe
    if (errorCode === "ENOTFOUND") {
      return {
        valid: false,
        reason: `El dominio "${domain}" no existe`
      };
    }

    // ENODATA = dominio existe pero sin registros MX
    if (errorCode === "ENODATA") {
      return {
        valid: false,
        reason: `El dominio "${domain}" no tiene registros MX configurados`
      };
    }

    // ETIMEOUT = timeout en la consulta DNS
    if (errorCode === "ETIMEOUT" || errorCode === "EAI_AGAIN") {
      logger.warn(
        `[ValidateEmailService] Timeout DNS para dominio: ${domain}, ` +
        `error=${errorMessage}`
      );
      // En caso de timeout, asumimos que el email puede ser valido
      // para no bloquear envios por problemas temporales de DNS
      return { valid: true };
    }

    logger.warn(
      `[ValidateEmailService] Error al verificar MX para ${domain}: ` +
      `code=${errorCode}, message=${errorMessage}`
    );

    return {
      valid: false,
      reason: `No se pudo verificar el dominio "${domain}": ${errorMessage}`
    };
  }
};

export default ValidateEmailService;
