import { saveBusinessAction } from "@/app/actions";
import type { BusinessProfile } from "@/features/business/schema";
import { Field, Input, Textarea } from "@/components/ui";

const joined = (values?: string[]) => values?.join("\n") ?? "";

export function BusinessForm({ profile }: { profile?: BusinessProfile | null }) {
  return <form action={saveBusinessAction} className="stack-xl">
    <section className="form-section"><div className="section-copy"><span>01</span><h2>Sua empresa</h2><p>Contexto usado para avaliar aderência e redigir mensagens.</p></div><div className="form-grid">
      <Field label="Nome da empresa"><Input name="businessName" defaultValue={profile?.businessName} required /></Field>
      <Field label="Website"><Input name="website" type="url" defaultValue={profile?.website ?? ""} placeholder="https://" /></Field>
      <Field label="Descrição do negócio"><Textarea name="businessDescription" defaultValue={profile?.businessDescription} required /></Field>
      <Field label="Oferta"><Textarea name="offer" defaultValue={profile?.offer} required /></Field>
      <Field label="Pitch em uma frase"><Input name="oneLinePitch" defaultValue={profile?.oneLinePitch} required /></Field>
      <Field label="Ticket médio"><Input name="averageTicket" type="number" min="0" defaultValue={profile?.averageTicket ?? ""} /></Field>
      <Field label="Meta comercial"><Input name="salesGoal" defaultValue={profile?.salesGoal ?? ""} /></Field>
    </div></section>
    <section className="form-section"><div className="section-copy"><span>02</span><h2>Provas e limites</h2><p>Uma informação por linha. O LeadHunter nunca usa algo fora das provas verificadas.</p></div><div className="form-grid">
      <Field label="Afirmações verificadas"><Textarea name="verifiedClaims" defaultValue={joined(profile?.verifiedClaims)} required /></Field>
      <Field label="Afirmações proibidas"><Textarea name="forbiddenClaims" defaultValue={joined(profile?.forbiddenClaims)} /></Field>
    </div></section>
    <section className="form-section"><div className="section-copy"><span>03</span><h2>Cliente ideal</h2><p>Defina quem merece entrar na sua lista curta.</p></div><div className="form-grid">
      <Field label="Segmentos"><Textarea name="targetIndustries" defaultValue={joined(profile?.targetIndustries)} required /></Field>
      <Field label="Tipos de empresa"><Textarea name="targetBusinessTypes" defaultValue={joined(profile?.targetBusinessTypes)} /></Field>
      <Field label="Localizações"><Textarea name="targetLocations" defaultValue={joined(profile?.targetLocations)} required /></Field>
      <Field label="Porte"><Input name="targetCompanySize" defaultValue={profile?.targetCompanySize ?? ""} /></Field>
      <Field label="Palavras-chave"><Textarea name="targetKeywords" defaultValue={joined(profile?.targetKeywords)} /></Field>
      <Field label="Sinais positivos"><Textarea name="positiveSignals" defaultValue={joined(profile?.positiveSignals)} /></Field>
      <Field label="Sinais negativos"><Textarea name="negativeSignals" defaultValue={joined(profile?.negativeSignals)} /></Field>
      <Field label="Exclusões"><Textarea name="exclusions" defaultValue={joined(profile?.exclusions)} /></Field>
    </div></section>
    <section className="form-section"><div className="section-copy"><span>04</span><h2>Abordagem</h2><p>Oriente a mensagem sem automatizar o envio.</p></div><div className="form-grid">
      <Field label="Objetivo"><Input name="outreachGoal" defaultValue={profile?.outreachGoal} required /></Field>
      <Field label="Chamada para ação"><Input name="callToAction" defaultValue={profile?.callToAction} required /></Field>
      <Field label="Tom"><Input name="tone" defaultValue={profile?.tone} placeholder="Direto e consultivo" required /></Field>
      <Field label="Idioma"><Input name="outreachLanguage" defaultValue={profile?.outreachLanguage ?? "pt-BR"} required /></Field>
      <Field label="Mensagens de exemplo"><Textarea name="exampleMessages" defaultValue={joined(profile?.exampleMessages)} /></Field>
      <Field label="Instruções adicionais"><Textarea name="additionalInstructions" defaultValue={profile?.additionalInstructions ?? ""} /></Field>
      <Field label="Seu nome" hint="Quem assina as conversas."><Input name="ownerName" defaultValue={profile?.ownerName ?? ""} /></Field>
      <Field label="Seu cargo"><Input name="ownerRole" defaultValue={profile?.ownerRole ?? ""} placeholder="Fundador" /></Field>
      <Field label="Instagram da empresa"><Input name="instagramHandle" defaultValue={profile?.instagramHandle ?? ""} placeholder="@suaempresa" /></Field>
      <Field label="Link do WhatsApp" hint="Para onde o lead interessado é encaminhado."><Input name="whatsappLink" type="url" defaultValue={profile?.whatsappLink ?? ""} placeholder="https://wa.me/55..." /></Field>
      <Field label="Link do grupo de afiliados"><Input name="affiliateGroupLink" type="url" defaultValue={profile?.affiliateGroupLink ?? ""} placeholder="https://chat.whatsapp.com/..." /></Field>
      <Field label="Como funciona" hint="Passos separados por |"><Input name="howItWorks" defaultValue={profile?.howItWorks ?? ""} placeholder="briefing | rascunho em 48h | ajustes" /></Field>
      <Field label="Modelo de receita"><Input name="revenueModel" defaultValue={profile?.revenueModel ?? ""} /></Field>
      <Field label="Jargão do mercado" hint="termo = significado"><Input name="marketJargon" defaultValue={profile?.marketJargon ?? ""} /></Field>
      <Field label="Afirmações a comprovar" hint="Bloqueadas até virarem prova."><Textarea name="unverifiedClaims" defaultValue={joined(profile?.unverifiedClaims)} /></Field>
      <Field label="Temas de afiliados" hint="Criadores que falam sobre isso."><Textarea name="affiliateTopics" defaultValue={joined(profile?.affiliateTopics)} /></Field>
      <Field label="Geografia"><Input name="geography" defaultValue={profile?.geography ?? ""} placeholder="Brasil" /></Field>
    </div></section>
    <div className="form-submit"><p>Seus dados ficam somente neste computador.</p><button className="button button-primary" type="submit">Salvar e criar campanha <span>→</span></button></div>
  </form>;
}
