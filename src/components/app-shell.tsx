import Link from "next/link";
import type { ReactNode } from "react";

const items = [
  ["/", "⌂", "Visão geral"], ["/campaigns", "◈", "Campanhas"], ["/leads", "◎", "Leads"],
  ["/shortlist", "◇", "Shortlist"], ["/outreach", "↗", "Outreach"], ["/jobs", "≋", "Jobs"],
  ["/settings/business", "⚙", "Configurações"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">LH</span><span><strong>LeadHunter</strong><small>LOCAL</small></span></Link>
      <nav aria-label="Navegação principal">{items.map(([href, icon, label]) => <Link href={href} key={href}><span aria-hidden>{icon}</span>{label}</Link>)}</nav>
      <div className="sidebar-foot"><span className="status-dot" /> Operação local</div>
    </aside>
    <main className="content">{children}</main>
  </div>;
}
