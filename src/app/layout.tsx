import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ClientReady } from "@/components/client-ready";
import "./globals.css";

export const metadata: Metadata = { title: "LeadHunter Local", description: "Prospecção B2B com evidências" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><ClientReady /><AppShell>{children}</AppShell></body></html>;
}
