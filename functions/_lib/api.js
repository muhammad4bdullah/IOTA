const encoder = new TextEncoder();
const SESSION_COOKIE = "iota_admin";
const SESSION_SECONDS = 12 * 60 * 60;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request, maxBytes = 32_000) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("Request body is too large.");
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new Error("Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function readCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  const prefix = `${name}=`;
  const item = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}

export async function createSession(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expiresAt}.${crypto.randomUUID()}`;
  const token = `${bytesToBase64Url(encoder.encode(payload))}.${bytesToBase64Url(await hmac(env.SESSION_SECRET, payload))}`;
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export async function isAdmin(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = readCookie(request, SESSION_COOKIE);
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return false;

  try {
    const payload = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    const [expiresAt, nonce, rest] = payload.split(".");
    if (!expiresAt || !nonce || rest || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", key, base64UrlToBytes(encodedSignature), encoder.encode(payload));
  } catch {
    return false;
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function addressHash(request, secret) {
  const address = request.headers.get("cf-connecting-ip") || "unknown";
  return bytesToBase64Url(await hmac(secret, address));
}

export function safeId(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

export function normalizeGame(input) {
  const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
  const list = value => Array.isArray(value) && value.length > 0 && value.length <= 12 &&
    value.every(item => typeof item === "string" && item.trim().length > 0 && item.trim().length <= 32);

  if (!input || typeof input !== "object" || !safeId(input.id)) throw new Error("Game ID is invalid.");
  if (!text(input.title, 80) || !text(input.developer, 80) || !text(input.description, 400)) throw new Error("Title, developer, or description is invalid.");
  if (!list(input.genre) || !list(input.platforms)) throw new Error("Add at least one valid genre and platform.");
  if (!text(input.version, 40) || typeof input.releaseDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.releaseDate)) throw new Error("Version or release date is invalid.");
  if (input.price !== 0) throw new Error("This storefront is configured for free games only.");
  if (typeof input.published !== "boolean" || typeof input.rightsConfirmed !== "boolean") throw new Error("Publication and rights confirmation are required.");
  const license = input.license === undefined ? "" : input.license;
  if (typeof license !== "string" || license.trim().length > 500) throw new Error("Internal notes must be 500 characters or fewer.");
  if (!input.rightsConfirmed) throw new Error("Confirm you have the rights needed to publish this game.");

  let coverImage = "";
  if (input.coverImage) {
    let url;
    try {
      url = new URL(input.coverImage);
    } catch {
      throw new Error("Cover image must be a valid HTTPS URL.");
    }
    if (url.protocol !== "https:") throw new Error("Cover image must use HTTPS.");
    coverImage = url.href;
  }

  const sha256 = input.sha256 || "";
  if (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("SHA-256 must contain exactly 64 hexadecimal characters.");
  const fileUrl = normalizeExternalFileUrl(input.fileUrl || "");

  return {
    id: input.id,
    title: input.title.trim(),
    developer: input.developer.trim(),
    description: input.description.trim(),
    genre: input.genre.map(value => value.trim()),
    platforms: input.platforms.map(value => value.trim()),
    version: input.version.trim(),
    releaseDate: input.releaseDate,
    price: 0,
    coverImage,
    fileUrl,
    published: input.published,
    license: license.trim(),
    rightsConfirmed: input.rightsConfirmed,
    sha256: sha256.toLowerCase()
  };
}

export function normalizeExternalFileUrl(value) {
  if (value === "") return "";
  if (typeof value !== "string" || value.length > 2_048) throw new Error("Download URL is invalid.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Download URL must be a valid HTTPS link.");
  }

  const hostname = url.hostname.toLowerCase();
  const isSupportedHost = hostname === "fileditch.com" ||
    hostname.endsWith(".fileditch.com") ||
    hostname === "fileditchhot.st" ||
    hostname === "itsfileditchfiles.st" ||
    hostname === "fileditchfiles.st" ||
    hostname === "fileditchvids.st";
  if (url.protocol !== "https:" || !isSupportedHost || url.username || url.password || url.port) {
    throw new Error("Use a secure link from the configured download host.");
  }
  return url.href;
}

export function mapGame(row, admin = false) {
  const game = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    developer: row.developer,
    description: row.description,
    genre: JSON.parse(row.genres),
    platforms: JSON.parse(row.platforms),
    version: row.version,
    releaseDate: row.release_date,
    fileSizeLabel: row.file_url ? "External host" : "Not uploaded",
    coverImage: row.cover_image || "",
    price: 0,
    rating: 0,
    featured: false,
    published: Boolean(row.published),
    hasFile: Boolean(row.file_url && row.rights_confirmed),
    sha256: row.sha256 || "",
    downloadCount: Number(row.download_count || 0)
  };
  if (admin) {
    game.rightsConfirmed = Boolean(row.rights_confirmed);
    game.license = row.rights_text || "";
    game.fileUrl = row.file_url || "";
  }
  return game;
}
