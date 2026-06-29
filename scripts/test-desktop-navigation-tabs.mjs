import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexHtml, stylesCss] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

assert.match(indexHtml, /<nav class="tabs" aria-label="Scorebook sections">/, "Desktop navigation should remain a semantic labeled nav");
assert.match(
  stylesCss,
  /@media \(min-width: 1200px\)[\s\S]*\.topbar\s*\{[\s\S]*grid-template-areas:\s*"brand tabs actions"/,
  "Desktop navigation should share one header row with the Lions brand and account controls"
);
assert.match(
  stylesCss,
  /\.topbar \.tab\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;/,
  "Desktop tabs should not look like boxed action buttons"
);
assert.match(
  stylesCss,
  /\.topbar \.tab-label\s*\{[\s\S]*font-size:\s*inherit;/,
  "Wrapped public tab labels should inherit the same font size as plain admin tab labels"
);
assert.doesNotMatch(
  stylesCss,
  /body\[data-access-mode="public"\] \.topbar \.tab\s*\{[\s\S]*font-size:/,
  "Public tabs should not carry a separate desktop font size from admin tabs"
);
assert.match(
  stylesCss,
  /\.topbar \.tab::after\s*\{[\s\S]*background:\s*var\(--lion-gold\);/,
  "Desktop tabs should use a gold active underline"
);
assert.match(
  stylesCss,
  /\.topbar \.tab\.is-active::after\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*scaleX\(1\);/,
  "The selected desktop tab should reveal the underline"
);
assert.match(
  stylesCss,
  /@media \(min-width: 768px\)\s*\{[\s\S]*\.topbar \.tab-icon\s*\{[\s\S]*display:\s*none;/,
  "Desktop and tablet tabs should favor clean text labels"
);
assert.match(
  stylesCss,
  /@media \(min-width: 768px\) and \(max-width: 1199px\)[\s\S]*\.tabs\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*scrollbar-width:\s*none;/,
  "Tablet navigation should remain horizontally accessible without a visible scrollbar"
);
assert.match(
  stylesCss,
  /@media \(min-width: 1200px\)[\s\S]*\.topbar \.tabs\s*\{[\s\S]*justify-content:\s*center;[\s\S]*gap:\s*5px;[\s\S]*overflow-x:\s*auto;[\s\S]*border-top:\s*0;/,
  "Desktop tabs should be centered with consistent spacing and remain overflow-safe"
);
assert.match(
  stylesCss,
  /@media \(max-width: 767px\)[\s\S]*\.tabs\s*\{[\s\S]*display:\s*none;/,
  "Mobile should continue using the bottom navigation instead of desktop tabs"
);

console.log("Desktop navigation tab checks passed.");
