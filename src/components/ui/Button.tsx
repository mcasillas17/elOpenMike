import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web";

const variants: Record<Variant, string> = {
  primary: "bg-spidey text-white hover:bg-[#c81d22]",
  secondary:
    "border border-[#2a3242] text-ink hover:border-web hover:text-web",
};

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  download?: boolean;
  className?: string;
} & Omit<ComponentProps<"button">, "className">;

export function Button({
  children,
  variant = "primary",
  href,
  download,
  className = "",
  ...rest
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`.trim();

  if (href) {
    // Plain <a> for hash links, downloads, and external URLs.
    return (
      <a href={href} download={download} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

// Internal route button (used by later tasks; uses next/link).
export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`.trim()}>
      {children}
    </Link>
  );
}
