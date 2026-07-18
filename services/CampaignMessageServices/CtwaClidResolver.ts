type JsonLike = Record<string, any> | null | undefined;

const CTWA_SAFE_CHARS = /^[A-Za-z0-9_-]+$/;

const asCleanString = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;

  if (value instanceof Uint8Array) {
    const utf8Value = Buffer.from(value).toString("utf8").trim();
    if (utf8Value) return utf8Value;

    const base64Value = Buffer.from(value).toString("base64").trim();
    return base64Value || undefined;
  }

  if (Buffer.isBuffer(value)) {
    const utf8Value = value.toString("utf8").trim();
    if (utf8Value) return utf8Value;

    const base64Value = value.toString("base64").trim();
    return base64Value || undefined;
  }

  const text = String(value).trim();
  return text || undefined;
};

const isLikelyCtwaClid = (value?: string): boolean => {
  if (!value) return false;
  if (value.length < 20 || value.length > 1024) return false;
  return CTWA_SAFE_CHARS.test(value);
};

const decodeBase64Like = (value: string): string | undefined => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return undefined;

  try {
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8").trim();
    if (!decoded || /[\u0000-\u001F\u007F]/.test(decoded)) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
};

export const normalizeCtwaClid = (value: any): string | undefined => {
  const direct = asCleanString(value);
  if (!direct) return undefined;

  if (isLikelyCtwaClid(direct) && direct.startsWith("Afi")) {
    return direct;
  }

  const decoded = decodeBase64Like(direct);
  if (isLikelyCtwaClid(decoded) && decoded?.startsWith("Afi")) {
    return decoded;
  }

  if (isLikelyCtwaClid(direct)) {
    return direct;
  }

  if (isLikelyCtwaClid(decoded)) {
    return decoded;
  }

  return undefined;
};

export const serializeConversionData = (value: any): string | undefined => {
  const direct = asCleanString(value);
  if (!direct) return undefined;

  const decoded = decodeBase64Like(direct);
  if (isLikelyCtwaClid(decoded)) return decoded;

  return direct;
};

const collectObjectCandidates = (rawData: JsonLike): any[] => {
  if (!rawData || typeof rawData !== "object") return [];

  const contextInfo = rawData.contextInfo || rawData.context_info;
  const externalAdReply =
    rawData.externalAdReply ||
    rawData.external_ad_reply ||
    contextInfo?.externalAdReply ||
    contextInfo?.external_ad_reply;

  return [
    rawData.ctwaClid,
    rawData.ctwa_clid,
    rawData.ctwa_clid_id,
    rawData.conversionData,
    rawData.conversion_data,
    rawData.ctwaPayload,
    rawData.ctwa_payload,
    externalAdReply?.ctwaClid,
    externalAdReply?.ctwa_clid,
    contextInfo?.ctwaClid,
    contextInfo?.ctwa_clid,
    contextInfo?.conversionData,
    contextInfo?.conversion_data
  ];
};

export const resolveCampaignCtwaClid = ({
  explicitCtwaClid,
  rawData
}: {
  explicitCtwaClid?: any;
  rawData?: JsonLike;
}): string | undefined => {
  const explicit = normalizeCtwaClid(explicitCtwaClid);
  if (explicit) return explicit;

  for (const candidate of collectObjectCandidates(rawData)) {
    const normalized = normalizeCtwaClid(candidate);
    if (normalized) return normalized;
  }

  return undefined;
};
