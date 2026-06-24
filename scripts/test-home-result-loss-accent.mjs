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

const lossLionsScoreRule = stylesCss.match(/\.home-recent-result-card-loss \.home-recent-result-score-lions\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(lossLionsScoreRule, /color:\s*#ef4444/, "Lions score should be red when the Lions lose");
assert.match(lossLionsScoreRule, /text-shadow:/, "Lions loss score should keep the subtle red emphasis");

const lossOpponentScoreRule = stylesCss.match(/\.home-recent-result-card-loss \.home-recent-result-score-opponent\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(lossOpponentScoreRule, /color:\s*rgba\(255,\s*255,\s*255,\s*0\.72\)/, "Opponent score should remain muted gray when the Lions lose");
assert.match(lossOpponentScoreRule, /text-shadow:\s*none/, "Opponent score should not retain a red loss glow");

console.log("Homepage loss accent checks passed.");
