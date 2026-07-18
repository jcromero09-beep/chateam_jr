import { describe, expect, test } from "@jest/globals";
import {
  FAL_MODEL_CATALOG,
  FAL_CATALOG_VERSION,
  resolveCatalogModelId
} from "../../services/UGCProviders/fal/catalog";

/**
 * Snapshot del catálogo público. El test "congela" el shape esperado
 * para que el frontend no se rompa silenciosamente si alguien edita el
 * catálogo sin migrar el contrato.
 */
describe("FAL_MODEL_CATALOG snapshot", () => {
  test("expone exactamente 15 modelos", () => {
    expect(FAL_MODEL_CATALOG).toHaveLength(15);
  });

  test("incluye los 15 keys esperados", () => {
    const keys = FAL_MODEL_CATALOG.map(m => m.key).sort();
    expect(keys).toEqual(
      [
        "elevenlabs-tts-v3",
        "f5-tts",
        "kling-v2.6-pro-i2v",
        "kling-v2.6-pro-t2v",
        "kling-v3-pro-i2v",
        "kling-v3-pro-motion-control",
        "kling-v3-pro-t2v",
        "latentsync",
        "nano-banana-2",
        "nano-banana-2-edit",
        "seedance-v1-pro-i2v",
        "sync-lipsync",
        "veo3.1-fast-i2v",
        "veo3.1-i2v",
        "veo3.1-t2v"
      ].sort()
    );
  });

  test("cada entry tiene los campos mínimos requeridos por el frontend", () => {
    for (const entry of FAL_MODEL_CATALOG) {
      expect(typeof entry.key).toBe("string");
      expect(typeof entry.displayName).toBe("string");
      expect(typeof entry.modelId).toBe("string");
      expect([
        "image-to-video",
        "motion-control",
        "image-edit",
        "text-to-image",
        "text-to-video",
        "text-to-speech",
        "lipsync"
      ]).toContain(entry.type);
      expect([
        "text-to-image",
        "image-to-image",
        "text-to-video",
        "image-to-video",
        "video-to-video",
        "text-to-speech",
        "lipsync"
      ]).toContain(entry.category);
      expect(typeof entry.description).toBe("string");
      expect(typeof entry.pricing.estimateUsd).toBe("number");
      expect(typeof entry.pricing.displayLabel).toBe("string");
      expect(Array.isArray(entry.configurableFields)).toBe(true);
      expect(Array.isArray(entry.tags)).toBe(true);
      expect(typeof entry.playgroundUrl).toBe("string");
      expect(entry.playgroundUrl).toMatch(/^https:\/\/fal\.ai\//);
      expect(Array.isArray(entry.requiresCampaignAssets)).toBe(true);
      // Algunos modelos PR#2 no tienen preview de video todavía.
      if (entry.previewVideoUrl !== null) {
        expect(typeof entry.previewVideoUrl).toBe("string");
      }
    }
  });

  test("motion-control declara motionReferenceVideo en requiresCampaignAssets", () => {
    const motion = FAL_MODEL_CATALOG.find(
      m => m.key === "kling-v3-pro-motion-control"
    );
    expect(motion?.requiresCampaignAssets).toContain("motionReferenceVideo");
  });

  test("version está bumpeada", () => {
    expect(FAL_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("resolveCatalogModelId honra envOverride", () => {
    const entry = FAL_MODEL_CATALOG.find(
      m => m.key === "kling-v2.6-pro-i2v"
    );
    expect(entry).toBeDefined();
    if (!entry) return;

    const originalEnv = process.env[entry.envOverride!];
    try {
      delete process.env[entry.envOverride!];
      expect(resolveCatalogModelId(entry)).toBe(entry.modelId);

      process.env[entry.envOverride!] = "fal-ai/custom-model";
      expect(resolveCatalogModelId(entry)).toBe("fal-ai/custom-model");
    } finally {
      if (originalEnv === undefined) {
        delete process.env[entry.envOverride!];
      } else {
        process.env[entry.envOverride!] = originalEnv;
      }
    }
  });
});
