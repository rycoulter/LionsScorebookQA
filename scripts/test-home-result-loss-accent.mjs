import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

const lossRule = stylesCss.match(/\.home-recent-result-card-loss\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.ok(lossRule, "Homepage loss cards should have a dedicated accent rule");
assert.match(lossRule, /border-left-color:/, "Loss cards should place the red border on the Lions side");
assert.match(lossRule, /inset 5px 0 0 rgba\(239, 68, 68, 0\.72\)/, "Loss cards should place the red inset accent on the Lions side");
assert.match(lossRule, /-10px 0 28px rgba\(239, 68, 68, 0\.14\)/, "Loss cards should cast the red glow toward the Lions side");
assert.doesNotMatch(lossRule, /border-right-color:|inset -5px|^\s+10px 0 28px/m, "Loss cards should not accent the opponent side");

console.log("Homepage loss accent checks passed.");
