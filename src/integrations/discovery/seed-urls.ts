import type { LeadDiscoveryProvider } from "@/features/discovery/types";

export function createSeedUrlProvider(urls: string[]): LeadDiscoveryProvider {
  return { name: "seed_urls", async *discover() {
    for (const value of urls) {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      yield { companyName: url.hostname.replace(/^www\./, ""), website: url.href, sourceUrl: url.href };
    }
  } };
}
