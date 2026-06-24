import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(appJs, /const STAT_LEADER_MIN_GAMES = 3;/, "Stat leaders should use a three-game qualification");

const minimumBody = functionBody(appJs, "statLeaderMinimumGames");
assert.match(
  minimumBody,
  /Math\.min\(STAT_LEADER_MIN_GAMES, statLeaderSeasonGames\(season\)\.length\)/,
  "The required games should be capped by games played in the selected season"
);

const seasonGamesBody = functionBody(appJs, "statLeaderSeasonGames");
assert.match(seasonGamesBody, /gameIsFinal\(game\)/, "Final and quick-scored games should count toward the qualifier");
assert.match(seasonGamesBody, /hasRecordedEvents[\s\S]*hasPlateAppearanceData[\s\S]*hasManualStats/, "In-progress or postponed games should count only after play or stats are recorded");

const minimumGames = (seasonGameCount) => Math.min(3, seasonGameCount);
assert.equal(minimumGames(1), 1, "Leaders should display after the first game of a new season");
assert.equal(minimumGames(2), 2, "Leaders should display through the second game of a new season");
assert.equal(minimumGames(3), 3, "The full qualifier should begin after game three");
assert.equal(minimumGames(12), 3, "The qualifier should stay at three games later in the season");

const countsAsPlayed = (game) =>
  game.final
  || game.events.length > 0
  || game.plateAppearances.some((appearance) => appearance.result || appearance.completedAt || appearance.pitches.length)
  || Object.keys(game.hittingStatEdits).length > 0
  || Object.keys(game.pitchingStatEdits).length > 0;
const emptyGame = { final: false, events: [], plateAppearances: [], hittingStatEdits: {}, pitchingStatEdits: {} };
assert.equal(countsAsPlayed(emptyGame), false, "An untouched postponed or active game should not raise the qualifier");
assert.equal(countsAsPlayed({ ...emptyGame, events: [{ result: "1B" }] }), true, "A partially scored game should raise the qualifier");
assert.equal(countsAsPlayed({ ...emptyGame, final: true }), true, "A completed quick-score game should raise the qualifier");

const homeBody = functionBody(appJs, "renderHome");
assert.match(homeBody, /leaderSeason = String\(currentLeagueSeason\(\)\)/, "Homepage leaders should use only the current season");
assert.match(homeBody, /gamesPlayedForPlayer\(player\.id, leaderSeason\)/, "Homepage hitting leaders should include current-season games played");
assert.match(homeBody, /gamesPitchedForPlayer\(player\.id, leaderSeason\)/, "Homepage pitching leaders should include current-season appearances");
assert.match(homeBody, /\.filter\(\(row\) => statLeaderEligible\(row, leaderMinimumGames\)\)/, "Homepage leaders should apply the dynamic qualifier");

const renderLeadersBody = functionBody(appJs, "renderLeaders");
assert.match(renderLeadersBody, /minimumGames = statLeaderMinimumGames\(statsSeasonFilter\)/, "Stats leader cards should use the selected season's qualifier");
assert.match(renderLeadersBody, /gamesPitchedForPlayer\(player\.id, statsSeasonFilter\)/, "Pitching leader cards should count pitching appearances");
assert.match(renderLeadersBody, /statLeaderEligible\(row, minimumGames\)/, "Stats leader cards should exclude players below the qualifier");

const gamesPitchedBody = functionBody(appJs, "gamesPitchedForPlayer");
assert.match(gamesPitchedBody, /hasPitchingStatEdit\(game, playerId\)/, "Manually entered pitching games should count toward qualification");
assert.match(gamesPitchedBody, /pitchingEventsForStatsGame\(game\)/, "Scored pitching appearances should count toward qualification");

console.log("Stat leader game minimum checks passed.");
