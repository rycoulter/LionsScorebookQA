import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /<th>Edit<\/th>/, "Hitting stats table should include an Edit column");
mustMatch(indexHtml, /data-hit-sort="risp">RISP/, "RISP should be sortable in the hitting stats table");
mustMatch(appJs, /statsEditButtonMarkup\(player\)/, "Hitting stats rows should render edit buttons");
mustMatch(appJs, /data-edit-hitting-player="\$\{escapeHtml\(player\.id\)\}"/, "Edit buttons should target a specific player");
mustMatch(appJs, /colspan="24" class="stats-empty-row"/, "Empty hitting stats row should span the added edit column");
mustMatch(stylesCss, /\.stats-row-edit-button[\s\S]*place-items: center/, "Edit button should have compact icon styling");

mustMatch(indexHtml, /id="statEditGameSelectModal"[\s\S]*Select Game to Edit/, "Select Game to Edit modal should exist");
mustMatch(indexHtml, /id="statEditGameModal"[\s\S]*Edit Game Stats/, "Edit Game Stats modal should exist");
mustMatch(indexHtml, /id="pitchingStatEditGameSelectModal"[\s\S]*Select Game to Edit/, "Select Game to Edit modal should exist for pitching");
mustMatch(indexHtml, /id="pitchingStatEditGameModal"[\s\S]*Edit Pitching Stats/, "Edit Pitching Stats modal should exist");
["Ab", "H", "RispAB", "RispH", "Singles", "Doubles", "Triples", "Hr", "Bb", "Hbp", "K", "Roe", "Errors", "Fc", "Sac", "Dp", "Go", "Lo", "Fo", "Sb", "Cs", "Po", "Rbi", "Runs"].forEach((field) => {
  mustMatch(indexHtml, new RegExp(`id="statEdit${field}"`), `${field} input should exist`);
});
["Ip", "Pitches", "Balls", "Strikes", "Batters", "H", "Hr", "Runs", "EarnedRuns", "Bb", "Hbp", "K", "Sv", "Decision"].forEach((field) => {
  mustMatch(indexHtml, new RegExp(`id="pitchingStatEdit${field}"`), `${field} pitching input should exist`);
});
assert.equal(/id="statEdit(?:Avg|Obp|Slg|Ops|Total|Pa)"/i.test(indexHtml), false, "Derived or aggregate stats should not be directly editable");
assert.equal(/id="pitchingStatEdit(?:Era|Whip|K9|R9|StrikeRate|KRate|BbRate|Kbb|PitchesPerInning)"/i.test(indexHtml), false, "Derived pitching rates should not be directly editable");
["1B", "2B", "3B", "HR", "GO", "LO", "FO"].forEach((result) => {
  mustMatch(indexHtml, new RegExp(`data-stat-edit-spray-mode="${result}"`), `${result} spray result option should exist`);
});
assert.equal(/data-stat-edit-spray-mode="(?:hit|out)"/i.test(indexHtml), false, "Stats edit spray mode should use result types instead of generic hit/out");

mustMatch(appJs, /hittingStatEditMap\(game\)/, "Game-level hitting edit storage should exist");
mustMatch(appJs, /pitchingStatEditMap\(game\)/, "Game-level pitching edit storage should exist");
mustMatch(appJs, /normalizeManualHittingStats/, "Manual game stat edits should be normalized before save");
mustMatch(appJs, /normalizeManualPitchingStats/, "Manual pitching stat edits should be normalized before save");
mustMatch(appJs, /manualHittingStatEvents/, "Manual game stat lines should become stat-source events");
mustMatch(appJs, /manualPitchingStatEvents/, "Manual pitching stat lines should become stat-source events");
mustMatch(appJs, /sprayEventsForGame/, "Spray chart should read through the game-aware spray event helper");

const offenseBody = functionBody(appJs, "offensiveEventsForStatsGame");
mustMatch(offenseBody, /editedPlayerIds/, "Edited players should be handled specially");
mustMatch(offenseBody, /!\(eventRules\[event\.result\]\?\.pa\)/, "Editing a hitting line should replace PA events while preserving non-PA events");
mustMatch(offenseBody, /manualHittingStatEvents\(game, playerId, edit\)/, "Edited stat lines should feed season stat calculations");

