import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Router, Request, Response } from 'express';
import { createPrometheusMetrics } from '../utils/metrics';

const router = Router();

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthChecks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      services: {
        database: await checkDatabaseHealth(),
        redis: await checkRedisHealth(),
        storage: await checkStorageHealth()
      }
    };

    // Determinar el estado general
    const allServicesHealthy = Object.values(healthChecks.services)
      .every(service => service.status === 'healthy');

    if (!allServicesHealthy) {
      healthChecks.status = 'degraded';
      return res.status(503).json(healthChecks);
    }

    res.status(200).json(healthChecks);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ==========================================
// READINESS CHECK
// ==========================================
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const readinessChecks = {
      database: await checkDatabaseConnection(),
      redis: await checkRedisConnection(),
      migrations: await checkMigrations()
    };

    const allReady = Object.values(readinessChecks)
      .every(check => check.ready === true);

    if (allReady) {
      res.status(200).json({
        status: 'ready',
        checks: readinessChecks
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        checks: readinessChecks
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message
    });
  }
});

// ==========================================
// LIVENESS CHECK
// ==========================================
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: Math.floor(process.uptime())
  });
});

// ==========================================
// PROMETHEUS METRICS
// ==========================================
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await createPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.status(200).send(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: error.message
    });
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function checkDatabaseHealth() {
  try {
    const sequelize = require('../database');
    await sequelize.authenticate();
    return {
      status: 'healthy',
      responseTime: Date.now(),
      details: 'Database connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkRedisHealth() {
  try {
    const redis = require('../config/redis');
    await redis.ping();
    return {
      status: 'healthy',
      responseTime: Date.now(),
      details: 'Redis connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkStorageHealth() {
  try {
    // Verificar conexión S3/MinIO
    const AWS = require('aws-sdk');
    const s3 = new AWS.S3({
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      s3ForcePathStyle: true
    });

    await s3.headBucket({ Bucket: process.env.S3_BUCKET }).promise();
    return {
      status: 'healthy',
      responseTime: Date.now(),
      details: 'Storage connection successful'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkDatabaseConnection() {
  try {
    const sequelize = require('../database');
    await sequelize.authenticate();
    return { ready: true, message: 'Database connected' };
  } catch (error) {
    return { ready: false, error: error.message };
  }
}

async function checkRedisConnection() {
  try {
    const redis = require('../config/redis');
    await redis.ping();
    return { ready: true, message: 'Redis connected' };
  } catch (error) {
    return { ready: false, error: error.message };
  }
}

async function checkMigrations() {
  try {
    const sequelize = require('../database');
    const queryInterface = sequelize.getQueryInterface();

    // Verificar que las tablas principales existen
    const tables = await queryInterface.showAllTables();
    const requiredTables = ['companies', 'users', 'tickets', 'messages'];
    const missingTables = requiredTables.filter(table => !tables.includes(table));

    if (missingTables.length === 0) {
      return { ready: true, message: 'All migrations completed' };
    } else {
      return {
        ready: false,
        error: `Missing tables: ${missingTables.join(', ')}`
      };
    }
  } catch (error) {
    return { ready: false, error: error.message };
  }
}

export default router;