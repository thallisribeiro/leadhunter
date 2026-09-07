// Instagram through the operator's real Chrome over CDP. The session belongs to the operator (logged in
// once, by hand, in a dedicated profile). Rules from the original prompt: reuse the logged-in context,
// own tab per job, never steal focus, only instagram.com, close the tab in finally, save artifacts on
// failure. No fingerprint spoofing, no private API, no bypassing restrictions: a restriction pauses everything.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { classifyRole, parseProfileMeta, profileSignals, type InstagramProfile } from "@/integrations/browser/parse";

export class InstagramRestrictionError extends Error { constructor(message: string) { super(message); this.name = "InstagramRestrictionError"; } }
export class BrowserUnavailableError extends Error { constructor(message: string) { super(message); this.name = "BrowserUnavailableError"; } }

export interface DmOptions { dryRun: boolean; typingDelayMs?: number; jobId?: string }
export interface DmResult { sent: boolean; dryRun: boolean }
export interface DiscoveredProfile extends InstagramProfile { decisionRole: ReturnType<typeof classifyRole>; signals: string[] }

// Achado (handle) sempre vem de um post real: sem a legenda, o dono não pode dizer se o
// conteúdo tinha a ver com o negócio — foi assim que "assessoria em licitação" (concorrente,
// sinal negativo declarado no perfil) quase virou lead no 1º teste real, 06/09/2026.
export interface AuthorMatch { handle: string; caption?: string }

export interface InstagramBrowser {
  openProfile(handle: string, jobId?: string): Promise<DiscoveredProfile | null>;
  searchAccounts(query: string, limit: number, jobId?: string): Promise<AuthorMatch[]>;
  hashtagAuthors(tag: string, limit: number, jobId?: string): Promise<AuthorMatch[]>;
  sendDirectMessage(handle: string, text: string, options: DmOptions): Promise<DmResult>;
  close(): Promise<void>;
}

const RESTRICTION_RE = /try again later|action blocked|we restrict certain activity|suspicious|tente novamente mais tarde|a[çc][ãa]o bloqueada|atividade suspeita|confirme que [ée] voc[êe]|challenge/i;
const ALLOWED_HOST_RE = /(^|\.)(instagram\.com|cdninstagram\.com|fbcdn\.net|facebook\.com)$/i;
// "popular" achado no 1º teste real: é a aba "Populares" da própria página de busca do
// Instagram, não uma conta — virou lead fantasma (bio vazia, 0 seguidores) até eu notar.
const RESERVED = new Set(["explore", "p", "reel", "reels", "stories", "accounts", "direct", "about", "legal", "developer", "privacy", "terms", "api", "web", "tv", "challenge", "popular"]);

export function handlesFromHrefs(hrefs: string[]): string[] {
  const out: string[] = [];
  for (const href of hrefs) {
    const match = /^\/([a-z0-9._]{1,30})\/?$/i.exec(href.replace(/^https?:\/\/(www\.)?instagram\.com/i, ""));
    const handle = match?.[1]?.toLowerCase();
    if (handle && !RESERVED.has(handle) && !out.includes(handle)) out.push(handle);
  }
  return out;
}

export function authorFromPostDescription(description: string | null | undefined): string | null {
  const text = description ?? "";
  // "no" achado no 1º teste real (06/09): a legenda real veio como "usuario no May 12, 2026"
  // — locale mistura data em inglês com conector em português, nem "on" nem "em" batiam, e
  // a extração falhava calada em praticamente todo post (abria a página, não virava lead).
  const withCount = /-\s*([a-z0-9._]{1,30})\s+(on|em|no)\s/i.exec(text);
  if (withCount) return withCount[1]!.toLowerCase();
  // Sem "N curtidas, N comentários -" na frente (mesmo teste, post sem contagem visível): a
  // legenda começa direto no usuário, "usuario no DATA: ...". Só aceita no INÍCIO da string —
  // sem essa âncora, "no " no meio de uma legenda longa viraria falso positivo.
  return /^([a-z0-9._]{1,30})\s+(on|em|no)\s/i.exec(text)?.[1]?.toLowerCase() ?? null;
}

