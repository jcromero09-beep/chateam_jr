import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import Bottleneck from 'bottleneck';
import { MetaConfig, MetaApiResponse, MetaError, RateLimitInfo, BatchRequest, BatchResponse } from './types';

export class MetaClient {
  private axios: AxiosInstance;
  private limiter: Bottleneck;
  private config: Required<MetaConfig>;

  constructor(config: MetaConfig) {
    this.config = {
      accessToken: config.accessToken,
      apiVersion: config.apiVersion || 'v24.0',
      baseUrl: config.baseUrl || 'https://graph.facebook.com',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
    };

    this.axios = axios.create({
      baseURL: `${this.config.baseUrl}/${this.config.apiVersion}`,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    axiosRetry(this.axios, {
      retries: this.config.retries,
      retryDelay: (retryCount) => {
        return Math.min(this.config.retryDelay * Math.pow(2, retryCount - 1), 10000);
      },
      retryCondition: (error) => {
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
        return response;
      },
      (error) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`❌ ERROR RESPONSE`);
        console.log(`${'='.repeat(80)}`);
        console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
        console.log(`📍 URL: ${error.config?.url}`);
        console.log(`📋 Status: ${error.response?.status || 'N/A'}`);
        console.log(`📄 Error Data:`, JSON.stringify(error.response?.data, null, 2));
        console.log(`${'='.repeat(80)}\n`);
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleRateLimit(response: AxiosResponse): void {
    const usageHeader = response.headers['x-business-use-case-usage'];
    const adAccountUsage = response.headers['x-ad-account-usage'];
    const appUsage = response.headers['x-app-usage'];

    if (usageHeader || adAccountUsage || appUsage) {
      const rateLimitInfo: RateLimitInfo = {
        call_count: 0,
        total_time: 0,
        total_cputime: 0,
        type: 'business',
      };

      if (usageHeader) {
        try {
          const usage = JSON.parse(usageHeader);
          Object.assign(rateLimitInfo, usage);
        } catch (e) {
          console.warn('No se pudo parsear x-business-use-case-usage:', usageHeader);
        }
      }

      if (rateLimitInfo.call_count > 80) {
        console.warn('⚠️ Rate limit cercano:', rateLimitInfo);
        this.limiter.updateSettings({
          minTime: 500,
          maxConcurrent: 2,
        });
      }
    }
  }

  private handleApiError(error: any): void {
    if (error.response?.data?.error) {
      const metaError: MetaError = error.response.data.error;
      console.error('❌ Meta API Error:', {
        message: metaError.message,
        type: metaError.type,
        code: metaError.code,
        subcode: metaError.error_subcode,
        fbtrace_id: metaError.fbtrace_id,
        url: error.config?.url,
        method: error.config?.method,
      });

      if (metaError.code === 190) {
        throw new Error('Token de acceso inválido o expirado');
      }

      // Error 100/33: Object does not exist or missing permissions
      if (metaError.code === 100 && metaError.error_subcode === 33) {
        throw new Error('El Ad Account ID no existe o no tienes permisos. Verifica que el FB_AD_ACCOUNT_ID sea correcto y que el token tenga acceso a esa cuenta.');
      }

      // Error 100 generic: Invalid parameter
      if (metaError.code === 100) {
        const detail = metaError.error_subcode ? ` (subcode: ${metaError.error_subcode})` : '';
        const traceId = metaError.fbtrace_id ? ` [trace: ${metaError.fbtrace_id}]` : '';
        throw new Error(`Parametro invalido${detail}: ${metaError.message}${traceId}`);
      }

      // Rate limit errors
      if (metaError.code === 17 || metaError.code === 80004) {
        throw new Error('Rate limit excedido. Reintenta en unos minutos.');
      }

      // Generic Meta error
      throw new Error(`Error de Facebook API: ${metaError.message}`);
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