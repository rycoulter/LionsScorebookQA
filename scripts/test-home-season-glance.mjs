import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function mustNotMatch(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const snapshotBody = functionBody(appJs, "renderHomeOffseasonSnapshot");
const experienceBody = functionBody(appJs, "renderHomeOffseasonExperience");
const heroBody = functionBody(appJs, "renderHomeOffseasonHero");

mustMatch(heroBody, /Game Archive[\s\S]*archive", "primary"[\s\S]*Playoff Bracket[\s\S]*bracket", "primary"[\s\S]*View Stats[\s\S]*stats", "primary"/, "Offseason hero CTAs should use matching gold primary buttons");
mustMatch(snapshotBody, /Season at a Glance/, "Offseason home should render a Season at a Glance card");
mustMatch(snapshotBody, /label:\s*"Wins"[\s\S]*label:\s*"Losses"[\s\S]*label:\s*"Win %"[\s\S]*label:\s*"Runs"/, "Season glance should include core record and run metrics");
mustMatch(snapshotBody, /label:\s*"Runs Allowed"[\s\S]*label:\s*"Run Differential"[\s\S]*label:\s*"Regular Season Finish"[\s\S]*label:\s*"Playoff Finish"/, "Season glance should include finish and differential metrics");
mustMatch(snapshotBody, /value:\s*"3\/4"/, "Playoff finish should be hardcoded to 3/4 for the 2026 dashboard");
mustMatch(snapshotBody, /overview\.standing/, "Regular season finish should come from standings overview");
mustMatch(functionBody(appJs, "homeSeasonGlanceIcon"), /win:[\s\S]*loss:[\s\S]*percent:[\s\S]*bat:[\s\S]*field:[\s\S]*diff:[\s\S]*standings:[\s\S]*trophy:/, "Season glance should include themed metric icons");

mustMatch(stylesCss, /\.home-offseason-snapshot-grid\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "Season glance should use a 4-column desktop grid");
mustMatch(stylesCss, /@media \(max-width: 760px\)[\s\S]*\.home-offseason-snapshot-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Season glance should collapse to 2 columns on mobile");
mustMatch(stylesCss, /\.home-season-glance-icon\s*\{[\s\S]*border: 1px solid rgba\(245, 189, 33, 0\.72\)/, "Season glance icons should match Lions gold styling");
mustMatch(experienceBody, /home-offseason-dashboard-left[\s\S]*renderHomeOffseasonTeamLeaders\(season\)[\s\S]*renderHomeOffseasonPlayoffCenter\(season, postseasonGames\)/, "Offseason dashboard left column should align season leaders above playoffs");
mustMatch(experienceBody, /home-offseason-dashboard-middle[\s\S]*renderHomeOffseasonSnapshot\(record, winPct, overview\)[\s\S]*renderHomeOffseasonNewsSidebar\(\)/, "Offseason dashboard middle column should align season glance above news");
mustMatch(experienceBody, /home-offseason-dashboard-right[\s\S]*renderHomeOffseasonBestMoments\(recentFinals\)[\s\S]*renderHomeOffseasonFeaturedVideo\(\)/, "Offseason dashboard right column should align storylines above highlight video");
mustNotMatch(experienceBody, /renderHomeOffseasonRoadToNextSeason|renderHomeOffseasonExploreGrid/, "Offseason dashboard should not render the What Comes Next or Offseason Hub sections");
mustMatch(functionBody(appJs, "renderHomeOffseasonCompactBracket"), /home-compact-bracket-link[\s\S]*View Full Bracket[\s\S]*inlineChevronIcon\("right"\)/, "Home compact bracket view-all button should include the shared chevron treatment");
mustMatch(functionBody(appJs, "renderHomeOffseasonTeamLeaders"), /home-offseason-leaders-link[\s\S]*View All Stats[\s\S]*inlineChevronIcon\("right"\)/, "Season leaders view-all button should include the shared chevron treatment");
mustMatch(stylesCss, /\.home-offseason-dashboard-board\s*\{[\s\S]*--home-dashboard-gutter: clamp\(12px, 1\.4vw, 24px\);[\s\S]*padding: 0 var\(--home-dashboard-gutter\) 16px;/, "Offseason dashboard should add a small responsive edge gutter around cards");
mustMatch(stylesCss, /\.home-offseason-dashboard-board \.home-offseason-hero\s*\{[\s\S]*margin-inline: calc\(var\(--home-dashboard-gutter\) \* -1\);/, "Offseason hero should stay full-bleed while the cards get a gutter");
mustMatch(stylesCss, /\.home-offseason-dashboard-grid\s*\{[\s\S]*width: 100%;[\s\S]*margin-inline: 0;/, "Offseason dashboard cards should use the padded dashboard rail instead of a centered max-width rail");
mustMatch(stylesCss, /\.home-offseason-dashboard-board \.home-offseason-snapshot\s*\{[\s\S]*width: 100%;[\s\S]*margin-inline: 0;/, "Season glance card should use the same padded dashboard rail");
mustMatch(stylesCss, /\.home-offseason-dashboard-grid\s*\{[\s\S]*grid-template-columns: minmax\(430px, 1\.12fr\) minmax\(320px, 0\.8fr\) minmax\(420px, 1fr\)/, "Offseason dashboard should use the three-column media-guide layout");
mustMatch(stylesCss, /\.home-offseason-dashboard-right \.home-offseason-moments-track\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "Storylines should use compact tiles above the highlight video");
mustMatch(stylesCss, /\.home-offseason-dashboard-board \.home-offseason-section-head h2,[\s\S]*\.home-offseason-video-heading h2\s*\{[\s\S]*font-size: 1\.08rem;[\s\S]*font-weight: 950/, "Offseason dashboard card headings should use one consistent title style");
mustMatch(stylesCss, /\.home-compact-bracket-link\s*\{[\s\S]*border: 1px solid rgba\(245, 189, 33, 0\.22\)[\s\S]*background: rgba\(255, 255, 255, 0\.04\)/, "View Full Bracket should match the ghost view-all button style");
mustMatch(stylesCss, /\.home-offseason-leaders-link\s*\{[\s\S]*border: 1px solid rgba\(245, 189, 33, 0\.22\)[\s\S]*background: rgba\(255, 255, 255, 0\.04\)/, "View All Stats should match the ghost view-all button style");

console.log("Home season glance checks passed.");
