import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");

assert.doesNotMatch(indexHtml, /id="lineupView"|data-view="lineup"|Lineup Analyzer|Lineup Lab/i, "Lineup Analyzer/Lab should stay removed from the UI");
assert.doesNotMatch(indexHtml, /lineupAnalyzer(GameSelect|LineupRows|PitcherList|PitcherTabs|MatchupBody)/, "Removed Lineup Analyzer controls should not render");

console.log("Lineup Analyzer removal checks passed.");
