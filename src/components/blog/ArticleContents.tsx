"use client";

import { useEffect, useRef, useState } from "react";
import type { ArticleHeading } from "@/lib/article-syntax";

export function ArticleContents({ headings }: { headings: ArticleHeading[] }) {
  const root = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [reading, setReading] = useState({ activeId: headings[0]?.id ?? "", progress: 0 });

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const adapt = () => setExpanded(media.matches);
    adapt();
    media.addEventListener("change", adapt);
    return () => media.removeEventListener("change", adapt);
  }, []);

  useEffect(() => {
    const content = root.current?.closest("[data-article-reader]")?.querySelector<HTMLElement>("[data-article-content]");
    if (!content) return;
    const ids = new Set(headings.map((heading) => heading.id));
    const elements = [...content.querySelectorAll<HTMLElement>("h2[id], h3[id]")].filter((heading) => ids.has(heading.id));
    let frame: number | null = null;

    function measure() {
      frame = null;
      if (!content) return;
      const bounds = content.getBoundingClientRect();
      const distance = Math.max(1, bounds.height - window.innerHeight + 112);
      const progress = Math.round(Math.max(0, Math.min(1, (112 - bounds.top) / distance)) * 100);
      let activeId = headings[0]?.id ?? "";
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= 128) activeId = element.id;
      }
      const pageHeight = document.documentElement.scrollHeight;
      if (pageHeight > window.innerHeight && window.scrollY + window.innerHeight >= pageHeight - 2) {
        // The last headings cannot always reach the activation line: scrolling
        // stops at the page edge. Honor a visible deep link before the last section.
        const linked = elements.find((element) =>
          window.location.hash === `#${encodeURIComponent(element.id)}`,
        );
        const linkedTop = linked?.getBoundingClientRect().top;
        activeId = linked && linkedTop !== undefined && linkedTop >= 64 && linkedTop < window.innerHeight
          ? linked.id : elements.at(-1)?.id ?? activeId;
      }
      setReading((previous) => previous.activeId === activeId && previous.progress === progress
        ? previous : { activeId, progress });
    }

    // At most one read pass per animation frame; there is no background polling.
    function schedule() {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(content);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [headings]);

  function jump(id: string) {
    const content = root.current?.closest("[data-article-reader]")?.querySelector("[data-article-content]");
    const target = [...content?.querySelectorAll<HTMLElement>("h2[id], h3[id]") ?? []].find((heading) => heading.id === id);
    target?.focus({ preventScroll: true });
    setReading((previous) => ({ ...previous, activeId: id }));
    if (!window.matchMedia("(min-width: 1280px)").matches) setExpanded(false);
  }

  return (
    <aside ref={root} className="article-contents">
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>On this page <span aria-hidden="true" /></summary>
        <nav aria-label="On this page">
          <ol>
            {headings.map((heading) => (
              <li key={heading.id} className={heading.level === 3 ? "article-contents-subsection" : ""}>
                <a
                  href={`#${encodeURIComponent(heading.id)}`}
                  aria-current={reading.activeId === heading.id ? "location" : undefined}
                  onClick={() => jump(heading.id)}
                >
                  {heading.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </details>
      <div className="article-reading-progress">
        <div role="progressbar" aria-label="Reading progress" aria-valuenow={reading.progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ transform: `scaleX(${reading.progress / 100})` }} />
        </div>
        <p>{reading.progress}% read</p>
      </div>
    </aside>
  );
}
