"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type AuthMode = "login" | "register";

export default function AuthScreen({mode}:{mode:AuthMode}){
  const registering=mode==="register";
  const [showPassword,setShowPassword]=useState(false);
  const [notice,setNotice]=useState("");

  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setNotice(registering
      ? "Registration details look good. Secure account creation will be activated when the account service is connected."
      : "The log-in screen is ready. Secure account access will be activated when the account service is connected.");
  }

  return <main className="authPage">
    <header className="authHeader">
      <Link className="brand" href="/" aria-label="ClearCheck home"><span className="brandMark">C</span><span>ClearCheck</span></Link>
      <div><span>{registering?"Already have an account?":"New to ClearCheck?"}</span><Link href={registering?"/login":"/register"}>{registering?"Log in":"Create account"}</Link></div>
    </header>
    <section className="authLayout">
      <aside className="authStory">
        <div className="authOrb authOrbOne"/><div className="authOrb authOrbTwo"/>
        <div className="authStoryInner">
          <span className="authEyebrow"><i/> CLEARCHECK WORKSPACE</span>
          <h1>{registering?<>A clearer way to manage <em>AML screening.</em></>:<>Welcome back to your <em>compliance workspace.</em></>}</h1>
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
            {registering&&<div className="authFieldRow">
              <label>First name<input name="firstName" autoComplete="given-name" required placeholder="First name"/></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required placeholder="Last name"/></label>
            </div>}
            {registering&&<label>Company or organisation <span>Optional</span><input name="company" autoComplete="organization" placeholder="Organisation name"/></label>}
            <label>Work email<input name="email" type="email" autoComplete="email" required placeholder="name@company.com"/></label>
            <label>Password <span>{registering?"Minimum 8 characters":""}</span><div className="passwordField"><input name="password" type={showPassword?"text":"password"} autoComplete={registering?"new-password":"current-password"} minLength={registering?8:undefined} required placeholder={registering?"Create a secure password":"Enter your password"}/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide password":"Show password"}>{showPassword?"Hide":"Show"}</button></div></label>
            {!registering&&<div className="authOptions"><label><input type="checkbox" name="remember"/> Remember me</label><button type="button" onClick={()=>setNotice("Password recovery will be available when secure account access is connected.")}>Forgot password?</button></div>}
            {registering&&<label className="termsCheck"><input type="checkbox" required/><span>I agree to the Terms of Use and Privacy Policy and understand that screening results require human review.</span></label>}
            <button className="authSubmit" type="submit">{registering?"Create account":"Log in"}<span>→</span></button>
          </form>
          {notice&&<div className="authNotice" role="status"><span>i</span><p>{notice}</p></div>}
          <div className="authSwitch"><span>{registering?"Already registered?":"Don’t have an account?"}</span><Link href={registering?"/login":"/register"}>{registering?"Log in":"Create an account"}</Link></div>
          <small className="authBeta">PRIVATE BETA · ACCOUNT SERVICE COMING NEXT</small>
        </div>
      </div>
    </section>
  </main>
}
