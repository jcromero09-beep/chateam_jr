/**
 * Tests unitarios — MetaCustomConversionService.
 *
 * Cubre:
 *  - normalizeRule: equivalencia independiente de orden/espacios/objeto-vs-string
 *  - check apagado → status disabled, sin tocar Meta
 *  - crear custom conversion cuando no existe
 *  - reusar custom conversion existente por (event_source_id + rule)
 *  - error de Meta → status failed, NUNCA lanza (no rompe el tag)
 *
 * Mockea getCompanyMetaConfig, FacebookDataset, getApiVersion y axios.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

const axiosMock: any = { get: jest.fn(), post: jest.fn() };
const getCompanyMetaConfigMock = jest.fn();
const FacebookDatasetMock: any = { findOne: jest.fn() };

jest.mock("axios", () => ({ __esModule: true, default: axiosMock }));
jest.mock("../../models/Tag", () => ({ __esModule: true, default: {} }));
jest.mock("../../models/FacebookDataset", () => ({ __esModule: true, default: FacebookDatasetMock }));
jest.mock("../../services/MetaMarketingService", () => ({
  __esModule: true,
  getCompanyMetaConfig: getCompanyMetaConfigMock
}));
jest.mock("../../services/FacebookConversionService/SendWebsiteEvent", () => ({
  __esModule: true,
  getApiVersion: () => "v19.0"
}));

import {
  syncCustomConversionForTag,
  normalizeRule
} from "../../services/FacebookConversionService/MetaCustomConversionService";

const makeTag = (over: any = {}) => ({
  id: 10, companyId: 1, name: "Interés", key: "interest",
  sendMetaConversion: true,
  metaEventName: "Contact",
  metaLeadStatus: "interest",
  metaCustomEventType: "CONTACT",
  metaConversionName: "Kanban Interés",
  metaRule: '{"and":[{"event":{"eq":"Contact"}},{"lead_status":{"eq":"interest"}}]}',
  update: jest.fn(async function (this: any, patch: any) { Object.assign(this, patch); }),
  ...over
});

beforeEach(() => {
  axiosMock.get.mockReset();
  axiosMock.post.mockReset();
  getCompanyMetaConfigMock.mockReset();
  FacebookDatasetMock.findOne.mockReset();

  getCompanyMetaConfigMock.mockResolvedValue({ token: "TOKEN", accountId: "123", mode: "production" });
  FacebookDatasetMock.findOne.mockResolvedValue({ datasetId: "DS1" });
  axiosMock.get.mockResolvedValue({ data: { data: [] } });
  axiosMock.post.mockResolvedValue({ data: { id: "CC123" } });
});

describe("normalizeRule", () => {
  test("equivale independiente del orden de claves y espacios", () => {
    const a = '{"and":[{"event":{"eq":"Contact"}},{"lead_status":{"eq":"interest"}}]}';
    const b = '{ "and": [ { "event": { "eq": "Contact" } }, { "lead_status": { "eq": "interest" } } ] }';
    expect(normalizeRule(a)).toBe(normalizeRule(b));
  });

  test("acepta objeto o string indistintamente", () => {
    const obj = { and: [{ event: { eq: "X" } }] };
    const str = '{"and":[{"event":{"eq":"X"}}]}';
    expect(normalizeRule(obj)).toBe(normalizeRule(str));
  });
});

describe("syncCustomConversionForTag", () => {
  test("check apagado → status disabled, no toca Meta", async () => {
    const tag = makeTag({ sendMetaConversion: false });
    const res = await syncCustomConversionForTag(tag as any);
    expect(res.status).toBe("disabled");
    expect(getCompanyMetaConfigMock).not.toHaveBeenCalled();
    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(tag.metaConversionStatus).toBe("disabled");
  });

  test("config incompleta (sin rule) → failed sin llamar a Meta", async () => {
    const tag = makeTag({ metaRule: "" });
    const res = await syncCustomConversionForTag(tag as any);
    expect(res.status).toBe("failed");
    expect(getCompanyMetaConfigMock).not.toHaveBeenCalled();
  });

  test("crea custom conversion cuando no existe", async () => {
    const tag = makeTag();
    const res = await syncCustomConversionForTag(tag as any);
    expect(res.ok).toBe(true);
    expect(res.status).toBe("synced");
    expect(res.reused).toBe(false);
    expect(res.customConversionId).toBe("CC123");
    expect(axiosMock.post).toHaveBeenCalledTimes(1);
    const [url, body] = axiosMock.post.mock.calls[0];
    expect(url).toContain("/act_123/customconversions");
    expect(body.event_source_id).toBe("DS1");
    expect(body.custom_event_type).toBe("CONTACT");
    expect(tag.metaConversionStatus).toBe("synced");
    expect(tag.metaCustomConversionId).toBe("CC123");
  });

  test("reusa custom conversion existente por event_source_id + rule", async () => {
    const tag = makeTag();
    axiosMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: "EXISTING1",
            event_source_id: "DS1",
            rule: '{"and":[{"lead_status":{"eq":"interest"}},{"event":{"eq":"Contact"}}]}'
          }
        ]
      }
    });

    const res = await syncCustomConversionForTag(tag as any);
    expect(res.ok).toBe(true);
    expect(res.reused).toBe(true);
    expect(res.customConversionId).toBe("EXISTING1");
    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(tag.metaCustomConversionId).toBe("EXISTING1");
  });

  test("error de Meta al crear → failed, NO lanza", async () => {
    const tag = makeTag();
    axiosMock.post.mockRejectedValueOnce({
      response: { data: { error: { message: "Permisos insuficientes", code: 10 } } }
    });

    const res = await syncCustomConversionForTag(tag as any);
    expect(res.ok).toBe(false);
    expect(res.status).toBe("failed");
    expect(tag.metaConversionStatus).toBe("failed");
    expect(tag.metaLastError).toContain("Permisos insuficientes");
  });

  test("sin dataset ni pixel → failed", async () => {
    const tag = makeTag();
    FacebookDatasetMock.findOne.mockResolvedValueOnce(null);
    axiosMock.get.mockResolvedValueOnce({ data: { data: [] } }); // adspixels vacío
    const res = await syncCustomConversionForTag(tag as any);
    expect(res.status).toBe("failed");
    expect(String(res.error)).toContain("event_source_id");
  });
});
