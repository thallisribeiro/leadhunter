import { db } from "@/db/client";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const labels: Record<string,string> = { pending:"Pendente", running:"Executando", completed:"Concluído", failed:"Falhou", retry_scheduled:"Nova tentativa", dead:"Interrompido" };

export default function JobsPage() {
  const jobs = db.$client.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100").all() as Array<{ id:string; type:string; status:string; attempts:number; max_attempts:number; error:string|null; updated_at:string }>;
  return <><PageHeader eyebrow="Operação" title="Jobs" description="Trabalho persistente, tentativas e erros recuperáveis do pipeline." />{!jobs.length ? <EmptyState title="Nenhum job na fila" description="As operações de campanha aparecerão aqui e sobreviverão a reinícios." /> : <div className="campaign-grid">{jobs.map((job) => <div className="campaign-row" key={job.id}><div><strong>{job.type}</strong><small>{job.id}</small></div><Badge tone={job.status === "completed" ? "success" : job.error ? "warning" : "neutral"}>{labels[job.status] ?? job.status}</Badge><span>{job.attempts}/{job.max_attempts} tentativas</span><span>{job.error ?? new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(job.updated_at))}</span></div>)}</div>}</>;
}
