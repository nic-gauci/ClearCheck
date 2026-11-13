"use client";

import { useEffect, useState } from "react";

export default function ThemeButton(){
  const [theme,setTheme]=useState<"light"|"dark">("light");

  useEffect(()=>{
    setTheme(document.documentElement.dataset.theme==="dark"?"dark":"light");
  },[]);

  const next=theme==="dark"?"light":"dark";
  const label=theme==="dark"?"Switch to light mode":"Switch to dark mode";

  function toggle(){
    document.documentElement.dataset.theme=next;
    document.documentElement.style.colorScheme=next;
    localStorage.setItem("clearcheck-theme",next);
    setTheme(next);
  }

  return <button className="themeToggle" type="button" onClick={toggle} aria-label={label} title={label}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {theme==="dark"?
        <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></>:
        <path d="M20.9 13.35A9 9 0 0 1 10.65 3.1 9 9 0 1 0 20.9 13.35Z"/>}
    </svg>
  </button>;
}
