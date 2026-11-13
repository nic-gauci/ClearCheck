"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import WorkspaceShell from "../../WorkspaceShell";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { meetsPasswordPolicy, passwordRequirements } from "../../lib/password-policy";

export default function ChangePassword(){
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    let active=true;
    void getSupabaseBrowserClient().auth.getUser().then(({data})=>{
      if(!active)return;
      if(data.user)setReady(true);
      else window.location.replace("/login?returnTo=%2Faccount%2Fchange-password");
    });
    return()=>{active=false};
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const fields=new FormData(form);
    const next=String(fields.get("new-password")||"");
    setSaved(false);
    setError("");
    if(!meetsPasswordPolicy(next)){setError(passwordRequirements);return}
    if(next!==fields.get("confirm")){setError("The new passwords do not match.");return}
    setBusy(true);
    try{
      const supabase=getSupabaseBrowserClient();
      const {data}=await supabase.auth.getUser();
      if(!data.user?.email)throw new Error("Log in again to change your password.");
      const {error:signInError}=await supabase.auth.signInWithPassword({email:data.user.email,password:String(fields.get("current")||"")});
      if(signInError)throw new Error("Could not verify your current password. Try again.");
      const {error:updateError}=await supabase.auth.updateUser({password:next});
      if(updateError)throw updateError;
      form.reset();
      setSaved(true);
    }catch(caught){
      setError(caught instanceof Error?caught.message:"Could not change your password.");
    }finally{
      setBusy(false);
    }
  }

  if(!ready)return <main className="accountLoading" role="status">Checking your session…</main>;

  return <WorkspaceShell section="settings">
    <main className="resetCard">
      <h1>Change your password</h1>
      <p>{passwordRequirements}</p>
      <form className="authForm" onSubmit={submit}>
        <label>Current password<input name="current" type="password" autoComplete="current-password" required/></label>
        <label>New password<input name="new-password" type="password" autoComplete="new-password" minLength={8} required/></label>
        <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required/></label>
        <button className="authSubmit" disabled={busy}>{busy?"Updating…":"Update password"}</button>
      </form>
      {error&&<p role="alert">{error}</p>}
      {saved&&<p role="status">Your password was updated.</p>}
      <div className="successActions"><Link href="/account?tab=settings">Back to settings</Link></div>
    </main>
  </WorkspaceShell>;
}
