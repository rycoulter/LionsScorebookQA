import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const renderSeasonStats = functionBody(appJs, "renderSeasonStats");
const mobileStatPill = functionBody(appJs, "mobileStatPill");
const mobileLeaderMap = functionBody(appJs, "mobileLeaderMap");
const mobileHittingLeaderMap = functionBody(appJs, "mobileHittingLeaderMap");
const mobilePitchingLeaderMap = functionBody(appJs, "mobilePitchingLeaderMap");

assert.match(renderSeasonStats, /const allMobileHittingRows = mobileHitGameFilter === "all"[\s\S]*getMobileHittingRows\("all", mobileHitGameFilter\)/, "mobile hitting rows should be calculated from the selected game context");
assert.match(renderSeasonStats, /mobileHittingLeaderMap\(\s*allMobileHittingRows,\s*mobileLeaderMinimumGames\s*\)/, "mobile hitting leaders should use the selected-context row set");
assert.match(renderSeasonStats, /const allMobilePitchingRows = mobilePitGameFilter === "all"[\s\S]*getMobilePitchingRows\("all", mobilePitGameFilter\)/, "mobile pitching rows should be calculated from the selected game context");
assert.match(renderSeasonStats, /mobilePitchingLeaderMap\(\s*allMobilePitchingRows,\s*mobilePitchingLeaderMinimumGames\s*\)/, "mobile pitching leaders should use the selected-context row set");
assert.match(renderSeasonStats, /mobileStatPill\("AVG"[\s\S]*mobileStatIsLeader\(mobileHittingLeaders, "avg", player\.id\)/, "AVG labels should highlight when a player leads or ties");
assert.match(renderSeasonStats, /mobileStatPill\("K", hit\.k[\s\S]*mobileStatIsLeader\(mobileHittingLeaders, "k", player\.id\)/, "hitter K labels should use leader highlighting");
assert.match(renderSeasonStats, /mobileStatPill\("ERA"[\s\S]*mobileStatIsLeader\(mobilePitchingLeaders, "era", player\.id\)/, "ERA labels should highlight when a pitcher leads or ties");
assert.match(renderSeasonStats, /mobileStatPill\("BB%"[\s\S]*mobileStatIsLeader\(mobilePitchingLeaders, "bbRate", player\.id\)/, "pitching BB% labels should use leader highlighting");

assert.match(mobileStatPill, /isLeader = false/, "mobileStatPill should default to a non-leader pill");
assert.match(mobileStatPill, /stats-mobile-pill\$\{isLeader \? " is-leader" : ""\}/, "leader pills should receive a dedicated class");
assert.match(mobileLeaderMap, /new Set\(/, "leader map should track all tied leader player ids");
assert.match(mobileLeaderMap, /Math\.abs\(item\.value - best\) <= 0\.0000001/, "leader map should allow exact/tolerant ties");
assert.match(mobileHittingLeaderMap, /key: "k"[\s\S]*lowWins: true/, "hitter strikeout leaders should treat lower as better");
assert.match(mobilePitchingLeaderMap, /key: "era"[\s\S]*lowWins: true/, "pitching ERA leaders should treat lower as better");
assert.match(mobilePitchingLeaderMap, /key: "bbRate"[\s\S]*lowWins: true/, "pitching BB% leaders should treat lower as better");
assert.match(mobileHittingLeaderMap, /statLeaderEligible\(row, minimumGames\)/, "mobile hitting highlights should honor the season games-played qualifier");
assert.match(mobilePitchingLeaderMap, /statLeaderEligible\(row, minimumGames\)/, "mobile pitching highlights should honor the season appearance qualifier");
assert.match(stylesCss, /\.stats-mobile-pill\.is-leader small[\s\S]*color: var\(--lion-gold\)/, "leader stat labels should render gold on mobile cards");

console.log("Mobile stat leader highlight checks passed.");
