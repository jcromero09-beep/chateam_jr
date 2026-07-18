import { describe, expect, test } from "@jest/globals";
import {
  mapJobSet,
  mapSoulStyle,
  mapMotion,
  buildGeneratePayload
} from "../../services/UGCProviders/higgsfield/mapper";
import {
  getCatalogModels,
  getCatalogModel,
  estimateCatalogCostUsd
} from "../../services/UGCProviders/higgsfield/catalog";
import { HF_ENDPOINTS } from "../../services/UGCProviders/higgsfield/types";
import type {
  HiggsfieldJobSet,
  HiggsfieldSoulStyle,
  HiggsfieldMotion
} from "../../services/UGCProviders/higgsfield/types";

describe("Higgsfield mapper — job-set", () => {
  test("mapJobSet: completed con results.raw/min → succeeded + outputs", () => {
    const js: HiggsfieldJobSet = {
      id: "jobset_1",
      jobs: [
        {
          id: "j1",
          status: "completed",
          results: {
            raw: { url: "https://x/v.mp4", type: "video" },
            min: { url: "https://x/thumb.jpg", type: "image" }
          }
        }
      ]
    };
    const pj = mapJobSet(js);
    expect(pj.providerJobId).toBe("jobset_1");
    expect(pj.status).toBe("succeeded");
    expect(pj.outputs?.[0]).toMatchObject({
      url: "https://x/v.mp4",
      mediaType: "video",
      thumbnailUrl: "https://x/thumb.jpg"
    });
  });

  test("mapJobSet: estados in_progress / failed / nsfw", () => {
    expect(mapJobSet({ id: "a", jobs: [{ id: "j", status: "in_progress" }] }).status).toBe("processing");
    expect(mapJobSet({ id: "a", jobs: [{ id: "j", status: "queued" }] }).status).toBe("queued");
    const failed = mapJobSet({ id: "a", jobs: [{ id: "j", status: "failed" }] });
    expect(failed.status).toBe("failed");
    const nsfw = mapJobSet({ id: "a", jobs: [{ id: "j", status: "nsfw" }] });
    expect(nsfw.status).toBe("failed");
    expect(nsfw.error).toMatch(/NSFW/i);
  });

  test("mapSoulStyle / mapMotion → StylePreset con params correctos", () => {
    const style: HiggsfieldSoulStyle = { id: "s1", name: "Cinematic", preview_url: "p.jpg" };
    expect(mapSoulStyle(style)).toMatchObject({
      id: "s1",
      label: "Cinematic",
      category: "Estilo",
      previewUrl: "p.jpg",
      params: { style_id: "s1" }
    });
    const motion: HiggsfieldMotion = { id: "m1", name: "Crane Up", preview_url: "m.mp4" };
    expect(mapMotion(motion)).toMatchObject({
      id: "m1",
      label: "Crane Up",
      category: "Cámara",
      params: { __motionId: "m1" }
    });
  });
});

