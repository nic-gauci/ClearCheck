"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function AccountPage(){
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;
    getSupabaseBrowserClient().auth.getUser().then(({data})=>{
      if(!active)return;
      if(!data.user){window.location.replace("/login");return}
      setUser(data.user);setLoading(false);
    });
    return()=>{active=false};
  },[]);

  async function signOut(){
    await getSupabaseBrowserClient().auth.signOut();
    window.location.replace("/");
  }

  if(loading||!user)return <main className="accountPage"><div className="accountLoading"><span className="brandMark">C</span><p>Opening your ClearCheck account…</p></div></main>;

  const metadata=user.user_metadata||{};
  const name=metadata.full_name||user.email?.split("@")[0]||"ClearCheck user";
  const initials=String(name).split(/\s+/).slice(0,2).map((part:string)=>part[0]).join("").toUpperCase();

  return <main className="accountPage">
    <header className="accountHeader"><Link className="brand" href="/"><span className="brandMark">C</span><span>ClearCheck</span></Link><div><Link href="/">Run a screening</Link><button onClick={signOut}>Log out</button></div></header>
    <section className="accountHero"><div><span className="authEyebrow"><i/> ACCOUNT ACTIVE</span><h1>Welcome, {String(name).split(" ")[0]}.</h1><p>Your secure ClearCheck account is connected and ready for the next stage of saved screening history.</p></div></section>
    <section className="accountContent">
      <article className="profileCard"><div className="profileTitle"><span>{initials}</span><div><small>ACCOUNT HOLDER</small><h2>{name}</h2><p>{user.email}</p></div></div><dl><div><dt>Email status</dt><dd>{user.email_confirmed_at?"Verified":"Confirmation required"}</dd></div><div><dt>Organisation</dt><dd>{metadata.company||"Not provided"}</dd></div><div><dt>Member since</dt><dd>{new Date(user.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</dd></div></dl></article>
      <article className="accountNext"><span>COMING NEXT</span><h2>Your screening workspace</h2><p>The account foundation is now live. Saved searches, reports, team members and screening credits will be attached to this secure identity.</p><Link href="/">Run an AML screening <b>→</b></Link></article>
    </section>
  </main>;
}