export function createCdpInstagramBrowser(options: { cdpUrl?: string; artifactsDir?: string; slowMo?: number } = {}): InstagramBrowser {
  const cdpUrl = options.cdpUrl ?? process.env.CHROME_CDP_URL ?? "http://127.0.0.1:9222";
  const artifactsDir = options.artifactsDir ?? path.join(process.cwd(), "data", "artifacts");
  let browser: Browser | null = null;
  let busy: Promise<unknown> = Promise.resolve(); // ponytail: process-level mutex, one browser job at a time

  async function context(): Promise<BrowserContext> {
    try {
      if (!browser || !browser.isConnected()) browser = await chromium.connectOverCDP(cdpUrl, { timeout: 10_000 });
    } catch (error) {
      throw new BrowserUnavailableError(`Chrome não respondeu em ${cdpUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const existing = browser.contexts()[0];
    if (!existing) throw new BrowserUnavailableError("O Chrome conectado não tem contexto logado. Abra o Instagram no perfil dedicado antes.");
    return existing;
  }

  async function saveArtifacts(page: Page, jobId: string, error: unknown, consoleErrors: string[]) {
    try {
      const dir = path.join(artifactsDir, jobId); mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: false }).catch(() => undefined);
      const aria = await page.locator("body").ariaSnapshot().catch(() => "");
      writeFileSync(path.join(dir, "accessibility.txt"), aria);
      writeFileSync(path.join(dir, "context.json"), JSON.stringify({ url: page.url(), error: error instanceof Error ? error.message : String(error), consoleErrors, at: new Date().toISOString() }, null, 2));
    } catch { /* artifacts are best effort */ }
  }

  async function withPage<T>(jobId: string, fn: (page: Page) => Promise<T>): Promise<T> {
    const run = async () => {
      const ctx = await context();
      const page = await ctx.newPage(); // own tab; never bringToFront, never touch the operator's tabs
      const consoleErrors: string[] = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300)); });
      await page.route("**/*", (route) => {
        let host = ""; try { host = new URL(route.request().url()).hostname; } catch { /* ignore */ }
        return ALLOWED_HOST_RE.test(host) ? route.continue() : route.abort();
      });
      try {
        const result = await fn(page);
        return result;
      } catch (error) {
        await saveArtifacts(page, jobId, error, consoleErrors);
        throw error;
      } finally {
        await page.close().catch(() => undefined);
      }
    };
    const next = busy.then(run, run);
    busy = next.catch(() => undefined);
    return next;
  }

  async function assertNotRestricted(page: Page) {
    const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const dialog = await page.getByRole("dialog").innerText({ timeout: 500 }).catch(() => "");
    const hit = RESTRICTION_RE.exec(dialog) ?? RESTRICTION_RE.exec(text.slice(0, 4_000));
    if (hit) throw new InstagramRestrictionError(`Instagram sinalizou restrição: "${hit[0]}"`);
  }

  async function readMeta(page: Page) {
    // Sem função nomeada aqui dentro (era `const meta = (s) => ...`): o esbuild/tsx embrulha
    // bindings nomeados com um helper __name(...) que só existe no Node. O Playwright serializa
    // esta função pra rodar dentro da página real do Instagram — outro mundo de JS, sem o helper
    // — e quebrava com "ReferenceError: __name is not defined" (achado no 1º teste real, 06/09).
    return page.evaluate(() => {
      const external = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="l.instagram.com/?u="]')).map((a) => { try { return new URL(a.href).searchParams.get("u"); } catch { return null; } }).find(Boolean) ?? null;
      return {
        url: location.href,
        ogTitle: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? null,
        ogDescription: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ?? null,
        description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null,
        externalUrl: external,
        title: document.title,
      };
    });
  }

  // Abre cada post de verdade e lê a legenda antes de aceitar o autor como achado — não basta
  // aparecer na busca do assunto (LicitaCerta e concorrentes de assessoria também aparecem).
  // A legenda vira `caption` e segue até virar evidência (service.ts), pra quem pontua o lead
  // conseguir rejeitar sinal negativo (ex.: "assessoria em licitação") pelo que o post realmente diz.
  async function authorsFromPosts(page: Page, postHrefs: string[], limit: number): Promise<AuthorMatch[]> {
    const found: AuthorMatch[] = [];
    for (const post of postHrefs) {
      if (found.length >= limit) break;
      await page.goto(`https://www.instagram.com${post}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const meta = await readMeta(page);
      const author = authorFromPostDescription(meta.description) ?? handlesFromHrefs([new URL(meta.ogTitle ? meta.url : meta.url).pathname])[0] ?? null;
      if (author && !found.some((f) => f.handle === author)) found.push({ handle: author, caption: meta.description?.slice(0, 1_000) ?? undefined });
      await page.waitForTimeout(1_200 + Math.random() * 1_500);
    }
    return found;
  }

  return {
    openProfile: (handle, jobId = `profile-${handle}`) => withPage(jobId, async (page) => {
      await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      const meta = await readMeta(page);
      if (/page not found|p[áa]gina n[ãa]o encontrada|isn't available/i.test(`${meta.title} ${meta.description ?? ""}`)) return null;
      const profile = parseProfileMeta(meta);
      return profile ? { ...profile, decisionRole: classifyRole(profile), signals: profileSignals(profile) } : null;
    }),
    // Busca por palavra-chave (não é a página de hashtag): pega os POSTS que aparecem pro
    // assunto pesquisado e lê cada um antes de aceitar — pedido do Thallis no 1º teste real,
    // depois de ver a automação abrir posts e descartar quase tudo sem ler nada.
    searchAccounts: (query, limit, jobId = `search-${query}`) => withPage(jobId, async (page) => {
      await page.goto(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      await page.waitForTimeout(2_500);
      const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.getAttribute("href") ?? ""));
      const postHrefs = hrefs.filter((h) => /^\/(p|reel)\//.test(h)).slice(0, limit * 2);
      return authorsFromPosts(page, postHrefs, limit);
    }),
    hashtagAuthors: (tag, limit, jobId = `hashtag-${tag}`) => withPage(jobId, async (page) => {
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag.replace(/^#/, ""))}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      await page.waitForTimeout(2_500);
      const posts = (await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/p/"], a[href^="/reel/"]')).map((a) => a.getAttribute("href") ?? ""))).slice(0, limit * 2);
      return authorsFromPosts(page, posts, limit);
    }),
    sendDirectMessage: (handle, text, dmOptions) => withPage(dmOptions.jobId ?? `dm-${handle}`, async (page) => {
      await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      const button = page.getByRole("button", { name: /^(message|mensagem|enviar mensagem)$/i }).first();
      await button.waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(600 + Math.random() * 900);
      await button.click();
      await assertNotRestricted(page);
      const box = page.getByRole("textbox").first();
      await box.waitFor({ state: "visible", timeout: 15_000 });
      await box.click();
      // Achado no 1º lote de envio real (06/09/2026): pressSequentially digita um "\n" da
      // mensagem como a tecla Enter de verdade, e a caixa do Instagram (Lexical) manda a
      // mensagem no Enter. Uma mensagem de 3 parágrafos virava 3 mensagens picotadas, e o
      // timeout batia porque a caixa esvaziava no meio da digitação. Shift+Enter quebra linha
      // sem enviar -- exatamente o que os apps de chat já fazem.
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) await box.pressSequentially(lines[i], { delay: dmOptions.typingDelayMs ?? 60, timeout: 60_000 });
        if (i < lines.length - 1) await page.keyboard.press("Shift+Enter");
      }
      await page.waitForTimeout(900 + Math.random() * 1_200);
      if (dmOptions.dryRun) return { sent: false, dryRun: true };
      await box.press("Enter");
      await page.waitForTimeout(1_500);
      await assertNotRestricted(page);
      const echoed = await page.getByText(text.slice(0, 40), { exact: false }).first().isVisible().catch(() => false);
      if (!echoed) throw new Error("A mensagem não apareceu na conversa depois do envio.");
      return { sent: true, dryRun: false };
    }),
    close: async () => { await browser?.close().catch(() => undefined); browser = null; },
  };
}
