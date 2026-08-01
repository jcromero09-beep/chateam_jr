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
  }
}
