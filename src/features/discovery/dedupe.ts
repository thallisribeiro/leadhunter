import type { DiscoveredLead } from "@/features/discovery/types";

function plain(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLocaleLowerCase("en-US").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeUrl(value: string | undefined): { canonicalUrl: string | null; domain: string | null } {
  if (!value?.trim()) return { canonicalUrl: null, domain: null };
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const canonicalUrl = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname === "/" ? "" : url.pathname}`;
    return { canonicalUrl, domain: url.hostname };
  } catch {
    return { canonicalUrl: null, domain: null };
  }
}

export function normalizeLeadIdentity(lead: Pick<DiscoveredLead, "companyName" | "website" | "email" | "phone" | "city" | "country">) {
  const { canonicalUrl, domain } = normalizeUrl(lead.website);
  const email = lead.email?.trim().toLocaleLowerCase("en-US") || null;
  const phone = lead.phone?.replace(/\D/g, "") || null;
  return {
    normalizedName: plain(lead.companyName) ?? "unknown",
    normalizedDomain: domain,
    normalizedEmail: email,
    normalizedPhone: phone,
    canonicalUrl,
    locationKey: [plain(lead.city), plain(lead.country)].filter(Boolean).join("|"),
  };
}
