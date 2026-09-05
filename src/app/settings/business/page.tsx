import { db } from "@/db/client";
import { getBusinessProfile } from "@/features/business/actions";
import { BusinessForm } from "@/components/business-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function BusinessSettingsPage() {
  return <><PageHeader eyebrow="Configurações" title="Meu negócio" description="Atualize oferta, ICP e limites de comunicação." /><BusinessForm profile={getBusinessProfile(db)} /></>;
}
