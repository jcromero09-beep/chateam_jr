import { describe, expect, test } from "@jest/globals";
import { NanoBanana2 } from "../../services/UGCProviders/fal/adapters/NanoBanana2";
import { Veo31TextToVideo } from "../../services/UGCProviders/fal/adapters/Veo31TextToVideo";
import { KlingV3ProTextToVideo } from "../../services/UGCProviders/fal/adapters/KlingV3ProTextToVideo";
import { KlingV26ProTextToVideo } from "../../services/UGCProviders/fal/adapters/KlingV26ProTextToVideo";
import { Veo31FastImageToVideo } from "../../services/UGCProviders/fal/adapters/Veo31FastImageToVideo";
import { ElevenLabsTTSv3 } from "../../services/UGCProviders/fal/adapters/ElevenLabsTTSv3";
import { F5TTS } from "../../services/UGCProviders/fal/adapters/F5TTS";
import { SyncLipsync } from "../../services/UGCProviders/fal/adapters/SyncLipsync";
import { LatentSync } from "../../services/UGCProviders/fal/adapters/LatentSync";
import { FAL_ADAPTERS } from "../../services/UGCProviders/fal/adapters/registry";

const IMG = "https://example.com/img.png";
const VID = "https://example.com/video.mp4";
const AUD = "https://example.com/audio.mp3";

