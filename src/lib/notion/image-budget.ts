import { MAX_IMAGE_BYTES } from "./images";

// What one run is allowed to hold in memory at once.
//
// The sync downloads every image a post references while its signed URL is
// still valid, keeps the bytes, and only writes anything once the whole desired
// set has been planned against what is on disk. That order is not incidental:
// `--check` has to be able to answer "would this run change anything?" without
// changing anything, and an image plan computed halfway through a run is not an
// answer. So the bytes are held, and the run's peak memory used to be whatever
// the blog happened to weigh.
//
// One image is capped at 10 MB (see images.ts). A hundred posts carrying ten
// each is 10 GB of retained `Uint8Array` on a runner with a few, and the way
// that ends is not an error message: the process is killed mid-run, having
// written nothing, and the next scheduled tick starts behind it.
//
// So the run has a ceiling, spent per byte and per file:
//
//   * 256 MiB, which is twenty-five whole images at the per-image cap and far
//     more than the site's own images weigh, while leaving a GitHub-hosted
//     runner (7 GB, and a Node heap well under that) room for everything else
//     the run does — the block trees, the rendered markdown, the plan.
//   * 512 files, because bytes alone do not bound what the write phase then
//     does with them: every one is hashed, planned and written individually.
//
// Both are constants rather than settings. A blog that legitimately outgrows
// them needs the run to stream to disk instead, which is a different design and
// a different `--check`; a blog that hits them by accident has a runaway page,
// and a message naming the post is the useful outcome either way.
export const MAX_RUN_IMAGE_BYTES = 256 * 1024 * 1024;
export const MAX_RUN_IMAGE_COUNT = 512;

export class ImageBudgetError extends Error {
  constructor(detail: string) {
    super(`image memory budget exceeded: ${detail}`);
    this.name = "ImageBudgetError";
  }
}

export type ImageBudgetOptions = {
  maxBytes?: number;
  maxCount?: number;
};

// One post's claim on the run's budget.
//
// A post is published with all of its images or with none of them, so its bytes
// are provisional until the post has rendered: a post that fails — an image
// that would not download, a body that would not render, an image that would
// not fit — never kept them and gives every one of them back. Only `commit`
// makes them the run's.
export class ImageReservation {
  private bytes = 0;
  private count = 0;
  private settled = false;

  constructor(private readonly budget: ImageBudget) {}

  // Refuses before a download starts where the run cannot hold another file at
  // all. Nothing is spent on fetching bytes there is provably no room to keep.
  room(): void {
    this.budget.roomForAnother();
  }

  // Accounts exactly `bytes` for one more file. Synchronous from check to
  // commit, so two posts cannot both be told there is room for the last
  // megabyte — the accounting holds if this is ever called from a pool rather
  // than from the sequential loop it is called from today.
  take(bytes: number): void {
    this.budget.spend(bytes);
    this.bytes += bytes;
    this.count += 1;
  }

  // The post rendered: its bytes are in the run's image set and stay accounted
  // until the run ends.
  commit(): void {
    this.settled = true;
  }

  // The post did not render. Idempotent, and a no-op after a commit, so it can
  // sit in a `finally` beside one.
  release(): void {
    if (this.settled) return;
    this.settled = true;
    this.budget.refund(this.bytes, this.count);
    this.bytes = 0;
    this.count = 0;
  }
}

export class ImageBudget {
  readonly maxBytes: number;
  readonly maxCount: number;
  private held = 0;
  private files = 0;

  constructor({
    maxBytes = MAX_RUN_IMAGE_BYTES,
    maxCount = MAX_RUN_IMAGE_COUNT,
  }: ImageBudgetOptions = {}) {
    this.maxBytes = maxBytes;
    this.maxCount = maxCount;
  }

  get bytes(): number {
    return this.held;
  }

  get count(): number {
    return this.files;
  }

  open(): ImageReservation {
    return new ImageReservation(this);
  }

  // Neither message names a url or a slug: this reaches a terminal and a public
  // Actions log, and the caller already says which post it was rendering.
  roomForAnother(): void {
    if (this.files >= this.maxCount) {
      throw new ImageBudgetError(
        `this run already holds ${this.files} image(s), which is all it may ` +
          `hold (${this.maxCount})`,
      );
    }
  }

  spend(bytes: number): void {
    this.roomForAnother();
    if (this.held + bytes > this.maxBytes) {
      throw new ImageBudgetError(
        `this run already holds ${this.held} byte(s) of images and this one ` +
          `adds ${bytes}, which is past the ${this.maxBytes} one run may hold`,
      );
    }
    this.held += bytes;
    this.files += 1;
  }

  refund(bytes: number, count: number): void {
    this.held -= bytes;
    this.files -= count;
  }
}

// The most a run can be holding at the moment a budget refuses: everything it
// has been allowed to keep, plus the one image that has just been read and is
// about to be refused. Stated so the ceiling above can be reasoned about
// against a runner's memory rather than guessed at.
export const PEAK_RUN_IMAGE_BYTES = MAX_RUN_IMAGE_BYTES + MAX_IMAGE_BYTES;
