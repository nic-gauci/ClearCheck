"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "../AppHeader";

export default function CheckEmailPage(){
  const [email,setEmail]=useState("");
  useEffect(()=>{setEmail(sessionStorage.getItem("clearcheck-confirm-email")||"")},[]);
  return <main className="resetPage"><AppHeader variant="auth" authPrompt="Already confirmed?" authHref="/login" authLabel="Log in"/><section className="resetCard"><span className="successIcon">✓</span><span className="authKicker">CONFIRM YOUR EMAIL</span><h1>Check your inbox</h1><p>We created your workspace request. Open the confirmation link sent {email?<>to <strong>{email}</strong></>:"to your email address"}, then return to ClearCheck and log in.</p><div className="successActions"><Link href="/login">Go to log in</Link><Link href="/register">Use another email</Link></div><small className="authBeta">The link can only be used once. If it expires, register again to request a new confirmation.</small></section></main>;
}
