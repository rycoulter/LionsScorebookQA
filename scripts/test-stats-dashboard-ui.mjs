import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(indexHtml, /id="statsPlayerSpotlight"/, "Stats page should include a Player Spotlight card");
assert.match(indexHtml, /id="statsHotBatsGrid"/, "Stats page should include a Hot Bats render target");
assert.match(indexHtml, /class="stats-profile-carousel"[\s\S]*id="statsOffensiveProfile"[\s\S]*id="statsPitchingProfile"/, "Stats profile cards should be grouped for mobile carousel layout");
assert.match(indexHtml, /id="statsOffensiveProfile"/, "Stats page should include an offensive profile card");
assert.match(indexHtml, /id="statsPitchingProfile"/, "Stats page should include a pitching profile card");
assert.match(indexHtml, /id="statsTendenciesPanel"/, "Stats page should include a Team Tendencies panel");
assert.match(indexHtml, /id="statsDashboardEmpty"[\s\S]*No season stats yet\./, "Stats page should include the polished season empty state");
assert.match(indexHtml, /class="stats-spray-copy"[\s\S]*class="stats-spray-legend"[\s\S]*id="toggleStatsSprayBtn"[\s\S]*id="statsTendenciesPanel"/, "Open Spray Chart should sit under the spray legend before Team Tendencies");

const renderSeasonStatsBody = functionBody(appJs, "renderSeasonStats");
assert.match(renderSeasonStatsBody, /renderPlayerSpotlight\(recentHittingRowsForSpotlight\(\)\)/, "Season stats should render the Player Spotlight from recent-game rows");
assert.match(renderSeasonStatsBody, /renderHotBats\(allHittingRows\)/, "Season stats should render Hot Bats from current rows");
assert.match(renderSeasonStatsBody, /renderStatsProfiles\(teamStats\(statsSeasonFilter\), teamPitchingStats\(statsSeasonFilter\)\)/, "Season stats should render profile cards from current season team stats");
assert.match(renderSeasonStatsBody, /renderStatsSprayDashboard\(\)/, "Season stats should refresh spray chart preview and tendencies");
assert.match(renderSeasonStatsBody, /statsThresholdClass\("avg", hit\.avg, hit\.ab > 0\)/, "AVG table cells should get threshold formatting");
assert.match(renderSeasonStatsBody, /statsThresholdClass\("ops", hit\.ops, hit\.pa > 0\)/, "OPS table cells should get threshold formatting");
assert.match(indexHtml, /data-hit-sort="runs">R<\/button>/, "Hitting stats table should show Runs instead of RISP");
assert.doesNotMatch(indexHtml, /data-hit-sort="risp">RISP<\/button>/, "Hitting stats table should not show RISP as a column");
assert.match(renderSeasonStatsBody, /<td>\$\{hit\.runs\}<\/td>/, "Desktop hitting rows should display runs scored");
assert.match(renderSeasonStatsBody, /mobileStatPill\("R", hit\.runs, mobileStatIsLeader\(mobileHittingLeaders, "runs", player\.id\)\)/, "Mobile hitting cards should display runs scored");

const emptyStatsBody = functionBody(appJs, "emptyStats");
assert.match(emptyStatsBody, /runs: 0/, "Hitting stat objects should initialize runs so the table never renders undefined");
const statsForPlayerBody = functionBody(appJs, "statsForPlayer");
assert.match(statsForPlayerBody, /stats\.runs = runsScoredFromEvents\(events, playerId\)/, "Player hitting stats should include runner-attributed runs scored");
const teamStatsBody = functionBody(appJs, "teamStats");
assert.match(teamStatsBody, /stats\.runs = runsScoredFromEvents\(events\)/, "Team offensive profile should include total runs scored");

const renderStatsModeBody = functionBody(appJs, "renderStatsMode");
assert.match(renderStatsModeBody, /showSprayShell = focusedMode \|\| statsMode !== "pitching"/, "Spray chart should stay off the standard pitching stats view");
assert.match(renderStatsModeBody, /els\.statsSprayShell\.hidden = !showSprayShell/, "Stats mode should hide the spray section when pitching is selected");

