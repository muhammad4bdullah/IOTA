import test from "node:test";
import assert from "node:assert/strict";
import {
  extensionOf,
  isAllowedExtension,
  sanitizeFilename
} from "../functions/api/admin/upload.js";

test("sanitizes filenames", () => {
  assert.equal(sanitizeFilename("My Game 1.zip"), "My_Game_1.zip");
  assert.equal(sanitizeFilename("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(sanitizeFilename('foo"bar\\baz.txt'), "foo_bar_baz.txt");
  assert.equal(sanitizeFilename('a"b\'c\\d'), "a_b_c_d");
  assert.equal(sanitizeFilename(""), "file.bin");
  assert.equal(sanitizeFilename("a".repeat(200) + ".zip").length, 120);
});

test("detects file extensions case-insensitively", () => {
  assert.equal(extensionOf("game.ZIP"), ".zip");
  assert.equal(extensionOf("archive.tar.gz"), ".gz");
  assert.equal(extensionOf("noext"), "");
});

test("allows/denies extensions", () => {
  assert.equal(isAllowedExtension(".zip"), true);
  assert.equal(isAllowedExtension(".7z"), true);
  assert.equal(isAllowedExtension(".html"), false);
  assert.equal(isAllowedExtension(".js"), false);
  assert.equal(isAllowedExtension(".svg"), false);
  assert.equal(isAllowedExtension(".png"), false);
  assert.equal(isAllowedExtension(""), true);
});
