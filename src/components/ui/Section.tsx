import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export function Section({
  id,
  eyebrow,
  title,
  children,
  className = "",
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-anchor py-20 ${className}`.trim()}>
      <Container>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
          {title}
        </h2>
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
