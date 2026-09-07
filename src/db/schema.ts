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
  ownerName: text("owner_name"),
  ownerRole: text("owner_role"),
  instagramHandle: text("instagram_handle"),
  whatsappLink: text("whatsapp_link"),
  affiliateGroupLink: text("affiliate_group_link"),
  howItWorks: text("how_it_works"),
  revenueModel: text("revenue_model"),
  marketJargon: text("market_jargon"),
  unverifiedClaims: text("unverified_claims").notNull().default("[]"),
  affiliateTopics: text("affiliate_topics").notNull().default("[]"),
  geography: text("geography"),
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
  funnel: text("funnel").notNull().default("customer"),
  autopilot: integer("autopilot", { mode: "boolean" }).notNull().default(false),
  hashtags: text("hashtags").notNull().default("[]"),
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
  funnel: text("funnel").notNull().default("customer"),
  instagramHandle: text("instagram_handle").unique(),
  profile: text("profile"),
  decisionRole: text("decision_role"),
  channelState: text("channel_state").notNull().default("browser_contact_pending"),
  metaUserId: text("meta_user_id").unique(),
  nextActionAt: text("next_action_at"),
  ...utcColumns,
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().unique().references(() => leads.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().default("instagram"),
  owner: text("owner").notNull().default("browser"),
  state: text("state").notNull().default("browser_contact_pending"),
  metaUserId: text("meta_user_id"),
  lastInboundAt: text("last_inbound_at"),
  lastOutboundAt: text("last_outbound_at"),
  followupsSent: integer("followups_sent").notNull().default(0),
  ...utcColumns,
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  channel: text("channel").notNull().default("instagram"),
  sentVia: text("sent_via"),
  text: text("text").notNull(),
  variantId: text("variant_id"),
  externalId: text("external_id").unique(),
  intent: text("intent"),
  createdAt: text("created_at").notNull(),
});

export const experiments = sqliteTable("experiments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  variable: text("variable").notNull(),
  funnel: text("funnel").notNull().default("customer"),
  status: text("status").notNull().default("running"),
  createdAt: text("created_at").notNull(),
});

export const experimentVariants = sqliteTable("experiment_variants", {
  id: text("id").primaryKey(),
  experimentId: text("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  template: text("template").notNull(),
  weight: real("weight").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const experimentAssignments = sqliteTable("experiment_assignments", {
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  experimentId: text("experiment_id").notNull().references(() => experiments.id, { onDelete: "cascade" }),
  variantId: text("variant_id").notNull().references(() => experimentVariants.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("experiment_assignments_pk").on(table.leadId, table.experimentId)]);

export const aiDecisions = sqliteTable("ai_decisions", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  intent: text("intent").notNull(),
  action: text("action").notNull(),
  reply: text("reply"),
  reasoning: text("reasoning").notNull().default(""),
  model: text("model"),
  createdAt: text("created_at").notNull(),
});

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  payload: text("payload").notNull(),
  processedAt: text("processed_at"),
  createdAt: text("created_at").notNull(),
});

export const exceptions = sqliteTable("exceptions", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
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

// Biblioteca de conteúdo (07/09/2026): as contas de referência do nicho e as peças que performaram
// nelas. Serve a duas coisas ao mesmo tempo — modelar o próximo conteúdo em cima do que já provou
// alcance, e dar contexto de nicho para o motor de conversa (o que essa audiência discute).
export const contentAccounts = sqliteTable("content_accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull().default("instagram"),
  handle: text("handle").notNull(),
  name: text("name"),
  bio: text("bio"),
  followers: integer("followers"),
  posts: integer("posts"),
  role: text("role").notNull().default("referencia"),
  notes: text("notes"),
  medianViews: integer("median_views"),
  lastMappedAt: text("last_mapped_at"),
  ...utcColumns,
}, (table) => ({ handleUnique: uniqueIndex("content_accounts_handle_unique").on(table.platform, table.handle) }));

export const contentPieces = sqliteTable("content_pieces", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => contentAccounts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("instagram"),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull().default("reel"),
  postedAt: text("posted_at"),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
  durationSeconds: integer("duration_seconds"),
  caption: text("caption"),
  transcript: text("transcript"),
  hook: text("hook"),
  fit: integer("fit").notNull().default(0),
  fitReason: text("fit_reason"),
  performance: real("performance"),
  starred: integer("starred").notNull().default(0),
  mediaPath: text("media_path"),
  ...utcColumns,
}, (table) => ({ externalUnique: uniqueIndex("content_pieces_external_unique").on(table.platform, table.externalId) }));
