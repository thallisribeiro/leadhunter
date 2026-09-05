import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { findLeadByHandle, findLeadByMetaUser, linkMetaUser, recordInbound } from "@/features/conversations/service";
import { recordException } from "@/features/ops/guard";
import { createMetaSender, parseInstagramWebhook, verifyWebhookSignature } from "@/integrations/instagram/api";
import { createQueue } from "@/worker/queue";

export const dynamic = "force-dynamic";

// Meta verification handshake.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";
  if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verify token inválido" }, { status: 403 });
}

// Inbound messages: signature → idempotent event → lead match → conversation → engine job.
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.INSTAGRAM_APP_SECRET ?? "";
  if (!verifyWebhookSignature(secret, raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "assinatura inválida" }, { status: 403 });
  let payload: unknown; try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const queue = createQueue(db);
  const sender = createMetaSender();
  let accepted = 0;
  for (const message of parseInstagramWebhook(payload)) {
    if (message.isEcho) continue;
    const inserted = db.$client.prepare("INSERT OR IGNORE INTO webhook_events (id, provider, payload, created_at) VALUES (?, 'instagram', ?, ?)").run(message.mid, JSON.stringify(message), new Date().toISOString());
    if (inserted.changes === 0) continue; // already processed
    let leadId = findLeadByMetaUser(db, message.senderId);
    if (!leadId && sender) {
      const username = await sender.lookupUsername(message.senderId).catch(() => null);
      if (username) { leadId = findLeadByHandle(db, username); if (leadId) linkMetaUser(db, leadId, message.senderId); }
    }
    if (!leadId) { recordException(db, { kind: "unmatched_inbound", message: `IGSID ${message.senderId}: ${message.text.slice(0, 200)}` }); continue; }
    const result = recordInbound(db, { leadId, metaUserId: message.senderId, mid: message.mid, text: message.text, at: message.timestamp });
    if (!result.duplicate && result.matched) {
      queue.enqueue({ type: "process_inbound", payload: { leadId, text: message.text, mid: message.mid }, idempotencyKey: `process_inbound:${message.mid}` });
      accepted += 1;
    }
    db.$client.prepare("UPDATE webhook_events SET processed_at = ? WHERE id = ?").run(new Date().toISOString(), message.mid);
  }
  return NextResponse.json({ ok: true, accepted });
}
