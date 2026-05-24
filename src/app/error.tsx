"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="font-display text-2xl font-bold">Something snapped.</h1>
      <p className="mt-2 text-muted">An unexpected error occurred.</p>
      <div className="mt-8">
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </Container>
  );
}
