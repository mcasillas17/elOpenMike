"use client";

import {
  isValidElement,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";

type CopyState = "idle" | "copied" | "error";

const languageLabels: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  shell: "Shell",
  sh: "Shell",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
};

function languageFrom(children: ComponentProps<"pre">["children"]) {
  if (!isValidElement(children)) return "Code";

  const language = (
    children as ReactElement<{ "data-language"?: string }>
  ).props["data-language"];

  if (!language) return "Code";
  return languageLabels[language.toLowerCase()] ?? language.toUpperCase();
}

export function CodeBlock({ children, className, ...props }: ComponentProps<"pre">) {
  const codeRef = useRef<HTMLPreElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeRef.current?.textContent ?? "");
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="code-block-shell relative mb-6 overflow-hidden rounded-xl border border-edge bg-[#0d1117]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-edge px-3">
        <span className="font-mono text-xs font-medium text-muted">
          {languageFrom(children)}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex min-h-11 items-center rounded px-2 text-xs font-semibold text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          {copyState === "copied" ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre
        ref={codeRef}
        className={`overflow-x-auto p-4 text-sm leading-relaxed ${className ?? ""}`}
        {...props}
      >
        {children}
      </pre>
      {copyState !== "idle" && (
        <span className="sr-only" role="status">
          {copyState === "copied"
            ? "Code copied"
            : "Copy failed. Select the code and copy it manually."}
        </span>
      )}
    </div>
  );
}
