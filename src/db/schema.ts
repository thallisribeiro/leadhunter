import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const utcColumns = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const businessProfiles = sqliteTable("business_profiles", {
  id: text("id").primaryKey(),
  businessName: text("business_name").notNull(),
  website: text("website"),
  businessDescription: text("business_description").notNull(),
  offer: text("offer").notNull(),
  oneLinePitch: text("one_line_pitch").notNull(),
  averageTicket: real("average_ticket"),
  salesGoal: text("sales_goal"),
  verifiedClaims: text("verified_claims").notNull().default("[]"),
  forbiddenClaims: text("forbidden_claims").notNull().default("[]"),
  targetIndustries: text("target_industries").notNull().default("[]"),
  targetBusinessTypes: text("target_business_types").notNull().default("[]"),
  targetLocations: text("target_locations").notNull().default("[]"),
  targetCompanySize: text("target_company_size"),
  targetKeywords: text("target_keywords").notNull().default("[]"),
  positiveSignals: text("positive_signals").notNull().default("[]"),
  negativeSignals: text("negative_signals").notNull().default("[]"),
  exclusions: text("exclusions").notNull().default("[]"),
  outreachGoal: text("outreach_goal").notNull(),
  callToAction: text("call_to_action").notNull(),
  tone: text("tone").notNull(),
  outreachLanguage: text("outreach_language").notNull().default("pt-BR"),
  exampleMessages: text("example_messages").notNull().default("[]"),
  additionalInstructions: text("additional_instructions"),
  ...utcColumns,
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  targetLocations: text("target_locations").notNull().default("[]"),
  industries: text("industries").notNull().default("[]"),
  keywords: text("keywords").notNull().default("[]"),
  requiredSignals: text("required_signals").notNull().default("[]"),
  preferredSignals: text("preferred_signals").notNull().default("[]"),
  excludedSignals: text("excluded_signals").notNull().default("[]"),
  sources: text("sources").notNull().default("[]"),
  targetLeadCount: integer("target_lead_count").notNull().default(20),
  minimumScore: integer("minimum_score").notNull().default(70),
  outreachLanguage: text("outreach_language").notNull().default("pt-BR"),
  status: text("status").notNull().default("draft"),
  ...utcColumns,
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  website: text("website"),
  normalizedDomain: text("normalized_domain").unique(),
  primaryEmail: text("primary_email"),
  normalizedEmail: text("normalized_email").unique(),
  primaryPhone: text("primary_phone"),
  normalizedPhone: text("normalized_phone").unique(),
  canonicalUrl: text("canonical_url").unique(),
  industry: text("industry"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  locationKey: text("location_key").notNull().default(""),
  description: text("description"),
  opportunity: text("opportunity"),
  status: text("status").notNull().default("discovered"),
  shortlisted: integer("shortlisted", { mode: "boolean" }).notNull().default(false),
  lastActionAt: text("last_action_at"),
  ...utcColumns,
});

export const campaignLeads = sqliteTable("campaign_leads", {
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
});

export const leadSources = sqliteTable("lead_sources", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  sourceUrl: text("source_url").notNull(),
  externalId: text("external_id"),
  metadata: text("metadata").notNull().default("{}"),
  capturedAt: text("captured_at").notNull(),
});

export const leadContacts = sqliteTable("lead_contacts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  value: text("value").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull(),
});

export const leadEvidence = sqliteTable("lead_evidence", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  value: text("value").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceProvider: text("source_provider").notNull(),
  capturedAt: text("captured_at").notNull(),
  metadata: text("metadata").notNull().default("{}"),
});

export const leadScores = sqliteTable("lead_scores", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  confidence: integer("confidence").notNull(),
  breakdown: text("breakdown").notNull(),
  whyThisLead: text("why_this_lead").notNull(),
  createdAt: text("created_at").notNull(),
});

export const outreachDrafts = sqliteTable("outreach_drafts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  personalizationHook: text("personalization_hook").notNull(),
  evidenceIds: text("evidence_ids").notNull().default("[]"),
  model: text("model"),
  approved: integer("approved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const outreachEvents = sqliteTable("outreach_events", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  draftId: text("draft_id").references(() => outreachDrafts.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

export const suppressions = sqliteTable("suppressions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  value: text("value").notNull(),
  normalizedValue: text("normalized_value").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("suppressions_type_value_unique").on(table.type, table.normalizedValue)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  result: text("result"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  workerId: text("worker_id"),
  error: text("error"),
  nextRunAt: text("next_run_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  ...utcColumns,
});

export const aiCalls = sqliteTable("ai_calls", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const crawlCache = sqliteTable("crawl_cache", {
  url: text("url").primaryKey(),
  statusCode: integer("status_code").notNull(),
  contentType: text("content_type"),
  body: text("body").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const exportRecords = sqliteTable("exports", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  format: text("format").notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: text("created_at").notNull(),
});
