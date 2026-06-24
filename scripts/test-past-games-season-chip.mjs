import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

assert.match(indexHtml, /data-view="archive"[\s\S]*?<span class="tab-label">Past Games<\/span>/, "Desktop navigation should label the archive as Past Games");
assert.match(indexHtml, /id="archiveView"[\s\S]*?<p class="eyebrow">Past Games<\/p>[\s\S]*?<h2>Past Games<\/h2>/, "Archive page heading should read Past Games");
assert.match(indexHtml, /data-view="archive"[\s\S]*?<span>Past Games<\/span>/, "Mobile navigation should label the archive as Past Games");
assert.doesNotMatch(indexHtml, />Game Archive</, "Visible page labels should no longer say Game Archive");

["scheduleSeasonSelect", "statsSeasonSelect", "archiveSeasonSelect"].forEach((id) => {
  const pattern = new RegExp(`schedule-season-chip-label">2026 Season<\\/span>\\s*<select id="${id}" class="schedule-season-select"`);
  assert.match(indexHtml, pattern, `${id} should have a visible chip label beneath the full-size native select`);
});

assert.match(stylesCss, /\.schedule-season-select \{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*opacity: 0;/, "The season select should cover the entire visual chip");
assert.match(stylesCss, /\.schedule-season-chip:focus-within[\s\S]*border-color:/, "The full season chip should retain a visible keyboard focus state");
assert.match(appJs, /function syncSeasonChipLabel\(select\)/, "Season chips should synchronize their visible selected value");
assert.match(appJs, /syncSeasonChipLabel\(els\.scheduleSeasonSelect\)/, "Schedule season should update its chip label");
assert.match(appJs, /syncSeasonChipLabel\(els\.statsSeasonSelect\)/, "Stats season should update its chip label");
assert.match(appJs, /syncSeasonChipLabel\(els\.archiveSeasonSelect\)/, "Past Games season should update its chip label");

console.log("Past Games and season chip checks passed.");
