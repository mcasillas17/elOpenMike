import { Container } from "@/components/ui/Container";

export default function Loading() {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center">
      <p className="text-muted" role="status" aria-live="polite">
        Loading…
      </p>
    </Container>
  );
}
