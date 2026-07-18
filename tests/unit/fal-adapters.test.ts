import { describe, expect, test } from "@jest/globals";
import { Seedance1ProI2V } from "../../services/UGCProviders/fal/adapters/Seedance1ProI2V";
import { KlingV3ProI2V } from "../../services/UGCProviders/fal/adapters/KlingV3ProI2V";
import { KlingV3ProMotionControl } from "../../services/UGCProviders/fal/adapters/KlingV3ProMotionControl";
import { KlingV26ProI2V } from "../../services/UGCProviders/fal/adapters/KlingV26ProI2V";
import { Veo31ImageToVideo } from "../../services/UGCProviders/fal/adapters/Veo31ImageToVideo";
import { NanoBanana2Edit } from "../../services/UGCProviders/fal/adapters/NanoBanana2Edit";
import {
  FAL_ADAPTERS,
  getAdapter,
  findAdapter
} from "../../services/UGCProviders/fal/adapters/registry";

const IMG = "https://example.com/character.png";
const VID = "https://example.com/motion.mp4";

// ---------------------------------------------------------------------------
// Seedance
// ---------------------------------------------------------------------------
describe("Seedance1ProI2V adapter", () => {
  test("mapInput convierte a snake_case y omite seed cuando no se provee", () => {
    const params = Seedance1ProI2V.runtimeSchema.parse({
      prompt: "hola",
      image_url: IMG,
      duration: "5",
      aspect_ratio: "9:16",
      resolution: "1080p"
    });
    const mapped = Seedance1ProI2V.mapInput(params as never);
    expect(mapped).toEqual({
      prompt: "hola",
      image_url: IMG,
      duration: "5",
      aspect_ratio: "9:16",
      resolution: "1080p",
      camera_fixed: false,
      enable_safety_checker: true
    });
    expect(mapped.seed).toBeUndefined();
  });

  test("estimateCostUsd 5s → $0.25", () => {
    expect(
      Seedance1ProI2V.estimateCostUsd({ duration: "5" } as never)
    ).toBe(0.25);
  });

  test("defaultSchema acepta objeto vacío (todos opcionales)", () => {
    expect(() => Seedance1ProI2V.defaultSchema.parse({})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Kling v3 I2V
// ---------------------------------------------------------------------------
describe("KlingV3ProI2V adapter", () => {
  test("mapInput usa start_image_url (no image_url)", () => {
    const params = KlingV3ProI2V.runtimeSchema.parse({
      prompt: "test",
      start_image_url: IMG,
      duration: "5"
    });
    const mapped = KlingV3ProI2V.mapInput(params as never);
    expect(mapped.start_image_url).toBe(IMG);
    expect((mapped as Record<string, unknown>).image_url).toBeUndefined();
  });

  test("runtimeSchema rechaza prompt + multi_prompt simultáneos", () => {
    expect(() =>
      KlingV3ProI2V.runtimeSchema.parse({
        prompt: "x",
        multi_prompt: [{ prompt: "y" }],
        start_image_url: IMG
      })
    ).toThrow();
  });

  test("runtimeSchema rechaza ausencia de prompt y multi_prompt", () => {
    expect(() =>
      KlingV3ProI2V.runtimeSchema.parse({
        start_image_url: IMG
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Kling v3 Motion Control (más complejo)
// ---------------------------------------------------------------------------
describe("KlingV3ProMotionControl adapter", () => {
  test("runtimeSchema exige image_url y video_url", () => {
    expect(() =>
      KlingV3ProMotionControl.runtimeSchema.parse({
        character_orientation: "image",
        keep_original_sound: true
      })
    ).toThrow();
  });

  test("mapInput incluye image_url, video_url y character_orientation", () => {
    const params = KlingV3ProMotionControl.runtimeSchema.parse({
      character_orientation: "image",
      keep_original_sound: true,
      image_url: IMG,
      video_url: VID
    });
    const mapped = KlingV3ProMotionControl.mapInput(params as never);
    expect(mapped).toEqual({
      image_url: IMG,
      video_url: VID,
      character_orientation: "image",
      keep_original_sound: true
    });
  });

  test("rechaza elements cuando character_orientation='image'", () => {
    expect(() =>
      KlingV3ProMotionControl.runtimeSchema.parse({
        character_orientation: "image",
        keep_original_sound: true,
        image_url: IMG,
        video_url: VID,
        elements: [{ image_url: IMG }]
      })
    ).toThrow();
  });

  test("acepta hasta 1 element cuando character_orientation='video'", () => {
    const parsed = KlingV3ProMotionControl.runtimeSchema.parse({
      character_orientation: "video",
      keep_original_sound: true,
      image_url: IMG,
      video_url: VID,
      elements: [{ image_url: IMG, description: "logo" }]
    });
    expect(
      (parsed as { elements?: unknown[] }).elements?.length
    ).toBe(1);
  });

  test("rechaza más de 1 element", () => {
    expect(() =>
      KlingV3ProMotionControl.runtimeSchema.parse({
        character_orientation: "video",
        keep_original_sound: true,
        image_url: IMG,
        video_url: VID,
        elements: [{ image_url: IMG }, { image_url: IMG }]
      })
    ).toThrow();
  });

  test("requiresCampaignAssets incluye motionReferenceVideo", () => {
    expect(KlingV3ProMotionControl.requiresCampaignAssets).toContain(
      "motionReferenceVideo"
    );
  });

  test("estimateCostUsd retorna $0.50", () => {
    expect(
      KlingV3ProMotionControl.estimateCostUsd({
        image_url: IMG,
        video_url: VID,
        character_orientation: "image",
        keep_original_sound: true
      } as never)
    ).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Kling v2.6
// ---------------------------------------------------------------------------
describe("KlingV26ProI2V adapter", () => {
  test("duration solo acepta '5' o '10'", () => {
    expect(() =>
      KlingV26ProI2V.runtimeSchema.parse({
        prompt: "x",
        start_image_url: IMG,
        duration: "7"
      })
    ).toThrow();
  });

  test("mapInput omite voice_ids cuando no se proveen", () => {
    const params = KlingV26ProI2V.runtimeSchema.parse({
      prompt: "x",
      start_image_url: IMG
    });
    const mapped = KlingV26ProI2V.mapInput(params as never);
    expect((mapped as Record<string, unknown>).voice_ids).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Veo 3.1
// ---------------------------------------------------------------------------
describe("Veo31ImageToVideo adapter", () => {
  test("duration usa sufijo 's' (8s/6s/4s)", () => {
    expect(() =>
      Veo31ImageToVideo.runtimeSchema.parse({
        prompt: "x",
        image_url: IMG,
        duration: "8"
      })
    ).toThrow();
    expect(() =>
      Veo31ImageToVideo.runtimeSchema.parse({
        prompt: "x",
        image_url: IMG,
        duration: "8s"
      })
    ).not.toThrow();
  });

  test("estimateCostUsd 8s @ $0.40/s = $3.20", () => {
    expect(
      Veo31ImageToVideo.estimateCostUsd({ duration: "8s" } as never)
    ).toBe(3.2);
  });
});

// ---------------------------------------------------------------------------
// Nano Banana 2 Edit
// ---------------------------------------------------------------------------
describe("NanoBanana2Edit adapter", () => {
  test("runtimeSchema exige image_urls como array", () => {
    expect(() =>
      NanoBanana2Edit.runtimeSchema.parse({
        prompt: "x",
        image_urls: IMG
      })
    ).toThrow();
  });

  test("mapInput preserva image_urls como lista", () => {
    const params = NanoBanana2Edit.runtimeSchema.parse({
      prompt: "x",
      image_urls: [IMG, IMG]
    });
    const mapped = NanoBanana2Edit.mapInput(params as never);
    expect(mapped.image_urls).toEqual([IMG, IMG]);
  });

  test("estimateCostUsd 1K + 1 image = $0.04", () => {
    const cost = NanoBanana2Edit.estimateCostUsd({
      resolution: "1K",
      num_images: 1,
      enable_web_search: false,
      thinking_level: "minimal"
    } as never);
    expect(cost).toBe(0.04);
  });

  test("estimateCostUsd 4K + 2 imgs + web_search + high thinking", () => {
    // (0.04*2 + 0.015 + 0.002) * 2 = (0.08 + 0.017) * 2 = 0.194
    const cost = NanoBanana2Edit.estimateCostUsd({
      resolution: "4K",
      num_images: 2,
      enable_web_search: true,
      thinking_level: "high"
    } as never);
    expect(cost).toBeCloseTo(0.194, 3);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe("FAL adapters registry", () => {
  test("FAL_ADAPTERS expone las 15 keys conocidas", () => {
    expect(Object.keys(FAL_ADAPTERS).sort()).toEqual(
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

  test("getAdapter lanza error explícito con key inexistente", () => {
    expect(() => getAdapter("does-not-exist")).toThrow(
      /adapter no encontrado/
    );
  });

  test("getAdapter lanza error con key vacía", () => {
    expect(() => getAdapter("")).toThrow(/adapter key vacío/);
    expect(() => getAdapter(null)).toThrow(/adapter key vacío/);
  });

  test("findAdapter devuelve null para key inválida (no lanza)", () => {
    expect(findAdapter("none")).toBeNull();
    expect(findAdapter(null)).toBeNull();
  });
});
