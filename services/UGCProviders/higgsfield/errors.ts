/**
 * Errores normalizados del proveedor Higgsfield. Mantienen el mismo shape
 * que los errores de fal (errorType + statusCode) para que el handler HTTP
 * los traduzca sin filtrar detalles internos del proveedor al cliente.
 */

export class HiggsfieldProviderError extends Error {
  readonly errorType: string;
  readonly statusCode?: number;

  constructor(message: string, errorType = "unknown", statusCode?: number) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = errorType;
    this.statusCode = statusCode;
  }
}

export class HiggsfieldRateLimitError extends HiggsfieldProviderError {
  constructor(message = "Higgsfield rate limit exceeded") {
    super(message, "rate_limit", 429);
  }
}

export class HiggsfieldTimeoutError extends HiggsfieldProviderError {
  constructor(message = "Higgsfield request timed out") {
    super(message, "timeout", 504);
  }
}

export class HiggsfieldContentPolicyError extends HiggsfieldProviderError {
  constructor(message = "Higgsfield content policy rejected the request") {
    super(message, "content_policy", 400);
  }
}

export class HiggsfieldAuthError extends HiggsfieldProviderError {
  constructor(message = "Higgsfield API key missing or invalid") {
    super(message, "auth", 401);
  }
}

export class HiggsfieldWebhookSignatureError extends HiggsfieldProviderError {
  constructor(message = "Invalid Higgsfield webhook signature") {
    super(message, "webhook_signature", 401);
  }
}

/**
 * Normaliza un error de axios/red a HiggsfieldProviderError sin exponer el
 * payload crudo del proveedor.
 */
export function normalizeHiggsfieldError(err: unknown): HiggsfieldProviderError {
  const anyErr = err as {
    response?: { status?: number; data?: unknown };
    code?: string;
    message?: string;
  };

  const status = anyErr?.response?.status;

  if (status === 429) return new HiggsfieldRateLimitError();
  if (status === 401 || status === 403) return new HiggsfieldAuthError();
  if (status === 400) {
    return new HiggsfieldContentPolicyError(
      "Higgsfield rechazó la solicitud (validación o política de contenido)"
    );
  }
  if (anyErr?.code === "ECONNABORTED" || anyErr?.code === "ETIMEDOUT") {
    return new HiggsfieldTimeoutError();
  }

  return new HiggsfieldProviderError(
    anyErr?.message || "Unknown Higgsfield provider error",
    "unknown",
    status || 500
  );
}
