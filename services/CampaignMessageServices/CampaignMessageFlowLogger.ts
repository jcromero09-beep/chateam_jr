import { appendFile, mkdir } from "fs/promises";
import path from "path";

const isEnabled = (): boolean =>
  String(process.env.CAMPAIGN_MESSAGE_FLOW_DEBUG ?? "true").toLowerCase() !== "false";

const LOG_PATH =
  process.env.CAMPAIGN_MESSAGE_FLOW_LOG_PATH ||
  path.resolve(process.cwd(), "logs", "campaign-message-flow.log");

const safeJson = (value: unknown): string => {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (_key, current) => {
    if (typeof current === "bigint") return current.toString();

    if (Buffer.isBuffer(current)) {
      return {
        type: "Buffer",
        length: current.length,
        base64Preview: current.toString("base64").slice(0, 160)
      };
    }

    if (current instanceof Uint8Array) {
      return {
        type: "Uint8Array",
        length: current.length,
        base64Preview: Buffer.from(current).toString("base64").slice(0, 160)
      };
    }

    if (current && typeof current === "object") {
      if (seen.has(current)) return "[Circular]";
      seen.add(current);
    }

    return current;
  });
};

const logCampaignMessageFlow = async (
  stage: string,
  payload: Record<string, unknown>
): Promise<void> => {
  if (!isEnabled()) return;

  try {
    await mkdir(path.dirname(LOG_PATH), { recursive: true });
    const line = safeJson({
      ts: new Date().toISOString(),
      stage,
      ...payload
    });
    await appendFile(LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // Debug-only logger. It must never affect message intake or campaign saving.
  }
};

export { LOG_PATH as CAMPAIGN_MESSAGE_FLOW_LOG_PATH };
export default logCampaignMessageFlow;
