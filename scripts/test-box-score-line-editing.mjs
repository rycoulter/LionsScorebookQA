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
  const match = new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
  const start = match?.index ?? -1;
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /id="boxScoreEditBtn"[\s\S]*Edit Box Score/, "Desktop box score should have an edit button");
mustMatch(indexHtml, /id="boxScoreMobileEditBtn"[\s\S]*Edit/, "Mobile box score should have an edit button");
mustMatch(indexHtml, /id="boxScoreEditModal"[\s\S]*Edit Box Score/, "Box score edit modal should exist");
mustMatch(indexHtml, /id="boxScoreEditFields"/, "Box score edit modal should have dynamic fields");
mustMatch(indexHtml, /id="boxScoreEditForm"/, "Box score edit modal should have a save form");
mustMatch(indexHtml, /id="boxScoreSummary"[\s\S]*id="boxScoreStars"[\s\S]*Line Score/, "Three Stars should render directly below the final score and above the line score");

mustMatch(appJs, /boxScoreEditBtn: document\.getElementById\("boxScoreEditBtn"\)/, "Box score edit button should be registered");
mustMatch(appJs, /boxScoreMobileEditBtn: document\.getElementById\("boxScoreMobileEditBtn"\)/, "Mobile box score edit button should be registered");
mustMatch(appJs, /boxScoreStars: document\.getElementById\("boxScoreStars"\)/, "Three Stars render target should be registered");
mustMatch(appJs, /boxScoreLineEdits/, "Game-level box score line edit storage should exist");

const renderBody = functionBody(appJs, "renderBoxScore");
mustMatch(renderBody, /setBoxScoreEditButtonsVisible\(false\)/, "Edit buttons should hide when no game is selected");
mustMatch(renderBody, /setBoxScoreEditButtonsVisible\(isAdminMode\(\)\)/, "Edit buttons should only display in admin mode");
mustMatch(renderBody, /renderBoxScoreStars\(game, teams\)/, "Box score should render Three Stars for the selected game");

const openBody = functionBody(appJs, "openBoxScoreEditModal");
mustMatch(openBody, /requireAdminAccess\("Admin sign-in required to edit box scores\."\)/, "Opening the editor should require admin access");
mustMatch(openBody, /renderBoxScoreEditForm\(game\)/, "Opening the editor should render current game values");

const lineBody = functionBody(appJs, "boxScoreLineForTeam");
mustMatch(lineBody, /boxScoreLineEditForTeam\(game, team\.key\)/, "Line score should look up saved box score edits");
mustMatch(lineBody, /normalizeBoxScoreLineEdit\(edit, innings, computedLine\)/, "Line score should apply normalized overrides");

const hitterScoreBody = functionBody(appJs, "boxScoreHitterStarScore");
mustMatch(hitterScoreBody, /\(\(row\.h \|\| 0\) \* 3\)/, "Hitter star score should weight hits");
mustMatch(hitterScoreBody, /\(\(row\.rbi \|\| 0\) \* 3\)/, "Hitter star score should weight RBI");
mustMatch(hitterScoreBody, /\(\(row\.r \|\| 0\) \* 2\)/, "Hitter star score should weight runs");
mustMatch(hitterScoreBody, /\(\(row\.bb \|\| 0\) \* 1\)/, "Hitter star score should include walks");
mustMatch(hitterScoreBody, /\(\(row\.hbp \|\| 0\) \* 1\)/, "Hitter star score should include HBP");
mustMatch(hitterScoreBody, /\(\(row\.sb \|\| 0\) \* 2\)/, "Hitter star score should weight stolen bases");
mustMatch(hitterScoreBody, /\(\(row\.doubles \|\| 0\) \* 1\)/, "Hitter star score should include doubles");
mustMatch(hitterScoreBody, /\(\(row\.triples \|\| 0\) \* 2\)/, "Hitter star score should include triples");
mustMatch(hitterScoreBody, /\(\(row\.hr \|\| 0\) \* 4\)/, "Hitter star score should weight home runs");
mustMatch(hitterScoreBody, /\(\(row\.so \|\| 0\) \* 0\.5\)/, "Hitter star score should penalize strikeouts");

