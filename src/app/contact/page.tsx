import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Miguel Casillas.",
};

export default function ContactPage() {
  return (
    <Container className="py-20">
      <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Get in touch
      </p>
      <h1 className="mt-2 text-center font-display text-4xl font-extrabold sm:text-5xl">
        Contact
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted">
        Have a question, an opportunity, or just want to say hi? Drop me a
        message and I&rsquo;ll get back to you.
      </p>
      <ContactForm />
    </Container>
  );
}
