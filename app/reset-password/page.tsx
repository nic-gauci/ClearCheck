"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function ResetPasswordPage(){
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function updatePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setLoading(true);setMessage("");setError("");
    const form=new FormData(event.currentTarget);
    const password=String(form.get("password")||"");
    const confirm=String(form.get("confirm")||"");
    if(password!==confirm){setError("The passwords do not match.");setLoading(false);return}
    const {error:updateError}=await getSupabaseBrowserClient().auth.updateUser({password});
    if(updateError)setError(updateError.message);
    else setMessage("Your password has been updated. You can now continue to your account.");
    setLoading(false);
  }

  return <main className="resetPage"><section className="resetCard"><Link className="brand" href="/"><span className="brandMark">C</span><span>ClearCheck</span></Link><span className="authKicker">SECURE ACCOUNT RECOVERY</span><h1>Choose a new password</h1><p>Enter a new password for your ClearCheck account.</p><form className="authForm" onSubmit={updatePassword}><label>New password<div className="passwordField"><input name="password" type={show?"text":"password"} minLength={8} required autoComplete="new-password"/><button type="button" onClick={()=>setShow(value=>!value)}>{show?"Hide":"Show"}</button></div></label><label>Confirm new password<input name="confirm" type={show?"text":"password"} minLength={8} required autoComplete="new-password"/></label><button className="authSubmit" disabled={loading}>{loading?"Updating…":"Update password"}<span>→</span></button></form>{error&&<div className="authNotice authError" role="alert"><span>!</span><p>{error}</p></div>}{message&&<div className="authNotice" role="status"><span>✓</span><p>{message} <Link href="/account">Open account</Link></p></div>}</section></main>;
}