const pitcherScoreBody = functionBody(appJs, "boxScorePitcherStarScore");
mustMatch(pitcherScoreBody, /\(inningsPitched \* 3\)/, "Pitcher star score should weight innings pitched");
mustMatch(pitcherScoreBody, /\(\(row\.so \|\| 0\) \* 1\.5\)/, "Pitcher star score should weight strikeouts");
mustMatch(pitcherScoreBody, /\(\(row\.w \|\| 0\) \* 4\)/, "Pitcher star score should include wins");
mustMatch(pitcherScoreBody, /\(\(row\.sv \|\| 0\) \* 3\)/, "Pitcher star score should include saves");
mustMatch(pitcherScoreBody, /\(qualityStart \* 3\)/, "Pitcher star score should include quality starts");
mustMatch(pitcherScoreBody, /\(earnedRuns \* 4\)/, "Pitcher star score should penalize earned runs");
mustMatch(pitcherScoreBody, /\(\(row\.h \|\| 0\) \* 0\.75\)/, "Pitcher star score should penalize hits");
mustMatch(pitcherScoreBody, /\(\(row\.bb \|\| 0\) \* 1\)/, "Pitcher star score should penalize walks");
mustMatch(pitcherScoreBody, /\(\(row\.hbp \|\| 0\) \* 1\)/, "Pitcher star score should penalize HBP");

const starsBody = functionBody(appJs, "boxScoreThreeStars");
mustMatch(starsBody, /boxScoreHitterStarScore\(row\)/, "Three Stars should score hitters with the hitter score helper");
mustMatch(starsBody, /boxScorePitcherStarScore\(row\)/, "Three Stars should score pitchers with the pitcher score helper");
mustMatch(starsBody, /\.slice\(0, 3\)/, "Three Stars should select the top three candidates");
mustMatch(appJs, /Three Stars will be generated when game statistics are available\./, "Three Stars should include the requested empty state");
mustMatch(appJs, /function boxScoreBaseRunningEvents/, "Three Stars should account for non-PA base-running events");
mustMatch(appJs, /typeLabel: star\.types\.size > 1 \? "Two-Way"/, "Two-way players should get a Two-Way badge");

const teamFormBody = functionBody(appJs, "renderBoxScoreEditTeam");
["data-box-score-edit-inning", "data-box-score-edit-field=\"runs\"", "data-box-score-edit-field=\"hits\"", "data-box-score-edit-field=\"errors\""].forEach((snippet) => {
  mustMatch(teamFormBody, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Editor should include ${snippet}`);
});

const saveBody = functionBody(appJs, "saveBoxScoreEdit");
mustMatch(saveBody, /collectBoxScoreEditForTeam\("lions", innings\)/, "Saving should collect Lions line score edits");
mustMatch(saveBody, /collectBoxScoreEditForTeam\("opponent", innings\)/, "Saving should collect opponent line score edits");
mustMatch(saveBody, /game\.score = \{[\s\S]*lions: lionsEdit\.runs,[\s\S]*opponent: opponentEdit\.runs/, "Saving should update total runs on game.score");
mustMatch(saveBody, /syncScoreBySide\(game\)/, "Saving should keep side-based score fields aligned");
mustMatch(saveBody, /markSharedGamesDirty\(game\.id\)/, "Saving should mark the game dirty for shared sync");
mustMatch(saveBody, /queueCompletedGameSync\(game\.id, \{ reason: "box-score-edit" \}\)/, "Saving a final game should queue completed-game sync");
mustMatch(saveBody, /requestSharedSnapshotSync\("box-score-edit"\)/, "Saving should request shared snapshot sync");

mustMatch(stylesCss, /\.box-score-edit-modal-card/, "Box score edit modal should be styled");
mustMatch(stylesCss, /\.box-score-edit-innings[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(58px, 1fr\)\)/, "Inning inputs should use a responsive grid");
mustMatch(stylesCss, /\.box-score-edit-totals[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, "Total inputs should use a three-column grid");
mustMatch(stylesCss, /\.box-score-stars-grid[\s\S]*grid-template-columns: minmax\(240px, 1\.18fr\) minmax\(210px, 0\.91fr\) minmax\(210px, 0\.91fr\)/, "Three Stars should use a horizontal desktop card layout with a larger first slot");
mustMatch(stylesCss, /\.box-score-star-card\.is-first[\s\S]*box-shadow/, "First Star should receive a gold glow");
mustMatch(stylesCss, /\.box-score-star-badge/, "Three Stars should style the Hitting/Pitching/Two-Way badge");

console.log("Box score line editing checks passed.");