const sprayBody = functionBody(appJs, "sprayEventsForGame");
mustMatch(sprayBody, /manualSprayEventsForGame\(game, playerId, edit\)/, "Edited spray dots should feed spray chart calculations");
mustMatch(sprayBody, /!editedPlayerIds\.has\(event\.playerId\)/, "Edited spray dots should replace original dots for that player/game");

const normalizeStatsBody = functionBody(appJs, "normalizeManualHittingStats");
["rispAB", "rispH", "roe", "errors", "fc", "sac", "dp", "go", "lo", "fo", "sb", "cs", "po"].forEach((field) => {
  mustMatch(normalizeStatsBody, new RegExp(`\\b${field}\\b`), `${field} should be normalized as an editable count`);
});
mustMatch(normalizeStatsBody, /if \(rispAB > ab\) rispAB = ab/, "Manual RISP AB should not exceed total at-bats");
mustMatch(normalizeStatsBody, /if \(rispH > rispAB\) rispH = rispAB/, "Manual RISP hits should not exceed RISP at-bats");
mustMatch(normalizeStatsBody, /if \(rispH > h\) rispH = h/, "Manual RISP hits should not exceed total hits");

const manualEventsBody = functionBody(appJs, "manualHittingStatEvents");
["ROE", "FC", "SAC", "DP", "GO", "LO", "FO", "SB", "CS", "PO"].forEach((result) => {
  mustMatch(manualEventsBody, new RegExp(`pushEvents\\("${result}"`), `${result} edits should become stat-source events`);
});
mustMatch(appJs, /function applyManualHittingRispToEvents/, "Manual RISP counts should be mapped to stat-source events");
mustMatch(appJs, /event\.hasRISP = true/, "Manual RISP mapping should flag selected synthetic events");
mustMatch(manualEventsBody, /applyManualHittingRispToEvents\(events, stats\)/, "Manual hitting events should apply RISP flags before stat calculation");
mustMatch(appJs, /risp: "RISP"/, "Mobile hitting sort labels should include RISP");
mustMatch(appJs, /if \(hittingSort\.key === "risp"\) return formatRispRate\(hit\)/, "Mobile hitting sort values should format RISP as a rate");

const normalizeSpraysBody = functionBody(appJs, "normalizeStatEditSprays");
mustMatch(normalizeSpraysBody, /normalizeStatEditSprayResult\(spray\?\.result, fallback\)/, "Edited spray dots should preserve selected result types");

const saveBody = functionBody(appJs, "saveStatEditGameStats");
mustMatch(saveBody, /hittingStatEditMap\(game\)\[player\.id\] = edit/, "Saving should write the edit to the selected game");
mustMatch(saveBody, /saveStateWithOptions\(\{ liveSyncReason: "game-stat-edit" \}\)/, "Saving should persist the game edit");
mustMatch(saveBody, /render\(\)/, "Saving should rerender stats and spray chart views immediately");
mustMatch(saveBody, /markSharedGamesDirty\(game\.id\)/, "Saving should mark the game dirty for shared sync");

mustMatch(appJs, /pitchingStatsEditButtonMarkup\(player\)/, "Pitching stats rows should render edit buttons");
mustMatch(appJs, /data-edit-pitching-player="\$\{escapeHtml\(player\.id\)\}"/, "Pitching edit buttons should target a specific player");
const pitchingRowsBody = functionBody(appJs, "getSeasonPitchingRows");
mustMatch(pitchingRowsBody, /playerHasPosition\(player, "P"\)/, "Pitching table should expose eligible pitchers even before stats exist");

const pitcherStatsBody = functionBody(appJs, "pitcherStats");
mustMatch(pitcherStatsBody, /pitchingEventsForStatsGame\(game\)/, "Pitcher stats should read through edited pitching events");
mustMatch(pitcherStatsBody, /pitchingEventEarnedRuns\(event, earnedRunMaps\.get\(game\.id\)\)/, "Pitcher ERA should use manual earned runs when edited");

const normalizePitchingStatsBody = functionBody(appJs, "normalizeManualPitchingStats");
mustMatch(normalizePitchingStatsBody, /const sv = manualStatValue\(input, "sv", "SV"\)/, "Manual pitching stats should normalize saves");

