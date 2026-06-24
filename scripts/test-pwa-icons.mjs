import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(rootDir, "manifest.json"), "utf8"));
const serviceWorker = readFileSync(join(rootDir, "service-worker.js"), "utf8");

function pngSize(relativePath) {
  const bytes = readFileSync(join(rootDir, relativePath));
  assert.equal(bytes.toString("ascii", 1, 4), "PNG", `${relativePath} should be a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

assert.match(indexHtml, /rel="icon" href="favicon\.ico\?v=\d{4}\.\d{2}\.\d{2}-build-\d+"/, "Desktop favicon should be linked");
assert.match(indexHtml, /sizes="32x32" href="assets\/icons\/favicon-32\.png\?v=\d{4}\.\d{2}\.\d{2}-build-\d+"/, "32px favicon should be linked");
assert.match(indexHtml, /sizes="48x48" href="assets\/icons\/favicon-48\.png\?v=\d{4}\.\d{2}\.\d{2}-build-\d+"/, "48px favicon should be linked");
assert.match(indexHtml, /rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon\.png\?v=\d{4}\.\d{2}\.\d{2}-build-\d+"/, "Apple touch icon should be linked");

assert.deepEqual(manifest.icons.map((icon) => icon.src), ["icon-192.png", "icon-512.png"], "Manifest should keep the PWA install icons");
assert.deepEqual(pngSize("assets/icons/favicon-32.png"), { width: 32, height: 32 }, "32px favicon should be 32x32");
assert.deepEqual(pngSize("assets/icons/favicon-48.png"), { width: 48, height: 48 }, "48px favicon should be 48x48");
assert.deepEqual(pngSize("assets/icons/apple-touch-icon.png"), { width: 180, height: 180 }, "Apple touch icon should be 180x180");
assert.deepEqual(pngSize("icon-192.png"), { width: 192, height: 192 }, "PWA 192 icon should be 192x192");
assert.deepEqual(pngSize("icon-512.png"), { width: 512, height: 512 }, "PWA 512 icon should be 512x512");
assert.equal(existsSync(join(rootDir, "favicon.ico")), true, "ICO favicon should exist");

for (const path of ["./favicon.ico", "./icon-192.png", "./icon-512.png", "./assets/icons/favicon-32.png", "./assets/icons/favicon-48.png", "./assets/icons/apple-touch-icon.png"]) {
  assert.match(serviceWorker, new RegExp(path.replace(/[./]/g, "\\$&")), `${path} should be cached by the service worker`);
}

console.log("PWA icon checks passed.");
