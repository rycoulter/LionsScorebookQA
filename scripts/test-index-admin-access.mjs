import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

const productionHostBody = functionBody(appJs, "isProductionSiteHost");
mustMatch(productionHostBody, /oakmontlions\.com/, "Production host should be explicitly recognized");
mustMatch(productionHostBody, /www\.oakmontlions\.com/, "WWW production host should be explicitly recognized");

const fallbackBody = functionBody(appJs, "indexAdminAccessEnabled");
mustMatch(fallbackBody, /if \(isProductionSiteHost\(host\)\) return false/, "Index admin fallback must not apply on production hosts");
mustMatch(fallbackBody, /protocol === "file:"/, "File-hosted index should get admin fallback");
mustMatch(fallbackBody, /host === "localhost" \|\| host === "127\.0\.0\.1" \|\| host === "::1"/, "Localhost index should get admin fallback");
mustMatch(fallbackBody, /window\.ScorebookSupabase\?\.environment === "qa"/, "QA environment should get admin fallback");

const loadBody = functionBody(appJs, "loadAccessMode");
mustMatch(loadBody, /if \(indexAdminAccessEnabled\(\)\) return "admin"/, "Fallback should initialize access mode as admin");
mustMatch(loadBody, /if \(isProductionSiteHost\(\)\) return "public"/, "Production should not hydrate stale cached admin mode before Supabase auth verifies it");

const normalizeBody = functionBody(appJs, "normalizeAccessMode");
mustMatch(normalizeBody, /nextMode === "admin" \|\| indexAdminAccessEnabled\(\) \? "admin" : "public"/, "Fallback should keep QA/local index in admin mode");

const isAdminBody = functionBody(appJs, "isAdminMode");
mustMatch(isAdminBody, /accessMode === "admin" \|\| indexAdminAccessEnabled\(\)/, "Admin checks should include the fallback");

const authBody = functionBody(appJs, "applySupabaseAdminState");
mustMatch(authBody, /ensureIndexAdminAccess\(\)/, "Auth reset should preserve QA/local index admin access");

const initBody = functionBody(appJs, "initializeSupabaseAuth");
mustMatch(initBody, /ensureIndexAdminAccess\(\)/, "Supabase auth initialization should enable fallback before auth checks");
mustMatch(initBody, /Unable to fetch the current Supabase session[\s\S]*setAccessMode\("public"\)/, "Production auth initialization errors should clear stale admin mode");

const signOutBody = functionBody(appJs, "signOutAdmin");
mustMatch(signOutBody, /supabaseAdminEmail = ""[\s\S]*setAccessMode\("public"\)[\s\S]*client\.auth\.signOut/, "Admin sign-out should clear local UI state before waiting on Supabase");

const sharedSessionBody = functionBody(appJs, "requireSharedAdminSession");
mustMatch(sharedSessionBody, /if \(!requireAdminAccess\(message\)\) return false/, "Shared writes should still require admin UI access first");
mustMatch(sharedSessionBody, /supabaseAdminEmail \|\| !productionSharedAdminSessionRequired\(\)/, "Shared writes should require verified Supabase admin on production but allow QA/local fallback");

const renderBody = functionBody(appJs, "renderAccessMode");
mustMatch(renderBody, /QA Admin/, "Access badge should make fallback admin mode visible");

console.log("Index admin access checks passed.");
