import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");
const supabaseStorageJs = readFileSync(join(rootDir, "supabase-storage.js"), "utf8");
const notFoundHtml = readFileSync(join(rootDir, "404.html"), "utf8");
const bracketEngineJs = readFileSync(join(rootDir, "bracket-engine.js"), "utf8");
const supabaseSchemaSql = readFileSync(join(rootDir, "supabase-schema.sql"), "utf8");
const tournamentTypes = readFileSync(join(rootDir, "tournament-types.d.ts"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function mustNotMatch(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /id="homeNextGameBracketBtn"[\s\S]*View Bracket/, "Home next-game card should include a bracket button");
mustMatch(indexHtml, /id="homeNextGamePostseasonBadge"[\s\S]*Playoff Game/, "Home next-game card should include a visible postseason badge");
assert.equal(indexHtml.includes('id="archiveBracketBtn"'), false, "Past Games toolbar should not include a separate View Bracket button");
mustMatch(indexHtml, /id="archiveGameTypeSelect"[\s\S]*Regular Season[\s\S]*Post Season/, "Past Games should include a regular/postseason selector");
mustMatch(indexHtml, /id="archivePostseasonBracketPanel"[\s\S]*id="archiveBracketGrid"/, "Past Games should include an inline postseason bracket panel");
mustMatch(indexHtml, /id="archiveBracketToggleBtn"[\s\S]*Minimize Bracket/, "Past Games inline bracket should include a minimize control");
mustMatch(indexHtml, /id="playoffBracketView" data-panel="bracket"/, "Public playoff bracket view should exist");
mustMatch(indexHtml, /id="playoffBracketEditor" data-admin-only hidden/, "Bracket editor should be admin-only");
mustMatch(indexHtml, /bracket-engine\.js\?v=/, "Bracket engine should load before app.js");
mustMatch(indexHtml, /id="playoffBracketTemplateBtn"[\s\S]*Pittsburgh Preset/, "Editor should include the Pittsburgh preset action");
mustMatch(indexHtml, /id="playoffBracketPreviewBtn"[\s\S]*View Bracket/, "Editor should include a bracket preview action");

mustMatch(bracketEngineJs, /ScorebookBracketEngine/, "Dedicated bracket engine should be exposed");
mustMatch(bracketEngineJs, /function createPittsburghNabaAaTemplate/, "Engine should include a Pittsburgh NABA AA preset");
mustMatch(bracketEngineJs, /function resolveTournament/, "Engine should resolve bracket participants");
mustMatch(bracketEngineJs, /function applyMatchupResult/, "Engine should apply matchup results");
mustMatch(bracketEngineJs, /winnerSource\("AA-1"\)|winnerSource\('AA-1'\)/, "Preset should route winners by matchup code");
mustMatch(bracketEngineJs, /loserSource\("AA-1"\)|loserSource\('AA-1'\)/, "Preset should route losers by matchup code");
mustMatch(bracketEngineJs, /matchupCode:\s*"AA-10"[\s\S]*slotA:\s*winnerSource\("AA-4"\)[\s\S]*slotB:\s*winnerSource\("AA-7"\)/, "Left semifinal should be AA-4 winner vs AA-7 survivor");
mustMatch(bracketEngineJs, /matchupCode:\s*"AA-9"[\s\S]*slotA:\s*winnerSource\("AA-5"\)[\s\S]*slotB:\s*winnerSource\("AA-8"\)/, "Right semifinal should be AA-5 winner vs AA-8 survivor");
mustMatch(bracketEngineJs, /matchupCode:\s*"AAPNC-1"[\s\S]*slotA:\s*winnerSource\("AA-10"\)[\s\S]*slotB:\s*winnerSource\("AA-9"\)/, "Championship should receive the two semifinal winners");
mustMatch(tournamentTypes, /export interface Tournament[\s\S]*entries: TournamentEntry\[\][\s\S]*matchups: TournamentMatchup\[\]/, "Tournament TypeScript contract should describe entries and matchups");
mustMatch(tournamentTypes, /export interface TournamentMatchup[\s\S]*winnerDestination[\s\S]*loserDestination/, "Matchup TypeScript contract should include advancement destinations");

mustMatch(appJs, /PUBLIC_READ_VIEWS = new Set\([\s\S]*"bracket"/, "Bracket view should be public-readable");
mustMatch(appJs, /VIEW_ROUTES = \{[\s\S]*bracket:\s*"\/bracket"/, "Bracket should have a canonical route");
mustMatch(appJs, /ROUTE_VIEW_ALIASES = \{[\s\S]*"\/playoff-bracket":\s*"bracket"/, "Bracket route aliases should be available");
mustMatch(appJs, /format:\s*"double-elimination"/, "Bracket state should be marked double-elimination");
mustMatch(functionBody(appJs, "normalizeBracketStatus"), /"bye"/, "Bracket status should support byes");
mustMatch(functionBody(appJs, "normalizeBracketSideKey"), /losers[\s\S]*championship[\s\S]*bye/, "Bracket side normalization should support losers, championship, and bye regions");
mustMatch(functionBody(appJs, "normalizeBracketMatchup"), /bracketSection[\s\S]*roundNumber[\s\S]*displayOrder[\s\S]*winnerSide/, "Bracket matchup normalization should preserve engine routing fields");
mustMatch(functionBody(appJs, "normalizePlayoffBracket"), /sourceMatchups[\s\S]*normalizeBracketMatchup[\s\S]*bracketEngine\.resolveTournament/, "Saved bracket display should resolve from canonical matchups");
mustMatch(functionBody(appJs, "seedDoubleElimBracketDraftTemplate"), /bracketEngine\.createTemplate/, "Template action should load through the bracket engine");
mustMatch(functionBody(appJs, "playoffBracketRegions"), /"bye", "winners", "losers", "championship"/, "Public renderer should group bracket regions");
mustMatch(functionBody(appJs, "bracketPlaceholderTeam"), /Winner|Loser|seed|tbd/i, "Future bracket slots should be detected as placeholders");
mustMatch(functionBody(appJs, "renderBracketTeamRow"), /bracketPlaceholderTeam\(team\)[\s\S]*bracketTrophyIconMarkup/, "Future bracket slots should use trophy icons instead of team logos");
mustMatch(functionBody(appJs, "renderBracketMatchup"), /data-game-action="boxscore"[\s\S]*playoff-bracket-card-link/, "Linked bracket games should open box scores from the card");
mustMatch(functionBody(appJs, "renderBracketRound"), /data-bracket-round-index[\s\S]*--bracket-round-offset[\s\S]*data-bracket-matchup-index/, "Bracket rounds should expose deterministic spacing offsets inside grid columns");
mustMatch(functionBody(appJs, "renderBracketRegion"), /--round-count[\s\S]*playoff-bracket-region-canvas[\s\S]*playoff-bracket-connector-layer[\s\S]*playoff-bracket-columns/, "Bracket regions should render a measured canvas, connector layer, and round grid");
mustMatch(functionBody(appJs, "playoffBracketUsesTwoWingLayout"), /pittsburgh-naba-aa[\s\S]*AA-9[\s\S]*AA-10[\s\S]*AAPNC-1/, "NABA AA brackets should use the two-wing public layout");
mustMatch(functionBody(appJs, "renderBracketWingCanvas"), /wing === "right" \? "rtl" : "ltr"[\s\S]*playoff-bracket-wing-canvas[\s\S]*data-bracket-flow/, "Two-wing bracket sides should expose directional connector flow");
mustMatch(functionBody(appJs, "renderBracketCenterStage"), /AAPNC-1[\s\S]*AAPNC-2[\s\S]*AAPNC-3/, "Two-wing bracket center should render championship series cards");
mustMatch(functionBody(appJs, "renderTwoWingPlayoffBracketBoard"), /Left Bracket[\s\S]*renderBracketCenterStage[\s\S]*Right Bracket/, "NABA AA bracket board should render left, center, and right sections");
mustMatch(functionBody(appJs, "renderPlayoffBracketBoard"), /playoff-bracket-board playoff-bracket-board-double/, "Bracket board markup should be reusable by Past Games and the bracket page");
mustMatch(functionBody(appJs, "positionPlayoffBracketAtChampionship"), /playoff-bracket-center-stage[\s\S]*centerPoint[\s\S]*grid\.scrollLeft/, "Two-wing bracket views should initially center on the championship stage");
mustMatch(functionBody(appJs, "renderPlayoffBracketCanvasConnectors"), /playoff-bracket-connector-layer[\s\S]*playoff-bracket-node-wrap[\s\S]*getBoundingClientRect/, "Connector layer should be measured from actual rendered matchup cards");
mustMatch(functionBody(appJs, "renderPlayoffBracketCanvasConnectors"), /bracketFlow === "rtl"[\s\S]*sourceRect\.left[\s\S]*targetRect\.right/, "Connector layer should support right-to-left bracket flow");
mustMatch(functionBody(appJs, "setupPlayoffBracketConnectorObservers"), /ResizeObserver[\s\S]*playoff-bracket-region-canvas[\s\S]*playoff-bracket-node-wrap/, "Connector layer should recalculate when the bracket canvas or cards resize");
mustMatch(functionBody(appJs, "queuePlayoffBracketConnectorRender"), /requestAnimationFrame[\s\S]*renderPlayoffBracketConnectors/, "Connector rendering should be queued after layout");
mustMatch(functionBody(appJs, "renderArchivePostseasonBracket"), /playoffBracketDisplayData\(archiveSeasonFilter[\s\S]*renderPlayoffBracketBoard/, "Past Games postseason filter should render the bracket above archived games");
mustMatch(functionBody(appJs, "renderArchivePostseasonBracket"), /positionPlayoffBracketAtChampionship\(els\.archiveBracketGrid\)/, "Past Games bracket should initially center on the championship stage");
mustMatch(functionBody(appJs, "updateArchivePostseasonBracketCollapseUi"), /archivePostseasonBracketCollapsed[\s\S]*archiveBracketToggleBtn[\s\S]*archiveBracketGrid\.hidden/, "Past Games bracket should support inline minimize and expand behavior");
mustMatch(functionBody(appJs, "renderArchivePostseasonBracket"), /queuePlayoffBracketConnectorRender/, "Past Games postseason bracket should redraw connectors after rendering");
mustMatch(functionBody(appJs, "gameMatchesArchiveFilters"), /selectedSeason[\s\S]*startsWith[\s\S]*gameIsPostseason/, "Past Games should filter by selected season before regular/postseason type");

mustMatch(functionBody(appJs, "renderHome"), /gameIsPostseason\(next\)[\s\S]*homeNextGameBracketBtn/, "Home bracket button should only show for postseason games");
mustMatch(functionBody(appJs, "renderHome"), /nextIsPostseason[\s\S]*homeHeroPanel[\s\S]*homeNextGamePostseasonBadge/, "Home next-game card should toggle postseason visual treatment");
mustNotMatch(functionBody(appJs, "renderHome"), /home-offseason-bracket-frame/, "Home offseason dashboard should not render or center the full bracket frame");
mustMatch(functionBody(appJs, "renderHome"), /positionHomeCompactBracketAtChampionship[\s\S]*home-compact-bracket-scroll/, "Home offseason dashboard should center the compact bracket scroller on the championship");
mustMatch(functionBody(appJs, "renderHomeOffseasonPlayoffCenter"), /home-offseason-playoff-compact-card[\s\S]*renderHomeOffseasonCompactBracket/, "Home offseason playoff center should use the compact bracket preview");
mustNotMatch(functionBody(appJs, "renderHomeOffseasonPlayoffCenter"), /renderPlayoffBracketBoard/, "Home offseason playoff center should not use the full bracket board");
mustMatch(functionBody(appJs, "renderHomeOffseasonCompactBracket"), /home-compact-bracket[\s\S]*View Full Bracket[\s\S]*home-compact-bracket-scroll[\s\S]*is-two-wing/, "Home compact bracket should render a scrollable two-wing card with a full-bracket action");
mustMatch(functionBody(appJs, "homeOffseasonCompactTwoWingLayout"), /"BYE-1", "AA-1", "AA-6"[\s\S]*"AA-4", "AA-7"[\s\S]*"AA-10"[\s\S]*"AA-9"[\s\S]*"AA-5", "AA-8"[\s\S]*"AA-3", "AA-2"[\s\S]*"AAPNC-1", "AAPNC-2", "AAPNC-3"/, "Home compact bracket should preserve the two-sided NABA bracket flow");
mustMatch(functionBody(appJs, "renderHomeOffseasonCompactChampionship"), /data-home-compact-bracket-center[\s\S]*Championship[\s\S]*slice\(0, 1\)/, "Home compact bracket should expose a centered championship stage");
mustMatch(functionBody(appJs, "positionHomeCompactBracketAtChampionship"), /data-home-compact-bracket-center[\s\S]*scrollLeft/, "Home compact bracket centering should use the compact championship stage");
mustMatch(functionBody(appJs, "renderPlayoffBracket"), /positionPlayoffBracketAtChampionship\(els\.playoffBracketGrid\)[\s\S]*queuePlayoffBracketConnectorRender/, "Public bracket page should initially center on the championship stage and redraw connectors");
mustMatch(functionBody(appJs, "renderPlayoffBracketAction"), /gameIsPostseason\(game\)[\s\S]*data-game-action="bracket"/, "Reusable bracket action should be postseason-only");
mustMatch(functionBody(appJs, "handleGameActionClick"), /gameAction === "bracket"[\s\S]*openPlayoffBracket\(\)/, "Game action handler should open the bracket");
mustMatch(functionBody(appJs, "handlePlayoffBracketEditorInput"), /key === "winner"[\s\S]*matchup\.winnerSide = matchup\.winner/, "Winner edits should persist both winner fields for advancement");
mustMatch(functionBody(appJs, "normalizeState"), /nextState\.playoffBracket = normalizePlayoffBracket/, "Saved state should normalize bracket data");
mustMatch(functionBody(appJs, "previewPlayoffBracketDraft"), /playoffBracketPreviewDraft = normalizePlayoffBracket\(draft, state\.games\)[\s\S]*openPlayoffBracket\(\{ preview: true \}\)/, "Preview should render the unsaved draft without saving it");
mustMatch(functionBody(appJs, "renderPlayoffBracketEditor"), /const showEditor = admin && gameFilter === "postseason" && scheduleBracketEditorOpen/, "Editor should only show from the Post Season builder action");
mustMatch(functionBody(appJs, "renderGuidedPlayoffBracketEditor"), /Step 1[\s\S]*Tournament Details[\s\S]*Step 2[\s\S]*Teams and Seeding[\s\S]*Step 5[\s\S]*Review and Publish/, "Editor should render a guided tournament workflow");
mustMatch(functionBody(appJs, "renderPlayoffBracketSeedRows"), /data-bracket-entry-action="up"[\s\S]*data-bracket-entry-action="down"/, "Seeds should support accessible up/down ordering");
mustMatch(functionBody(appJs, "renderBracketEditorMatchup"), /Winner to[\s\S]*Loser to[\s\S]*data-bracket-matchup-key="winner"/, "Matchup editor should expose readable routes and winner selection");
mustMatch(functionBody(appJs, "buildSharedSnapshot"), /playoffBracket:\s*deepClone\(sourceState\?\.playoffBracket/, "Shared snapshot should include the playoff bracket");
mustMatch(functionBody(appJs, "syncSharedSnapshot"), /upsertPlayoffBracket[\s\S]*snapshot\.playoffBracket/, "Shared sync should write playoff bracket rows to Supabase tournament tables");
mustMatch(functionBody(appJs, "savePlayoffBracket"), /syncSharedPlayoffBracketChangeOrAlert\("playoff-bracket"\)/, "Saving the bracket should request tournament-table sync with visible failure handling");

mustMatch(supabaseStorageJs, /playoff_bracket: deepClone\(state\?\.playoffBracket/, "Shared app state should write playoff bracket metadata");
mustMatch(supabaseStorageJs, /remoteMetadata\.playoff_bracket[\s\S]*nextState\.playoffBracket/, "Shared app state should read playoff bracket metadata");
mustMatch(supabaseStorageJs, /function fetchPlayoffBrackets\(\)[\s\S]*from\("tournaments"\)[\s\S]*from\("tournament_entries"\)[\s\S]*from\("tournament_matchups"\)/, "Supabase bootstrap should read playoff bracket tournament tables");
mustMatch(supabaseStorageJs, /function upsertPlayoffBracket\(bracket\)[\s\S]*from\("tournaments"\)[\s\S]*from\("tournament_entries"\)[\s\S]*from\("tournament_matchups"\)/, "Supabase sync should write playoff bracket tournament tables");
mustMatch(supabaseStorageJs, /mergeRemoteSnapshot\(baseState, appStateRow, gamesRows, rosterRows = \[\], highlightRows = \[\], newsRows = undefined, playoffBrackets = undefined\)/, "Remote snapshot merge should accept playoff bracket rows from tournament tables");
mustMatch(notFoundHtml, /bracket:\s*true/, "Deep-link fallback should allow /bracket");

mustMatch(supabaseSchemaSql, /create table if not exists public\.tournaments/i, "Schema should create tournaments");
mustMatch(supabaseSchemaSql, /create table if not exists public\.tournament_entries/i, "Schema should create tournament entries");
mustMatch(supabaseSchemaSql, /create table if not exists public\.tournament_matchups/i, "Schema should create tournament matchups");
mustMatch(supabaseSchemaSql, /create table if not exists public\.tournament_audit_log/i, "Schema should create tournament audit logs");
mustMatch(supabaseSchemaSql, /Public read published tournaments/i, "Public tournament reads should be limited to published brackets");
mustMatch(supabaseSchemaSql, /Authenticated write tournaments[\s\S]*public\.app_admins/i, "Tournament writes should be admin-only");

mustMatch(stylesCss, /\.playoff-bracket-shell\s*\{[\s\S]*linear-gradient/, "Bracket page should use themed shell styling");
mustMatch(stylesCss, /\.playoff-bracket-grid\s*\{[\s\S]*scroll-snap-type: x proximity/, "Bracket page should scroll horizontally with snap behavior");
mustMatch(stylesCss, /\.playoff-bracket-board\s*\{[\s\S]*--round-width: 310px[\s\S]*--round-gap: 72px[\s\S]*min-width: 100%/, "Bracket board should size from round variables instead of a fixed clipped canvas");
mustMatch(stylesCss, /@media \(max-width: 760px\)[\s\S]*\.playoff-bracket-grid\s*\{[\s\S]*overflow-x: visible[\s\S]*scroll-snap-type: none/, "Mobile bracket grid should stop acting like one giant horizontal scroller");
mustMatch(stylesCss, /@media \(max-width: 760px\)[\s\S]*\.playoff-bracket-board\s*\{[\s\S]*--round-width: min\(286px, calc\(100vw - 88px\)\)[\s\S]*--round-gap: 42px/, "Mobile bracket rounds should fit the viewport while preserving horizontal navigation");
mustMatch(stylesCss, /@media \(max-width: 760px\)[\s\S]*\.playoff-bracket-region-canvas\s*\{[\s\S]*overflow-x: auto[\s\S]*scroll-snap-type: x mandatory/, "Mobile bracket regions should own horizontal round scrolling");
mustMatch(stylesCss, /\.playoff-bracket-region::after\s*\{[\s\S]*linear-gradient\(90deg/, "Mobile bracket regions should include a subtle horizontal scroll affordance");
mustMatch(stylesCss, /\.playoff-bracket-board-double\s*\{[\s\S]*grid-template-columns: 1fr[\s\S]*"winners"[\s\S]*"losers"[\s\S]*"championship"/, "Bracket page should stack bracket regions in normal flow");
mustMatch(stylesCss, /\.playoff-bracket-region-canvas\s*\{[\s\S]*width: max-content[\s\S]*overflow: visible/, "Each bracket region should have a visible scroll canvas");
mustMatch(stylesCss, /\.playoff-bracket-connector-layer\s*\{[\s\S]*position: absolute[\s\S]*pointer-events: none[\s\S]*z-index: 0/, "Connector layer should sit behind cards without affecting layout");
mustMatch(stylesCss, /\.playoff-bracket-columns\s*\{[\s\S]*grid-template-columns: repeat\(var\(--round-count, 1\), var\(--round-width\)\)[\s\S]*column-gap: var\(--round-gap\)[\s\S]*padding: 0 var\(--bracket-horizontal-padding\) 32px/, "Round columns should use CSS grid flow with dedicated width and padding");
mustMatch(stylesCss, /\.playoff-bracket-matchups\s*\{[\s\S]*padding-top: var\(--bracket-round-offset/, "Bracket rounds should use offset spacing instead of stacked space-around");
mustMatch(stylesCss, /\.playoff-bracket-column:not\(:last-child\) \.playoff-bracket-node-wrap::after\s*\{[\s\S]*content: none/, "Old pseudo-element connector lines should be disabled");
mustMatch(stylesCss, /\.playoff-bracket-team-placeholder-icon\s*\{/, "Future bracket team slots should have trophy icon styling");
mustMatch(stylesCss, /\.archive-postseason-bracket\s*\{/, "Past Games postseason bracket should have dedicated spacing");
mustMatch(stylesCss, /\.archive-postseason-bracket\.is-minimized\s*\{/, "Minimized Past Games bracket should have compact spacing");
mustMatch(stylesCss, /\.archive-bracket-toggle\s*\{/, "Past Games bracket minimize control should be styled");
mustMatch(stylesCss, /\.playoff-bracket-card\.is-clickable\s*\{/, "Linked bracket cards should feel clickable");
mustMatch(stylesCss, /\.playoff-bracket-region-losers\s*\{/, "Losers bracket region should be styled");
mustMatch(stylesCss, /\.home-next-game-postseason-badge\s*\{[\s\S]*text-transform: uppercase/, "Home postseason badge should be styled as a playoff callout");
mustMatch(stylesCss, /\.playoff-bracket-node\.is-bye\s*\{/, "Bye nodes should be visually distinct");
mustMatch(stylesCss, /\.playoff-bracket-editor\s*\{[\s\S]*margin-bottom/, "Bracket editor should have schedule-page spacing");
mustMatch(stylesCss, /\.playoff-bracket-wizard\s*\{/, "Guided bracket builder should have dedicated styling");
mustMatch(stylesCss, /\.playoff-bracket-admin-matchup\s*\{/, "Admin matchup cards should be styled");

console.log("Playoff bracket view checks passed.");
