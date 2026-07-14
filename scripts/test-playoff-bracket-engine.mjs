import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(rootDir, "bracket-engine.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);

const engine = context.window.ScorebookBracketEngine;
assert.ok(engine, "Bracket engine should attach to window");

const teams = [
  "Oakmont Lions",
  "Pittsburgh D2",
  "South Hills Devils",
  "South Oakland Ducks",
  "BiscuitvilleTownSquare Bandidos",
  "South Side Eagles",
  "Bauerstown Turtles"
];

let tournament = engine.createPittsburghNabaAaTemplate({ season: "2026", teams });
assert.equal(tournament.templateId, "pittsburgh-naba-aa", "Pittsburgh preset should identify its template");
assert.ok(tournament.matchups.some((matchup) => matchup.matchupCode === "BYE-1" && matchup.isBye), "Preset should include a #1 seed bye");
assert.ok(tournament.matchups.some((matchup) => matchup.matchupCode === "AA-1"), "Preset should include AA-1");
assert.ok(tournament.matchups.some((matchup) => matchup.matchupCode === "AA-10"), "Preset should include AA-10");
assert.ok(tournament.matchups.some((matchup) => matchup.matchupCode === "AAPNC-1"), "Preset should include the championship series");

const aa4Before = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-4");
assert.equal(aa4Before.teamA, "Oakmont Lions", "Bye winner should resolve into AA-4 immediately");
assert.equal(aa4Before.teamB, "Winner AA-1", "AA-4 second slot should wait for AA-1");

tournament = engine.applyMatchupResult(tournament, "AA-1", { scoreA: 6, scoreB: 4, status: "final" });
let aa4 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-4");
let aa8 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-8");
assert.equal(aa4.teamB, teams[3], "AA-1 winner should advance to AA-4");
assert.equal(aa8.teamA, teams[4], "AA-1 loser should advance to AA-8");

tournament = engine.applyMatchupResult(tournament, "AA-1", { scoreA: 1, scoreB: 2, status: "final" });
aa4 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-4");
aa8 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-8");
assert.equal(aa4.teamB, teams[4], "Correcting AA-1 should recalculate the winner route");
assert.equal(aa8.teamA, teams[3], "Correcting AA-1 should recalculate the loser route");

tournament = engine.applyMatchupResult(tournament, "AA-2", { scoreA: 3, scoreB: 1, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-3", { scoreA: 2, scoreB: 5, status: "final" });
const aa5 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-5");
const aa6 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-6");
assert.equal(aa5.teamA, teams[6], "AA-3 winner should advance to AA-5");
assert.equal(aa5.teamB, teams[2], "AA-2 winner should advance to AA-5");
assert.equal(aa6.teamA, teams[5], "AA-2 loser should advance to AA-6");
assert.equal(aa6.teamB, teams[1], "AA-3 loser should advance to AA-6");

const circular = engine.resolveTournament({
  season: "2026",
  entries: engine.seedEntries(2, ["A", "B"]),
  matchups: [{
    matchupCode: "LOOP",
    bracketSection: "winners",
    roundNumber: 1,
    slotA: engine.winnerSource("LOOP"),
    slotB: engine.seedSource(2)
  }]
});
assert.ok(circular.validation.some((item) => item.type === "self-reference" || item.type === "circular"), "Engine should detect circular/self references");

console.log("Playoff bracket engine checks passed.");
