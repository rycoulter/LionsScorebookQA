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
mustMatch(indexHtml, /id="boxScorePrevGameBtn"[\s\S]*Previous Game[\s\S]*id="boxScoreNextGameBtn"[\s\S]*Next Game/, "Desktop box score should include previous and next game navigation buttons");
mustMatch(indexHtml, /id="boxScoreMobilePrevGameBtn"[\s\S]*Prev[\s\S]*id="boxScoreMobileNextGameBtn"[\s\S]*Next/, "Mobile box score should include previous and next game navigation buttons");
mustMatch(indexHtml, /id="boxScoreSummary"[\s\S]*id="boxScoreStars"[\s\S]*Line Score/, "Three Stars should render directly below the final score and above the line score");
mustMatch(indexHtml, /id="boxScoreBattingHead"[\s\S]*id="boxScoreBattingBody"[\s\S]*id="boxScoreBattingFoot"/, "Batting box table should render dynamic head, body, and totals footer targets");

mustMatch(appJs, /boxScoreEditBtn: document\.getElementById\("boxScoreEditBtn"\)/, "Box score edit button should be registered");
mustMatch(appJs, /boxScoreMobileEditBtn: document\.getElementById\("boxScoreMobileEditBtn"\)/, "Mobile box score edit button should be registered");
mustMatch(appJs, /boxScorePrevGameBtn: document\.getElementById\("boxScorePrevGameBtn"\)/, "Desktop previous-game button should be registered");
mustMatch(appJs, /boxScoreMobileNextGameBtn: document\.getElementById\("boxScoreMobileNextGameBtn"\)/, "Mobile next-game button should be registered");
mustMatch(appJs, /boxScorePrevGameBtn\?\.addEventListener\("click", \(\) => navigateBoxScoreGame\("previous"\)\)/, "Previous game button should navigate to the older game");
mustMatch(appJs, /boxScoreNextGameBtn\?\.addEventListener\("click", \(\) => navigateBoxScoreGame\("next"\)\)/, "Next game button should navigate to the newer game");
mustMatch(appJs, /boxScoreStars: document\.getElementById\("boxScoreStars"\)/, "Three Stars render target should be registered");
mustMatch(appJs, /boxScoreBattingHead: document\.getElementById\("boxScoreBattingHead"\)/, "Dynamic batting box header target should be registered");
mustMatch(appJs, /boxScoreBattingFoot: document\.getElementById\("boxScoreBattingFoot"\)/, "Dynamic batting box totals target should be registered");
mustMatch(appJs, /boxScoreLineEdits/, "Game-level box score line edit storage should exist");

const renderBody = functionBody(appJs, "renderBoxScore");
mustMatch(renderBody, /setBoxScoreEditButtonsVisible\(false\)/, "Edit buttons should hide when no game is selected");
mustMatch(renderBody, /setBoxScoreEditButtonsVisible\(isAdminMode\(\)\)/, "Edit buttons should only display in admin mode");
mustMatch(renderBody, /const games = boxScoreGames\(\)/, "Box score should use one sorted game list for selector and navigation");
mustMatch(renderBody, /updateBoxScoreGameNav\(\[\], ""\)/, "Box score game nav should disable when there are no games");
mustMatch(renderBody, /updateBoxScoreGameNav\(games, game\.id\)/, "Box score game nav should refresh disabled state for the selected game");
mustMatch(renderBody, /renderBoxScoreStars\(game, teams\)/, "Box score should render Three Stars for the selected game");
mustMatch(renderBody, /boxScoreBattingRows\(game, selectedTeam, \{ includeBaseRunning: true \}\)/, "Batting box score should include SB and CS base-running lines");
mustMatch(renderBody, /boxScoreBattingColumns\(battingRows\)/, "Batting box score should derive a dynamic column list");
mustMatch(renderBody, /renderBoxScoreBattingHeader\(battingColumns\)/, "Batting box score should render a dynamic header");
mustMatch(renderBody, /renderBoxScoreBattingTotalsRow\(battingRows, battingColumns\)/, "Batting box score should render a totals footer");

