import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

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
        <Reveal>
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
            {title}
          </h2>
          <div className="mt-10">{children}</div>
        </Reveal>
      </Container>
    </section>
  );
}
