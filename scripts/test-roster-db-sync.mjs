import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
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

mustMatch(supabaseSchemaSql, /create table if not exists public\.roster_players/i, "Schema should create roster_players");
mustMatch(supabaseSchemaSql, /alter table public\.roster_players[\s\S]*add column if not exists team_id/i, "Schema should repair existing roster_players tables");
mustMatch(supabaseSchemaSql, /add column if not exists height text/i, "Schema should add missing roster height column on rerun");
mustMatch(supabaseSchemaSql, /add column if not exists metadata jsonb/i, "Schema should add missing roster metadata column on rerun");
mustMatch(supabaseSchemaSql, /roster_version text/i, "Roster version should be text-compatible");
mustMatch(supabaseSchemaSql, /alter column roster_version type text/i, "Schema should migrate existing app_state roster_version to text");
mustMatch(supabaseSchemaSql, /positions jsonb not null default '\[\]'::jsonb/i, "Roster positions should be stored as jsonb");
mustMatch(supabaseSchemaSql, /grades jsonb not null default '\{\}'::jsonb/i, "Roster grades should be stored as jsonb");
mustMatch(supabaseSchemaSql, /Public read roster_players/i, "Roster table should have public read policy");
mustMatch(supabaseSchemaSql, /Authenticated write roster_players/i, "Roster table should have authenticated admin write policy");
mustMatch(supabaseSchemaSql, /jsonb_array_elements\(app_state\.roster\)/i, "Schema should backfill roster_players from app_state.roster");

mustMatch(supabaseStorageJs, /function buildRosterPlayerRow/, "Storage should map app players to roster table rows");
mustMatch(supabaseStorageJs, /function rosterPlayerFromRow/, "Storage should map roster table rows back to app players");
mustMatch(supabaseStorageJs, /function fetchRosterPlayers/, "Storage should fetch roster_players");
mustMatch(supabaseStorageJs, /\.from\("roster_players"\)[\s\S]*\.eq\("team_id", "lions"\)/, "Roster fetch should target Lions rows");
mustMatch(supabaseStorageJs, /function upsertRosterPlayers/, "Storage should upsert roster_players");
mustMatch(supabaseStorageJs, /\.upsert\(rows, \{ onConflict: "id" \}\)/, "Roster upsert should be keyed by player id");
mustMatch(supabaseStorageJs, /Supabase roster_players table is not available to the app/, "Roster upsert should surface missing-table errors");
mustMatch(supabaseStorageJs, /rosterPlayersMissingTable: Boolean\(rosterPlayersResponse\.missingTable\)/, "Storage responses should expose roster missing-table status");
mustMatch(functionBody(supabaseStorageJs, "fetchBootstrap"), /rosterPlayers: rosterPlayersResponse\.data \|\| \[\]/, "Bootstrap should include roster table rows");

const mergeBody = functionBody(supabaseStorageJs, "mergeRemoteSnapshot");
mustMatch(mergeBody, /rosterRows = \[\]/, "Remote merge should accept roster rows");
mustMatch(mergeBody, /rosterRows\.map\(rosterPlayerFromRow\)/, "Remote merge should convert roster rows to app players");
mustMatch(mergeBody, /if \(rosterFromRows\.length\)[\s\S]*nextState\.roster = rosterFromRows/, "Roster rows should be preferred when present");
mustMatch(mergeBody, /if \(!rosterFromRows\.length && Array\.isArray\(appStateRow\.roster\)/, "App-state roster should remain a fallback");

mustMatch(appJs, /Array\.isArray\(snapshot\.rosterPlayers\) && snapshot\.rosterPlayers\.length/, "Meaningful snapshot detection should include roster rows");
mustMatch(appJs, /rosterRowsMissing[\s\S]*appStateRosterMissing[\s\S]*rosterMissing = rosterRowsMissing && appStateRosterMissing/, "Shared roster missing check should accept either table rows or app-state fallback");
mustMatch(appJs, /mergeRemoteSnapshot\(\s*state,\s*data\.appState,\s*data\.games,\s*data\.rosterPlayers,\s*data\.highlights,/, "Refresh should merge roster rows");
mustMatch(appJs, /remoteBootstrap\.data\.rosterPlayers/, "Sync baseline merge should include roster rows");
mustMatch(appJs, /supabaseStorage\.upsertRosterPlayers\(snapshot\.roster, snapshot\.rosterVersion\)/, "Shared sync should write roster_players");
mustMatch(appJs, /function sharedRosterSyncUnavailableError/, "Roster writes should check Supabase/admin readiness before claiming sync");
mustMatch(appJs, /async function syncSharedRosterChange/, "Roster edits should have an awaited shared sync path");
mustMatch(appJs, /rosterPlayersMissingTable: Boolean\(rosterPlayersResponse\.missingTable\)/, "Shared sync should expose roster missing-table status");
mustMatch(appJs, /let syncReason = existingPlayer \? "edit-player" : "add-player"/, "Add/edit player should choose the correct roster sync reason");
mustMatch(appJs, /syncReason = "reactivate-player"/, "Recreated inactive players should sync as a roster reactivation");
mustMatch(appJs, /await syncSharedRosterChangeOrAlert\(syncReason\)/, "Add/edit player should await roster sync and surface failures");
mustMatch(appJs, /await syncSharedRosterChangeOrAlert\("remove-roster-player"\)/, "Remove player should await roster sync and surface failures");
mustMatch(appJs, /await syncSharedRosterChangeOrAlert\("toggle-player-active"\)/, "Roster active toggle should await roster sync and surface failures");

console.log("Roster DB sync regression checks passed.");
