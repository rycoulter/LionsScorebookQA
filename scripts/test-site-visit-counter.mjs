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
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /<section class="home-panel home-visit-counter-panel" id="homeVisitCounterCard" data-admin-only hidden>[\s\S]*id="homeVisitTotal"[\s\S]*id="homeVisitMeta"/, "Home should include an admin-only visit counter panel at the bottom of the view");
assert.doesNotMatch(indexHtml, /home-overview-stat home-visit-counter-stat/, "Visit counter should not be embedded in the overview stats grid");
mustMatch(indexHtml, /app\.js\?v=\d{4}\.\d{2}\.\d{2}-build-\d+/, "Visit counter release should bump the app asset marker");

mustMatch(appJs, /const APP_VERSION = "v\.1\.1\.\d+"/, "Visit counter release should bump app version");
mustMatch(appJs, /VISITOR_ID_STORAGE_KEY[\s\S]*VISIT_SESSION_ID_STORAGE_KEY[\s\S]*VISIT_RECORDED_STORAGE_KEY/, "Visit tracking should use tiny local/session metadata keys");
mustMatch(functionBody(appJs, "initializeScorebookApp"), /initializeSiteVisitTracking\(\)/, "App boot should initialize visit tracking");
mustMatch(functionBody(appJs, "recordSiteVisitOnce"), /supabaseStorage\.recordSiteVisit[\s\S]*visitorId[\s\S]*sessionId[\s\S]*deviceType[\s\S]*metadata/, "Visit tracking should call Supabase with anonymous visitor/session metadata");
mustMatch(functionBody(appJs, "recordSiteVisitOnce"), /markVisitRecorded\(sessionId\)/, "Visit tracking should record at most once per session after a successful write");
mustMatch(functionBody(appJs, "applySupabaseAdminState"), /recordSiteVisitOnce\("admin-ready", \{ force: true \}\)[\s\S]*requestSiteVisitSummaryRefresh\("admin-ready", \{ force: true \}\)/, "Admin sign-in should update the visit row and load the admin summary");
mustMatch(functionBody(appJs, "renderHome"), /renderSiteVisitCounter\(\)[\s\S]*requestSiteVisitSummaryRefresh\("home"\)/, "Home render should surface the admin-only visit total");
mustMatch(functionBody(appJs, "renderSiteVisitCounter"), /homeVisitCounterCard\.hidden = !visible[\s\S]*homeVisitTotal[\s\S]*homeVisitMeta/, "Visit card should be hidden outside admin mode and render totals/meta only for admins");
assert.doesNotMatch(functionBody(appJs, "renderSiteVisitCounter"), /has-admin-visits/, "Visit counter should not mutate the home overview grid");

mustMatch(supabaseStorageJs, /function recordSiteVisit/, "Supabase storage should expose recordSiteVisit");
mustMatch(supabaseStorageJs, /function fetchSiteVisitSummary/, "Supabase storage should expose fetchSiteVisitSummary");
mustMatch(supabaseStorageJs, /\.rpc\("record_site_visit"/, "Visit writes should go through the RPC, not direct table inserts");
mustMatch(supabaseStorageJs, /\.rpc\("get_site_visit_summary"/, "Admin summaries should go through the summary RPC");
mustMatch(supabaseStorageJs, /record_site_visit function is not available/, "Missing visit RPC should produce an actionable setup message");

mustMatch(supabaseSchemaSql, /create table if not exists public\.site_visits/i, "Schema should create site_visits");
mustMatch(supabaseSchemaSql, /create or replace function public\.record_site_visit/i, "Schema should create the public visit recording RPC");
mustMatch(supabaseSchemaSql, /create or replace function public\.get_site_visit_summary/i, "Schema should create the admin summary RPC");
mustMatch(supabaseSchemaSql, /alter table public\.site_visits enable row level security/i, "site_visits should have RLS enabled");
mustMatch(supabaseSchemaSql, /Authenticated admin read site_visits[\s\S]*public\.app_admins/i, "Direct site_visits reads should be admin-only");
mustMatch(supabaseSchemaSql, /grant execute on function public\.record_site_visit[\s\S]*to anon, authenticated/i, "Anonymous users should only be able to record through the RPC");
mustMatch(supabaseSchemaSql, /grant execute on function public\.get_site_visit_summary\(\) to authenticated/i, "Summary RPC should only be exposed to authenticated callers");
assert.doesNotMatch(supabaseSchemaSql, /Public read site_visits|Public write site_visits|for insert\s+to anon|for all\s+to anon/i, "site_visits table should not expose direct public table access");

mustMatch(stylesCss, /\[hidden\]\s*\{[\s\S]*display: none !important;/, "Hidden admin-only panels should stay hidden even when component classes define display");
mustMatch(stylesCss, /\.home-visit-counter-panel[\s\S]*margin-top: 16px/, "Visit counter should sit as a bottom home panel");
mustMatch(stylesCss, /\.home-visit-counter-body[\s\S]*justify-content: space-between/, "Visit counter body should align its total and status compactly");
assert.doesNotMatch(stylesCss, /\.home-overview-stats\.has-admin-visits/, "Visit counter should not change overview stats layout");

console.log("Site visit counter checks passed.");
