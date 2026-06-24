import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(
  indexHtml,
  /<a class="home-next-game-location-link is-disabled" id="homeNextGameLocation" aria-disabled="true">Field location TBD<\/a>/,
  "Next Game location should be rendered as a disabled link until a field is available"
);

const mapUrlBody = functionBody(appJs, "gameLocationMapUrl");
assert.match(mapUrlBody, /gameLocationAddress\(game\) \|\| gameLocationName\(game\)/, "Map links should prefer the stored field address");
assert.match(mapUrlBody, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/, "Field links should open Google Maps");
assert.match(mapUrlBody, /encodeURIComponent\(destination\)/, "Map destinations should be URL encoded");

const renderLocationBody = functionBody(appJs, "syncHomeNextGameLocation");
assert.match(renderLocationBody, /target = "_blank"/, "Map links should open without replacing the scorebook");
assert.match(renderLocationBody, /rel = "noopener noreferrer"/, "External map links should use safe window isolation");
assert.match(renderLocationBody, /aria-label.*Open \$\{label\} in Google Maps/, "Map links should explain their destination accessibly");
assert.match(renderLocationBody, /removeAttribute\("href"\)/, "Missing locations should not retain a stale map link");

const renderHomeBody = functionBody(appJs, "renderHome");
assert.match(renderHomeBody, /syncHomeNextGameLocation\(next\)/, "Upcoming games should render a clickable field location");
assert.match(renderHomeBody, /syncHomeNextGameLocation\(null\)/, "The no-game state should clear the map link");

assert.match(stylesCss, /\.home-next-game-location-link[\s\S]*text-decoration: underline/, "Clickable fields should look interactive");
assert.match(stylesCss, /\.home-next-game-location-link\.is-disabled[\s\S]*pointer-events: none/, "Missing fields should remain non-interactive");

console.log("Home next-game location link checks passed.");
