import { Container } from "@/components/ui/Container";

export default function Loading() {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center">
      <p className="text-muted">Loading…</p>
    </Container>
  );
}
