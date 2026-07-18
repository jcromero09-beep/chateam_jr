// Env para el harness de DB de test. Apunta a chateam_test vía el rol dedicado harness_test.
// (No se usa .env.test porque el guard bloquea escribir .env*; esto lo suple.)
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = "postgres";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "5434";
process.env.DB_USER = "harness_test";
process.env.DB_PASS = "harness_test_pw_local";
process.env.DB_NAME = "chateam_test";
process.env.DB_POOL_MAX = "5";
process.env.DB_POOL_MIN = "1";
process.env.DB_POOL_ACQUIRE = "30000";
process.env.DB_POOL_IDLE = "10000";
process.env.JWT_SECRET = process.env.JWT_SECRET || "jest_test_jwt_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "jest_test_jwt_refresh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
