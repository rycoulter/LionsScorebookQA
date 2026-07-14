import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const postponedBody = functionBody(appJs, "gameIsPostponed");
assert.match(postponedBody, /timestampValue\(game\.postponedAt\)/, "postponed lifecycle should honor postponedAt, not only status");
assert.match(postponedBody, /timestampValue\(game\.resumedFromPostponedAt\)/, "postponed lifecycle should allow resumed games back into schedule flow");
assert.match(postponedBody, /resumedAt > postponedAt/, "games resumed after a postponement should not remain postponed");
assert.match(postponedBody, /game\.status === "postponed" \|\| Boolean\(postponedAt\)/, "status or postponedAt should classify a game as postponed");

const liveWindowBody = functionBody(appJs, "isGameInScheduledLiveWindow");
assert.match(liveWindowBody, /gameIsPostponed\(game\)/, "postponed games should not be promoted into the scheduled live window");

const lifecycleBody = functionBody(appJs, "gameLifecycle");
assert.match(lifecycleBody, /gameIsPostponed\(game\)\) return "postponed"/, "game lifecycle should classify postponed games before future games");

const gamesForLifecycleBody = functionBody(appJs, "gamesForLifecycle");
assert.match(gamesForLifecycleBody, /gameLifecycle\(game\) !== lifecycle/, "schedule filters should rely on the shared lifecycle helper");
assert.match(gamesForLifecycleBody, /options\.gameType[\s\S]*gameMatchesScheduleFilter\(game, gameType\)/, "schedule lifecycle helpers should support regular/postseason scoping");

const upcomingBody = functionBody(appJs, "upcomingScheduledGames");
assert.match(upcomingBody, /gameLifecycle\(game\) === "future"/, "home next-game lookup should use the shared future lifecycle");

const scoreableBody = functionBody(appJs, "scoreableGames");
assert.match(scoreableBody, /!gameIsPostponed\(game\)/, "postponed games should not be considered scoreable live games");

const renderGamesBody = functionBody(appJs, "renderGames");
assert.match(renderGamesBody, /scheduleDashboardUpcomingGames\(\{ season: scheduleSeasonFilter, gameType: "regular" \}\)/, "Schedule/Scores regular-season dashboard should use the dedicated next-game helper");

const scheduleDashboardUpcomingBody = functionBody(appJs, "scheduleDashboardUpcomingGames");
assert.match(scheduleDashboardUpcomingBody, /gamesForLifecycle\("future", options\)/, "Schedule/Scores next-game helper should use future lifecycle games");
assert.match(scheduleDashboardUpcomingBody, /!gameIsPostponed\(game\)/, "Schedule/Scores next-game helper should exclude postponed games explicitly");
assert.match(scheduleDashboardUpcomingBody, /\(game\.date \|\| today\) >= today/, "Schedule/Scores next-game helper should not feature past-dated games");

function timestampValue(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function gameIsFinal(game) {
  return Boolean(game && (game.status === "completed" || game.status === "final"));
}

function localGameIsPostponed(game) {
  if (!game || gameIsFinal(game)) return false;
  const postponedAt = timestampValue(game.postponedAt);
  const resumedAt = timestampValue(game.resumedFromPostponedAt);
  if (postponedAt && resumedAt > postponedAt) return false;
  return game.status === "postponed" || Boolean(postponedAt);
}

function localGameLifecycle(game) {
  if (gameIsFinal(game)) return "completed";
  if (localGameIsPostponed(game)) return "postponed";
  if (game?.status === "active") return "active";
  return "future";
}

function localDashboardUpcomingGames(games, today = "2026-05-05") {
  return games
    .filter((game) => localGameLifecycle(game) === "future")
    .filter((game) => !localGameIsPostponed(game))
    .filter((game) => (game.date || today) >= today)
    .sort((a, b) => {
      const dateCompare = (a.date || today).localeCompare(b.date || today);
      if (dateCompare) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });
}

const pastUnplayedGame = {
  id: "past-unplayed",
  status: "scheduled",
  date: "2026-05-01",
  time: "20:00"
};

const futureGame = {
  id: "future-game",
  status: "scheduled",
  date: "2026-05-10",
  time: "20:00"
};

const staleScheduledPostponedGame = {
  id: "postponed-stale-scheduled",
  status: "scheduled",
  postponedAt: "2026-05-05T01:30:00.000Z",
  date: "2026-05-06",
  time: "20:00"
};

const staleActivePostponedGame = {
  id: "postponed-stale-active",
  status: "active",
  postponedAt: "2026-05-05T01:30:00.000Z",
  date: "2026-05-06",
  time: "20:00"
};

const resumedPostponedGame = {
  id: "resumed-postponed",
  status: "scheduled",
  postponedAt: "2026-05-05T01:30:00.000Z",
  resumedFromPostponedAt: "2026-05-05T02:00:00.000Z",
  date: "2026-05-06",
  time: "20:00"
};

const games = [
  pastUnplayedGame,
  futureGame,
  staleScheduledPostponedGame,
  staleActivePostponedGame,
  resumedPostponedGame
];

assert.equal(localGameIsPostponed(staleScheduledPostponedGame), true, "scheduled games with postponedAt should be postponed");
assert.equal(localGameIsPostponed(staleActivePostponedGame), true, "active stale games with postponedAt should be postponed");
assert.equal(localGameIsPostponed(resumedPostponedGame), false, "resumed postponed games should return to schedule flow");

assert.deepEqual(
  games.filter((game) => localGameLifecycle(game) === "postponed").map((game) => game.id),
  ["postponed-stale-scheduled", "postponed-stale-active"],
  "postponed filter should include stale schedule records with postponedAt"
);

assert.deepEqual(
  games.filter((game) => localGameLifecycle(game) === "future").map((game) => game.id),
  ["past-unplayed", "future-game", "resumed-postponed"],
  "next/future schedule should exclude postponed records"
);

assert.deepEqual(
  localDashboardUpcomingGames(games).map((game) => game.id),
  ["resumed-postponed", "future-game"],
  "Schedule/Scores ALL dashboard should not feature past unplayed or postponed games as next"
);

console.log("Postponed schedule lifecycle checks passed.");
