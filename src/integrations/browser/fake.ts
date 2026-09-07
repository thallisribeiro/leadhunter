// In-memory Instagram for tests, fixture mode and dry-runs without a Chrome session.
import { classifyRole, profileSignals, type InstagramProfile } from "@/integrations/browser/parse";
import type { AuthorMatch, DiscoveredProfile, DmOptions, InstagramBrowser } from "@/integrations/browser/instagram";

export function createFakeInstagramBrowser(seed: { profiles?: InstagramProfile[]; searches?: Record<string, string[]>; hashtags?: Record<string, string[]>; failSend?: (handle: string) => Error | null } = {}): InstagramBrowser & { sent: Array<{ handle: string; text: string; dryRun: boolean }> } {
  const profiles = new Map((seed.profiles ?? []).map((p) => [p.handle, p]));
  const sent: Array<{ handle: string; text: string; dryRun: boolean }> = [];
  return {
    sent,
    async openProfile(handle): Promise<DiscoveredProfile | null> {
      const profile = profiles.get(handle.toLowerCase()); if (!profile) return null;
      return { ...profile, decisionRole: classifyRole(profile), signals: profileSignals(profile) };
    },
    async searchAccounts(query, limit): Promise<AuthorMatch[]> { return (seed.searches?.[query] ?? []).slice(0, limit).map((handle) => ({ handle })); },
    async hashtagAuthors(tag, limit): Promise<AuthorMatch[]> { return (seed.hashtags?.[tag.replace(/^#/, "")] ?? []).slice(0, limit).map((handle) => ({ handle })); },
    async sendDirectMessage(handle, text, options: DmOptions) {
      const failure = seed.failSend?.(handle); if (failure) throw failure;
      sent.push({ handle, text, dryRun: options.dryRun });
      return { sent: !options.dryRun, dryRun: options.dryRun };
    },
    async close() { /* nothing to close */ },
  };
}

export const demoInstagramProfiles: InstagramProfile[] = [
  { handle: "oceandental", name: "Ocean Dental Studio", bio: "Cosmetic dentistry in Miami. Owner: Dr. Ana. Agende pelo WhatsApp.", followers: 2_340, following: 180, posts: 412, externalUrl: "https://ocean-dental.example", url: "https://www.instagram.com/oceandental/" },
  { handle: "brightsmile", name: "Bright Smile Miami", bio: "Clínica odontológica. Pedidos e orçamentos pelo direct.", followers: 980, following: 300, posts: 120, externalUrl: null, url: "https://www.instagram.com/brightsmile/" },
  { handle: "sorrisocreator", name: "Ana Sorriso", bio: "Criadora de conteúdo sobre saúde bucal e estética. Parcerias no direct.", followers: 15_400, following: 500, posts: 640, externalUrl: null, url: "https://www.instagram.com/sorrisocreator/" },
];