const pitchingEventsBody = functionBody(appJs, "pitchingEventsForStatsGame");
mustMatch(pitchingEventsBody, /manualPitchingStatEvents\(game, playerId, edit\)/, "Pitching edits should replace stat-source defensive events");
mustMatch(pitchingEventsBody, /editedPlayerIds\.has\(event\.pitcherId\)/, "Edited pitcher events should replace original pitcher events");

const boxScoreBattingEventsBody = functionBody(appJs, "boxScoreBattingEvents");
mustMatch(boxScoreBattingEventsBody, /offensiveEventsForStatsGame\(game\)/, "Lions box score batting events should read through manual hitting edits");
const boxScoreBattingRowsBody = functionBody(appJs, "boxScoreBattingRows");
mustMatch(boxScoreBattingRowsBody, /Object\.entries\(hittingStatEditMap\(game\)\)/, "Box score batting rows should include manual hitting stat lines");
mustMatch(boxScoreBattingRowsBody, /normalizeHittingStatEdit\(edit, playerId, game\)/, "Box score batting rows should normalize manual hitting edits");
["ab", "runs", "h", "rbi", "bb", "k"].forEach((field) => {
  mustMatch(boxScoreBattingRowsBody, new RegExp(`stats\\.${field}`), `Box score batting rows should map manual ${field}`);
});
const boxScorePitchingRowsBody = functionBody(appJs, "boxScorePitchingRows");
mustMatch(boxScorePitchingRowsBody, /Object\.entries\(pitchingStatEditMap\(game\)\)/, "Box score pitching rows should include manual pitching stat lines");
mustMatch(boxScorePitchingRowsBody, /normalizePitchingStatEdit\(edit, playerId, game\)/, "Box score pitching rows should normalize manual pitching edits");
["batters", "outs", "h", "runs", "earnedRuns", "bb", "hbp", "k", "sv"].forEach((field) => {
  mustMatch(boxScorePitchingRowsBody, new RegExp(`stats\\.${field}`), `Box score pitching rows should map manual ${field}`);
});

const savePitchingBody = functionBody(appJs, "savePitchingStatEditGameStats");
mustMatch(savePitchingBody, /pitchingStatEditMap\(game\)\[player\.id\] = edit/, "Saving should write the pitching edit to the selected game");
mustMatch(savePitchingBody, /saveStateWithOptions\(\{ liveSyncReason: "pitching-stat-edit" \}\)/, "Saving should persist the pitching edit");
mustMatch(savePitchingBody, /render\(\)/, "Saving pitching edits should rerender stats immediately");
mustMatch(savePitchingBody, /markSharedGamesDirty\(game\.id\)/, "Saving pitching edits should mark the game dirty for shared sync");

const statEditGamesBody = functionBody(appJs, "hittingStatEditGames");
mustMatch(statEditGamesBody, /gameAvailableForHittingStatEdit\(playerId, game\)/, "Game stat editor should use the completed-game-aware picker filter");
const availableBody = functionBody(appJs, "gameAvailableForHittingStatEdit");
mustMatch(availableBody, /gameIsFinal\(game\)/, "Any completed game should be selectable for manual hitting stats");
mustMatch(availableBody, /playerHasStatsInGame\(playerId, game\)/, "In-progress games should still require an existing player line");

const gamesPlayedBody = functionBody(appJs, "gamesPlayedForPlayer");
mustMatch(gamesPlayedBody, /hasHittingStatEdit\(game, playerId\)/, "A saved game-level stat edit should count as a game played");

mustMatch(stylesCss, /\.stat-edit-grid[\s\S]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/, "Game stat editor inputs should use a compact grid");
mustMatch(stylesCss, /\.stat-edit-spray-chart[\s\S]*min-height: 0 !important[\s\S]*aspect-ratio: 4 \/ 3/, "Game stat editor field should override the large generic spray chart height");
mustMatch(stylesCss, /\.stat-edit-spray-chart \.field-background-art[\s\S]*object-fit: contain/, "Game stat editor field art should fit inside the visible mini field");
mustMatch(stylesCss, /\.stat-edit-spray-chart[\s\S]*cursor: crosshair/, "Spray chart editor should be visibly interactive");
mustMatch(stylesCss, /\.stat-edit-spray-row[\s\S]*justify-content: space-between/, "Spray locations should render removable rows");

console.log("Game stat editing checks passed.");
