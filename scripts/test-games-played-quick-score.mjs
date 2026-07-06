import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(
  functionBody(appJs, "saveQuickScoreResult"),
  /completeGameLocally\(game, \{ scoringSource: "quick-score", quickScored: true \}\)/,
  "Quick-scored games should be marked so lineup-only GP is not inferred later"
);
assert.match(
  functionBody(appJs, "openStatEditGameModal"),
  /clearStatEditGameBtn/,
  "The hitting stat editor should expose the clear saved line control"
);
assert.match(
  functionBody(appJs, "clearStatEditGameStats"),
  /removeEquivalentHittingStatEdits\(game, player\.id\)/,
  "Clearing a saved game line should remove that player's manual hitting stat edit"
);

const runtimeSource = [
  functionBody(appJs, "gameUsesLineupForGamesPlayed"),
  functionBody(appJs, "playerHasHittingGameLine"),
  functionBody(appJs, "gamesPlayedForPlayer")
].join("\n\n");

const result = JSON.parse(runInNewContext(`
  const eventRules = {
    "1B": { pa: true },
    GO: { pa: true },
    SB: { pa: false }
  };
  const scorebookBaseRunningResults = new Set(["SB"]);
  const state = {
    games: [
      {
        id: "old-quick-score",
        status: "completed",
        lineupEntries: [{ playerId: "p6" }],
        events: [],
        plateAppearances: []
      },
      {
        id: "marked-quick-score",
        status: "completed",
        quickScored: true,
        scoringSource: "quick-score",
        lineupEntries: [{ playerId: "p1" }],
        events: [{ playerId: "p1", result: "1B", scope: "offense" }],
        plateAppearances: [{ result: "1B" }]
      },
      {
        id: "manual-stat-game",
        status: "completed",
        lineupEntries: [{ playerId: "p2" }],
        hittingStatEdits: { p3: { stats: { ab: 1 } } },
        events: [],
        plateAppearances: []
      },
      {
        id: "scored-lineup-game",
        status: "completed",
        lineupEntries: [{ playerId: "p1" }, { playerId: "p4" }],
        events: [{ playerId: "p1", result: "1B", scope: "offense" }],
        plateAppearances: [{ result: "1B" }]
      },
      {
        id: "direct-event-game",
        status: "completed",
        lineupEntries: [],
        events: [{ playerId: "p5", result: "GO", scope: "offense" }],
        plateAppearances: [{ result: "GO" }]
      }
    ]
  };
  function statsGamesForSeason() { return state.games; }
  function hasHittingStatEdit(game, playerId) {
    return Boolean(game?.hittingStatEdits && Object.prototype.hasOwnProperty.call(game.hittingStatEdits, playerId));
  }
  function offensiveEventsForStatsGame(game) {
    const manualEvents = Object.keys(game?.hittingStatEdits || {}).map((playerId) => ({ playerId, result: "GO", manualStatEdit: true }));
    return [...(game?.events || []), ...manualEvents];
  }
  function playerIdAliasSet(playerId) { return new Set([playerId]); }
  function playerIdMatches(playerIds, candidateId) {
    return playerIds instanceof Set ? playerIds.has(candidateId) : playerIds === candidateId;
  }

  ${runtimeSource}

  JSON.stringify({
    oldQuickScoreLineupPlayer: gamesPlayedForPlayer("p1"),
    staleQuickScoreLineupPlayer: gamesPlayedForPlayer("p6"),
    manualEditedPlayer: gamesPlayedForPlayer("p3"),
    manualLineupOnlyPlayer: gamesPlayedForPlayer("p2"),
    scoredLineupOnlyPlayer: gamesPlayedForPlayer("p4"),
    directEventPlayer: gamesPlayedForPlayer("p5"),
    markedQuickScoreUsesLineup: gameUsesLineupForGamesPlayed(state.games[1])
  });
`, {}));

assert.equal(result.oldQuickScoreLineupPlayer, 2, "Direct events and truly scored lineup games should still count GP");
assert.equal(result.staleQuickScoreLineupPlayer, 0, "Lineup-only old quick-score games should not add GP");
assert.equal(result.markedQuickScoreUsesLineup, false, "Explicit quick-score games should never use lineup-only GP");
assert.equal(result.manualEditedPlayer, 1, "Manual stat edits should count as GP");
assert.equal(result.manualLineupOnlyPlayer, 0, "Lineup-only players in manual stat games should not count as GP");
assert.equal(result.scoredLineupOnlyPlayer, 1, "Actually scored games should still count lineup appearances");
assert.equal(result.directEventPlayer, 1, "Players with real offensive events should count as GP");

console.log("Quick score games-played checks passed.");
