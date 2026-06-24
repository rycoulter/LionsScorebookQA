import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");
const serviceWorker = readFileSync(join(rootDir, "service-worker.js"), "utf8");
const refreshScript = readFileSync(join(rootDir, "scripts", "refresh-naba-rosters.mjs"), "utf8");
const rostersJson = JSON.parse(readFileSync(join(rootDir, "data", "naba-rosters.json"), "utf8"));
const rostersCacheJs = readFileSync(join(rootDir, "data", "naba-rosters-cache.js"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /id="importOpponentRosterBtn"[\s\S]*Load NABA Roster/, "Opponent lineup setup should expose a NABA roster import button");
mustMatch(indexHtml, /id="opponentRosterImportPanel"[\s\S]*id="opponentRosterSearch"[\s\S]*id="opponentRosterList"/, "Opponent lineup setup should include a roster picker panel");
mustMatch(indexHtml, /data\/naba-rosters-cache\.js\?v=\d{4}\.\d{2}\.\d{2}-build-\d+[\s\S]*app\.js\?v=\d{4}\.\d{2}\.\d{2}-build-\d+/, "NABA roster cache script should load before app.js");

mustMatch(appJs, /const NABA_ROSTERS_CACHE_URL = "data\/naba-rosters\.json"/, "App should define the static NABA roster JSON cache URL");
mustMatch(appJs, /nabaRosterCache = normalizeNabaRosterCache\(window\.ScorebookNabaRostersCache\)/, "App should initialize the roster cache from the script payload");
mustMatch(appJs, /importOpponentRosterBtn: document\.getElementById\("importOpponentRosterBtn"\)/, "Import button should be registered");
mustMatch(appJs, /opponentRosterList\?\.addEventListener\("click"[\s\S]*addOpponentRosterPlayerToLineup/, "Roster picker should add selected players to the pregame lineup");
mustMatch(functionBody(appJs, "findNabaRosterTeamForOpponent"), /aliases\.some/, "Opponent matching should use aliases for common short names");
const addRosterBody = functionBody(appJs, "addOpponentRosterPlayerToLineup");
mustMatch(addRosterBody, /let game = state\.games\.find/, "Roster import should use a mutable game reference");
mustMatch(addRosterBody, /savePregameOpponentLineup\(\)[\s\S]*game = state\.games\.find/, "Roster import should reacquire the game after saveState normalizes state");
mustMatch(addRosterBody, /if \(lineupHasRosterPlayer\(entries, player\)\) \{[\s\S]*renderOpponentRosterImport\(game\);[\s\S]*return;[\s\S]*\}/, "Roster import should not add the same player twice");
mustMatch(addRosterBody, /findIndex\(\(entry, index\) => isPregameOpponentLineupSpotOpen\(entry, index\)\)/, "Roster import should fill the next open lineup spot first");
mustMatch(functionBody(appJs, "isPregameOpponentLineupSpotOpen"), /!pregameOpponentEntryHasData\(entry, index\)/, "Roster import should consider Batter N placeholders open");
mustMatch(functionBody(appJs, "nextPregameOpponentOpenIndex"), /for \(let index = safeStart; index < entries\.length; index \+= 1\)/, "Roster import should look for the next open spot after an add");
mustMatch(addRosterBody, /entries\.push\(\{[\s\S]*order: targetIndex \+ 1[\s\S]*active: true[\s\S]*\}\)/, "Roster import should append only when no blank spot exists");
mustMatch(addRosterBody, /opponentLineupSnapshot\(entries, \{ preserveBlank: true \}\)/, "Roster import should keep other empty pregame spots blank");
mustMatch(addRosterBody, /renderOpponentLineupStep\(\{ focusIndex: nextPregameOpponentOpenIndex\(entries, targetIndex \+ 1\) \}\)/, "Roster import should advance the highlighted spot after adding a player");
mustMatch(functionBody(appJs, "renderOpponentLineupStep"), /renderOpponentRosterImport\(game\)/, "Roster picker should rerender when lineup rows rerender");
mustMatch(functionBody(appJs, "renderOpponentRosterImport"), /disabled aria-disabled=\\?"true\\?"/, "Already-added roster players should be disabled in the picker");

mustMatch(stylesCss, /\.opponent-roster-import-card/, "Roster picker card should have themed styles");
mustMatch(stylesCss, /\.opponent-roster-player[\s\S]*grid-template-columns: 46px minmax\(0, 1fr\) auto/, "Roster player rows should align number, name, and action");
mustMatch(stylesCss, /\.opponent-roster-player:disabled[\s\S]*cursor: not-allowed/, "Disabled roster rows should clearly not be clickable");
mustMatch(serviceWorker, /\.\/data\/naba-rosters-cache\.js/, "Service worker should cache the roster script payload");
mustMatch(serviceWorker, /\.\/data\/naba-rosters\.json/, "Service worker should cache the roster JSON payload");

mustMatch(refreshScript, /const TEAM_SOURCES = \[/, "Roster refresh script should define known NABA team sources");
mustMatch(refreshScript, /function parseRosterRows/, "Roster refresh script should parse roster table rows");
mustMatch(rostersCacheJs, /window\.ScorebookNabaRostersCache = /, "Roster script cache should attach to window");

assert.equal(rostersJson.sourceLabel, "Pittsburgh NABA rosters", "Roster cache should identify its source");
assert.ok(Array.isArray(rostersJson.teams), "Roster cache should include teams");
assert.ok(rostersJson.teams.length >= 8, "Roster cache should include the known AA teams");
assert.ok(rostersJson.teams.filter((team) => Array.isArray(team.players) && team.players.length).length >= 7, "Most NABA teams should have cached players");
const d2 = rostersJson.teams.find((team) => team.teamKey === "pittsburgh-d2");
assert.ok(d2?.players?.some((player) => player.name && Object.prototype.hasOwnProperty.call(player, "number")), "Players should include names and optional jersey numbers");
const oakmont = rostersJson.teams.find((team) => team.teamKey === "oakmont-lions");
assert.ok(oakmont?.players?.some((player) => player.firstName && player.lastName), "Parser should split first and last names from NABA format");

console.log("NABA roster import checks passed.");
