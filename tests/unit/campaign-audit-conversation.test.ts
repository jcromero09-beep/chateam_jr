import { describe, expect, test } from "@jest/globals";
import { buildConversationTranscript } from "../../services/CampaignAuditConversationService";

describe("CampaignAuditConversationService", () => {
  test("should preserve the beginning and the end of long conversations", () => {
    const messages = Array.from({ length: 18 }, (_, index) => ({
      id: index + 1,
      ticketId: 10,
      fromMe: index % 2 === 0,
      body: `mensaje ${index + 1}`,
      mediaType: "conversation",
      createdAt: new Date(`2026-04-01T10:${String(index).padStart(2, "0")}:00.000Z`)
    }));

    const transcript = buildConversationTranscript(messages, 10, 4000);

    expect(transcript).toContain("Agente: mensaje 1");
    expect(transcript).toContain("Cliente: mensaje 2");
    expect(transcript).toContain("mensajes omitidos");
    expect(transcript).toContain("Agente: mensaje 17");
    expect(transcript).toContain("Cliente: mensaje 18");
  });

  test("should fallback to media label when message body is empty", () => {
    const transcript = buildConversationTranscript([
      {
        id: 1,
        ticketId: 99,
        fromMe: false,
        body: "",
        mediaType: "image",
        createdAt: new Date("2026-04-01T10:00:00.000Z")
      }
    ]);

    expect(transcript).toContain("Cliente: [image]");
  });

  test("should truncate transcripts that exceed the character limit", () => {
    const transcript = buildConversationTranscript([
      {
        id: 1,
        ticketId: 50,
        fromMe: false,
        body: "x".repeat(300),
        mediaType: "conversation",
        createdAt: new Date("2026-04-01T10:00:00.000Z")
      }
    ], 10, 120);

    expect(transcript).toContain("[transcripción truncada]");
    expect(transcript.length).toBeLessThanOrEqual(140);
  });
});
