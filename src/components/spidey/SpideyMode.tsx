"use client";

import { useCallback, useEffect, useState } from "react";
import { useKonami } from "@/lib/useKonami";
import { WebCorner } from "@/components/ui/WebCorner";

export function SpideyMode() {
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState(false);
  const toggle = useCallback(() => setOn((o) => !o), []);

  useKonami(toggle);

  useEffect(() => {
    function onEvt() { toggle(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOn(false); }
    window.addEventListener("spidey:toggle", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("spidey:toggle", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  useEffect(() => {
    if (!on) { setToast(false); return; }
    setToast(true);
    const t = setTimeout(() => setToast(false), 2500);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {on ? "Web-slinger mode on" : "Web-slinger mode off"}
      </div>
      {on && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
          <WebCorner className="left-0 top-0" />
          <WebCorner className="right-0 top-0" />
          <WebCorner className="bottom-0 left-0" />
          <WebCorner className="bottom-0 right-0" />
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <span className="rounded-lg border border-edge bg-surface px-4 py-2 font-display font-bold text-spidey-strong">
            THWIP! 🕸️
          </span>
        </div>
      )}
    </>
  );
}
