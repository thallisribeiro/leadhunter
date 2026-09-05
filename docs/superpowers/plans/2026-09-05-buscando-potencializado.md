# Buscando 1 Milhão potencializado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O LeadHunter passa a fazer tudo que o prompt "Buscando 1 Milhão" (`docs/reference/buscandomilhao.md`) pedia — SDR autônomo no Instagram com dois funis, navegador real + API oficial, motor de conversa, experimentos e CRM — somado ao que o LeadHunter já faz (descoberta por site/CSV/OSM, crawl com evidência, score determinístico, supressão, dry-run).

**Architecture:** Mesmo monólito modular (Next.js + SQLite + worker). Instagram entra como (1) fonte de descoberta, (2) canal de primeiro contato pelo Chrome do operador via CDP, (3) canal de continuação pela API oficial da Meta via webhook. Uma tabela `conversations` guarda a propriedade do canal (`browser` → `api`) e impede envio duplicado. O motor de conversa decide intenção → ação → resposta, só com `verifiedClaims`. Experimentos são variantes de mensagem com peso, rebalanceadas por resultado. Autopilot é um job periódico que respeita pausa geral, limites diários, janela de operação e aquecimento.

**Tech Stack:** Next.js 16, TypeScript strict, Drizzle + SQLite, `playwright-core` (connectOverCDP, sem baixar navegador), SDK OpenAI (opcional, fallback determinístico), vitest.

**Spec:** `docs/reference/buscandomilhao.md` (prompt original) + `docs/superpowers/specs/2026-09-05-leadhunter-local-design.md` (o que já existe).

## Global Constraints

