import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { recordOutbound } from "@/features/conversations/service";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { autopilotPlan, markRebalanced, tickKey } from "@/features/instagram/autopilot";
import { pauseAll } from "@/features/ops/guard";
import { scoreLead } from "@/features/scoring/service";

function setup(autopilot = true) {
  const { db } = createTestDatabase();
  saveBusinessProfile(db, { businessName: "Horizonte", businessDescription: "Agência fictícia de sites", offer: "Sites", oneLinePitch: "Sites que vendem", outreachGoal: "Conversa", callToAction: "Posso?", tone: "Direto" });
  const campaign = createCampaign(db, { name: "Dentistas", targetLocations: ["Miami"], industries: ["dentist"], sources: ["instagram"], targetLeadCount: 3, minimumScore: 0, outreachLanguage: "pt-BR", autopilot });
  const a = upsertDiscoveredLead(db, campaign.id, { companyName: "A", instagram: "https://instagram.com/a", sourceUrl: "https://instagram.com/a", raw: { profile: { bio: "loja" } } }, "instagram");
  const b = upsertDiscoveredLead(db, campaign.id, { companyName: "B", instagram: "https://instagram.com/b", phone: "+5511999990000", sourceUrl: "https://instagram.com/b" }, "instagram");
  scoreLead(db, a.id, campaign.id); scoreLead(db, b.id, campaign.id);
  return { db, campaign, a: a.id, b: b.id };
}

describe("autopilot plan", () => {
  it("discovers below target, picks the best qualified lead once, and asks for a daily rebalance", () => {
    const { db, campaign, a, b } = setup();
    const plan = autopilotPlan(db, new Date("2026-09-08T12:00:00Z"));
    expect(plan.discover).toEqual([campaign.id]);
    expect(plan.firstContact).toBe(b); // phone contact scores higher than bio alone
    expect(plan.rebalance).toBe(true);
    recordOutbound(db, { leadId: b, text: "oi", via: "browser", kind: "first_contact" }, new Date("2026-09-08T12:00:00Z"));
    markRebalanced(db, new Date("2026-09-08T12:00:00Z"));
    const next = autopilotPlan(db, new Date("2026-09-08T12:05:00Z"));
    expect(next.firstContact).toBe(a);
    expect(next.rebalance).toBe(false);
    expect(next.followups).toEqual([]);
    expect(autopilotPlan(db, new Date("2026-09-12T12:00:00Z")).followups).toEqual([b]);
  });

  it("does nothing while paused or when the campaign has autopilot off", () => {
    const { db } = setup(false);
    expect(autopilotPlan(db)).toMatchObject({ discover: [], firstContact: null, paused: false });
    const paused = setup();
    pauseAll(paused.db, "teste");
    expect(autopilotPlan(paused.db)).toMatchObject({ discover: [], firstContact: null, followups: [], paused: true });
  });

  it("uses one idempotency key per 5-minute window", () => {
    expect(tickKey(new Date("2026-09-08T12:01:00Z"))).toBe(tickKey(new Date("2026-09-08T12:04:59Z")));
    expect(tickKey(new Date("2026-09-08T12:01:00Z"))).not.toBe(tickKey(new Date("2026-09-08T12:06:00Z")));
  });
});
