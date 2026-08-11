import { createHash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";

// One algorithm, in one place, because two halves of the sync ask the same
// question with it: the name an image gets on disk is the first twelve hex
// characters of this digest (see imageFileName), and the plan decides whether a
// file already holds the bytes in hand by comparing the whole of it. Two
// answers to one question had better be asked the same way.
export const IMAGE_DIGEST_ALGORITHM = "sha256";

// How much of a file is in memory at once while it is being read. One buffer of
// this size is reused for every file in a walk, so what inspecting a tree costs
// does not depend on how much the tree weighs — which is the entire point of
// reading a file this way rather than with readFile().
export const IMAGE_DIGEST_CHUNK_BYTES = 64 * 1024;

// The first twelve characters name the file; the rest of the digest is what
// tells two different images with the same first twelve apart.
export const IMAGE_NAME_DIGEST_LENGTH = 12;

export function digestBytes(bytes: Uint8Array): string {
  return createHash(IMAGE_DIGEST_ALGORITHM).update(bytes).digest("hex");
}

// What a file on disk is worth remembering: how long it is and what it hashes
// to. Read through the caller's buffer — one per walk, reused for every file —
// so what inspecting a tree costs does not depend on what the tree weighs. That
// buffer is the caller's to keep to itself: two reads sharing one would read
// each other's bytes.
export async function digestHandle(
  handle: FileHandle,
  buffer: Buffer,
): Promise<{ size: number; digest: string }> {
  const hash = createHash(IMAGE_DIGEST_ALGORITHM);
  let size = 0;

  for (;;) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    size += bytesRead;
  }

  return { size, digest: hash.digest("hex") };
}
