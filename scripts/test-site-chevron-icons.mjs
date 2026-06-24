import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexHtml, appJs, stylesCss] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

const visibleMarkup = `${indexHtml}\n${appJs}`;

assert.doesNotMatch(
  visibleMarkup,
  /<span[^>]*aria-hidden="true"[^>]*>\s*(?:<|>|&lt;|&gt;|‹|›)\s*<\/span>/,
  "Visible action arrows should not use text glyphs"
);
[
  "View Full Schedule >",
  "View All Results >",
  "&lt; Back to Schedule",
  "Open Spray Chart &gt;",
  "Open Spray Chart >",
  "View Full List &gt;"
].forEach((legacyLabel) => {
  assert.equal(visibleMarkup.includes(legacyLabel), false, `Legacy text chevron should be removed from "${legacyLabel}"`);
});
assert.match(appJs, /function inlineChevronIcon\(direction = "right", className = ""\)/, "Dynamic controls should share one SVG chevron renderer");
assert.match(visibleMarkup, /class="inline-chevron-icon inline-chevron-icon--right"/, "Right-facing inline SVG chevrons should be present");
assert.match(visibleMarkup, /class="inline-chevron-icon inline-chevron-icon--left"/, "Left-facing inline SVG chevrons should be present");
assert.match(visibleMarkup, /class="inline-chevron-icon-claw"/, "Premium claw accents should be present");
assert.match(stylesCss, /\.inline-chevron-icon\s*\{[\s\S]*transition:/, "Chevron color and motion changes should transition smoothly");
assert.match(stylesCss, /\.schedule-shell-link\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;/, "Schedule links should align SVGs with flexbox");

console.log("Site chevron icon tests passed.");
