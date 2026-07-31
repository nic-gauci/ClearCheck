"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./lib/supabase";

export default function AuthNav(){
  const [signedIn,setSignedIn]=useState(false);

  useEffect(()=>{
    const supabase=getSupabaseBrowserClient();
    let active=true;
    supabase.auth.getUser().then(({data})=>{if(active)setSignedIn(Boolean(data.user))});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setSignedIn(Boolean(session?.user)));
    return()=>{active=false;subscription.unsubscribe()};
  },[]);

  return signedIn
    ?<Link className="headerCta" href="/account">My account</Link>
    :<><Link className="headerLogin" href="/login">Log in</Link><Link className="headerCta" href="/register">Register</Link></>;
}
