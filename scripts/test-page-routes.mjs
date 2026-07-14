import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const serviceWorkerJs = readFileSync(join(rootDir, "service-worker.js"), "utf8");
const notFoundPath = join(rootDir, "404.html");
const notFoundHtml = readFileSync(notFoundPath, "utf8");
const mobileBottomNav = indexHtml.match(/<nav class="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";

function mustMatch(source, pattern, label) {
  assert.match(source, pattern, label);
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.equal(existsSync(notFoundPath), true, "404.html should exist for GitHub Pages deep links");

mustMatch(appJs, /const VIEW_ROUTES = \{[\s\S]*archive:\s*"\/archive"/, "Canonical routes should include Archive");
mustMatch(appJs, /const VIEW_ROUTES = \{[\s\S]*highlights:\s*"\/highlights"/, "Canonical routes should include Highlights");
mustMatch(appJs, /const VIEW_ROUTES = \{[\s\S]*bracket:\s*"\/bracket"/, "Canonical routes should include Bracket");
mustMatch(appJs, /const ROUTE_VIEW_ALIASES = \{[\s\S]*"\/archive":\s*"archive"/, "Route aliases should map Archive");
mustMatch(appJs, /const ROUTE_VIEW_ALIASES = \{[\s\S]*"\/highlights":\s*"highlights"/, "Route aliases should map Highlights");
mustMatch(appJs, /const ROUTE_VIEW_ALIASES = \{[\s\S]*"\/playoff-bracket":\s*"bracket"/, "Route aliases should map Bracket");
mustMatch(functionBody(appJs, "deploymentBasePath"), /\.github\.io/, "Route helper should detect GitHub Pages project paths");
mustMatch(functionBody(appJs, "routePathWithoutBase"), /deploymentBasePath\(locationObject\)/, "Route parsing should strip the deployment base path");
mustMatch(functionBody(appJs, "routeViewFromLocation"), /URLSearchParams[\s\S]*route/, "Route parser should support the GitHub Pages route query fallback");
mustMatch(functionBody(appJs, "updateBrowserRouteForView"), /deploymentBasePath\(window\.location\)/, "Route updates should preserve the deployment base path");
mustMatch(functionBody(appJs, "updateBrowserRouteForView"), /history\[method\]\(\{ view \}, "", routedUrl/, "Route updates should use the browser history API");
mustMatch(functionBody(appJs, "switchView"), /updateBrowserRouteForView\(nextView/, "switchView should push route changes");
mustMatch(appJs, /window\.addEventListener\("popstate"[\s\S]*switchView\(routeViewFromLocation\(\), \{ updateRoute: false \}\)/, "Browser back/forward should restore the routed view");

mustMatch(indexHtml, /data-view="archive"/, "Archive tab should remain available");
mustMatch(indexHtml, /data-view="highlights"/, "Highlights tab should be available");
mustMatch(indexHtml, /<button class="tab" data-view="roster">/, "Desktop roster tab should remain available");
mustMatch(mobileBottomNav, /data-view="roster"/, "Roster should be available in the mobile bottom navigation");
mustMatch(notFoundHtml, /params\.set\("route", route\)/, "404 fallback should preserve the requested path as route");
mustMatch(notFoundHtml, /routeRoots[\s\S]*archive/, "404 fallback should know the public route roots");
mustMatch(notFoundHtml, /routeRoots[\s\S]*bracket/, "404 fallback should know the bracket route");
mustMatch(notFoundHtml, /github\\.io[\s\S]*base = "\/" \+ parts\[0\]/, "404 fallback should preserve GitHub Pages project paths");
mustMatch(notFoundHtml, /window\.location\.replace\(base \+ "\/\?"/, "404 fallback should redirect to the app shell within the deployment base");
mustMatch(serviceWorkerJs, /"\.\/404\.html"/, "Service worker should cache 404.html");
mustMatch(serviceWorkerJs, /caches\.match\("\.\/index\.html"\)\.then\(\(cached\) => cached \|\| response\)/, "Navigation fetches should fall back to the app shell on non-OK responses");

const notFoundScript = notFoundHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";

function redirectFor(url) {
  let redirectedUrl = "";
  const location = new URL(url);
  location.replace = (nextUrl) => {
    redirectedUrl = nextUrl;
  };
  vm.runInNewContext(notFoundScript, { URLSearchParams, window: { location } });
  return redirectedUrl;
}

assert.equal(
  redirectFor("https://www.oakmontlions.com/archive"),
  "/?route=%2Farchive",
  "Root-domain deep links should return to the root app shell"
);
assert.equal(
  redirectFor("https://www.oakmontlions.com/bracket"),
  "/?route=%2Fbracket",
  "Root-domain bracket links should return to the app shell"
);
assert.equal(
  redirectFor("https://rycoulter.github.io/LionsScorebookQA/archive"),
  "/LionsScorebookQA/?route=%2Farchive",
  "GitHub Pages project deep links should keep the repo base path"
);

console.log("Page route checks passed.");
