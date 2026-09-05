import type { DiscoveredLead, LeadDiscoveryProvider } from "@/features/discovery/types";

export const leadFields = ["companyName", "website", "email", "phone", "city", "country", "instagram", "linkedin", "sourceUrl"] as const;
export type LeadField = (typeof leadFields)[number];

const aliases: Record<string, LeadField> = {
  companyname: "companyName", company: "companyName", empresa: "companyName", nome: "companyName",
  website: "website", site: "website", dominio: "website", domain: "website", email: "email",
  "e mail": "email", phone: "phone", telefone: "phone", city: "city", cidade: "city",
  country: "country", pais: "country", instagram: "instagram", linkedin: "linkedin", sourceurl: "sourceUrl", fonte: "sourceUrl",
};

function key(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseRows(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += char;
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function getCsvHeaders(csv: string): string[] {
  return parseRows(csv.replace(/^\uFEFF/, ""))[0] ?? [];
}

export function parseLeadCsv(csv: string, mapping: Record<string, LeadField> = {}): DiscoveredLead[] {
  const [headers, ...rows] = parseRows(csv.replace(/^\uFEFF/, ""));
  if (!headers) return [];
  const fields = headers.map((header) => mapping[header] ?? aliases[key(header)]);
  const companyIndex = fields.indexOf("companyName");
  if (companyIndex < 0) throw new Error("Mapeie uma coluna para companyName.");
  return rows.flatMap((row, rowIndex) => {
    const lead: Partial<DiscoveredLead> = { sourceUrl: `csv:${rowIndex + 2}` };
    fields.forEach((fieldName, index) => { if (fieldName && row[index]) lead[fieldName] = row[index]; });
    return lead.companyName ? [lead as DiscoveredLead] : [];
  });
}

export function createCsvProvider(csv: string, mapping?: Record<string, LeadField>): LeadDiscoveryProvider {
  return { name: "csv", async *discover() { for (const lead of parseLeadCsv(csv, mapping)) yield lead; } };
}