const openBody = functionBody(appJs, "openBoxScoreEditModal");
mustMatch(openBody, /requireAdminAccess\("Admin sign-in required to edit box scores\."\)/, "Opening the editor should require admin access");
mustMatch(openBody, /renderBoxScoreEditForm\(game\)/, "Opening the editor should render current game values");

const navBody = functionBody(appJs, "navigateBoxScoreGame");
mustMatch(navBody, /direction === "previous"[\s\S]*index \+ 1/, "Previous navigation should move to the older game in newest-first order");
mustMatch(navBody, /Math\.max\(0, index - 1\)/, "Next navigation should move to the newer game in newest-first order");
mustMatch(navBody, /boxScoreGameId = nextGame\.id/, "Box score navigation should update selected game state");
mustMatch(navBody, /renderBoxScore\(\)/, "Box score navigation should rerender after changing games");

const navStateBody = functionBody(appJs, "updateBoxScoreGameNav");
mustMatch(navStateBody, /button\.disabled = !hasOlderGame/, "Previous game buttons should disable at the oldest game");
mustMatch(navStateBody, /button\.disabled = !hasNewerGame/, "Next game buttons should disable at the newest game");

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
mustMatch(appJs, /function boxScoreLionsPlayerLabel/, "Box score should centralize Lions player labels with roster numbers");
mustMatch(appJs, /function hasBoxScorePlayerNumber/, "Box score should detect player labels that already include jersey numbers");

const battingRowsBody = functionBody(appJs, "boxScoreBattingRows");
mustMatch(battingRowsBody, /boxScoreLionsPlayerLabel\(entry\.playerId\)/, "Lineup batting rows should use roster-number-aware player labels");
mustMatch(battingRowsBody, /boxScoreLionsPlayerLabel\(event\.playerId\)/, "Scored batting events should use roster-number-aware player labels");
mustMatch(battingRowsBody, /!hasBoxScorePlayerNumber\(row\.name\) && hasBoxScorePlayerNumber\(nextName\)[\s\S]*row\.name = nextName/, "Manual stat rows should upgrade earlier no-number labels when a numbered roster label is available");
mustMatch(battingRowsBody, /row\.sac \+= 1/, "Batting rows should track sacrifice columns");
mustMatch(battingRowsBody, /event\.result === "CS"[\s\S]*row\.cs \+= 1/, "Batting rows should track caught stealing from base-running events");

const battingColumnsBody = functionBody(appJs, "boxScoreBattingColumns");
["pa", "avg", "obp", "slg", "ops"].forEach((key) => {
  mustMatch(battingColumnsBody, new RegExp(`key: "${key}"`), `Dynamic batting columns should include ${key.toUpperCase()}`);
});
["doubles", "triples", "hr", "sac", "sb", "cs"].forEach((key) => {
  mustMatch(battingColumnsBody, new RegExp(`hasStat\\("${key}"\\)`), `Dynamic batting columns should conditionally show ${key}`);
});

const ratesBody = functionBody(appJs, "boxScoreBattingRates");
mustMatch(ratesBody, /divide\(row\.h \|\| 0, row\.ab \|\| 0\)/, "Batting rates should calculate AVG from H/AB");
mustMatch(ratesBody, /boxScoreBattingTotalBases\(row\)/, "Batting rates should calculate SLG from total bases");

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
mustMatch(stylesCss, /\.box-score-table tfoot th,[\s\S]*font-weight: 950/, "Batting totals footer should be styled as a totals row");
mustMatch(stylesCss, /\.box-score-game-nav[\s\S]*display: flex/, "Box score game navigation should use flex layout on desktop");
mustMatch(stylesCss, /\.box-score-mobile-game-nav[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Mobile box score game navigation should keep previous and next buttons side by side");

console.log("Box score line editing checks passed.");
