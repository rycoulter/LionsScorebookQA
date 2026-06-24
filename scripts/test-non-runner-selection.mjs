import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
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

mustMatch(appJs, /NR: \{ label: "Non-runner", pa: false \}/, "Event rules should include NR without a plate appearance");
mustMatch(appJs, /let pendingRunnerReplacementBase = ""/, "Runner replacement state should be tracked");
mustMatch(indexHtml, /data-runner-action="non_runner"[^>]*>NR<\/button>/, "Runner action controls should expose an NR action");
mustMatch(stylesCss, /#scoreView \.runner-action-grid \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/s, "Runner action grid should fit SB, CS, PO, NR, and Balk");

const selectedRunnerActionConfig = functionBody(appJs, "selectedRunnerActionConfig");
mustMatch(selectedRunnerActionConfig, /data-special-action="non_runner"/, "Selected runner panel should include an NR action");
mustMatch(selectedRunnerActionConfig, /eligibleNonRunnerPlayers\(game, base\)\.length > 0/, "NR action should be enabled only when an eligible runner exists");

const scoringStepConfig = functionBody(appJs, "scoringStepConfig");
mustMatch(scoringStepConfig, /scoringStep === "runner_replacement"/, "Scoring panel should render the NR selection state");
mustMatch(scoringStepConfig, /data-runner-replacement-id/, "NR selection should offer replacement runner buttons");
mustMatch(scoringStepConfig, /Future steals and runs score to the NR/, "NR panel should explain stat attribution");

const handleSpecialActionButton = functionBody(appJs, "handleSpecialActionButton");
mustMatch(handleSpecialActionButton, /button\.dataset\.specialAction === "non_runner"[\s\S]*openNonRunnerSelect/, "NR action should open the replacement selector");

const handleScoringPanelClick = functionBody(appJs, "handleScoringPanelClick");
mustMatch(handleScoringPanelClick, /handleSpecialActionButton\(button\)/, "Click handling should route NR actions through the shared special-action helper");
mustMatch(handleScoringPanelClick, /button\.dataset\.runnerReplacementId[\s\S]*assignNonRunner/, "Replacement selection should assign the NR");

const assignNonRunner = functionBody(appJs, "assignNonRunner");
mustMatch(assignNonRunner, /game\.bases\[base\] = replacement\.id/, "NR assignment should replace the base runner");
mustMatch(assignNonRunner, /game\.current\.runners\[base\] = replacement\.id/, "NR assignment should update current runner state");
mustMatch(assignNonRunner, /pushPlayHistorySnapshot\(game, \{ reason: "runnerReplacement", result: "NR" \}\)/, "NR assignment should be undoable from play history");
mustMatch(assignNonRunner, /runnerReplacement: \{[\s\S]*originalRunnerId[\s\S]*replacementRunnerId: replacement\.id/, "NR event should preserve original and replacement IDs");

const recordSteal = functionBody(appJs, "recordSteal");
mustMatch(recordSteal, /const runnerAdvancements = \[/, "Steal events should keep runner advancement metadata");
mustMatch(recordSteal, /runnerAdvancements: deepClone\(runnerAdvancements\)/, "Steal-home runs should credit the actual runner");

console.log("Non-runner selection regression checks passed.");
