import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The route uses the process-wide database, so point it at a temp file before importing anything.
process.env.DATABASE_URL = `file:${path.join(mkdtempSync(path.join(os.tmpdir(), "lh-webhook-")), "test.db").replace(/\\/g, "/")}`;
process.env.INSTAGRAM_APP_SECRET = "app-secret";
process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "verify-me";
delete process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;

const signed = (body: string) => `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
const event = (mid: string, text: string, sender = "igsid-42") => JSON.stringify({ object: "instagram", entry: [{ messaging: [{ sender: { id: sender }, recipient: { id: "page" }, timestamp: Date.now(), message: { mid, text } }] }] });

describe("instagram webhook route", () => {
  let route: typeof import("@/app/api/webhooks/instagram/route");
  let db: typeof import("@/db/client").db;
  let leadId: string;

  beforeAll(async () => {
    route = await import("@/app/api/webhooks/instagram/route");
    db = (await import("@/db/client")).db;
    const { saveBusinessProfile } = await import("@/features/business/actions");
    const { createCampaign } = await import("@/features/campaigns/actions");
    const { upsertDiscoveredLead } = await import("@/features/discovery/service");
    const { recordOutbound, linkMetaUser } = await import("@/features/conversations/service");
    saveBusinessProfile(db, { businessName: "Horizonte", businessDescription: "Agência fictícia de sites", offer: "Sites", oneLinePitch: "Sites que vendem", outreachGoal: "Conversa", callToAction: "Posso?", tone: "Direto" });
    const campaign = createCampaign(db, { name: "Dentistas", targetLocations: ["Miami"], industries: ["dentist"], sources: ["instagram"], targetLeadCount: 3, minimumScore: 0, outreachLanguage: "pt-BR" });
    leadId = upsertDiscoveredLead(db, campaign.id, { companyName: "Ocean", instagram: "https://instagram.com/oceandental", sourceUrl: "https://instagram.com/oceandental" }, "instagram").id;
    recordOutbound(db, { leadId, text: "oi", via: "browser", kind: "first_contact" });
    linkMetaUser(db, leadId, "igsid-42");
  });

  it("answers the Meta verification handshake only with the right token", async () => {
    const ok = await route.GET(new Request("http://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"));
    expect(ok.status).toBe(200); expect(await ok.text()).toBe("123");
    expect((await route.GET(new Request("http://x/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123"))).status).toBe(403);
  });

  it("rejects a bad signature", async () => {
    const body = event("m-bad", "oi");
    const response = await route.POST(new Request("http://x/api/webhooks/instagram", { method: "POST", body, headers: { "x-hub-signature-256": "sha256=deadbeef" } }));
    expect(response.status).toBe(403);
  });

  it("accepts a signed inbound once, hands the channel to the API and queues the engine job", async () => {
    const body = event("m-1", "pode mandar sim");
    const first = await route.POST(new Request("http://x/api/webhooks/instagram", { method: "POST", body, headers: { "x-hub-signature-256": signed(body) } }));
    expect(await first.json()).toEqual({ ok: true, accepted: 1 });
    const again = await route.POST(new Request("http://x/api/webhooks/instagram", { method: "POST", body, headers: { "x-hub-signature-256": signed(body) } }));
    expect(await again.json()).toEqual({ ok: true, accepted: 0 });
    expect(db.$client.prepare("SELECT owner, state FROM conversations WHERE lead_id = ?").get(leadId)).toEqual({ owner: "api", state: "api_active" });
    expect(db.$client.prepare("SELECT count(*) AS n FROM jobs WHERE type = 'process_inbound'").get()).toEqual({ n: 1 });
    expect(db.$client.prepare("SELECT count(*) AS n FROM webhook_events").get()).toEqual({ n: 1 });
  });

  it("parks an unknown sender in the exceptions queue instead of guessing", async () => {
    const body = event("m-2", "quem é?", "igsid-unknown");
    await route.POST(new Request("http://x/api/webhooks/instagram", { method: "POST", body, headers: { "x-hub-signature-256": signed(body) } }));
    expect(db.$client.prepare("SELECT kind FROM exceptions ORDER BY created_at DESC LIMIT 1").get()).toEqual({ kind: "unmatched_inbound" });
  });

  it("runs the whole inbound → engine → reply path through the worker handlers (API not configured → exception, no browser fallback)", async () => {
    const { jobHandlers } = await import("@/worker/handlers");
    const { createQueue } = await import("@/worker/queue");
    const queue = createQueue(db);
    const job = queue.claimNext("test-worker")!;
    expect(job.type).toBe("process_inbound");
    const result = await jobHandlers.process_inbound!(job);
    expect(result).toMatchObject({ intent: "interested", action: "send_whatsapp_link", replied: true });
    const reply = db.$client.prepare("SELECT * FROM jobs WHERE type = 'send_api_reply'").get() as { id: string } | undefined;
    expect(reply).toBeTruthy();
    queue.complete(job.id, result);
    const replyJob = queue.claimNext("test-worker")!;
    expect(await jobHandlers.send_api_reply!(replyJob)).toEqual({ mode: "skipped", reason: "api_not_configured" });
    expect(db.$client.prepare("SELECT count(*) AS n FROM messages WHERE direction = 'out' AND sent_via = 'browser'").get()).toEqual({ n: 1 });
  });
});
