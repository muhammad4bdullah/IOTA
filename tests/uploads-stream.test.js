import test from "node:test";
import assert from "node:assert/strict";
import { streamToR2 } from "../functions/api/admin/upload.js";

function makeBucket() {
  const state = { parts: [], completed: false, aborted: false };
  const multipart = {
    async uploadPart(n, data) {
      state.parts.push([n, data.byteLength]);
    },
    async complete() {
      state.completed = true;
    },
    async abort() {
      state.aborted = true;
    }
  };
  return {
    state,
    async createMultipartUpload() {
      return multipart;
    }
  };
}

// Emulates real network delivery: the body arrives as many small chunks, not
// one giant in-memory buffer (which is what an actual HTTP request looks like).
function requestWithBody(size, chunkSize = 1024 * 1024) {
  const stream = new ReadableStream({
    start(controller) {
      const chunk = new Uint8Array(chunkSize).fill(7);
      let remaining = size;
      while (remaining > 0) {
        const n = Math.min(remaining, chunkSize);
        controller.enqueue(n === chunkSize ? chunk : chunk.subarray(0, n));
        remaining -= n;
      }
      controller.close();
    }
  });
  return new Request("https://iota.example/api/admin/upload", {
    method: "POST",
    body: stream,
    duplex: "half"
  });
}

test("streams a large upload to R2 in bounded parts", async () => {
  const bucket = makeBucket();
  const size = 11 * 1024 * 1024; // 11 MB -> parts of 5 + 5 + 1 MB
  const res = await streamToR2(
    bucket,
    "uploads/k.zip",
    requestWithBody(size),
    200 * 1024 * 1024,
    {},
    {}
  );

  assert.equal(res.size, size);
  assert.equal(bucket.state.completed, true);
  assert.equal(bucket.state.aborted, false);
  assert.equal(bucket.state.parts.length, 3);
  assert.deepEqual(
    bucket.state.parts.map((p) => p[1]),
    [5 * 1024 * 1024, 5 * 1024 * 1024, 1 * 1024 * 1024]
  );
});

test("aborts multipart and throws when the body exceeds the cap", async () => {
  const bucket = makeBucket();
  await assert.rejects(
    () => streamToR2(bucket, "uploads/k.zip", requestWithBody(2000), 1000, {}, {}),
    /maximum upload size/
  );
  assert.equal(bucket.state.aborted, true);
  assert.equal(bucket.state.completed, false);
});

test("throws on an empty body and aborts", async () => {
  const bucket = makeBucket();
  await assert.rejects(
    () =>
      streamToR2(bucket, "uploads/k.zip", requestWithBody(0), 200 * 1024 * 1024, {}, {}),
    /Upload is empty/
  );
  assert.equal(bucket.state.aborted, true);
});
