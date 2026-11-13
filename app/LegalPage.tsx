import Link from "next/link";
import type { ReactNode } from "react";
import AppHeader from "./AppHeader";
import LegalToc, { type LegalSection } from "./LegalToc";

export default function LegalPage({eyebrow,title,intro,children,sections,summary,updated="5 August 2026"}:{eyebrow:string;title:string;intro:string;children:ReactNode;sections:LegalSection[];summary?:ReactNode;updated?:string}){
  return <main className="legalPage"><AppHeader variant="legal"/><section className="legalHero"><span>{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Last updated {updated}</small></section><div className="legalLayout"><LegalToc sections={sections}/><article className="legalBody">{summary}{children}</article></div><footer className="dashboardFooter"><span>© 2026 ClearCheck</span><div><Link href="/privacy">Privacy</Link><Link href="/cookies">Cookies</Link><Link href="/terms#refunds">Refunds</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link><Link href="/providers">Data sources</Link></div></footer></main>;
}
