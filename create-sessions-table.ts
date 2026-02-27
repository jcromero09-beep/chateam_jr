import sequelize from './database/index';

async function createTable() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected!');

    console.log('Creating Sessions table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "Sessions" (
        "id" VARCHAR(36) PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE CASCADE,
        "refreshTokenHash" VARCHAR(128) NOT NULL,
        "userAgent" VARCHAR(512),
        "ip" VARCHAR(64),
        "clientType" VARCHAR(10) NOT NULL DEFAULT 'web',
        "deviceId" VARCHAR(128),
        "lastSeenAt" TIMESTAMP WITH TIME ZONE,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Table Sessions created successfully');

    // Create indexes
    await sequelize.query('CREATE INDEX IF NOT EXISTS "sessions_user_id" ON "Sessions" ("userId");');
    await sequelize.query('CREATE INDEX IF NOT EXISTS "sessions_user_client" ON "Sessions" ("userId", "clientType");');
    console.log('Indexes created successfully');

    process.exit(0);
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createTable();
