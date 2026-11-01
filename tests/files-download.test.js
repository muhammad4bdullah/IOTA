import test from "node:test";
import assert from "node:assert/strict";
import { downloadKey } from "../functions/api/files/[[key]].js";

// The `[[key]]` catch-all route returns `context.params.key` as an array of
// path segments. This regression test guards against passing that array
// directly to the R2 lookup (which would comma-join it and never match the
// stored key, e.g. "uploads,<uuid>.zip" instead of "uploads/<uuid>.zip").
test("reconstructs nested R2 key from catch-all segments", () => {
  assert.equal(downloadKey(["uploads", "uuid.zip"]), "uploads/uuid.zip");
  assert.equal(downloadKey(["uploads", "archive", "game.zip"]), "uploads/archive/game.zip");
});

test("handles a single catch-all segment", () => {
  assert.equal(downloadKey(["file.zip"]), "file.zip");
});

test("falls back to a plain string key if not an array", () => {
  assert.equal(downloadKey("file.zip"), "file.zip");
});

test("returns an empty string for no segments so the handler 404s", () => {
  assert.equal(downloadKey([]), "");
});
