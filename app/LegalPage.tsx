import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({eyebrow,title,intro,children,updated="31 July 2026"}:{eyebrow:string;title:string;intro:string;children:ReactNode;updated?:string}){
  return <main className="legalPage"><header className="accountHeader"><Link className="brand" href="/"><span className="brandMark">C</span><span>ClearCheck</span></Link><div><Link href="/account">Dashboard</Link><Link href="/">Screening</Link></div></header><section className="legalHero"><span>{eyebrow}</span><h1>{title}</h1><p>{intro}</p><small>Last updated {updated}</small></section><article className="legalBody">{children}<aside><strong>Pre-launch legal review</strong><p>This operational draft must be reviewed against the operator’s final legal entity, address, regulator-facing obligations, provider contracts and Stripe configuration before ClearCheck is offered commercially.</p></aside></article><footer className="dashboardFooter"><span>© 2026 ClearCheck</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/security">Security</Link><Link href="/providers">Data sources</Link></div></footer></main>;
}
