import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMetaSender, messagingWindowOpen, parseInstagramWebhook, verifyWebhookSignature } from "@/integrations/instagram/api";

describe("meta instagram api", () => {
  it("verifies the X-Hub-Signature-256 header and rejects tampering", () => {
    const body = JSON.stringify({ object: "instagram" });
    const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWebhookSignature("secret", body, good)).toBe(true);
    expect(verifyWebhookSignature("secret", body + " ", good)).toBe(false);
    expect(verifyWebhookSignature("other", body, good)).toBe(false);
    expect(verifyWebhookSignature("secret", body, null)).toBe(false);
  });

  it("parses inbound messages and skips malformed events", () => {
    const messages = parseInstagramWebhook({ object: "instagram", entry: [{ messaging: [
      { sender: { id: "111" }, recipient: { id: "999" }, timestamp: 1_757_000_000_000, message: { mid: "m1", text: "oi, quanto custa?" } },
      { sender: { id: "999" }, recipient: { id: "111" }, timestamp: 1_757_000_001_000, message: { mid: "m2", text: "eco", is_echo: true } },
      { sender: { id: "111" }, message: { text: "sem mid" } },
    ] }] });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ senderId: "111", mid: "m1", text: "oi, quanto custa?", isEcho: false });
    expect(messages[1]!.isEcho).toBe(true);
    expect(parseInstagramWebhook({ object: "page" })).toEqual([]);
  });

  it("knows when the 24h messaging window is open", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    expect(messagingWindowOpen("2026-09-08T00:00:00Z", now)).toBe(true);
    expect(messagingWindowOpen("2026-09-07T11:00:00Z", now)).toBe(false);
    expect(messagingWindowOpen(null, now)).toBe(false);
  });

  it("sends text through the Graph API and surfaces API errors; no token means no sender", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ message_id: "mid-1" }), { status: 200 });
    }) as typeof fetch;
    const sender = createMetaSender({ token: "tok", apiVersion: "v21.0", fetcher })!;
    await expect(sender.sendText("111", "olá")).resolves.toEqual({ mid: "mid-1" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v21.0/me/messages");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ recipient: { id: "111" }, message: { text: "olá" } });
    const failing = createMetaSender({ token: "tok", fetcher: (async () => new Response(JSON.stringify({ error: { message: "window closed" } }), { status: 400 })) as typeof fetch })!;
    await expect(failing.sendText("111", "x")).rejects.toThrow("Meta API 400: window closed");
    expect(createMetaSender({ token: "" })).toBeNull();
  });
});
