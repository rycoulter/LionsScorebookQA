import { readFileSync } from "node:fs";

const stylesCss = readFileSync("styles.css", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

function mustMatch(source, pattern, message) {
  if (!pattern.test(source)) {
    console.error(message);
    process.exit(1);
  }
}

function mustNotMatch(source, pattern, message) {
  if (pattern.test(source)) {
    console.error(message);
    process.exit(1);
  }
}

const topDownSectionStart = stylesCss.indexOf("/* Updated top-down spray field");
if (topDownSectionStart < 0) {
  console.error("Expected the top-down spray field CSS section to exist.");
  process.exit(1);
}

const topDownSection = stylesCss.slice(topDownSectionStart);

mustMatch(
  topDownSection,
  /#scoreView \.spray-chart[\s\S]*aspect-ratio: 4 \/ 3/,
  "Score Game spray chart should use the 4:3 field coordinate space."
);
mustMatch(
  topDownSection,
  /\.stats-spray-chart[\s\S]*aspect-ratio: 4 \/ 3/,
  "Stats spray chart should use the same 4:3 coordinate space as Score Game."
);
mustMatch(
  topDownSection,
  /@media \(max-width: 760px\)[\s\S]*#statsSprayModal \.stats-spray-chart[\s\S]*aspect-ratio: 4 \/ 3/,
  "Stats spray chart should keep 4:3 geometry on small screens."
);
mustNotMatch(
  topDownSection,
  /#statsSprayModal \.stats-spray-chart[\s\S]*aspect-ratio: 1 \/ 1/,
  "Stats spray chart should not switch to a square frame because that shifts percentage markers."
);
mustMatch(
  topDownSection,
  /#scoreView \.field-background-art,\s*\.stats-field-background-art[\s\S]*object-fit: contain[\s\S]*object-position: center center/,
  "Score Game and stats spray chart art should use the same contained image alignment."
);
mustMatch(
  stylesCss,
  /\.stats-spray-markers[\s\S]*position: absolute[\s\S]*inset: 0/,
  "Stats spray marker overlay should cover the same box as the field art."
);
mustMatch(
  indexHtml,
  /id="sprayChart"[\s\S]*src="assets\/updated-field\.png\?v=[^"]+"/,
  "Score Game spray chart should render the shared field image."
);
mustMatch(
  indexHtml,
  /id="statsSprayChart"[\s\S]*src="assets\/updated-field\.png\?v=[^"]+"/,
  "Stats spray chart should render the shared field image."
);
mustMatch(
  indexHtml,
  /id="statsSprayResultFilter"[\s\S]*value="hits"[\s\S]*Hits only[\s\S]*value="outs"[\s\S]*Outs only/,
  "Stats spray chart should include a hits/outs result filter."
);

console.log("Stats spray chart geometry checks passed.");
