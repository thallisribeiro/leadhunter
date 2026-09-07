// Instagram as a discovery source: keyword search and hashtag pages surface handles; each public
// profile becomes a lead with its snapshot, decision role and signals as evidence.
import type { DiscoveredLead, DiscoveryInput, LeadDiscoveryProvider } from "@/features/discovery/types";
import type { InstagramBrowser } from "@/integrations/browser/instagram";

export function createInstagramProvider(browser: InstagramBrowser, options: { perQuery?: number; pauseMs?: number } = {}): LeadDiscoveryProvider {
  const perQuery = options.perQuery ?? 12;
  const pause = options.pauseMs ?? 1_500;
  return { name: "instagram", async *discover(input: DiscoveryInput) {
    const queries = new Set<string>();
    for (const keyword of input.keywords) queries.add(keyword);
    for (const industry of input.industries) for (const location of input.locations.length ? input.locations : [""]) queries.add(`${industry} ${location.split(",")[0] ?? ""}`.trim());
    const seen = new Set<string>();
    let yielded = 0;
    // Legenda do post vai junto do handle (não é jogada fora depois de achar o autor): é o que
    // deixa quem pontua o lead rejeitar pelo que o post realmente diz, não só pela bio do perfil.
    const captionByHandle = new Map<string, string | undefined>();
    for (const query of queries) { for (const match of await browser.searchAccounts(query, perQuery)) if (!seen.has(match.handle)) { seen.add(match.handle); captionByHandle.set(match.handle, match.caption); } if (captionByHandle.size >= input.limit) break; }
    for (const tag of input.hashtags ?? []) { if (captionByHandle.size >= input.limit) break; for (const match of await browser.hashtagAuthors(tag, perQuery)) if (!seen.has(match.handle)) { seen.add(match.handle); captionByHandle.set(match.handle, match.caption); } }
    for (const [handle, postCaption] of captionByHandle) {
      if (yielded >= input.limit) break;
      const profile = await browser.openProfile(handle);
      if (!profile) continue;
      yielded += 1;
      yield {
        companyName: profile.name || profile.handle,
        instagram: profile.url,
        website: profile.externalUrl ?? undefined,
        sourceUrl: profile.url,
        externalId: profile.handle,
        raw: { profile: { handle: profile.handle, name: profile.name, bio: profile.bio, followers: profile.followers, following: profile.following, posts: profile.posts, externalUrl: profile.externalUrl }, decisionRole: profile.decisionRole, signals: profile.signals, postCaption },
      } satisfies DiscoveredLead;
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause + Math.random() * pause));
    }
  } };
}
