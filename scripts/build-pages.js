import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const excludedDirectories = new Set([
  ".git",
  ".wrangler",
  "dashboard",
  "dist",
  "functions",
  "migrations",
  "node_modules",
  "scripts",
  "tests"
]);
const excludedFiles = new Set([
  ".assetsignore",
  ".dev.vars.example",
  ".gitignore",
  "_worker.bundle",
  "package-lock.json",
  "package.json",
  "README.md",
  "wrangler.jsonc"
]);

async function copyPublicFiles(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    if (entry.isFile() && excludedFiles.has(entry.name)) continue;

    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyPublicFiles(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await cp(sourcePath, destinationPath);
    }
  }
}

await rm(output, { recursive: true, force: true });
await copyPublicFiles(root, output);
console.log(`Built public Pages assets in ${path.relative(root, output)} (local dashboard excluded).`);
