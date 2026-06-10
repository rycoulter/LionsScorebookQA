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

assert.doesNotMatch(indexHtml, /id="archivePagination"/, "Game Archive should not render pagination controls");
assert.doesNotMatch(indexHtml, /archivePrevPageBtn|archiveNextPageBtn|archivePageLabel/, "Game Archive should not include Previous/Next paging controls");
assert.doesNotMatch(appJs, /archivePage|archiveUsesContinuousScroll|renderArchivePagination|archivePrevPageBtn|archiveNextPageBtn/, "Archive should not keep pagination state or controls");
assert.doesNotMatch(stylesCss, /archive-pagination/, "Archive pagination CSS should be removed with the controls");

const renderArchiveBody = functionBody(appJs, "renderArchive");
assert.match(renderArchiveBody, /const games = state\.games[\s\S]*\.filter\(\(game\) => gameIsFinal\(game\)[\s\S]*\.sort\(sortGamesNewestFirst\)/, "Archive should build the full filtered game list");
assert.doesNotMatch(renderArchiveBody, /\.slice\(|pageSize|pageStart/, "Archive should render every filtered game without paging");
assert.match(renderArchiveBody, /games\.map\(renderArchiveCard\)\.join\(""\)/, "Archive should render all filtered games in one scrollable list");

console.log("Archive continuous scroll checks passed.");