const renderLeadersBody = functionBody(appJs, "renderLeaders");
assert.match(renderLeadersBody, /leaderCard\("OBP"/, "Hitting leaders should use OBP instead of Hits");
assert.doesNotMatch(renderLeadersBody, /leaderCard\("Hits"/, "Hits should not be one of the preferred leader cards");

const renderStatsProfilesBody = functionBody(appJs, "renderStatsProfiles");
assert.match(renderStatsProfilesBody, /statProfileMetric\("R", String\(hitting\.runs \|\| 0\)\)/, "Offensive profile should show Runs instead of RISP");
assert.doesNotMatch(renderStatsProfilesBody, /statProfileMetric\("RISP"/, "Offensive profile should not show RISP");

const spotlightBody = functionBody(appJs, "renderPlayerSpotlight");
assert.match(appJs, /const PLAYER_SPOTLIGHT_MIN_PA = 5/, "Player Spotlight should require a 5 PA eligibility floor when possible");
assert.match(spotlightBody, /Limited recent sample over \$\{gameWindowLabel\}\./, "Player Spotlight should flag the fallback when no hitter has enough recent PA");
assert.match(spotlightBody, /Best hitter over \$\{gameWindowLabel\} by production score\. Min \$\{PLAYER_SPOTLIGHT_MIN_PA\} PA\./, "Player Spotlight should explain the recent-game production score window and PA floor");
assert.match(spotlightBody, /data-spotlight-player/, "Player Spotlight should expose an action to focus that player");
assert.match(spotlightBody, /statProfileMetric\("R", String\(hit\.runs\)\)/, "Player Spotlight should show runs scored instead of RISP");
assert.doesNotMatch(spotlightBody, /statProfileMetric\("RISP"/, "Player Spotlight should not show RISP as a metric card");

const recentSpotlightBody = functionBody(appJs, "recentHittingRowsForSpotlight");
assert.match(recentSpotlightBody, /statsGamesWithDataForSeason\(statsSeasonFilter\)\.slice\(0, limit\)/, "Player Spotlight should use the latest stat-bearing games in the selected season");
assert.match(recentSpotlightBody, /statsForPlayerInGames\(player\.id, recentGames\)/, "Player Spotlight should aggregate each hitter only across recent games");
const statsForPlayerInGamesBody = functionBody(appJs, "statsForPlayerInGames");
assert.match(statsForPlayerInGamesBody, /stats\.runs = runsScoredForPlayerInGames\(playerId, games\)/, "Player Spotlight recent stats should include runs");
const runsScoredForPlayerInGamesBody = functionBody(appJs, "runsScoredForPlayerInGames");
assert.match(runsScoredForPlayerInGamesBody, /offensiveEventsForStatsGame\(game\)/, "Player Spotlight runs should be calculated from the selected game window");

const exportStatsTableBody = functionBody(appJs, "exportStatsTable");
assert.match(exportStatsTableBody, /"OPS", "R", "OBP"/, "Hitting stats export should include Runs after OPS");
assert.match(exportStatsTableBody, /formatRate\(hit\.ops\),[\s\S]*hit\.runs,[\s\S]*formatRate\(hit\.obp\)/, "Hitting stats export rows should write runs instead of RISP");

const spotlightScoreBody = functionBody(appJs, "playerSpotlightHitterScore");
assert.match(spotlightScoreBody, /boxScoreHitterStarScore/, "Player Spotlight should reuse the Three Stars hitter scoring model");
assert.match(spotlightScoreBody, /r: hit\.runs/, "Player Spotlight score should include runs scored");
assert.match(spotlightScoreBody, /so: hit\.k/, "Player Spotlight score should apply the strikeout penalty from hitter star scoring");

const topSpotlightRowsBody = functionBody(appJs, "topPlayerSpotlightRows");
assert.match(topSpotlightRowsBody, /playerSpotlightHitterScore\(b\) - playerSpotlightHitterScore\(a\)/, "Player Spotlight should rank by weighted production score before rate-stat tie breakers");

const spotlightSelectionBody = functionBody(appJs, "playerSpotlightSelection");
assert.match(spotlightSelectionBody, /\(row\.hit\?\.pa \|\| 0\) >= PLAYER_SPOTLIGHT_MIN_PA/, "Player Spotlight should filter to hitters with enough PA before ranking");
assert.match(spotlightSelectionBody, /topPlayerSpotlightRows\(qualifiedRows, 1\)/, "Player Spotlight should select qualified hitters by production score");
assert.match(spotlightSelectionBody, /limitedSample: false/, "Player Spotlight should mark qualified leaders as normal samples");
assert.match(spotlightSelectionBody, /limitedSample: Boolean\(fallbackRow\)/, "Player Spotlight should fall back with a limited sample indicator");

const sprayDashboardBody = functionBody(appJs, "renderStatsSprayDashboard");
assert.match(sprayDashboardBody, /Spray chart data will appear after balls in play are recorded\./, "Spray preview should have the requested empty state");
assert.match(sprayDashboardBody, /Pull[\s\S]*Center[\s\S]*Oppo[\s\S]*Hits[\s\S]*Outs/, "Tendencies panel should render Pull, Center, Oppo, Hits, and Outs");
const renderStatsSprayChartBody = functionBody(appJs, "renderStatsSprayChart");
assert.match(indexHtml, /id="statsSprayResultFilter"[\s\S]*All results[\s\S]*Hits only[\s\S]*Outs only/, "Stats spray modal should include a result filter");
assert.match(appJs, /statsSprayResultFilter: document\.getElementById\("statsSprayResultFilter"\)/, "Stats spray result filter should be registered in the element map");
assert.match(appJs, /els\.statsSprayResultFilter\?\.addEventListener\("change", renderStatsSprayChart\)/, "Stats spray result filter should rerender the chart on change");
assert.match(renderStatsSprayChartBody, /resultFilter === "hits"[\s\S]*Boolean\(rule\.hit\)/, "Stats spray result filter should show only hits when selected");
assert.match(renderStatsSprayChartBody, /resultFilter === "outs"[\s\S]*Boolean\(rule\.out\)/, "Stats spray result filter should show only outs when selected");

assert.match(stylesCss, /#statsView \.stats-spotlight-card[\s\S]*border-color: rgba\(245, 189, 33, 0\.38\)/, "Spotlight card should use a gold accent border");
assert.match(stylesCss, /#statsView \.stats-spotlight-card[\s\S]*grid-column: 1 \/ -1/, "Spotlight card should span the dashboard width");
assert.match(stylesCss, /#statsView \.stats-spotlight-metrics[\s\S]*repeat\(auto-fit, minmax\(104px, 1fr\)\)/, "Spotlight metrics should wrap before values crowd together");
assert.match(stylesCss, /#statsView \.stats-profile-carousel[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Profile cards should sit side-by-side on larger screens");
assert.match(stylesCss, /#statsView \.stats-profile-carousel[\s\S]*display: flex[\s\S]*scroll-snap-type: x mandatory/, "Profile cards should become a swipe carousel on mobile");
assert.match(stylesCss, /#statsView \.stats-profile-carousel \.stats-profile-card[\s\S]*flex: 0 0 calc\(100% - 64px\)/, "Mobile profile carousel should show one card plus a sliver of the next");
assert.match(stylesCss, /#statsView \.stats-table th:first-child,[\s\S]*position: sticky/, "Stats table should keep the player column sticky");
assert.match(stylesCss, /#statsView \.stats-highlight-cell[\s\S]*color: var\(--lion-gold\)/, "Stat threshold cells should use Lions gold");
assert.match(stylesCss, /#statsView \.stats-hot-bats-grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, "Hot Bats should render as compact desktop cards");
assert.match(stylesCss, /\.stats-spray-feature[\s\S]*grid-template-columns: minmax\(340px, 1\.18fr\) minmax\(220px, 0\.62fr\) minmax\(300px, 0\.82fr\)/, "Spray feature should use three columns with no separate action column");
assert.match(stylesCss, /\.stats-spray-copy \.stats-subhead[\s\S]*padding: 0/, "Spray Chart heading should align with the legend and action");
assert.match(stylesCss, /\.stats-spray-shell\[hidden\][\s\S]*display: none !important/, "Hidden spray chart shell should not display in pitching mode");

console.log("Stats dashboard UI checks passed.");