describe("Higgsfield mapper — buildGeneratePayload (registro real)", () => {
  test("Soul: quality + width_and_height (lista permitida) + batch_size + style_id", () => {
    const { endpoint, params } = buildGeneratePayload({
      modelId: HF_ENDPOINTS.soulText2Image,
      prompt: "un retrato",
      aspectRatio: "9:16",
      resolution: "1080p",
      count: 4,
      styleId: "s1"
    });
    expect(endpoint).toBe("/v1/text2image/soul");
    expect(params).toMatchObject({
      prompt: "un retrato",
      quality: "1080p",
      width_and_height: "1152x2048", // valor REAL permitido por la API
      batch_size: 4,
      style_id: "s1",
      enhance_prompt: true
    });
    expect(params.aspect_ratio).toBeUndefined(); // soul no usa aspect_ratio
  });

  test("DoP: model, input_images desde references, motions desde preset", () => {
    const { endpoint, params } = buildGeneratePayload({
      modelId: HF_ENDPOINTS.dopImage2Video,
      prompt: "anímalo",
      references: ["https://cdn/img.jpg"],
      params: { __motionId: "m1", model: "dop-turbo" }
    });
    expect(endpoint).toBe("/v1/image2video/dop");
    expect(params).toMatchObject({
      model: "dop-turbo",
      prompt: "anímalo",
      input_images: [{ type: "image_url", image_url: "https://cdn/img.jpg" }],
      motions: [{ id: "m1", strength: 1 }]
    });
  });

  test("Kling: input_image (singular), model variant, duration", () => {
    const { endpoint, params } = buildGeneratePayload({
      modelId: "/v1/image2video/kling",
      prompt: "anímalo",
      references: ["https://cdn/a.jpg"],
      duration: 10,
      params: { model: "kling-v2-1-master" }
    });
    expect(endpoint).toBe("/v1/image2video/kling");
    expect(params).toMatchObject({
      prompt: "anímalo",
      input_image: { type: "image_url", image_url: "https://cdn/a.jpg" },
      model: "kling-v2-1-master",
      duration: 10,
      enhance_prompt: true
    });
  });

  test("Seedance: resolution + aspect_ratio + model default", () => {
    const { params } = buildGeneratePayload({
      modelId: "/v1/image2video/seedance",
      prompt: "p",
      references: ["https://cdn/a.jpg"],
      resolution: "1080",
      aspectRatio: "16:9",
      duration: 6
    });
    expect(params).toMatchObject({
      input_image: { type: "image_url", image_url: "https://cdn/a.jpg" },
      resolution: "1080",
      aspect_ratio: "16:9",
      duration: 6,
      model: "seedance_pro"
    });
  });

  test("Speak: quality desde resolution, input_image/audio, duration", () => {
    const { endpoint, params } = buildGeneratePayload({
      modelId: HF_ENDPOINTS.speak,
      prompt: "hola",
      duration: 10,
      resolution: "high",
      references: ["https://cdn/face.jpg"],
      params: { audio_url: "https://cdn/voz.mp3" }
    });
    expect(endpoint).toBe("/v1/speak/higgsfield");
    expect(params).toMatchObject({
      prompt: "hola",
      duration: 10,
      quality: "high",
      input_image: { type: "image_url", image_url: "https://cdn/face.jpg" },
      input_audio: { type: "audio_url", audio_url: "https://cdn/voz.mp3" }
    });
  });
});

describe("Higgsfield catalog — modelos reales del registro", () => {
  test("getCatalogModels expone los modelos descubiertos", () => {
    const ids = getCatalogModels().map(m => m.id);
    expect(ids).toContain("/v1/image2video/dop");
    expect(ids).toContain("/v1/image2video/kling");
    expect(ids).toContain("/v1/image2video/seedance");
    expect(ids).toContain("/v1/image2video/veo3");
    expect(ids).toContain("/v1/text2image/soul");
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });

  test("Soul: calidad 720p/1080p y maxCount 4", () => {
    const soul = getCatalogModel(HF_ENDPOINTS.soulText2Image);
    expect(soul?.mediaType).toBe("image");
    expect(soul?.capabilities.resolutions).toEqual(["720p", "1080p"]);
    expect(soul?.capabilities.maxCount).toBe(4);
  });

  test("Kling: variantes de modelo y duraciones reales", () => {
    const kling = getCatalogModel("/v1/image2video/kling");
    expect(kling?.mediaType).toBe("video");
    expect(kling?.capabilities.durations).toEqual([5, 10]);
    const modelParam = kling?.params.find(p => p.name === "model");
    expect(modelParam?.enumValues?.map(e => e.value)).toEqual(["kling-v2-1", "kling-v2-1-master"]);
  });

  test("estimateCatalogCostUsd por tipo", () => {
    expect(estimateCatalogCostUsd({ modelId: HF_ENDPOINTS.soulText2Image, count: 4 })).toBeCloseTo(0.16, 5);
    expect(estimateCatalogCostUsd({ modelId: HF_ENDPOINTS.speak, duration: 10 })).toBeCloseTo(0.5, 5);
    expect(estimateCatalogCostUsd({ modelId: HF_ENDPOINTS.dopImage2Video })).toBeCloseTo(0.25, 5);
  });
});
