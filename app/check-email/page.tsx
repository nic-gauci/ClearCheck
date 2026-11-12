"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { emailConfirmationUrl, pendingEmailKey } from "../lib/email-confirmation";

export default function CheckEmailPage(){
  const [email,setEmail]=useState("");
  const [confirmation,setConfirmation]=useState<"pending"|"checking"|"confirmed"|"invalid">("pending");
  const hasConfirmationToken=useRef<boolean|null>(null);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    setEmail(sessionStorage.getItem(pendingEmailKey)||"");
    if(new URLSearchParams(window.location.search).get("confirm")!=="1")return;

    const fragment=new URLSearchParams(window.location.hash.slice(1));
    hasConfirmationToken.current??=fragment.has("access_token")&&!fragment.has("error");
    if(!hasConfirmationToken.current){
      setConfirmation("invalid");return;
    }

    let active=true;
    setConfirmation("checking");
    async function verify(){
      try{
        const {data,error}=await getSupabaseBrowserClient().auth.getUser();
        if(!active)return;
        if(error||!data.user?.email_confirmed_at){
          setConfirmation("invalid");return;
        }
        sessionStorage.removeItem(pendingEmailKey);
        setConfirmation("confirmed");
      }catch{
        if(active)setConfirmation("invalid");
      }
    }
    void verify();
    return ()=>{active=false};
  },[]);

  async function resend(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setSending(true);setNotice("");setError("");
    try{
      const {error}=await getSupabaseBrowserClient().auth.resend({
        type:"signup",
        email:email.trim(),
        options:{emailRedirectTo:emailConfirmationUrl(window.location.origin)},
      });
      if(error)throw error;
      sessionStorage.setItem(pendingEmailKey,email.trim());
      setNotice("If this address is awaiting confirmation, a new link will arrive shortly.");
    }catch{
      setError("Could not send a new link. Wait a moment and try again.");
    }finally{setSending(false)}
  }

  return <main className="resetPage">
    <AppHeader variant="auth" authPrompt="Already confirmed?" authHref="/login" authLabel="Log in"/>
    <section className="resetCard">
      <span className="authKicker">CONFIRM YOUR EMAIL</span>
      {confirmation==="checking"?<><h1>Checking your confirmation link</h1><p>Please wait a moment.</p></>:
      confirmation==="confirmed"?<><h1>Email confirmed</h1><p>Your workspace is ready to use.</p><div className="successActions"><Link href="/account">Continue to your account</Link></div></>:
      <>
        <h1>{confirmation==="invalid"?"This confirmation link could not be verified":"Check your inbox"}</h1>
        <p>{confirmation==="invalid"?"The link may have expired or already been used. Request a new one below.":<>Open the confirmation link sent {email?<>to <strong>{email}</strong></>:"to your email address"} to verify your account.</>}</p>
        <form className="authForm" onSubmit={resend}>
          <label>Work email<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
          <button type="submit" className="authSubmit" disabled={sending}>{sending?"Sending…":"Resend confirmation email"}</button>
        </form>
        {notice&&<p role="status">{notice}</p>}
        {error&&<p role="alert">{error}</p>}
        <div className="successActions"><Link href="/login">Go to log in</Link><Link href="/register">Use another email</Link></div>
      </>}
    </section>
  </main>;
}
