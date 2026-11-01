// Public download route for files uploaded via /api/admin/upload.
//
// This route is intentionally PUBLIC (no auth): the returned URL is what gets
// attached to a game listing so that players can download it without signing in.
// Keys are unguessable UUIDs ("public by obscurity") — bandwidth is the
// trade-off of public downloads (see the README).
//
// XSS hardening:
// - The body is ALWAYS served as application/octet-stream with a forced
//   Content-Disposition: attachment. The browser can therefore never render
//   uploader-supplied bytes inline, so an uploader-controlled content-type
//   cannot become stored XSS on this origin.
// - The filename is re-sanitized here to guarantee no response-header
//   injection (quotes, backslashes, control characters).

// `[[key]]` is a catch-all route, so `context.params.key` comes back as an
// array of the path segments after `/api/files/` (e.g. `["uploads", "uuid.zip"]`
// for `/api/files/uploads/<uuid>.zip`, or `["uuid.zip"]` for a single segment).
// Reconstruct the R2 object key by joining the segments with "/".
export function downloadKey(parts) {
  return Array.isArray(parts) ? parts.join("/") : parts;
}

export async function onRequestGet(context) {
  const { env } = context;

  const key = downloadKey(context.params.key);
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.GAMES.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const rawName = object.customMetadata?.filename || "download.bin";
  const safeName = rawName
    .replace(/[\r\n"\\\x00-\x1f]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_")
    .slice(0, 120);

  const headers = new Headers();
  headers.set("content-type", "application/octet-stream");
  headers.set("content-length", String(object.size));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-robots-tag", "noindex");
  headers.set("content-disposition", `attachment; filename="${safeName}"`);

  return new Response(object.body, { headers });
}
