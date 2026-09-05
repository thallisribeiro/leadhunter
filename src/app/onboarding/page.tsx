import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { needsOnboarding } from "@/features/business/actions";
import { BusinessForm } from "@/components/business-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  if (!needsOnboarding(db)) redirect("/");
  return <><PageHeader eyebrow="Primeiro acesso" title="Ensine o LeadHunter sobre seu negócio" description="Essas informações definem quem procurar, o que considerar um bom lead e quais afirmações podem aparecer nas abordagens." /><BusinessForm /></>;
}
