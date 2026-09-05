import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign, updateCampaignStatus } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { sendApprovedEmail } from "@/features/outreach/email";

function setup() {
  const database = createTestDatabase();
  const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
  updateCampaignStatus(database.db, campaign.id, "ready");
  const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Ocean Dental", email: "care@ocean.example", sourceUrl: "fixture.csv" }, "csv");
  const draftId = crypto.randomUUID();
  database.sqlite.prepare("insert into outreach_drafts (id, lead_id, campaign_id, channel, subject, message, personalization_hook, evidence_ids, approved, created_at) values (?, ?, ?, 'email', 'Uma ideia', 'Mensagem curta', 'Sinal real', '[]', 1, ?)").run(draftId, lead.id, campaign.id, new Date().toISOString());
  return { database, campaign, lead, draftId };
}

describe("email safety gates", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("persists a dry-run and never invokes SMTP while sending is disabled", async () => {
    const fixture = setup(); cleanups.push(fixture.database.close); let calls = 0;
    const result = await sendApprovedEmail(fixture.database.db, { leadId: fixture.lead.id, campaignId: fixture.campaign.id, draftId: fixture.draftId, recipient: "care@ocean.example", idempotencyKey: "mail-1" }, { enabled: false, maxPerDay: 30, minSecondsBetween: 60 }, async () => { calls += 1; });
    expect(result.mode).toBe("dry_run"); expect(calls).toBe(0);
    expect(fixture.database.sqlite.prepare("select type from outreach_events").get()).toEqual({ type: "email_dry_run" });
  });

  test("sends an approved email once and enforces idempotency", async () => {
    const fixture = setup(); cleanups.push(fixture.database.close); let calls = 0;
    const input = { leadId: fixture.lead.id, campaignId: fixture.campaign.id, draftId: fixture.draftId, recipient: "care@ocean.example", idempotencyKey: "mail-2" };
    const config = { enabled: true, maxPerDay: 30, minSecondsBetween: 0 };
    await sendApprovedEmail(fixture.database.db, input, config, async () => { calls += 1; });
    await sendApprovedEmail(fixture.database.db, input, config, async () => { calls += 1; });
    expect(calls).toBe(1);
  });

  test("enforces the daily limit before SMTP", async () => {
    const fixture = setup(); cleanups.push(fixture.database.close);
    await sendApprovedEmail(fixture.database.db, { leadId: fixture.lead.id, campaignId: fixture.campaign.id, draftId: fixture.draftId, recipient: "care@ocean.example", idempotencyKey: "mail-limit" }, { enabled: true, maxPerDay: 0, minSecondsBetween: 0 }, async () => undefined)
      .then(() => { throw new Error("Expected daily limit rejection"); }, (error: unknown) => expect(String(error)).toMatch(/limite diário/i));
  });
});
