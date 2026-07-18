import AppError from "../../errors/AppError";

export interface VerifiedGoogleProfile {
  email: string;
  name?: string;
  picture?: string;
  googleSub: string;
}

const getGoogleClientId = (): string => {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new AppError("ERR_GOOGLE_AUTH_NOT_CONFIGURED", 503);
  }

  return clientId;
};

const VerifyGoogleIdTokenService = async (
  credential: string
): Promise<VerifiedGoogleProfile> => {
  if (!credential || typeof credential !== "string") {
    throw new AppError("ERR_GOOGLE_CREDENTIAL_REQUIRED", 400);
  }

  const { OAuth2Client } = await import("google-auth-library");
  const clientId = getGoogleClientId();
  const client = new OAuth2Client(clientId);

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new AppError("ERR_GOOGLE_INVALID_PROFILE", 401);
    }

    if (payload.email_verified !== true) {
      throw new AppError("ERR_GOOGLE_EMAIL_NOT_VERIFIED", 401);
    }

    return {
      email: payload.email.toLowerCase(),
      name: payload.name || payload.given_name || undefined,
      picture: payload.picture || undefined,
      googleSub: payload.sub
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("ERR_GOOGLE_INVALID_CREDENTIAL", 401);
  }
};

export default VerifyGoogleIdTokenService;
