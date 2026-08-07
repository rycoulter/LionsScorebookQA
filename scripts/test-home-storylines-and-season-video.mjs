import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const storageJs = readFileSync(join(rootDir, "supabase-storage.js"), "utf8");
const schemaSql = readFileSync(join(rootDir, "supabase-schema.sql"), "utf8");
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

mustMatch(indexHtml, /id="seasonStorylineManager"[\s\S]*id="seasonStorylineForm"[\s\S]*id="seasonStorylineList"/, "News Editor should include an admin season storyline manager");
mustMatch(indexHtml, /id="seasonStorylineImageUploadInput" type="file" accept="image\/\*"[\s\S]*id="seasonStorylineImagePreview"/, "Season storyline manager should use an image upload field with preview");
mustMatch(indexHtml, /id="highlightSeasonVideoInput"[\s\S]*Season Highlight Video/, "Highlight manager should include a season highlight video checkbox");

mustMatch(functionBody(appJs, "normalizeState"), /seasonStorylines = normalizeSeasonStorylines/, "App state should normalize season storylines");
mustMatch(functionBody(appJs, "homeOffseasonMomentCards"), /state\.seasonStorylines[\s\S]*customStorylines\.length[\s\S]*customStorylines\.map/, "Home storylines should prefer admin-managed storylines");
mustMatch(functionBody(appJs, "renderHomeOffseasonBestMoments"), /<h2>Season Storylines<\/h2>/, "Home storylines should keep the Season Storylines title");
mustNotMatch(functionBody(appJs, "renderHomeOffseasonBestMoments"), /Best Moments/, "Home storylines should not show a Best Moments label above the title");
mustMatch(functionBody(appJs, "renderHomeOffseasonFeaturedVideo"), /selectedSeasonHighlightVideo\(highlightSourceData\(\)\)/, "Home video should use the season highlight selector");
mustMatch(functionBody(appJs, "renderHomeOffseasonFeaturedVideo"), /home-offseason-video-heading[\s\S]*Season Highlights[\s\S]*home-offseason-video-media/, "Season Highlights heading should appear above the video media");
mustMatch(functionBody(appJs, "renderHomeOffseasonFeaturedVideo"), /home-offseason-video-placeholder[\s\S]*Coming Soon/, "Home video should render a Coming Soon placeholder when no season video exists");
mustMatch(functionBody(appJs, "selectedSeasonHighlightVideo"), /seasonFeatured[\s\S]*\|\| null/, "Season video selector should only use the explicit season video flag");
mustMatch(functionBody(appJs, "saveHighlightRecord"), /seasonFeatured: Boolean\(els\.highlightSeasonVideoInput\?\.checked\)[\s\S]*clearSeasonFeaturedHighlights/, "Saving a highlight should persist and de-duplicate the season video flag");
mustMatch(functionBody(appJs, "handleSeasonStorylineImageUpload"), /resizeNewsImageFile\(file\)[\s\S]*renderSeasonStorylineImagePreview/, "Season storyline upload should resize and preview selected images");
mustMatch(functionBody(appJs, "prepareSeasonStorylineImageValue"), /prepareNewsArticleImageFields\(`storyline-\$\{storylineId\}`/, "Season storyline images should upload through the shared image asset helper");
mustMatch(functionBody(appJs, "saveSeasonStoryline"), /prepareSeasonStorylineImageValue[\s\S]*image: storylineImage/, "Saving a season storyline should persist the uploaded image URL");
mustMatch(functionBody(appJs, "persistSeasonStorylines"), /markSharedAppStateDirty\(\)[\s\S]*syncSharedSnapshot/, "Season storylines should sync through the shared app-state snapshot");

mustMatch(functionBody(storageJs, "buildAppStateRow"), /season_storylines: deepClone\(state\?\.seasonStorylines \|\| \[\]\)/, "Supabase app_state metadata should store season storylines");
mustMatch(functionBody(storageJs, "mergeRemoteSnapshot"), /seasonStorylines = Array\.isArray\(remoteMetadata\.season_storylines\)/, "Supabase merge should hydrate season storylines");
mustMatch(functionBody(storageJs, "buildHighlightRow"), /season_featured: Boolean/, "Supabase highlight rows should include the season_featured flag");
mustMatch(storageJs, /clearSeasonFeaturedHighlights/, "Supabase storage should expose a helper to clear previous season video flags");
mustMatch(schemaSql, /season_featured boolean not null default false/, "Supabase schema should add the season_featured column");

mustMatch(stylesCss, /\.season-storyline-manager\s*\{[\s\S]*grid-column: 1 \/ -1/, "Storyline manager should span the News Editor layout");
mustMatch(stylesCss, /\.season-storyline-image-preview\s*\{[\s\S]*min-height: 96px/, "Storyline image preview should be compact inside the admin form");
mustMatch(stylesCss, /\.highlight-season-video-option\s*\{[\s\S]*border: 1px solid rgba\(245, 189, 33, 0\.24\)/, "Season video checkbox should match the Lions admin theme");
mustMatch(stylesCss, /\.home-offseason-video-heading\s*\{[\s\S]*padding: 16px 18px 12px/, "Season video heading should be styled above the media area");
mustMatch(stylesCss, /\.home-offseason-video-placeholder\s*\{[\s\S]*text-transform: uppercase/, "Season video placeholder should be styled as a branded overlay");

console.log("Home storylines and season video checks passed.");
