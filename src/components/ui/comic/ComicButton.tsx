import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-spidey text-white",
  ghost: "bg-surface text-ink",
};

const base =
  "inline-flex items-center justify-center border-2 border-panel-border px-3.5 py-2 font-display text-xs font-black uppercase tracking-widest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web";

const shadowStyle = {
  boxShadow: "3px 3px 0 var(--color-panel-shadow)",
} as const;

// External-URL flavor: renders <a>. Mirrors Button.tsx's target/rel safety.
export function ComicButton(
  props: { href: string; variant?: Variant } & Omit<
    ComponentProps<"a">,
    "href"
  >,
) {
  const {
    href,
    variant = "primary",
    className = "",
    children,
    target,
    rel,
    ...rest
  } = props;
  const safeRel = target === "_blank" ? rel ?? "noopener noreferrer" : rel;
  return (
    <a
      href={href}
      target={target}
      rel={safeRel}
      className={`${base} ${VARIANT[variant]} ${className}`.trim()}
      style={shadowStyle}
      {...rest}
    >
      {children}
    </a>
  );
}

// Internal-route flavor: renders next/link.
export function ComicLinkButton({
  href,
  variant = "primary",
  className = "",
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={`${base} ${VARIANT[variant]} ${className}`.trim()}
      style={shadowStyle}
      {...rest}
    >
      {children}
    </Link>
  );
}