// ---------------------------------------------------------------------------
// PR #1 adapters ahora tienen category/inputs/outputs
// ---------------------------------------------------------------------------
describe("PR#1 adapters — category/inputs/outputs (regression)", () => {
  test("todos los adapters del registry tienen category y inputs/outputs", () => {
    for (const adapter of Object.values(FAL_ADAPTERS)) {
      expect(typeof adapter.category).toBe("string");
      expect(Array.isArray(adapter.inputs)).toBe(true);
      expect(Array.isArray(adapter.outputs)).toBe(true);
      expect(adapter.inputs.length).toBeGreaterThan(0);
      expect(adapter.outputs.length).toBeGreaterThan(0);
    }
  });

  test("type (legacy) sigue exportándose para retrocompat", () => {
    for (const adapter of Object.values(FAL_ADAPTERS)) {
      expect(typeof adapter.type).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Nano Banana 2 (T2I)
// ---------------------------------------------------------------------------
describe("NanoBanana2 adapter (T2I)", () => {
  test("category=text-to-image, inputs=[text]", () => {
    expect(NanoBanana2.category).toBe("text-to-image");
    expect(NanoBanana2.inputs).toEqual(["text"]);
    expect(NanoBanana2.outputs).toEqual(["image"]);
  });

  test("mapInput omite seed y system_prompt cuando no se proveen", () => {
    const p = NanoBanana2.runtimeSchema.parse({
      prompt: "test",
      aspect_ratio: "9:16"
    });
    const m = NanoBanana2.mapInput(p as never) as Record<string, unknown>;
    expect(m.prompt).toBe("test");
    expect(m.seed).toBeUndefined();
    expect(m.system_prompt).toBeUndefined();
  });

  test("estimateCostUsd 1 imagen @ 1K = $0.04", () => {
    expect(
      NanoBanana2.estimateCostUsd({
        resolution: "1K",
        num_images: 1,
        enable_web_search: false,
        thinking_level: "minimal"
      } as never)
    ).toBe(0.04);
  });
});

// ---------------------------------------------------------------------------
// Veo 3.1 T2V
// ---------------------------------------------------------------------------
describe("Veo31TextToVideo adapter", () => {
  test("aspect_ratio NO acepta 'auto' (diferencia con I2V)", () => {
    expect(() =>
      Veo31TextToVideo.runtimeSchema.parse({
        prompt: "x",
        aspect_ratio: "auto"
      })
    ).toThrow();
    expect(() =>
      Veo31TextToVideo.runtimeSchema.parse({
        prompt: "x",
        aspect_ratio: "9:16"
      })
    ).not.toThrow();
  });

  test("estimateCostUsd 8s @ $0.40/s = $3.20", () => {
    expect(
      Veo31TextToVideo.estimateCostUsd({ duration: "8s" } as never)
    ).toBe(3.2);
  });
});

// ---------------------------------------------------------------------------
// Kling v3 Pro T2V
// ---------------------------------------------------------------------------
describe("KlingV3ProTextToVideo adapter", () => {
  test("multi_prompt y prompt son mutuamente exclusivos", () => {
    expect(() =>
      KlingV3ProTextToVideo.runtimeSchema.parse({
        prompt: "a",
        multi_prompt: [{ prompt: "b" }]
      })
    ).toThrow();
  });

  test("requiere al menos prompt o multi_prompt", () => {
    expect(() => KlingV3ProTextToVideo.runtimeSchema.parse({})).toThrow();
  });

  test("mapInput NO incluye image_url ni start_image_url", () => {
    const p = KlingV3ProTextToVideo.runtimeSchema.parse({
      prompt: "x",
      duration: "5"
    });
    const m = KlingV3ProTextToVideo.mapInput(p as never) as Record<
      string,
      unknown
    >;
    expect(m.image_url).toBeUndefined();
    expect(m.start_image_url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Kling v2.6 Pro T2V
// ---------------------------------------------------------------------------
describe("KlingV26ProTextToVideo adapter", () => {
  test("duration solo '5' o '10'", () => {
    expect(() =>
      KlingV26ProTextToVideo.runtimeSchema.parse({
        prompt: "x",
        duration: "7"
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Veo 3.1 Fast I2V
// ---------------------------------------------------------------------------
describe("Veo31FastImageToVideo adapter", () => {
  test("estimateCostUsd 8s @ $0.20/s = $1.60", () => {
    expect(
      Veo31FastImageToVideo.estimateCostUsd({
        duration: "8s"
      } as never)
    ).toBe(1.6);
  });

  test("requiere image_url en runtime", () => {
    expect(() =>
      Veo31FastImageToVideo.runtimeSchema.parse({
        prompt: "x",
        duration: "8s"
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ElevenLabs TTS v3
// ---------------------------------------------------------------------------
describe("ElevenLabsTTSv3 adapter", () => {
  test("category=text-to-speech, inputs=[text], outputs=[audio]", () => {
    expect(ElevenLabsTTSv3.category).toBe("text-to-speech");
    expect(ElevenLabsTTSv3.inputs).toEqual(["text"]);
    expect(ElevenLabsTTSv3.outputs).toEqual(["audio"]);
  });

  test("estimateCostUsd ~$0.00003/char", () => {
    const text = "a".repeat(1000); // 1000 chars
    expect(
      ElevenLabsTTSv3.estimateCostUsd({
        text,
        voice: "Rachel",
        stability: 0.5,
        apply_text_normalization: "auto"
      } as never)
    ).toBeCloseTo(0.03, 3);
  });

  test("language_code valida formato ISO 639-1", () => {
    expect(() =>
      ElevenLabsTTSv3.runtimeSchema.parse({
        text: "hi",
        language_code: "ENGLISH"
      })
    ).toThrow();
    expect(() =>
      ElevenLabsTTSv3.runtimeSchema.parse({
        text: "hi",
        language_code: "es-MX"
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F5-TTS
// ---------------------------------------------------------------------------
describe("F5TTS adapter", () => {
  test("requiere ref_audio_url (voice clone)", () => {
    expect(() =>
      F5TTS.runtimeSchema.parse({
        gen_text: "hola"
      })
    ).toThrow();
  });

  test("requiresCampaignAssets incluye audioReference", () => {
    expect(F5TTS.requiresCampaignAssets).toContain("audioReference");
  });
});

// ---------------------------------------------------------------------------
// Sync Lipsync
// ---------------------------------------------------------------------------
describe("SyncLipsync adapter", () => {
  test("category=lipsync, inputs=[video,audio], outputs=[video]", () => {
    expect(SyncLipsync.category).toBe("lipsync");
    expect(SyncLipsync.inputs).toEqual(["video", "audio"]);
    expect(SyncLipsync.outputs).toEqual(["video"]);
  });

  test("mapInput preserva video_url y audio_url", () => {
    const p = SyncLipsync.runtimeSchema.parse({
      video_url: VID,
      audio_url: AUD
    });
    const m = SyncLipsync.mapInput(p as never) as Record<string, unknown>;
    expect(m.video_url).toBe(VID);
    expect(m.audio_url).toBe(AUD);
    expect(m.model).toBe("lipsync-1.9.0-beta");
  });
});

// ---------------------------------------------------------------------------
// LatentSync
// ---------------------------------------------------------------------------
describe("LatentSync adapter", () => {
  test("guidance_scale en rango [0, 5]", () => {
    expect(() =>
      LatentSync.runtimeSchema.parse({
        video_url: VID,
        audio_url: AUD,
        guidance_scale: 10
      })
    ).toThrow();
  });

  test("estimateCostUsd default = $0.30 (5s × $0.06)", () => {
    expect(
      LatentSync.estimateCostUsd({
        video_url: VID,
        audio_url: AUD,
        guidance_scale: 1,
        loop_mode: "loop"
      } as never)
    ).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// Registry — 15 adapters totales
// ---------------------------------------------------------------------------
describe("FAL_ADAPTERS registry (PR#1 + PR#2)", () => {
  test("expone 15 adapters", () => {
    expect(Object.keys(FAL_ADAPTERS)).toHaveLength(15);
  });

  test("incluye los 9 adapters nuevos del PR#2", () => {
    const newKeys = [
      "nano-banana-2",
      "veo3.1-t2v",
      "kling-v3-pro-t2v",
      "kling-v2.6-pro-t2v",
      "veo3.1-fast-i2v",
      "elevenlabs-tts-v3",
      "f5-tts",
      "sync-lipsync",
      "latentsync"
    ];
    for (const k of newKeys) {
      expect(FAL_ADAPTERS[k]).toBeDefined();
    }
  });
});
