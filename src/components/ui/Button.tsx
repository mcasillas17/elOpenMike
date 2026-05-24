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

function classesFor(variant: Variant, className: string) {
  return `${base} ${variants[variant]} ${className}`.trim();
}

type AnchorProps = { href: string; variant?: Variant } & Omit<
  ComponentProps<"a">,
  "href"
>;
type NativeButtonProps = { href?: never; variant?: Variant } & ComponentProps<
  "button"
>;

// Renders an <a> (hash links, downloads, external URLs) when href is set,
// otherwise a <button>. Props are forwarded correctly in both modes.
export function Button(props: AnchorProps | NativeButtonProps) {
  if (props.href !== undefined) {
    const {
      href,
      variant = "primary",
      className = "",
      children,
      target,
      rel,
      ...rest
    } = props;
    const safeRel =
      target === "_blank" ? rel ?? "noopener noreferrer" : rel;
    return (
      <a
        href={href}
        target={target}
        rel={safeRel}
        className={classesFor(variant, className)}
        {...rest}
      >
        {children}
      </a>
    );
  }

  const { variant = "primary", className = "", children, ...rest } = props;
  return (
    <button className={classesFor(variant, className)} {...rest}>
      {children}
    </button>
  );
}

// Internal route button using next/link, with next/link props forwarded.
export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={classesFor(variant, className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
