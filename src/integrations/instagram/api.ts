// Official Meta Graph API for Instagram messaging: webhook verification, signature check, inbound
// parsing and outbound send. Nothing here touches the browser; the API is only used after the lead replied.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface InboundMessage { senderId: string; recipientId: string; mid: string; text: string; timestamp: string; isEcho: boolean }

export function verifyWebhookSignature(appSecret: string, rawBody: string, signatureHeader: string | null | undefined): boolean {
  if (!appSecret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected), b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseInstagramWebhook(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const body = payload as { object?: string; entry?: Array<{ messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }> }> };
  if (body?.object !== "instagram" || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) for (const event of entry.messaging ?? []) {
    const mid = event.message?.mid; const senderId = event.sender?.id; const recipientId = event.recipient?.id;
    if (!mid || !senderId || !recipientId) continue;
    out.push({ senderId, recipientId, mid, text: event.message?.text ?? "", timestamp: new Date(event.timestamp ?? Date.now()).toISOString(), isEcho: Boolean(event.message?.is_echo) });
  }
  return out;
}

// Meta only allows replies within 24h of the last inbound message (standard messaging window).
export function messagingWindowOpen(lastInboundAt: string | null, now = new Date(), hours = 24): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - new Date(lastInboundAt).getTime() < hours * 3_600_000;
}

export interface MetaSender { sendText(recipientId: string, text: string): Promise<{ mid: string }>; lookupUsername(igsid: string): Promise<string | null> }

export function createMetaSender(options: { token?: string; apiVersion?: string; fetcher?: typeof fetch } = {}): MetaSender | null {
  const token = options.token ?? process.env.INSTAGRAM_PAGE_ACCESS_TOKEN ?? "";
  if (!token) return null;
  const fetcher = options.fetcher ?? fetch;
  const base = `https://graph.facebook.com/${options.apiVersion ?? process.env.INSTAGRAM_API_VERSION ?? "v21.0"}`;
  return {
    async sendText(recipientId, text) {
      const response = await fetcher(`${base}/me/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }), signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({})) as { message_id?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(`Meta API ${response.status}: ${data.error?.message ?? "erro desconhecido"}`);
      return { mid: data.message_id ?? crypto.randomUUID() };
    },
    async lookupUsername(igsid) {
      const response = await fetcher(`${base}/${igsid}?fields=username`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({})) as { username?: string };
      return data.username?.toLowerCase() ?? null;
    },
  };
}
