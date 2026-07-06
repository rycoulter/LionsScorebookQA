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

const pitcherCard = indexHtml.match(/<article[^>]+id="dockPitcherCard"[\s\S]*?<\/article>/)?.[0] || "";
assert.ok(pitcherCard, "Pitcher status area should render as a non-button status card");
const changePitcherButton = pitcherCard.match(/<button[^>]+id="dockChangePitcherBtn"[\s\S]*?<\/button>/)?.[0] || "";
assert.ok(changePitcherButton, "Pitcher status card should include a compact Change button");
mustMatch(changePitcherButton, /aria-label="Change pitcher"/, "Change button should expose an accessible label");
mustMatch(changePitcherButton, />Change<\/button>/, "Change button should use the visible Change label");
const pitcherMain = pitcherCard.match(/<div class="scoring-dock-pitcher-main">[\s\S]*?<\/div>\s*<\/article>/)?.[0] || "";
mustMatch(pitcherMain, /id="dockChangePitcherBtn"/, "Change button should sit in the pitcher info row for vertical centering");
assert.equal(/id="dockPitcherButton"/.test(indexHtml), false, "Whole pitcher status card should no longer be the modal trigger");
mustMatch(indexHtml, /id="pitcherSelectModal"/, "Select Pitcher modal should exist");
mustMatch(indexHtml, /id="pitcherSelectTitle">Select Pitcher</, "Select Pitcher modal title should exist");
mustMatch(indexHtml, /id="pitcherSelectList"/, "Pitcher modal should include an option list container");

mustMatch(appJs, /dockChangePitcherBtn\?\.[\s\S]*addEventListener\("click", openPitcherSelectModal\)/, "Only the Change button should open the modal");
assert.equal(/dockPitcherButton\?\.[\s\S]*addEventListener\("click", openPitcherSelectModal\)/.test(appJs), false, "Whole pitcher status card should not open the modal");
mustMatch(appJs, /closePitcherSelectBtn\?\.[\s\S]*addEventListener\("click", closePitcherSelectModal\)/, "Modal close button should close the modal");
mustMatch(appJs, /event\.key === "Escape"[\s\S]*closePitcherSelectModal\(\)/, "Modal should close on Escape");
mustMatch(appJs, /event\.key !== "Tab"[\s\S]*last\.focus\(\)/, "Modal should trap Tab focus");

const eligiblePitchersBody = functionBody(appJs, "eligiblePitcherOptions");
mustMatch(eligiblePitchersBody, /playerHasPosition\(player, "P"\)/, "Pitcher options should prefer roster players with P position");
mustMatch(eligiblePitchersBody, /player\.id === currentPitcher/, "Current pitcher should remain visible even if their roster position is not P");

const liveSnapshotBody = functionBody(appJs, "liveGameSnapshot");
for (const key of ["inning", "half", "outs", "bases", "batterIndex", "opponentBatterIndex", "score", "atBat", "pitcherId", "currentPlateAppearanceId"]) {
  mustMatch(liveSnapshotBody, new RegExp(`${key}:`), `Snapshot should include ${key}`);
}

const tagOpenPitchesBody = functionBody(appJs, "tagOpenPitcherPitches");
mustMatch(tagOpenPitchesBody, /if \(!pitch\.pitcherId\) pitch\.pitcherId = pitcherId/, "Open untagged pitches should be assigned to the outgoing pitcher before a change");

const changePitcherBody = functionBody(appJs, "changeActivePitcher");
mustMatch(changePitcherBody, /game\.pitcherId = incomingPitcherId/, "Selecting a pitcher should update game.pitcherId");
mustMatch(changePitcherBody, /game\.current\.pitcherId = incomingPitcherId/, "Selecting a pitcher should update current pitcher only");
mustMatch(changePitcherBody, /tagOpenPitcherPitches\(game, outgoingPitcherId\)/, "Pitcher changes should preserve outgoing pitcher pitch ownership");
mustMatch(changePitcherBody, /game\.substitutions\.push\(record\)/, "Pitcher changes should be tracked in substitutions");
mustMatch(changePitcherBody, /substitutionType: "pitcher"/, "Pitcher change should be added to play history");
mustMatch(changePitcherBody, /snapshotBefore/, "Pitcher change event should preserve a restore snapshot");
for (const forbiddenAssignment of ["game.inning =", "game.half =", "game.outs =", "game.bases =", "game.batterIndex =", "game.score =", "game.atBat ="]) {
  assert.equal(changePitcherBody.includes(forbiddenAssignment), false, `Pitcher change should not assign ${forbiddenAssignment}`);
}

const undoBody = functionBody(appJs, "undoLastPlay");
mustMatch(undoBody, /restorePlayHistorySnapshot\(game, historyEntry, history\.slice\(0, -1\)\)/, "Undo Play should restore full game state, including pitcher, from play history");
mustMatch(functionBody(appJs, "restorePlayHistorySnapshot"), /restoredGame\.playHistory = normalizePlayHistory\(remainingHistory, restoredGame\.id\)/, "Undo Play should preserve remaining history while restoring the previous pitcher state");
mustMatch(appJs, /pitcherId,\s*[\r\n]\s*inPlay:/, "Recorded pitch objects should carry the current pitcher id");
mustMatch(appJs, /\.filter\(\(pitch\) => !pitch\.pitcherId \|\| pitch\.pitcherId === pitcherId\)/, "Current-at-bat pitch counts should follow the active pitcher");
const pitcherStatsBody = functionBody(appJs, "pitcherStats");
mustMatch(pitcherStatsBody, /\(event\.pitches \|\| \[\]\)\.some\(\(pitch\) => playerIdMatches\(playerIds, pitch\.pitcherId\)\)/, "Pitcher stats should include tagged pitches even when another pitcher finishes the PA");
mustMatch(pitcherStatsBody, /const isPitcherOfRecord = playerIdMatches\(playerIds, event\.pitcherId\)/, "Only the event pitcher should get batter/out/run line stats");
mustMatch(pitcherStatsBody, /else if \(!isPitcherOfRecord\)[\s\S]*return;/, "Untagged legacy pitches should stay with the event pitcher only");

mustMatch(stylesCss, /scoring-dock-change-pitcher-btn[\s\S]*border: 1px solid rgba\(245, 189, 33, 0\.38\)/, "Change button should have compact visible button styling");
mustMatch(stylesCss, /scoring-dock-pitcher-main[\s\S]*align-items: center/, "Pitcher info row should vertically center its children");
mustMatch(stylesCss, /scoring-dock-pitcher-main \.scoring-dock-change-pitcher-btn[\s\S]*margin-left: auto/, "Change button should align to the right within the pitcher info row");
mustMatch(stylesCss, /scoring-dock-change-pitcher-btn:hover/, "Change button should have a hover state");
mustMatch(stylesCss, /scoring-dock-change-pitcher-btn:focus-visible/, "Change button should have a keyboard focus state");
assert.equal(/scoring-dock-pitcher-card:hover/.test(stylesCss), false, "Pitcher status card itself should not present as the click target");
mustMatch(stylesCss, /\.pitcher-select-modal[\s\S]*width: min\(100%, 560px\)/, "Select Pitcher modal should have dedicated layout styles");
mustMatch(stylesCss, /\.pitcher-select-option[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto/, "Pitcher options should use grid for jersey, player copy, and status");

console.log("Pitcher selection regression checks passed.");
