import { Container } from "@/components/ui/Container";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-display text-7xl font-extrabold text-spidey">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold">
        This page got webbed up.
      </h1>
      <p className="mt-2 text-muted">
        The thing you&#x2019;re looking for swung off somewhere else.
      </p>
      <div className="mt-8">
        <LinkButton href="/">Back home</LinkButton>
      </div>
    </Container>
  );
}
