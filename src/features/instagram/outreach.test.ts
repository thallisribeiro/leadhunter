import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { discoverWithProviders } from "@/features/discovery/service";
import { openingMessage, sendBrowserMessage } from "@/features/instagram/outreach";
import { isPaused } from "@/features/ops/guard";
import { createFakeInstagramBrowser, demoInstagramProfiles } from "@/integrations/browser/fake";
import { InstagramRestrictionError } from "@/integrations/browser/instagram";
import { createInstagramProvider } from "@/integrations/discovery/instagram";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

async function setup() {
  const { db } = createTestDatabase();
  saveBusinessProfile(db, { businessName: "Horizonte", ownerName: "Thallis", businessDescription: "Agência fictícia de sites", offer: "Sites", oneLinePitch: "Sites que viram conversa.", verifiedClaims: ["Entrega em 7 dias"], forbiddenClaims: ["garantia de faturamento"], outreachGoal: "Conversa", callToAction: "Posso?", tone: "Direto", targetIndustries: ["odontologia"] });
  const campaign = createCampaign(db, { name: "Dentistas", targetLocations: ["Miami"], industries: ["dentist"], keywords: ["dentista miami"], sources: ["instagram"], targetLeadCount: 10, minimumScore: 0, outreachLanguage: "pt-BR", hashtags: ["dentistamiami"] });
  const browser = createFakeInstagramBrowser({ profiles: demoInstagramProfiles, searches: { "dentista miami": ["oceandental", "missing"] }, hashtags: { dentistamiami: ["brightsmile"] } });
  const results = await discoverWithProviders(db, campaign.id, { campaignId: campaign.id, locations: [], industries: [], keywords: ["dentista miami"], hashtags: ["dentistamiami"], limit: 10 }, [createInstagramProvider(browser, { pauseMs: 0 })]);
  return { db, campaign, browser, results };
}

describe("instagram discovery → opening message → send", () => {
  it("discovers profiles from search and hashtags, storing handle, snapshot, role and bio evidence", async () => {
    const { db, results } = await setup();
    expect(results).toEqual([{ provider: "instagram", count: 2 }]);
    const ocean = db.$client.prepare("SELECT company_name, instagram_handle, decision_role, website, description FROM leads WHERE instagram_handle = 'oceandental'").get() as Record<string, string>;
    expect(ocean).toMatchObject({ company_name: "Ocean Dental Studio", decision_role: "owner", website: "https://ocean-dental.example" });
    expect(db.$client.prepare("SELECT count(*) AS n FROM lead_evidence WHERE type = 'instagram_bio'").get()).toEqual({ n: 2 });
    expect(db.$client.prepare("SELECT count(*) AS n FROM lead_contacts WHERE type = 'instagram'").get()).toEqual({ n: 2 });
  });

  it("writes an opening message from a real profile hook, with a sticky variant and no forbidden claim", async () => {
    const { db } = await setup();
    const lead = db.$client.prepare("SELECT id FROM leads WHERE instagram_handle = 'oceandental'").get() as { id: string };
    const first = openingMessage(db, { leadId: lead.id, now: new Date("2026-09-08T13:00:00Z"), rng: () => 0.1 });
    expect(first.text).toMatch(/^(Bom dia|Boa tarde)/);
    expect(first.text).toContain("WhatsApp na bio");
    expect(first.evidenceIds).toHaveLength(1);
    expect(openingMessage(db, { leadId: lead.id, rng: () => 0.9 }).variantId).toBe(first.variantId);
  });

  it("dry-run by default: records the message, never touches the browser, keeps the lead pending", async () => {
    const { db, browser } = await setup();
    const lead = db.$client.prepare("SELECT id FROM leads WHERE instagram_handle = 'oceandental'").get() as { id: string };
    const out = await sendBrowserMessage(db, { leadId: lead.id, kind: "first_contact", browser, enabled: false });
    expect(out.mode).toBe("dry_run");
    expect(browser.sent).toHaveLength(0);
    expect(db.$client.prepare("SELECT status FROM leads WHERE id = ?").get(lead.id)).toEqual({ status: "discovered" });
  });

  it("real send goes through pacing and the browser, records it once and refuses a second contact", async () => {
    process.env.OPERATING_TIMEZONE = "UTC"; process.env.OPERATING_HOURS = "00:00-23:59";
    const { db, browser } = await setup();
    const lead = db.$client.prepare("SELECT id FROM leads WHERE instagram_handle = 'brightsmile'").get() as { id: string };
    const sent = await sendBrowserMessage(db, { leadId: lead.id, kind: "first_contact", browser, enabled: true, now: new Date("2026-09-08T12:00:00Z") });
    expect(sent.mode).toBe("sent");
    expect(browser.sent).toEqual([{ handle: "brightsmile", text: (sent as { text: string }).text, dryRun: false }]);
    expect(await sendBrowserMessage(db, { leadId: lead.id, kind: "first_contact", browser, enabled: true, now: new Date("2026-09-08T12:10:00Z") })).toMatchObject({ mode: "skipped", reason: "already_contacted" });
    const other = db.$client.prepare("SELECT id FROM leads WHERE instagram_handle = 'oceandental'").get() as { id: string };
    expect(await sendBrowserMessage(db, { leadId: other.id, kind: "first_contact", browser, enabled: true, now: new Date("2026-09-08T12:00:30Z"), rng: () => 0 })).toMatchObject({ mode: "skipped", reason: "too_soon" });
    process.env.OPERATING_HOURS = "09:00-20:00";
    expect(await sendBrowserMessage(db, { leadId: other.id, kind: "first_contact", browser, enabled: true, now: new Date("2026-09-09T03:00:00Z") })).toMatchObject({ mode: "skipped", reason: "outside_hours" });
  });

  it("an Instagram restriction pauses everything; other browser failures count toward the breaker", async () => {
    process.env.OPERATING_TIMEZONE = "UTC"; process.env.OPERATING_HOURS = "00:00-23:59";
    const { db } = await setup();
    const lead = db.$client.prepare("SELECT id FROM leads WHERE instagram_handle = 'oceandental'").get() as { id: string };
    const restricted = createFakeInstagramBrowser({ profiles: demoInstagramProfiles, failSend: () => new InstagramRestrictionError("Try again later") });
    await expect(sendBrowserMessage(db, { leadId: lead.id, kind: "first_contact", browser: restricted, enabled: true, now: new Date("2026-09-08T12:00:00Z") })).rejects.toThrow("Try again later");
    expect(isPaused(db)).toMatchObject({ paused: true });
    expect(await sendBrowserMessage(db, { leadId: lead.id, kind: "first_contact", browser: restricted, enabled: true })).toMatchObject({ mode: "skipped" });
  });
});
