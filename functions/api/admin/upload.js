import { fail, json, isAdmin } from "../../_lib/api.js";

// --- Configuration ---------------------------------------------------------

// Overall upload cap. Streaming means this is memory-safe (see below).
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

// R2 multipart requires every part except the last to be >= 5 MB.
// We flush each part at exactly 5 MB, so memory stays bounded regardless of
// the total file size (no full-file buffer => no Worker OOM).
const PART_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EXTENSIONS = new Set([
  ".zip", ".7z", ".rar", ".tar", ".gz", ".tgz",
  ".exe", ".msi", ".dmg", ".appimage", ".deb", ".rpm",
  ".pdf", ".txt"
]);

// Anything that can run in a browser context must never be served as-is.
const BLOCKED_EXTENSIONS = new Set([".html", ".htm", ".js", ".mjs", ".css", ".svg", ".xml", ".json"]);

// --- Helpers (exported for unit tests) -------------------------------------

export function sanitizeFilename(name) {
  const base = String(name || "")
    .replace(/["'\\]/g, "_") // never allow quotes or backslashes in a header token
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(-120);
  return base || "file.bin";
}

export function extensionOf(name) {
  const m = String(name || "").toLowerCase().match(/(\.[a-z0-9]{1,8})$/);
  return m ? m[1] : "";
}

export function isAllowedExtension(ext) {
  if (!ext) return true; // no extension -> allowed (content sniffed as octet-stream)
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Streams the request body into R2 via multipart upload. Never holds more than
 * one part (~5 MB) plus the current chunk in memory, so an upload near the
 * MAX_UPLOAD_BYTES cap cannot crash the Worker. If the body exceeds `cap`, the
 * multipart upload is aborted and an error is thrown (mapped to a 413 by the
 * handler).
 */
export async function streamToR2(bucket, key, request, cap, httpMetadata, customMetadata) {
  if (!request.body) throw new Error("Upload body is missing.");

  const multipart = await bucket.createMultipartUpload(key, { httpMetadata, customMetadata });
  const reader = request.body.getReader();

  let partNumber = 1;
  let total = 0;
  let partParts = [];
  let partLen = 0;

  const flushPart = async () => {
    if (partLen === 0) return;
    const data = new Uint8Array(partLen);
    let offset = 0;
    for (const part of partParts) {
      data.set(part, offset);
      offset += part.byteLength;
    }
    partParts = [];
    partLen = 0;
    await multipart.uploadPart(partNumber++, data);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new Error("File exceeds maximum upload size.");
      partParts.push(value);
      partLen += value.byteLength;
      if (partLen >= PART_BYTES) await flushPart();
    }

    if (total === 0) throw new Error("Upload is empty.");

    await flushPart(); // final (possibly < 5 MB) part
    await multipart.complete();
    return { size: total };
  } catch (error) {
    await multipart.abort().catch(() => {});
    throw error;
  }
}

// --- Handler ---------------------------------------------------------------

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!(await isAdmin(request, env))) {
      return fail("Sign in as the site administrator to continue.", 401);
    }
    const origin = request.headers.get("origin");
    if (origin !== new URL(request.url).origin) {
      return fail("Cross-origin requests are not allowed.", 400);
    }

    const filename = sanitizeFilename(request.headers.get("x-file-name") || "");
    const ext = extensionOf(filename);
    if (!isAllowedExtension(ext)) {
      return fail(ext ? `File type "${ext}" is not allowed.` : "This file type is not allowed.", 400);
    }

    // Optional integrity hash supplied by the client. The server streams, so it
    // does not buffer the whole file to compute this itself.
    const clientSha = (request.headers.get("x-sha256") || "").toLowerCase();
    const sha256 = /^[a-f0-9]{64}$/.test(clientSha) ? clientSha : "";

    const contentType = request.headers.get("content-type") || "application/octet-stream";
    const key = `uploads/${crypto.randomUUID()}${ext}`;

    const { size } = await streamToR2(
      env.GAMES,
      key,
      request,
      MAX_UPLOAD_BYTES,
      { contentType },
      { filename, sha256 }
    );

    return json({
      url: `/api/files/${key}`,
      key,
      filename,
      size,
      sha256,
      contentType
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    if (message.includes("upload size")) return fail(message, 413);
    return fail(message, 400);
  }
}
