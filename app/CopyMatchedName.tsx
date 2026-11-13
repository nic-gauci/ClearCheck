"use client";

import { useState } from "react";

export default function CopyMatchedName({name}:{name:string}){
  const [status,setStatus]=useState("");
  async function copy(){
    try{
      await navigator.clipboard.writeText(name);
      setStatus("Name copied.");
    }catch{
      setStatus("Could not copy. Select the name above and copy it manually.");
    }
  }
  return <span className="copyMatchedName">
    <button type="button" aria-label={`Copy name: ${name}`} onClick={copy}>Copy name</button>
    {status&&<small role="status">{status}</small>}
  </span>;
}
