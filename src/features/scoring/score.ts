export interface ScoringInput {
  industryMatch: boolean;
  locationMatch: boolean;
  requiredKeywordMatch: boolean;
  opportunityDetected: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasSocial: boolean;
  positiveSignalCount: number;
  exclusionDetected: boolean;
  hasWebsite: boolean;
  evidenceCount: number;
  sourceCount: number;
}

export interface ScoreBreakdownItem { section: "ICP Fit" | "Opportunity" | "Contactability" | "Intent/Signals" | "Data Quality"; points: number; maximum: number; reasons: string[] }

export function calculateLeadScore(input: ScoringInput) {
  const icpFit = (input.industryMatch ? 20 : 0) + (input.locationMatch ? 15 : 0) + (input.requiredKeywordMatch ? 5 : 0);
  const opportunity = input.opportunityDetected ? 15 : 0;
  const contactability = (input.hasEmail ? 8 : 0) + (input.hasPhone ? 4 : 0) + (input.hasSocial ? 3 : 0);
  const intentSignals = Math.min(input.positiveSignalCount * 5, 10);
  const evidenceQuality = input.evidenceCount >= 4 ? 5 : input.evidenceCount;
  const dataQuality = (input.hasWebsite ? 3 : 0) + evidenceQuality + (input.sourceCount >= 2 ? 2 : 0);
  const exclusionPenalty = input.exclusionDetected ? 30 : 0;
  const score = Math.max(0, Math.min(100, icpFit + opportunity + contactability + intentSignals + dataQuality - exclusionPenalty));
  const confidence = Math.min(100, (input.hasWebsite ? 20 : 0) + (input.hasEmail ? 20 : 0) + (input.hasPhone ? 10 : 0) + (input.hasSocial ? 10 : 0) + Math.min(input.evidenceCount * 7, 25) + (input.sourceCount >= 2 ? 15 : input.sourceCount === 1 ? 8 : 0));
  const breakdown: ScoreBreakdownItem[] = [
    { section: "ICP Fit", points: icpFit - exclusionPenalty, maximum: 40, reasons: [input.industryMatch ? "Segmento corresponde ao ICP" : "Segmento sem correspondência confirmada", input.locationMatch ? "Localização ideal" : "Localização fora ou não detectada", input.requiredKeywordMatch ? "Palavra-chave relevante detectada" : "Palavra-chave obrigatória não detectada", ...(input.exclusionDetected ? ["Exclusão detectada (-30)"] : [])] },
    { section: "Opportunity", points: opportunity, maximum: 25, reasons: [input.opportunityDetected ? "Oportunidade sustentada por evidência" : "Oportunidade específica ainda não detectada"] },
    { section: "Contactability", points: contactability, maximum: 15, reasons: [input.hasEmail ? "Email comercial disponível" : "Email não detectado", input.hasPhone ? "Telefone disponível" : "Telefone não detectado", input.hasSocial ? "Perfil social disponível" : "Perfil social não detectado"] },
    { section: "Intent/Signals", points: intentSignals, maximum: 10, reasons: [`${input.positiveSignalCount} sinal(is) positivo(s)`] },
    { section: "Data Quality", points: dataQuality, maximum: 10, reasons: [`${input.evidenceCount} evidência(s)`, `${input.sourceCount} fonte(s)`] },
  ];
  return { score, confidence, breakdown };
}
