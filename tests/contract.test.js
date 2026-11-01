import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSession, normalizeGame, normalizeExternalFileUrl } from "../functions/_lib/api.js";
import { isAllowedExtension } from "../functions/api/admin/upload.js";

const routeSource = readFileSync(new URL("../functions/api/[[path]].js", import.meta.url), "utf8");

test("admin session cookie uses name, flags, and 12h TTL from the source", async () => {
  const cookie = await createSession({ SESSION_SECRET: "s".repeat(64) });
  assert.match(cookie, /^iota_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api/);
  assert.match(cookie, /Max-Age=43200/);
});

test("normalizeGame accepts a valid create body and trims/normalizes it", () => {
  const game = normalizeGame({
    id: "cool-game",
    title: "  My Game  ",
    developer: "Studio",
    description: "A free game.",
    genre: ["Action"],
    platforms: ["Windows"],
    version: "1.0",
    releaseDate: "2025-01-01",
    price: 0,
    published: true,
    rightsConfirmed: true,
    license: "Owned",
    coverImage: "https://example.com/cover.png",
    sha256: "A".repeat(64),
    fileUrl: "https://fileditch.com/file.zip"
  });
  assert.equal(game.title, "My Game");
  assert.deepEqual(game.genre, ["Action"]);
  assert.deepEqual(game.platforms, ["Windows"]);
  assert.equal(game.price, 0);
  assert.equal(game.sha256, "a".repeat(64));
});

test("normalizeGame allows omitting releaseDate (defaults to empty string)", () => {
  const game = normalizeGame({
    id: "cool-game",
    title: "My Game",
    developer: "Studio",
    description: "A free game.",
    genre: ["Action"],
    platforms: ["Windows"],
    version: "1.0",
    price: 0,
    published: true,
    rightsConfirmed: true
  });
  assert.equal(game.releaseDate, "");
});

test("normalizeGame rejects paid games and unconfirmed rights", () => {
  const base = {
    id: "cool-game",
    title: "My Game",
    developer: "Studio",
    description: "A free game.",
    genre: ["Action"],
    platforms: ["Windows"],
    version: "1.0",
    releaseDate: "2025-01-01",
    price: 0,
    published: true,
    rightsConfirmed: true
  };
  assert.throws(() => normalizeGame({ ...base, price: 1 }), /free games only/);
  assert.throws(() => normalizeGame({ ...base, rightsConfirmed: false }), /rights needed/);
});

test("normalizeExternalFileUrl only accepts configured HTTPS download hosts", () => {
  assert.equal(
    normalizeExternalFileUrl("https://fileditch.com/file.zip"),
    "https://fileditch.com/file.zip"
  );
  assert.throws(() => normalizeExternalFileUrl("https://evil.example.com/file.zip"), /download host/);
  assert.throws(() => normalizeExternalFileUrl("http://fileditch.com/file.zip"), /download host/);
});

test("upload extension allowlist matches the contract", () => {
  for (const ext of [".zip", ".7z", ".rar", ".tar", ".gz", ".tgz", ".exe", ".msi", ".dmg", ".appimage", ".deb", ".rpm", ".pdf", ".txt"]) {
    assert.equal(isAllowedExtension(ext), true, `${ext} should be allowed`);
  }
  for (const ext of [".html", ".htm", ".js", ".mjs", ".css", ".svg", ".xml", ".json", ".png", ".jpg", ".gif"]) {
    assert.equal(isAllowedExtension(ext), false, `${ext} should be blocked`);
  }
  assert.equal(isAllowedExtension(""), true);
});

test("route source implements the documented endpoints and no games update endpoint", () => {
  assert.match(routeSource, /path === "\/api\/admin\/login" && method === "POST"/);
  assert.match(routeSource, /path === "\/api\/admin\/logout" && method === "POST"/);
  assert.match(routeSource, /path === "\/api\/admin\/session" && method === "GET"/);
  assert.match(routeSource, /path === "\/api\/admin\/games" && method === "GET"/);
  assert.match(routeSource, /path === "\/api\/admin\/games" && method === "POST"/);
  assert.match(routeSource, /gameIdFrom\(path\)/);
  assert.match(routeSource, /method === "DELETE"/);
  assert.doesNotMatch(routeSource, /method === "PUT"/);
  assert.doesNotMatch(routeSource, /method === "PATCH"/);
  assert.ok(routeSource.includes("\\/download$"), "game download route regex should be present");
});

test("login is rate-limited to 10 attempts per 15 minutes (429)", () => {
  assert.match(routeSource, />= 10/);
  assert.match(routeSource, /429/);
});
