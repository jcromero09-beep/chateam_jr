import crypto from 'crypto';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import { MetaConfig, MetaApiResponse, MetaError, RateLimitInfo, BatchRequest, BatchResponse } from './types';

// Los interceptores volcaban a stdout la request y la response COMPLETAS de
// cada llamada (cabecera de 80 '=', timestamp, params, body y 1000 chars de
// preview): ~48 MB de log en 9 dias. Se conserva como herramienta de
// depuracion, pero apagado salvo que se pida explicitamente.
const DEBUG_HTTP = process.env.META_DEBUG_HTTP === 'true';

// Los errores de configuracion (token caducado, cuenta sin permisos de ads) se
// repiten identicos en CADA llamada. Se registra uno por (codigo + endpoint)
// cada ERROR_LOG_INTERVAL_MS; el resto se silencia.
const ERROR_LOG_INTERVAL_MS = 15 * 60_000;
const MAX_TRACKED_ERRORS = 500;
const lastErrorLogAt = new Map<string, number>();

const shouldLogError = (key: string): boolean => {
  const now = Date.now();
  const prev = lastErrorLogAt.get(key);
  if (prev !== undefined && now - prev < ERROR_LOG_INTERVAL_MS) return false;
  // La clave incluye la URL, que lleva ids: se poda para que el mapa no crezca.
  if (lastErrorLogAt.size >= MAX_TRACKED_ERRORS) lastErrorLogAt.clear();
  lastErrorLogAt.set(key, now);
  return true;
};

export class MetaClient {
  private axios: AxiosInstance;
  private limiter: Bottleneck;
  private config: Required<MetaConfig>;
  private appsecretProof?: string;

