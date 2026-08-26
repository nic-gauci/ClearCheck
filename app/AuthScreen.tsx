"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "./lib/supabase";
import AppHeader from "./AppHeader";

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

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setLoading(true);setNotice("");setError("");
    const form=new FormData(event.currentTarget);
    const submittedPassword=String(form.get("password")||"");
    try{
      const supabase=getSupabaseBrowserClient();
      if(registering){
        if(submittedPassword!==confirmPassword)throw new Error("The passwords do not match.");
        const firstName=String(form.get("firstName")||"").trim();
        const lastName=String(form.get("lastName")||"").trim();
        const company=String(form.get("company")||"").trim();
        const {data,error:signUpError}=await supabase.auth.signUp({
          email,password:submittedPassword,
          options:{
            emailRedirectTo:`${window.location.origin}/account`,
            data:{first_name:firstName,last_name:lastName,full_name:`${firstName} ${lastName}`.trim(),company},
          },
        });
        if(signUpError)throw signUpError;
        if(data.session){window.location.assign("/account");return}
        sessionStorage.setItem("clearcheck-confirm-email",email.trim());
        window.location.assign("/check-email");return;
      }else{
        const {error:signInError}=await supabase.auth.signInWithPassword({email,password:submittedPassword});
        if(signInError)throw signInError;
        const requested=new URLSearchParams(window.location.search).get("returnTo")||"/account";
        window.location.assign(requested.startsWith("/")&&!requested.startsWith("//")?requested:"/account");
      }
    }catch(caught){setError(caught instanceof Error?friendlyAuthError(caught.message):"Account access could not be completed.")}
    finally{setLoading(false)}
  }

  async function resetPassword(){
    setNotice("");setError("");
    if(!email.trim()){setError("Enter your work email first, then select Forgot password.");return}
    setLoading(true);
    try{
      const {error:resetError}=await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/reset-password`});
      if(resetError)throw resetError;
      setNotice("Password-reset instructions have been sent. Check your email inbox.");
    }catch(caught){setError(caught instanceof Error?friendlyAuthError(caught.message):"The reset email could not be sent.")}
    finally{setLoading(false)}
  }

  return <main className="authPage">
    <AppHeader variant="auth" authPrompt={registering?"Already have an account?":"New to ClearCheck?"} authHref={registering?"/login":"/register"} authLabel={registering?"Log in":"Create account"}/>
    <section className="authLayout">
      <aside className="authStory">
        <div className="authOrb authOrbOne"/><div className="authOrb authOrbTwo"/>
        <div className="authStoryInner">
          <span className="authEyebrow"><i/> CLEARCHECK WORKSPACE</span>
          <h1>{registering?<>A clearer way to manage <em>sanctions screening.</em></>:<>Welcome back to your <em>compliance workspace.</em></>}</h1>
          <p>{registering?"Create your workspace to run checks, keep an audit trail and prepare for saved screening history.":"Log in to continue screening people and businesses across official risk sources."}</p>
          <div className="authAssurance">
            <div><b>01</b><span><strong>Evidence-linked results</strong><small>Official source links beside every match</small></span></div>
            <div><b>02</b><span><strong>Documented reviews</strong><small>Timestamped reports ready to retain</small></span></div>
            <div><b>03</b><span><strong>Built for Malta &amp; the EU</strong><small>Focused coverage for obliged entities</small></span></div>
          </div>
        </div>
        <p className="authLegal">Independent screening workspace · Human review required</p>
      </aside>
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
            <label>Password <span>{registering?"8+ characters":""}</span><div className="passwordField"><input name="password" type={showPassword?"text":"password"} autoComplete={registering?"new-password":"current-password"} minLength={registering?8:undefined} required placeholder={registering?"Create a secure password":"Enter your password"} value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide password":"Show password"}>{showPassword?"Hide":"Show"}</button></div></label>
            {registering&&<><label>Confirm password<input name="confirmPassword" type={showPassword?"text":"password"} autoComplete="new-password" minLength={8} required placeholder="Repeat your password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label><div className="passwordChecks" aria-live="polite"><span className={password.length>=8?"met":""}>✓ At least 8 characters</span><span className={/[a-z]/.test(password)&&/[A-Z]/.test(password)?"met":""}>✓ Upper and lowercase letters</span><span className={/\d/.test(password)&&/[^A-Za-z0-9]/.test(password)?"met":""}>✓ Number and symbol</span><span className={password&&password===confirmPassword?"met":""}>✓ Passwords match</span></div></>}
            </fieldset>
            {!registering&&<div className="authOptions"><span>Secure sessions stay signed in on this device until you log out.</span><button type="button" disabled={loading} onClick={resetPassword}>Forgot password?</button></div>}
            {registering&&<label className="termsCheck"><input type="checkbox" required/><span>I agree to the <Link href="/terms" target="_blank">Terms of Use</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link> and understand that screening results require human review.</span></label>}
            <button className="authSubmit" type="submit" disabled={loading}>{loading?"Please wait…":registering?"Create account":"Log in"}<span>→</span></button>
          </form>
          {error&&<div className="authNotice authError" role="alert"><span>!</span><p>{error}</p></div>}
          {notice&&<div className="authNotice" role="status"><span>i</span><p>{notice}</p></div>}
          <small className="authBeta">Secure encrypted sign-in · Human review required</small>
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
