// WhatsApp hand-off through a file queue consumed by an external listener (one JSON per message).
// Format matches the operator's existing listener: { numero, mensagem, imediato, naoAntesDe, origem }.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface WhatsappJob { numero: string; mensagem: string; naoAntesDe?: string; origem?: string; leadId?: string }

export function enqueueWhatsapp(dir: string | undefined, job: WhatsappJob): { path: string } | null {
  if (!dir) return null;
  const numero = job.numero.replace(/\D/g, "");
  if (numero.length < 10) throw new Error("Número de WhatsApp inválido.");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pendente-leadhunter-${job.leadId ?? crypto.randomUUID()}.json`);
  writeFileSync(file, JSON.stringify({ numero, mensagem: job.mensagem, imediato: false, naoAntesDe: job.naoAntesDe ?? new Date().toISOString(), origem: job.origem ?? "leadhunter", criado_em: new Date().toISOString() }, null, 2));
  return { path: file };
}
