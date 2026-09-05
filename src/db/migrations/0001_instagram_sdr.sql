ALTER TABLE business_profiles ADD COLUMN owner_name TEXT;
ALTER TABLE business_profiles ADD COLUMN owner_role TEXT;
ALTER TABLE business_profiles ADD COLUMN instagram_handle TEXT;
ALTER TABLE business_profiles ADD COLUMN whatsapp_link TEXT;
ALTER TABLE business_profiles ADD COLUMN affiliate_group_link TEXT;
ALTER TABLE business_profiles ADD COLUMN how_it_works TEXT;
ALTER TABLE business_profiles ADD COLUMN revenue_model TEXT;
ALTER TABLE business_profiles ADD COLUMN market_jargon TEXT;
ALTER TABLE business_profiles ADD COLUMN unverified_claims TEXT NOT NULL DEFAULT '[]';
ALTER TABLE business_profiles ADD COLUMN affiliate_topics TEXT NOT NULL DEFAULT '[]';
ALTER TABLE business_profiles ADD COLUMN geography TEXT;

ALTER TABLE leads ADD COLUMN funnel TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE leads ADD COLUMN instagram_handle TEXT;
ALTER TABLE leads ADD COLUMN profile TEXT;
ALTER TABLE leads ADD COLUMN decision_role TEXT;
ALTER TABLE leads ADD COLUMN channel_state TEXT NOT NULL DEFAULT 'browser_contact_pending';
ALTER TABLE leads ADD COLUMN meta_user_id TEXT;
ALTER TABLE leads ADD COLUMN next_action_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leads_instagram_handle_unique ON leads (instagram_handle);
CREATE UNIQUE INDEX IF NOT EXISTS leads_meta_user_id_unique ON leads (meta_user_id);

ALTER TABLE campaigns ADD COLUMN funnel TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE campaigns ADD COLUMN autopilot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN hashtags TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'instagram',
  owner TEXT NOT NULL DEFAULT 'browser',
  state TEXT NOT NULL DEFAULT 'browser_contact_pending',
  meta_user_id TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  followups_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'instagram',
  sent_via TEXT,
  text TEXT NOT NULL,
  variant_id TEXT,
  external_id TEXT UNIQUE,
  intent TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variable TEXT NOT NULL,
  funnel TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'running',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_variants (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES experiment_variants(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (lead_id, experiment_id)
);

CREATE TABLE IF NOT EXISTS ai_decisions (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  intent TEXT NOT NULL,
  action TEXT NOT NULL,
  reply TEXT,
  reasoning TEXT NOT NULL DEFAULT '',
  model TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
