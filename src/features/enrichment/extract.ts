import * as cheerio from "cheerio";

export interface ExtractedBusinessData {
  companyName: string | null;
  description: string | null;
  text: string;
  emails: string[];
  phones: string[];
  socials: Partial<Record<"instagram" | "linkedin" | "facebook" | "whatsapp", string>>;
  signals: string[];
  internalLinks: string[];
}

function unique(values: Array<string | undefined>): string[] { return [...new Set(values.filter((value): value is string => Boolean(value)))]; }

export function extractBusinessData(html: string, sourceUrl: string): ExtractedBusinessData {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, img, video, audio").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 40_000);
  const companyName = $("meta[property='og:site_name']").attr("content")?.trim() || $("title").text().split(/[|–—-]/)[0]?.trim() || $("h1").first().text().trim() || null;
  const description = $("meta[name='description']").attr("content")?.trim() || $("main p").first().text().trim() || null;
  const emails = unique($("a[href^='mailto:']").map((_, element) => $(element).attr("href")?.slice(7).split("?")[0]?.trim().toLowerCase()).get().concat(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map((email) => email.toLowerCase()) ?? []));
  const phones = unique($("a[href^='tel:']").map((_, element) => $(element).attr("href")?.slice(4).trim()).get());
  const socials: ExtractedBusinessData["socials"] = {};
  const internalLinks: string[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href"); if (!href) return;
    let url: URL; try { url = new URL(href, sourceUrl); } catch { return; }
    const host = url.hostname.toLowerCase();
    if (host.endsWith("instagram.com") && !socials.instagram) socials.instagram = url.href;
    if (host.endsWith("linkedin.com") && !socials.linkedin) socials.linkedin = url.href;
    if (host.endsWith("facebook.com") && !socials.facebook) socials.facebook = url.href;
    if ((host === "wa.me" || host.endsWith("whatsapp.com")) && !socials.whatsapp) socials.whatsapp = url.href;
    if (url.origin === new URL(sourceUrl).origin && /\/(contact|contato|about|sobre)(\/|$)/i.test(url.pathname)) internalLinks.push(url.href.replace(/\/$/, ""));
  });
  const lower = `${description ?? ""} ${text}`.toLocaleLowerCase("pt-BR");
  const signals = unique([
    /odontologia est[eé]tica|cosmetic dentistry/.test(lower) ? "odontologia estética" : undefined,
    /implantes?|implants?/.test(lower) ? "implantes" : undefined,
    /agendamento online|book online|schedule online/.test(lower) ? "agendamento online" : undefined,
    /agendamento por telefone|call to schedule/.test(lower) ? "agendamento por telefone" : undefined,
  ]);
  return { companyName, description, text, emails, phones, socials, signals, internalLinks: unique(internalLinks).slice(0, 4) };
}
