import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const exactFunction = new RegExp(`function ${functionName}\\s*\\(`);
  const match = exactFunction.exec(source);
  const start = match?.index ?? -1;
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = ["\nfunction ", "\n  function ", "\nasync function ", "\n  async function "]
    .map((needle) => source.indexOf(needle, start + 1))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(functionBody(appJs, "rosterIdentityKey"), /name && number \? `\$\{number\}\|\$\{name\}` : ""/, "Roster identity should key players by normalized number and name");
mustMatch(functionBody(appJs, "playerIdAliasSet"), /rosterIdentityKey\(item\) === key/, "Equivalent roster IDs should be found by identity key");
mustMatch(functionBody(appJs, "rosterStatPlayerRows"), /players\.find\(\(player\) => player\.active !== false[\s\S]*state\.lineup\.includes\(player\.id\)\)/, "Stats rows should prefer the active lineup player when duplicate identities exist");
mustMatch(functionBody(appJs, "canonicalRosterPlayerForId"), /rosterStatPlayerRows\(\)\.find\(\(player\) => aliases\.has\(player\.id\)\)/, "Opening an inactive duplicate should focus the canonical player");

const addPlayerBody = functionBody(appJs, "addPlayer");
mustMatch(addPlayerBody, /findRosterMatchByIdentity\(name, els\.playerNumber\.value\.trim\(\) \|\| "--", \{ active: false \}\)/, "Adding a matching deleted player should find the inactive row");
mustMatch(addPlayerBody, /applyRosterFormToPlayer\(inactiveMatch\)[\s\S]*state\.lineup\.push\(inactiveMatch\.id\)[\s\S]*syncReason = "reactivate-player"/, "Adding a matching deleted player should reactivate the original ID");
mustMatch(addPlayerBody, /findRosterMatchByIdentity\(name, els\.playerNumber\.value\.trim\(\) \|\| "--", \{ active: true \}\)[\s\S]*already on the active roster/, "Adding an active duplicate should be blocked");

mustMatch(functionBody(appJs, "getSeasonHittingRows"), /rosterStatPlayerRows\(\)[\s\S]*statsForPlayer\(player\.id, statsSeasonFilter, null, statsGameTypeFilter\)/, "Desktop hitting stats should render canonical player rows");
mustMatch(functionBody(appJs, "getSeasonPitchingRows"), /rosterStatPlayerRows\(\)[\s\S]*pitcherStats\(player\.id, null, statsSeasonFilter, statsGameTypeFilter\)/, "Desktop pitching stats should render canonical player rows");
mustMatch(functionBody(appJs, "getMobileHittingRows"), /rosterStatPlayerRows\(\)[\s\S]*statsForPlayer\(player\.id, statsSeasonFilter[\s\S]*statsGameTypeFilter/, "Mobile hitting stats should render canonical player rows");
mustMatch(functionBody(appJs, "getMobilePitchingRows"), /rosterStatPlayerRows\(\)[\s\S]*pitcherStats\(player\.id, gameId === "all" \? null : gameId, statsSeasonFilter[\s\S]*statsGameTypeFilter/, "Mobile pitching stats should render canonical player rows");

mustMatch(functionBody(appJs, "statsForPlayer"), /const playerIds = playerIdAliasSet\(playerId\)[\s\S]*playerIdMatches\(playerIds, event\.playerId\)[\s\S]*runsScoredFromEvents\(events, playerIds\)/, "Hitting stats should include equivalent old and new player IDs");
mustMatch(functionBody(appJs, "pitcherStats"), /const playerIds = playerIdAliasSet\(playerId\)[\s\S]*playerIdMatches\(playerIds, event\.pitcherId\)[\s\S]*playerIdMatches\(playerIds, pitch\.pitcherId\)/, "Pitching stats should include equivalent old and new pitcher IDs");
mustMatch(functionBody(appJs, "runsScoredFromEvents"), /playerIdMatches\(playerId, advancement\?\.runnerId\)/, "Run scoring attribution should include equivalent runner IDs");
mustMatch(functionBody(appJs, "renderStatsSprayChart"), /const playerIds = playerIdAliasSet\(playerId\)[\s\S]*playerIdMatches\(playerIds, event\.playerId\)/, "Focused spray charts should include equivalent old player IDs");

mustMatch(functionBody(appJs, "offensiveEventsForStatsGame"), /Object\.keys\(edits\)\.forEach\(\(playerId\) => \{[\s\S]*playerIdAliasSet\(playerId\)\.forEach/, "Manual hitting edits should suppress scored events for equivalent IDs");
mustMatch(functionBody(appJs, "pitchingEventsForStatsGame"), /Object\.keys\(edits\)\.forEach\(\(playerId\) => \{[\s\S]*playerIdAliasSet\(playerId\)\.forEach/, "Manual pitching edits should suppress scored events for equivalent IDs");
mustMatch(functionBody(appJs, "equivalentHittingStatEdit"), /playerIdAliasSet\(playerId\)/, "Hitting edit modals should load saved edits from equivalent IDs");
mustMatch(functionBody(appJs, "equivalentPitchingStatEdit"), /playerIdAliasSet\(playerId\)/, "Pitching edit modals should load saved edits from equivalent IDs");
mustMatch(functionBody(appJs, "removeEquivalentHittingStatEdits"), /playerIdAliasSet\(playerId\)[\s\S]*delete edits\[id\]/, "Saving hitting edits should remove duplicate equivalent saved rows");
mustMatch(functionBody(appJs, "removeEquivalentPitchingStatEdits"), /playerIdAliasSet\(playerId\)[\s\S]*delete edits\[id\]/, "Saving pitching edits should remove duplicate equivalent saved rows");

console.log("Roster player identity checks passed.");
