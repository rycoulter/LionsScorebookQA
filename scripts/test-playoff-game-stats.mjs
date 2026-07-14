import { strict as assert } from "node:assert";
import fs from "node:fs";

const appJs = fs.readFileSync("app.js", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");
const stylesCss = fs.readFileSync("styles.css", "utf8");

function functionBody(source, name) {
  const pattern = new RegExp(`function ${name}\\s*\\(`);
  const match = pattern.exec(source);
  assert.ok(match, `Missing function ${name}`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = match.index; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart > match.index, `Missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  throw new Error(`Unable to read function ${name}`);
}

assert.match(indexHtml, /id="gameTypeInput"[\s\S]*Postseason \/ Playoff/, "Schedule builder should include a playoff game type field");
assert.match(indexHtml, /id="editGameTypeInput"[\s\S]*Postseason \/ Playoff/, "Game editor should include a playoff game type field");
assert.match(indexHtml, /id="statsGameTypeSelect"/, "Stats page should include a regular/postseason split selector");
assert.match(indexHtml, /id="gameFilterRow"[\s\S]*data-game-filter="regular"[\s\S]*Regular Season[\s\S]*data-game-filter="postseason"[\s\S]*Post Season/, "Schedule filters should split regular season and postseason");
assert.doesNotMatch(indexHtml, /data-game-filter="(?:all|future|completed|postponed)"/, "Schedule should not expose old lifecycle filters");
assert.match(indexHtml, /id="scheduleBracketBuilderBtn"[\s\S]*data-admin-only[\s\S]*Playoff Bracket/, "Postseason schedule tab should include an admin bracket builder action");

assert.match(functionBody(appJs, "normalizeGameType"), /postseason[\s\S]*playoff/, "Game type should normalize playoff values to postseason");
assert.match(functionBody(appJs, "gameIsPostseason"), /game\?\.gameType[\s\S]*isPlayoff/, "Postseason detection should support new and legacy game flags");
assert.match(functionBody(appJs, "normalizeScheduleGameFilter"), /postseason[\s\S]*regular/, "Schedule filters should normalize to regular/postseason only");
assert.match(functionBody(appJs, "gameMatchesScheduleFilter"), /gameIsPostseason\(game\) \? "postseason" : "regular"/, "Schedule type filters should use game postseason status");
assert.match(functionBody(appJs, "createGame"), /gameType: normalizeGameType\(config\.gameType/, "New games should persist gameType");
assert.match(functionBody(appJs, "normalizeGame"), /gameType: normalizeGameType\(game\.gameType/, "Loaded games should normalize gameType");

assert.match(functionBody(appJs, "scheduleGame"), /game\.gameType = normalizeGameType\(els\.gameTypeInput/, "Schedule create should save the selected game type");
assert.match(functionBody(appJs, "saveGameEdits"), /game\.gameType = normalizeGameType\(els\.editGameTypeInput/, "Schedule edit should save the selected game type");
assert.match(functionBody(appJs, "renderGameSetupPreview"), /gameTypePill\(\{ gameType \}\)/, "Create preview should show postseason status");
assert.match(functionBody(appJs, "renderGameEditorPreview"), /gameTypePill\(\{ gameType \}\)/, "Edit preview should show postseason status");

assert.match(functionBody(appJs, "statsGamesForSeason"), /gameMatchesStatsGameType\(game, activeGameType\)/, "Stats game source should filter by regular/postseason split");
assert.match(functionBody(appJs, "populateStatsGameTypeSelect"), /Regular Season[\s\S]*Postseason/, "Stats split select should render regular and postseason options");
assert.match(appJs, /statsGameTypeSelect\?\.addEventListener\("change"[\s\S]*statsGameTypeFilter = normalizeStatsGameTypeFilter/, "Stats split changes should update state");
assert.match(appJs, /mobileHitGameFilter = "all"[\s\S]*mobilePitGameFilter = "all"/, "Changing stat split should reset selected mobile games");
assert.match(functionBody(appJs, "getSeasonHittingRows"), /statsForPlayer\(player\.id, statsSeasonFilter, null, statsGameTypeFilter\)/, "Hitting stats rows should use selected split");
assert.match(functionBody(appJs, "getSeasonPitchingRows"), /pitcherStats\(player\.id, null, statsSeasonFilter, statsGameTypeFilter\)/, "Pitching stats rows should use selected split");
assert.match(functionBody(appJs, "renderLeaders"), /statLeaderMinimumGames\(statsSeasonFilter, statsGameTypeFilter\)/, "Leader qualification should use selected split");
assert.match(functionBody(appJs, "renderStatsSnapshot"), /statsGamesForSeason\(statsSeasonFilter, statsGameTypeFilter\)/, "Team snapshot should use selected split");
assert.match(functionBody(appJs, "exportStatsTable"), /statsGameTypeFilter[\s\S]*splitSuffix[\s\S]*filename/, "Stats exports should include split name in filename");

assert.match(functionBody(appJs, "renderScheduleFeaturedGameCard"), /gameTypePill\(game\)/, "Featured schedule game should display postseason pill");
assert.match(functionBody(appJs, "renderScheduleUpcomingRow"), /gameTypePill\(game\)/, "Upcoming schedule row should display postseason pill");
assert.match(functionBody(appJs, "renderScheduleGameCard"), /gameTypePill\(game\)/, "Schedule cards should display postseason pill");
assert.match(functionBody(appJs, "renderGames"), /scheduleBracketBuilderBtn\.hidden = !admin \|\| !viewingPostseason/, "Bracket builder should only show for admins on the postseason schedule tab");
assert.match(functionBody(appJs, "renderGames"), /scheduleGamesForType\("postseason"/, "Postseason tab should list postseason games by type");
assert.match(stylesCss, /\.game-type-pill\s*\{[\s\S]*text-transform: uppercase;/, "Postseason pill should have themed styling");
assert.match(stylesCss, /\.stats-game-type-chip\s*\{[\s\S]*min-width: 170px;/, "Stats split chip should keep a stable compact width");

console.log("Playoff game stats checks passed.");
