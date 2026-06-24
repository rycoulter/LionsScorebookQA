import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(rootDir, "index.html"), "utf8");
const appJs = readFileSync(join(rootDir, "app.js"), "utf8");
const stylesCss = readFileSync(join(rootDir, "styles.css"), "utf8");

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return nextFunction === -1 ? source.slice(start) : source.slice(start, nextFunction);
}

assert.match(indexHtml, /id="homeResultsPrevBtn"[^>]*aria-label="Previous Game"[\s\S]*?<svg[^>]*home-results-carousel-icon-prev/, "Previous control should use an accessible inline SVG");
assert.match(indexHtml, /id="homeResultsNextBtn"[^>]*aria-label="Next Game"[\s\S]*?<svg[^>]*home-results-carousel-icon-next/, "Next control should use an accessible inline SVG");
assert.doesNotMatch(indexHtml, /homeResults(?:Prev|Next)Btn[\s\S]{0,240}(?:&lt;|&gt;|>\s*[<>]\s*<)/, "Game Results controls should not use text chevrons");
assert.match(indexHtml, /home-results-carousel-icon-claw/, "Carousel SVGs should include the subtle claw accent");

assert.match(appJs, /homeResultsPrevBtn\?\.addEventListener\("click", \(\) => scrollHomeResultsCarousel\(-1\)\)/, "Previous SVG button should preserve carousel navigation");
assert.match(appJs, /homeResultsNextBtn\?\.addEventListener\("click", \(\) => scrollHomeResultsCarousel\(1\)\)/, "Next SVG button should preserve carousel navigation");
assert.match(functionBody(appJs, "homeResultsCarouselElements"), /prev: els\.homeResultsPrevBtn[\s\S]*next: els\.homeResultsNextBtn/, "Disabled-state logic should use the header controls");
assert.match(functionBody(appJs, "syncHomeResultsCarouselControls"), /games\.length > 1/, "Carousel controls should only show for multiple games");

assert.match(stylesCss, /\.home-recent-result-panel \.home-dashboard-head[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*justify-content: space-between/, "Game Results heading and controls should use centered flex alignment");
assert.match(stylesCss, /\.home-results-carousel-button[\s\S]*transition:[\s\S]*color 180ms ease,[\s\S]*box-shadow 180ms ease/, "Carousel controls should smoothly transition color and shadow");
assert.match(stylesCss, /\.home-results-carousel-icon-claw[\s\S]*opacity: 0\.6/, "Claw accents should remain subtle at rest");

console.log("Home results carousel icon checks passed.");
