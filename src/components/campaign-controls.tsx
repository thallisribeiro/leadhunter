"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getCsvHeaders, leadFields } from "@/integrations/discovery/csv";

const fieldLabels: Record<(typeof leadFields)[number], string> = { companyName: "Empresa", website: "Website", email: "Email", phone: "Telefone", city: "Cidade", country: "País", instagram: "Instagram", linkedin: "LinkedIn", sourceUrl: "URL da fonte" };
const subscribe = () => () => undefined;

export function CampaignControls({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [seedUrls, setSeedUrls] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [pendingCsv, setPendingCsv] = useState(""); const [headers, setHeaders] = useState<string[]>([]); const [mapping, setMapping] = useState<Record<string, string>>({});
  async function hunt() {
    setBusy(true); setMessage("Buscando empresas…");
    const response = await fetch(`/api/campaigns/${campaignId}/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedUrls: seedUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }) });
    const data = await response.json() as { results?: Array<{ count: number }>; error?: string };
    setMessage(response.ok ? `${data.results?.reduce((sum, item) => sum + item.count, 0) ?? 0} resultados processados.` : data.error ?? "Falha na busca."); setBusy(false); router.refresh();
  }
  async function importCsv(file: File | undefined) {
    if (!file) return; setBusy(true); setMessage("Importando CSV…");
    const csv = await file.text();
    const response = await fetch("/api/import/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId, csv }) });
    const data = await response.json() as { imported?: number; error?: string };
    if (!response.ok && data.error?.includes("Mapeie")) {
      const csvHeaders = getCsvHeaders(csv); setPendingCsv(csv); setHeaders(csvHeaders); setMapping({});
      setMessage("Mapeie pelo menos a coluna que contém o nome da empresa."); setBusy(false); return;
    }
    setMessage(response.ok ? `${data.imported ?? 0} linhas importadas.` : data.error ?? "Falha na importação."); setBusy(false); router.refresh();
  }
  async function importMapped() {
    setBusy(true); setMessage("Importando CSV com mapeamento…");
    const response = await fetch("/api/import/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId, csv: pendingCsv, mapping }) });
    const data = await response.json() as { imported?: number; error?: string };
    if (response.ok) { setHeaders([]); setPendingCsv(""); }
    setMessage(response.ok ? `${data.imported ?? 0} linhas importadas.` : data.error ?? "Falha na importação."); setBusy(false); router.refresh();
  }
  return <div className="operation-box"><div><label className="field"><span>URLs iniciais, uma por linha</span><textarea className="input textarea" value={seedUrls} onChange={(event) => setSeedUrls(event.target.value)} placeholder="https://empresa.example" /></label><button className="button button-primary" disabled={!hydrated || busy} onClick={hunt}>{busy ? "Processando…" : "Iniciar caça"}</button></div><div className="upload-zone"><strong>Importar lista CSV</strong><span>Campos reconhecidos automaticamente; se necessário, o mapeamento aparece abaixo.</span><input aria-label="Arquivo CSV" type="file" accept=".csv,text/csv" disabled={!hydrated || busy} onChange={(event) => void importCsv(event.target.files?.[0])} /></div>{headers.length > 0 && <div className="mapping-panel"><strong>Mapear colunas</strong><div className="mapping-grid">{headers.map((header) => <label className="field" key={header}><span>{header}</span><select className="input" aria-label={`Mapear ${header}`} value={mapping[header] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}><option value="">Ignorar</option>{leadFields.map((field) => <option value={field} key={field}>{fieldLabels[field]}</option>)}</select></label>)}</div><button className="button button-primary" disabled={busy || !Object.values(mapping).includes("companyName")} onClick={importMapped}>Importar CSV</button></div>}{message && <p className="operation-message" role="status">{message}</p>}</div>;
}
