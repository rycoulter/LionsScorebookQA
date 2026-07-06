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

mustMatch(indexHtml, /id="bulkStatEditBtn"[^>]*>Enter Game Stats<\/button>/, "Stats page should expose the bulk game stat entry action");
mustMatch(indexHtml, /id="bulkStatEditModal"[\s\S]*id="bulkStatEditGameSelect"/, "Bulk stat modal should include a game selector");
mustMatch(indexHtml, /data-bulk-stat-mode="hitting"[\s\S]*data-bulk-stat-mode="pitching"/, "Bulk stat modal should switch between hitting and pitching");
mustMatch(indexHtml, /id="bulkStatEditBody"/, "Bulk stat modal should have a render target for the stat table");

mustMatch(appJs, /bulkHittingStatFields[\s\S]*rispAB[\s\S]*rispH/, "Bulk hitting fields should include RISP entry");
mustMatch(appJs, /bulkPitchingStatFields[\s\S]*earnedRuns[\s\S]*sv[\s\S]*decision/, "Bulk pitching fields should include earned runs, saves, and decisions");
mustMatch(appJs, /bulkStatEditBtn: document\.getElementById\("bulkStatEditBtn"\)/, "Bulk stat button should be cached");
mustMatch(appJs, /els\.bulkStatEditBtn\?\.addEventListener\("click", openBulkStatEditModal\)/, "Bulk stat button should open the modal");
mustMatch(appJs, /els\.bulkStatEditBody\?\.addEventListener\("click", handleBulkStatEditBodyClick\)/, "Bulk stat body should delegate spray chart buttons");

const renderStatsBody = functionBody(appJs, "renderSeasonStats");
mustMatch(renderStatsBody, /const admin = isAdminMode\(\)/, "Stats rendering should capture the current access mode");
mustMatch(renderStatsBody, /syncStatsAdminVisibility\(admin\)/, "Bulk stat entry should use the shared admin visibility guard");

const gamesBody = functionBody(appJs, "bulkStatEditGames");
mustMatch(gamesBody, /statsGamesForSeason\(statsSeasonFilter, statsGameTypeFilter\)/, "Bulk game picker should use the completed-or-scored stats game list for the selected split");
mustMatch(gamesBody, /sort\(sortGamesNewestFirst\)/, "Bulk game picker should show newest games first");

const hittingTableBody = functionBody(appJs, "renderBulkHittingStatTable");
mustMatch(hittingTableBody, /bulkStatRosterPlayers\(game\)/, "Bulk hitting table should list roster players for the selected game");
mustMatch(hittingTableBody, /bulk-stat-position-col/, "Bulk hitting table should include a compact POS column");
mustMatch(hittingTableBody, /renderBulkHittingPositionSelect\(player, game, draft\.position\)/, "Bulk hitting rows should render a game-position selector");
mustMatch(hittingTableBody, /renderBulkStatPlayerCell\(player, \{ sprayAction: true \}\)/, "Bulk hitting rows should expose a spray chart action");
mustMatch(hittingTableBody, /data-bulk-stat-player="\$\{escapeHtml\(player\.id\)\}"/, "Bulk hitting inputs should be grouped by player");
mustMatch(hittingTableBody, /data-bulk-stat-key="\$\{escapeHtml\(field\.key\)\}"/, "Bulk hitting inputs should be keyed by stat field");

const positionSelectBody = functionBody(appJs, "renderBulkHittingPositionSelect");
mustMatch(positionSelectBody, /data-bulk-stat-key="position"/, "Bulk position selector should save through the shared bulk row collector");
mustMatch(positionSelectBody, /gameStatPositionOptions\(position, fallback\)/, "Bulk position selector should use the shared game-position options");

const playerCellBody = functionBody(appJs, "renderBulkStatPlayerCell");
mustMatch(playerCellBody, /data-bulk-stat-spray-player="\$\{escapeHtml\(player\.id\)\}"/, "Bulk player cell should render per-player spray buttons");
mustMatch(playerCellBody, /Open spray chart for/, "Bulk spray chart button should have an accessible label");

const pitchingTableBody = functionBody(appJs, "renderBulkPitchingStatTable");
mustMatch(pitchingTableBody, /bulkPitchingStatFields/, "Bulk pitching table should render pitching fields");
mustMatch(pitchingTableBody, /renderBulkPitchingInput\(player, field, draft\.stats\)/, "Bulk pitching table should reuse the pitching input renderer");

const collectBody = functionBody(appJs, "collectBulkStatEditRows");
mustMatch(collectBody, /\[data-bulk-stat-player\]\[data-bulk-stat-key\]/, "Bulk save should collect rendered table inputs");
mustMatch(collectBody, /rows\.get\(playerId\)\[key\] = input\.value/, "Bulk save should map each input to a player stat key");

