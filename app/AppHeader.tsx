"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeButton from "./ThemeButton";
import { getSupabaseBrowserClient } from "./lib/supabase";

type HeaderVariant="public"|"authenticated"|"auth"|"legal";

export default function AppHeader({
  variant="public",
  currentAccount=false,
  onHome,
  authPrompt,
  authHref,
  authLabel,
}:{
  variant?:HeaderVariant;
  currentAccount?:boolean;
  onHome?:()=>void;
  authPrompt?:string;
  authHref?:string;
  authLabel?:string;
}){
  const [signedIn,setSignedIn]=useState(false);
  const [authReady,setAuthReady]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);

  useEffect(()=>{
    let supabase;
    try {
      supabase=getSupabaseBrowserClient();
    } catch {
      setAuthReady(true);
      return;
    }
    let active=true;
    supabase.auth.getUser().then(({data})=>{if(active){setSignedIn(Boolean(data.user));setAuthReady(true)}});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setSignedIn(Boolean(session?.user));setAuthReady(true)});
    return()=>{active=false;subscription.unsubscribe()};
  },[]);

  async function signOut(){
    await getSupabaseBrowserClient().auth.signOut();
    window.location.assign("/");
  }

  const brand=onHome
    ?<button className="brand brandButton" onClick={onHome} aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></button>
    :<Link className="brand" href="/" aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></Link>;

  return <header className={`topbar appHeader ${variant}`}>
    {brand}
    {variant==="public"&&<nav className="desktopNav" aria-label="Main navigation"><Link href="/#platform">Platform</Link><Link href="/#coverage">Coverage</Link><Link href="/#industries">Industries</Link><Link href="/#pricing">Pricing</Link></nav>}
    {variant==="authenticated"&&<nav className="desktopNav" aria-label="Workspace navigation"><a href="/workspace">Workspace</a><a href="/workspace?view=clients">Clients</a><Link href="/screening">New screening</Link><Link href="/account?tab=screenings">Screenings</Link></nav>}
    {variant==="legal"&&<nav className="desktopNav legalBack"><Link href="/">Back to website</Link></nav>}
    <ThemeButton/>
    <div className="headerRight desktopActions">
      {variant==="auth"&&<><span className="authPrompt">{authPrompt}</span><Link className="headerCta" href={authHref||"/login"}>{authLabel||"Log in"}</Link></>}
      {variant==="public"&&authReady&&(signedIn?<><Link className="headerLogin" href="/workspace">Workspace</Link><Link className="headerCta" href="/account">My account</Link></>:<><Link className="headerLogin" href="/login">Log in</Link><Link className="headerCta" href="/register">Create account</Link></>)}
      {variant==="legal"&&authReady&&(signedIn?<Link className="headerCta" href="/account">My account</Link>:<Link className="headerCta" href="/login">Log in</Link>)}
      {variant==="authenticated"&&<>{!currentAccount&&<Link className="headerCta secondary" href="/account">My account</Link>}<button className="headerLogout" onClick={signOut}>Log out</button></>}
    </div>
    {variant!=="auth"&&<button className="menuButton" type="button" aria-label={menuOpen?"Close navigation":"Open navigation"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)}><span/><span/><span/></button>}
    {menuOpen&&variant!=="auth"&&<div className="mobileMenu">
      {variant==="public"&&<><Link href="/#platform">Platform</Link><Link href="/#coverage">Coverage</Link><Link href="/#industries">Industries</Link><Link href="/#pricing">Pricing</Link></>}
      {variant==="authenticated"&&<><a href="/workspace">Workspace</a><a href="/workspace?view=clients">Clients</a><Link href="/screening">New screening</Link><Link href="/account?tab=screenings">Screenings</Link>{!currentAccount&&<Link href="/account">My account</Link>}<button onClick={signOut}>Log out</button></>}
      {variant==="legal"&&<Link href="/">Back to website</Link>}
      {(variant==="public"||variant==="legal")&&authReady&&(signedIn?<><Link href="/workspace">Workspace</Link><Link href="/account">My account</Link></>:<><Link href="/login">Log in</Link>{variant==="public"&&<Link className="primary" href="/register">Create account</Link>}</>)}
    </div>}
  </header>;
}
