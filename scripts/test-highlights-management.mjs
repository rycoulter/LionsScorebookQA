import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const supabaseStorageJs = readFileSync(join(rootDir, "supabase-storage.js"), "utf8");
const supabaseSchemaSql = readFileSync(join(rootDir, "supabase-schema.sql"), "utf8");
const highlightTagPicker = indexHtml.match(/id="highlightTagPicker"[\s\S]*?<\/fieldset>/)?.[0] || "";

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const publicViews = appJs.match(/const PUBLIC_TAB_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";
const publicReadViews = appJs.match(/const PUBLIC_READ_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";
const adminViews = appJs.match(/const ADMIN_TAB_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";

mustMatch(adminViews, /"highlights"/, "Highlights should be an admin tab");
mustMatch(publicViews, /"highlights"/, "Highlights should be a public tab");
mustMatch(publicReadViews, /"highlights"/, "Direct Highlights routes should be public");
mustMatch(indexHtml, /<button class="tab" data-view="highlights">[\s\S]*<span class="tab-label">Highlights<\/span><\/button>/, "Public nav should include the Highlights tab");
mustMatch(indexHtml, /<button class="mobile-bottom-nav-tab" data-view="highlights" type="button">/, "Mobile nav should include Clips");
mustMatch(indexHtml, /id="highlightsView"[\s\S]*data-panel="highlights"/, "Highlights view should be present");
mustMatch(indexHtml, /id="publicHighlightFeatured"/, "Highlights page should include a featured highlight section");
mustMatch(indexHtml, /id="highlightFilterChips"/, "Highlights page should include filter chips");
mustMatch(indexHtml, /id="highlightSearchInput"/, "Highlights page should include a search input");
mustMatch(indexHtml, /id="publicHighlightsGrid"/, "Highlights page should include a public highlights grid");
mustMatch(indexHtml, /id="highlightsAdminTools" data-admin-only hidden/, "Admin highlight tools should be marked admin-only and hidden by default");
mustMatch(indexHtml, /id="highlightForm"/, "Highlights management form should be present");
mustMatch(indexHtml, /id="highlightsGameSelect"/, "Highlights form should select a completed game");
mustMatch(indexHtml, /YouTube URL[\s\S]*id="highlightUrlInput"/, "Highlights form should collect a YouTube URL");
mustMatch(indexHtml, /id="highlightTitleInput"/, "Highlights form should collect a title");
mustMatch(indexHtml, /id="highlightDescriptionInput"/, "Highlights form should collect a description");
mustMatch(highlightTagPicker, /data-highlight-tag-input/, "Highlights form should collect multiple filter-aligned tags");
for (const tag of ["game-recaps", "walk-offs", "top-plays", "player-highlights", "pitching", "defense"]) {
  mustMatch(highlightTagPicker, new RegExp(`value="${tag}"`), `Highlights tag picker should include ${tag}`);
}
mustMatch(indexHtml, /id="highlightInningInput"[\s\S]*id="highlightPlayTypeInput"[\s\S]*id="highlightPlayersSelect"/, "Highlights form should support optional tags");
mustMatch(indexHtml, /id="gameHighlightsModal"/, "Public game highlights modal should be present");

mustMatch(appJs, /highlights:\s*\[\]/, "Seed state should include highlights");
mustMatch(appJs, /const HIGHLIGHT_FILTERS = \[[\s\S]*Game Recaps[\s\S]*Walk-Offs[\s\S]*Top Plays[\s\S]*Player Highlights[\s\S]*Pitching[\s\S]*Defense/, "Highlights page should define the requested filters");
assert.doesNotMatch(appJs, /const MOCK_HIGHLIGHTS/, "Public highlights should not render mock/example data");
mustMatch(appJs, /nextState\.highlights = normalizeHighlights\(nextState\.highlights, nextState\.games\)/, "State normalization should normalize highlights");
mustMatch(appJs, /fetchBootstrap\(\)[\s\S]*data\.highlights/, "Supabase bootstrap should merge highlight rows");
mustMatch(appJs, /remoteBootstrap\.data\.highlights/, "Sync baseline should merge highlight rows");

const actionBody = functionBody(appJs, "renderGameHighlightsAction");
mustMatch(actionBody, /gameIsFinal\(game\)/, "Game Highlights button should be limited to completed games");
mustMatch(actionBody, /highlightCountForGame\(game\.id\)/, "Game Highlights button should require saved highlights");
mustMatch(actionBody, /data-game-action="highlights"/, "Game Highlights button should route through game actions");

const saveBody = functionBody(appJs, "saveHighlightRecord");
mustMatch(saveBody, /requireAdminAccess\("Admin sign-in required to manage highlights\."\)/, "Highlight writes should require admin access in the UI");
mustMatch(saveBody, /supabaseStorage\.upsertGames\(\[game\]\)/, "Saving highlights should ensure the completed game exists remotely");
mustMatch(saveBody, /supabaseStorage\.upsertHighlight\(highlight\)/, "Saving highlights should write to the highlight table");
mustMatch(saveBody, /youtubeVideoIdFromUrl\(youtubeUrl\)/, "Saving highlights should validate YouTube URLs");
mustMatch(saveBody, /categories:\s*selectedHighlightTags\(\)/, "Saving highlights should persist selected tags");

const deleteBody = functionBody(appJs, "deleteHighlightRecord");
mustMatch(deleteBody, /requireAdminAccess\("Admin sign-in required to delete highlights\."\)/, "Highlight deletes should require admin access in the UI");
mustMatch(deleteBody, /supabaseStorage\.deleteHighlight\(highlight\.id\)/, "Deleting highlights should delete the Supabase record");

mustMatch(functionBody(appJs, "youtubeEmbedUrl"), /youtube\.com\/embed/, "Highlights should render embedded YouTube players");
mustMatch(functionBody(appJs, "renderHighlightEmbed"), /<iframe/, "Highlight cards should include an iframe embed");
mustMatch(functionBody(appJs, "renderHighlightsPage"), /highlightsAdminTools[\s\S]*hidden = !isAdminMode\(\)/, "Admin highlight tools should show in admin mode");
mustMatch(functionBody(appJs, "highlightSourceData"), /normalizeHighlights\(state\.highlights \|\| \[\], state\.games\)/, "Public Highlights page should use saved highlight records");
mustMatch(functionBody(appJs, "highlightSourceData"), /gameIsFinal\(game\)/, "Public Highlights page should only show highlights tied to completed games");
mustMatch(functionBody(appJs, "renderHighlightsPage"), /publicHighlightFeatured[\s\S]*renderFeaturedHighlight/, "Public Highlights page should render a featured highlight");
mustMatch(functionBody(appJs, "renderHighlightsPage"), /publicHighlightsGrid[\s\S]*renderPublicHighlightCard/, "Public Highlights page should render highlight cards");
mustMatch(functionBody(appJs, "filteredPublicHighlights"), /highlightSearchQuery[\s\S]*highlightCategoryFilter/, "Highlights page should filter by category and search query");
mustMatch(functionBody(appJs, "filteredPublicHighlights"), /highlightCategories\(highlight\)[\s\S]*categories\.includes\(highlightCategoryFilter\)/, "Highlights filtering should match any saved tag");
mustMatch(appJs, /function highlightCategories\(highlight\) \{[\s\S]*normalizeHighlightCategories\(highlight\?\.categories/, "Highlights filtering should prefer saved tags before text fallbacks");
mustMatch(functionBody(appJs, "renderPublicHighlightCard"), /youtubeThumbnailUrl[\s\S]*data-highlight-feature[\s\S]*highlight-play-overlay/, "Highlight cards should use YouTube thumbnails with a play overlay");
mustMatch(functionBody(appJs, "handleGameActionClick"), /gameAction === "highlights"[\s\S]*openGameHighlights\(gameId\)/, "Completed game highlight buttons should open the modal");

mustMatch(supabaseStorageJs, /function fetchHighlights/, "Supabase storage should fetch highlights");
mustMatch(supabaseStorageJs, /\.from\("game_highlights"\)/, "Supabase storage should target game_highlights");
mustMatch(supabaseStorageJs, /function upsertHighlight/, "Supabase storage should upsert highlight records");
mustMatch(supabaseStorageJs, /const categories = normalizeHighlightCategoryList\(highlight\?\.categories/, "Supabase highlight rows should include selected tags");
mustMatch(supabaseStorageJs, /categories,\s*\n\s*inning:/, "Supabase highlight rows should include multiple categories");
mustMatch(supabaseStorageJs, /isMissingColumnError\(response\.error, "category"\)/, "Highlight saves should tolerate a stale Supabase schema cache while category is rolling out");
mustMatch(supabaseStorageJs, /isMissingColumnError\(response\.error, "categories"\)/, "Highlight saves should tolerate a stale Supabase schema cache while tags are rolling out");
mustMatch(supabaseStorageJs, /function deleteHighlight/, "Supabase storage should delete highlight records");
mustMatch(supabaseStorageJs, /Supabase game_highlights table is not available to the app/, "Missing highlight table should produce an actionable error");

mustMatch(supabaseSchemaSql, /create table if not exists public\.game_highlights/i, "Schema should create game_highlights");
mustMatch(supabaseSchemaSql, /category text not null default 'top-plays'/i, "Schema should store a highlight category");
mustMatch(supabaseSchemaSql, /categories jsonb not null default '\["top-plays"\]'::jsonb/i, "Schema should store multiple highlight tags");
mustMatch(supabaseSchemaSql, /alter table public\.game_highlights enable row level security/i, "game_highlights should have RLS enabled");
mustMatch(supabaseSchemaSql, /Public read game_highlights/i, "game_highlights should have a public read policy");
mustMatch(supabaseSchemaSql, /Authenticated write game_highlights[\s\S]*public\.app_admins/i, "game_highlights writes should be restricted to app admins");

console.log("Highlights management checks passed.");
