import type { LeadDiscoveryProvider } from "@/features/discovery/types";

export function createGooglePlacesProvider(apiKey = process.env.GOOGLE_PLACES_API_KEY): LeadDiscoveryProvider | null {
  if (!apiKey) return null;
  return { name: "google_places", async *discover() {
    throw new Error("Google Places está configurado, mas não foi ativado para esta campanha local.");
  } };
}
