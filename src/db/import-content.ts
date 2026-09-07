// Importa a pesquisa de conteúdo (scripts/insta) para a biblioteca: pnpm content:import <pasta>
//
// Lê o que os scripts deixam na pasta de pesquisa e não inventa nada:
//   reels-<handle>.json                     alcance por Reel + os top abertos (curtidas, data, legenda)
//   reels-mp4/<handle>/transcricoes.json    transcrição local (faster-whisper) casada pela URL
//   insta-<handle>.json                     posts do grid (carrossel/foto), quando existir
// Rodar de novo é seguro: cada peça é única por URL externa e só recebe campo novo.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { applySchema, createDatabase } from "@/db/client";
import { profileKeywords, setAccountMedian, upsertContentAccount, upsertContentPiece } from "@/features/content/service";

const pasta = process.argv[2];
if (!pasta) { console.error("uso: pnpm content:import <pasta com reels-*.json>"); process.exit(1); }
if (!existsSync(pasta)) { console.error(`pasta não encontrada: ${pasta}`); process.exit(1); }

const configured = process.env.DATABASE_URL ?? "file:./data/leadhunter.db";
const database = createDatabase(path.resolve(process.cwd(), configured.slice(5)));
applySchema(database.sqlite);
const db = database.db;
const termos = profileKeywords(db);

const ler = <T>(arquivo: string, padrao: T): T => { try { return JSON.parse(readFileSync(arquivo, "utf8")) as T; } catch { return padrao; } };
const idDaUrl = (url: string) => url.match(/\/(?:reel|p)\/([^/?]+)/)?.[1] ?? url;
const mediana = (valores: number[]) => (valores.length ? [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)] : null);

interface ReelTop { url: string; views?: number; curtidas?: number | null; comentarios?: number | null; data?: string | null; legenda?: string | null }
interface ArquivoReels { handle: string; coletadoEm?: string; reels?: Array<{ href: string; views: number }>; top?: ReelTop[] }
interface Transcricao { url: string; duracao_s?: number; transcricao?: string }
interface PostGrid { url: string; tipo?: string; curtidas?: number | null; comentarios?: number | null; data?: string | null; legenda?: string | null }
interface ArquivoPosts { handle: string; perfil?: { og?: string; bio?: string }; posts?: PostGrid[] }

let contas = 0; let pecas = 0; let comTranscricao = 0;

for (const arquivo of readdirSync(pasta).filter((f) => /^reels-.+\.json$/.test(f))) {
  const dados = ler<ArquivoReels>(path.join(pasta, arquivo), { handle: "" });
  if (!dados.handle) continue;
  const transcricoes = ler<Transcricao[]>(path.join(pasta, "reels-mp4", dados.handle, "transcricoes.json"), []);
  const porUrl = new Map(transcricoes.map((t) => [idDaUrl(t.url), t]));
  upsertContentAccount(db, { handle: dados.handle, lastMappedAt: dados.coletadoEm ?? new Date().toISOString() });
  contas++;
  const m = mediana((dados.reels ?? []).map((r) => r.views).filter((v) => Number.isFinite(v)));
  if (m) setAccountMedian(db, dados.handle, m);
  for (const item of dados.top ?? []) {
    const externalId = idDaUrl(item.url);
    const t = porUrl.get(externalId);
    upsertContentPiece(db, {
      handle: dados.handle, externalId, url: item.url, kind: "reel", views: item.views ?? null,
      likes: item.curtidas ?? null, comments: item.comentarios ?? null, postedAt: item.data ?? null,
      caption: item.legenda ?? null, transcript: t?.transcricao ?? null, durationSeconds: t?.duracao_s ?? null,
      mediaPath: t ? path.join(pasta, "reels-mp4", dados.handle) : null,
    }, termos);
    pecas++;
    if (t?.transcricao) comTranscricao++;
  }
}

for (const arquivo of readdirSync(pasta).filter((f) => /^insta-.+\.json$/.test(f))) {
  const dados = ler<ArquivoPosts>(path.join(pasta, arquivo), { handle: "" });
  if (!dados.handle) continue;
  upsertContentAccount(db, { handle: dados.handle, bio: dados.perfil?.bio ?? null, lastMappedAt: new Date().toISOString() });
  for (const post of dados.posts ?? []) {
    upsertContentPiece(db, {
      handle: dados.handle, externalId: idDaUrl(post.url), url: post.url, kind: post.tipo ?? "post",
      likes: post.curtidas ?? null, comments: post.comentarios ?? null, postedAt: post.data ?? null, caption: post.legenda ?? null,
    }, termos);
    pecas++;
  }
}

console.log(`${contas} conta(s), ${pecas} peça(s) na biblioteca, ${comTranscricao} com transcrição.`);
database.close();
