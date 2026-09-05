# LeadHunter Local MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local LeadHunter application that converts an ICP into deduplicated, enriched, scored leads with cited outreach drafts, dry-run email, export, and operational tracking.

**Architecture:** A Next.js App Router modular monolith owns the PT-BR UI and server endpoints. SQLite/Drizzle persists all business and job state; a local worker shares the feature modules used by the web process. External discovery, crawl, LLM, and SMTP integrations sit behind small adapters and degrade safely when unconfigured.

**Tech Stack:** Node.js 24 LTS, pnpm 11, Next.js, React, strict TypeScript, Tailwind CSS, SQLite, Drizzle ORM, Zod, Vitest, Testing Library, Playwright, OpenAI SDK, Nodemailer.

**Spec:** `docs/superpowers/specs/2026-09-05-leadhunter-local-design.md`

## Global Constraints

- Single-user, single-machine modular monolith; no authentication, billing, tenancy, Redis, or cloud infrastructure.
- UI and operator documentation are PT-BR; source, schema, statuses, logs, and technical tests are English.
- SQLite is authoritative, uses WAL, foreign keys, busy timeout, UTC timestamps, and versioned migrations.
- External integrations are optional; automated tests never require network credentials.
- Email sending defaults to `EMAIL_SENDING_ENABLED=false` and every non-enabled attempt is a persisted dry-run.
- Lead-specific claims require evidence IDs; business claims come only from `verifiedClaims`.
- The crawler allows HTTP(S) only and blocks localhost, private/link-local networks, and metadata endpoints.

---

### Task 1: Foundation, database, and durable jobs

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `drizzle.config.ts`
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrations/0000_initial.sql`, `src/db/migrate.ts`, `src/db/seed.ts`
- Create: `src/worker/queue.ts`, `src/worker/runner.ts`, `src/worker/process.ts`
- Test: `src/db/schema.test.ts`, `src/worker/queue.test.ts`

**Interfaces:**
- Produces: `db`, `migrateDatabase()`, `seedDemoData()`, `enqueueJob(input)`, `claimNextJob(workerId)`, `completeJob(id, result)`, `failJob(id, error)`, `recoverStaleJobs(now)`.

- [x] Write schema/queue tests that assert foreign keys, unique job keys, atomic claims, bounded retry/backoff, dead-letter, and stale-running recovery.
- [x] Run `pnpm vitest run src/db/schema.test.ts src/worker/queue.test.ts`; confirm failure because the modules do not exist.
- [x] Scaffold the stable dependencies and strict configuration, create the complete schema/migration, and implement SQLite connection pragmas plus queue operations.
- [x] Run migration, focused tests, `pnpm lint`, and `pnpm typecheck`; confirm all pass.
- [x] Commit as `feat: establish database and durable jobs`.

### Task 2: Business onboarding, campaigns, and application shell

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/campaigns/page.tsx`, `src/app/campaigns/new/page.tsx`, `src/app/settings/business/page.tsx`
- Create: `src/components/app-shell.tsx`, `src/components/ui.tsx`
- Create: `src/features/business/schema.ts`, `src/features/business/actions.ts`, `src/features/campaigns/schema.ts`, `src/features/campaigns/actions.ts`
- Test: `src/features/business/actions.test.ts`, `src/features/campaigns/actions.test.ts`

**Interfaces:**
- Consumes: `db` and tables from Task 1.
- Produces: `businessProfileSchema`, `saveBusinessProfile(input)`, `campaignSchema`, `createCampaign(input)`, `updateCampaignStatus(id, status)`.

- [x] Write failing tests for first-run redirect state, complete profile persistence/editing, campaign validation, creation, and translated statuses.
- [x] Run the focused tests and confirm expected missing-module failures.
- [x] Implement validated actions and the PT-BR shell/onboarding/campaign screens with deliberate empty, validation, disabled-integration, and success states.
- [x] Run focused tests, lint, typecheck, and a production build.
- [x] Commit as `feat: add onboarding and campaigns`.

