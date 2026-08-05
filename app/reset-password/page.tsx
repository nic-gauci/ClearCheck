"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import AppHeader from "../AppHeader";

export default function ResetPasswordPage(){
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");

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

  return <main className="resetPage"><AppHeader variant="auth" authPrompt="Remembered your password?" authHref="/login" authLabel="Back to log in"/><section className="resetCard"><span className="authKicker">SECURE ACCOUNT RECOVERY</span><h1>Choose a new password</h1><p>Use at least eight characters and confirm the same password below.</p><form className="authForm" onSubmit={updatePassword}><div className="passwordControl"><span>Password visibility</span><button type="button" onClick={()=>setShow(value=>!value)}>{show?"Hide passwords":"Show passwords"}</button></div><label>New password<input name="password" type={show?"text":"password"} minLength={8} required autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Confirm new password<input name="confirm" type={show?"text":"password"} minLength={8} required autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label><div className="passwordChecks" aria-live="polite"><span className={password.length>=8?"met":""}>✓ At least 8 characters</span><span className={password&&password===confirm?"met":""}>✓ Passwords match</span></div><button className="authSubmit" disabled={loading||password.length<8||password!==confirm}>{loading?"Updating…":"Update password"}<span>→</span></button></form>{error&&<div className="authNotice authError" role="alert"><span>!</span><p>{error}</p></div>}{message&&<div className="authNotice" role="status"><span>✓</span><p>{message} <Link href="/account">Continue to account</Link></p></div>}</section></main>;
}
