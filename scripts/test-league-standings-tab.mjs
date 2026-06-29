import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");
const refreshScript = readFileSync(join(rootDir, "scripts", "refresh-league-standings.mjs"), "utf8");
const workflow = readFileSync(join(rootDir, ".github", "workflows", "refresh-league-standings.yml"), "utf8");
const standingsJson = JSON.parse(readFileSync(join(rootDir, "data", "league-standings.json"), "utf8"));
const standingsCacheScript = readFileSync(join(rootDir, "data", "league-standings-cache.js"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(indexHtml, /data-view="standings"/, "Standings should be a public tab");
assert.match(indexHtml, /id="standingsView" data-panel="standings"/, "Standings should have its own view");
assert.match(indexHtml, /id="leagueStandingsBody"/, "Standings view should render table rows");
assert.match(indexHtml, /id="homeLeagueStanding"/, "Home overview should show league standing");
assert.match(indexHtml, /id="homeCurrentStreak"/, "Home overview should show current streak");
assert.doesNotMatch(indexHtml, /home-overview-trophy/, "Home overview should not show the trophy icon next to the season label");
assert.doesNotMatch(indexHtml, /id="homeRunsScored"/, "Home overview should no longer show runs scored");
assert.doesNotMatch(indexHtml, /id="homeRunsAllowed"/, "Home overview should no longer show runs allowed");
assert.doesNotMatch(indexHtml, /home-standings-panel/, "Home should not own the standings card");
assert.match(appJs, /PUBLIC_TAB_VIEWS = new Set\(\["home", "news", "standings"/, "Standings should be public");
assert.match(appJs, /LEAGUE_STANDINGS_CACHE_URL = "data\/league-standings\.json"/, "App should load the static standings cache");
const renderHomeBody = functionBody(appJs, "renderHome");
assert.match(renderHomeBody, /seasonRecord\(\)[\s\S]*formatWinPctDisplay/, "Home overview win percentage should be calculated from local completed games");
assert.match(renderHomeBody, /homeCurrentStreak\)[\s\S]*localCurrentStreakLabel\(\)/, "Home overview streak should be calculated from local completed games");
assert.match(renderHomeBody, /homeLeagueStanding[\s\S]*classList\.remove\("is-standing-gold", "is-standing-silver", "is-standing-bronze"\)[\s\S]*overview\.tierClass/, "Home overview standing should receive medal tier classes");
assert.match(renderHomeBody, /const tierClass = isLions \? standingsMedalClass\(index \+ 1\)/, "Home standings board should medal-format the Lions row when ranked top three");
const homeOverviewBody = functionBody(appJs, "homeOverviewLeagueSummary");
assert.match(homeOverviewBody, /leagueStandingRowsForOverview[\s\S]*ordinalSuffix/, "Home overview league standing should come from standings data");
assert.match(homeOverviewBody, /tierClass: standingsMedalClass\(rank\)/, "Home overview league standing should expose its medal tier");
assert.doesNotMatch(homeOverviewBody, /shortStreakLabel|row\.streak|localCurrentStreakLabel/, "Home overview standing summary should not source streak from league standings");
assert.match(functionBody(appJs, "standingsMedalClass"), /numericRank === 1[\s\S]*is-standing-gold[\s\S]*numericRank === 2[\s\S]*is-standing-silver[\s\S]*numericRank === 3[\s\S]*is-standing-bronze/, "Standings medal helper should map first, second, and third place");
assert.match(functionBody(appJs, "renderLeagueStandingsRow"), /const tierClass = isLions \? standingsMedalClass\(row\.rank\)/, "Full standings table should medal-format the Lions row when ranked top three");
assert.match(functionBody(appJs, "shortStreakLabel"), /Won[\s\S]*Lost[\s\S]*formatCurrentStreakLabel\(prefix, match\[2\]\)/, "Home overview streak should abbreviate Won/Lost labels");
assert.match(functionBody(appJs, "formatCurrentStreakLabel"), /safeCount >= 3[\s\S]*🔥[\s\S]*safeCount >= 3[\s\S]*🧊/u, "Home overview should add fire/ice emoji for 3+ win/loss streaks");
assert.match(functionBody(appJs, "fetchStaticLeagueStandingsCache"), /ScorebookLeagueStandingsCache[\s\S]*fetch/, "App should use the script cache before fetch for local file opens");
assert.match(functionBody(appJs, "refreshScoutingData"), /fetchStaticLeagueStandingsCache[\s\S]*setLeagueStandingsCache/, "Refresh should load the static standings cache");
assert.match(functionBody(appJs, "parseAaStandingsFromHtml"), /standingsTable[\s\S]*activeDivision !== "AA"[\s\S]*pointsLabel/, "Parser should read the official standings table");
assert.match(stylesCss, /\.standings-panel[\s\S]*\.standings-table/, "Standings tab should have themed table styles");
assert.doesNotMatch(stylesCss, /home-overview-trophy/, "Unused trophy CSS should be removed");
assert.match(stylesCss, /\.home-overview-stat strong\.is-standing-gold[\s\S]*\.home-overview-stat strong\.is-standing-silver[\s\S]*\.home-overview-stat strong\.is-standing-bronze/, "Home standing value should have gold, silver, and bronze styles");
assert.match(stylesCss, /\.home-standings-row\.is-lions\.is-standing-gold[\s\S]*\.home-standings-row\.is-lions\.is-standing-silver[\s\S]*\.home-standings-row\.is-lions\.is-standing-bronze/, "Home standings Lions row should have medal-tier treatments");
assert.match(stylesCss, /\.standings-table tbody tr\.is-lions\.is-standing-gold[\s\S]*\.standings-table tbody tr\.is-lions\.is-standing-silver[\s\S]*\.standings-table tbody tr\.is-lions\.is-standing-bronze/, "Full standings Lions row should have medal-tier treatments");
assert.match(refreshScript, /function normalizeWinPct[\s\S]*1\.000[\s\S]*parseAaStandingsTable[\s\S]*pointsLabel/s, "Refresh script should parse current standings table rows");
assert.match(refreshScript, /league-standings-cache\.js[\s\S]*ScorebookLeagueStandingsCache/s, "Refresh script should write a local-file-safe script cache");
assert.match(refreshScript, /_scorebookRefresh[\s\S]*cache-control[\s\S]*no-cache/s, "Refresh script should bypass cached league responses");
assert.match(workflow, /cron: "15 \* \* \* \*"/, "Workflow should refresh hourly");
assert.match(workflow, /contents: write[\s\S]*git add data\/league-standings\.json data\/league-standings-cache\.js[\s\S]*git push/s, "Workflow should commit the static cache when standings change");
assert.match(indexHtml, /data\/league-standings-cache\.js\?v=2026\.\d{2}\.\d{2}-build-\d+/, "Index should load the standings script cache for file opens");
assert.equal(standingsJson.division, "AA", "Static standings cache should be scoped to AA");
assert.ok(standingsJson.rows.some((row) => row.teamName === "Oakmont Lions"), "Static cache should include current Oakmont Lions row");
assert.ok(standingsJson.rows.some((row) => row.teamName === "Pittsburgh D2"), "Static cache should include current Pittsburgh D2 row");
assert.match(standingsCacheScript, /window\.ScorebookLeagueStandingsCache = /, "Script cache should expose standings globally");
assert.match(standingsCacheScript, /"teamName": "Oakmont Lions"/, "Script cache should include current standings rows");

console.log("League standings tab checks passed.");
