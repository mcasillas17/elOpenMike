"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useKonami } from "@/lib/useKonami";
import { WebCorner } from "@/components/ui/WebCorner";

export function SpideyMode() {
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearToastTimer = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }, []);

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      clearToastTimer();
      if (next) {
        setToast(true);
        toastTimer.current = setTimeout(() => setToast(false), 2500);
      } else {
        setToast(false);
      }
      return next;
    });
  }, [clearToastTimer]);

  const turnOff = useCallback(() => {
    setOn(false);
    setToast(false);
    clearToastTimer();
  }, [clearToastTimer]);

  useKonami(toggle);

  useEffect(() => {
    function onEvt() { toggle(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") turnOff(); }
    window.addEventListener("spidey:toggle", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("spidey:toggle", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle, turnOff]);

  useEffect(() => () => clearToastTimer(), [clearToastTimer]);

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
