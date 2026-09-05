import { describe, expect, it } from "vitest";
import { classifyRole, parseCount, parseProfileMeta, profileSignals } from "@/integrations/browser/parse";

describe("instagram profile parsing", () => {
  it("parses counts with separators and suffixes in both languages", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("1.234")).toBe(1234);
    expect(parseCount("12.5K")).toBe(12_500);
    expect(parseCount("1,2 mil")).toBe(1200);
    expect(parseCount("3M")).toBe(3_000_000);
    expect(parseCount("abc")).toBeNull();
  });

  it("reads an English profile from og tags", () => {
    const profile = parseProfileMeta({
      url: "https://www.instagram.com/oceandental/",
      ogTitle: "Ocean Dental Studio (@oceandental) • Instagram photos and videos",
      ogDescription: "2,340 Followers, 180 Following, 412 Posts - See Instagram photos and videos from Ocean Dental Studio (@oceandental)",
      description: "2,340 Followers, 180 Following, 412 Posts - Ocean Dental Studio (@oceandental) on Instagram: \"Cosmetic dentistry in Miami. Owner: Dr. Ana. Book on WhatsApp.\"",
      externalUrl: "https://oceandental.example",
    });
    expect(profile).toMatchObject({ handle: "oceandental", name: "Ocean Dental Studio", followers: 2340, following: 180, posts: 412, externalUrl: "https://oceandental.example" });
    expect(profile?.bio).toContain("Cosmetic dentistry");
    expect(classifyRole(profile!)).toBe("owner");
    expect(profileSignals(profile!)).toEqual(expect.arrayContaining(["site no perfil", "WhatsApp na bio", "audiência acima de 1 mil"]));
  });

  it("reads a Portuguese profile and classifies a store account", () => {
    const profile = parseProfileMeta({
      url: "https://www.instagram.com/ferragensdobairro/",
      ogTitle: "Ferragens do Bairro (@ferragensdobairro) • Fotos e vídeos do Instagram",
      ogDescription: "1,2 mil seguidores, 300 seguindo, 88 publicações - Veja fotos e vídeos do Instagram de Ferragens do Bairro (@ferragensdobairro)",
      description: "1,2 mil seguidores, 300 seguindo, 88 publicações - Ferragens do Bairro (@ferragensdobairro) no Instagram: \"Loja de ferragens e material elétrico. Pedidos pelo direct.\"",
    });
    expect(profile).toMatchObject({ handle: "ferragensdobairro", followers: 1200, following: 300, posts: 88, externalUrl: null });
    expect(classifyRole(profile!)).toBe("store");
    expect(profileSignals(profile!)).toContain("vende pelo Instagram");
  });

  it("falls back to the URL handle and returns null without any handle", () => {
    expect(parseProfileMeta({ url: "https://www.instagram.com/someone.here/" })?.handle).toBe("someone.here");
    expect(parseProfileMeta({ url: "https://www.instagram.com/" })).toBeNull();
    expect(classifyRole({ name: "x", bio: "" })).toBe("unknown");
    expect(classifyRole({ name: "Maria", bio: "vendedora na loja" })).toBe("employee");
  });
});
