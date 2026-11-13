"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import ThemeButton from "./ThemeButton";
import { getSupabaseBrowserClient } from "./lib/supabase";

export type WorkspaceSection="overview"|"screening"|"clients"|"reviews"|"history"|"settings"|"billing";

const sections=[
  {id:"overview",label:"Overview",href:"/account"},
  {id:"screening",label:"Screening",href:"/screening"},
  {id:"clients",label:"Clients",href:"/workspace?view=clients"},
  {id:"reviews",label:"Reviews due",href:"/workspace?view=monitoring"},
  {id:"history",label:"History",href:"/account?tab=screenings"},
  {id:"billing",label:"Billing",href:"/account?tab=billing"},
  {id:"settings",label:"Settings",href:"/account?tab=settings"},
] as const;

const iconPaths:Record<WorkspaceSection,string>={
  overview:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  screening:"M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M16 16l4 4",
  clients:"M2.5 7.5V6A2 2 0 0 1 4.5 4h5l2 2h8A2 2 0 0 1 21.5 8v10a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z",
  reviews:"M5 5h14v15H5z M8 3v4m8-4v4M5 9h14m-10 6 2 2 4-4",
  history:"M4 12a8 8 0 1 1 2.5 5.8 M4 7v5h5 M12 8v4l3 2",
  billing:"M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 10h18 M7 15h3",
  settings:"M4 6h5m4 0h7M9 4v4m-5 4h10m4 0h2m-6-2v4M4 18h3m4 0h9m-13-2v4",
};

export default function WorkspaceShell({section,role,children}:{section:WorkspaceSection;role?:string|null;children:ReactNode}){
  const canManageBilling=role==="owner"||role==="admin";
  const currentSection=sections.find(item=>item.id===section)?.label;

  async function signOut(){
    await getSupabaseBrowserClient().auth.signOut();
    window.location.assign("/");
  }

  return <div className="softwareShell">
    <header className="softwareHeader">
      <Link className="brand" href="/account" aria-label="ClearCheck workspace"><span className="brandMark">C</span><span>ClearCheck</span></Link>
      <div className="softwareLocation"><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentSection}</strong></div>
      <div className="softwareActions"><ThemeButton/><button className="headerLogout" type="button" onClick={signOut}>Log out</button></div>
    </header>
    <div className="softwareLayout">
      <nav className="softwareNav" aria-label="Workspace">
        {sections.filter(item=>item.id!=="billing"||canManageBilling).map(item=>
          <div key={item.id} className={item.id==="settings"?"softwareNavEnd":undefined}>
            <a href={item.href} aria-current={item.id===section?"page":undefined}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[item.id]}/></svg>
              {item.label}
            </a>
          </div>
        )}
      </nav>
      <div className="softwareContent">{children}</div>
    </div>
  </div>;
}
