"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CheckoutSuccessPage(){
  useEffect(()=>{
    const sessionId=new URLSearchParams(window.location.search).get("session_id")||"";
    window.location.replace(`/account?billing=success&session_id=${encodeURIComponent(sessionId)}`);
  },[]);
  return <main className="accountPage checkoutRedirectPage"><Link className="checkoutAccountLink" href="/account">My account</Link><div className="accountLoading"><span className="brandMark">C</span><p>Returning to your ClearCheck account…</p></div></main>;
}
