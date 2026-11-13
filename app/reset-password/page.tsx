"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";
import { meetsPasswordPolicy, passwordRequirements } from "../lib/password-policy";
import AppHeader from "../AppHeader";
import PasswordVisibilityButton from "../PasswordVisibilityButton";

export default function ResetPasswordPage(){
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [recoveryState,setRecoveryState]=useState<"checking"|"ready"|"invalid">("checking");

  const recoveryLink=useRef<boolean|null>(null);
  useEffect(()=>{
    const fragment=new URLSearchParams(window.location.hash.slice(1));
    const query=new URLSearchParams(window.location.search);
    recoveryLink.current??=(fragment.get("type")==="recovery"&&fragment.has("access_token"))||query.has("code");
    if(!recoveryLink.current){setRecoveryState("invalid");return}
    const supabase=getSupabaseBrowserClient();let active=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(active&&event==="PASSWORD_RECOVERY")setRecoveryState("ready")});
    const timer=window.setTimeout(()=>{if(active)setRecoveryState(state=>state==="checking"?"invalid":state)},8000);
    return()=>{active=false;window.clearTimeout(timer);subscription.unsubscribe()};
  },[]);

  async function updatePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setLoading(true);setMessage("");setError("");
    const form=new FormData(event.currentTarget);
    const password=String(form.get("password")||"");
    const confirm=String(form.get("confirm")||"");
    if(password!==confirm){setError("The passwords do not match.");setLoading(false);return}
    if(recoveryState!=="ready"||!meetsPasswordPolicy(password)){setError(passwordRequirements);setLoading(false);return}
    const {error:updateError}=await getSupabaseBrowserClient().auth.updateUser({password});
    if(updateError)setError(updateError.message);
    else setMessage("Your password has been updated. You can now continue to your account.");
    setLoading(false);
  }

  return <main className="resetPage"><AppHeader variant="auth" authPrompt="Remembered your password?" authHref="/login" authLabel="Back to log in"/><section className="resetCard"><span className="authKicker">SECURE ACCOUNT RECOVERY</span>{recoveryState==="checking"?<><h1>Checking your recovery link</h1><p>Please wait while ClearCheck verifies that this link is valid.</p></>:recoveryState==="invalid"?<><h1>This recovery link is not valid</h1><p>It may have expired, already been used, or been opened on another device. Request a new password-reset email from the login screen.</p><div className="successActions"><Link href="/login?recover=1">Request another link</Link></div></>:<><h1>Choose a new password</h1><p>Use at least eight characters, including upper and lowercase letters, a number and a symbol.</p><form className="authForm" onSubmit={updatePassword}><div className="passwordControl"><span>Password visibility</span><PasswordVisibilityButton visible={show} onToggle={()=>setShow(value=>!value)} multiple/></div><label>New password<input name="password" type={show?"text":"password"} minLength={8} required autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Confirm new password<input name="confirm" type={show?"text":"password"} minLength={8} required autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label><div className="passwordChecks" aria-live="polite"><span className={password.length>=8?"met":""}>✓ At least 8 characters</span><span className={/[a-z]/.test(password)&&/[A-Z]/.test(password)?"met":""}>✓ Upper and lowercase letters</span><span className={/\d/.test(password)&&/[^A-Za-z0-9]/.test(password)?"met":""}>✓ Number and symbol</span><span className={password&&password===confirm?"met":""}>✓ Passwords match</span></div><button className="authSubmit" disabled={loading||!meetsPasswordPolicy(password)||password!==confirm}>{loading?"Updating…":"Update password"}<span>→</span></button></form>{error&&<div className="authNotice authError" role="alert"><span>!</span><p>{error}</p></div>}{message&&<div className="authNotice" role="status"><span>✓</span><p>{message} <Link href="/account">Continue to account</Link></p></div>}</>}</section></main>;
}