### Task 3: Discovery providers and deduplication

**Files:**
- Create: `src/features/discovery/types.ts`, `src/features/discovery/dedupe.ts`, `src/features/discovery/service.ts`
- Create: `src/integrations/discovery/csv.ts`, `src/integrations/discovery/seed-urls.ts`, `src/integrations/discovery/overpass.ts`, `src/integrations/discovery/google-places.ts`
- Create: `src/app/api/campaigns/[id]/discover/route.ts`, `src/app/api/import/csv/route.ts`
- Test: `src/features/discovery/dedupe.test.ts`, `src/features/discovery/service.test.ts`, `src/integrations/discovery/csv.test.ts`, `src/integrations/discovery/overpass.test.ts`

**Interfaces:**
- Produces: `LeadDiscoveryProvider.discover(input): AsyncGenerator<DiscoveredLead>`, `normalizeLeadIdentity()`, `upsertDiscoveredLead(tx, lead, source)`, and provider factories.

- [x] Write failing tests for domain/email/phone/canonical-URL/name-location matches, multi-source merging, concurrent idempotency, header aliases/mapping, seed URLs, Overpass query generation/cache/rate handling, and optional Google Places disablement.
- [x] Run focused tests and confirm they fail for missing behavior.
- [x] Implement the provider contract, normalization, transactional upsert/source history, CSV parser, seed provider, conservative Overpass client, and key-gated Google Places adapter.
- [x] Run focused tests plus lint/typecheck.
- [x] Commit as `feat: discover and deduplicate leads`.

### Task 4: Safe enrichment and evidence

**Files:**
- Create: `src/features/enrichment/url-safety.ts`, `src/features/enrichment/extract.ts`, `src/features/enrichment/service.ts`
- Create: `src/integrations/web/crawler.ts`
- Create: `src/app/leads/[id]/page.tsx`
- Test: `src/features/enrichment/url-safety.test.ts`, `src/features/enrichment/extract.test.ts`, `src/features/enrichment/service.test.ts`

**Interfaces:**
- Produces: `assertPublicHttpUrl(url)`, `extractBusinessData(html, sourceUrl)`, `enrichLead(leadId, fetcher)`, and evidence/contact persistence.

- [x] Write failing tests for protocol/DNS/private-network rejection, redirect revalidation, page/body/time bounds, contact/social/service extraction, “not detected” language, cache reuse, and evidence source linkage.
- [x] Run focused tests and confirm expected failures.
- [x] Implement the safe crawler, clean HTML extraction, bounded link selection, contact/evidence persistence, and lead detail screen.
- [x] Run focused tests, lint, typecheck, and build.
- [x] Commit as `feat: enrich leads with cited evidence`.

### Task 5: Deterministic scoring and optional AI

**Files:**
- Create: `src/features/scoring/score.ts`, `src/features/scoring/service.ts`
- Create: `src/integrations/llm/client.ts`, `src/integrations/llm/schemas.ts`, `src/integrations/llm/cost.ts`
- Test: `src/features/scoring/score.test.ts`, `src/features/scoring/service.test.ts`, `src/integrations/llm/client.test.ts`

**Interfaces:**
- Produces: `calculateLeadScore(input): { score; confidence; breakdown }`, `scoreLead(leadId)`, `interpretEvidence(input)`, `recordAiCall(input)`, `assertAiBudgetAvailable()`.

- [ ] Write failing tests for the five score sections, 0–100 clamping, exclusions, campaign-weighted signals, confidence independent from score, deterministic no-key fallback, structured LLM validation, evidence-only output, and monthly budget cutoff.
- [ ] Run focused tests and confirm the score/LLM modules are missing.
- [ ] Implement deterministic scoring and the centralized OpenAI-compatible client with Zod parsing, model selection, call accounting, and graceful unavailability.
- [ ] Run focused tests plus lint/typecheck.
- [ ] Commit as `feat: score leads and track ai usage`.

### Task 6: Outreach, suppression, dry-run email, and export

