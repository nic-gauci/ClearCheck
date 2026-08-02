"use client";

import { useEffect } from "react";

export default function CheckoutSuccessPage(){
  useEffect(()=>{
    const sessionId=new URLSearchParams(window.location.search).get("session_id")||"";
    window.location.replace(`/account?billing=success&session_id=${encodeURIComponent(sessionId)}`);
  },[]);
  return <main className="accountPage"><div className="accountLoading"><span className="brandMark">C</span><p>Returning to your ClearCheck account…</p></div></main>;
}
