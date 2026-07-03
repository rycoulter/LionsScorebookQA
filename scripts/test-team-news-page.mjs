import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");
const supabaseStorageJs = readFileSync(join(rootDir, "supabase-storage.js"), "utf8");
const supabaseSchemaSql = readFileSync(join(rootDir, "supabase-schema.sql"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = ["\nfunction ", "\n  function ", "\nasync function ", "\n  async function "]
    .map((needle) => source.indexOf(needle, start + 1))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const publicViews = appJs.match(/const PUBLIC_TAB_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";
const publicReadViews = appJs.match(/const PUBLIC_READ_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";
const adminViews = appJs.match(/const ADMIN_TAB_VIEWS = new Set\(\[[^\]]+\]\);/)?.[0] || "";

mustMatch(publicViews, /"news"/, "Team News should be visible in public tab navigation");
mustMatch(publicReadViews, /"news"/, "Team News should be public-readable");
mustMatch(adminViews, /"news"/, "Team News should remain available in admin mode");
mustMatch(adminViews, /"newsEditor"/, "News Editor should be an admin-only tab");
assert.doesNotMatch(publicViews, /"newsEditor"/, "News Editor should not be public navigation");
assert.doesNotMatch(publicReadViews, /"newsEditor"/, "News Editor should not be public-readable");
mustMatch(indexHtml, /data-view="news"[\s\S]*Team News/, "Top navigation should include Team News");
mustMatch(indexHtml, /data-view="newsEditor" hidden>News Editor<\/button>/, "Top navigation should include a hidden admin News Editor tab");
mustMatch(indexHtml, /id="homeTeamNewsLink"[\s\S]*View All News/, "Home card should include a View All News link");
mustMatch(indexHtml, /id="homeTeamNewsBody"/, "Home should render Team News items instead of the recent games body");
mustMatch(indexHtml, /id="newsView"[\s\S]*data-panel="news"/, "Team News page should be present");
mustMatch(indexHtml, /id="newsFeaturedStory"/, "Team News page should include a featured story area");
assert.doesNotMatch(indexHtml, /id="newsCategoryFilters"|data-news-category/, "Team News page should not show category filters or sort chips");
mustMatch(indexHtml, /id="newsArticleList"/, "Team News page should include a full article list");
mustMatch(indexHtml, /id="newsEditorView"[\s\S]*data-panel="newsEditor"/, "Admin News Editor page should be present");
mustMatch(indexHtml, /id="newsMigrateImagesBtn"[\s\S]*Migrate News Images/, "News Editor should include an admin image migration helper");
mustMatch(indexHtml, /id="newsEditorTitleInput"[\s\S]*id="newsEditorSummaryInput"[\s\S]*id="newsEditorBodyInput"/, "News Editor should collect title, summary, and rich body");
mustMatch(indexHtml, /id="newsEditorImageInput"[\s\S]*type="file"[\s\S]*accept="image\/\*"/, "News Editor should include an image upload field");
mustMatch(indexHtml, /id="newsEditorImagePreview"/, "News Editor should include an image preview");
mustMatch(indexHtml, /id="newsEditorCategory"/, "News Editor should select a category");
mustMatch(indexHtml, /id="newsEditorGameSelect"/, "News Editor should optionally link a game");
mustMatch(indexHtml, /id="newsGenerateFromGameBtn"[\s\S]*Generate from Game/, "News Editor should include Generate from Game");

const renderHomeBody = functionBody(appJs, "renderHome");
mustMatch(renderHomeBody, /homeTeamNewsBody[\s\S]*renderHomeTeamNewsCard\(teamNewsArticles\(\)\.slice\(0, 4\)\)/, "Home should render 3-4 recent news items");
assert.doesNotMatch(renderHomeBody, /homeRecentGamesBody[\s\S]*renderHomeRecentGamesList/, "Home should no longer render the Recent Games list in that slot");

mustMatch(functionBody(appJs, "bindEvents"), /homeTeamNewsLink[\s\S]*selectedNewsArticleId = ""[\s\S]*newsLayoutMode = "latest"[\s\S]*renderTeamNews\(\)[\s\S]*switchView\("news"\)/, "View All News should open Team News with Latest first on mobile");
mustMatch(functionBody(appJs, "bindEvents"), /homeTeamNewsBody[\s\S]*selectedNewsArticleId = button\.dataset\.homeNewsId[\s\S]*newsLayoutMode = "article"[\s\S]*renderTeamNews\(\)[\s\S]*switchView\("news"\)/, "Home news article clicks should select and render that article first");
mustMatch(functionBody(appJs, "bindEvents"), /newsArticleList[\s\S]*click[\s\S]*data-news-read[\s\S]*openNewsArticleFromList\(card\.dataset\.newsRead \|\| ""\)/, "All Articles cards should pull the full article into view when clicked");
mustMatch(functionBody(appJs, "bindEvents"), /newsArticleList[\s\S]*keydown[\s\S]*event\.key !== "Enter"[\s\S]*event\.key !== " "[\s\S]*openNewsArticleFromList\(card\.dataset\.newsRead \|\| ""\)/, "All Articles cards should support keyboard selection");
mustMatch(functionBody(appJs, "openNewsArticleFromList"), /selectedNewsArticleId = articleId[\s\S]*newsLayoutMode = "article"[\s\S]*scrollIntoView/, "Opening an article card should render it in the full article pane");
mustMatch(functionBody(appJs, "teamNewsArticles"), /normalizeNewsArticles\(state\.newsArticles/, "Team News should render manual articles from app state");
assert.doesNotMatch(functionBody(appJs, "teamNewsArticles"), /completedGames\(Infinity\)|fallbackTeamNewsArticles|category: "Game Recap"/, "Team News should not auto-generate public articles");
assert.doesNotMatch(appJs, /newsCategoryFilter|newsCategoryFilters|filteredTeamNewsArticles|data-news-category/, "Team News should not keep category-filter state or handlers");
mustMatch(functionBody(appJs, "renderTeamNews"), /articles\.find\(\(article\) => article\.id === selectedNewsArticleId\)[\s\S]*renderFeaturedNewsStory\(featured\)[\s\S]*renderNewsArticleCard\(article, article\.id === selectedNewsArticleId\)/, "Team News should render the selected full article and compact article list");
mustMatch(functionBody(appJs, "renderTeamNews"), /const articles = teamNewsArticles\(\)/, "Team News should always show the full article list");
mustMatch(functionBody(appJs, "renderTeamNews"), /classList\.toggle\("is-latest-first", newsLayoutMode !== "article"\)/, "Team News layout should let mobile put Latest first for general browsing");
mustMatch(functionBody(appJs, "renderFeaturedNewsStory"), /<h3>\$\{escapeHtml\(article\.title\)\}<\/h3>[\s\S]*news-feature-date[\s\S]*newsArticleDateLabel\(article\)[\s\S]*news-article-body/, "Full article view should show the date under the title before the story starts");
assert.doesNotMatch(functionBody(appJs, "renderFeaturedNewsStory"), /<p>\$\{escapeHtml\(article\.summary\)\}<\/p>/, "Full article view should not repeat the card summary");
assert.doesNotMatch(functionBody(appJs, "renderFeaturedNewsStory"), /news-category-pill|article\.category/, "Full article view should not show article tags");
mustMatch(functionBody(appJs, "newsArticleDateLabel"), /article\?\.gameId \? "Game Date" : "Date"/, "Linked articles should label the story date as Game Date");
mustMatch(functionBody(appJs, "renderNewsArticleCard"), /role="button"[\s\S]*tabindex="0"[\s\S]*data-news-read="\$\{escapeHtml\(article\.id\)\}"[\s\S]*news-article-thumb[\s\S]*<h3>\$\{escapeHtml\(article\.title\)\}<\/h3>[\s\S]*<p>\$\{escapeHtml\(article\.summary\)\}<\/p>/, "All Articles cards should show thumbnail, title, summary, and act as the article selector");
assert.doesNotMatch(functionBody(appJs, "renderNewsArticleCard"), /Read More|news-read-more-btn|<button/, "All Articles cards should not render a separate Read More button");
assert.doesNotMatch(functionBody(appJs, "renderNewsArticleCard"), /news-article-body|news-category-pill/, "All Articles cards should not render full body content or category clutter");
mustMatch(functionBody(appJs, "newsArticleDraftFromGame"), /category: "Game Recap"/, "Generate from Game should produce editable recap copy");
mustMatch(functionBody(appJs, "newsArticleDraftFromGame"), /category: "Game Preview"/, "Generate from Game should produce editable preview copy");
mustMatch(functionBody(appJs, "generateNewsFromSelectedGame"), /newsArticleDraftFromGame\(game\)/, "Generate from Game should prefill the editor");
mustMatch(functionBody(appJs, "saveNewsArticle"), /requireSharedAdminSession\("Sign in as an approved admin before saving news\."\)[\s\S]*prepareNewsArticleImageFields[\s\S]*normalizeNewsArticle[\s\S]*persistNewsArticles\("news-save", \{ article \}\)/, "News Editor should require verified admin sync access and save normalized manual articles");
mustMatch(functionBody(appJs, "deleteNewsArticle"), /requireSharedAdminSession\("Sign in as an approved admin before deleting news\."\)[\s\S]*persistNewsArticles\("news-delete", \{ deleteArticleId: article\.id \}\)/, "News Editor should require verified admin sync access and delete one article row at a time");
mustMatch(functionBody(appJs, "bindEvents"), /newsMigrateImagesBtn[\s\S]*migrateLegacyNewsImages/, "News Editor migration button should run the legacy image migration helper");
mustMatch(functionBody(appJs, "handleNewsImageUpload"), /resizeNewsImageFile\(file\)/, "News Editor should preview uploaded images through the safe helper");
mustMatch(functionBody(appJs, "prepareNewsArticleImageFields"), /supabaseStorage\.uploadNewsImageAsset\(articleId, imageDataUrl[\s\S]*supabaseStorage\.uploadNewsImageAsset\(articleId, thumbnailDataUrl/, "News Editor should upload full image and thumbnail to Supabase Storage");
mustMatch(functionBody(appJs, "prepareNewsArticleImageFields"), /imageDataUrl: ""/, "News Editor should clear base64 data after uploading news images");
mustMatch(functionBody(appJs, "migrateLegacyNewsImages"), /fetchNewsArticles\(\{ includeLegacyImageData: true \}\)[\s\S]*validNewsImageDataUrl\(article\.imageDataUrl\)[\s\S]*!existingImageUrl[\s\S]*prepareNewsArticleImageFields\(article\.id, article\.imageDataUrl, article, \{ forceUpload: true \}\)[\s\S]*upsertNewsArticle\(migratedArticle\)/, "Migration helper should fetch legacy image data, upload only missing URL images, and update rows after upload");
mustMatch(functionBody(appJs, "migrateLegacyNewsImages"), /catch \(error\)[\s\S]*failed \+= 1/, "Migration helper should leave failed article rows untouched and report failures");
mustMatch(functionBody(appJs, "newsArticleImage"), /thumbnailUrl[\s\S]*imageUrl[\s\S]*legacyImageDataUrl/, "News rendering should prefer thumbnail URLs, then image URLs, then legacy data URLs");
mustMatch(functionBody(appJs, "sanitizeNewsBodyHtml"), /allowedTags[\s\S]*script, style, iframe, object, embed/, "Rich text body should be sanitized before display/save");
mustMatch(functionBody(appJs, "hasMeaningfulSupabaseSnapshot"), /Array\.isArray\(snapshot\.newsArticles\) && snapshot\.newsArticles\.length/, "Supabase snapshot detection should include news article table rows");
mustMatch(appJs, /data\.newsArticlesMissingTable \? undefined : data\.newsArticles/, "Refresh should merge news table rows when the table is available");
mustMatch(functionBody(appJs, "syncSharedNewsArticle"), /supabaseStorage\.upsertNewsArticle\(article\)/, "Saving news should upsert the dedicated news_articles row");
mustMatch(functionBody(appJs, "deleteSharedNewsArticle"), /supabaseStorage\.deleteNewsArticle\(articleId\)/, "Deleting news should delete the dedicated news_articles row");
assert.doesNotMatch(functionBody(appJs, "persistNewsArticles"), /syncSharedSnapshot/, "News edits should not sync the full app_state snapshot");

mustMatch(stylesCss, /\.team-news-layout[\s\S]*grid-template-areas: "list feature"[\s\S]*grid-template-columns: minmax\(220px, 0\.76fr\) minmax\(0, 1\.24fr\)/, "Team News page should put the article list left and the wider full article pane right");
mustMatch(stylesCss, /\.news-featured-story[\s\S]*grid-area: feature[\s\S]*\.news-list-shell[\s\S]*grid-area: list/, "Team News desktop layout should swap the visual order without changing mobile source order");
mustMatch(stylesCss, /\.home-team-news-item[\s\S]*grid-template-columns: 58px minmax\(0, 1fr\) 18px/, "Home news items should include thumbnail/title layout");
mustMatch(stylesCss, /\.news-article-card\.is-active[\s\S]*border-color: rgba\(245, 189, 33, 0\.42\)/, "Selected news list item should have an active state");
mustMatch(stylesCss, /\.news-article-card[\s\S]*grid-template-columns: 88px minmax\(0, 1fr\)[\s\S]*cursor: pointer/, "Compact news cards should keep thumbnails and feel clickable in the All Articles list");
mustMatch(stylesCss, /\.news-article-card:hover[\s\S]*\.news-article-card:focus-visible[\s\S]*border-color: rgba\(245, 189, 33, 0\.34\)/, "Clickable news cards should have hover and keyboard focus states");
assert.doesNotMatch(stylesCss, /news-read-more-btn/, "Unused Read More button styles should be removed");
assert.doesNotMatch(stylesCss, /news-category-row|news-category-pill/, "Unused category filter and tag styles should be removed");
mustMatch(stylesCss, /\.news-feature-copy[\s\S]*background:[\s\S]*rgba\(7, 16, 29, 0\.92\)/, "Full article copy should sit on a readable dark fill");
mustMatch(stylesCss, /\.news-feature-date[\s\S]*text-transform: uppercase/, "Full article date should be styled under the title");
mustMatch(stylesCss, /@media \(max-width: 900px\)[\s\S]*\.team-news-layout[\s\S]*grid-template-areas:[\s\S]*"feature"[\s\S]*"list"[\s\S]*grid-template-columns: minmax\(0, 1fr\)[\s\S]*\.team-news-layout\.is-latest-first[\s\S]*grid-template-areas:[\s\S]*"list"[\s\S]*"feature"/, "Mobile Team News should explicitly switch between article-first and Latest-first one-column layouts");
mustMatch(stylesCss, /@media \(max-width: 640px\)[\s\S]*\.news-featured-story,[\s\S]*\.news-list-shell[\s\S]*padding: 12px[\s\S]*\.news-article-card[\s\S]*grid-template-columns: 64px minmax\(0, 1fr\)[\s\S]*align-items: center/, "Mobile Team News cards should stay compact and aligned");
mustMatch(stylesCss, /\.news-editor-layout[\s\S]*grid-template-columns: minmax\(320px, 0\.9fr\) minmax\(0, 1\.1fr\)/, "News Editor should keep a simple two-column desktop layout");
mustMatch(supabaseStorageJs, /function newsArticleFromRow/, "Supabase storage should map news_articles rows into app articles");
mustMatch(supabaseStorageJs, /function buildNewsArticleRow/, "Supabase storage should map app articles into news_articles rows");
mustMatch(supabaseStorageJs, /function fetchNewsArticles/, "Supabase storage should fetch news_articles");
mustMatch(supabaseStorageJs, /\.from\("news_articles"\)/, "Supabase storage should target news_articles");
mustMatch(supabaseStorageJs, /const NEWS_ARTICLE_COLUMNS = \[[\s\S]*"thumbnail_url"[\s\S]*\]\.join\(","\)/, "News article fetches should use a slim column list with image URLs");
mustMatch(functionBody(supabaseStorageJs, "fetchNewsArticles"), /\.select\(columns\)/, "Public news fetches should select the requested slim column set");
mustMatch(functionBody(supabaseStorageJs, "fetchNewsArticles"), /NEWS_ARTICLE_LEGACY_COLUMNS/, "News fetches should tolerate rollout before the new image URL columns exist");
assert.doesNotMatch(functionBody(supabaseStorageJs, "fetchNewsArticles"), /\.select\("\*"\)/, "Public news fetches should not pull every column");
mustMatch(supabaseStorageJs, /function upsertNewsArticle/, "Supabase storage should upsert one news article");
mustMatch(supabaseStorageJs, /function deleteNewsArticle/, "Supabase storage should delete one news article");
mustMatch(supabaseStorageJs, /function uploadNewsImageAsset/, "Supabase storage should upload news article images to Storage");
mustMatch(functionBody(supabaseStorageJs, "buildNewsArticleRow"), /image_url:[\s\S]*thumbnail_url:[\s\S]*image_data_url: ""/, "News article rows should store image URLs and stop writing base64 image data");
mustMatch(functionBody(supabaseStorageJs, "fetchBootstrap"), /newsArticles: newsArticlesResponse\.data \|\| \[\]/, "Bootstrap should include news table rows");
mustMatch(functionBody(supabaseStorageJs, "mergeRemoteSnapshot"), /newsRows = undefined[\s\S]*newsRows\.map\(newsArticleFromRow\)/, "Remote merge should prefer dedicated news table rows");
assert.doesNotMatch(functionBody(supabaseStorageJs, "buildAppStateRow"), /news_articles/, "App-state sync should not write manual news articles into metadata");
mustMatch(supabaseSchemaSql, /create table if not exists public\.news_articles/i, "Schema should create news_articles");
mustMatch(supabaseSchemaSql, /image_url text not null default ''[\s\S]*thumbnail_url text not null default ''/i, "Schema should store news image URLs separately from legacy image data");
mustMatch(supabaseSchemaSql, /insert into storage\.buckets[\s\S]*'news-images'/i, "Schema should create a public news-images bucket");
mustMatch(supabaseSchemaSql, /Public read news images/i, "News images should be publicly readable");
mustMatch(supabaseSchemaSql, /Authenticated admin insert news images[\s\S]*public\.app_admins/i, "News image uploads should be restricted to app admins");
mustMatch(supabaseSchemaSql, /jsonb_array_elements\([\s\S]*app_state\.metadata -> 'news_articles'[\s\S]*'\[\]'::jsonb[\s\S]*\)/i, "Schema should safely migrate old app_state metadata articles into news_articles");
mustMatch(supabaseSchemaSql, /Public read news_articles/i, "news_articles should have public read RLS");
mustMatch(supabaseSchemaSql, /Authenticated write news_articles[\s\S]*public\.app_admins/i, "news_articles writes should be restricted to app admins");

console.log("Team News page checks passed.");
