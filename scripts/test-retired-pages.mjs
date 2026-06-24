import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [indexHtml, appJs] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8")
]);

assert.doesNotMatch(indexHtml, /data-view="(?:scouting|analysis)"/, "Retired pages should not remain in desktop navigation");
assert.doesNotMatch(indexHtml, /data-panel="(?:scouting|analysis)"/, "Retired page sections should be removed");
assert.doesNotMatch(appJs, /switchView\("(?:scouting|analysis)"\)/, "Retired pages should have no navigation entry points");
assert.doesNotMatch(appJs, /data-home-scout-opponent|View Scouting Report/, "Homepage scouting actions should be removed");

const archiveCardSource = appJs.match(/function renderArchiveCard\(game\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
assert.ok(archiveCardSource, "Past Games card renderer should remain available");
assert.doesNotMatch(archiveCardSource, /data-game-action="summary"|View Summary/, "Past Games cards should not show View Summary");
assert.match(archiveCardSource, /data-game-action="boxscore"/, "Past Games cards should retain View Box Score");

assert.match(appJs, /if \(nextView === "standings"\) refreshScoutingData/, "Standings should retain the shared league-data refresh");
assert.match(appJs, /if \(els\.refreshScoutingBtn\) els\.refreshScoutingBtn\.disabled = true/, "Shared refresh should tolerate the removed scouting controls");

console.log("Retired page checks passed.");
