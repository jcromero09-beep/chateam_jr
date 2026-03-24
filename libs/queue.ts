import 'dotenv/config';
import BullQueue from 'bull';
import { REDIS_URI_CONNECTION } from "../config/redis";
import configLoader from '../services/ConfigLoaderService/configLoaderService';
import * as jobs from '../jobs';
import logger from '../utils/logger';

const config = configLoader(); // Carregue as configurações

const queueOptions = {
  defaultJobOptions: {
    attempts: config.webhook.attempts,
    backoff: {
      type: config.webhook.backoff.type,
      delay: config.webhook.backoff.delay,
    },
    removeOnFail: false,
    removeOnComplete: true,
  },
  limiter: {
    max: config.webhook.limiter.max,
    duration: config.webhook.limiter.duration,
  },
};

interface Job {
  key: string;
  handle: any;
}

// Filtrar solo jobs con estructura válida { key, handle }
const validJobs = Object.values(jobs).filter((job: any) => {
  // Aceptar jobs con key o jobs que son funciones (handle directo)
  return job && (job.key || typeof job === 'function');
});
console.log('[queue.ts] Jobs válidos encontrados:', validJobs.map((j: any) => j.key || j.name || 'function'));

const queues = validJobs.map((job: any) => {
  const jobKey = job.key || job.name;
  // Si el job es un objeto con handle, usarlo; si es función, usarla directamente
  let jobHandle;
  if (typeof job === 'function') {
    jobHandle = job;
  } else if (job.handle) {
    jobHandle = typeof job.handle === 'function' ? job.handle : job.handle.handle;
  } else {
    jobHandle = job;
  }
  return {
    bull: new BullQueue(jobKey, REDIS_URI_CONNECTION, queueOptions),
    name: jobKey,
    handle: jobHandle,
  };
});
export default {
  queues,
  add(name: string, data, params = {}) {
    const queue = this.queues.find(queue => queue.name === name);

    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }

    return queue.bull.add(data, { ...params, removeOnComplete: true });
  },
  process() {
    return this.queues.forEach(queue => {
      queue.bull.process(queue.handle);

      queue.bull.on('failed', (job, err) => {
        logger.error(`Job failed: ${queue.key} ${job.data}`);
        logger.error(err);
      });
    })
  }
}
