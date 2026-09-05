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

export interface InstagramBrowser {
  openProfile(handle: string, jobId?: string): Promise<DiscoveredProfile | null>;
  searchAccounts(query: string, limit: number, jobId?: string): Promise<string[]>;
  hashtagAuthors(tag: string, limit: number, jobId?: string): Promise<string[]>;
  sendDirectMessage(handle: string, text: string, options: DmOptions): Promise<DmResult>;
  close(): Promise<void>;
}

const RESTRICTION_RE = /try again later|action blocked|we restrict certain activity|suspicious|tente novamente mais tarde|a[çc][ãa]o bloqueada|atividade suspeita|confirme que [ée] voc[êe]|challenge/i;
const ALLOWED_HOST_RE = /(^|\.)(instagram\.com|cdninstagram\.com|fbcdn\.net|facebook\.com)$/i;
const RESERVED = new Set(["explore", "p", "reel", "reels", "stories", "accounts", "direct", "about", "legal", "developer", "privacy", "terms", "api", "web", "tv", "challenge"]);

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
  return /-\s*([a-z0-9._]{1,30})\s+(on|em)\s/i.exec(description ?? "")?.[1]?.toLowerCase() ?? null;
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
    return page.evaluate(() => {
      const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
      const external = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="l.instagram.com/?u="]')).map((a) => { try { return new URL(a.href).searchParams.get("u"); } catch { return null; } }).find(Boolean) ?? null;
      return { url: location.href, ogTitle: meta('meta[property="og:title"]'), ogDescription: meta('meta[property="og:description"]'), description: meta('meta[name="description"]'), externalUrl: external, title: document.title };
    });
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
    searchAccounts: (query, limit, jobId = `search-${query}`) => withPage(jobId, async (page) => {
      await page.goto(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      await page.waitForTimeout(2_500);
      const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.getAttribute("href") ?? ""));
      return handlesFromHrefs(hrefs).slice(0, limit);
    }),
    hashtagAuthors: (tag, limit, jobId = `hashtag-${tag}`) => withPage(jobId, async (page) => {
      await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag.replace(/^#/, ""))}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await assertNotRestricted(page);
      await page.waitForTimeout(2_500);
      const posts = (await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/p/"], a[href^="/reel/"]')).map((a) => a.getAttribute("href") ?? ""))).slice(0, limit * 2);
      const authors: string[] = [];
      for (const post of posts) {
        if (authors.length >= limit) break;
        await page.goto(`https://www.instagram.com${post}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const meta = await readMeta(page);
        const author = authorFromPostDescription(meta.description) ?? handlesFromHrefs([new URL(meta.ogTitle ? meta.url : meta.url).pathname])[0] ?? null;
        if (author && !authors.includes(author)) authors.push(author);
        await page.waitForTimeout(1_200 + Math.random() * 1_500);
      }
      return authors;
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
      await box.pressSequentially(text, { delay: dmOptions.typingDelayMs ?? 60 });
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
