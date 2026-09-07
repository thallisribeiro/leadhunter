import { describe, expect, it } from "vitest";
import { authorFromPostDescription, handlesFromHrefs } from "@/integrations/browser/instagram";

describe("authorFromPostDescription", () => {
  it("reads the author with the English or Portuguese connector", () => {
    expect(authorFromPostDescription('7 likes, 0 comments - oceandental on May 12, 2026: "..."')).toBe("oceandental");
    expect(authorFromPostDescription('7 curtidas, 0 comentários - oceandental em 12 de maio: "..."')).toBe("oceandental");
  });

  // Achado no 1º teste real com Instagram de verdade (06/09/2026): a legenda real veio como
  // "usuario no May 12, 2026" — locale mistura data em inglês com conector em português, e nem
  // "on" nem "em" batiam. A extração falhava calada em quase todo post da hashtag/busca.
  it('reads the author with the mixed-locale "no" connector seen on a real post', () => {
    const real = '7 likes, 0 comments - lsassessoriapublica no May 12, 2026: "Atenção, gestores e pregoeiros! #PNCP"';
    expect(authorFromPostDescription(real)).toBe("lsassessoriapublica");
  });

  // Achado no mesmo teste real: sem contagem de curtidas visível, o Instagram nem põe o traço
  // antes do usuário — a legenda começa direto em "usuario no DATA: ...".
  it("reads the author when there is no leading like/comment count at all", () => {
    const real = 'prof.hugobernini no May 21, 2026: "Atualização importante no PNCP 🚨\n\n#pncp #lei14133"';
    expect(authorFromPostDescription(real)).toBe("prof.hugobernini");
  });

  it("does not false-positive on \"no\" appearing mid-caption when there is no leading count", () => {
    expect(authorFromPostDescription("Isso não é uma legenda de post no formato esperado")).toBeNull();
  });

  it("returns null without a recognizable connector", () => {
    expect(authorFromPostDescription("nada reconhecível aqui")).toBeNull();
    expect(authorFromPostDescription(null)).toBeNull();
  });
});

describe("handlesFromHrefs", () => {
  // Achado no mesmo teste: "/popular/" é a aba de resultados populares da própria busca do
  // Instagram, não uma conta — virava lead fantasma (bio vazia, 0 seguidores).
  it("excludes Instagram's own UI paths, including /popular/", () => {
    expect(handlesFromHrefs(["/popular/", "/reels/", "/explore/", "/licitacertabr/"])).toEqual(["licitacertabr"]);
  });

  it("dedupes and lowercases real handles", () => {
    expect(handlesFromHrefs(["/OceanDental/", "/oceandental/", "/brightsmile/"])).toEqual(["oceandental", "brightsmile"]);
  });
});
