"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "./lib/supabase";
import { emailConfirmationUrl, pendingEmailKey } from "./lib/email-confirmation";
import { meetsPasswordPolicy, passwordRequirements } from "./lib/password-policy";
import AppHeader from "./AppHeader";
import PasswordVisibilityButton from "./PasswordVisibilityButton";

type AuthMode = "login" | "register";

export default function AuthScreen({mode}:{mode:AuthMode}){
  const registering=mode==="register";
  const [showPassword,setShowPassword]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [recovering,setRecovering]=useState(false);
  useEffect(()=>{
    if(!registering&&new URLSearchParams(window.location.search).has("recover"))setRecovering(true);
  },[registering]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setLoading(true);setNotice("");setError("");
    const form=new FormData(event.currentTarget);
    const submittedPassword=String(form.get("password")||"");
    try{
      const supabase=getSupabaseBrowserClient();
      if(registering){
        if(!meetsPasswordPolicy(submittedPassword))throw new Error(passwordRequirements);
        if(submittedPassword!==confirmPassword)throw new Error("The passwords do not match.");
        const firstName=String(form.get("firstName")||"").trim();
        const lastName=String(form.get("lastName")||"").trim();
        const company=String(form.get("company")||"").trim();
        const {data,error:signUpError}=await supabase.auth.signUp({
          email,password:submittedPassword,
          options:{
            emailRedirectTo:emailConfirmationUrl(window.location.origin),
            data:{first_name:firstName,last_name:lastName,full_name:`${firstName} ${lastName}`.trim(),company},
          },
        });
        if(signUpError)throw signUpError;
        if(data.session){
          await supabase.auth.signOut({scope:"local"});
          throw new Error("Email confirmation is not enabled for this workspace. Contact ClearCheck support.");
        }
        sessionStorage.setItem(pendingEmailKey,email.trim());
        window.location.assign("/check-email");return;
      }else{
        const {error:signInError}=await supabase.auth.signInWithPassword({email,password:submittedPassword});
        if(signInError?.code==="email_not_confirmed"){
          sessionStorage.setItem(pendingEmailKey,email.trim());
          window.location.assign("/check-email");return;
        }
        if(signInError)throw signInError;
        const requested=new URLSearchParams(window.location.search).get("returnTo")||"/account";
        const safePath=requested.startsWith("/")&&!requested.startsWith("//")&&!requested.includes("\\");
        window.location.assign(safePath?requested:"/account");
      }
    }catch(caught){setError(caught instanceof Error?friendlyAuthError(caught.message):"Account access could not be completed.")}
    finally{setLoading(false)}
  }

  async function resetPassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setNotice("");setError("");
    setLoading(true);
    try{
      const {error:resetError}=await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/reset-password`});
      if(resetError)throw resetError;
      setNotice("If there is an account for this email, a reset link will arrive shortly.");
    }catch(caught){setError(caught instanceof Error?friendlyAuthError(caught.message):"The reset email could not be sent.")}
    finally{setLoading(false)}
  }

  if(recovering)return <main className="resetPage">
    <AppHeader variant="auth" authHref="/login" authLabel="Back to log in"/>
    <section className="resetCard">
      <h1>Reset your password</h1>
      <p>Enter the email address you use to sign in.</p>
      <form className="authForm" onSubmit={resetPassword}>
        <label>Work email<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
        <button className="authSubmit" disabled={loading}>{loading?"Sending…":"Send reset link"}</button>
      </form>
      {notice&&<p role="status">{notice}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="successActions"><button type="button" onClick={()=>{setRecovering(false);setNotice("");setError("")}}>Back to log in</button></div>
    </section>
  </main>;

  return <main className="authPage">
    <AppHeader variant="auth" authPrompt={registering?"Already have an account?":"New to ClearCheck?"} authHref={registering?"/login":"/register"} authLabel={registering?"Log in":"Create account"}/>
    <section className={registering?"authLayout":"loginLayout"}>
      {registering&&<aside className="authStory">
        <div className="authOrb authOrbOne"/><div className="authOrb authOrbTwo"/>
        <div className="authStoryInner">
          <span className="authEyebrow"><i/> CLEARCHECK WORKSPACE</span>
          <h1>{registering?<>A clearer way to manage <em>sanctions screening.</em></>:<>Welcome back to your <em>compliance workspace.</em></>}</h1>
          <p>{registering?"Create your workspace to run checks, keep an audit trail and prepare for saved screening history.":"Log in to continue screening people and businesses across official risk sources."}</p>
          <div className="authAssurance">
            <div><b>01</b><span><strong>Evidence-linked results</strong><small>Source links to help you review matches</small></span></div>
            <div><b>02</b><span><strong>Documented reviews</strong><small>Timestamped reports ready to retain</small></span></div>
            <div><b>03</b><span><strong>Built for Malta &amp; the EU</strong><small>Focused coverage for obliged entities</small></span></div>
          </div>
        </div>
        <p className="authLegal">Independent screening workspace · Human review required</p>
      </aside>}
      <div className="authFormSide">
        <div className="authCard">
          <span className="authKicker">{registering?"START YOUR WORKSPACE":"SECURE ACCESS"}</span>
          <h2>{registering?"Create your account":"Log in to ClearCheck"}</h2>
          <p>{registering?"Set up your details now. No payment is required during the private beta.":"Enter your work email and password to continue."}</p>
          <form onSubmit={submit} className="authForm">
            {registering&&<fieldset className="authGroup"><legend>Personal details</legend><div className="authFieldRow">
              <label>First name<input name="firstName" autoComplete="given-name" required placeholder="First name"/></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required placeholder="Last name"/></label>
            </div></fieldset>}
            {registering&&<fieldset className="authGroup"><legend>Workspace</legend><label>Company or organisation <span>Optional</span><input name="company" autoComplete="organization" placeholder="Organisation name"/></label></fieldset>}
            <fieldset className="authGroup"><legend>{registering?"Security":"Account details"}</legend><label>Work email<input name="email" type="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event=>setEmail(event.target.value)}/></label>
            <label>Password <span>{registering?"8+ characters":""}</span><div className="passwordField"><input name="password" type={showPassword?"text":"password"} autoComplete={registering?"new-password":"current-password"} minLength={registering?8:undefined} required placeholder={registering?"Create a secure password":"Enter your password"} value={password} onChange={event=>setPassword(event.target.value)}/><PasswordVisibilityButton visible={showPassword} onToggle={()=>setShowPassword(value=>!value)}/></div></label>
            {registering&&<><label>Confirm password<input name="confirmPassword" type={showPassword?"text":"password"} autoComplete="new-password" minLength={8} required placeholder="Repeat your password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label><div className="passwordChecks" aria-live="polite"><span className={password.length>=8?"met":""}>✓ At least 8 characters</span><span className={/[a-z]/.test(password)&&/[A-Z]/.test(password)?"met":""}>✓ Upper and lowercase letters</span><span className={/\d/.test(password)&&/[^A-Za-z0-9]/.test(password)?"met":""}>✓ Number and symbol</span><span className={password&&password===confirmPassword?"met":""}>✓ Passwords match</span></div></>}
            </fieldset>
            {!registering&&<div className="authOptions"><span>On a shared device, log out when you finish.</span><button type="button" disabled={loading} onClick={()=>{setPassword("");setShowPassword(false);setError("");setRecovering(true)}}>Forgot password?</button></div>}
            {registering&&<label className="termsCheck"><input type="checkbox" required/><span>I agree to the <Link href="/terms" target="_blank">Terms of Use</Link> and understand that screening results require human review.</span></label>}
            <button className="authSubmit" type="submit" disabled={loading}>{loading?"Please wait…":registering?"Create account":"Log in"}<span>→</span></button>
          </form>
          {error&&<div className="authNotice authError" role="alert"><span>!</span><p>{error}</p></div>}
          {notice&&<div className="authNotice" role="status"><span>i</span><p>{notice}</p></div>}
          <nav className="authPolicyLinks" aria-label="Policies"><Link href="/privacy">Privacy notice</Link><Link href="/cookies">Cookies</Link></nav>
        </div>
      </div>
    </section>
  </main>
}

function friendlyAuthError(message:string){
  const value=message.toLowerCase();
  if(value.includes("invalid login credentials"))return "The email or password is incorrect.";
  if(value.includes("email not confirmed"))return "Confirm your email address before logging in.";
  if(value.includes("user already registered"))return "An account already exists for this email. Log in instead.";
  if(value.includes("rate limit"))return "Too many attempts. Please wait a moment and try again.";
  return message;
}
