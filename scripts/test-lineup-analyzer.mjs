import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = ["\nfunction ", "\nasync function "]
    .map((needle) => source.indexOf(needle, start + 1))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return nextFunction === undefined ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /Lineup Analyzer[\s\S]*Game lineups and pitcher matchups/, "Lineup Lab should be replaced by the Lineup Analyzer");
mustMatch(indexHtml, /data-view="lineup" hidden>Lineup Analyzer<\/button>/, "Navigation should identify the analyzer consistently");
mustMatch(indexHtml, /id="lineupAnalyzerGameSelect"/, "Analyzer should select a game");
mustMatch(indexHtml, /id="lineupAnalyzerLineupRows"[\s\S]*id="lineupAnalyzerPitcherList"/, "Analyzer should edit lineup and opposing pitchers");
mustMatch(indexHtml, /id="lineupAnalyzerPitcherTabs"[\s\S]*id="lineupAnalyzerMatchupBody"/, "Analyzer should provide pitcher-specific matchup entry");
mustMatch(indexHtml, /<th>PA<\/th>[\s\S]*<th>AB<\/th>[\s\S]*<th>H<\/th>[\s\S]*<th>HR<\/th>[\s\S]*<th>RBI<\/th>/, "Matchup table should capture core hitter split fields");

mustMatch(functionBody(appJs, "normalizeGame"), /lineupUsage: normalizeLineupAnalyzerUsage[\s\S]*opponentPitchers: normalizeLineupAnalyzerPitchers[\s\S]*hittingMatchups: normalizeLineupAnalyzerMatchups/, "Game normalization should retain analyzer data");
mustMatch(functionBody(appJs, "lineupAnalyzerDraftFromGame"), /lineupUsage[\s\S]*opponentPitchers[\s\S]*hittingMatchups/, "Analyzer draft should load all three data groups");
mustMatch(functionBody(appJs, "addLineupAnalyzerPitcher"), /role: draft\.opponentPitchers\.length \? "relief" : "starter"/, "First opponent pitcher should default to starter and later pitchers to relief");
mustMatch(functionBody(appJs, "lineupAnalyzerMatchupRecord"), /playerId[\s\S]*opponentPitcherId[\s\S]*draft\.hittingMatchups\.push/, "Each hitter should support a row against each pitcher");
const applyMatchupsBody = functionBody(appJs, "applyLineupAnalyzerMatchupsToGame");
mustMatch(applyMatchupsBody, /const existingStats = existing\.stats \|\| \{\}[\s\S]*\.\.\.existingStats[\s\S]*ab: totals\.ab[\s\S]*sac: totals\.sac/, "Matchup totals should update tracked batting fields while preserving existing game-only stats");
assert.doesNotMatch(applyMatchupsBody, /runs: totals|sb: totals|cs: totals/, "Pitcher splits should not overwrite Runs, SB, or CS game totals");
const saveAnalyzerBody = functionBody(appJs, "saveLineupAnalyzerGame");
mustMatch(saveAnalyzerBody, /game\.lineupUsage = deepClone[\s\S]*game\.opponentPitchers = deepClone[\s\S]*game\.hittingMatchups = deepClone/, "Saving should persist lineup, pitchers, and matchups on the game");
mustMatch(saveAnalyzerBody, /existingLineupEntries\.get\(entry\.playerId\)\?\.id \|\| createId\("lineup"\)/, "Saving should preserve existing lineup entry IDs when possible");
mustMatch(saveAnalyzerBody, /markSharedGamesDirty\(game\.id\)[\s\S]*queueCompletedGameSync[\s\S]*requestSharedSnapshotSync/, "Analyzer saves should use the existing game sync flow");
mustMatch(functionBody(appJs, "lineupAnalyzerValidationError"), /player can only appear once[\s\S]*same opposing pitcher cannot be added more than once/i, "Analyzer should prevent duplicate hitters and pitchers");
mustMatch(functionBody(appJs, "bindEvents"), /lineupAnalyzerSaveBtn[\s\S]*lineupAnalyzerAddPitcherBtn[\s\S]*lineupAnalyzerMatchupBody/, "Analyzer controls should be wired through delegated events");

mustMatch(stylesCss, /\.lineup-analyzer-workflow[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/, "Analyzer should use a two-column desktop workflow");
mustMatch(stylesCss, /\.lineup-analyzer-table th:first-child[\s\S]*position: sticky[\s\S]*left: 0/, "Player names should stay visible during stat scrolling");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.lineup-analyzer-summary[\s\S]*grid-template-columns: repeat\(2/, "Analyzer should adapt for mobile screens");

console.log("Lineup Analyzer checks passed.");
