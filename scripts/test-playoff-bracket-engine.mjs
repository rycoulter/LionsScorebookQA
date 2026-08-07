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

tournament = engine.applyMatchupResult(tournament, "AA-4", { scoreA: 5, scoreB: 2, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-5", { scoreA: 4, scoreB: 1, status: "final" });
const aa10 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-10");
const aa9 = tournament.matchups.find((matchup) => matchup.matchupCode === "AA-9");
const championship = tournament.matchups.find((matchup) => matchup.matchupCode === "AAPNC-1");
assert.equal(aa10.teamA, teams[0], "AA-4 winner should advance to left semifinal AA-10");
assert.equal(aa10.teamB, "Winner AA-7", "AA-10 second slot should wait for the AA-7 survivor");
assert.equal(aa9.teamA, teams[6], "AA-5 winner should advance to right semifinal AA-9");
assert.equal(aa9.teamB, "Winner AA-8", "AA-9 second slot should wait for the AA-8 survivor");
assert.equal(championship.teamA, "Winner AA-10", "Championship first slot should come from AA-10");
assert.equal(championship.teamB, "Winner AA-9", "Championship second slot should come from AA-9");

tournament = engine.applyMatchupResult(tournament, "AA-6", { scoreA: 1, scoreB: 3, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-7", { scoreA: 4, scoreB: 2, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-8", { scoreA: 1, scoreB: 5, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-10", { scoreA: 2, scoreB: 6, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AA-9", { scoreA: 7, scoreB: 3, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AAPNC-1", { scoreA: 4, scoreB: 3, status: "final" });
tournament = engine.applyMatchupResult(tournament, "AAPNC-2", { scoreA: 8, scoreB: 6, status: "final" });
assert.equal(tournament.championshipResult.isComplete, true, "Best-of-three should complete after one team wins two games");
assert.equal(tournament.championshipResult.winsA, 2, "Championship series should count Team A wins");
assert.equal(tournament.championshipResult.winsB, 0, "Championship series should count Team B wins");
assert.equal(tournament.championshipResult.championTeamName, teams[4], "Championship result should name the team that wins two of three");
assert.equal(tournament.matchups.find((matchup) => matchup.matchupCode === "AAPNC-3").winner, "", "Unplayed third championship game should stay available but unresolved");

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
