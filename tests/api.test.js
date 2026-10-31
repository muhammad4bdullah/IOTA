import test from "node:test";
import assert from "node:assert/strict";
import {
  createSession,
  isAdmin,
  mapGame,
  normalizeExternalFileUrl,
  normalizeGame
} from "../functions/_lib/api.js";

const validGame = {
  id: "my-game",
  title: "My Game",
  developer: "Studio",
  description: "A game I own.",
  genre: ["Indie"],
  platforms: ["Windows"],
  version: "1.0.0",
  releaseDate: "2026-10-31",
  coverImage: "https://example.com/cover.jpg",
  published: false,
  price: 0,
  license: "",
  rightsConfirmed: true
};

test("validates free game listings and normalizes user-provided text", () => {
  const game = normalizeGame({ ...validGame, title: "  My Game  ", sha256: "A".repeat(64) });
  assert.equal(game.title, "My Game");
  assert.equal(game.sha256, "a".repeat(64));
  assert.equal(game.price, 0);
});

test("rejects paid games and listings without rights confirmation", () => {
  assert.throws(() => normalizeGame({ ...validGame, price: 1 }), /free games only/);
  assert.throws(() => normalizeGame({ ...validGame, rightsConfirmed: false }), /Confirm you have the rights needed/);
});

test("rejects insecure cover URLs and malformed checksums", () => {
  assert.throws(() => normalizeGame({ ...validGame, coverImage: "http://example.com/cover.jpg" }), /HTTPS/);
  assert.throws(() => normalizeGame({ ...validGame, sha256: "bad" }), /64 hexadecimal/);
});

test("accepts supported HTTPS download links and rejects other hosts", () => {
  assert.equal(normalizeExternalFileUrl("https://new.fileditch.com/file/abc"), "https://new.fileditch.com/file/abc");
  assert.equal(normalizeExternalFileUrl("https://fileditchhot.st/abc"), "https://fileditchhot.st/abc");
  assert.equal(normalizeExternalFileUrl("https://itsfileditchfiles.st/abc/game.zip"), "https://itsfileditchfiles.st/abc/game.zip");
  assert.equal(normalizeGame({ ...validGame, fileUrl: "https://new.fileditch.com/file/abc" }).fileUrl, "https://new.fileditch.com/file/abc");
  assert.throws(() => normalizeExternalFileUrl("http://fileditch.com/file/abc"), /secure link from the configured/);
  assert.throws(() => normalizeExternalFileUrl("https://fileditch.com.example.org/file/abc"), /secure link from the configured/);
  assert.throws(() => normalizeExternalFileUrl("https://example.org/file/abc"), /secure link from the configured/);
});

test("maps external file links without exposing them in public catalog data", () => {
  const row = {
    id: "my-game", slug: "my-game", title: "My Game", developer: "Studio", description: "Game",
    genres: '["Indie"]', platforms: '["Windows"]', version: "1.0.0", release_date: "2026-10-31",
    file_url: "https://new.fileditch.com/file/abc", cover_image: "",
    published: 1, rights_confirmed: 1, rights_text: "Owned", sha256: "", download_count: 7
  };
  const publicGame = mapGame(row);
  const adminGame = mapGame(row, true);
  assert.equal(publicGame.hasFile, true);
  assert.equal(publicGame.fileSizeLabel, "External host");
  assert.equal(publicGame.downloadCount, 7);
  assert.equal("fileUrl" in publicGame, false);
  assert.equal(adminGame.license, "Owned");
  assert.equal(adminGame.fileUrl, row.file_url);
});

test("creates verifiable short-lived admin sessions and rejects tampering", async () => {
  const env = { SESSION_SECRET: "a-secure-test-secret-with-at-least-32-characters" };
  const cookie = await createSession(env);
  const token = cookie.split(";")[0];
  const request = new Request("https://iota.example/api/admin/session", { headers: { cookie: token } });
  assert.equal(await isAdmin(request, env), true);
  const tampered = new Request("https://iota.example/api/admin/session", { headers: { cookie: `${token.slice(0, -1)}x` } });
  assert.equal(await isAdmin(tampered, env), false);
});
