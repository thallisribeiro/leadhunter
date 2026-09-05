# LeadHunter Local MVP — Design

## Objective

Build a local, single-user B2B prospecting product that turns an ICP into a small, ranked list of researched companies with source-linked evidence and safe, personalized outreach drafts. The complete proof path is onboarding → campaign → discovery → deduplication → enrichment → scoring → prioritization → outreach dry-run → CSV export → manual outcome tracking.

## Product boundary

The product is a modular monolith: one Next.js repository, one SQLite database, and one local worker process started alongside the web app. There is no authentication, billing, tenancy, Redis, distributed infrastructure, automatic social messaging, or speculative SaaS scaffolding. Email sending is disabled unless the operator explicitly enables it.

The UI is PT-BR. Code, database names, internal status values, logs, tests, and technical documentation are English.

## Architecture

- Next.js App Router provides the operator UI, route handlers, and server actions.
- SQLite in WAL mode is the sole source of truth. Drizzle owns schema and versioned migrations.
- A durable SQLite job queue handles discovery, enrichment, scoring, outreach generation, email, and exports. Claims are transactional, retries are bounded, and abandoned running jobs are recovered after restart.
- Business behavior lives in focused feature modules. Integrations are thin adapters around Overpass, site fetching, SMTP, and an OpenAI-compatible LLM API client.
- External services are optional. The app remains usable without LLM, SMTP, Google Places, or network access by exposing deterministic fallbacks and fixtures.

## Data model

The minimum persisted entities are business profiles, campaigns, leads, lead sources, contacts, evidence, score snapshots, outreach drafts/events, suppressions, jobs, AI call accounting, settings, crawl cache entries, and export records.

Critical uniqueness is enforced in normalized identity tables and transactional upserts. Lead matching priority is normalized domain, phone, email, canonical URL, then normalized company name plus location. Multiple discoveries append source records to one lead.

All timestamps are UTC. Foreign keys are enabled. Mutable structured data is stored as validated JSON only where normalized rows add no value.

## Main flow

1. First launch redirects to business onboarding; a completed profile unlocks the product.
2. The operator creates a campaign, criteria, desired lead count, threshold, language, and enabled sources.
3. Starting the hunt enqueues provider work. CSV import, seed URLs, and Overpass are mandatory; Google Places activates only when configured.
4. Discovery upserts companies and preserves every source. One provider failure is recorded without stopping the others.
5. Enrichment conservatively fetches a bounded set of public pages, blocks private/local destinations, extracts public business contacts and signals, caches responses, and stores evidence with source URLs.
6. Deterministic scoring produces a 0–100 lead score and a separate confidence score with an auditable breakdown. Optional AI interprets unstructured evidence and produces text, never the numeric score.
7. Qualified leads can be shortlisted and selected in bulk. Draft generation may only use lead evidence and verified business claims.
8. Email action defaults to dry-run. Real SMTP additionally requires configuration, explicit enablement, approval, syntactic validity, suppression checks, campaign state, daily limit, spacing, and an idempotency key.
9. The operator exports CSV, changes pipeline outcomes manually, and sees operational metrics, job status, source errors, and AI spend.

## UI design contract

The interface is a dense, calm sales operations workspace—not a decorative analytics dashboard. A left navigation exposes Visão geral, Campanhas, Leads, Shortlist, Outreach, Jobs, and Configurações. Warm neutral surfaces, dark ink, one emerald action color, compact tables, restrained borders, and tabular numbers create a trustworthy research-console feel.

The primary dashboard answers “Quem devo prospectar agora?” with a prioritized lead queue and concise operational metrics. Campaign detail is the operating center. Lead detail puts score, confidence, opportunity, contacts, explanation, and cited evidence in one scan. Empty, loading, success, partial-failure, disabled-integration, and no-IA states are explicit in PT-BR.

## Safety and evidence rules

- Specific lead statements must reference stored evidence IDs.
- Operator claims must come only from `verifiedClaims`; `forbiddenClaims` are blocked.
- Missing data is described as “não detectado”, never as absolute absence.
- The crawler accepts only HTTP(S), resolves DNS, blocks localhost/private/link-local/metadata addresses, bounds redirects/pages/body size/time, and ignores non-HTML assets.
- Secrets never enter logs or Git. URLs and environment variables are validated at trust boundaries.
- Suppression is global across campaigns and channels.
- No action bypasses CAPTCHA, authentication, robots/anti-bot controls, or service limits.

## Error handling

Expected integration failures become persisted provider/job errors with actionable PT-BR UI copy. Jobs use limited exponential backoff, then dead-letter state. A failure for one lead or provider does not abort a campaign. AI budget exhaustion pauses AI-only work; the deterministic product keeps working.

## Testing and acceptance

Core behavior is developed test-first. Unit/integration coverage includes onboarding, campaigns, CSV mapping, provider behavior, all dedupe keys, concurrent/idempotent upserts, evidence, enrichment, SSRF protection, scoring and confidence, anti-hallucination, suppression, dry-run, email gates/limits/idempotency, jobs/retry/recovery, AI cost tracking, and CSV export.

The main browser test uses a fictitious agency campaign and 20 fictitious dental clinics to exercise the full offline path. Completion requires clean `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the main E2E. A separately reported real-source test exercises Overpass and at least one safe public seed URL when network access is available.

## Delivery sequence

1. Foundation: Next.js, Tailwind, SQLite/Drizzle, migrations, seed, durable worker.
2. Product base: onboarding, business settings, campaigns, leads list/detail.
3. Hunter: provider contract, CSV, seed URLs, Overpass, dedupe, source history.
4. Enrichment: bounded crawler, contact extraction, evidence, cache.
5. Intelligence: deterministic scoring, confidence, optional structured LLM interpretation.
6. Outreach: evidence-bound drafts, dry-run SMTP gate, suppressions, limits, export.
7. Operations: dashboard, campaign center, jobs, errors, metrics, AI cost.
8. Quality: complete automated verification, real-source smoke test, README and PT-BR setup guide.
