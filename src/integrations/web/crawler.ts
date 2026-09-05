import { assertPublicHttpUrl } from "@/features/enrichment/url-safety";
import { extractBusinessData } from "@/features/enrichment/extract";

export interface CrawledPage { url: string; html: string }
export interface LeadCrawler { crawl(startUrl: string): Promise<CrawledPage[]> }

export function createCrawler(options: { fetcher?: typeof fetch; maxPages?: number; maxBodyBytes?: number; timeoutMs?: number } = {}): LeadCrawler {
  const fetcher = options.fetcher ?? fetch;
  const maxPages = options.maxPages ?? 3;
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const cache = new Map<string, CrawledPage[]>();

  async function fetchHtml(value: string): Promise<CrawledPage> {
    let url = await assertPublicHttpUrl(value);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetcher(url, { redirect: "manual", headers: { accept: "text/html", "user-agent": "LeadHunterLocal/0.1 (+local business research)" }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirecionamento sem destino.");
        url = await assertPublicHttpUrl(new URL(location, url).href);
        continue;
      }
      if (!response.ok) throw new Error(`Site returned ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("text/html")) throw new Error("O recurso não é uma página HTML.");
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > maxBodyBytes) throw new Error("A página excede o limite de tamanho.");
      const html = await response.text();
      if (Buffer.byteLength(html, "utf8") > maxBodyBytes) throw new Error("A página excede o limite de tamanho.");
      return { url: url.href, html };
    }
    throw new Error("O site excedeu o limite de redirecionamentos.");
  }

  return { async crawl(startUrl: string) {
    const cached = cache.get(startUrl); if (cached) return cached;
    const homepage = await fetchHtml(startUrl);
    const pages = [homepage];
    const links = extractBusinessData(homepage.html, homepage.url).internalLinks;
    for (const link of links) {
      if (pages.length >= maxPages) break;
      try { pages.push(await fetchHtml(link)); } catch { /* A secondary page must not block enrichment. */ }
    }
    cache.set(startUrl, pages);
    return pages;
  } };
}
