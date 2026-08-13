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
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Plain text",
  python: "Python",
  rust: "Rust",
  shell: "Shell",
  sh: "Shell",
  text: "Plain text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  sql: "SQL",
  yaml: "YAML",
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
          {copyState === "copied"
            ? "Copied"
            : copyState === "error"
              ? "Try copy again"
              : "Copy code"}
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
        <span
          className={
            copyState === "error"
              ? "block border-t border-edge px-3 py-2 text-xs text-spidey-strong"
              : "sr-only"
          }
          role="status"
        >
          {copyState === "copied"
            ? "Code copied"
            : "Copy failed. Select the code and copy it manually."}
        </span>
      )}
    </div>
  );
}
