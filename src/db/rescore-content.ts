// Aplica as palavras-chave do nicho ao perfil já salvo e repontua a biblioteca inteira.
// Uso: pnpm content:rescore [--keywords "licitação,pregão,PNCP"]
//
// Existe porque a nota de aderência depende do vocabulário do negócio: o perfil salvo em 05/09
// estava com "palavras-chave" vazio, e a biblioteca acabou aceitando unboxing e motivacional.
import path from "node:path";
import { applySchema, createDatabase } from "@/db/client";
import { getBusinessProfile, saveBusinessProfile } from "@/features/business/actions";
import { profileKeywords, rescoreLibrary } from "@/features/content/service";

const configured = process.env.DATABASE_URL ?? "file:./data/leadhunter.db";
const database = createDatabase(path.resolve(process.cwd(), configured.slice(5)));
applySchema(database.sqlite);
const db = database.db;

const argumento = process.argv.indexOf("--keywords");
if (argumento >= 0) {
  const novas = String(process.argv[argumento + 1] ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const perfil = getBusinessProfile(db);
  if (!perfil) { console.error("sem perfil de negócio salvo — abra /settings/business antes"); process.exit(1); }
  const juntas = [...new Set([...(perfil.targetKeywords ?? []), ...novas])];
  saveBusinessProfile(db, { ...perfil, targetKeywords: juntas });
  console.log(`palavras-chave do ICP: ${juntas.length} (${novas.length} nova(s))`);
}

const termos = profileKeywords(db);
const total = rescoreLibrary(db);
const stats = database.sqlite.prepare("SELECT count(*) n, sum(CASE WHEN fit > 0 THEN 1 ELSE 0 END) tema FROM content_pieces").get() as { n: number; tema: number };
console.log(`vocabulário do tema: ${termos.length} termo(s)`);
console.log(`${total} peça(s) repontuada(s): ${stats.tema ?? 0} do tema, ${stats.n - (stats.tema ?? 0)} fora.`);
database.close();