**Files:**
- Create: `src/features/outreach/draft.ts`, `src/features/outreach/email.ts`, `src/features/outreach/suppression.ts`, `src/features/outreach/export.ts`
- Create: `src/integrations/smtp/client.ts`
- Create: `src/app/outreach/page.tsx`, `src/app/api/exports/campaigns/[id]/route.ts`
- Test: `src/features/outreach/draft.test.ts`, `src/features/outreach/email.test.ts`, `src/features/outreach/suppression.test.ts`, `src/features/outreach/export.test.ts`

**Interfaces:**
- Produces: `generateOutreachDraft(leadId, channel)`, `prepareEmailAttempt(input)`, `sendApprovedEmail(input)`, `suppress(input)`, `isSuppressed(lead)`, `exportCampaignCsv(id)`.

- [ ] Write failing tests for evidence-bound personalization, forbidden-claim rejection, short PT-BR copy fallback, global suppression, default dry-run, disabled-real-send gate, approval, email syntax, daily limit, spacing, duplicate idempotency, and CSV escaping/content.
- [ ] Run focused tests and confirm failures for missing functionality.
- [ ] Implement drafts, suppression, dry-run-first email workflow, SMTP adapter, and streaming CSV export.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit as `feat: add safe outreach and exports`.

### Task 7: CRM, bulk operations, dashboard, campaign center, and jobs UI

**Files:**
- Create: `src/app/leads/page.tsx`, `src/app/shortlist/page.tsx`, `src/app/jobs/page.tsx`, `src/app/campaigns/[id]/page.tsx`
- Create: `src/features/leads/queries.ts`, `src/features/leads/bulk-actions.ts`, `src/features/dashboard/queries.ts`
- Test: `src/features/leads/queries.test.ts`, `src/features/leads/bulk-actions.test.ts`, `src/features/dashboard/queries.test.ts`

**Interfaces:**
- Produces: `listLeads(filters, sort, page)`, `applyBulkAction(input)`, `getDashboardMetrics()`, `getCampaignOperations(id)`, and manual pipeline transitions.

- [ ] Write failing tests for every requested filter/sort, pagination, shortlist/draft/dry-run/suppression bulk operations, valid manual status transitions, metric definitions, campaign counts, source ranking, recent errors, and running jobs.
- [ ] Run focused tests and confirm failures.
- [ ] Implement dense PT-BR tables and operational pages using server rendering and progressive enhancement; include all requested columns, actions, and states.
- [ ] Run focused tests, lint, typecheck, and build.
- [ ] Commit as `feat: add lead operations workspace`.

### Task 8: Fixtures, end-to-end proof, real-source smoke test, and documentation

**Files:**
- Create: `src/db/fixtures.ts`, `tests/e2e/main-flow.spec.ts`, `tests/fixtures/dental-leads.csv`, `playwright.config.ts`
- Modify: `README.md`, `.gitignore`
- Create: `SETUP.md`, `docs/reference/buscandomilhao.md`

**Interfaces:**
- Consumes all product flows and commands from Tasks 1–7.
- Produces a reproducible 20-lead demo, full browser acceptance proof, operator setup/runbook, and preserved historical prompt.

- [ ] Write the Playwright scenario for onboarding, a Miami dental campaign, importing 20 fictitious companies, dedupe, mock enrichment, ranking, selection, draft generation, dry-run, export, and manual result update.
- [ ] Run it against the unfinished fixture flow and confirm the expected failure.
- [ ] Add deterministic fixtures/seed commands, finish browser-accessible actions, and configure one-command web+worker development.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`; all must exit 0 with clean output.
- [ ] Run a bounded Overpass request and one public seed-URL enrichment; persist/report the exact result without making automated tests network-dependent.
- [ ] Rewrite README for LeadHunter, write PT-BR setup/backup/troubleshooting instructions, preserve `PROMPT.md` at `docs/reference/buscandomilhao.md`, and document only credentials required for optional real integrations.
- [ ] Commit as `feat: complete LeadHunter local MVP`.
