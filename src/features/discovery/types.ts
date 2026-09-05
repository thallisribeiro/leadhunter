export interface DiscoveryInput {
  campaignId: string;
  locations: string[];
  industries: string[];
  keywords: string[];
  limit: number;
  seedUrls?: string[];
  hashtags?: string[];
  funnel?: "customer" | "affiliate";
}

export interface DiscoveredLead {
  companyName: string;
  website?: string;
  email?: string;
  phone?: string;
  city?: string;
  region?: string;
  country?: string;
  instagram?: string;
  linkedin?: string;
  sourceUrl: string;
  externalId?: string;
  raw?: Record<string, unknown>;
}

export interface LeadDiscoveryProvider {
  name: string;
  discover(input: DiscoveryInput): AsyncGenerator<DiscoveredLead>;
}
