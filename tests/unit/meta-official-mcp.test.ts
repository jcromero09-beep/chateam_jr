/**
 * Tests del MCP oficial de Meta Ads.
 *
 * Verifica:
 *  1. status sin conexión devuelve disconnected.
 *  2. mark-connected fue eliminado como bypass (devuelve 403/error).
 *  3. tools/list falla si no hay OAuth real.
 *  4. Al pedir provider="meta_official_mcp" sin conexión real, NO se llama MetaMarketingService (sin fallback).
 *  5. Provider meta_graph_internal sigue funcionando independiente.
 */

import MetaOfficialMCPService from "../../services/AIAgentServices/MetaOfficialMCPService";
import MetaOfficialMCPClient from "../../services/AIAgentServices/MetaOfficialMCPClientService";
import * as MetaMarketingService from "../../services/MetaMarketingService";

// Mock del modelo Sequelize (sin BD real en estos unit tests)
jest.mock("../../models/MetaOfficialMcpConnection", () => {
  const fakeRecord: any = {
    companyId: 999,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    status: "not_connected",
    mcpServerUrl: "https://mcp.facebook.com/ads",
    scopes: [],
    lastToolsListAt: null,
    lastConnectedAt: null,
    lastError: null,
    update: jest.fn(async (patch: any) => {
      Object.assign(fakeRecord, patch);
      return fakeRecord;
    }),
    reload: jest.fn(async () => fakeRecord)
  };
  const ModelMock: any = {
    __fake: fakeRecord,
    findOne: jest.fn(async (q: any) => {
      if (q?.where?.companyId === 999) return fakeRecord;
      return null;
    }),
    findOrCreate: jest.fn(async () => [fakeRecord, true])
  };
  return { __esModule: true, default: ModelMock };
});

// Mock de CompaniesSettings — devuelve facebookAppId per-company como fallback legacy
jest.mock("../../models/CompaniesSettings", () => {
  const ModelMock: any = {
    findOne: jest.fn(async (q: any) => {
      if (q?.where?.companyId === 999) {
        return { companyId: 999, facebookAppId: null }; // sin App por company → cae a fallback env
      }
      if (q?.where?.companyId === 6) {
        return { companyId: 6, facebookAppId: "706620035176901" }; // company con su propia app
      }
      return null;
    })
  };
  return { __esModule: true, default: ModelMock };
});

// Espiar MetaMarketingService — debe NUNCA ser invocado por el flujo MCP oficial
jest.mock("../../services/MetaMarketingService", () => ({
  __esModule: true,
  getCampaigns: jest.fn(async () => []),
  getCampaignById: jest.fn(async () => null),
  getAds: jest.fn(async () => []),
  getAggregatedInsights: jest.fn(async () => ({})),
  pauseAllInCampaign: jest.fn(async () => undefined),
  updateCampaign: jest.fn(async () => ({})),
  duplicateCampaign: jest.fn(async () => ({ id: "dup" })),
  createCampaign: jest.fn(async () => ({ id: "new" })),
  getCompanyMetaConfig: jest.fn(async () => ({
    token: "fake",
    accountId: "act_x",
    mode: "production"
  }))
}));

