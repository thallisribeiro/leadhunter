import { db } from "@/db/client";
import { exportCampaignCsv } from "@/features/outreach/export";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return new Response(`\uFEFF${exportCampaignCsv(db, id)}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leadhunter-${id}.csv"` } });
}
