import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { contentAccounts, contentPieces } from "@/db/schema";
import { getBusinessProfile } from "@/features/business/actions";

// Biblioteca de conteúdo (07/09/2026). O agente já lê o nicho para prospectar; a mesma leitura serve
// para saber O QUE publicar. Aqui entram as contas de referência e as peças que performaram nelas,
// com transcrição, gancho e uma nota de aderência ao nosso negócio — para modelar o próximo conteúdo
// em cima do que já provou alcance, em vez de chutar pauta.

export interface ContentAccountInput {
  handle: string; platform?: string; name?: string | null; bio?: string | null;
  followers?: number | null; posts?: number | null; role?: string; notes?: string | null;
  medianViews?: number | null; lastMappedAt?: string | null;
}

export interface ContentPieceInput {
  handle: string; externalId: string; url: string; platform?: string; kind?: string;
  postedAt?: string | null; views?: number | null; likes?: number | null; comments?: number | null;
  durationSeconds?: number | null; caption?: string | null; transcript?: string | null; mediaPath?: string | null;
}

const normalizeHandle = (handle: string) => handle.trim().replace(/^@/, "").toLowerCase();
// A pesquisa vem de scripts que leem o DOM: um campo pode chegar como array (bio em várias linhas) ou
// número. Sem isto o driver recebe um array e devolve "Too many parameter values were provided".
const texto = (valor: unknown): string | null => {
  if (valor == null) return null;
  const s = Array.isArray(valor) ? valor.filter(Boolean).join(" · ") : String(valor);
  return s.trim() ? s.trim() : null;
};
const inteiro = (valor: unknown): number | null => {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function upsertContentAccount(database: AppDatabase, input: ContentAccountInput) {
  const platform = input.platform ?? "instagram";
  const handle = normalizeHandle(input.handle);
  const now = new Date().toISOString();
  const campos = {
    name: texto(input.name), bio: texto(input.bio), followers: inteiro(input.followers), posts: inteiro(input.posts),
    role: texto(input.role), notes: texto(input.notes), medianViews: inteiro(input.medianViews), lastMappedAt: texto(input.lastMappedAt),
  };
  const existing = database.$client.prepare("SELECT * FROM content_accounts WHERE platform = ? AND handle = ?").get(platform, handle) as { id: string } | undefined;
  if (existing) {
    database.$client.prepare(`UPDATE content_accounts SET name = COALESCE(?, name), bio = COALESCE(?, bio), followers = COALESCE(?, followers),
      posts = COALESCE(?, posts), role = COALESCE(?, role), notes = COALESCE(?, notes), median_views = COALESCE(?, median_views),
      last_mapped_at = COALESCE(?, last_mapped_at), updated_at = ? WHERE id = ?`)
      .run(campos.name, campos.bio, campos.followers, campos.posts, campos.role, campos.notes, campos.medianViews, campos.lastMappedAt, now, existing.id);
    return { id: existing.id, handle, created: false };
  }
  const id = randomUUID();
  database.insert(contentAccounts).values({
    id, platform, handle, ...campos, role: campos.role ?? "referencia", createdAt: now, updatedAt: now,
  }).run();
  return { id, handle, created: true };
}

// O gancho é o que decide o Reel: primeira frase falada (transcrição) ou primeira linha da legenda.
// Corta em 140 para caber na tabela sem virar parágrafo.
export function extractHook(transcript?: string | null, caption?: string | null): string | null {
  const fala = String(transcript ?? "").replace(/\s+/g, " ").trim();
  if (fala) {
    const primeira = fala.split(/(?<=[.!?])\s/).find((frase) => frase.trim().length > 12) ?? fala;
    return primeira.trim().slice(0, 140);
  }
  const legenda = String(caption ?? "").replace(/\s+/g, " ").trim();
  return legenda ? legenda.slice(0, 140) : null;
}

// Aderência (0-100) ao NOSSO negócio, determinística: quantas palavras do perfil (nicho, jargão,
// oferta, sinais) aparecem no texto da peça. Sem IA — a nota tem que ser a mesma toda vez, e o
// motivo tem que ser legível ("bateu: licitação, pregão, cnpj").
export function scoreFit(text: string, keywords: string[]): { fit: number; reason: string | null } {
  // @menção não é tema: "Siga @pedraodalicitacao" casava com "licitação" e entrava como conteúdo do
  // nicho sem dizer nada. Hashtag fica (#licitacao é tema de verdade).
  const alvo = semAcento(String(text).replace(/@[\w.]+/g, " "));
  const limpas = [...new Set(keywords.map(semAcento).filter((k) => k.length >= 4 && !GENERICAS.has(k)))];
  if (!limpas.length || !alvo.trim()) return { fit: 0, reason: null };
  const bateram = limpas.filter((k) => alvo.includes(k));
  if (!bateram.length) return { fit: 0, reason: null };
  // Satura em 6 termos: bater 12 palavras não é o dobro de relevante de bater 6.
  const fit = Math.min(100, Math.round((Math.min(bateram.length, 6) / 6) * 100));
  return { fit, reason: `bateu: ${bateram.slice(0, 6).join(", ")}` };
}

// Palavra genérica não diz nada sobre tema: "valor" e "serviços" saem da descrição do negócio e
// casavam com qualquer Reel de empreendedorismo (07/09/2026 — a biblioteca encheu de motivacional).
const GENERICAS = new Set([
  "valor", "valores", "servico", "servicos", "produto", "produtos", "cliente", "clientes", "empresa", "empresas",
  "negocio", "negocios", "mercado", "vendas", "venda", "vender", "dinheiro", "faturamento", "lucro", "renda",
  "assinatura", "plano", "preco", "precos", "mes", "mensal", "gratis", "teste", "acesso", "sistema", "plataforma",
  "whatsapp", "email", "site", "link", "conteudo", "pessoa", "pessoas", "tempo", "ramo", "geral", "outros", "comercio",
]);

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Só campos que descrevem TEMA (segmentos, palavras-chave, sinais, jargão, tópicos de afiliado).
// Descrição e oferta ficam de fora de propósito: são prosa, e prosa vira ruído no casamento.
export function profileKeywords(database: AppDatabase): string[] {
  const profile = getBusinessProfile(database);
  if (!profile) return [];
  const partes = [
    ...(profile.targetIndustries ?? []), ...(profile.targetKeywords ?? []),
    ...(profile.positiveSignals ?? []), ...(profile.affiliateTopics ?? []), profile.marketJargon ?? "",
  ];
  const termos = partes.flatMap((parte) => String(parte).split(/[,;/|]|\s{2,}|\n/)).map((p) => p.trim()).filter(Boolean);
  return [...new Set(termos.filter((t) => t.length >= 4 && !GENERICAS.has(semAcento(t))))].slice(0, 60);
}

export function upsertContentPiece(database: AppDatabase, input: ContentPieceInput, keywords?: string[]) {
  const platform = input.platform ?? "instagram";
  const conta = upsertContentAccount(database, { handle: input.handle, platform });
  const now = new Date().toISOString();
  const termos = keywords ?? profileKeywords(database);
  const caption = texto(input.caption); const transcript = texto(input.transcript);
  const views = inteiro(input.views); const likes = inteiro(input.likes); const comments = inteiro(input.comments);
  const durationSeconds = inteiro(input.durationSeconds);
  const hook = extractHook(transcript, caption);
  const { fit, reason } = scoreFit(`${caption ?? ""} ${transcript ?? ""}`, termos);
  // Performance = views da peça sobre a mediana da conta. É o que separa "bombou" de "a conta é grande".
  const mediana = (database.$client.prepare("SELECT median_views AS m FROM content_accounts WHERE id = ?").get(conta.id) as { m: number | null } | undefined)?.m ?? null;
  const performance = views && mediana ? Number((views / mediana).toFixed(2)) : null;
  const existing = database.$client.prepare("SELECT id FROM content_pieces WHERE platform = ? AND external_id = ?").get(platform, input.externalId) as { id: string } | undefined;
  if (existing) {
    database.$client.prepare(`UPDATE content_pieces SET url = ?, kind = ?, posted_at = COALESCE(?, posted_at), views = COALESCE(?, views),
      likes = COALESCE(?, likes), comments = COALESCE(?, comments), duration_seconds = COALESCE(?, duration_seconds),
      caption = COALESCE(?, caption), transcript = COALESCE(?, transcript), hook = COALESCE(?, hook), fit = ?, fit_reason = ?,
      performance = COALESCE(?, performance), media_path = COALESCE(?, media_path), updated_at = ? WHERE id = ?`)
      .run(input.url, texto(input.kind) ?? "reel", texto(input.postedAt), views, likes, comments,
        durationSeconds, caption, transcript, hook, fit, reason, performance, texto(input.mediaPath), now, existing.id);
    return { id: existing.id, created: false, fit };
  }
  const id = randomUUID();
  database.insert(contentPieces).values({
    id, accountId: conta.id, platform, externalId: input.externalId, url: input.url, kind: texto(input.kind) ?? "reel",
    postedAt: texto(input.postedAt), views, likes, comments, durationSeconds, caption, transcript,
    hook, fit, fitReason: reason, performance, starred: 0, mediaPath: texto(input.mediaPath), createdAt: now, updatedAt: now,
  }).run();
  return { id, created: true, fit };
}

export function setStarred(database: AppDatabase, id: string, starred: boolean) {
  database.$client.prepare("UPDATE content_pieces SET starred = ?, updated_at = ? WHERE id = ?").run(starred ? 1 : 0, new Date().toISOString(), id);
}

// Depois de mudar o perfil do negócio, a nota de aderência de tudo que está guardado muda junto.
export function rescoreLibrary(database: AppDatabase) {
  const termos = profileKeywords(database);
  const rows = database.$client.prepare("SELECT id, caption, transcript FROM content_pieces").all() as Array<{ id: string; caption: string | null; transcript: string | null }>;
  const now = new Date().toISOString();
  const update = database.$client.prepare("UPDATE content_pieces SET fit = ?, fit_reason = ?, updated_at = ? WHERE id = ?");
  for (const row of rows) {
    const { fit, reason } = scoreFit(`${row.caption ?? ""} ${row.transcript ?? ""}`, termos);
    update.run(fit, reason, now, row.id);
  }
  return rows.length;
}

export function setAccountMedian(database: AppDatabase, handle: string, medianViews: number, platform = "instagram") {
  upsertContentAccount(database, { handle, platform, medianViews });
  const conta = database.select().from(contentAccounts).where(eq(contentAccounts.handle, normalizeHandle(handle))).get();
  if (!conta) return;
  // Recalcula a performance das peças dessa conta com a mediana nova.
  database.$client.prepare("UPDATE content_pieces SET performance = ROUND(CAST(views AS REAL) / ?, 2), updated_at = ? WHERE account_id = ? AND views IS NOT NULL")
    .run(medianViews || 1, new Date().toISOString(), conta.id);
}
