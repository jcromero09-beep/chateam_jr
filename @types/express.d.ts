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
    };
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime?: Date;
    };
  }
}
