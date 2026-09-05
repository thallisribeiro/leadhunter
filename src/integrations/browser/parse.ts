// Pure parsing of public Instagram profile metadata. Instagram's DOM changes often; the Open Graph
// and description meta tags have been stable for years and carry everything the ICP scoring needs.
export interface InstagramProfile {
  handle: string;
  name: string;
  bio: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  externalUrl: string | null;
  url: string;
}

export interface ProfileMetaInput { url: string; ogTitle?: string | null; ogDescription?: string | null; description?: string | null; externalUrl?: string | null }

// "1,234" · "1.234" · "12.5K" · "1,2 mil" · "3M" → number
export function parseCount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const match = /^([\d.,]+)\s*(k|m|mil|mi|milh[õo]es)?$/.exec(text);
  if (!match) return null;
  let number = match[1]!;
  const suffix = match[2];
  if (suffix) number = number.replace(",", ".");
  else number = number.replace(/[.,]/g, "");
  const value = Number(number);
  if (!Number.isFinite(value)) return null;
  const factor = suffix === "k" || suffix === "mil" ? 1_000 : suffix === "m" || suffix === "mi" || suffix?.startsWith("milh") ? 1_000_000 : 1;
  return Math.round(value * factor);
}

const HANDLE_RE = /\(@([a-z0-9._]{1,30})\)/i;
const COUNTS_RE = /([\d.,]+\s*(?:k|m|mil|mi)?)\s*(?:followers|seguidores)[,\s]+([\d.,]+\s*(?:k|m|mil|mi)?)\s*(?:following|seguindo)[,\s]+([\d.,]+\s*(?:k|m|mil|mi)?)\s*(?:posts|publica[çc][õo]es)/i;

export function parseProfileMeta(input: ProfileMetaInput): InstagramProfile | null {
  const title = input.ogTitle ?? "";
  const ogDescription = input.ogDescription ?? "";
  const description = input.description ?? "";
  const handle = (HANDLE_RE.exec(title) ?? HANDLE_RE.exec(ogDescription) ?? HANDLE_RE.exec(description))?.[1]?.toLowerCase()
    ?? /instagram\.com\/([a-z0-9._]{1,30})/i.exec(input.url)?.[1]?.toLowerCase();
  if (!handle) return null;
  const name = (/^(.*?)\s*\(@/.exec(title)?.[1] ?? /from\s+(.+?)\s*\(@|de\s+(.+?)\s*\(@/i.exec(ogDescription)?.slice(1).find(Boolean) ?? handle).trim();
  const counts = COUNTS_RE.exec(ogDescription) ?? COUNTS_RE.exec(description);
  const bio = (/(?:on|no)\s+Instagram:\s*["“](.*)["”]\s*$/is.exec(description)?.[1] ?? "").trim();
  return {
    handle, name: name || handle, bio,
    followers: counts ? parseCount(counts[1]) : null, following: counts ? parseCount(counts[2]) : null, posts: counts ? parseCount(counts[3]) : null,
    externalUrl: input.externalUrl?.trim() || null, url: `https://www.instagram.com/${handle}/`,
  };
}

export type DecisionRole = "owner" | "store" | "employee" | "unknown";

// Who is behind the profile: the person who decides, a store account, or someone who forwards.
export function classifyRole(profile: Pick<InstagramProfile, "name" | "bio">): DecisionRole {
  const text = `${profile.name} ${profile.bio}`.toLowerCase();
  if (/\b(ceo|founder|fundador[a]?|dono|dona|propriet[aá]ri[oa]|diretor[a]?|s[oó]ci[oa]|owner)\b/.test(text)) return "owner";
  if (/\b(vendedor[a]?|colaborador[a]?|funcion[aá]ri[oa]|equipe|team member|atendente)\b/.test(text)) return "employee";
  if (/\b(loja|store|oficial|official|atacado|varejo|delivery|pedidos|encomendas|ateli[eê]|studio|est[uú]dio|cl[ií]nica|sal[aã]o)\b/.test(text)) return "store";
  return "unknown";
}

export function profileSignals(profile: InstagramProfile): string[] {
  const signals: string[] = [];
  if (profile.externalUrl) signals.push("site no perfil");
  if (/whatsapp|wa\.me|zap/i.test(profile.bio)) signals.push("WhatsApp na bio");
  if (/\b(pedidos|encomendas|delivery|entrega|or[çc]amento)\b/i.test(profile.bio)) signals.push("vende pelo Instagram");
  if ((profile.followers ?? 0) >= 1_000) signals.push("audiência acima de 1 mil");
  return signals;
}
