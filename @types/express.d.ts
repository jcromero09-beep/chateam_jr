declare namespace Express {
  export interface Request {
    user: { id: number; profile: string; companyId: number; super?: boolean };
    rateLimit?: {
      limit: number;
      current: number;
      remaining: number;
      resetTime?: Date;
    };
  }
}
