declare namespace Express {
  export interface Request {
    // [Auditoría · Ola 5] Forma real del token (createAccessToken + isAuth +
    // impersonación/switch). Los opcionales existen según el flujo.
    user: {
      id: number;
      profile: string;
      companyId: number;
      super?: boolean;
      sid?: string;
      username?: string;
      email?: string;
      roleId?: number | null;
      role?: string | null;
      impersonatedBy?: number;
      tokenVersion?: number;
      /**
       * Tipo de cliente de la sesión (`Sessions.clientType`). `isAuth` lo
       * escribía desde la sesión pero faltaba aquí, así que era el único error
       * de tipos real del grafo (TS2353 en middleware/isAuth.ts:105).
       *
       * No se importa `ClientType` de models/Session ni de LoginSessionService:
       * este fichero es un `declare namespace` ambient global y un `import`
       * top-level lo convertiría en módulo, tumbando la augmentación de Express
       * para todo el proyecto. Se repite la unión a mano, que es la práctica
       * habitual en los .d.ts ambient.
       */
      clientType?: "web" | "app";
    };
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime?: Date;
    };
    /**
     * Conexión dueña del token de la API pública, tal y como la resolvió
     * `middleware/tokenAuth`. Solo existe en las rutas que pasan por ese
     * middleware (las de `routes/apiRoutes` con `tokenAuth`).
     *
     * [2026-08-01] Existe para que la conexión se busque UNA vez por petición.
     * Antes cada handler repetía la consulta por su cuenta, y esa duplicación
     * costó cara: cuando el token pasó a guardarse cifrado, el middleware y los
     * handlers dejaron de encontrarlo cada uno por su lado y devolvían códigos
     * distintos (403 el middleware, 401 los handlers) al mismo cliente.
     *
     * `import()` en un `.d.ts` ambient no lo convierte en módulo — un `import`
     * top-level sí lo haría, y tumbaría la augmentación de Express para todo el
     * proyecto (ver la nota de `clientType`).
     */
    apiWhatsapp?: import("../models/Whatsapp").default;
  }
}
