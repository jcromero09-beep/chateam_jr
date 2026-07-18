import { describe, expect, test } from "@jest/globals";
import { validatePipelineSelection } from "../../services/UGCCampaignServices/ValidatePipelineSelection";
import { pipelineSelectionSchema } from "../../services/UGCCampaignServices/PipelineSelectionSchemas";

// ---------------------------------------------------------------------------
// Zod schema (forma del body)
// ---------------------------------------------------------------------------
describe("pipelineSelectionSchema (Zod)", () => {
  test("rechaza body sin videoSlot en image-then-video", () => {
    const r = pipelineSelectionSchema.safeParse({
      pipelineMode: "image-then-video",
      slots: { image: { modelKey: "nano-banana-2" }, video: null }
    });
    expect(r.success).toBe(false);
  });

  test("rechaza imageSlot en text-to-video-direct", () => {
    const r = pipelineSelectionSchema.safeParse({
      pipelineMode: "text-to-video-direct",
      slots: {
        image: { modelKey: "nano-banana-2" },
        video: { modelKey: "veo3.1-t2v" }
      }
    });
    expect(r.success).toBe(false);
  });

  test("rechaza lipsyncSlot sin voiceSlot", () => {
    const r = pipelineSelectionSchema.safeParse({
      pipelineMode: "lipsync-talking-head",
      slots: {
        image: { modelKey: "nano-banana-2" },
        video: { modelKey: "kling-v2.6-pro-i2v" },
        voice: null,
        lipsync: { modelKey: "sync-lipsync" }
      }
    });
    expect(r.success).toBe(false);
  });

  test("acepta lipsync-talking-head completo", () => {
    const r = pipelineSelectionSchema.safeParse({
      pipelineMode: "lipsync-talking-head",
      slots: {
        image: { modelKey: "nano-banana-2" },
        video: { modelKey: "kling-v2.6-pro-i2v" },
        voice: { modelKey: "elevenlabs-tts-v3" },
        lipsync: { modelKey: "sync-lipsync" }
      }
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validación semántica (pipelineMode × category)
// ---------------------------------------------------------------------------
describe("validatePipelineSelection (categorías cruzadas)", () => {
  test("rechaza T2V en modo image-then-video (categoría errónea)", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "image-then-video",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: { modelKey: "veo3.1-t2v", defaults: {} }, // T2V → no encaja
        voice: null,
        lipsync: null
      }
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.some(i => i.field.includes("slots.video.modelKey"))
    ).toBe(true);
  });

  test("rechaza motion-control en lipsync-talking-head", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "lipsync-talking-head",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: {
          modelKey: "kling-v3-pro-motion-control",
          defaults: {}
        },
        voice: { modelKey: "elevenlabs-tts-v3", defaults: {} },
        lipsync: { modelKey: "sync-lipsync", defaults: {} }
      }
    });
    expect(
      issues.some(i => i.field.includes("slots.video"))
    ).toBe(true);
  });

  test("rechaza I2V en text-to-video-direct", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "text-to-video-direct",
      slots: {
        image: null,
        video: { modelKey: "seedance-v1-pro-i2v", defaults: {} },
        voice: null,
        lipsync: null
      }
    });
    expect(
      issues.some(i => i.field.includes("slots.video"))
    ).toBe(true);
  });

  test("acepta motion-control en image-then-video CON motion-reference", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "image-then-video",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: {
          modelKey: "kling-v3-pro-motion-control",
          defaults: {
            character_orientation: "image",
            keep_original_sound: true
          }
        },
        voice: null,
        lipsync: null
      },
      videoModelMotionReferenceUrl: "https://example.com/motion.mp4"
    });
    expect(issues).toHaveLength(0);
  });

  test("rechaza motion-control SIN motion-reference", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "image-then-video",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: {
          modelKey: "kling-v3-pro-motion-control",
          defaults: {
            character_orientation: "image",
            keep_original_sound: true
          }
        },
        voice: null,
        lipsync: null
      },
      videoModelMotionReferenceUrl: null
    });
    expect(
      issues.some(i => i.field === "videoModelMotionReferenceUrl")
    ).toBe(true);
  });

  test("acepta lipsync-talking-head completo y consistente", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "lipsync-talking-head",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: {
          modelKey: "kling-v2.6-pro-i2v",
          defaults: {
            duration: "5",
            generate_audio: true,
            negative_prompt: "blur"
          }
        },
        voice: {
          modelKey: "elevenlabs-tts-v3",
          defaults: {
            voice: "Rachel",
            stability: 0.5,
            apply_text_normalization: "auto"
          }
        },
        lipsync: {
          modelKey: "sync-lipsync",
          defaults: {
            model: "lipsync-1.9.0-beta",
            sync_mode: "cut_off"
          }
        }
      }
    });
    expect(issues).toHaveLength(0);
  });

  test("rechaza adapter no existente en registry", () => {
    const issues = validatePipelineSelection({
      pipelineMode: "image-then-video",
      slots: {
        image: { modelKey: "nano-banana-2", defaults: {} },
        video: { modelKey: "fake-model", defaults: {} },
        voice: null,
        lipsync: null
      }
    });
    expect(
      issues.some(i => i.message.includes("no existe en el registry"))
    ).toBe(true);
  });
});