describe("MetaOfficialMCPService — modo desconectado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getStatus(companyId=999) devuelve connected=false sin token", async () => {
    const status = await MetaOfficialMCPService.getStatus(999);
    expect(status.provider).toBe("meta_official_mcp");
    expect(status.connected).toBe(false);
    expect(status.fallbackProvider).toBe("meta_graph_internal");
    expect(status.fallbackUsed).toBe(false);
    expect(status.toolsValidated).toBe(false);
    // NUNCA debe haber llamado a MetaMarketingService
    expect(MetaMarketingService.getCampaigns).not.toHaveBeenCalled();
    expect(MetaMarketingService.getCompanyMetaConfig).not.toHaveBeenCalled();
  });

  test("markConnected fue eliminado como bypass (lanza 403)", async () => {
    await expect(MetaOfficialMCPService.markConnected(999)).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_BYPASS_DENIED"),
      statusCode: 403
    });
  });

  test("listTools sin token lanza ERR_AUTH_REQUIRED", async () => {
    await expect(MetaOfficialMCPClient.listTools(999)).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_AUTH_REQUIRED")
    });
    // Debe NO haber tocado el adaptador interno
    expect(MetaMarketingService.getCampaigns).not.toHaveBeenCalled();
  });

  test("callTool sin token lanza ERR_AUTH_REQUIRED y NO usa fallback", async () => {
    await expect(
      MetaOfficialMCPClient.callTool(999, "any_tool", {})
    ).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_AUTH_REQUIRED")
    });
    expect(MetaMarketingService.pauseAllInCampaign).not.toHaveBeenCalled();
    expect(MetaMarketingService.updateCampaign).not.toHaveBeenCalled();
  });

  test("isReallyConnected devuelve false sin token", async () => {
    const ok = await MetaOfficialMCPClient.isReallyConnected(999);
    expect(ok).toBe(false);
  });

  test("buildAuthorizationUrl falla si no hay App ID en BD ni en env", async () => {
    const oldMcp = process.env.META_OFFICIAL_MCP_CLIENT_ID;
    const oldFb = process.env.FACEBOOK_APP_ID;
    delete process.env.META_OFFICIAL_MCP_CLIENT_ID;
    delete process.env.FACEBOOK_APP_ID;
    try {
      await expect(
        MetaOfficialMCPClient.buildAuthorizationUrl({ companyId: 999 })
      ).rejects.toMatchObject({
        message: expect.stringContaining("MCP_OFFICIAL_INVALID_CLIENT_ID")
      });
    } finally {
      if (oldMcp !== undefined) process.env.META_OFFICIAL_MCP_CLIENT_ID = oldMcp;
      if (oldFb !== undefined) process.env.FACEBOOK_APP_ID = oldFb;
    }
  });

  test("buildAuthorizationUrl usa META_OFFICIAL_MCP_CLIENT_ID aunque exista facebookAppId per-company", async () => {
    // El MCP debe usar una App fija para evitar redirects mezclados entre companies.
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "3943706329209315";
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    const { url } = await MetaOfficialMCPClient.buildAuthorizationUrl({
      companyId: 6
    });
    expect(url).toContain("client_id=3943706329209315");
    expect(url).not.toContain("client_id=706620035176901");
  });

  test("buildAuthorizationUrl usa CompaniesSettings.facebookAppId solo si no hay env global", async () => {
    const oldMcp = process.env.META_OFFICIAL_MCP_CLIENT_ID;
    const oldFb = process.env.FACEBOOK_APP_ID;
    delete process.env.META_OFFICIAL_MCP_CLIENT_ID;
    delete process.env.FACEBOOK_APP_ID;
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    try {
      const { url } = await MetaOfficialMCPClient.buildAuthorizationUrl({
        companyId: 6
      });
      expect(url).toContain("client_id=706620035176901");
    } finally {
      if (oldMcp !== undefined) process.env.META_OFFICIAL_MCP_CLIENT_ID = oldMcp;
      if (oldFb !== undefined) process.env.FACEBOOK_APP_ID = oldFb;
    }
  });

  test("buildAuthorizationUrl cae a env cuando company no tiene App configurada", async () => {
    // Company 999 → facebookAppId: null → debe usar META_OFFICIAL_MCP_CLIENT_ID
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "global_app_999";
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    const { url, state } = await MetaOfficialMCPClient.buildAuthorizationUrl({
      companyId: 999
    });
    expect(url).toContain("client_id=global_app_999");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("state=");
    expect(state).toBeTruthy();
  });

  test("buildAuthorizationUrl deriva redirect_uri de BACKEND_URL si no hay override", async () => {
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "global_app_xyz";
    delete process.env.META_OFFICIAL_MCP_REDIRECT_URI;
    process.env.BACKEND_URL = "https://otro.example.com";
    try {
      const { url } = await MetaOfficialMCPClient.buildAuthorizationUrl({
        companyId: 999
      });
      expect(decodeURIComponent(url)).toContain(
        "redirect_uri=https://otro.example.com/meta-marketing/agent/mcp/callback"
      );
    } finally {
      delete process.env.BACKEND_URL;
    }
  });

  test("buildAuthorizationUrl devuelve expiresInMinutes y NO devuelve codeVerifier al caller", async () => {
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "global_app_999";
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    const r = await MetaOfficialMCPClient.buildAuthorizationUrl({ companyId: 999 });
    expect(r).toHaveProperty("url");
    expect(r).toHaveProperty("state");
    expect(r).toHaveProperty("expiresInMinutes");
    expect(typeof r.expiresInMinutes).toBe("number");
    expect(r.expiresInMinutes).toBeGreaterThan(0);
    // Garantía: el codeVerifier NUNCA se filtra fuera del backend
    expect(r).not.toHaveProperty("codeVerifier");
    expect(r).not.toHaveProperty("code_verifier");
  });

  test("startConnection (fachada Service) devuelve authorizationUrl y NUNCA codeVerifier", async () => {
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "global_app_999";
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    const status = await MetaOfficialMCPService.startConnection(999);
    expect(status.provider).toBe("meta_official_mcp");
    expect(status.connected).toBe(false);
    expect(status.authorizationUrl).toContain("https://www.facebook.com/v25.0/dialog/oauth");
    expect(status.expiresInMinutes).toBeGreaterThan(0);
    expect(JSON.stringify(status)).not.toContain("codeVerifier");
    expect(JSON.stringify(status)).not.toContain("code_verifier");
  });

  test("authorizationUrl contiene los 4 scopes Meta Ads correctos", async () => {
    process.env.META_OFFICIAL_MCP_CLIENT_ID = "global_app_999";
    process.env.META_OFFICIAL_MCP_REDIRECT_URI =
      "https://appro.chateam.ws/meta-marketing/agent/mcp/callback";
    const { url } = await MetaOfficialMCPClient.buildAuthorizationUrl({ companyId: 999 });
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope") || "";
    expect(scope).toContain("ads_management");
    expect(scope).toContain("ads_read");
    expect(scope).toContain("catalog_management");
    expect(scope).toContain("business_management");
  });

  test("handleCallback rechaza state inválido con MCP_OFFICIAL_INVALID_STATE", async () => {
    await expect(
      MetaOfficialMCPClient.handleCallback({ code: "fake_code", state: "state_inexistente_xyz" })
    ).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_INVALID_STATE")
    });
  });

  test("handleCallback rechaza si faltan code o state", async () => {
    await expect(
      MetaOfficialMCPClient.handleCallback({ code: "", state: "x" })
    ).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_CALLBACK_INVALID")
    });
    await expect(
      MetaOfficialMCPClient.handleCallback({ code: "x", state: "" })
    ).rejects.toMatchObject({
      message: expect.stringContaining("MCP_OFFICIAL_CALLBACK_INVALID")
    });
  });

  test("disconnect limpia tokens MCP de la company", async () => {
    // El mock fakeRecord ya está; disconnect debe ponerlos en null
    await MetaOfficialMCPClient.disconnect(999);
    const conn = await MetaOfficialMCPClient.getConnection(999);
    expect(conn?.accessToken).toBe(null);
    expect(conn?.refreshToken).toBe(null);
    expect(conn?.status).toBe("not_connected");
  });

  test("provider routing: pedir MCP oficial sin conexión NO ejecuta MetaMarketingService", async () => {
    // Simulamos lo que hace MetaAdsAgentChatService.ensureMcpOfficialReady
    const ok = await MetaOfficialMCPClient.isReallyConnected(999);
    expect(ok).toBe(false);
    // Verificamos que ningún método de MetaMarketingService fue llamado
    expect(MetaMarketingService.getCampaigns).not.toHaveBeenCalled();
    expect(MetaMarketingService.getAds).not.toHaveBeenCalled();
    expect(MetaMarketingService.getAggregatedInsights).not.toHaveBeenCalled();
    expect(MetaMarketingService.pauseAllInCampaign).not.toHaveBeenCalled();
    expect(MetaMarketingService.updateCampaign).not.toHaveBeenCalled();
    expect(MetaMarketingService.duplicateCampaign).not.toHaveBeenCalled();
    expect(MetaMarketingService.createCampaign).not.toHaveBeenCalled();
    expect(MetaMarketingService.getCompanyMetaConfig).not.toHaveBeenCalled();
  });
});
