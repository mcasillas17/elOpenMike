export type ReconcilePlan = {
  write: string[];
  delete: string[];
  unchanged: string[];
};

// Compares the desired file set against what is on disk and returns the minimal
// set of operations. Paths are sorted so two runs over the same input produce
// identical plans and identical log output.
export function planReconcile(
  desired: Map<string, string>,
  existing: Map<string, string>,
): ReconcilePlan {
  const write: string[] = [];
  const unchanged: string[] = [];

  for (const [path, contents] of desired) {
    if (existing.get(path) === contents) unchanged.push(path);
    else write.push(path);
  }

  const remove = [...existing.keys()].filter((path) => !desired.has(path));

  return {
    write: write.sort(),
    delete: remove.sort(),
    unchanged: unchanged.sort(),
  };
}
