import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const [indexHtml, appJs, stylesCss] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../styles.css", import.meta.url), "utf8")
]);

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(indexHtml, /id="hittingPlayerGameLog"/, "Hitting stats should include a player game-log target");
assert.match(indexHtml, /id="pitchingPlayerGameLog"/, "Pitching stats should include a player game-log target");
assert.match(appJs, /hittingPlayerGameLog: document\.getElementById\("hittingPlayerGameLog"\)/, "Hitting game log should be registered");
assert.match(appJs, /pitchingPlayerGameLog: document\.getElementById\("pitchingPlayerGameLog"\)/, "Pitching game log should be registered");

const gameRowsBody = functionBody(appJs, "statsPlayerGameLogRows");
assert.match(gameRowsBody, /playerHasPitchingGameLine\(game, playerId\)/, "Pitching game logs should include only actual appearances");
assert.match(gameRowsBody, /playerHasHittingGameLine\(game, playerId\)/, "Hitting game logs should include only player games");
assert.match(gameRowsBody, /pitcherStats\(playerId, game\.id, statsSeasonFilter\)/, "Pitching rows should use game-level pitching stats");
assert.match(gameRowsBody, /statsForPlayer\(playerId, statsSeasonFilter, game\.id\)/, "Hitting rows should use game-level hitting stats");

const hittingColumns = JSON.parse(runInNewContext(`
  ${functionBody(appJs, "activeHittingGameLogColumns")}
  JSON.stringify(activeHittingGameLogColumns([
    { stats: { singles: 2, doubles: 0, triples: 0, hr: 0, rbi: 1, bb: 0, hbp: 0, k: 0, sac: 0, sb: 1, cs: 0 } }
  ]).map((column) => column.label));
`));
assert.deepEqual(hittingColumns, ["1B", "RBI", "SB"], "Hitting game logs should omit detail columns that are zero in every selected-player game");

const pitchingColumns = JSON.parse(runInNewContext(`
  ${functionBody(appJs, "pitcherGameDecision")}
  ${functionBody(appJs, "activePitchingGameLogColumns")}
  JSON.stringify(activePitchingGameLogColumns([
    { stats: { wins: 0, losses: 0, noDecision: 0, h: 0, runs: 0, earnedRuns: 0, bb: 1, hbp: 0, k: 4, pitches: 0 } }
  ]).map((column) => column.label));
`));
assert.deepEqual(pitchingColumns, ["BB", "K"], "Pitching game logs should omit detail columns that are zero in every selected-player appearance");

const hittingLogBody = functionBody(appJs, "renderHittingPlayerGameLog");
assert.match(hittingLogBody, /<th>Date<\/th><th>Opponent<\/th><th>Result<\/th>/, "Hitting game log should identify each game");
assert.match(hittingLogBody, /<th>PA<\/th>[\s\S]*<th>AB<\/th>[\s\S]*<th>H<\/th>[\s\S]*<th>R<\/th>/, "Hitting game log should show hits before runs");
assert.match(hittingLogBody, /<th>AVG<\/th>[\s\S]*<th>OBP<\/th>[\s\S]*<th>SLG<\/th>[\s\S]*<th>OPS<\/th>/, "Hitting game log should expose rate stats");
assert.match(hittingLogBody, /activeHittingGameLogColumns\(rows\)/, "Hitting game logs should determine optional columns from the selected player's games");
assert.match(hittingLogBody, /detailColumns\.map\(\(column\) => `<th>/, "Hitting game logs should render only active detail columns");
assert.match(hittingLogBody, /filter\(\(column\) => Number\(column\.value\(hit\) \|\| 0\) > 0\)/, "Mobile hitting cards should omit zero-value details per game");
assert.match(hittingLogBody, /stats-player-game-log-mobile/, "Hitting game log should include responsive cards");

const pitchingLogBody = functionBody(appJs, "renderPitchingPlayerGameLog");
assert.match(pitchingLogBody, /<th>Date<\/th><th>Opponent<\/th><th>Result<\/th><th>IP<\/th>/, "Pitching game log should expose core appearance stats");
assert.match(pitchingLogBody, /activePitchingGameLogColumns\(rows\)/, "Pitching game logs should determine optional columns from the selected player's appearances");
assert.match(pitchingLogBody, /<th>ERA<\/th><th>WHIP<\/th>/, "Pitching game log should expose game rates");

const seasonStatsBody = functionBody(appJs, "renderSeasonStats");
assert.match(seasonStatsBody, /renderHittingPlayerGameLog\(hittingPlayerFilter\)/, "Selecting a hitter should render the per-game breakdown");
assert.match(seasonStatsBody, /renderPitchingPlayerGameLog\(pitchingPlayerFilter\)/, "Selecting a pitcher should render the per-game breakdown");
assert.match(seasonStatsBody, /statsPlayerOpenButton\(player, "hitting"\)/, "Hitting table player names should open the player's game log");
assert.match(seasonStatsBody, /statsPlayerOpenButton\(player, "pitching"\)/, "Pitching table player names should open the player's game log");

assert.match(appJs, /desktopHitPlayerFilter = mobileHitPlayerFilter/, "Mobile hitter selection should synchronize the shared player filter");
assert.match(appJs, /mobileHitPlayerFilter = desktopHitPlayerFilter/, "Desktop hitter selection should synchronize the mobile player filter");
assert.match(appJs, /data-tooltip="Open Player Stats"/, "Player stat links should expose the requested hover label");
assert.match(appJs, /openStatsPlayerGameLog\(button\.dataset\.openPlayerStats, button\.dataset\.playerStatsMode\)/, "Player stat links should use the shared filter action");
const openPlayerLogBody = functionBody(appJs, "openStatsPlayerGameLog");
assert.match(openPlayerLogBody, /statsPlayerFocus = playerId/, "Opening a player from the stats sheet should use focused-player mode");
assert.match(openPlayerLogBody, /renderStatsSprayControls\(\)/, "Focused player stats should lock and refresh the player's spray chart");
const switchViewBody = functionBody(appJs, "switchView");
assert.match(switchViewBody, /previousView === "stats" && nextView !== "stats"[\s\S]*resetStatsViewFilters\(\)/, "Leaving Stats should clear player and game filters");
const resetFiltersBody = functionBody(appJs, "resetStatsViewFilters");
assert.match(resetFiltersBody, /statsPlayerFocus = "all"[\s\S]*desktopHitPlayerFilter = "all"[\s\S]*mobilePitGameFilter = "all"/, "Stats reset should restore the full unfiltered team view");
assert.match(stylesCss, /#statsView \.stats-player-game-log-scroll[\s\S]*overflow-x: auto/, "Desktop game logs should scroll horizontally");
assert.match(stylesCss, /#statsView \.stats-player-game-log-mobile[\s\S]*display: grid/, "Mobile game logs should render as cards");
assert.match(stylesCss, /#statsView \.stats-player-open-button:hover::after[\s\S]*opacity: 1/, "Desktop player links should show an Open Player Stats tooltip");

console.log("Player game-log checks passed.");