- UI PT-BR; código, banco, status internos, testes e commits em inglês.
- Nada de fingerprint forjado, API privada do Instagram ou contorno de restrição. Navegador restrito a `instagram.com`, aba própria, nunca `bringToFront()`, fecha a aba em `finally`.
- Ritmo humano: `MAX_DMS_PER_DAY` (30), `MIN/MAX_SECONDS_BETWEEN_DMS` (90–240), `OPERATING_HOURS` (09:00–20:00), aquecimento 5/dia na 1ª semana +5 por semana.
- Envio real de DM só com `INSTAGRAM_DM_ENABLED=true`; padrão é dry-run que grava o evento e não abre o navegador.
- Pausa geral automática em: restrição do Instagram, 3 falhas seguidas de navegador, orçamento de IA estourado, envio duplicado detectado, webhook divergente. Nunca contornar pelo navegador o que a API recusou.
- Opt-out é permanente, por handle/telefone/e-mail/empresa, em todos os canais e campanhas.
- Segredos só em `.env`; `.chrome-profile/`, `data/`, `*.db` no `.gitignore`.
- Ao final: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` verdes.

---

### Task 1: Banco — migração 0001 e schema

**Files:** Create `src/db/migrations/0001_instagram_sdr.sql`; Modify `src/db/client.ts` (`applySchema` roda todas as migrações em ordem, ignora `duplicate column`/`already exists`), `src/db/schema.ts`.

**Produces:** colunas novas em `business_profiles` (owner_name, owner_role, instagram_handle, whatsapp_link, affiliate_group_link, how_it_works, revenue_model, market_jargon, unverified_claims, affiliate_topics, geography), `leads` (funnel, instagram_handle UNIQUE, profile JSON, decision_role, channel_state, meta_user_id UNIQUE, next_action_at), `campaigns` (funnel, autopilot, hashtags); tabelas `conversations`, `messages`, `experiments`, `experiment_variants`, `experiment_assignments`, `ai_decisions`, `webhook_events`, `exceptions`.

- [ ] Test `src/db/schema.test.ts`: `applySchema` duas vezes na mesma conexão não falha; `PRAGMA table_info(leads)` contém `channel_state`.
- [ ] Migração SQL + runner tolerante; typecheck.

### Task 2: Perfil do negócio completo (bloco CONFIGURAÇÃO do prompt)

**Files:** Modify `src/features/business/schema.ts`, `src/features/business/actions.ts`, `src/components/business-form.tsx`, `src/app/actions.ts`.

- [ ] Campos opcionais: `ownerName, ownerRole, instagramHandle, whatsappLink, affiliateGroupLink, howItWorks, revenueModel, marketJargon, unverifiedClaims[], affiliateTopics[], geography`. E2E atual continua passando (campos opcionais).

### Task 3: Camada de navegador (Instagram via CDP)

**Files:** Create `src/integrations/browser/parse.ts` (+ test), `src/integrations/browser/instagram.ts`, `src/integrations/browser/fake.ts` (para testes/dry-run).

**Produces:** `parseProfileMeta({url, ogTitle, ogDescription, description, externalUrl}) → InstagramProfile | null`; `classifyRole(profile) → 'owner'|'store'|'employee'|'unknown'`; interface `InstagramBrowser { openProfile, searchAccounts, hashtagAuthors, sendDirectMessage, close }`; `createCdpInstagramBrowser({ cdpUrl, artifactsDir })`; `InstagramRestrictionError`.

- [ ] Tests do parser com og:description em inglês e português, sufixos K/M/mil, bio.
- [ ] CDP: `chromium.connectOverCDP`, `browser.contexts()[0]`, `context.newPage()`, `page.route` bloqueando fora de `instagram.com`, digitação com delay, dry-run para antes do Enter, artefatos em falha (screenshot, aria snapshot, url, console).

### Task 4: Ritmo, aquecimento e pausa geral

**Files:** Create `src/features/instagram/pacing.ts` (+ test), `src/features/ops/guard.ts` (+ test).

**Produces:** `dailyCap(now, cfg)`, `canSendNow({now, sentToday, lastSentAt, cfg, rng})`, `parseOperatingHours`; `isPaused(db)`, `pauseAll(db, reason)`, `resumeAll(db)`, `recordBrowserFailure(db, msg)` (3 seguidas → pausa), `recordBrowserSuccess(db)`, `getSetting/setSetting`.

### Task 5: Descoberta no Instagram + conversas + handoff

**Files:** Create `src/integrations/discovery/instagram.ts`, `src/features/conversations/service.ts` (+ test); Modify `src/features/discovery/service.ts` (dedupe por `instagram_handle`, grava `profile`, `decision_role`, contato instagram, evidência de bio), `src/features/discovery/types.ts` (`handle`, `profile`), `src/features/campaigns/schema.ts` (`funnel`, `autopilot`, `hashtags`, source `instagram`).

**Produces:** `ensureConversation(db, leadId)`, `browserMaySend(db, leadId)`, `recordOutbound(db, {leadId, text, via, variantId, externalId?})`, `recordInbound(db, {leadId?, metaUserId, mid, text, at})` (idempotente por `mid`; troca owner para `api`), `apiMaySend(db, leadId, now)` (owner api + janela 24h + não suprimido).

- [ ] Tests: browser não envia duas vezes; inbound com `mid` repetido não duplica; após inbound o browser não pode mais enviar e a API pode; janela fechada bloqueia API.

### Task 6: API oficial da Meta + webhook

**Files:** Create `src/integrations/instagram/api.ts` (+ test), `src/app/api/webhooks/instagram/route.ts`.

**Produces:** `verifyWebhookSignature(appSecret, rawBody, header)`, `parseInstagramWebhook(payload) → InboundMessage[]`, `createMetaSender({token, apiVersion, fetcher}).sendText(recipientId, text)`, `messagingWindowOpen(lastInboundAt, now)`. Rota GET (hub.challenge) e POST (assinatura → `webhook_events` idempotente → job `process_inbound`).

### Task 7: Motor de conversa

**Files:** Create `src/features/conversations/engine.ts` (+ test); Modify `src/integrations/llm/client.ts` (`classifyWithLlm`, `composeWithLlm`, JSON estrito, `LLM_FAST_MODEL`).

**Produces:** `intents` (interested, asked_info, asked_pricing, wants_whatsapp, not_the_owner, will_forward, objection, not_interested, opt_out, ambiguous, needs_human), `classifyIntentHeuristic(text)`, `decideAction(intent, ctx)`, `composeReply(action, ctx)`, `violatesClaims(text, forbidden)`, `runEngine(db, {leadId, text, llm?})` grava `ai_decisions`, aplica opt-out (supressão + `do_not_contact`), manda `needs_human` para `exceptions`.

### Task 8: Experimentos

**Files:** Create `src/features/experiments/service.ts` (+ test).

**Produces:** `ensureDefaultExperiments(db)`, `assignVariant(db, {leadId, experimentId, rng})` (sticky), `renderTemplate(template, vars)`, `variantMetrics(db, experimentId)`, `rebalanceWeights(metrics, {minSample: 30, exploreFloor: 0.2})`, `applyRebalance(db, experimentId)`.

### Task 9: Worker — jobs novos e autopilot

**Files:** Modify `src/worker/queue.ts` (tipos), `src/worker/handlers.ts`, `src/worker/process.ts` (tick de autopilot a cada 5 min, chave idempotente por janela).

**Produces:** jobs `discover_instagram`, `send_instagram_dm`, `process_inbound`, `send_api_reply`, `followup`, `send_whatsapp`, `autopilot_tick`, `rebalance_experiments`. `autopilot_tick`: se não pausado, para cada campanha com `autopilot=1`: descobre se abaixo da meta; enfileira 1 DM se `canSendNow`; agenda follow-ups; rebalanceia 1x/dia.

### Task 10: CRM — funil, conversas, experimentos, Instagram

**Files:** Create `src/app/funil/page.tsx`, `src/app/conversas/page.tsx`, `src/app/conversas/[id]/page.tsx`, `src/app/experimentos/page.tsx`, `src/app/settings/instagram/page.tsx`, `src/app/instagram-actions.ts`; Modify `src/components/app-shell.tsx`, `src/app/page.tsx`, `src/app/leads/[id]/page.tsx`, `src/app/campaigns/new/page.tsx`, `src/app/globals.css`, `src/features/dashboard/queries.ts`.

- [ ] Kanban por funil (cliente/afiliado) com colunas do pipeline do prompt; timeline da conversa com estado do canal e resposta manual pela API; fila de exceções; métricas por variante; página Instagram com limites, status do Chrome (tenta conectar), botão de pausa geral, contador do dia, custo de IA por lead e por cliente.

### Task 11: Docs e entregáveis

**Files:** Modify `README.md`, `SETUP.md`, `.env.example`; Create `config/business.example.json`.

- [ ] SETUP: Chrome com perfil dedicado e `--remote-debugging-port` em `127.0.0.1` (macOS/Linux/Windows), aviso de segurança da porta, app da Meta + webhook + verify token, ordem simulação → dry-run → smoke autorizado → autonomia, pausa, backup.

### Task 12: Verificação e publicação

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`.
- [ ] Commit por task, merge em `main`, `git push origin main`.
