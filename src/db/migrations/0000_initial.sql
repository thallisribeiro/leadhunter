CREATE TABLE IF NOT EXISTS business_profiles (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  website TEXT,
  business_description TEXT NOT NULL,
  offer TEXT NOT NULL,
  one_line_pitch TEXT NOT NULL,
  average_ticket REAL,
  sales_goal TEXT,
  verified_claims TEXT NOT NULL DEFAULT '[]',
  forbidden_claims TEXT NOT NULL DEFAULT '[]',
  target_industries TEXT NOT NULL DEFAULT '[]',
  target_business_types TEXT NOT NULL DEFAULT '[]',
  target_locations TEXT NOT NULL DEFAULT '[]',
  target_company_size TEXT,
  target_keywords TEXT NOT NULL DEFAULT '[]',
  positive_signals TEXT NOT NULL DEFAULT '[]',
  negative_signals TEXT NOT NULL DEFAULT '[]',
  exclusions TEXT NOT NULL DEFAULT '[]',
  outreach_goal TEXT NOT NULL,
  call_to_action TEXT NOT NULL,
  tone TEXT NOT NULL,
  outreach_language TEXT NOT NULL DEFAULT 'pt-BR',
  example_messages TEXT NOT NULL DEFAULT '[]',
  additional_instructions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_locations TEXT NOT NULL DEFAULT '[]',
  industries TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  required_signals TEXT NOT NULL DEFAULT '[]',
  preferred_signals TEXT NOT NULL DEFAULT '[]',
  excluded_signals TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  target_lead_count INTEGER NOT NULL DEFAULT 20,
  minimum_score INTEGER NOT NULL DEFAULT 70,
  outreach_language TEXT NOT NULL DEFAULT 'pt-BR',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  website TEXT,
  normalized_domain TEXT UNIQUE,
  primary_email TEXT,
  normalized_email TEXT UNIQUE,
  primary_phone TEXT,
  normalized_phone TEXT UNIQUE,
  canonical_url TEXT UNIQUE,
  industry TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  location_key TEXT NOT NULL DEFAULT '',
  description TEXT,
  opportunity TEXT,
  status TEXT NOT NULL DEFAULT 'discovered',
  shortlisted INTEGER NOT NULL DEFAULT 0,
  last_action_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_name_location_unique ON leads(normalized_name, location_key) WHERE normalized_domain IS NULL AND normalized_email IS NULL AND normalized_phone IS NULL;

CREATE TABLE IF NOT EXISTS campaign_leads (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, lead_id)
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  external_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL,
  UNIQUE(lead_id, provider, source_url)
);

CREATE TABLE IF NOT EXISTS lead_contacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(lead_id, type, normalized_value)
);

CREATE TABLE IF NOT EXISTS lead_evidence (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_provider TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL,
  UNIQUE(lead_id, type, value, source_url)
);

CREATE TABLE IF NOT EXISTS lead_scores (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  confidence INTEGER NOT NULL,
  breakdown TEXT NOT NULL,
  why_this_lead TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lead_scores_lead_campaign_idx ON lead_scores(lead_id, campaign_id, created_at);

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  personalization_hook TEXT NOT NULL,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  draft_id TEXT REFERENCES outreach_drafts(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(type, normalized_value)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT NOT NULL UNIQUE,
  worker_id TEXT,
  error TEXT,
  next_run_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, next_run_at, created_at);

CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_cache (
  url TEXT PRIMARY KEY,
  status_code INTEGER NOT NULL,
  content_type TEXT,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
