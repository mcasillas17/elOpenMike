"use client";

import { useRef, useState, type ReactNode } from "react";

type ImageSource = { src: string; alt: string };

export function ArticleFigure({ children }: { children?: ReactNode }) {
  const figure = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [image, setImage] = useState<ImageSource | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState("");

  function expand() {
    const source = figure.current?.querySelector("img");
    if (!source?.getAttribute("src")) {
      setError("This figure has no image to expand.");
      return;
    }
    const url = new URL(source.currentSrc || source.src, window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      setError("This image cannot be opened in the viewer.");
      return;
    }
    setError("");
    setImage({ src: url.href, alt: source.alt || "Article image" });
    dialog.current?.showModal();
  }

  return (
    <figure ref={figure} className="article-figure">
      {children}
      <button ref={trigger} type="button" onClick={expand} className="article-expand" aria-label="Expand image">
        Expand <span aria-hidden="true">&nearr;</span>
      </button>
      {error && <p role="alert" className="px-5 text-sm text-spidey-strong">{error}</p>}
      <dialog
        ref={dialog}
        aria-label="Full-size image"
        className="article-image-dialog"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}
        onClose={() => { setImage(null); setZoomed(false); trigger.current?.focus(); }}
      >
        {image && (
          <div className="flex max-h-[90dvh] flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href={image.src} target="_blank" rel="noopener noreferrer" className="text-link text-sm">Open original image</a>
              <button type="button" aria-pressed={zoomed} className="min-h-11 rounded border border-edge px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-web" onClick={() => setZoomed((value) => !value)}>
                {zoomed ? "Fit image" : "Zoom image"}
              </button>
              <button type="button" className="min-h-11 rounded border border-edge px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-web" onClick={() => dialog.current?.close()}>
                Close image
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {/* The viewer uses the original source and allows panning when zoomed. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt={image.alt} style={zoomed ? { width: "200%" } : undefined} className={`mx-auto block h-auto ${zoomed ? "max-w-none" : "max-w-full"}`} />
            </div>
          </div>
        )}
      </dialog>
    </figure>
  );
}
