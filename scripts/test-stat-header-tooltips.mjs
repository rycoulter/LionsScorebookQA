import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");

const hittingTooltips = {
  avg: "Batting Average",
  ops: "On-base Plus Slugging",
  runs: "Runs Scored",
  obp: "On-base Percentage",
  slg: "Slugging Percentage",
  rbi: "Runs Batted In"
};

const pitchingTooltips = {
  outs: "Innings Pitched",
  pitches: "Number of Pitches",
  strikeRate: "Strike Percentage",
  batters: "Batters Faced",
  era: "Earned Run Average",
  kbb: "Strikeout-to-Walk Ratio",
  whip: "Walks and Hits per Inning Pitched",
  pitchesPerInning: "Pitches per Inning"
};

Object.entries(hittingTooltips).forEach(([key, label]) => {
  const pattern = new RegExp(`data-hit-sort="${key}" title="${label}" aria-label="${label}"`);
  assert.match(indexHtml, pattern, `${key} should explain ${label} on hover and to assistive technology`);
});

Object.entries(pitchingTooltips).forEach(([key, label]) => {
  const pattern = new RegExp(`data-pit-sort="${key}" title="${label}" aria-label="${label}"`);
  assert.match(indexHtml, pattern, `${key} should explain ${label} on hover and to assistive technology`);
});

const hittingButtons = [...indexHtml.matchAll(/<button type="button" data-hit-sort="[^"]+"([^>]*)>/g)];
const pitchingButtons = [...indexHtml.matchAll(/<button type="button" data-pit-sort="[^"]+"([^>]*)>/g)];
assert.ok(hittingButtons.length >= 23, "All hitting sort headers should be present");
assert.ok(pitchingButtons.length >= 23, "All pitching sort headers should be present");
[...hittingButtons, ...pitchingButtons].forEach((match) => {
  assert.match(match[1], /title="[^"]+"/, "Every sortable stat header should have a hover tooltip");
  assert.match(match[1], /aria-label="[^"]+"/, "Every sortable stat header should have an accessible expanded label");
});

console.log("Stat header tooltip checks passed.");
