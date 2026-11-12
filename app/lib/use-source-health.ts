"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SourceHealthItem = {
  healthy: boolean;
  refreshAttention?: boolean;
  lastUpdated: string | null;
  checkedAt?: string | null;
  message?: string;
};
type SourceHealth = {
  status: "ok" | "attention" | "degraded";
  time: string;
  sources: Record<string, SourceHealthItem>;
};

const refreshInterval = 3 * 60 * 60 * 1000;

export function useSourceHealth() {
  const [sourceHealth, setSourceHealth] = useState<SourceHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const lastCheck = useRef(0);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    lastCheck.current = Date.now();
    setHealthLoading(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
      // A degraded check returns 503 with source-level details.
      const payload: SourceHealth = await response.json();
      if (!controller.signal.aborted) setSourceHealth(payload);
    } catch {
      if (!controller.signal.aborted) {
        setSourceHealth({ status: "degraded", time: new Date().toISOString(), sources: {} });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setHealthLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    let timer: number;
    function schedule() {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const remaining = refreshInterval - (Date.now() - lastCheck.current);
      if (remaining <= 0) void refresh();
      timer = window.setTimeout(schedule, remaining > 0 ? remaining : refreshInterval);
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) void refresh();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("pageshow", onPageShow);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  return { sourceHealth, healthLoading, refresh };
}