const applyHittingBody = functionBody(appJs, "applyBulkHittingStatRows");
mustMatch(applyHittingBody, /const edits = hittingStatEditMap\(game\)/, "Bulk hitting save should use game-level hitting edit storage");
mustMatch(applyHittingBody, /normalizeManualHittingStats\(raw\)/, "Bulk hitting save should normalize raw row values");
mustMatch(applyHittingBody, /normalizeGameStatPosition\(rawPosition\)/, "Bulk hitting save should normalize game-position selections");
mustMatch(applyHittingBody, /position,/, "Bulk hitting save should persist the selected game position");
mustMatch(applyHittingBody, /const sprays = existing\?\.sprays \|\| \[\]/, "Bulk hitting save should preserve existing spray dots");
mustMatch(applyHittingBody, /hittingStatEditMap\(game\)/, "Bulk hitting save should stay on the same storage path as individual edits");
mustMatch(applyHittingBody, /removeEquivalentHittingStatEdits\(game, player\.id\)/, "Blank bulk hitting rows should clear existing equivalent stat lines when safe");

const openSprayBody = functionBody(appJs, "openBulkStatSprayEditor");
mustMatch(openSprayBody, /persistBulkHittingDraftForSpray\(game\)/, "Opening spray from bulk should save the current hitting draft first");
mustMatch(openSprayBody, /reopenBulkStatEditAfterStatModal = true/, "Opening spray from bulk should return to the bulk editor after close");
mustMatch(openSprayBody, /openStatEditGameModal\(player\.id, game\.id\)/, "Bulk spray button should open the selected player's game spray editor");

const closeStatBody = functionBody(appJs, "closeStatEditGameModal");
mustMatch(closeStatBody, /reopenBulkStatEditAfterStatModal/, "Closing the spray/stat modal should know when to reopen bulk entry");
mustMatch(closeStatBody, /renderBulkStatEditModal\(\)/, "Returning from spray editor should refresh the bulk table");

const applyPitchingBody = functionBody(appJs, "applyBulkPitchingStatRows");
mustMatch(applyPitchingBody, /const edits = pitchingStatEditMap\(game\)/, "Bulk pitching save should use game-level pitching edit storage");
mustMatch(applyPitchingBody, /normalizeManualPitchingStats\(raw\)/, "Bulk pitching save should normalize raw row values");
mustMatch(applyPitchingBody, /manualPitchingStatLineHasValues\(stats\)/, "Blank pitching rows should not create empty pitching edits");
mustMatch(applyPitchingBody, /removeEquivalentPitchingStatEdits\(game, player\.id\)/, "Blank bulk pitching rows should clear existing equivalent stat lines when safe");

const saveBody = functionBody(appJs, "saveBulkStatEditGameStats");
mustMatch(saveBody, /applyBulkPitchingStatRows\(game, rows\)/, "Bulk save should handle pitching mode");
mustMatch(saveBody, /applyBulkHittingStatRows\(game, rows\)/, "Bulk save should handle hitting mode");
mustMatch(saveBody, /markSharedGamesDirty\(game\.id\)/, "Bulk save should mark the game dirty for shared sync");
mustMatch(saveBody, /queueCompletedGameSync\(game\.id, \{ reason \}\)/, "Bulk save should queue completed game sync");
mustMatch(saveBody, /saveStateWithOptions\(\{ liveSyncReason: reason \}\)/, "Bulk save should persist through the existing save path");
mustMatch(saveBody, /render\(\)/, "Bulk save should refresh dependent stat UI");

mustMatch(appJs, /function manualHittingStatLineHasValues/, "Bulk hitting clear behavior should use an explicit manual hitting value check");
mustMatch(stylesCss, /\.bulk-stat-edit-modal[\s\S]*width: min\(calc\(100vw - 32px\), 1180px\)/, "Bulk stat modal should have a compact desktop layout");
mustMatch(stylesCss, /\.bulk-stat-table th:first-child,[\s\S]*position: sticky/, "Bulk stat table should keep the player column sticky");
mustMatch(stylesCss, /\.bulk-stat-table input,[\s\S]*min-height: 30px/, "Bulk stat inputs should be compact and theme-matched");
mustMatch(stylesCss, /\.bulk-stat-table \.bulk-stat-position-select[\s\S]*min-width: 68px/, "Bulk stat position selector should stay compact");
mustMatch(stylesCss, /\.bulk-stat-spray-button[\s\S]*color: var\(--lion-gold\)/, "Bulk spray action should match the Lions stat editor theme");

console.log("Bulk game stat entry checks passed.");
