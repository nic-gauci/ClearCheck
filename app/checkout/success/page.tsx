"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "../../AppHeader";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Purchase={planName:string;credits:number;amount:number;currency:string};

export default function CheckoutSuccessPage(){
  const [purchase,setPurchase]=useState<Purchase|null>(null);
  const [error,setError]=useState("");
  const [reference,setReference]=useState("");
  const [canRetry,setCanRetry]=useState(false);
  const [testMode,setTestMode]=useState(false);

  useEffect(()=>{
    let active=true;
    async function confirmPurchase(){
      const sessionId=new URLSearchParams(window.location.search).get("session_id");
      if(!sessionId?.startsWith("cs_")){setError("This link has no valid payment reference. Check purchase history for any completed payment.");return}
      setReference(`CC-${sessionId.slice(-8).toUpperCase()}`);setTestMode(sessionId.startsWith("cs_test_"));
      const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();
      if(!session){window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname+window.location.search)}`);return}
      try{
        let lastError="Your payment could not be confirmed yet.";
        for(let attempt=0;attempt<5;attempt++){
          const response=await fetch("/api/billing/confirm",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({sessionId})});
          const payload=await response.json().catch(()=>({error:"The confirmation service returned an invalid response."}));
          if(!active)return;
          if(response.ok){setPurchase(payload.purchase as Purchase);return}
          lastError=payload.error||lastError;
          if(response.status!==409){setCanRetry(false);setError(lastError);return}
          setCanRetry(true);
          if(attempt<4)await new Promise(resolve=>window.setTimeout(resolve,1500));
        }
        throw new Error(lastError);
      }catch(caught){if(active)setError(caught instanceof Error?caught.message:"Your payment could not be confirmed yet.")}
    }
    void confirmPurchase();
    return()=>{active=false};
  },[]);

  return <main className="checkoutSuccessPage">
    <AppHeader variant="authenticated"/>
    <section className="checkoutSuccessShell">
      {!purchase&&!error&&<><span className="successIcon pending">…</span><span className="authKicker">CONFIRMING PAYMENT</span><h1>Finalising your purchase</h1><p>We are securely confirming the payment and adding your screening credits. This normally takes only a moment.</p></>}
      {error&&<><span className="successIcon error">!</span><span className="authKicker">CONFIRMATION NEEDS ATTENTION</span><h1>We could not confirm the purchase</h1><p>{error}{canRetry&&" You can safely retry confirmation."}</p><div className="successActions">{canRetry&&<button type="button" onClick={()=>window.location.reload()}>Try confirmation again</button>}<Link href="/account?tab=billing#purchase-history">View purchase history</Link></div></>}
      {purchase&&<><span className="successIcon">✓</span><span className="authKicker">PAYMENT RECEIVED</span><h1>Purchase successful</h1><p>Your credits have been added exactly once and are ready to use.</p>{testMode&&<span className="testModeBadge">STRIPE TEST MODE · NO LIVE CHARGE</span>}<div className="purchaseReceipt"><span><small>PLAN</small><strong>{purchase.planName}</strong></span><span><small>AMOUNT</small><strong>{purchase.currency} {(purchase.amount/100).toFixed(2)}</strong></span><span><small>CREDITS</small><strong>+{purchase.credits}</strong></span><span><small>RECEIPT REFERENCE</small><strong>{reference}</strong></span></div><div className="successActions"><Link href="/screening">Start screening</Link><Link href="/account?tab=billing">Go to account</Link></div></>}
    </section>
  </main>;
}
