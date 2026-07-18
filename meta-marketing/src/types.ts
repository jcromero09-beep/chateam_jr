export interface MetaConfig {
  accessToken: string;
  /**
   * [Fase2] App secret para firmar cada llamada con appsecret_proof.
   * SOLO debe pasarse si pertenece a la MISMA app que emitio el token: con un
   * secret de otra app, Meta rechaza TODAS las llamadas (error 190). Quien
   * construye el cliente es responsable de verificar la correspondencia.
   */
  appSecret?: string;
  apiVersion?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  budget_remaining?: number;
  account_id: string;
  adsets?: AdSet[];
  insights?: CampaignInsights;
}

export interface AdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  created_time: string;
  updated_time: string;
  start_time?: string;
  end_time?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  optimization_goal: string;
  billing_event: string;
  targeting: Targeting;
  ads?: Ad[];
  insights?: AdSetInsights;
}

export interface Ad {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
  created_time: string;
  updated_time: string;
  creative: AdCreative;
  insights?: AdInsights;
}

export interface AdCreative {
  id: string;
  name: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_url?: string;
  call_to_action?: {
    type: string;
    value?: any;
  };
  object_story_spec?: any;
}

export interface Targeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: any[];
    cities?: any[];
    custom_locations?: any[];
  };
  interests?: any[];
  behaviors?: any[];
  custom_audiences?: string[];
  lookalike_audiences?: string[];
  excluded_custom_audiences?: string[];
}

export interface CampaignInsights {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpp: number;
  conversions?: number;
  conversion_rate?: number;
  cost_per_conversion?: number;
  roas?: number;
  video_views?: number;
  video_view_rate?: number;
  date_start: string;
  date_stop: string;
}

export interface AdSetInsights extends CampaignInsights {
  adset_id: string;
  adset_name: string;
}

export interface AdInsights extends CampaignInsights {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  adset_name: string;
}

export interface InsightsQuery {
  level: 'account' | 'campaign' | 'adset' | 'ad';
  fields: string[];
  time_range?: {
    since: string;
    until: string;
  } | {
    time_preset: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'last_30_days' | 'last_7_days' | 'last_14_days' | 'last_90_days';
  };
  date_preset?: string;
  breakdowns?: string[];
  action_breakdowns?: string[];
  filtering?: any[];
  sort?: string[];
  limit?: number;
  time_increment?: number | string;
}

export interface MetaApiResponse<T = any> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  summary?: any;
  // Properties returned by POST/DELETE operations
  id?: string;
  success?: boolean;
}

export interface MetaError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx';
  filename?: string;
  includeHeaders?: boolean;
  dateFormat?: string;
}

export interface RateLimitInfo {
  call_count: number;
  total_time: number;
  total_cputime: number;
  type: string;
  estimated_time_to_regain_access?: number;
}

export interface BatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  relative_url: string;
  body?: any;
  name?: string;
  omit_response_on_success?: boolean;
  depends_on?: string;
}

export interface BatchResponse {
  code: number;
  headers?: any[];
  body?: string;
}

// Conversions API Types
export interface ConversionEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  event_source_url?: string;
  user_data: UserData;
  custom_data?: CustomData;
  action_source: 'website' | 'email' | 'app' | 'phone_call' | 'chat' | 'physical_store' | 'system_generated' | 'business_messaging' | 'other';
  messaging_channel?: 'whatsapp' | 'messenger' | 'instagram';
  ctwa_clid?: string;
}

export interface UserData {
  em?: string[];  // emails (hashed with SHA-256)
  ph?: string[];  // phone numbers (hashed with SHA-256)
  fn?: string[];  // first name (hashed with SHA-256)
  ln?: string[];  // last name (hashed with SHA-256)
  ct?: string[];  // city (hashed with SHA-256)
  st?: string[];  // state (hashed with SHA-256)
  zp?: string[];  // zip/postal code (hashed with SHA-256)
  country?: string[];  // country code (hashed with SHA-256)
  external_id?: string[];  // customer ID (hashed with SHA-256)
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;  // Facebook click ID (from URL _fbc parameter)
  fbp?: string;  // Facebook browser ID (from _fbp cookie)
  ctwa_clid?: string;  // Click-to-WhatsApp click ID
  whatsapp_business_account_id?: string;  // WhatsApp Business Account ID (required for CTWA attribution)
}

export interface CustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  contents?: Array<{
    id: string;
    quantity: number;
    item_price?: number;
  }>;
  order_id?: string;
  predicted_ltv?: number;
  num_items?: number;
  search_string?: string;
  status?: string;
}

export interface ConversionEventRequest {
  data: ConversionEvent[];
  test_event_code?: string;
  partner_agent?: string;
}

export interface ConversionEventResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

export interface DatasetResponse {
  id: string;
}