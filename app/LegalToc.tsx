"use client";

import { useEffect, useState } from "react";

export type LegalSection = { id: string; label: string };

export default function LegalToc({ sections }: { sections: LegalSection[] }) {
  const [current, setCurrent] = useState("");

  useEffect(() => {
    const headings = sections.flatMap(({ id }) => {
      const heading = document.getElementById(id);
      return heading ? [heading] : [];
    });
    let frame: number | null = null;

    function update() {
      frame = null;
      const readingLine = Math.min(96, window.innerHeight / 4);
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const target = atBottom && headings.find(heading =>
        window.location.hash === `#${heading.id}` &&
        heading.getBoundingClientRect().top < window.innerHeight
      );
      const reached = headings.findLast(heading => heading.getBoundingClientRect().top <= readingLine);
      setCurrent((target || (atBottom ? headings.at(-1) : reached))?.id ?? "");
    }

    function scheduleUpdate() {
      if (frame === null) frame = window.requestAnimationFrame(update);
    }

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
    };
  }, [sections]);

  return (
    <nav className="legalToc" aria-labelledby="legal-toc-title">
      <strong id="legal-toc-title">On this page</strong>
      <ul>
        {sections.map(({ id, label }) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={current === id ? "location" : undefined}>{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
