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

[
  "bulkStatEditBtn",
  "hittingStatsEditHeader",
  "pitchingStatsEditHeader",
  "boxScoreEditBtn",
  "boxScoreMobileEditBtn",
  "boxScoreEditModal",
  "newsEditorView",
  "lineupView",
  "highlightsAdminTools",
  "gameForm",
  "scheduleGameBtn",
  "scheduleBracketBuilderBtn",
  "playoffBracketEditor",
  "addPlayerBtn",
  "homeVisitCounterCard"
].forEach((id) => {
  mustMatch(indexHtml, new RegExp(`id="${id}"[^>]*data-admin-only|data-admin-only[^>]*id="${id}"`), `${id} should be marked admin-only`);
});
mustMatch(indexHtml, /data-roster-admin-actions data-admin-only hidden/, "Roster edit actions should be marked admin-only");
mustMatch(stylesCss, /body\[data-access-mode="public"\] \[data-admin-only\][\s\S]*display: none !important/, "Public mode should hide every marked admin-only surface");

const accessBody = functionBody(appJs, "renderAccessMode");
mustMatch(accessBody, /document\.body\.dataset\.accessMode = admin \? "admin" : "public"/, "Access rendering should expose public mode to the CSS guard");
mustMatch(accessBody, /syncStatsAdminVisibility\(admin\)/, "Access changes should immediately refresh stat admin controls");

const visibilityBody = functionBody(appJs, "syncStatsAdminVisibility");
mustMatch(visibilityBody, /els\.hittingStatsEditHeader\.hidden = !admin/, "Hitting Edit header should follow admin state");
mustMatch(visibilityBody, /els\.pitchingStatsEditHeader\.hidden = !admin/, "Pitching Edit header should follow admin state");
mustMatch(visibilityBody, /els\.boxScoreEditModal/, "Leaving admin mode should close the box score editor");
mustMatch(visibilityBody, /els\.bulkStatEditModal/, "Leaving admin mode should close bulk stat entry");
mustMatch(visibilityBody, /els\.statEditGameModal/, "Leaving admin mode should close hitting stat entry");
mustMatch(visibilityBody, /els\.pitchingStatEditGameModal/, "Leaving admin mode should close pitching stat entry");

const statsBody = functionBody(appJs, "renderSeasonStats");
mustMatch(statsBody, /\$\{admin \? `<td class="stats-row-edit-cell">/, "Desktop stat Edit cells should only render for admins");
mustMatch(statsBody, /\$\{admin \? statsEditButtonMarkup\(player\) : ""\}/, "Mobile hitting edit buttons should only render for admins");
mustMatch(statsBody, /\$\{admin \? pitchingStatsEditButtonMarkup\(player\) : ""\}/, "Mobile pitching edit buttons should only render for admins");
mustMatch(statsBody, /colspan="\$\{admin \? 24 : 23\}"/, "Public empty rows should omit the Edit column width");

console.log("Public admin visibility checks passed.");