  constructor(config: MetaConfig) {
    this.config = {
      accessToken: config.accessToken,
      apiVersion: config.apiVersion || 'v24.0',
      baseUrl: config.baseUrl || 'https://graph.facebook.com',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
      appSecret: config.appSecret || '',
    };

    // [Fase2] appsecret_proof: firma HMAC-SHA256 del token con el secret de la app.
    // Si el token se filtra, sin la firma no sirve desde otra IP/app.
    this.appsecretProof = this.config.appSecret
      ? crypto.createHmac('sha256', this.config.appSecret).update(this.config.accessToken).digest('hex')
      : undefined;

    this.axios = axios.create({
      baseURL: `${this.config.baseUrl}/${this.config.apiVersion}`,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // La firma viaja como query param en TODAS las llamadas (GET y POST).
    if (this.appsecretProof) {
      this.axios.interceptors.request.use(cfg => {
        cfg.params = { ...(cfg.params || {}), appsecret_proof: this.appsecretProof };
        return cfg;
      });
    }

    axiosRetry(this.axios, {
      retries: this.config.retries,
      retryDelay: (retryCount) => {
        return Math.min(this.config.retryDelay * Math.pow(2, retryCount - 1), 10000);
      },
      retryCondition: (error) => {
        // [Fase2] Nunca reintentar un bloqueo por politicas (368) ni un limite de
        // llamadas: Meta lo cuenta igual y alarga el castigo.
        const code = (error.response?.data as any)?.error?.code;
        if (code === 368 || [4, 17, 32, 613, 80000, 80003, 80004, 80014].includes(code)) return false;
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response?.status === 429) ||
               (error.response?.status === 500) ||
               (error.response?.status === 502) ||
               (error.response?.status === 503) ||
               (error.response?.status === 504);
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.warn(`🔄 Reintentando petición ${retryCount}/${this.config.retries}:`, {
          url: requestConfig.url,
          method: requestConfig.method,
          error: error.message,
        });
      },
    });

    this.limiter = new Bottleneck({
      reservoir: 100,
      reservoirRefreshAmount: 100,
      reservoirRefreshInterval: 60 * 1000,
      maxConcurrent: 5,
      minTime: 200,
      retryCount: 2,
      retry: (error: any, jobInfo: any) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            return parseInt(retryAfter) * 1000;
          }
          return 5000;
        }
        return false;
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.axios.interceptors.request.use(
      (config) => {
        if (DEBUG_HTTP) {
          console.log(`\n${'='.repeat(80)}`);
          console.log(`📤 REQUEST: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
          console.log(`${'='.repeat(80)}`);
          console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
          if (config.params) {
            console.log(`📋 Query Params:`, JSON.stringify(config.params, null, 2));
          }
          if (config.data) {
            console.log(`📦 Request Body:`, JSON.stringify(config.data, null, 2));
          }
          console.log(`${'='.repeat(80)}\n`);
        }
        return config;
      },
      (error) => {
        console.error('❌ Request error:', error);
        return Promise.reject(error);
      }
    );

    this.axios.interceptors.response.use(
      (response) => {
        this.handleRateLimit(response);
        if (DEBUG_HTTP) {
          console.log(`\n${'='.repeat(80)}`);
          console.log(`📥 RESPONSE: ${response.status} ${response.config.url}`);
          console.log(`${'='.repeat(80)}`);
          console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
          console.log(`📊 Data Count: ${Array.isArray(response.data?.data) ? response.data.data.length : 1} items`);
          // Mostrar preview de los datos (primeros 500 caracteres)
          const dataPreview = JSON.stringify(response.data, null, 2);
          if (dataPreview.length > 1000) {
            console.log(`📄 Response Preview (first 1000 chars):\n${dataPreview.substring(0, 1000)}...`);
          } else {
            console.log(`📄 Response Data:\n${dataPreview}`);
          }
          console.log(`${'='.repeat(80)}\n`);
        }
        return response;
      },
      (error) => {
        if (DEBUG_HTTP) {
          console.log(`\n${'='.repeat(80)}`);
          console.log(`❌ ERROR RESPONSE`);
          console.log(`${'='.repeat(80)}`);
          console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
          console.log(`📍 URL: ${error.config?.url}`);
          console.log(`📋 Status: ${error.response?.status || 'N/A'}`);
          console.log(`📄 Error Data:`, JSON.stringify(error.response?.data, null, 2));
          console.log(`${'='.repeat(80)}\n`);
        }
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Lee la cuota que reporta Meta y frena ANTES de que nos frene ella.
   *
   * Contrato real (docs Graph API / Marketing API rate limiting):
   *  - x-app-usage: {call_count,total_time,total_cputime} PLANO, valores en %.
   *  - x-business-use-case-usage: {"<id>":[{type,call_count,total_cputime,
   *    total_time,estimated_time_to_regain_access,ads_api_access_tier}]} — mapa
   *    de ARRAYS, %, y el tiempo de recuperacion en MINUTOS.
   *  - x-ad-account-usage: {acc_id_util_pct, reset_time_duration(seg)}.
   *  - x-fb-ads-insights-throttle: {app_id_util_pct, acc_id_util_pct}.
   *
   * Antes se hacia Object.assign del mapa sobre {call_count:0}: call_count
   * quedaba SIEMPRE en 0 y el freno no salto nunca. Ademas Meta avisa: al llegar
   * al limite hay que PARAR — si sigues llamando el contador no baja y alargas
   * el bloqueo. Por eso al 100% se corta el grifo, no solo se ralentiza.
   */
  private handleRateLimit(response: AxiosResponse): void {
    const raws = {
      buc: response.headers['x-business-use-case-usage'],
      app: response.headers['x-app-usage'],
      acct: response.headers['x-ad-account-usage'],
      insights: response.headers['x-fb-ads-insights-throttle'],
    };
    if (!raws.buc && !raws.app && !raws.acct && !raws.insights) return;

    const parse = (raw: any): any => {
      if (!raw) return undefined;
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return undefined; }
    };

    let pct = 0;          // peor porcentaje de uso visto
    let blockMs = 0;      // cuanto pide Meta que esperemos
    let tier: string | undefined;

    const pctFrom = (o: any, keys: string[]) => {
      if (!o || typeof o !== 'object') return;
      for (const k of keys) pct = Math.max(pct, Number(o[k]) || 0);
    };

    const buc = parse(raws.buc);
    if (buc && typeof buc === 'object') {
      for (const entries of Object.values(buc)) {
        const list = Array.isArray(entries) ? entries : [entries];
        for (const e of list as any[]) {
          pctFrom(e, ['call_count', 'total_cputime', 'total_time']);
          blockMs = Math.max(blockMs, (Number(e?.estimated_time_to_regain_access) || 0) * 60_000);
          tier = tier || e?.ads_api_access_tier;
        }
      }
    }
    pctFrom(parse(raws.app), ['call_count', 'total_cputime', 'total_time']);

    const acct = parse(raws.acct);
    pctFrom(acct, ['acc_id_util_pct']);
    if (acct?.reset_time_duration && (Number(acct.acc_id_util_pct) || 0) >= 100) {
      blockMs = Math.max(blockMs, Number(acct.reset_time_duration) * 1000);
    }
    pctFrom(parse(raws.insights), ['app_id_util_pct', 'acc_id_util_pct']);

    if (pct >= 100 || blockMs > 0) {
      const waitMs = blockMs || 5 * 60_000;
      console.error(
        `⛔ Cuota Meta agotada (${pct}%${tier ? `, tier ${tier}` : ''}). ` +
        `Cortando llamadas ~${Math.round(waitMs / 60000)} min: insistir alarga el bloqueo.`
      );
      // reservoir 0 = ninguna llamada sale hasta que se restaure.
      this.limiter.updateSettings({ reservoir: 0, maxConcurrent: 1 });
      setTimeout(() => {
        console.warn('🔓 Ventana de cuota Meta reabierta, reanudando con ritmo conservador');
        this.limiter.updateSettings({ reservoir: 20, minTime: 1000, maxConcurrent: 2 });
      }, waitMs).unref?.();
      return;
    }

    if (pct >= 70) {
      console.warn(`⚠️ Cuota Meta al ${pct}%${tier ? ` (tier ${tier})` : ''} — bajando el ritmo`);
      this.limiter.updateSettings({ minTime: pct >= 90 ? 2000 : 500, maxConcurrent: pct >= 90 ? 1 : 2 });
    }
  }


  private handleApiError(error: any): void {
    if (error.response?.data?.error) {
      const metaError: MetaError = error.response.data.error;

      // 190 (token invalido) y 200/10 (sin permisos de ads) son configuracion
      // de la cuenta del cliente, no fallos de la plataforma: warn, y solo uno
      // cada ERROR_LOG_INTERVAL_MS. El resto sigue siendo error.
      const isClientConfig = [10, 190, 200].includes(metaError.code);
      const logKey = `${metaError.code}:${error.config?.url || '?'}`;
      if (shouldLogError(logKey)) {
        const payload = {
          message: metaError.message,
          type: metaError.type,
          code: metaError.code,
          subcode: metaError.error_subcode,
          fbtrace_id: metaError.fbtrace_id,
          url: error.config?.url,
          method: error.config?.method,
        };
        if (isClientConfig) {
          console.warn(
            `⚠️ Meta API: cuenta no utilizable (se silencian repeticiones ${ERROR_LOG_INTERVAL_MS / 60_000} min):`,
            payload
          );
        } else {
          console.error('❌ Meta API Error:', payload);
        }
      }

      // Los throws de abajo sustituyen el error de axios por un Error plano, y
      // con el se perdia `response.data.error`: quien llama arriba (el service)
      // ya no podia distinguir un token caducado de un fallo de red y trataba
      // todo como error generico. Se conserva el codigo de Meta en el Error.
      const fail = (message: string): never => {
        const err = new Error(message) as Error & {
          metaCode?: number;
          metaSubcode?: number;
          metaFbtraceId?: string;
        };
        err.metaCode = metaError.code;
        err.metaSubcode = metaError.error_subcode;
        err.metaFbtraceId = metaError.fbtrace_id;
        throw err;
      };

      if (metaError.code === 190) {
        return fail('Token de acceso inválido o expirado');
      }

      // Error 100/33: Object does not exist or missing permissions
      if (metaError.code === 100 && metaError.error_subcode === 33) {
        return fail('El Ad Account ID no existe o no tienes permisos. Verifica que el FB_AD_ACCOUNT_ID sea correcto y que el token tenga acceso a esa cuenta.');
      }

      // Error 100 generic: Invalid parameter
      if (metaError.code === 100) {
        const detail = metaError.error_subcode ? ` (subcode: ${metaError.error_subcode})` : '';
        const traceId = metaError.fbtrace_id ? ` [trace: ${metaError.fbtrace_id}]` : '';
        return fail(`Parametro invalido${detail}: ${metaError.message}${traceId}`);
      }

      // Rate limit errors
      if (metaError.code === 17 || metaError.code === 80004) {
        return fail('Rate limit excedido. Reintenta en unos minutos.');
      }

      // Generic Meta error
      return fail(`Error de Facebook API: ${metaError.message}`);
    }
  }

  async get<T = any>(endpoint: string, params?: any): Promise<MetaApiResponse<T>> {
    return this.limiter.schedule(async () => {
      const response = await this.axios.get<MetaApiResponse<T>>(endpoint, { params });
      return response.data;
    });
  }

  async post<T = any>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<MetaApiResponse<T>> {
    return this.limiter.schedule(async () => {
      const response = await this.axios.post<MetaApiResponse<T>>(endpoint, data, config);
      return response.data;
    });
  }

  async put<T = any>(endpoint: string, data?: any): Promise<MetaApiResponse<T>> {
    return this.limiter.schedule(async () => {
      const response = await this.axios.put<MetaApiResponse<T>>(endpoint, data);
      return response.data;
    });
  }

  async delete<T = any>(endpoint: string): Promise<MetaApiResponse<T>> {
    return this.limiter.schedule(async () => {
      const response = await this.axios.delete<MetaApiResponse<T>>(endpoint);
      return response.data;
    });
  }

  async getAllPages<T>(endpoint: string, params?: any): Promise<T[]> {
    const allData: T[] = [];
    let nextUrl: string | undefined = endpoint;

    while (nextUrl) {
      const response: MetaApiResponse<T> = await this.get<T>(nextUrl, nextUrl === endpoint ? params : undefined);

      if (response.data) {
        allData.push(...response.data);
      }

      nextUrl = response.paging?.next;
      if (nextUrl) {
        nextUrl = nextUrl.replace(`${this.config.baseUrl}/${this.config.apiVersion}`, '');
      }
    }

    return allData;
  }

  async batch(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const batchData = {
      batch: requests.map(req => ({
        method: req.method,
        relative_url: req.relative_url,
        body: req.body ? JSON.stringify(req.body) : undefined,
        name: req.name,
        omit_response_on_success: req.omit_response_on_success,
        depends_on: req.depends_on,
      })),
    };

    const response = await this.post<BatchResponse>('/', batchData);
    return response.data || [];
  }

  async getRateLimitStatus(): Promise<any> {
    return {
      reservoir: await this.limiter.currentReservoir(),
      running: this.limiter.counts().RUNNING,
      queued: this.limiter.counts().QUEUED,
    };
  }

  updateRateLimit(settings: { minTime?: number; maxConcurrent?: number; reservoir?: number }): void {
    this.limiter.updateSettings(settings);
  }
}