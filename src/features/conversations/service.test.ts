import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { apiMaySend, browserMaySend, ensureConversation, markDoNotContact, outboundStats, recordInbound, recordOutbound } from "@/features/conversations/service";

function setup() {
  const { db } = createTestDatabase();
  saveBusinessProfile(db, { businessName: "Estúdio Horizonte", businessDescription: "Agência fictícia de sites", offer: "Sites", oneLinePitch: "Sites que vendem", outreachGoal: "Conversa", callToAction: "Posso mandar?", tone: "Direto" });
  const campaign = createCampaign(db, { name: "Dentistas", targetLocations: ["Miami"], industries: ["dentist"], sources: ["instagram"], targetLeadCount: 10, minimumScore: 40, outreachLanguage: "pt-BR" });
  const lead = upsertDiscoveredLead(db, campaign.id, { companyName: "Ocean Dental", instagram: "https://www.instagram.com/oceandental/", sourceUrl: "https://www.instagram.com/oceandental/", externalId: "oceandental" }, "instagram");
  return { db, campaign, leadId: lead.id };
}

describe("conversation channel lock", () => {
  it("lets the browser send exactly one first contact, then waits for the reply", () => {
    const { db, leadId } = setup();
    expect(browserMaySend(db, leadId)).toEqual({ ok: true });
    recordOutbound(db, { leadId, text: "oi", via: "browser", kind: "first_contact" });
    expect(browserMaySend(db, leadId)).toEqual({ ok: false, reason: "already_contacted" });
    expect(browserMaySend(db, leadId, "followup", new Date(Date.now() + 4 * 86_400_000))).toEqual({ ok: true });
    expect(apiMaySend(db, leadId)).toMatchObject({ ok: false, reason: "channel_owned_by_browser" });
    expect((db.$client.prepare("SELECT status, channel_state FROM leads WHERE id = ?").get(leadId) as { status: string; channel_state: string })).toEqual({ status: "contacted", channel_state: "waiting_inbound_reply" });
  });

  it("hands the channel to the API on the first inbound and dedupes by Meta message id", () => {
    const { db, leadId } = setup();
    recordOutbound(db, { leadId, text: "oi", via: "browser", kind: "first_contact" });
    expect(recordInbound(db, { metaUserId: "igsid-1", mid: "m1", text: "oi, conta mais", at: new Date().toISOString() })).toMatchObject({ duplicate: false, matched: false });
    const matched = recordInbound(db, { metaUserId: "igsid-1", mid: "m1", text: "oi, conta mais", at: new Date().toISOString(), leadId });
    expect(matched).toMatchObject({ duplicate: false, matched: true, leadId });
    expect(recordInbound(db, { metaUserId: "igsid-1", mid: "m1", text: "repetida", at: new Date().toISOString() })).toEqual({ duplicate: true });
    expect(recordInbound(db, { metaUserId: "igsid-1", mid: "m2", text: "segunda", at: new Date().toISOString() })).toMatchObject({ matched: true, leadId });
    expect(browserMaySend(db, leadId, "followup", new Date(Date.now() + 9 * 86_400_000))).toEqual({ ok: false, reason: "channel_owned_by_api" });
    expect(apiMaySend(db, leadId)).toEqual({ ok: true });
    expect(apiMaySend(db, leadId, new Date(Date.now() + 25 * 3_600_000))).toEqual({ ok: false, reason: "api_window_closed" });
    expect((db.$client.prepare("SELECT status FROM leads WHERE id = ?").get(leadId) as { status: string }).status).toBe("replied");
    expect(db.$client.prepare("SELECT count(*) AS n FROM messages WHERE lead_id = ?").get(leadId)).toEqual({ n: 3 });
  });

  it("opt-out suppresses the lead on every channel and blocks both senders", () => {
    const { db, leadId } = setup();
    ensureConversation(db, leadId);
    markDoNotContact(db, leadId, "pediu para parar");
    expect(browserMaySend(db, leadId)).toMatchObject({ ok: false });
    expect(apiMaySend(db, leadId)).toMatchObject({ ok: false });
    expect(db.$client.prepare("SELECT count(*) AS n FROM suppressions WHERE type IN ('company','instagram')").get()).toEqual({ n: 2 });
  });

  it("dry-run records the message without touching channel state or counters", () => {
    const { db, leadId } = setup();
    recordOutbound(db, { leadId, text: "oi", via: "dry_run", kind: "first_contact" });
    expect(browserMaySend(db, leadId)).toEqual({ ok: true });
    expect(outboundStats(db, "2000-01-01T00:00:00Z")).toMatchObject({ sentToday: 0, lastSentAt: null });
  });
});
