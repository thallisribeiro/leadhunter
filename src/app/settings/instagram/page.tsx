import Link from "next/link";
import { db } from "@/db/client";
import { outboundStats } from "@/features/conversations/service";
import { dailyCap, localDay, pacingConfigFromEnv } from "@/features/instagram/pacing";
import { getSetting, isPaused, listExceptions } from "@/features/ops/guard";
import { pauseAllAction, resumeAllAction, runAutopilotNowAction, saveInstagramSettingsAction } from "@/app/instagram-actions";
import { Badge, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

async function chromeStatus(cdpUrl: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(`${cdpUrl.replace(/\/$/, "")}/json/version`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
    const data = await response.json() as { Browser?: string };
    return { ok: true, detail: data.Browser ?? "conectado" };
  } catch { return { ok: false, detail: "sem resposta na porta de debug" }; }
}

export default async function InstagramSettingsPage() {
  const env = process.env;
  const paused = isPaused(db);
  const config = pacingConfigFromEnv(env, outboundStats(db, "1970-01-01T00:00:00Z").firstSentAt);
  const now = new Date();
  const stats = outboundStats(db, new Date(`${localDay(now, config.timezone)}T00:00:00.000Z`).toISOString());
  const chrome = await chromeStatus(env.CHROME_CDP_URL ?? "http://127.0.0.1:9222");
  const dmEnabled = env.INSTAGRAM_DM_ENABLED === "true"; const autopilot = env.AUTOPILOT_ENABLED === "true";
  const api = Boolean(env.INSTAGRAM_PAGE_ACCESS_TOKEN && env.INSTAGRAM_APP_SECRET && env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);
  const exceptions = listExceptions(db).length;
  const row = (label: string, value: React.ReactNode) => <div className="contact-row"><span>{label}</span><strong>{value}</strong></div>;
  return <><PageHeader eyebrow="Instagram" title="Operação do SDR" description="Primeiro contato pelo seu Chrome (perfil dedicado, porta de debug em 127.0.0.1); continuação pela API oficial da Meta. Tudo respeita a pausa geral." actions={paused.paused ? <form action={resumeAllAction}><button className="button button-primary" type="submit">Retomar operação</button></form> : <form action={pauseAllAction}><input type="hidden" name="reason" value="Pausa manual pelo operador" /><button className="button" type="submit">Pausar tudo</button></form>} />
    {paused.paused && <p className="banner-warning" role="status">Pausado desde {paused.since ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(paused.since)) : "—"}: {paused.reason}</p>}
    <section className="ops-grid">
      <article className="detail-section"><h2>Estado</h2>
        {row("Chrome (CDP)", <Badge tone={chrome.ok ? "success" : "warning"}>{chrome.ok ? chrome.detail : `indisponível · ${chrome.detail}`}</Badge>)}
        {row("Envio real de DM", <Badge tone={dmEnabled ? "success" : "neutral"}>{dmEnabled ? "ligado" : "dry-run"}</Badge>)}
        {row("Autopilot", <Badge tone={autopilot ? "success" : "neutral"}>{autopilot ? "ligado" : "desligado"}</Badge>)}
        {row("API oficial (webhook)", <Badge tone={api ? "success" : "neutral"}>{api ? "configurada" : "sem credenciais"}</Badge>)}
        {row("Exceções abertas", <Link href="/conversas">{exceptions}</Link>)}
      </article>
      <article className="detail-section"><h2>Ritmo de hoje</h2>
        {row("DMs enviadas hoje", `${stats.sentToday} / ${dailyCap(now, config)}`)}
        {row("Teto configurado", `${config.maxPerDay}/dia`)}
        {row("Intervalo", `${config.minSecondsBetween}–${config.maxSecondsBetween}s`)}
        {row("Janela", `${config.operatingHours} (${config.timezone})`)}
        {row("Aquecimento desde", config.warmupStartedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(config.warmupStartedAt)) : "ainda não enviou")}
        {row("Último envio", stats.lastSentAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(stats.lastSentAt)) : "—")}
      </article>
    </section>
    <section className="detail-section"><h2>Como ligar</h2>
      <ol className="steps">
        <li>Suba o Chrome com perfil dedicado e <code>--remote-debugging-port=9222</code> (ver SETUP.md). Faça login no Instagram uma vez, na mão.</li>
        <li>Mantenha <code>INSTAGRAM_DM_ENABLED=false</code> e rode uma campanha: as DMs ficam gravadas como dry-run em Conversas.</li>
        <li>Revise os textos. Só então <code>INSTAGRAM_DM_ENABLED=true</code> e um piloto de 5 DMs (aquecimento automático).</li>
        <li>Configure o app da Meta (webhook em <code>/api/webhooks/instagram</code>) para a conversa continuar pela API.</li>
        <li><code>AUTOPILOT_ENABLED=true</code> para o ciclo observar → decidir → agir rodar sozinho a cada 5 minutos.</li>
      </ol>
      <form action={runAutopilotNowAction}><button className="button" type="submit">Rodar um tick do autopilot agora</button></form>
    </section>
    <section className="detail-section"><h2>Notas do operador</h2>
      <form action={saveInstagramSettingsAction} className="stack"><Textarea name="notes" rows={3} defaultValue={getSetting(db, "instagram_notes") ?? ""} placeholder="Ex.: conta aquecendo desde 08/09; evitar hashtags X" /><button className="button" type="submit">Salvar notas</button></form>
    </section></>;
}
