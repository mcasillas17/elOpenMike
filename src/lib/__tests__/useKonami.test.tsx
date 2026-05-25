import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKonami } from "@/lib/useKonami";

function Probe({ onHit }: { onHit: () => void }) {
  useKonami(onHit);
  return null;
}

const SEQ = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

describe("useKonami", () => {
  it("fires after the full sequence", () => {
    const onHit = vi.fn();
    render(<Probe onHit={onHit} />);
    for (const key of SEQ) fireEvent.keyDown(window, { key });
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it("does not fire on a wrong sequence", () => {
    const onHit = vi.fn();
    render(<Probe onHit={onHit} />);
    for (const key of ["ArrowUp", "ArrowUp", "a"]) fireEvent.keyDown(window, { key });
    expect(onHit).not.toHaveBeenCalled();
  });
});
