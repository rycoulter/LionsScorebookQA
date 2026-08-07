import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

mustMatch(indexHtml, /class="brand-menu-btn" id="mobileAdminMenuBtn"/, "Logo and wordmark should be a mobile admin menu button");
mustMatch(indexHtml, /id="mobileAdminMenu" hidden/, "Mobile admin menu should exist and start hidden");
mustMatch(indexHtml, /data-mobile-admin-view="newsEditor"[\s\S]*News Editor/, "Mobile admin menu should link to News Editor");
mustMatch(indexHtml, /data-mobile-admin-view="finance"[\s\S]*Finance/, "Mobile admin menu should link to Finance");
mustMatch(indexHtml, /data-mobile-admin-view="archive"[\s\S]*Past Games/, "Mobile admin menu should link to Past Games");

const openBody = functionBody(appJs, "openMobileAdminMenu");
mustMatch(openBody, /openAdminAuthModal\("Sign in as admin to open mobile admin shortcuts\."\)/, "Public users should be prompted to sign in from the brand button");
mustMatch(openBody, /els\.mobileAdminMenu\.hidden = false/, "Opening the menu should unhide it");
mustMatch(openBody, /aria-expanded", "true"/, "Opening the menu should update aria-expanded");

const closeBody = functionBody(appJs, "closeMobileAdminMenu");
mustMatch(closeBody, /els\.mobileAdminMenu\.hidden = true/, "Closing the menu should hide it");
mustMatch(closeBody, /aria-expanded", "false"/, "Closing the menu should update aria-expanded");

const bindBody = functionBody(appJs, "bindEvents");
mustMatch(bindBody, /mobileAdminMenuBtn\?\.addEventListener\("click"[\s\S]*toggleMobileAdminMenu/, "Brand button should toggle mobile admin menu");
mustMatch(bindBody, /mobileAdminMenu\?\.addEventListener\("click"[\s\S]*data-mobile-admin-view[\s\S]*switchView\(shortcut\.dataset\.mobileAdminView\)/, "Mobile shortcut buttons should switch views");
mustMatch(bindBody, /event\.key === "Escape"[\s\S]*closeMobileAdminMenu/, "Escape should close the mobile admin menu");

mustMatch(stylesCss, /\.brand-menu-btn[\s\S]*display: inline-flex/, "Brand menu button should preserve logo and wordmark alignment");
mustMatch(stylesCss, /\.mobile-admin-menu[\s\S]*position: absolute/, "Mobile admin menu should be anchored below the header");
mustMatch(stylesCss, /\.mobile-admin-menu-grid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Mobile admin menu should use a compact two-column grid");
mustMatch(stylesCss, /body\[data-access-mode="public"\] \.mobile-admin-menu[\s\S]*display: none !important/, "Public mode should guard against showing the admin shortcut menu");
mustMatch(stylesCss, /@media \(max-width: 760px\)[\s\S]*\.topbar[\s\S]*position: relative[\s\S]*grid-template-areas: "brand actions"/, "Mobile topbar should anchor the absolute admin menu under the logo");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table thead[\s\S]*display: none/, "Finance ledger headers should collapse on mobile");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table tbody tr[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "Finance ledger rows should become mobile cards");
mustMatch(stylesCss, /@media \(max-width: 700px\)[\s\S]*\.finance-ledger-table td::before[\s\S]*content: attr\(data-label\)/, "Finance mobile cards should show cell labels");

console.log("Mobile admin navigation checks passed.");
