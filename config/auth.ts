// Validate required environment variables at startup
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required but not set. Please configure it in your .env file.");
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET environment variable is required but not set. Please configure it in your .env file.");
}

// Validate secret strength
if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long for security.");
}

if (process.env.JWT_REFRESH_SECRET.length < 32) {
  throw new Error("JWT_REFRESH_SECRET must be at least 32 characters long for security.");
}

export default {
  secret: process.env.JWT_SECRET,
  expiresIn: "15m",
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: "7d"
};
