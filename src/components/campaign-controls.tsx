"use client";

import { useState } from "react";

export function CampaignControls({ campaignId }: { campaignId: string }) {
  const [seedUrls, setSeedUrls] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function hunt() {
    setBusy(true); setMessage("Buscando empresas…");
    const response = await fetch(`/api/campaigns/${campaignId}/discover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedUrls: seedUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }) });
    const data = await response.json() as { results?: Array<{ count: number }>; error?: string };
    setMessage(response.ok ? `${data.results?.reduce((sum, item) => sum + item.count, 0) ?? 0} resultados processados.` : data.error ?? "Falha na busca."); setBusy(false); window.location.reload();
  }
  async function importCsv(file: File | undefined) {
    if (!file) return; setBusy(true); setMessage("Importando CSV…");
    const response = await fetch("/api/import/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId, csv: await file.text() }) });
    const data = await response.json() as { imported?: number; error?: string };
    setMessage(response.ok ? `${data.imported ?? 0} linhas importadas.` : data.error ?? "Falha na importação."); setBusy(false); window.location.reload();
  }
  return <div className="operation-box"><div><label className="field"><span>URLs iniciais, uma por linha</span><textarea className="input textarea" value={seedUrls} onChange={(event) => setSeedUrls(event.target.value)} placeholder="https://empresa.example" /></label><button className="button button-primary" disabled={busy} onClick={hunt}>{busy ? "Processando…" : "Iniciar caça"}</button></div><div className="upload-zone"><strong>Importar lista CSV</strong><span>Campos reconhecidos automaticamente ou pela API de mapeamento.</span><input aria-label="Arquivo CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void importCsv(event.target.files?.[0])} /></div>{message && <p className="operation-message" role="status">{message}</p>}</div>;
}
