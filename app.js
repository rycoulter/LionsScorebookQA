const storage = window.ScorebookStorage || createFallbackScorebookStorage(window);

if (!window.ScorebookStorage) {
  window.ScorebookStorage = storage;
  console.warn("storage.js did not load; using bundled storage wrapper fallback.");
}

function createFallbackScorebookStorage(global) {
  const storageKey = "oakmont-lions-scorebook-v1";
  const libraryKey = "oakmont-lions-game-library-v1";
  const playHistoryStorageLimit = 8;

  function clone(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isQuotaExceeded(error) {
    return error?.name === "QuotaExceededError"
      || error?.code === 22
      || error?.code === 1014
      || String(error?.message || "").toLowerCase().includes("quota");
  }

  function setJsonItem(key, value) {
    const json = JSON.stringify(value);
    try {
      global.localStorage.setItem(key, json);
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      global.localStorage.removeItem(key);
      global.localStorage.setItem(key, json);
    }
  }

  function compactPlayHistory(history = [], limit = playHistoryStorageLimit) {
    if (!Array.isArray(history)) return [];
    return history.slice(-limit).map((entry) => {
      const next = clone(entry);
      if (next?.game) next.game.playHistory = [];
      return next;
    });
  }

  function compactGameForStorage(game, playHistoryLimit = playHistoryStorageLimit) {
    const next = clone(game);
    if (next?.playHistory) next.playHistory = compactPlayHistory(next.playHistory, playHistoryLimit);
    return next;
  }

  function compactLibraryForStorage(library, playHistoryLimit = playHistoryStorageLimit) {
    const normalized = normalizeLibrary(library);
    const compacted = emptyLibrary();
    normalized.gameOrder.forEach((gameId) => {
      const game = normalized.gamesById[gameId];
      if (!game?.id) return;
      compacted.gamesById[game.id] = compactGameForStorage(game, playHistoryLimit);
      compacted.gameOrder.push(game.id);
    });
    compacted.activeGameId = normalized.activeGameId;
    return compacted;
  }

  function appStateForStorage(state) {
    const next = clone(state || {});
    next.games = [];
    return next;
  }

  function releaseLegacyAppStateGames() {
    const appState = loadAppState();
    if (Array.isArray(appState?.games) && appState.games.length) {
      saveAppState(appState);
    }
  }

  function emptyLibrary() {
    return {
      activeGameId: "",
      gameOrder: [],
      gamesById: {}
    };
  }

  function normalizeLibrary(library) {
    const normalized = emptyLibrary();
    if (!library || typeof library !== "object") return normalized;
    const gamesById = library.gamesById && typeof library.gamesById === "object" ? library.gamesById : {};
    const explicitOrder = Array.isArray(library.gameOrder) ? library.gameOrder : [];

    explicitOrder.forEach((gameId) => {
      const game = gamesById[gameId];
      if (!game?.id) return;
      normalized.gamesById[game.id] = clone(game);
      if (!normalized.gameOrder.includes(game.id)) normalized.gameOrder.push(game.id);
    });

    Object.values(gamesById).forEach((game) => {
      if (!game?.id) return;
      normalized.gamesById[game.id] = clone(game);
      if (!normalized.gameOrder.includes(game.id)) normalized.gameOrder.push(game.id);
    });

    normalized.activeGameId = library.activeGameId && normalized.gamesById[library.activeGameId]
      ? library.activeGameId
      : "";
    return normalized;
  }

  function buildLibraryFromGames(games = [], activeGameId = "") {
    const library = emptyLibrary();
    games.forEach((game) => {
      if (!game?.id) return;
      library.gamesById[game.id] = clone(game);
      if (!library.gameOrder.includes(game.id)) library.gameOrder.push(game.id);
    });
    library.activeGameId = activeGameId && library.gamesById[activeGameId] ? activeGameId : "";
    return library;
  }

  function loadAppState() {
    try {
      const raw = global.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("Unable to load saved app state.", error);
      return null;
    }
  }

  function saveAppState(state) {
    setJsonItem(storageKey, appStateForStorage(state));
    return clone(state);
  }

  function loadLibrary() {
    try {
      const raw = global.localStorage.getItem(libraryKey);
      if (raw) return normalizeLibrary(JSON.parse(raw));
      const legacy = loadAppState();
      if (!Array.isArray(legacy?.games)) return emptyLibrary();
      const library = buildLibraryFromGames(legacy.games, legacy.activeGameId);
      saveLibrary(library);
      return library;
    } catch (error) {
      console.warn("Unable to load saved game library.", error);
      return emptyLibrary();
    }
  }

  function saveLibrary(library) {
    const compacted = compactLibraryForStorage(library);
    releaseLegacyAppStateGames();
    try {
      setJsonItem(libraryKey, compacted);
      return compacted;
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      const emergency = compactLibraryForStorage(library, 2);
      setJsonItem(libraryKey, emergency);
      return emergency;
    }
  }

  function saveGame(game, setActive = true) {
    if (!game?.id) return loadLibrary();
    const library = loadLibrary();
    library.gamesById[game.id] = clone(game);
    if (!library.gameOrder.includes(game.id)) library.gameOrder.push(game.id);
    if (setActive) library.activeGameId = game.id;
    return saveLibrary(library);
  }

  function loadGameById(gameId) {
    const library = loadLibrary();
    return library.gamesById[gameId] ? clone(library.gamesById[gameId]) : null;
  }

  function getActiveGame() {
    const library = loadLibrary();
    return library.activeGameId ? loadGameById(library.activeGameId) : null;
  }

  function setActiveGame(gameId) {
    const library = loadLibrary();
    if (!library.gamesById[gameId]) return null;
    library.activeGameId = gameId;
    saveLibrary(library);
    return clone(library.gamesById[gameId]);
  }

  function listGames() {
    const library = loadLibrary();
    return library.gameOrder.map((gameId) => clone(library.gamesById[gameId])).filter(Boolean);
  }

  function deleteGame(gameId) {
    const library = loadLibrary();
    if (!library.gamesById[gameId]) return library;
    delete library.gamesById[gameId];
    library.gameOrder = library.gameOrder.filter((id) => id !== gameId);
    if (library.activeGameId === gameId) library.activeGameId = "";
    return saveLibrary(library);
  }

  function exportGame(gameId) {
    const game = loadGameById(gameId);
    if (!game) throw new Error("Game not found.");
    return JSON.stringify(game, null, 2);
  }

  function importGameFromText(jsonText, setActive = false) {
    const payload = JSON.parse(String(jsonText || ""));
    if (payload.gamesById && payload.gameOrder) {
      const incomingLibrary = normalizeLibrary(payload);
      const currentLibrary = loadLibrary();
      incomingLibrary.gameOrder.forEach((gameId) => {
        currentLibrary.gamesById[gameId] = clone(incomingLibrary.gamesById[gameId]);
        if (!currentLibrary.gameOrder.includes(gameId)) currentLibrary.gameOrder.push(gameId);
      });
      if (setActive && incomingLibrary.activeGameId) {
        currentLibrary.activeGameId = incomingLibrary.activeGameId;
      }
      return saveLibrary(currentLibrary);
    }
    if (!payload.id) throw new Error("Imported JSON does not contain a game id.");
    saveGame(payload, setActive);
    return clone(payload);
  }

  const game = {
    loadLibrary,
    saveLibrary,
    saveGame,
    loadGameById,
    getActiveGame,
    setActiveGame,
    listGames,
    deleteGame,
    exportGame,
    importGameFromText,
    loadAppState,
    saveAppState,
    normalizeLibrary,
    emptyLibrary,
    buildLibraryFromGames
  };
}

const eventRules = {
  "1B": { label: "Single", pa: true, ab: true, hit: true, tb: 1, reach: true, bip: true },
  "2B": { label: "Double", pa: true, ab: true, hit: true, tb: 2, reach: true, bip: true },
  "3B": { label: "Triple", pa: true, ab: true, hit: true, tb: 3, reach: true, bip: true },
  HR: { label: "Home run", pa: true, ab: true, hit: true, tb: 4, reach: true, bip: true, hr: true },
  BB: { label: "Walk", pa: true, ab: false, bb: true, reach: true },
  HBP: { label: "Hit by pitch", pa: true, ab: false, hbp: true, reach: true },
  ROE: { label: "Reached on error", pa: true, ab: true, reach: true, bip: true, roe: true },
  FC: { label: "Fielder's choice", pa: true, ab: true, bip: true },
  DP: { label: "Double play", pa: true, ab: true, out: true, bip: true, dp: true },
  K: { label: "Strikeout", pa: true, ab: true, out: true, k: true },
  GO: { label: "Groundout", pa: true, ab: true, out: true, bip: true, launch: "gb" },
  FO: { label: "Flyout", pa: true, ab: true, out: true, bip: true, launch: "fb" },
  LO: { label: "Lineout", pa: true, ab: true, out: true, bip: true, launch: "ld" },
  SAC: { label: "Sacrifice", pa: true, ab: false, out: true, sac: true, bip: true },
  SUB: { label: "Substitution", pa: false },
  NR: { label: "Non-runner", pa: false },
  ADD: { label: "Added hitter", pa: false },
  SB: { label: "Stolen base", pa: false, sb: true },
  CS: { label: "Caught stealing", pa: false, cs: true, out: true },
  PO: { label: "Picked off", pa: false, po: true, out: true },
  BK: { label: "Balk", pa: false },
  TAG: { label: "Tag up", pa: false }
};

const launchLabels = {
  none: "No contact",
  gb: "Ground ball",
  ld: "Line drive",
  fb: "Fly ball",
  pu: "Pop up"
};

const contactLabels = {
  none: "No batted ball",
  weak: "Weak",
  solid: "Solid",
  hard: "Hard hit",
  barrel: "Barrel"
};

const pitchLabels = {
  ball: "Ball",
  strike: "Strike",
  called_strike: "Called strike",
  swinging_strike: "Swinging strike",
  foul: "Foul",
  in_play: "Ball in play"
};

const defensivePositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const lineupPositions = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "EH", "P"];
const fieldPositionsWithoutPitcher = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const gameStatPositions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "EH", "PH", "PR", "UTL"];

const battedBallResults = new Set(["1B", "2B", "3B", "HR", "ROE", "FC", "DP", "GO", "FO", "LO", "SAC"]);
const scorebookFielderResults = new Set(["GO", "FO", "LO", "DP", "FC", "SAC", "ROE"]);
const scorebookBaseRunningResults = new Set(["SB", "CS", "PO", "BK"]);
const statEditSprayResults = ["1B", "2B", "3B", "HR", "SAC", "GO", "LO", "FO"];
const statEditSprayResultSet = new Set(statEditSprayResults);
const statEditSprayHitResults = new Set(["1B", "2B", "3B", "HR"]);
const bulkHittingStatFields = [
  { key: "ab", label: "AB" },
  { key: "h", label: "H" },
  { key: "singles", label: "1B" },
  { key: "doubles", label: "2B" },
  { key: "triples", label: "3B" },
  { key: "hr", label: "HR" },
  { key: "bb", label: "BB" },
  { key: "hbp", label: "HBP" },
  { key: "k", label: "K" },
  { key: "roe", label: "ROE" },
  { key: "errors", label: "E" },
  { key: "fc", label: "FC" },
  { key: "sac", label: "SAC" },
  { key: "dp", label: "DP" },
  { key: "go", label: "GO" },
  { key: "lo", label: "LO" },
  { key: "fo", label: "FO" },
  { key: "sb", label: "SB" },
  { key: "cs", label: "CS" },
  { key: "po", label: "PO" },
  { key: "rbi", label: "RBI" },
  { key: "runs", label: "R" },
  { key: "rispAB", label: "RISP AB" },
  { key: "rispH", label: "RISP H" }
];
const bulkPitchingStatFields = [
  { key: "ip", label: "IP", type: "text", inputmode: "decimal", placeholder: "0.0" },
  { key: "pitches", label: "NP" },
  { key: "balls", label: "Balls" },
  { key: "strikes", label: "Strikes" },
  { key: "batters", label: "BF" },
  { key: "h", label: "H" },
  { key: "hr", label: "HR" },
  { key: "runs", label: "R" },
  { key: "earnedRuns", label: "ER" },
  { key: "bb", label: "BB" },
  { key: "hbp", label: "HBP" },
  { key: "k", label: "K" },
  { key: "sv", label: "SV" },
  { key: "decision", label: "Decision", type: "select" }
];

const PITTSBURGH_NABA_URL = "https://www.pittsburghnaba.org/teams/default.asp?s=baseball&u=PITTSBURGHNABA";
const PITTSBURGH_NABA_STANDINGS_URL = "https://www.pittsburghnaba.org/teams/default.asp?p=standings&s=baseball&u=PITTSBURGHNABA";

const AA_SCOUTING_SNAPSHOT = {
  division: "AA",
  sourceUrl: PITTSBURGH_NABA_STANDINGS_URL,
  sourceLabel: "Pittsburgh NABA AA standings",
  updatedLabel: "Official league snapshot",
  leagueLeaders: {
    hitters: [
      { name: "J. Desabato", team: "TUR", ab: 58, avg: ".638" },
      { name: "B. Hartz", team: "BAN", ab: 37, avg: ".595" },
      { name: "M. Demoss", team: "RRS", ab: 31, avg: ".581" },
      { name: "R. Devereaux", team: "KEY", ab: 61, avg: ".574" },
      { name: "S. Blackstone", team: "DUX", ab: 32, avg: ".562" }
    ],
    pitchers: [
      { name: "J. Dix", team: "PD2", w: 6, l: 1, k: 77, era: "0.94" },
      { name: "L. Carter", team: "BAN", w: 3, era: "1.01" },
      { name: "D. O'Brien", team: "KEY", w: 8, l: 1, k: 93, era: "1.17" },
      { name: "N. Riggle", team: "KEY", w: 4, l: 1, k: 51, era: "1.72" },
      { name: "M. Stanick", team: "BUC", w: 5, l: 1, k: 75, era: "1.97" }
    ]
  },
  teams: [
    {
      id: "key",
      name: "Keystone Oaks",
      code: "KEY",
      record: "21-2",
      points: 65,
      winPct: ".913",
      gb: "-",
      rf: 180,
      ra: 92,
      last10: "10-0",
      streak: "Won 18",
      url: "https://www.pittsburghnaba.org/teams/?u=PITTSBU-KEYSTONEOAKS",
      hitters: [
        { name: "R. Devereaux", pos: "1B", ab: 61, avg: ".574" },
        { name: "G. Sakely", pos: "SS", ab: 25, avg: ".440" },
        { name: "D. O'Brien", pos: "P", ab: 50, avg: ".360" },
        { name: "T. Klein", pos: "3B", ab: 31, avg: ".355" },
        { name: "T. Schuetz", pos: "LF", ab: 37, avg: ".351" }
      ],
      pitchers: [
        { name: "D. O'Brien", w: 8, l: 1, k: 93, era: "1.51" },
        { name: "N. Riggle", w: 4, l: 1, k: 51, era: "2.21" },
        { name: "J. Laporte", w: 5, l: 0, k: 27, era: "4.76" }
      ]
    },
    {
      id: "pd2",
      name: "Pittsburgh D2",
      code: "PD2",
      record: "14-9",
      points: 51,
      winPct: ".609",
      gb: "7",
      rf: 123,
      ra: 104,
      last10: "7-3",
      streak: "Lost 1",
      url: "https://www.pittsburghnaba.org/teams/?u=PITTSBU-PITTSBURGHD2",
      hitters: [
        { name: "N. Grice", pos: "3B", ab: 40, avg: ".500" },
        { name: "K. Ames", pos: "1B", ab: 63, avg: ".381" },
        { name: "N. Paul", pos: "RF", ab: 37, avg: ".351" },
        { name: "J. Hess", pos: "CF", ab: 63, avg: ".333" },
        { name: "M. Carpenter", pos: "P", ab: 27, avg: ".333" }
      ],
      pitchers: [
        { name: "J. Dix", w: 6, l: 1, k: 77, era: "0.94" },
        { name: "Z. Coukart", w: 1, l: 3, k: 21, era: "2.74" },
        { name: "J. Hess", w: 4, l: 2, k: 53, era: "3.86" }
      ]
    },
    {
      id: "dux",
      name: "South Oakland Ducks",
      code: "DUX",
      record: "13-11",
      points: 50,
      winPct: ".542",
      gb: "8.5",
      rf: 150,
      ra: 164,
      last10: "5-5",
      streak: "Lost 2",
      url: "https://www.pittsburghnaba.org/teams/?s=baseball&u=SOUTHOAKLANDDUCKS",
      hitters: [
        { name: "S. Blackstone", pos: "IF", ab: 32, avg: ".562" },
        { name: "M. Lombardi", pos: "RF", ab: 41, avg: ".439" },
        { name: "B. Gwin", pos: "CF", ab: 54, avg: ".426" },
        { name: "T. Morgan", pos: "OF", ab: 54, avg: ".426" },
        { name: "A. Defilippo", pos: "3B", ab: 57, avg: ".421" }
      ],
      pitchers: [
        { name: "B. Blackstone", w: 6, l: 3, k: 45, era: "2.91" },
        { name: "B. Welsh", w: 3, l: 4, k: 30, era: "3.52" }
      ]
    },
    {
      id: "buc",
      name: "Butler Buccos",
      code: "BUC",
      record: "13-10",
      points: 49,
      winPct: ".565",
      gb: "8",
      rf: 170,
      ra: 166,
      last10: "3-7",
      streak: "Lost 5",
      url: "https://www.pittsburghnaba.org/teams/?u=PITTSBU-BUTLERBUCCOS",
      hitters: [
        { name: "M. Stanick", pos: "CF", ab: 50, avg: ".480" },
        { name: "J. Domencic", pos: "LF", ab: 53, avg: ".472" },
        { name: "C. Carney", pos: "3B", ab: 24, avg: ".417" },
        { name: "A. Capizzi", pos: "2B", ab: 30, avg: ".367" },
        { name: "Z. Snyder", pos: "3B", ab: 41, avg: ".366" }
      ],
      pitchers: [
        { name: "M. Stanick", w: 5, l: 1, k: 75, era: "2.54" },
        { name: "P. O'Toole", w: 1, l: 1, k: 12, era: "2.57" },
        { name: "T. Botta", w: 3, l: 3, k: 36, era: "3.24" },
        { name: "C. Carney", w: 3, l: 0, k: 24, era: "4.67" }
      ]
    },
    {
      id: "shd",
      name: "South Hills Devils",
      code: "SHD",
      record: "13-9",
      points: 48,
      winPct: ".591",
      gb: "7.5",
      rf: 119,
      ra: 105,
      last10: "5-5",
      streak: "Won 4",
      url: "https://www.pittsburghnaba.org/teams/?p=home&s=baseball&u=PIT-SOUTHHILLSDEVILS",
      hitters: [
        { name: "A. Miles", pos: "P", ab: 59, avg: ".373" },
        { name: "R. Rodi", pos: "CF", ab: 65, avg: ".369" },
        { name: "B. Burnett", pos: "2B", ab: 55, avg: ".327" },
        { name: "O. Orona", pos: "LF", ab: 34, avg: ".324" },
        { name: "T. Arzenti", pos: "1B", ab: 51, avg: ".314" }
      ],
      pitchers: [
        { name: "H. Pincavitch", w: 4, l: 1, k: 28, era: "2.84" },
        { name: "A. Miles", w: 4, l: 5, k: 48, era: "4.49" }
      ]
    },
    {
      id: "ban",
      name: "BiscuitvilleTownSquare Bandidos",
      code: "BAN",
      record: "12-6-1",
      points: 43,
      winPct: ".658",
      gb: "6.5",
      rf: 116,
      ra: 56,
      last10: "7-2-1",
      streak: "Won 2",
      url: "https://www.pittsburghnaba.org/teams/default.asp?u=BAKERYSQUAREBANDIDOS&s=baseball&p=stats",
      statsUrl: "https://www.pittsburghnaba.org/teams/default.asp?u=BAKERYSQUAREBANDIDOS&s=baseball&p=stats",
      hitters: [
        { name: "B. Hartz", pos: "-", ab: 37, avg: ".595" }
      ],
      pitchers: [
        { name: "L. Carter", w: 3, era: "1.01" }
      ]
    },
    {
      id: "tur",
      name: "Bauerstown Turtles",
      code: "TUR",
      record: "10-12",
      points: 42,
      winPct: ".455",
      gb: "10.5",
      rf: 148,
      ra: 129,
      last10: "6-4",
      streak: "Won 2",
      url: "https://www.pittsburghnaba.org/teams/default.asp?p=home&s=baseball&u=BAUERSTOWNTURTLES",
      hitters: [
        { name: "J. Desabato", pos: "CF", ab: 58, avg: ".638" },
        { name: "E. Walsh", pos: "SS", ab: 57, avg: ".491" },
        { name: "A. Cugini", pos: "CF", ab: 40, avg: ".425" },
        { name: "P. Perman", pos: "2B", ab: 42, avg: ".381" },
        { name: "B. Driscoll", pos: "1B", ab: 35, avg: ".371" }
      ],
      pitchers: [
        { name: "M. Brooks", w: 3, l: 1, k: 25, era: "3.69" },
        { name: "P. Perman", w: 2, l: 2, k: 19, era: "5.25" },
        { name: "K. Ford", w: 2, l: 3, k: 13, era: "7.00" },
        { name: "E. Walsh", w: 2, l: 4, k: 24, era: "8.97" }
      ]
    },
    {
      id: "sse",
      name: "South Side Eagles",
      code: "SSE",
      record: "8-16",
      points: 40,
      winPct: ".333",
      gb: "13.5",
      rf: 160,
      ra: 191,
      last10: "3-7",
      streak: "Won 1",
      url: "https://www.pittsburghnaba.org/teams/?s=baseball&u=PITT-SOUTHSIDEEAGLES",
      hitters: [
        { name: "A. Lardo", pos: "CF", ab: 78, avg: ".449" },
        { name: "R. Saari", pos: "P", ab: 27, avg: ".444" },
        { name: "J. McAuliffe", pos: "P", ab: 79, avg: ".354" },
        { name: "E. Carey", pos: "P", ab: 77, avg: ".338" },
        { name: "J. Panek", pos: "OF", ab: 76, avg: ".316" }
      ],
      pitchers: [
        { name: "J. Seymour", w: 4, l: 2, k: 52, era: "2.12" },
        { name: "N. Belinsky", w: 2, l: 1, k: 19, era: "5.36" },
        { name: "A. Pannunzio", w: 2, l: 8, k: 44, era: "6.95" },
        { name: "E. Carey", w: 1, l: 2, k: 43, era: "7.61" }
      ]
    },
    {
      id: "rrs",
      name: "Ross Raiders",
      code: "RRS",
      record: "2-21-1",
      points: 28,
      winPct: ".104",
      gb: "19",
      rf: 81,
      ra: 209,
      last10: "0-10",
      streak: "Lost 13",
      url: PITTSBURGH_NABA_URL,
      hitters: [
        { name: "M. Demoss", pos: "-", ab: 31, avg: ".581" }
      ],
      pitchers: []
    }
  ]
};

const ROSTER_VERSION = "oakmont-real-roster-2026-04-17";

const defaultRoster = parseRosterCsv(`
12,Arch,Ray,UTL
66,Butko,Roy,P|1B|OF
27,Coulter,Ryan,C|3B
16,Draxinger,Aidan,C|OF
28,Kysor,Sam,SS|3B|2B
7,Patsey,John,P|CF
10,Ranegar,Devin,P|1B
69,Reilly,Brady,OF
4,Reilly,Cory,UTL
11,Smittle,Kolton,P|2B|C
44,Turacy-Shurtz,Ryan,1B
22,Willochell,Brady,SS|2B
2, Pace,Matt,UTL
19,Kilgore,Caleb,P|1B
15,W.,Zach,P|OF
1,Kurtik,Matt,UTL
25,Kennedy,Ray,UTL
33,Rodella,Goat,UTL
`);

const APP_VERSION = "v.1.1.103";
const HOME_NO_GAME_HERO_IMAGE = "assets/backgrounds/lions-no-game-hero.png";
const NIGHT_GAME_START_MINUTES = 20 * 60;
const ERA_GAME_INNINGS = 7;
const LEAGUE_STANDINGS_CACHE_URL = "data/league-standings.json";
const NABA_ROSTERS_CACHE_URL = "data/naba-rosters.json";
const SCHEDULED_LIVE_WINDOW_MINUTES = 150;
// Flip this to true while debugging stale Safari/iPad builds, or load the app with ?no-sw=1.
const DISABLE_SERVICE_WORKER_REGISTRATION = false;
const GA_MEASUREMENT_ID = "G-JWRVWJ9XYP";
const ACCESS_MODE_STORAGE_KEY = "oakmont-lions-access-mode-v1";
const ADMIN_EMAIL_STORAGE_KEY = "oakmont-lions-admin-email-v1";
const VISITOR_ID_STORAGE_KEY = "oakmont-lions-visitor-id-v1";
const VISIT_SESSION_ID_STORAGE_KEY = "oakmont-lions-visit-session-id-v1";
const VISIT_RECORDED_STORAGE_KEY = "oakmont-lions-visit-recorded-v1";
const SITE_VISIT_SUMMARY_REFRESH_MS = 5 * 60 * 1000;
const PUBLIC_TAB_VIEWS = new Set(["home", "news", "standings", "games", "roster", "stats", "highlights", "archive"]);
const PUBLIC_READ_VIEWS = new Set(["home", "news", "standings", "games", "roster", "stats", "highlights", "archive", "scorebook", "boxscore"]);
const ADMIN_TAB_VIEWS = new Set(["home", "news", "standings", "newsEditor", "score", "games", "lineup", "roster", "stats", "highlights", "scouting", "archive", "analysis"]);
const VIEW_ROUTES = {
  home: "/",
  news: "/news",
  standings: "/standings",
  games: "/schedule",
  roster: "/roster",
  stats: "/stats",
  highlights: "/highlights",
  archive: "/archive",
  scorebook: "/scorebook",
  boxscore: "/boxscore",
  score: "/score-game"
};
const ROUTE_VIEW_ALIASES = {
  "/": "home",
  "/home": "home",
  "/team-news": "news",
  "/news": "news",
  "/standings": "standings",
  "/schedule": "games",
  "/schedule-and-scores": "games",
  "/games": "games",
  "/roster": "roster",
  "/stats": "stats",
  "/statistics": "stats",
  "/highlights": "highlights",
  "/game-highlights": "highlights",
  "/archive": "archive",
  "/game-archive": "archive",
  "/scorebook": "scorebook",
  "/boxscore": "boxscore",
  "/box-score": "boxscore",
  "/score-game": "score",
  "/score": "score"
};
const HIGHLIGHT_FILTERS = [
  { value: "all", label: "All" },
  { value: "game-recaps", label: "Game Recaps" },
  { value: "walk-offs", label: "Walk-Offs" },
  { value: "top-plays", label: "Top Plays" },
  { value: "player-highlights", label: "Player Highlights" },
  { value: "pitching", label: "Pitching" },
  { value: "defense", label: "Defense" }
];
const DEFAULT_HIGHLIGHT_CATEGORY = "top-plays";
const DEFAULT_HIGHLIGHT_CATEGORIES = [DEFAULT_HIGHLIGHT_CATEGORY];
const supabaseStorage = window.ScorebookSupabaseStorage || null;

const FIELD_LOCATIONS = [
  { name: "Herschel Park", address: "800 Herschel St, Pittsburgh, PA 15220" },
  { name: "John Herb Field", address: "1000 Ross Municipal Dr, Pittsburgh, PA 15237" },
  { name: "Bauerstown", address: "152 Koehler St, Pittsburgh, PA 15223" },
  { name: "Joe Natoli Field", address: "100 Presidents Way, Pittsburgh, PA 15206" },
  { name: "Mellon Park", address: "6600 Fifth Ave, Pittsburgh, PA 15206" },
  { name: "Riverside Park", address: "100 Hulton Rd, Oakmont, PA 15139" },
  { name: "Graham Park", address: "UPMC Passavant Sportsplex at Graham Park, 260 Graham Park Drive, Cranberry Twp, PA 16066" }
];

const FIELD_LOCATION_COORDINATES = {
  "herschel park": { latitude: 40.438, longitude: -80.044 },
  "john herb field": { latitude: 40.527, longitude: -80.022 },
  bauerstown: { latitude: 40.501, longitude: -79.959 },
  "mellon park": { latitude: 40.454, longitude: -79.916 },
  "riverside park": { latitude: 40.524, longitude: -79.839 },
  "graham park": { latitude: 40.692, longitude: -80.111 }
};

let state = seedState();
let accessMode = loadAccessMode();
let optimizedIds = [];
let pendingSpray = null;
let lineupBuilderGameId = null;
let gameEditId = null;
let pendingRunnerOutBases = [];
let hittingSort = { key: "ops", direction: "desc" };
let pitchingSort = { key: "outs", direction: "desc" };
let statsSprayExpanded = false;
let statEditPlayerId = "";
let statEditGameId = "";
let statEditSprays = [];
let statEditSprayMode = "1B";
let pitchingStatEditPlayerId = "";
let pitchingStatEditGameId = "";
let bulkStatEditGameId = "";
let bulkStatEditMode = "hitting";
let reopenBulkStatEditAfterStatModal = false;
let highlightCategoryFilter = "all";
let highlightSearchQuery = "";
let selectedFeaturedHighlightId = "";
let highlightEditId = "";
let highlightModalGameId = "";
let newsEditId = "";
let newsEditorImageDataUrl = "";
let quickScoreGameId = "";
let boxScoreEditGameId = "";
let rosterFilter = "active";
let rosterSearchQuery = "";
let rosterSortKey = "number";
let rosterViewMode = "cards";
let scoutingData = null;
let leagueStandingsRows = [];
let leagueStandingsUpdatedLabel = "Waiting for standings cache.";
let leagueStandingsSourceLabel = "Pittsburgh NABA AA standings";
let leagueStandingsSourceUrl = PITTSBURGH_NABA_STANDINGS_URL;
let nabaRosterCache = null;
let opponentRosterSearchQuery = "";
let opponentRosterStatusMessage = "";
let opponentLineupActiveIndex = 0;
let selectedScoutingTeamId = "";
let scoutingRefreshState = "snapshot";
let scoutingStatusMessage = "Using Pittsburgh NABA AA snapshot.";
let scorebookGameId = "";
let boxScoreGameId = "";
let editingRosterPlayerId = "";

function rosterPlayerDetailsOpen() {
  return !els.rosterPlayerDetails?.hidden;
}

function setRosterPlayerDetailsOpen(isOpen) {
  if (!els.rosterPlayerDetails) return;
  els.rosterPlayerDetails.hidden = !isOpen;
}

let boxScoreTeam = "lions";
let boxScoreReturnView = "archive";
const shownLineupPreviewKeys = new Set();
const shownBatterIntroKeys = new Set();
const BATTER_INTRO_DURATION_MS = 3000;
let batterIntroTimer = null;
let pendingBatterIntroKey = "";
let visibleBatterIntroKey = "";
let gameSummaryId = "";
const ROSTER_SILHOUETTE_ASSETS = {
  P: "assets/roster/roster-pitcher-image.png",
  L: "assets/roster/roster-left-image-new.png",
  R: "assets/roster/roster-right-image-new.png",
  S: "assets/roster/roster-right-image-new.png"
};
let lionsWinAnimationTimer = null;
let activeLionsWinAnimationGameId = "";
const playedLionsWinAnimationGameIds = new Set();
let halfInningChangeTimer = null;
let activeHalfInningChangeKey = "";
let bipOutcomeChosen = false;
let awaitingSprayLocation = false;
let awaitingRunnerDecision = false;
let scoringStep = "pitch";
let pendingRunnerChoices = {};
let runnerDecisionError = "";
let scoreCompleteSummaryGameId = "";
let pendingOutType = "";
let pendingOutFielder = "";
let gameFilter = "all";
let scheduleGamesLayout = "dashboard";
let scheduleSeasonFilter = String(currentLeagueSeason());
let scheduleCalendarMonth = todayValue().slice(0, 7);
let archiveSeasonFilter = String(currentLeagueSeason());
let statsSeasonFilter = String(currentLeagueSeason());
let newsCategoryFilter = "all";
let selectedNewsArticleId = "";
let newsLayoutMode = "latest";
let statsPlayerFocus = "all";
let activeCustomSubSelect = null;
let statsMode = "hitting";
let desktopHitPlayerFilter = "all";
let desktopPitPlayerFilter = "all";
let mobileHitPlayerFilter = "all";
let mobileHitGameFilter = "all";
let mobilePitPlayerFilter = "all";
let mobilePitGameFilter = "all";
let lineupBuilderReturnView = "games";
let lineupBuilderSelectedEntryId = "";
let selectedFieldRunnerBase = "";
let pendingRunnerReplacementBase = "";
let currentView = "home";
let pendingAdminView = "";
let supabaseBootstrapPromise = null;
let supabaseRefreshPromise = null;
let sharedSyncPromise = null;
let completedGameSyncQueuePromise = null;
let liveGameSyncTimer = null;
let supabaseAdminEmail = "";
let siteVisitSummary = null;
let siteVisitSummaryState = "idle";
let siteVisitSummaryPromise = null;
let siteVisitSummaryLoadedAt = 0;
let siteVisitRecordPromise = null;
let siteVisitWarningShown = false;
const activeCompletedGameSyncs = new Set();
const weatherCache = {};
const weatherRequests = {};
let lastSupabaseRefreshAt = 0;
let lastSharedBaselineAt = 0;
let sharedWriteBaselineReady = false;
let sharedAppStateDirtyInSession = false;
let scoringStepHoldTimer = null;
let scoringStepHoldButton = null;
let scoringStepHoldConsumedButton = null;
let scoringStepHoldConsumedAt = 0;
let scoringStepPointerActionButton = null;
let scoringStepPointerActionKey = "";
let scoringStepPointerActionAt = 0;
const POINTER_ACTION_CLICK_SUPPRESS_MS = 2500;
const SCORING_PANEL_POINTERUP_ACTION_SELECTOR = [
  "button[data-step-pitch]",
  "button[data-step-auto-result]",
  "button[data-special-action]",
  "button[data-runner-replacement-id]",
  "button[data-clear-runner-selection]",
  "button[data-step-outcome]",
  "button[data-out-type]",
  "button[data-out-fielder]",
  "button[data-runner-choice-base]",
  "button[data-confirm-play]",
  "button[data-game-complete-action]",
  "button[data-opponent-result]"
].join(", ");
let scoreGameRenderFlushTimer = null;
let scoreGamePaintFlushFrame = 0;
let localStorageSaveWarningShown = false;
let lastPitchFeedback = null;
let pitchFeedbackTimer = null;
let pitchFeedbackSequence = 0;
let actionFeedback = null;
let actionFeedbackTimer = null;
let actionFeedbackSequence = 0;
let runScoreFeedback = null;
let runScoreFeedbackTimer = null;
let runScoreFeedbackSequence = 0;
let pitcherSelectLastFocus = null;
const pendingSharedGameIds = new Set();
const pendingDeletedSharedGameIds = new Set();
let pendingServiceWorkerRefresh = false;
const SUPABASE_REFRESH_THROTTLE_MS = 15000;
const PLAY_HISTORY_LIMIT = 8;
const PITCH_FEEDBACK_DURATION_MS = 700;
const ACTION_FEEDBACK_DURATION_MS = 600;
const RUN_SCORE_FEEDBACK_DURATION_MS = 1500;
const LIVE_GAME_SYNC_DEBOUNCE_MS = 8000;

const els = {
  tabs: [...document.querySelectorAll(".tab")],
  mobileBottomNavTabs: [...document.querySelectorAll(".mobile-bottom-nav-tab")],
  views: [...document.querySelectorAll(".view")],
  homeScoreGameBtn: document.getElementById("homeScoreGameBtn"),
  homeStartGameBtn: document.getElementById("homeStartGameBtn"),
  accountMenuBtn: document.getElementById("accountMenuBtn"),
  accessModeBadge: document.getElementById("accessModeBadge"),
  adminUnlockBtn: document.getElementById("adminUnlockBtn"),
  adminLockBtn: document.getElementById("adminLockBtn"),
  adminAuthModal: document.getElementById("adminAuthModal"),
  adminAuthMessage: document.getElementById("adminAuthMessage"),
  adminAuthModeLabel: document.getElementById("adminAuthModeLabel"),
  adminEmailInput: document.getElementById("adminEmailInput"),
  adminPasswordInput: document.getElementById("adminPasswordInput"),
  adminAuthCancelBtn: document.getElementById("adminAuthCancelBtn"),
  adminAuthSubmitBtn: document.getElementById("adminAuthSubmitBtn"),
  homeRecord: document.getElementById("homeRecord"),
  homeWinPct: document.getElementById("homeWinPct"),
  homeLeagueStanding: document.getElementById("homeLeagueStanding"),
  homeCurrentStreak: document.getElementById("homeCurrentStreak"),
  homeVisitCounterCard: document.getElementById("homeVisitCounterCard"),
  homeVisitTotal: document.getElementById("homeVisitTotal"),
  homeVisitMeta: document.getElementById("homeVisitMeta"),
  homeMatchupImage: document.getElementById("homeMatchupImage"),
  homeNextGame: document.getElementById("homeNextGame"),
  homeNextGameMobileTitle: document.getElementById("homeNextGameMobileTitle"),
  homeNextGameWhen: document.getElementById("homeNextGameWhen"),
  homeNextGameLocation: document.getElementById("homeNextGameLocation"),
  homeNextGameStatus: document.getElementById("homeNextGameStatus"),
  homeNextGameStatusText: document.getElementById("homeNextGameStatusText"),
  homeNextGameWeather: document.getElementById("homeNextGameWeather"),
  homeNextGameScoreBtn: document.getElementById("homeNextGameScoreBtn"),
  homeNextGameScheduleLink: document.getElementById("homeNextGameScheduleLink"),
  homeScoutingBtn: document.getElementById("homeScoutingBtn"),
  homeGamesBtn: document.getElementById("homeGamesBtn"),
  homeBattingLeaders: document.getElementById("homeBattingLeaders"),
  homeBattingLeadersLink: document.getElementById("homeBattingLeadersLink"),
  homePitchingLeaders: document.getElementById("homePitchingLeaders"),
  homePitchingLeadersLink: document.getElementById("homePitchingLeadersLink"),
  homeRecentResultOutcome: document.getElementById("homeRecentResultOutcome"),
  homeRecentResultBody: document.getElementById("homeRecentResultBody"),
  homeTeamNewsBody: document.getElementById("homeTeamNewsBody"),
  homeTeamNewsLink: document.getElementById("homeTeamNewsLink"),
  leagueStandingsStatus: document.getElementById("leagueStandingsStatus"),
  leagueStandingsMeta: document.getElementById("leagueStandingsMeta"),
  leagueStandingsBody: document.getElementById("leagueStandingsBody"),
  refreshLeagueStandingsBtn: document.getElementById("refreshLeagueStandingsBtn"),
  homeUpcomingGames: document.getElementById("homeUpcomingGames"),
  homePastGames: document.getElementById("homePastGames"),
  scoreViewTitle: document.getElementById("scoreViewTitle"),
  gameTitle: document.getElementById("gameTitle"),
  currentBatterCard: document.querySelector("#scoreView .current-batter-card"),
  scoreAwayLogo: document.getElementById("scoreAwayLogo"),
  scoreAwayName: document.getElementById("scoreAwayName"),
  scoreAwayDisplay: document.getElementById("scoreAwayDisplay"),
  scoreHomeLogo: document.getElementById("scoreHomeLogo"),
  scoreHomeName: document.getElementById("scoreHomeName"),
  scoreHomeDisplay: document.getElementById("scoreHomeDisplay"),
  scoreBannerShell: document.querySelector("#scoreView .score-banner-shell"),
  scoreBannerArrow: document.querySelector("#scoreView .score-banner-arrow"),
  headerOutDots: [...document.querySelectorAll("#headerOutsFocus .score-banner-out-dot")],
  headerBaseIndicators: [...document.querySelectorAll("#scoreView .score-banner-base[data-score-base]")],
  headerBatterDisplay: document.getElementById("headerBatterDisplay"),
  headerBatterOutcomesDisplay: document.getElementById("headerBatterOutcomesDisplay"),
  currentBatterStatLabel: document.getElementById("currentBatterStatLabel"),
  currentBatterAvgDisplay: document.getElementById("currentBatterAvgDisplay"),
  headerBatterStatus: document.getElementById("headerBatterStatus"),
  headerBatterCountDisplay: document.getElementById("headerBatterCountDisplay"),
  headerBatterOutsDisplay: document.getElementById("headerBatterOutsDisplay"),
  pitcherRowCountDisplay: document.getElementById("pitcherRowCountDisplay"),
  pitcherRowOutsDisplay: document.getElementById("pitcherRowOutsDisplay"),
  headerCountDisplay: document.getElementById("headerCountDisplay"),
  headerCountFocus: document.getElementById("headerCountFocus"),
  gameContext: document.getElementById("gameContext"),
  scoreEmptyState: document.getElementById("scoreEmptyState"),
  scoreEmptyHomeBtn: document.getElementById("scoreEmptyHomeBtn"),
  scoreEmptyGamesBtn: document.getElementById("scoreEmptyGamesBtn"),
  inningStateDisplay: document.getElementById("inningStateDisplay"),
  outsStateDisplay: document.getElementById("outsStateDisplay"),
  headerOutsFocus: document.getElementById("headerOutsFocus"),
  scorerStack: document.getElementById("scorerStack"),
  currentBatterName: document.getElementById("currentBatterName"),
  currentBatterMeta: document.getElementById("currentBatterMeta"),
  lineupPreviewCard: document.getElementById("lineupPreviewCard"),
  lineupPreviewEyebrow: document.getElementById("lineupPreviewEyebrow"),
  lineupPreviewTitle: document.getElementById("lineupPreviewTitle"),
  lineupPreviewList: document.getElementById("lineupPreviewList"),
  dismissLineupPreviewBtn: document.getElementById("dismissLineupPreviewBtn"),
  batterIntroCard: document.getElementById("batterIntroCard"),
  batterIntroName: document.getElementById("batterIntroName"),
  batterIntroMeta: document.getElementById("batterIntroMeta"),
  batterIntroList: document.getElementById("batterIntroList"),
  dismissBatterIntroBtn: document.getElementById("dismissBatterIntroBtn"),
  batterSummary: document.getElementById("batterSummary"),
  countDisplay: document.getElementById("countDisplay"),
  currentOutsDisplay: document.getElementById("currentOutsDisplay"),
  pitchButtons: [...document.querySelectorAll("[data-pitch]")],
  autoResultButtons: [...document.querySelectorAll("[data-auto-result]")],
  pitchTrail: document.getElementById("pitchTrail"),
  resetCountBtn: document.getElementById("resetCountBtn"),
  undoPitchBtn: document.getElementById("undoPitchBtn"),
  sprayChart: document.getElementById("sprayChart"),
  sprayMarkers: document.getElementById("sprayMarkers"),
  runnerFieldMarkers: document.getElementById("runnerFieldMarkers"),
  runScoreFeedbackLayer: document.getElementById("runScoreFeedbackLayer"),
  sprayFilter: document.getElementById("sprayFilter"),
  sprayHint: document.getElementById("sprayHint"),
  abCard: document.getElementById("abCard"),
  bipPanel: document.getElementById("bipPanel"),
  clearBipBtn: document.getElementById("clearBipBtn"),
  opponentAbPanel: document.getElementById("opponentAbPanel"),
  opponentBatterName: document.getElementById("opponentBatterName"),
  opponentBatterMeta: document.getElementById("opponentBatterMeta"),
  opponentBatterSummary: document.getElementById("opponentBatterSummary"),
  opponentCountDisplay: document.getElementById("opponentCountDisplay"),
  opponentOutsDisplay: document.getElementById("opponentOutsDisplay"),
  opponentPitchTrail: document.getElementById("opponentPitchTrail"),
  resetOpponentCountBtn: document.getElementById("resetOpponentCountBtn"),
  undoOpponentPitchBtn: document.getElementById("undoOpponentPitchBtn"),
  undoOpponentPlayBtn: document.getElementById("undoOpponentPlayBtn"),
  pitcherSelect: document.getElementById("pitcherSelect"),
  pitcherStatStrip: document.getElementById("pitcherStatStrip"),
  gamePitcherCard: document.querySelector(".game-pitcher-card"),
  gamePitcherContent: document.getElementById("gamePitcherContent"),
  gameBattingStatusRow: document.getElementById("gameBattingStatusRow"),
  opponentOutcomeButtons: [...document.querySelectorAll("[data-opponent-result]")],
  runnerBases: [...document.querySelectorAll("[data-runner-base]")],
  runnerSummary: document.getElementById("runnerSummary"),
  runnerHint: document.getElementById("runnerHint"),
  runnerActionButtons: [...document.querySelectorAll("[data-runner-action]")],
  runnerPlayControls: document.getElementById("runnerPlayControls"),
  runnerOutButtons: [...document.querySelectorAll("[data-runner-out-base]")],
  resolvePlayBtn: document.querySelector("[data-resolve-play]"),
  scoringStepPanel: document.getElementById("scoringStepPanel"),
  scoringStepEyebrow: document.getElementById("scoringStepEyebrow"),
  scoringStepTitle: document.getElementById("scoringStepTitle"),
  scoringStepHint: document.getElementById("scoringStepHint"),
  scoringStepBody: document.getElementById("scoringStepBody"),
  pitchFeedbackLayer: document.getElementById("pitchFeedbackLayer"),
  actionFeedbackLayer: document.getElementById("actionFeedbackLayer"),
  panelUndoPitchBtn: document.getElementById("panelUndoPitchBtn"),
  openGameActionsBtn: document.getElementById("openGameActionsBtn"),
  scoringDockFooter: document.getElementById("scoringDockFooter"),
  scoringDockSummary: document.getElementById("scoringDockSummary"),
  dockCountValue: document.getElementById("dockCountValue"),
  dockCountMeta: document.getElementById("dockCountMeta"),
  dockBaseIndicators: [...document.querySelectorAll("[data-dock-base]")],
  dockOutDots: [...document.querySelectorAll("[data-dock-out]")],
  dockUndoLastPlayBtn: document.getElementById("dockUndoLastPlayBtn"),
  dockChangePitcherBtn: document.getElementById("dockChangePitcherBtn"),
  dockPitcherCard: document.getElementById("dockPitcherCard"),
  dockBatterCard: document.getElementById("dockBatterCard"),
  dockSeasonCard: document.getElementById("dockSeasonCard"),
  dockLastResultCard: document.getElementById("dockLastResultCard"),
  dockLastResultTitle: document.getElementById("dockLastResultTitle"),
  dockLastResultMeta: document.getElementById("dockLastResultMeta"),
  dockPitcherNumber: document.getElementById("dockPitcherNumber"),
  dockPitcherName: document.getElementById("dockPitcherName"),
  dockPitcherPitchCount: document.getElementById("dockPitcherPitchCount"),
  dockPitcherBreakdown: document.getElementById("dockPitcherBreakdown"),
  dockBatterName: document.getElementById("dockBatterName"),
  dockBatterGameLine: document.getElementById("dockBatterGameLine"),
  dockBatterSeasonLine: document.getElementById("dockBatterSeasonLine"),
  dockBatterNumber: document.getElementById("dockBatterNumber"),
  dockOpponentLineupBtn: document.getElementById("dockOpponentLineupBtn"),
  dockViewLineupBtn: document.getElementById("dockViewLineupBtn"),
  dockViewScorebookBtn: document.getElementById("dockViewScorebookBtn"),
  scoreForm: document.getElementById("scoreForm"),
  choiceButtons: [...document.querySelectorAll("[data-choice-group]")],
  gameForm: document.getElementById("gameForm"),
  scheduleGameBtn: document.getElementById("scheduleGameBtn"),
  cancelGameCreateBtn: document.getElementById("cancelGameCreateBtn"),
  gameSetupTeamIndicator: document.getElementById("gameSetupTeamIndicator"),
  gameFilterRow: document.getElementById("gameFilterRow"),
  scheduleSeasonSelect: document.getElementById("scheduleSeasonSelect"),
  scheduleDashboard: document.getElementById("scheduleDashboard"),
  scheduleCalendarView: document.getElementById("scheduleCalendarView"),
  scheduleFeaturedBody: document.getElementById("scheduleFeaturedBody"),
  scheduleUpcomingBody: document.getElementById("scheduleUpcomingBody"),
  scheduleResultsBody: document.getElementById("scheduleResultsBody"),
  scheduleCalendarLink: document.getElementById("scheduleCalendarLink"),
  scheduleCalendarBackLink: document.getElementById("scheduleCalendarBackLink"),
  scheduleCalendarTodayBtn: document.getElementById("scheduleCalendarTodayBtn"),
  scheduleCalendarPrevBtn: document.getElementById("scheduleCalendarPrevBtn"),
  scheduleCalendarNextBtn: document.getElementById("scheduleCalendarNextBtn"),
  scheduleCalendarMonthSelect: document.getElementById("scheduleCalendarMonthSelect"),
  scheduleCalendarGrid: document.getElementById("scheduleCalendarGrid"),
  scheduleCalendarWeekdays: document.getElementById("scheduleCalendarWeekdays"),
  scheduleCalendarFooter: document.getElementById("scheduleCalendarFooter"),
  scheduleResultsArchiveLink: document.getElementById("scheduleResultsArchiveLink"),
  gamesGrid: document.getElementById("gamesGrid"),
  gamesArchiveNote: document.getElementById("gamesArchiveNote"),
  scorebookGameSelect: document.getElementById("scorebookGameSelect"),
  scorebookGameMeta: document.getElementById("scorebookGameMeta"),
  scorebookHead: document.getElementById("scorebookHead"),
  scorebookBody: document.getElementById("scorebookBody"),
  opponentScorebookHead: document.getElementById("opponentScorebookHead"),
  opponentScorebookBody: document.getElementById("opponentScorebookBody"),
  lineupBuilderPanel: document.getElementById("lineupBuilderPanel"),
  lineupBuilderContext: document.getElementById("lineupBuilderContext"),
  lineupBuilderTitle: document.getElementById("lineupBuilderTitle"),
  lineupBuilderRows: document.getElementById("lineupBuilderRows"),
  lineupBenchList: document.getElementById("lineupBenchList"),
  lineupReadyCheck: document.getElementById("lineupReadyCheck"),
  lineupPitcherSelect: document.getElementById("lineupPitcherSelect"),
  lineupPitcherStats: document.getElementById("lineupPitcherStats"),
  useLastLineupBtn: document.getElementById("useLastLineupBtn"),
  lineupTemplatesBtn: document.getElementById("lineupTemplatesBtn"),
  addOpponentLineupBtn: document.getElementById("addOpponentLineupBtn"),
  opponentLineupPanel: document.getElementById("opponentLineupPanel"),
  opponentLineupContext: document.getElementById("opponentLineupContext"),
  opponentLineupRows: document.getElementById("opponentLineupRows"),
  addOpponentHitterBtn: document.getElementById("addOpponentHitterBtn"),
  importOpponentRosterBtn: document.getElementById("importOpponentRosterBtn"),
  opponentRosterImportPanel: document.getElementById("opponentRosterImportPanel"),
  opponentRosterImportStatus: document.getElementById("opponentRosterImportStatus"),
  opponentRosterSearch: document.getElementById("opponentRosterSearch"),
  opponentRosterList: document.getElementById("opponentRosterList"),
  backToLineupBuilderBtn: document.getElementById("backToLineupBuilderBtn"),
  startFromOpponentLineupBtn: document.getElementById("startFromOpponentLineupBtn"),
  cancelLineupBuilderBtn: document.getElementById("cancelLineupBuilderBtn"),
  confirmLineupBtn: document.getElementById("confirmLineupBtn"),
  addLineupSpotBtn: document.getElementById("addLineupSpotBtn"),
  resetGameLineupBtn: document.getElementById("resetGameLineupBtn"),
  closeLineupBuilderBtn: document.getElementById("closeLineupBuilderBtn"),
  opponentInput: document.getElementById("opponentInput"),
  gameLionsSideInput: document.getElementById("gameLionsSideInput"),
  gameDateInput: document.getElementById("gameDateInput"),
  gameTimeInput: document.getElementById("gameTimeInput"),
  gameLocationInput: document.getElementById("gameLocationInput"),
  gameNotesInput: document.getElementById("gameNotesInput"),
  batterSelect: document.getElementById("batterSelect"),
  resultSelect: document.getElementById("resultSelect"),
  runsInput: document.getElementById("runsInput"),
  rbiInput: document.getElementById("rbiInput"),
  contactSelect: document.getElementById("contactSelect"),
  launchSelect: document.getElementById("launchSelect"),
  errorFielderSelect: document.getElementById("errorFielderSelect"),
  autoScorePreview: document.getElementById("autoScorePreview"),
  noteInput: document.getElementById("noteInput"),
  newGameBtn: document.getElementById("newGameBtn"),
  undoBtn: document.getElementById("undoBtn"),
  viewCurrentScorebookBtn: document.getElementById("viewCurrentScorebookBtn"),
  syncGameBtn: document.getElementById("syncGameBtn"),
  syncStatusRow: document.getElementById("syncStatusRow"),
  syncStatusText: document.getElementById("syncStatusText"),
  endHalfBtn: document.getElementById("endHalfBtn"),
  finishGameBtn: document.getElementById("finishGameBtn"),
  lineupFocusModal: document.getElementById("lineupFocusModal"),
  lineupFocusEyebrow: document.getElementById("lineupFocusEyebrow"),
  lineupFocusTitle: document.getElementById("lineupFocusTitle"),
  lineupFocusBody: document.getElementById("lineupFocusBody"),
  lineupFocusHint: document.getElementById("lineupFocusHint"),
  closeLineupFocusBtn: document.getElementById("closeLineupFocusBtn"),
  gameActionsModal: document.getElementById("gameActionsModal"),
  gameActionsSyncBtn: document.getElementById("gameActionsSyncBtn"),
  gameActionsEndHalfBtn: document.getElementById("gameActionsEndHalfBtn"),
  gameActionsCompleteBtn: document.getElementById("gameActionsCompleteBtn"),
  gameActionsPostponeBtn: document.getElementById("gameActionsPostponeBtn"),
  gameActionsRestartBtn: document.getElementById("gameActionsRestartBtn"),
  gameActionsStatusText: document.getElementById("gameActionsStatusText"),
  closeGameActionsBtn: document.getElementById("closeGameActionsBtn"),
  pitcherSelectModal: document.getElementById("pitcherSelectModal"),
  pitcherSelectList: document.getElementById("pitcherSelectList"),
  pitcherSelectHint: document.getElementById("pitcherSelectHint"),
  closePitcherSelectBtn: document.getElementById("closePitcherSelectBtn"),
  liveLineup: document.getElementById("liveLineup"),
  lineupCount: document.getElementById("lineupCount"),
  playFeed: document.getElementById("playFeed"),
  playCount: document.getElementById("playCount"),
  scoreOpponentLineupInput: document.getElementById("scoreOpponentLineupInput"),
  subPanel: document.getElementById("subPanel"),
  subSpotSelect: document.getElementById("subSpotSelect"),
  subPlayerSelect: document.getElementById("subPlayerSelect"),
  subTypeSelect: document.getElementById("subTypeSelect"),
  subPositionSelect: document.getElementById("subPositionSelect"),
  subMoveHint: document.getElementById("subMoveHint"),
  applySubBtn: document.getElementById("applySubBtn"),
  opponentSubPanel: document.getElementById("opponentSubPanel"),
  opponentMoveTypeSelect: document.getElementById("opponentMoveTypeSelect"),
  opponentMoveSpotSelect: document.getElementById("opponentMoveSpotSelect"),
  opponentMoveNumberInput: document.getElementById("opponentMoveNumberInput"),
  opponentMoveNameInput: document.getElementById("opponentMoveNameInput"),
  opponentMoveHint: document.getElementById("opponentMoveHint"),
  applyOpponentMoveBtn: document.getElementById("applyOpponentMoveBtn"),
  optimizeBtn: document.getElementById("optimizeBtn"),
  optimizedLineup: document.getElementById("optimizedLineup"),
  optimizerMode: document.getElementById("optimizerMode"),
  applyOptimizedBtn: document.getElementById("applyOptimizedBtn"),
  addPlayerBtn: document.getElementById("addPlayerBtn"),
  playerForm: document.getElementById("playerForm"),
  rosterPlayerDetails: document.getElementById("rosterPlayerDetails"),
  playerName: document.getElementById("playerName"),
  playerNumber: document.getElementById("playerNumber"),
  playerPositions: document.getElementById("playerPositions"),
  playerPrimaryPosition: document.getElementById("playerPrimaryPosition"),
  playerBats: document.getElementById("playerBats"),
  playerThrows: document.getElementById("playerThrows"),
  playerHeight: document.getElementById("playerHeight"),
  playerWeight: document.getElementById("playerWeight"),
  savePlayerBtn: document.getElementById("savePlayerBtn"),
  cancelPlayerEditBtn: document.getElementById("cancelPlayerEditBtn"),
  rosterSearchInput: document.getElementById("rosterSearchInput"),
  rosterFilter: document.getElementById("rosterFilter"),
  rosterFilterSummary: document.getElementById("rosterFilterSummary"),
  rosterSortSelect: document.getElementById("rosterSortSelect"),
  rosterCardsViewBtn: document.getElementById("rosterCardsViewBtn"),
  rosterListViewBtn: document.getElementById("rosterListViewBtn"),
  rosterGrid: document.getElementById("rosterGrid"),
  rosterListShell: document.getElementById("rosterListShell"),
  rosterListMeta: document.getElementById("rosterListMeta"),
  rosterListBody: document.getElementById("rosterListBody"),
  archiveSeasonSelect: document.getElementById("archiveSeasonSelect"),
  archiveGrid: document.getElementById("archiveGrid"),
  gameSummaryPanel: document.getElementById("gameSummaryPanel"),
  gameSummaryTitle: document.getElementById("gameSummaryTitle"),
  gameSummaryMeta: document.getElementById("gameSummaryMeta"),
  gameSummaryBody: document.getElementById("gameSummaryBody"),
  closeGameSummaryBtn: document.getElementById("closeGameSummaryBtn"),
  lionsWinOverlay: document.getElementById("lionsWinOverlay"),
  lionsWinText: document.getElementById("lionsWinText"),
  lionsWinDetail: document.getElementById("lionsWinDetail"),
  lionsWinLogo: document.getElementById("lionsWinLogo"),
  lionsWinSparks: document.getElementById("lionsWinSparks"),
  halfInningOverlay: document.getElementById("halfInningOverlay"),
  halfInningFlash: document.getElementById("halfInningFlash"),
  halfInningLineTop: document.getElementById("halfInningLineTop"),
  halfInningLineBottom: document.getElementById("halfInningLineBottom"),
  halfInningTitle: document.getElementById("halfInningTitle"),
  halfInningSubtitle: document.getElementById("halfInningSubtitle"),
  metricsGrid: document.getElementById("metricsGrid"),
  gameBreakdown: document.getElementById("gameBreakdown"),
  boxScoreTitle: document.getElementById("boxScoreTitle"),
  boxScoreMobileTitle: document.getElementById("boxScoreMobileTitle"),
  boxScoreMobileMetaPrimary: document.getElementById("boxScoreMobileMetaPrimary"),
  boxScoreMobileMetaSecondary: document.getElementById("boxScoreMobileMetaSecondary"),
  boxScoreGameSelect: document.getElementById("boxScoreGameSelect"),
  boxScoreMobileGameSelect: document.getElementById("boxScoreMobileGameSelect"),
  boxScorePrevGameBtn: document.getElementById("boxScorePrevGameBtn"),
  boxScoreNextGameBtn: document.getElementById("boxScoreNextGameBtn"),
  boxScoreMobilePrevGameBtn: document.getElementById("boxScoreMobilePrevGameBtn"),
  boxScoreMobileNextGameBtn: document.getElementById("boxScoreMobileNextGameBtn"),
  boxScoreEditBtn: document.getElementById("boxScoreEditBtn"),
  boxScoreMobileEditBtn: document.getElementById("boxScoreMobileEditBtn"),
  boxScoreBackBtn: document.getElementById("boxScoreBackBtn"),
  boxScoreMobileBackBtn: document.getElementById("boxScoreMobileBackBtn"),
  boxScoreMobileReturnBtn: document.getElementById("boxScoreMobileReturnBtn"),
  boxScoreMobileShareBtn: document.getElementById("boxScoreMobileShareBtn"),
  boxScoreMobileStatsBtn: document.getElementById("boxScoreMobileStatsBtn"),
  boxScoreMeta: document.getElementById("boxScoreMeta"),
  boxScoreSummary: document.getElementById("boxScoreSummary"),
  boxScoreStars: document.getElementById("boxScoreStars"),
  boxScoreLineHead: document.getElementById("boxScoreLineHead"),
  boxScoreLineBody: document.getElementById("boxScoreLineBody"),
  boxScoreTeamTabs: document.getElementById("boxScoreTeamTabs"),
  boxScoreBattingTitle: document.getElementById("boxScoreBattingTitle"),
  boxScoreBattingHead: document.getElementById("boxScoreBattingHead"),
  boxScoreBattingBody: document.getElementById("boxScoreBattingBody"),
  boxScoreBattingFoot: document.getElementById("boxScoreBattingFoot"),
  boxScorePitchingTitle: document.getElementById("boxScorePitchingTitle"),
  boxScorePitchingBody: document.getElementById("boxScorePitchingBody"),
  valueBoard: document.getElementById("valueBoard"),
  statsView: document.getElementById("statsView"),
  statsSeasonSelect: document.getElementById("statsSeasonSelect"),
  statsPageHead: document.querySelector("#statsView .stats-page-head"),
  statsFocusBanner: document.getElementById("statsFocusBanner"),
  statsFocusLabel: document.getElementById("statsFocusLabel"),
  clearStatsFocusBtn: document.getElementById("clearStatsFocusBtn"),
  statsDashboardEmpty: document.getElementById("statsDashboardEmpty"),
  statsDashboardGrid: document.getElementById("statsDashboardGrid"),
  statsPlayerSpotlight: document.getElementById("statsPlayerSpotlight"),
  statsOffensiveProfile: document.getElementById("statsOffensiveProfile"),
  statsPitchingProfile: document.getElementById("statsPitchingProfile"),
  statsSnapshotCard: document.querySelector("#statsView .stats-snapshot-card"),
  statsSnapshotGrid: document.getElementById("statsSnapshotGrid"),
  statsModeTabs: document.getElementById("statsModeTabs"),
  statsLeadersShell: document.querySelector("#statsView .stats-leaders-shell"),
  statsLeadersSectionTitle: document.getElementById("statsLeadersSectionTitle"),
  statsHotBats: document.getElementById("statsHotBats"),
  statsHotBatsGrid: document.getElementById("statsHotBatsGrid"),
  statsSprayShell: document.querySelector("#statsView .stats-spray-shell"),
  statsSpraySummary: document.getElementById("statsSpraySummary"),
  statsSprayPreviewMarkers: document.getElementById("statsSprayPreviewMarkers"),
  statsTendenciesPanel: document.getElementById("statsTendenciesPanel"),
  statsHittingSection: document.getElementById("statsHittingSection"),
  statsPitchingSection: document.getElementById("statsPitchingSection"),
  statsHittingMeta: document.getElementById("statsHittingMeta"),
  statsPitchingMeta: document.getElementById("statsPitchingMeta"),
  statsHittingExportBtn: document.getElementById("statsHittingExportBtn"),
  statsPitchingExportBtn: document.getElementById("statsPitchingExportBtn"),
  desktopHitPlayerSelect: document.getElementById("desktopHitPlayerSelect"),
  desktopPitPlayerSelect: document.getElementById("desktopPitPlayerSelect"),
  leadersGrid: document.getElementById("leadersGrid"),
  hittingStatsBody: document.getElementById("hittingStatsBody"),
  pitchingStatsBody: document.getElementById("pitchingStatsBody"),
  mobileHitPlayerSelect: document.getElementById("mobileHitPlayerSelect"),
  mobileHitGameSelect: document.getElementById("mobileHitGameSelect"),
  mobileHittingStatsList: document.getElementById("mobileHittingStatsList"),
  mobilePitPlayerSelect: document.getElementById("mobilePitPlayerSelect"),
  mobilePitGameSelect: document.getElementById("mobilePitGameSelect"),
  mobilePitchingStatsList: document.getElementById("mobilePitchingStatsList"),
  bulkStatEditBtn: document.getElementById("bulkStatEditBtn"),
  recordSummary: document.getElementById("recordSummary"),
  gameEditPanel: document.getElementById("gameEditPanel"),
  gameEditTitle: document.getElementById("gameEditTitle"),
  editTeamIndicator: document.getElementById("editTeamIndicator"),
  editOpponentInput: document.getElementById("editOpponentInput"),
  editLionsSideInput: document.getElementById("editLionsSideInput"),
  editDateInput: document.getElementById("editDateInput"),
  editTimeInput: document.getElementById("editTimeInput"),
  editLocationInput: document.getElementById("editLocationInput"),
  editNotesInput: document.getElementById("editNotesInput"),
  saveGameEditBtn: document.getElementById("saveGameEditBtn"),
  closeGameEditBtn: document.getElementById("closeGameEditBtn"),
  toggleStatsSprayBtn: document.getElementById("toggleStatsSprayBtn"),
  statsSprayModal: document.getElementById("statsSprayModal"),
  closeStatsSprayBtn: document.getElementById("closeStatsSprayBtn"),
  statsSprayPanel: document.getElementById("statsSprayPanel"),
  statsSprayPlayerSelect: document.getElementById("statsSprayPlayerSelect"),
  statsSprayGameSelect: document.getElementById("statsSprayGameSelect"),
  statsSprayMarkers: document.getElementById("statsSprayMarkers"),
  bulkStatEditModal: document.getElementById("bulkStatEditModal"),
  bulkStatEditGameSelect: document.getElementById("bulkStatEditGameSelect"),
  bulkStatEditModeTabs: document.getElementById("bulkStatEditModeTabs"),
  bulkStatEditMeta: document.getElementById("bulkStatEditMeta"),
  bulkStatEditBody: document.getElementById("bulkStatEditBody"),
  bulkStatEditForm: document.getElementById("bulkStatEditForm"),
  bulkStatEditCloseBtn: document.getElementById("bulkStatEditCloseBtn"),
  bulkStatEditCancelBtn: document.getElementById("bulkStatEditCancelBtn"),
  statEditGameSelectModal: document.getElementById("statEditGameSelectModal"),
  statEditGameSelectTitle: document.getElementById("statEditGameSelectTitle"),
  statEditGameSelectHint: document.getElementById("statEditGameSelectHint"),
  statEditGameSelectList: document.getElementById("statEditGameSelectList"),
  closeStatEditGameSelectBtn: document.getElementById("closeStatEditGameSelectBtn"),
  statEditGameModal: document.getElementById("statEditGameModal"),
  statEditGameTitle: document.getElementById("statEditGameTitle"),
  statEditGameMeta: document.getElementById("statEditGameMeta"),
  statEditGameForm: document.getElementById("statEditGameForm"),
  closeStatEditGameBtn: document.getElementById("closeStatEditGameBtn"),
  cancelStatEditGameBtn: document.getElementById("cancelStatEditGameBtn"),
  clearStatEditGameBtn: document.getElementById("clearStatEditGameBtn"),
  statEditPosition: document.getElementById("statEditPosition"),
  statEditSprayChart: document.getElementById("statEditSprayChart"),
  statEditSprayMarkers: document.getElementById("statEditSprayMarkers"),
  statEditSprayList: document.getElementById("statEditSprayList"),
  statEditSprayModeButtons: [...document.querySelectorAll("[data-stat-edit-spray-mode]")],
  publicHighlightFeatured: document.getElementById("publicHighlightFeatured"),
  highlightFilterChips: document.getElementById("highlightFilterChips"),
  highlightSearchInput: document.getElementById("highlightSearchInput"),
  publicHighlightsGrid: document.getElementById("publicHighlightsGrid"),
  publicHighlightsStatus: document.getElementById("publicHighlightsStatus"),
  highlightsAdminTools: document.getElementById("highlightsAdminTools"),
  highlightsGameSelect: document.getElementById("highlightsGameSelect"),
  highlightUrlInput: document.getElementById("highlightUrlInput"),
  highlightTitleInput: document.getElementById("highlightTitleInput"),
  highlightDescriptionInput: document.getElementById("highlightDescriptionInput"),
  highlightTagInputs: document.querySelectorAll("[data-highlight-tag-input]"),
  highlightInningInput: document.getElementById("highlightInningInput"),
  highlightPlayTypeInput: document.getElementById("highlightPlayTypeInput"),
  highlightPlayersSelect: document.getElementById("highlightPlayersSelect"),
  highlightForm: document.getElementById("highlightForm"),
  highlightFormTitle: document.getElementById("highlightFormTitle"),
  highlightSaveBtn: document.getElementById("highlightSaveBtn"),
  highlightResetBtn: document.getElementById("highlightResetBtn"),
  highlightsList: document.getElementById("highlightsList"),
  highlightsStatus: document.getElementById("highlightsStatus"),
  gameHighlightsModal: document.getElementById("gameHighlightsModal"),
  gameHighlightsTitle: document.getElementById("gameHighlightsTitle"),
  gameHighlightsMeta: document.getElementById("gameHighlightsMeta"),
  gameHighlightsBody: document.getElementById("gameHighlightsBody"),
  closeGameHighlightsBtn: document.getElementById("closeGameHighlightsBtn"),
  newsCategoryFilters: document.getElementById("newsCategoryFilters"),
  newsFeaturedStory: document.getElementById("newsFeaturedStory"),
  newsArticleList: document.getElementById("newsArticleList"),
  newsArticleCount: document.getElementById("newsArticleCount"),
  newsEditorForm: document.getElementById("newsEditorForm"),
  newsEditorTitle: document.getElementById("newsEditorTitle"),
  newsEditorResetBtn: document.getElementById("newsEditorResetBtn"),
  newsEditorGameSelect: document.getElementById("newsEditorGameSelect"),
  newsGenerateFromGameBtn: document.getElementById("newsGenerateFromGameBtn"),
  newsEditorCategory: document.getElementById("newsEditorCategory"),
  newsEditorTitleInput: document.getElementById("newsEditorTitleInput"),
  newsEditorSummaryInput: document.getElementById("newsEditorSummaryInput"),
  newsEditorImageInput: document.getElementById("newsEditorImageInput"),
  newsEditorImagePreview: document.getElementById("newsEditorImagePreview"),
  newsEditorBodyInput: document.getElementById("newsEditorBodyInput"),
  newsEditorSaveBtn: document.getElementById("newsEditorSaveBtn"),
  newsEditorList: document.getElementById("newsEditorList"),
  newsEditorStatus: document.getElementById("newsEditorStatus"),
  pitchingStatEditGameSelectModal: document.getElementById("pitchingStatEditGameSelectModal"),
  pitchingStatEditGameSelectTitle: document.getElementById("pitchingStatEditGameSelectTitle"),
  pitchingStatEditGameSelectHint: document.getElementById("pitchingStatEditGameSelectHint"),
  pitchingStatEditGameSelectList: document.getElementById("pitchingStatEditGameSelectList"),
  closePitchingStatEditGameSelectBtn: document.getElementById("closePitchingStatEditGameSelectBtn"),
  pitchingStatEditGameModal: document.getElementById("pitchingStatEditGameModal"),
  pitchingStatEditGameTitle: document.getElementById("pitchingStatEditGameTitle"),
  pitchingStatEditGameMeta: document.getElementById("pitchingStatEditGameMeta"),
  pitchingStatEditGameForm: document.getElementById("pitchingStatEditGameForm"),
  closePitchingStatEditGameBtn: document.getElementById("closePitchingStatEditGameBtn"),
  cancelPitchingStatEditGameBtn: document.getElementById("cancelPitchingStatEditGameBtn"),
  quickScoreModal: document.getElementById("quickScoreModal"),
  quickScoreTitle: document.getElementById("quickScoreTitle"),
  quickScoreMeta: document.getElementById("quickScoreMeta"),
  quickScoreForm: document.getElementById("quickScoreForm"),
  quickScoreLionsLabel: document.getElementById("quickScoreLionsLabel"),
  quickScoreOpponentLabel: document.getElementById("quickScoreOpponentLabel"),
  quickScoreLionsInput: document.getElementById("quickScoreLionsInput"),
  quickScoreOpponentInput: document.getElementById("quickScoreOpponentInput"),
  quickScoreCancelBtn: document.getElementById("quickScoreCancelBtn"),
  quickScoreCloseBtn: document.getElementById("quickScoreCloseBtn"),
  boxScoreEditModal: document.getElementById("boxScoreEditModal"),
  boxScoreEditTitle: document.getElementById("boxScoreEditTitle"),
  boxScoreEditMeta: document.getElementById("boxScoreEditMeta"),
  boxScoreEditForm: document.getElementById("boxScoreEditForm"),
  boxScoreEditFields: document.getElementById("boxScoreEditFields"),
  boxScoreEditCancelBtn: document.getElementById("boxScoreEditCancelBtn"),
  boxScoreEditCloseBtn: document.getElementById("boxScoreEditCloseBtn"),
  statEditInputs: {
    ab: document.getElementById("statEditAb"),
    h: document.getElementById("statEditH"),
    rispAB: document.getElementById("statEditRispAB"),
    rispH: document.getElementById("statEditRispH"),
    singles: document.getElementById("statEditSingles"),
    doubles: document.getElementById("statEditDoubles"),
    triples: document.getElementById("statEditTriples"),
    hr: document.getElementById("statEditHr"),
    bb: document.getElementById("statEditBb"),
    hbp: document.getElementById("statEditHbp"),
    k: document.getElementById("statEditK"),
    roe: document.getElementById("statEditRoe"),
    errors: document.getElementById("statEditErrors"),
    fc: document.getElementById("statEditFc"),
    sac: document.getElementById("statEditSac"),
    dp: document.getElementById("statEditDp"),
    go: document.getElementById("statEditGo"),
    lo: document.getElementById("statEditLo"),
    fo: document.getElementById("statEditFo"),
    sb: document.getElementById("statEditSb"),
    cs: document.getElementById("statEditCs"),
    po: document.getElementById("statEditPo"),
    rbi: document.getElementById("statEditRbi"),
    runs: document.getElementById("statEditRuns")
  },
  pitchingStatEditInputs: {
    ip: document.getElementById("pitchingStatEditIp"),
    pitches: document.getElementById("pitchingStatEditPitches"),
    balls: document.getElementById("pitchingStatEditBalls"),
    strikes: document.getElementById("pitchingStatEditStrikes"),
    batters: document.getElementById("pitchingStatEditBatters"),
    h: document.getElementById("pitchingStatEditH"),
    hr: document.getElementById("pitchingStatEditHr"),
    runs: document.getElementById("pitchingStatEditRuns"),
    earnedRuns: document.getElementById("pitchingStatEditEarnedRuns"),
    bb: document.getElementById("pitchingStatEditBb"),
    hbp: document.getElementById("pitchingStatEditHbp"),
    k: document.getElementById("pitchingStatEditK"),
    sv: document.getElementById("pitchingStatEditSv"),
    decision: document.getElementById("pitchingStatEditDecision")
  },
  scoutingTeamSelect: document.getElementById("scoutingTeamSelect"),
  refreshScoutingBtn: document.getElementById("refreshScoutingBtn"),
  scoutingSourceStatus: document.getElementById("scoutingSourceStatus"),
  scoutingReport: document.getElementById("scoutingReport"),
  playerTemplate: document.getElementById("playerCardTemplate")
};

function knownOpponentOptions() {
  return Array.isArray(window.MatchupImages?.knownOpponents) && window.MatchupImages.knownOpponents.length
    ? window.MatchupImages.knownOpponents
    : ["Eagles", "Ducks", "Devils", "Turtles", "D2", "Bandidos"];
}

function populateOpponentSelect() {
  if (!els.opponentInput) return;
  const currentValue = els.opponentInput.value || "";
  els.opponentInput.innerHTML = [
    '<option value="">Select opponent</option>',
    ...knownOpponentOptions().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
  if ([...els.opponentInput.options].some((option) => option.value === currentValue)) {
    els.opponentInput.value = currentValue;
  }
}

initializeScorebookApp();

async function initializeScorebookApp() {
  try {
    if (storage.ready) await storage.ready;
  } catch (error) {
    console.warn("Unable to finish IndexedDB startup before app boot; continuing with available local state.", error);
  }
  state = loadState();
  const initialRouteView = routeViewFromLocation();
  nabaRosterCache = normalizeNabaRosterCache(window.ScorebookNabaRostersCache);
  populateFieldLocationSelects();
  populateOpponentSelect();
  configureGameDateInputs();
  bindEvents();
  initializeScoutingReport();
  restoreActiveGamePendingScoringState();
  render();
  switchView(initialRouteView, { replaceRoute: true });
  initializeSiteVisitTracking();
  bootstrapSupabaseState();
  initializeSupabaseAuth();
}

function makePlayer(id, name, number, positions, bats = "R", grades = defaultPlayerGrades(), details = {}) {
  const normalizedPositions = normalizePositions(positions);
  const primaryPosition = String(details.primaryPosition || normalizedPositions[0] || "UTL").trim().toUpperCase();
  return {
    id,
    name,
    number: String(number).trim(),
    positions: normalizedPositions,
    primaryPosition,
    bats,
    throws: String(details.throws || bats || "R").trim().toUpperCase(),
    height: String(details.height || "").trim(),
    weight: normalizeWeight(details.weight || ""),
    active: true,
    grades: { ...defaultPlayerGrades(), ...(grades || {}) }
  };
}

function defaultPlayerGrades() {
  return { contact: 50, power: 50, speed: 50, defense: 50 };
}

function normalizePositions(positions) {
  if (Array.isArray(positions)) {
    return positions
      .map((position) => String(position).trim().toUpperCase())
      .map((position) => (position === "UTIL" ? "UTL" : position))
      .filter(Boolean);
  }
  return String(positions || "UTL")
    .split(/[|,]/)
    .map((position) => position.trim().toUpperCase())
    .map((position) => (position === "UTIL" ? "UTL" : position))
    .filter(Boolean);
}

function normalizeWeight(weight) {
  const raw = String(weight || "").trim();
  if (!raw) return "";
  return /\d$/.test(raw) ? `${raw} lbs` : raw;
}

function formatPositions(positions) {
  const normalized = normalizePositions(positions);
  return normalized.length ? normalized.join(", ") : "UTL";
}

function normalizeGameStatPosition(position = "") {
  const normalized = String(position || "")
    .trim()
    .toUpperCase()
    .replace(/^UTIL$/, "UTL");
  return gameStatPositions.includes(normalized) ? normalized : "";
}

function playerPrimaryPosition(player) {
  return String(player?.primaryPosition || normalizePositions(player?.positions)[0] || "UTL").trim().toUpperCase();
}

function formatRosterBatsThrows(player) {
  const bats = String(player?.bats || "R").trim().toUpperCase();
  const throws = String(player?.throws || bats || "R").trim().toUpperCase();
  return `${bats} / ${throws}`;
}

function formatRosterHeightWeight(player) {
  const height = String(player?.height || "").trim() || "--";
  const weight = normalizeWeight(player?.weight || "") || "--";
  return `${height} / ${weight}`;
}

function rosterDisplayNameParts(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return ["Player", ""];
  if (parts.length === 1) return [parts[0], ""];
  return [parts[0], parts.slice(1).join(" ")];
}

function rosterSilhouetteAsset(player) {
  if (playerPrimaryPosition(player) === "P") return ROSTER_SILHOUETTE_ASSETS.P;
  const bats = String(player?.bats || "R").trim().toUpperCase();
  return ROSTER_SILHOUETTE_ASSETS[bats] || ROSTER_SILHOUETTE_ASSETS.R;
}

function playerHasPosition(player, position) {
  return normalizePositions(player?.positions).includes(position);
}

function parseRosterCsv(csvText) {
  return String(csvText || "")
    .trim()
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [number, lastName, firstName, positions] = row.split(",");
      const cleanNumber = String(number || "").trim();
      const cleanLast = String(lastName || "").trim();
      const cleanFirst = String(firstName || "").trim();
      const playerId = `player-${cleanNumber}`;
      return makePlayer(playerId, `${cleanFirst} ${cleanLast}`.trim(), cleanNumber, String(positions || "UTL").trim(), "R", defaultPlayerGrades());
    });
}

function todayValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function createId(prefix = "id") {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uuid() {
  return createId();
}

function deepClone(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function makeAtBat() {
  return {
    balls: 0,
    strikes: 0,
    pitches: [],
    pendingInPlay: false
  };
}

function cloneAtBat(atBat) {
  return {
    balls: atBat.balls || 0,
    strikes: atBat.strikes || 0,
    pitches: [...(atBat.pitches || [])],
    pendingInPlay: Boolean(atBat.pendingInPlay)
  };
}

function makeLineupEntries(playerIds = []) {
  return playerIds.map((playerId, index) => ({
    id: uuid(),
    playerId,
    role: defaultRoleForSpot(index),
    active: true,
    note: ""
  }));
}

function defaultRoleForSpot(index) {
  return ["C", "P", "1B", "2B", "3B", "SS", "LF", "CF", "RF"][index] || "EH";
}

function defaultBuilderRoleForSpot(index) {
  return "";
}

function blankStartingLineupEntries() {
  return Array.from({ length: 9 }, (_, index) => ({
    id: uuid(),
    playerId: "",
    role: defaultBuilderRoleForSpot(index),
    order: index + 1,
    active: true,
    note: ""
  }));
}

function lineupEntriesFromRoster(playerIds = []) {
  return makeLineupEntries(playerIds).map((entry, index) => ({
    ...entry,
    order: index + 1
  }));
}

function opponentLineupEntries(names = []) {
  return names.map((entry, index) => normalizeOpponentLineupEntry(entry, index));
}

function parseOpponentLine(value, index = 0) {
  const text = String(value || "").trim();
  const match = text.match(/^#?\s*([0-9]{1,3})\s+(.+)$/);
  return {
    id: createId("opp"),
    name: match ? match[2].trim() : text,
    number: match ? match[1].trim() : "",
    order: index + 1,
    active: true
  };
}

function normalizeOpponentLineupEntry(entry, index = 0, options = {}) {
  const preserveBlank = options.preserveBlank === true;
  if (entry && typeof entry === "object") {
    const name = String(entry.name || entry.label || entry.playerName || "").trim();
    const number = String(entry.number || entry.jerseyNumber || "").trim();
    return {
      id: entry.id || createId("opp"),
      name: name || (preserveBlank ? "" : `Batter ${index + 1}`),
      number,
      order: entry.order || index + 1,
      active: entry.active !== false
    };
  }
  const parsed = parseOpponentLine(entry, index);
  return {
    ...parsed,
    name: parsed.name || (preserveBlank ? "" : `Batter ${index + 1}`)
  };
}

function opponentLineupSnapshot(entries = [], options = {}) {
  return entries.map((entry, index) => {
    const normalized = normalizeOpponentLineupEntry(entry, index, options);
    return {
      name: normalized.name,
      number: normalized.number
    };
  });
}

function opponentBatterLabel(entry, fallbackIndex = 0) {
  const normalized = normalizeOpponentLineupEntry(entry, fallbackIndex);
  return `${normalized.number ? `#${normalized.number} ` : ""}${normalized.name || `Batter ${fallbackIndex + 1}`}`.trim();
}

function isOpponentLineupPlaceholderName(name = "") {
  return /^batter\s+\d+$/i.test(String(name || "").trim());
}

function pregameOpponentEntryHasData(entry, index = 0) {
  if (!entry) return false;
  const normalized = normalizeOpponentLineupEntry(entry, index, { preserveBlank: true });
  return Boolean(normalized.number || (normalized.name && !isOpponentLineupPlaceholderName(normalized.name)));
}

function isPregameOpponentLineupSpotOpen(entry, index = 0) {
  return !pregameOpponentEntryHasData(entry, index);
}

function nextPregameOpponentOpenIndex(entries = [], startIndex = 0) {
  const safeStart = Math.max(0, Number(startIndex) || 0);
  for (let index = safeStart; index < entries.length; index += 1) {
    if (isPregameOpponentLineupSpotOpen(entries[index], index)) return index;
  }
  return Math.max(0, Math.min(safeStart, Math.max(entries.length - 1, 0)));
}

const NABA_ROSTER_TEAM_ALIASES = [
  { teamKey: "pittsburgh-d2", aliases: ["d2", "pittsburgh d2", "pittsburgh d 2"] },
  { teamKey: "biscuitvilletownsquare-bandidos", aliases: ["bandidos", "bakery square bandidos", "biscuitville", "biscuitville townsquare bandidos"] },
  { teamKey: "south-hills-devils", aliases: ["devils", "south hills devils"] },
  { teamKey: "south-oakland-ducks", aliases: ["ducks", "south oakland ducks"] },
  { teamKey: "south-side-eagles", aliases: ["eagles", "south side eagles"] },
  { teamKey: "bauerstown-turtles", aliases: ["turtles", "bauerstown turtles"] },
  { teamKey: "keystone-oaks", aliases: ["keystone", "keystone oaks"] },
  { teamKey: "butler-buccos", aliases: ["butler", "buccos", "butler buccos"] },
  { teamKey: "ross-raiders", aliases: ["ross", "raiders", "ross raiders"] },
  { teamKey: "oakmont-lions", aliases: ["oakmont", "lions", "oakmont lions"] }
];

function normalizeNabaRosterText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNabaRosterPlayer(player = {}, teamKey = "", index = 0) {
  const name = String(player.name || `${player.firstName || ""} ${player.lastName || ""}`).replace(/\s+/g, " ").trim();
  return {
    id: player.id || `${teamKey || "team"}-${normalizeNabaRosterText(name).replace(/\s+/g, "-") || index}`,
    firstName: String(player.firstName || "").trim(),
    lastName: String(player.lastName || "").trim(),
    name,
    number: String(player.number || "").trim(),
    positions: String(player.positions || "").trim()
  };
}

function normalizeNabaRosterCache(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.teams)) return null;
  return {
    ...payload,
    teams: payload.teams.map((team, teamIndex) => {
      const teamKey = String(team.teamKey || team.id || normalizeNabaRosterText(team.teamName).replace(/\s+/g, "-") || `team-${teamIndex}`).trim();
      return {
        ...team,
        teamKey,
        teamName: String(team.teamName || team.name || `Team ${teamIndex + 1}`).trim(),
        teamCode: String(team.teamCode || team.code || "").trim(),
        players: Array.isArray(team.players)
          ? team.players.map((player, index) => normalizeNabaRosterPlayer(player, teamKey, index)).filter((player) => player.name)
          : []
      };
    })
  };
}

async function fetchNabaRosterCache() {
  const scriptCache = normalizeNabaRosterCache(window.ScorebookNabaRostersCache);
  if (scriptCache?.teams?.length) {
    nabaRosterCache = scriptCache;
    return scriptCache;
  }
  if (nabaRosterCache?.teams?.length) return nabaRosterCache;
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(`${NABA_ROSTERS_CACHE_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    nabaRosterCache = normalizeNabaRosterCache(await response.json());
    return nabaRosterCache;
  } catch (error) {
    console.warn("Unable to load NABA roster cache.", error);
    return null;
  }
}

function nabaRosterTeamAliases(team = {}) {
  const aliases = [
    team.teamName,
    team.name,
    team.teamKey,
    team.teamCode,
    team.code,
    team.nabaKey
  ];
  const configured = NABA_ROSTER_TEAM_ALIASES.find((entry) => entry.teamKey === team.teamKey);
  if (configured) aliases.push(...configured.aliases);
  return aliases.map(normalizeNabaRosterText).filter(Boolean);
}

function findNabaRosterTeamForOpponent(opponentName = "") {
  const normalizedOpponent = normalizeNabaRosterText(opponentName);
  const teams = nabaRosterCache?.teams || [];
  if (!normalizedOpponent || !teams.length) return null;
  return teams.find((team) => {
    const aliases = nabaRosterTeamAliases(team);
    return aliases.some((alias) => normalizedOpponent === alias || normalizedOpponent.includes(alias) || alias.includes(normalizedOpponent));
  }) || null;
}

function opponentRosterPlayerKey(player = {}) {
  return `${normalizeNabaRosterText(player.name)}|${String(player.number || "").trim()}`;
}

function lineupHasRosterPlayer(entries = [], player = {}) {
  const targetKey = opponentRosterPlayerKey(player);
  return entries.some((entry) => {
    if (!pregameOpponentEntryHasData(entry)) return false;
    return opponentRosterPlayerKey(entry) === targetKey;
  });
}

function rosterPlayerPositionLabel(player = {}) {
  return String(player.positions || "").replace(/[|]/g, ", ").replace(/\u00c2\u00b7|\u00b7/g, ", ").replace(/\s*,\s*/g, ", ").replace(/^,|,$/g, "").trim() || "Roster";
}

function formatRosterCacheUpdatedLabel(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function openOpponentRosterImport() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  savePregameOpponentLineup();
  if (els.opponentRosterImportPanel) els.opponentRosterImportPanel.hidden = false;
  opponentRosterStatusMessage = "Loading NABA roster cache...";
  renderOpponentRosterImport(game);
  fetchNabaRosterCache().then(() => {
    opponentRosterStatusMessage = "";
    renderOpponentRosterImport(game);
  });
}

function renderOpponentRosterImport(game = state.games.find((item) => item.id === lineupBuilderGameId)) {
  if (!els.opponentRosterImportPanel || els.opponentRosterImportPanel.hidden || !game) return;
  const team = findNabaRosterTeamForOpponent(game.opponent || "");
  const entries = pregameOpponentLineupEntries(game);
  const query = normalizeNabaRosterText(opponentRosterSearchQuery);
  const players = team?.players || [];
  const filteredPlayers = query
    ? players.filter((player) => normalizeNabaRosterText(`${player.name} ${player.number} ${player.positions}`).includes(query))
    : players;

  if (els.opponentRosterImportStatus) {
    const baseStatus = opponentRosterStatusMessage
      || (team
        ? `${team.teamName} roster | ${players.length} players${nabaRosterCache?.syncedAt ? ` | Updated ${formatRosterCacheUpdatedLabel(nabaRosterCache.syncedAt)}` : ""}`
        : `No cached roster match for ${game.opponent || "this opponent"}. You can still type the lineup manually.`);
    els.opponentRosterImportStatus.textContent = baseStatus;
  }
  if (els.opponentRosterSearch) {
    els.opponentRosterSearch.value = opponentRosterSearchQuery;
    els.opponentRosterSearch.disabled = !team || !players.length;
  }
  if (!els.opponentRosterList) return;
  if (!team || !players.length) {
    els.opponentRosterList.innerHTML = `<div class="opponent-roster-empty">Roster not available in the local NABA cache yet.</div>`;
    return;
  }
  if (!filteredPlayers.length) {
    els.opponentRosterList.innerHTML = `<div class="opponent-roster-empty">No players match that search.</div>`;
    return;
  }
  els.opponentRosterList.innerHTML = filteredPlayers.map((player) => {
    const isAdded = lineupHasRosterPlayer(entries, player);
    return `<button type="button" class="opponent-roster-player${isAdded ? " is-added" : ""}" data-opponent-roster-player="${escapeHtml(player.id)}"${isAdded ? " disabled aria-disabled=\"true\"" : ""}>
      <span class="opponent-roster-number">${escapeHtml(player.number || "--")}</span>
      <span class="opponent-roster-name">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${escapeHtml(rosterPlayerPositionLabel(player))}</span>
      </span>
      <span class="opponent-roster-added">${isAdded ? "Added" : "Add"}</span>
    </button>`;
  }).join("");
}

function addOpponentRosterPlayerToLineup(playerId) {
  let game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const team = findNabaRosterTeamForOpponent(game.opponent || "");
  const player = team?.players?.find((item) => item.id === playerId);
  if (!player) return;
  savePregameOpponentLineup();
  game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const entries = pregameOpponentLineupEntries(game);
  if (lineupHasRosterPlayer(entries, player)) {
    renderOpponentRosterImport(game);
    return;
  }
  let targetIndex = entries.findIndex((entry, index) => isPregameOpponentLineupSpotOpen(entry, index));
  if (targetIndex === -1) {
    targetIndex = entries.length;
    entries.push({
      id: createId("opp"),
      name: "",
      number: "",
      order: targetIndex + 1,
      active: true
    });
  }
  entries[targetIndex] = {
    ...entries[targetIndex],
    name: player.name,
    number: player.number,
    order: targetIndex + 1,
    active: true
  };
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries, { preserveBlank: true });
  saveState();
  renderOpponentLineupStep({ focusIndex: nextPregameOpponentOpenIndex(entries, targetIndex + 1) });
}

function emptyBases(value = null) {
  return { first: value, second: value, third: value };
}

function normalizeLionsSide(value = "home") {
  return value === "away" ? "away" : "home";
}

function lionsSide(game) {
  if (game?.lionsSide) return normalizeLionsSide(game.lionsSide);
  if (game?.teams?.home?.id === "oakmont-lions") return "home";
  return "away";
}

function opponentSide(game) {
  return lionsSide(game) === "home" ? "away" : "home";
}

function sideForHalf(game) {
  return game?.half === "bottom" ? "home" : "away";
}

function isLionsAtBat(game) {
  return sideForHalf(game) === lionsSide(game);
}

function isOpponentAtBat(game) {
  return !isLionsAtBat(game);
}

function teamsForGame(opponent = "Opponent", nextLionsSide = "home") {
  const side = normalizeLionsSide(nextLionsSide);
  const opponentTeam = { id: "opponent", name: opponent || "Opponent" };
  const lionsTeam = { id: "oakmont-lions", name: "Oakmont Lions" };
  return side === "home"
    ? { away: opponentTeam, home: lionsTeam }
    : { away: lionsTeam, home: opponentTeam };
}

function syncGameTeams(game, nextLionsSide = lionsSide(game)) {
  if (!game) return;
  game.lionsSide = normalizeLionsSide(nextLionsSide);
  game.teams = teamsForGame(game.opponent, game.lionsSide);
  syncScoreBySide(game);
}

function syncScoreBySide(game) {
  if (!game?.score) return;
  if (lionsSide(game) === "home") {
    game.score.away = game.score.opponent ?? game.score.away ?? 0;
    game.score.home = game.score.lions ?? game.score.home ?? 0;
  } else {
    game.score.away = game.score.lions ?? game.score.away ?? 0;
    game.score.home = game.score.opponent ?? game.score.home ?? 0;
  }
}

function scoreForSide(game, side) {
  return side === lionsSide(game) ? game.score?.lions ?? 0 : game.score?.opponent ?? 0;
}

function addRunsForBattingTeam(game, runs = 0) {
  const runsAdded = Number(runs) || 0;
  if (!runsAdded) return;
  const feedback = runScoreFeedbackForBattingTeam(game, runsAdded);
  if (isLionsAtBat(game)) game.score.lions += runsAdded;
  else game.score.opponent += runsAdded;
  syncScoreBySide(game);
  triggerRunScoreFeedback(feedback);
}

function displayTeamName(name) {
  return String(name || "").replace(/^Oakmont Lions$/i, "Lions");
}

function awayTeamName(game) {
  return displayTeamName(game?.teams?.away?.name || "Lions");
}

function homeTeamName(game) {
  return displayTeamName(game?.teams?.home?.name || game?.opponent || "Opponent");
}

function gameMatchupLabel(game) {
  return `${awayTeamName(game)} @ ${homeTeamName(game)}`;
}

function gameTeamMeta(game) {
  return `Away: ${awayTeamName(game)} | Home: ${homeTeamName(game)}`;
}

function gameScoreLabel(game) {
  return `${awayTeamName(game)} ${scoreForSide(game, "away")} - ${scoreForSide(game, "home")} ${homeTeamName(game)}`;
}

function gameResultLabel(game) {
  const lions = Number(game?.score?.lions || 0);
  const opponent = Number(game?.score?.opponent || 0);
  const result = lions > opponent ? "W" : lions < opponent ? "L" : "T";
  return `${result} - ${lions} - ${opponent}`;
}

function gameResultClass(game) {
  const lions = Number(game?.score?.lions || 0);
  const opponent = Number(game?.score?.opponent || 0);
  if (lions > opponent) return "is-win";
  if (lions < opponent) return "is-loss";
  return "is-tie";
}

function setSelectValueWithLegacy(select, value = "") {
  if (!select) return;
  const cleaned = String(value || "");
  if (cleaned && ![...select.options].some((option) => option.value === cleaned)) {
    const option = new Option(cleaned, cleaned);
    option.dataset.legacy = "true";
    select.append(option);
  }
  select.value = cleaned;
}

function normalizeLocationKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function fieldLocationByName(name = "") {
  const key = normalizeLocationKey(name);
  if (!key) return null;
  return FIELD_LOCATIONS.find((field) => normalizeLocationKey(field.name) === key) || null;
}

function fieldLocationByAddress(address = "") {
  const key = normalizeLocationKey(address);
  if (!key) return null;
  return FIELD_LOCATIONS.find((field) => normalizeLocationKey(field.address) === key) || null;
}

function normalizeGameLocationInput(value = "", addressOverride = "") {
  const raw = value && typeof value === "object"
    ? { name: value.name || value.location || "", address: value.address || value.locationAddress || "" }
    : { name: String(value || ""), address: "" };
  const known = fieldLocationByName(raw.name);
  const name = known?.name || raw.name.trim();
  const address = addressOverride || raw.address || known?.address || "";
  return { name, address };
}

function selectedFieldLocation(select) {
  return normalizeGameLocationInput(select?.value || "");
}

function gameLocationName(game) {
  return normalizeGameLocationInput(game?.location || "", game?.locationAddress || "").name;
}

function gameLocationAddress(game) {
  return normalizeGameLocationInput(game?.location || "", game?.locationAddress || "").address;
}

function gameWeatherLocation(game) {
  return gameLocationAddress(game) || gameLocationName(game);
}

function fieldCoordinatesForGame(game) {
  const location = normalizeGameLocationInput(game?.location || "", game?.locationAddress || "");
  const knownField = fieldLocationByName(location.name) || fieldLocationByAddress(location.address);
  const key = normalizeLocationKey(knownField?.name || location.name);
  return FIELD_LOCATION_COORDINATES[key] || null;
}

function gameLocationLabel(game) {
  return gameLocationName(game);
}

function populateFieldLocationSelects() {
  [els.gameLocationInput, els.editLocationInput].filter(Boolean).forEach((select) => {
    const current = select.value;
    select.innerHTML = `<option value="">Select field location</option>${FIELD_LOCATIONS
      .map((field) => `<option value="${escapeHtml(field.name)}">${escapeHtml(field.name)}</option>`)
      .join("")}`;
    setSelectValueWithLegacy(select, current);
  });
}

function configureGameDateInputs() {
  [els.gameDateInput, els.editDateInput].filter(Boolean).forEach((input) => {
    input.removeAttribute("min");
  });
}

function selectedGameDate(input) {
  return input?.value || todayValue();
}

function createGame(options = {}) {
  const config = typeof options === "string" ? { opponent: options } : options;
  const opponent = config.opponent || "Wildcats";
  const gameLionsSide = normalizeLionsSide(config.lionsSide || "home");
  const awayLineup = config.awayLineup || config.lineupEntries || lineupEntriesFromRoster(defaultRoster.filter((player) => player.active).map((player) => player.id));
  const homeLineup = config.homeLineup || opponentLineupEntries(config.opponentLineup || []);
  const batterId = awayLineup[0]?.playerId || awayLineup[0]?.id || "";
  const pitcherId = config.pitcherId || batterId;
  const location = normalizeGameLocationInput(config.location || "", config.locationAddress || "");

  return {
    id: config.id || createId("game"),
    opponent,
    date: config.date || todayValue(),
    time: config.time || "",
    location: location.name,
    locationAddress: location.address,
    notes: config.notes || "",
    status: config.status || "active",
    lionsSide: gameLionsSide,
    teams: teamsForGame(opponent, gameLionsSide),
    lineups: {
      away: deepClone(awayLineup),
      home: deepClone(homeLineup)
    },
    current: {
      inning: config.inning ?? 1,
      half: config.half || "top",
      outs: config.outs ?? 0,
      balls: 0,
      strikes: 0,
      batterId,
      pitcherId,
      runners: emptyBases()
    },
    inning: config.inning ?? 1,
    half: config.half || "top",
    outs: config.outs ?? 0,
    bases: emptyBases(false),
    batterIndex: config.batterIndex ?? 0,
    lineupEntries: deepClone(awayLineup),
    opponentBatterIndex: config.opponentBatterIndex ?? 0,
    opponentLineup: opponentLineupSnapshot(homeLineup),
    pitcherId,
    score: {
      lions: config.score?.lions ?? (gameLionsSide === "away" ? config.score?.away : config.score?.home) ?? 0,
      opponent: config.score?.opponent ?? (gameLionsSide === "away" ? config.score?.home : config.score?.away) ?? 0,
      away: config.score?.away ?? 0,
      home: config.score?.home ?? 0
    },
    plateAppearances: [],
    currentPlateAppearanceId: "",
    substitutions: [],
    events: [],
    atBat: makeAtBat(),
    playHistory: []
  };
  syncScoreBySide(game);
  return game;
}

function makeGame(opponent = "Wildcats") {
  return createGame({ opponent, lionsSide: "away" });
}

function makeUniqueGame(options = {}) {
  const existingIds = new Set(state?.games?.map((game) => game.id) || []);
  let game = createGame(options);
  while (existingIds.has(game.id)) {
    game = createGame({ ...(typeof options === "string" ? { opponent: options } : options), id: createId("game") });
  }
  return game;
}

function seedState() {
  return {
    roster: defaultRoster,
    rosterVersion: ROSTER_VERSION,
    lineup: defaultRoster.filter((player) => player.active).map((player) => player.id),
    completedGameSyncQueue: [],
    deletedGameTombstones: {},
    highlights: [],
    newsArticles: [],
    games: [],
    activeGameId: ""
  };
}

function seedEvent(game, playerId, result, runs, rbi, contact, launch, leverage, note, spray = null) {
  return {
    id: uuid(),
    gameId: game.id,
    playerId,
    result,
    runs,
    rbi,
    contact,
    launch,
    leverage,
    inning: game.inning,
    half: "top",
    outsBefore: 0,
    basesBefore: { first: false, second: false, third: false },
    scope: "offense",
    note,
    spray,
    pitches: [],
    createdAt: new Date().toISOString()
  };
}

function isLegacySeedGame(game) {
  const events = Array.isArray(game?.events) ? game.events : [];
  return Boolean(
    game
    && game.opponent === "Riverside Hawks"
    && game.date === "2026-04-10"
    && gameIsFinal(game)
    && Number(game.score?.lions || 0) === 7
    && Number(game.score?.opponent || 0) === 4
    && events.length === 9
  );
}

function loadState() {
  try {
    const library = storage.loadLibrary();
    const parsed = storage.loadAppState();
    const hasAppState = Array.isArray(parsed?.roster) && Array.isArray(parsed?.lineup);
    const nextState = hasAppState
      ? parsed
      : {
          ...seedState(),
          games: []
        };
    if (library.gameOrder.length) {
      nextState.games = library.gameOrder.map((gameId) => library.gamesById[gameId]).filter(Boolean);
      nextState.activeGameId = library.activeGameId || nextState.games[0]?.id || "";
    } else if (!nextState.games?.length && !hasAppState) {
      const seeded = seedState();
      nextState.games = seeded.games;
      nextState.activeGameId = seeded.activeGameId;
      storage.saveLibrary(buildGameLibraryFromGames(nextState.games, nextState.activeGameId));
    }
    if (!nextState.roster || !nextState.games || !nextState.lineup) return seedState();
    const normalized = normalizeState(nextState);
    const activeFromLibrary = normalized.games.find((game) => game.id === library.activeGameId);
    if (activeFromLibrary && activeFromLibrary.status === "active" && !gameIsFinal(activeFromLibrary)) {
      normalized.activeGameId = activeFromLibrary.id;
    }
    if (!normalized.activeGameId && normalized.games.length) {
      normalized.activeGameId = normalized.games.find((game) => game.status === "active" && !gameIsFinal(game))?.id || "";
    }
    const active = normalized.games.find((game) => game.id === normalized.activeGameId);
    if (active && (gameIsFinal(active) || active.status !== "active")) {
      const nextOpen = normalized.games
        .filter((game) => !gameIsFinal(game) && game.status === "active")
        .sort((a, b) => (a.date || todayValue()).localeCompare(b.date || todayValue()) || (a.time || "").localeCompare(b.time || ""))[0];
      normalized.activeGameId = nextOpen?.id || "";
    }
    return normalized;
  } catch (error) {
    console.warn("Unable to load saved scorebook.", error);
    return seedState();
  }
}

function normalizeState(nextState) {
  nextState.roster = normalizeRoster(nextState.roster);
  const rosterMissing = !Array.isArray(nextState.roster) || !nextState.roster.length;
  const lineupMissing = !Array.isArray(nextState.lineup) || !nextState.lineup.length;
  const rosterWasReplaced = nextState.rosterVersion !== ROSTER_VERSION || rosterMissing || lineupMissing;
  if (rosterWasReplaced) {
    nextState.roster = deepClone(defaultRoster);
    nextState.lineup = defaultRoster.filter((player) => player.active).map((player) => player.id);
    nextState.rosterVersion = ROSTER_VERSION;
  } else {
    nextState.lineup = Array.isArray(nextState.lineup) && nextState.lineup.length
      ? nextState.lineup.filter((playerId) => nextState.roster.some((player) => player.id === playerId))
      : nextState.roster.filter((player) => player.active).map((player) => player.id);
  }
  nextState.games = nextState.games
    .map((game) => normalizeGame(game, nextState))
    .filter((game) => !isLegacySeedGame(game));
  nextState.deletedGameTombstones = normalizeDeletedGameTombstones(nextState.deletedGameTombstones, nextState.games);
  nextState.completedGameSyncQueue = normalizeCompletedGameSyncQueue(nextState.completedGameSyncQueue, nextState.games);
  nextState.highlights = normalizeHighlights(nextState.highlights, nextState.games);
  nextState.newsArticles = normalizeNewsArticles(nextState.newsArticles, nextState.games);
  if (rosterWasReplaced) {
    nextState.games.forEach((game) => resetGameAwayLineupToRoster(game, nextState));
  }
  return nextState;
}

function normalizeNewsArticle(article = {}, games = state?.games || []) {
  const title = String(article.title || "").trim();
  const summary = String(article.summary || "").trim();
  const bodyHtml = sanitizeNewsBodyHtml(article.bodyHtml || article.body_html || article.body || "");
  if (!title && !summary && !bodyHtml) return null;
  const validGameIds = new Set((Array.isArray(games) ? games : []).map((game) => game?.id).filter(Boolean));
  const requestedGameId = String(article.gameId || article.game_id || "").trim();
  const gameId = requestedGameId && (!validGameIds.size || validGameIds.has(requestedGameId)) ? requestedGameId : "";
  const linkedGame = gameId ? (Array.isArray(games) ? games : []).find((game) => game?.id === gameId) : null;
  const createdAt = article.createdAt || article.created_at || new Date().toISOString();
  return {
    id: String(article.id || createId("news")).trim(),
    title,
    summary,
    bodyHtml,
    category: normalizeNewsCategory(article.category),
    gameId,
    date: String(article.date || article.gameDate || article.game_date || linkedGame?.date || createdAt.slice(0, 10) || todayValue()).trim(),
    imageDataUrl: validNewsImageDataUrl(article.imageDataUrl || article.image_data_url || article.image || ""),
    createdAt,
    updatedAt: article.updatedAt || article.updated_at || createdAt || new Date().toISOString()
  };
}

function normalizeNewsArticles(articles = [], games = state?.games || []) {
  return (Array.isArray(articles) ? articles : [])
    .map((article) => normalizeNewsArticle(article, games))
    .filter((article) => article?.id)
    .sort(sortNewsArticlesNewestFirst);
}

function normalizeNewsCategory(category = "") {
  const value = String(category || "").trim();
  const allowed = new Set(["Game Recap", "Player News", "Team News", "Game Preview"]);
  return allowed.has(value) ? value : "Team News";
}

function sortNewsArticlesNewestFirst(left, right) {
  const dateCompare = teamNewsSortValue(right) - teamNewsSortValue(left);
  if (dateCompare) return dateCompare;
  return String(left.title || "").localeCompare(String(right.title || ""));
}

function normalizeHighlight(highlight = {}, games = state?.games || []) {
  const gameId = String(highlight.gameId || highlight.game_id || "").trim();
  if (!gameId) return null;
  const gameIds = new Set((Array.isArray(games) ? games : []).map((game) => game?.id).filter(Boolean));
  if (gameIds.size && !gameIds.has(gameId)) return null;
  const youtubeUrl = String(highlight.youtubeUrl || highlight.youtube_url || "").trim();
  const youtubeVideoId = String(highlight.youtubeVideoId || highlight.youtube_video_id || youtubeVideoIdFromUrl(youtubeUrl) || "").trim();
  const playerIds = Array.isArray(highlight.playerIds || highlight.player_ids)
    ? (highlight.playerIds || highlight.player_ids).map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const categories = normalizeHighlightCategories(
    highlight.categories || highlight.highlight_categories || highlight.tags,
    highlight.category || highlight.highlight_category || ""
  );
  return {
    id: String(highlight.id || createId("highlight")).trim(),
    gameId,
    youtubeUrl,
    youtubeVideoId,
    title: String(highlight.title || "").trim(),
    description: String(highlight.description || "").trim(),
    category: categories[0] || "",
    categories,
    inning: String(highlight.inning || "").trim(),
    playType: String(highlight.playType || highlight.play_type || "").trim(),
    playerIds,
    createdAt: highlight.createdAt || highlight.created_at || new Date().toISOString(),
    updatedAt: highlight.updatedAt || highlight.updated_at || highlight.createdAt || highlight.created_at || new Date().toISOString()
  };
}

function normalizeHighlights(highlights = [], games = state?.games || []) {
  return (Array.isArray(highlights) ? highlights : [])
    .map((highlight) => normalizeHighlight(highlight, games))
    .filter((highlight) => highlight?.id)
    .sort(sortHighlightsNewestFirst);
}

function normalizeRoster(roster = []) {
  return roster.map((player) => ({
    ...player,
    number: String(player.number ?? "").trim(),
    positions: normalizePositions(player.positions),
    primaryPosition: String(player.primaryPosition || normalizePositions(player.positions)[0] || "UTL").trim().toUpperCase(),
    bats: player.bats || "R",
    throws: String(player.throws || player.bats || "R").trim().toUpperCase(),
    height: String(player.height || "").trim(),
    weight: normalizeWeight(player.weight || ""),
    active: player.active !== false,
    grades: { ...defaultPlayerGrades(), ...(player.grades || {}) }
  }));
}

function resetGameAwayLineupToRoster(game, nextState = state) {
  const lineupEntries = makeLineupEntries(nextState.lineup || []);
  game.lineupEntries = lineupEntries;
  if (!game.lineups) game.lineups = { away: [], home: opponentLineupEntries(game.opponentLineup || []) };
  game.lineups.away = deepClone(lineupEntries);
  game.batterIndex = Math.min(game.batterIndex || 0, Math.max(lineupEntries.length - 1, 0));
  const currentBatter = lineupEntries[game.batterIndex]?.playerId || lineupEntries[0]?.playerId || "";
  const pitcher = nextState.roster.find((player) => playerHasPosition(player, "P"))?.id || currentBatter;
  game.pitcherId = pitcher;
  if (game.current) game.current.batterId = currentBatter;
  if (game.current) game.current.pitcherId = pitcher;
}

function normalizeGame(game, nextState = state) {
  const lineupSource = game.lineups?.away || game.lineupEntries || makeLineupEntries(nextState.lineup || []);
  const homeSource = game.lineups?.home || opponentLineupEntries(game.opponentLineup || []);
  const lineupEntries = lineupSource.map((entry, index) => {
    const hasRole = entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "role");
    return {
      id: entry.id || createId("lineup"),
      playerId: Object.prototype.hasOwnProperty.call(entry, "playerId") ? entry.playerId : entry.id || "",
      role: hasRole ? entry.role : defaultRoleForSpot(index),
      order: entry.order || index + 1,
      active: entry.active !== false,
      note: entry.note || ""
    };
  });
  const homeLineup = homeSource.map((entry, index) => {
    const normalizedEntry = normalizeOpponentLineupEntry(entry, index, { preserveBlank: true });
    return {
      id: entry.id || createId("opp"),
      name: normalizedEntry.name,
      number: normalizedEntry.number,
      order: entry.order || index + 1,
      active: entry.active !== false
    };
  });
  const atBat = game.atBat || makeAtBat();
  const normalizedLionsSide = normalizeLionsSide(game.lionsSide || (game.teams?.home?.id === "oakmont-lions" ? "home" : "away"));
  const score = {
    lions: game.score?.lions ?? (normalizedLionsSide === "away" ? game.score?.away : game.score?.home) ?? 0,
    opponent: game.score?.opponent ?? (normalizedLionsSide === "away" ? game.score?.home : game.score?.away) ?? 0,
    away: game.score?.away ?? 0,
    home: game.score?.home ?? 0
  };
  const location = normalizeGameLocationInput(game.location || "", game.locationAddress || "");
  const normalized = {
    ...game,
    opponent: game.opponent || game.teams?.home?.name || "Opponent",
    time: game.time || "",
    location: location.name,
    locationAddress: location.address,
    notes: game.notes || "",
    status: game.quickScored === true ? "completed" : game.status || "active",
    lionsSide: normalizedLionsSide,
    teams: teamsForGame(game.opponent || game.teams?.home?.name || "Opponent", normalizedLionsSide),
    lineups: {
      away: lineupEntries,
      home: homeLineup
    },
    inning: game.inning ?? game.current?.inning ?? 1,
    half: game.half ?? game.current?.half ?? "top",
    outs: game.outs ?? game.current?.outs ?? 0,
    bases: game.bases || game.current?.runners || emptyBases(false),
    batterIndex: game.batterIndex ?? 0,
    lineupEntries,
    opponentBatterIndex: game.opponentBatterIndex ?? 0,
    opponentLineup: opponentLineupSnapshot(homeLineup, { preserveBlank: true }),
    pitcherId: game.pitcherId || game.current?.pitcherId || "",
    score,
    atBat: {
      ...makeAtBat(),
      ...atBat,
      pitches: normalizePitchTrail(atBat.pitches || [])
    },
    events: (game.events || []).map((event) => ({
      ...event,
      pitches: normalizePitchTrail(event.pitches || []),
      spray: event.spray || event.result?.sprayChart || null
    })),
    substitutions: game.substitutions || [],
    playHistory: normalizePlayHistory(game.playHistory, game.id),
    pendingScoring: game.pendingScoring ? deepClone(game.pendingScoring) : null
  };
  normalized.sync = normalizeGameSyncState(game.sync);
  normalized.current = {
    inning: normalized.inning,
    half: normalized.half,
    outs: normalized.outs,
    balls: normalized.atBat.balls ?? game.current?.balls ?? 0,
    strikes: normalized.atBat.strikes ?? game.current?.strikes ?? 0,
    batterId: game.current?.batterId || "",
    pitcherId: normalized.pitcherId,
    runners: deepClone(normalized.bases)
  };
  normalized.plateAppearances = normalizePlateAppearances(game.plateAppearances, normalized);
  normalized.currentPlateAppearanceId = game.currentPlateAppearanceId || "";
  syncGameTeams(normalized, normalized.lionsSide);
  syncGameCurrent(normalized);
  return normalized;
}

function normalizePlayHistory(history = [], gameId = "") {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry?.game?.id === gameId)
    .slice(-PLAY_HISTORY_LIMIT)
    .map((entry) => {
      const snapshotGame = deepClone(entry.game);
      if (snapshotGame) snapshotGame.playHistory = [];
      return {
        id: entry.id || createId("play-history"),
        reason: entry.reason || "play",
        result: entry.result || "",
        createdAt: entry.createdAt || new Date().toISOString(),
        game: snapshotGame,
        pending: deepClone(entry.pending || {})
      };
    });
}

function normalizePlateAppearances(plateAppearances, game) {
  if (plateAppearances && plateAppearances.length) {
    return plateAppearances.map((appearance) => ({
      id: appearance.id || createId("pa"),
      gameId: appearance.gameId || game.id,
      inning: appearance.inning ?? game.inning,
      half: appearance.half || game.half,
      battingSide: appearance.battingSide || (appearance.half === "bottom" ? "home" : "away"),
      batterId: appearance.batterId || appearance.playerId || "",
      pitcherId: appearance.pitcherId || "",
      basesBefore: appearance.basesBefore || emptyBases(false),
      hasRISP: appearance.hasRISP ?? Boolean(appearance?.basesBefore?.second || appearance?.basesBefore?.third),
      pitches: normalizePitchTrail(appearance.pitches || []),
      result: normalizePlateAppearanceResult(appearance.result),
      basesAfter: appearance.basesAfter || null,
      outsBefore: appearance.outsBefore ?? 0,
      outsAfter: appearance.outsAfter ?? appearance.outsBefore ?? 0,
      runsScored: appearance.runsScored ?? 0,
      startedAt: appearance.startedAt || appearance.createdAt || new Date().toISOString(),
      completedAt: appearance.completedAt || null
    }));
  }
  return (game.events || [])
    .filter((event) => eventRules[event.result]?.pa)
    .map((event) => ({
      id: event.plateAppearanceId || createId("pa"),
      gameId: game.id,
      inning: event.inning,
      half: event.half,
      battingSide: event.half === "bottom" ? "home" : "away",
      batterId: event.playerId,
      pitcherId: event.pitcherId || "",
      basesBefore: event.basesBefore || emptyBases(false),
      hasRISP: event.hasRISP ?? Boolean(event?.basesBefore?.second || event?.basesBefore?.third),
      pitches: normalizePitchTrail(event.pitches || []),
      result: normalizePlateAppearanceResult({
        type: event.result,
        rbi: event.rbi || 0,
        contact: event.contact || "none",
        launch: event.launch || "none",
        sprayChart: event.spray || null,
        fieldedBy: event.fieldedBy || "",
        errorOnPlay: event.errorOnPlay || event.result === "ROE",
        errorFielderPosition: event.errorFielderPosition || "",
        runnerAdvancements: event.runnerAdvancements || [],
        notes: event.note || ""
      }),
      basesAfter: event.basesAfter || null,
      outsBefore: event.outsBefore ?? 0,
      outsAfter: event.outsAfter ?? event.outsBefore ?? 0,
      runsScored: event.runs ?? 0,
      startedAt: event.createdAt || new Date().toISOString(),
      completedAt: event.createdAt || null
    }));
}

function normalizePlateAppearanceResult(result) {
  if (!result) return null;
  const type = result.type || result.result || "";
  const rule = eventRules[type] || {};
  return {
    type,
    hit: Boolean(result.hit ?? rule.hit),
    officialAtBat: Boolean(result.officialAtBat ?? rule.ab),
    errorOnPlay: Boolean(result.errorOnPlay ?? type === "ROE"),
    errorFielderPosition: result.errorFielderPosition || "",
    rbi: result.rbi ?? 0,
    outsRecorded: result.outsRecorded ?? (rule.out ? 1 : 0),
    contact: result.contact || "none",
    launch: result.launch || rule.launch || "none",
    sprayChart: result.sprayChart || null,
    fieldedBy: result.fieldedBy || "",
    runnerAdvancements: result.runnerAdvancements || [],
    notes: result.notes || ""
  };
}

function normalizePitchTrail(pitches = []) {
  let balls = 0;
  let strikes = 0;
  return pitches.map((pitch, index) => {
    const outcome = pitch.outcome || pitch.type || "ball";
    const ballsBefore = pitch.ballsBefore ?? balls;
    const strikesBefore = pitch.strikesBefore ?? strikes;
    const next = nextPitchCount(ballsBefore, strikesBefore, outcome);
    balls = pitch.ballsAfter ?? next.balls;
    strikes = pitch.strikesAfter ?? next.strikes;
    return {
      id: pitch.id || createId("pitch"),
      pitchNumber: pitch.pitchNumber || index + 1,
      ballsBefore,
      strikesBefore,
      outcome,
      ballsAfter: balls,
      strikesAfter: strikes,
      pitcherId: pitch.pitcherId || "",
      inPlay: Boolean(pitch.inPlay ?? outcome === "in_play"),
      type: outcome,
      label: pitch.label || pitchLabels[outcome] || outcome,
      countBefore: pitch.countBefore || `${ballsBefore}-${strikesBefore}`,
      createdAt: pitch.createdAt || new Date().toISOString()
    };
  });
}

function normalizeGameSyncState(sync = {}) {
  return {
    status: sync?.status || "local",
    lastAttemptAt: sync?.lastAttemptAt || "",
    lastSyncedAt: sync?.lastSyncedAt || "",
    lastError: sync?.lastError || ""
  };
}

function normalizeDeletedGameTombstones(tombstones = {}, games = []) {
  const activeIds = new Set((Array.isArray(games) ? games : []).map((game) => game?.id).filter(Boolean));
  const normalized = Object.entries(tombstones && typeof tombstones === "object" ? tombstones : {})
    .filter(([gameId, deletedAt]) => gameId && deletedAt && !activeIds.has(gameId))
    .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
    .slice(0, 250);
  return Object.fromEntries(normalized);
}

function rememberDeletedGame(gameId, deletedAt = new Date().toISOString()) {
  if (!gameId) return;
  const remainingGames = (state.games || []).filter((game) => game?.id !== gameId);
  state.deletedGameTombstones = normalizeDeletedGameTombstones({
    ...(state.deletedGameTombstones || {}),
    [gameId]: deletedAt
  }, remainingGames);
}

function isGameDeletedTombstoned(gameId, sourceState = state) {
  if (!gameId) return false;
  return Boolean(sourceState?.deletedGameTombstones?.[gameId]);
}

function normalizeCompletedGameSyncJob(job = {}) {
  return {
    gameId: String(job?.gameId || "").trim(),
    queuedAt: job?.queuedAt || new Date().toISOString(),
    lastAttemptAt: job?.lastAttemptAt || "",
    attempts: Number.isFinite(Number(job?.attempts)) ? Math.max(0, Number(job.attempts)) : 0,
    lastError: job?.lastError || ""
  };
}

function gameNeedsCompletedSyncRetry(game) {
  if (!gameIsFinal(game)) return false;
  const status = stableGameSyncState(game).status;
  return status === "error" || status === "syncing";
}

function normalizeCompletedGameSyncQueue(queue = [], games = []) {
  const jobsByGameId = new Map();
  const finalGamesById = new Map(
    (Array.isArray(games) ? games : [])
      .filter((game) => game?.id && gameIsFinal(game))
      .map((game) => [game.id, game])
  );

  (Array.isArray(queue) ? queue : []).forEach((job) => {
    const normalized = normalizeCompletedGameSyncJob(job);
    if (!normalized.gameId || !finalGamesById.has(normalized.gameId)) return;
    jobsByGameId.set(normalized.gameId, normalized);
  });

  finalGamesById.forEach((game, gameId) => {
    if (!gameNeedsCompletedSyncRetry(game) || jobsByGameId.has(gameId)) return;
    jobsByGameId.set(gameId, normalizeCompletedGameSyncJob({ gameId }));
  });

  return [...jobsByGameId.values()];
}

function queueCompletedGameSync(gameId, details = {}) {
  if (!gameId) return false;
  const before = Array.isArray(state?.completedGameSyncQueue) ? state.completedGameSyncQueue.length : 0;
  state.completedGameSyncQueue = normalizeCompletedGameSyncQueue([
    ...(state?.completedGameSyncQueue || []),
    { gameId, ...details }
  ], state?.games || []);
  return state.completedGameSyncQueue.length > before;
}

function dequeueCompletedGameSync(gameIds = []) {
  const ids = new Set((Array.isArray(gameIds) ? gameIds : [gameIds]).filter(Boolean));
  if (!ids.size) return;
  state.completedGameSyncQueue = normalizeCompletedGameSyncQueue(
    (state?.completedGameSyncQueue || []).filter((job) => !ids.has(job.gameId)),
    state?.games || []
  );
}

function queuedCompletedGameIds() {
  return (state?.completedGameSyncQueue || []).map((job) => job.gameId).filter(Boolean);
}

function updateCompletedGameSyncQueueAttempt(gameIds = [], error = null) {
  const ids = new Set((Array.isArray(gameIds) ? gameIds : [gameIds]).filter(Boolean));
  if (!ids.size) return;
  const timestamp = new Date().toISOString();
  state.completedGameSyncQueue = normalizeCompletedGameSyncQueue(
    (state?.completedGameSyncQueue || []).map((job) => {
      if (!ids.has(job.gameId)) return job;
      const normalized = normalizeCompletedGameSyncJob(job);
      return {
        ...normalized,
        attempts: normalized.attempts + 1,
        lastAttemptAt: timestamp,
        lastError: error?.message || String(error || "")
      };
    }),
    state?.games || []
  );
}

function stableGameSyncState(game, options = {}) {
  const normalized = normalizeGameSyncState(game?.sync);
  const keepActiveSync = options.keepActiveSync && game?.id && activeCompletedGameSyncs.has(game.id);
  if (keepActiveSync) return normalized;
  if (normalized.status === "syncing") {
    return {
      ...normalized,
      status: normalized.lastSyncedAt ? "synced" : "pending",
      lastError: ""
    };
  }
  return normalized;
}

function nextPitchCount(ballsBefore, strikesBefore, outcome) {
  let balls = ballsBefore;
  let strikes = strikesBefore;
  if (outcome === "ball") balls = Math.min(4, balls + 1);
  if (outcome === "strike" || outcome === "called_strike" || outcome === "swinging_strike") strikes = Math.min(3, strikes + 1);
  if (outcome === "foul" && strikes < 2) strikes += 1;
  return { balls, strikes };
}

function emptyGameLibrary() {
  return storage.emptyLibrary();
}

function buildGameLibraryFromGames(games = [], activeGameId = "") {
  return storage.buildLibraryFromGames(games, activeGameId);
}

function normalizeGameLibrary(library) {
  return storage.normalizeLibrary(library);
}

function loadGameLibrary() {
  return storage.loadLibrary();
}

function saveGameLibrary(library) {
  return storage.saveLibrary(library);
}

function saveGameToLibrary(game, setActive = true) {
  return storage.saveGame(game, setActive);
}

function loadGameById(gameId) {
  return storage.loadGameById(gameId);
}

function loadActiveGame() {
  return storage.getActiveGame();
}

function listSavedGames() {
  return storage.listGames();
}

function setActiveGame(gameId) {
  const game = storage.setActiveGame(gameId);
  if (!game) return null;
  if (typeof state !== "undefined") state.activeGameId = gameId;
  if (gameId !== scoreCompleteSummaryGameId) clearGameCompleteSummary();
  return game;
}

function deleteGame(gameId) {
  const saved = storage.deleteGame(gameId);
  if (typeof state !== "undefined") {
    state.games = state.games.filter((game) => game.id !== gameId);
    state.activeGameId = saved.activeGameId;
    storage.saveAppState(state);
  }
  return saved;
}

function clearGameLibrary() {
  const library = storage.saveLibrary(emptyGameLibrary());
  if (typeof state !== "undefined") {
    state.games = [];
    state.activeGameId = "";
    storage.saveAppState(state);
  }
  return library;
}

function exportGameAsJson(game) {
  if (game?.id && storage.loadGameById(game.id)) return storage.exportGame(game.id);
  return JSON.stringify(deepClone(game), null, 2);
}

function importGameFromText(jsonText, setActive = false) {
  const imported = storage.importGameFromText(jsonText, setActive);
  if (typeof state !== "undefined") {
    const library = storage.loadLibrary();
    state.games = library.gameOrder.map((gameId) => normalizeGame(library.gamesById[gameId], state)).filter(Boolean);
    state.activeGameId = library.activeGameId;
    saveState();
  }
  return imported;
}

function importGameFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file selected."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error || new Error("Unable to read game file.")));
    reader.addEventListener("load", () => {
      try {
        resolve(importGameFromText(String(reader.result || ""), true));
      } catch (error) {
        reject(error);
      }
    });
    reader.readAsText(file);
  });
}

function exportSeasonAsJson(library = loadGameLibrary()) {
  return JSON.stringify(storage.normalizeLibrary(library), null, 2);
}

function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function forceScoreGamePaintFlush() {
  const node = document.getElementById("scoreView");
  if (!node || !node.classList.contains("is-visible")) return;
  scoreGamePaintFlushFrame += 1;
  node.dataset.paintFlush = String(scoreGamePaintFlushFrame);
  node.classList.add("is-score-paint-flush");
  void node.offsetHeight;
  window.requestAnimationFrame?.(() => {
    node.classList.remove("is-score-paint-flush");
  });
}

function renderScoreGameSurfacesForFlush() {
  const game = activeScoreGame();
  if (!game || currentView !== "score") return;
  renderScoreEmptyState(game);
  renderScoreboard();
  renderAtBat();
  renderScoringStepPanel();
  renderRunnerTracker();
  renderSprayChart();
  renderPlayFeed();
  renderLiveSyncStatus(game);
  forceScoreGamePaintFlush();
}

function scheduleScoreGameRenderFlush(reason = "score-update") {
  const game = activeScoreGame();
  if (!game || currentView !== "score") return;
  if (scoreGameRenderFlushTimer) {
    window.clearTimeout(scoreGameRenderFlushTimer);
    scoreGameRenderFlushTimer = null;
  }
  window.requestAnimationFrame?.(() => renderScoreGameSurfacesForFlush(reason));
  scoreGameRenderFlushTimer = window.setTimeout(() => {
    scoreGameRenderFlushTimer = null;
    renderScoreGameSurfacesForFlush(reason);
  }, 90);
}

function handleLocalStorageSaveError(error) {
  console.warn("Unable to save scorebook state to local device storage; continuing with in-memory scoring state.", error);
  if (!localStorageSaveWarningShown) {
    localStorageSaveWarningShown = true;
    window.setTimeout(() => {
      window.alert("This device could not save to local scorebook storage. The app will keep scoring in memory and continue trying to save to IndexedDB. Sync or export the game when you can.");
    }, 0);
  }
}

function saveState(options = {}) {
  let activeGameObject = null;
  if (state?.games?.length) {
    const liveGameBeforeNormalize = state.games.find((game) => game.id === state.activeGameId && game.status === "active" && !gameIsFinal(game))
      || state.games.find((game) => game.status === "active" && !gameIsFinal(game));
    if (liveGameBeforeNormalize && options.capturePendingScoring !== false) {
      liveGameBeforeNormalize.pendingScoring = pendingScoringSnapshot();
    }
    state.games = state.games.map((game) => normalizeGame(game, state));
    activeGameObject = state.games.find((game) => game.id === state.activeGameId && game.status === "active" && !gameIsFinal(game));
    if (!activeGameObject) activeGameObject = state.games.find((game) => game.status === "active" && !gameIsFinal(game));
    state.activeGameId = activeGameObject?.id || "";
  }
  try {
    storage.saveAppState(state);
    if (state?.games?.length) {
      if (activeGameObject) storage.saveGame(activeGameObject, true);
      const library = buildGameLibraryFromGames(state.games, state.activeGameId);
      storage.saveLibrary(library);
    }
  } catch (error) {
    handleLocalStorageSaveError(error);
  }
  if (activeGameObject && options.markLiveGamesDirty !== false) {
    queueLiveGameSnapshotSync(activeGameObject, options.liveSyncReason || "live-game-save");
  }
  if (activeGameObject && options.flushScoreRender !== false) {
    scheduleScoreGameRenderFlush(options.liveSyncReason || "live-game-save");
  }
}

function saveStateWithOptions(options = {}) {
  saveState(options);
}

function hasMeaningfulSupabaseSnapshot(snapshot) {
  if (!snapshot) return false;
  if (Array.isArray(snapshot.games) && snapshot.games.length) return true;
  if (Array.isArray(snapshot.rosterPlayers) && snapshot.rosterPlayers.length) return true;
  if (Array.isArray(snapshot.highlights) && snapshot.highlights.length) return true;
  if (Array.isArray(snapshot.newsArticles) && snapshot.newsArticles.length) return true;
  const appState = snapshot.appState;
  if (!appState || typeof appState !== "object") return false;
  if (Array.isArray(appState.roster) && appState.roster.length) return true;
  if (Array.isArray(appState.lineup) && appState.lineup.length) return true;
  if (typeof appState.active_game_id === "string" && appState.active_game_id.trim()) return true;
  return false;
}

function sharedRosterMissing(snapshot) {
  if (!snapshot?.appState || typeof snapshot.appState !== "object") return true;
  const rosterRowsMissing = !Array.isArray(snapshot.rosterPlayers) || !snapshot.rosterPlayers.length;
  const appStateRosterMissing = !Array.isArray(snapshot.appState.roster) || !snapshot.appState.roster.length;
  const rosterMissing = rosterRowsMissing && appStateRosterMissing;
  const lineupMissing = !Array.isArray(snapshot.appState.lineup) || !snapshot.appState.lineup.length;
  return rosterMissing || lineupMissing;
}

function markSharedAppStateDirty() {
  sharedAppStateDirtyInSession = true;
}

function markSharedGamesDirty(gameIds = []) {
  const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
  ids.filter(Boolean).forEach((gameId) => {
    pendingSharedGameIds.add(gameId);
    pendingDeletedSharedGameIds.delete(gameId);
  });
}

function markSharedGamesDeleted(gameIds = []) {
  const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
  ids.filter(Boolean).forEach((gameId) => {
    pendingDeletedSharedGameIds.add(gameId);
    pendingSharedGameIds.delete(gameId);
  });
}

function timestampValue(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function gameResumedAfterPostponed(game, postponedGame) {
  return timestampValue(game?.resumedFromPostponedAt) > timestampValue(postponedGame?.postponedAt);
}

function postponedGameBlocksIncoming(existingGame, incomingGame) {
  return Boolean(
    gameIsPostponed(existingGame)
    && !gameIsPostponed(incomingGame)
    && !gameResumedAfterPostponed(incomingGame, existingGame)
  );
}

function remoteGameBlocksLocalSync(remoteGame, localGame) {
  return Boolean(
    remoteGame
    && localGame
    && (
      (gameIsFinal(remoteGame) && !gameIsFinal(localGame))
      || postponedGameBlocksIncoming(remoteGame, localGame)
    )
  );
}

function clearSharedSessionPending(options = {}) {
  const {
    clearAppState = false,
    syncedGameIds = [],
    deletedGameIds = []
  } = options;
  if (clearAppState) sharedAppStateDirtyInSession = false;
  (Array.isArray(syncedGameIds) ? syncedGameIds : [syncedGameIds]).filter(Boolean).forEach((gameId) => {
    pendingSharedGameIds.delete(gameId);
  });
  (Array.isArray(deletedGameIds) ? deletedGameIds : [deletedGameIds]).filter(Boolean).forEach((gameId) => {
    pendingDeletedSharedGameIds.delete(gameId);
  });
}

function overlaySessionSharedChanges(baseState, localState = state) {
  const nextState = normalizeState(deepClone(baseState || localState || state));
  const currentLocalState = normalizeState(deepClone(localState || state));

  if (sharedAppStateDirtyInSession) {
    nextState.roster = deepClone(currentLocalState.roster || []);
    nextState.lineup = deepClone(currentLocalState.lineup || []);
    nextState.rosterVersion = currentLocalState.rosterVersion ?? nextState.rosterVersion;
  }

  if (!pendingSharedGameIds.size && !pendingDeletedSharedGameIds.size) {
    return nextState;
  }

  const localGamesById = new Map((currentLocalState.games || []).map((game) => [game?.id, game]).filter(([gameId]) => Boolean(gameId)));
  const mergedGamesById = new Map((nextState.games || []).map((game) => [game?.id, game]).filter(([gameId]) => Boolean(gameId)));
  const orderedIds = [];
  const pushOrderedId = (gameId) => {
    if (!gameId || orderedIds.includes(gameId)) return;
    orderedIds.push(gameId);
  };

  (nextState.games || []).forEach((game) => pushOrderedId(game?.id));
  (currentLocalState.games || []).forEach((game) => {
    if (pendingSharedGameIds.has(game?.id)) pushOrderedId(game?.id);
  });

  pendingSharedGameIds.forEach((gameId) => {
    const localGame = localGamesById.get(gameId);
    if (!localGame) return;
    const remoteGame = mergedGamesById.get(gameId);
    if (remoteGameBlocksLocalSync(remoteGame, localGame)) {
      pendingSharedGameIds.delete(gameId);
      return;
    }
    mergedGamesById.set(gameId, deepClone(localGame));
    pushOrderedId(gameId);
  });

  pendingDeletedSharedGameIds.forEach((gameId) => {
    mergedGamesById.delete(gameId);
    nextState.deletedGameTombstones[gameId] = currentLocalState.deletedGameTombstones?.[gameId] || new Date().toISOString();
  });

  nextState.games = orderedIds.map((gameId) => mergedGamesById.get(gameId)).filter(Boolean);
  if (pendingDeletedSharedGameIds.has(nextState.activeGameId)) nextState.activeGameId = "";
  return nextState;
}

async function bootstrapSupabaseState() {
  if (!supabaseStorage?.isReady?.()) return null;
  if (supabaseBootstrapPromise) return supabaseBootstrapPromise;
  supabaseBootstrapPromise = (async () => {
    const result = await refreshSupabaseState("bootstrap", { force: true, skipWhenHidden: false });
    return result;
  })().finally(() => {
    supabaseBootstrapPromise = null;
  });
  return supabaseBootstrapPromise;
}

async function refreshSupabaseState(reason = "refresh", options = {}) {
  if (!supabaseStorage?.isReady?.()) return null;
  if (supabaseRefreshPromise) return supabaseRefreshPromise;
  const { force = false, skipWhenHidden = true } = options;
  const visibilityState = typeof document !== "undefined" ? document.visibilityState : "visible";
  if (skipWhenHidden && visibilityState === "hidden") return null;
  const now = Date.now();
  if (!force && lastSupabaseRefreshAt && now - lastSupabaseRefreshAt < SUPABASE_REFRESH_THROTTLE_MS) {
    return null;
  }
  supabaseRefreshPromise = (async () => {
    try {
      const { data, error } = await supabaseStorage.fetchBootstrap();
      if (error) {
        console.warn("Unable to load Supabase scorebook snapshot.", error);
        return null;
      }
      sharedWriteBaselineReady = true;
      lastSharedBaselineAt = Date.now();
      if (!hasMeaningfulSupabaseSnapshot(data)) {
        console.info("Supabase is connected, but there is no shared scorebook data yet.");
        return null;
      }
      const merged = overlaySessionSharedChanges(
        supabaseStorage.mergeRemoteSnapshot(
          state,
          data.appState,
          data.games,
          data.rosterPlayers,
          data.highlights,
          data.newsArticlesMissingTable ? undefined : data.newsArticles
        ),
        state
      );
      state = normalizeState(merged);
      restoreActiveGamePendingScoringState();
      saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
      render();
      lastSupabaseRefreshAt = Date.now();
      console.info(`Loaded shared scorebook data from Supabase (${reason}).`);
      return state;
    } catch (error) {
      console.warn(`Supabase refresh failed (${reason}); continuing with local scorebook data.`, error);
      return null;
    } finally {
      supabaseRefreshPromise = null;
    }
  })();
  return supabaseRefreshPromise;
}

function invalidateSharedWriteBaseline() {
  sharedWriteBaselineReady = false;
  lastSharedBaselineAt = 0;
}

async function ensureFreshSharedBaseline(reason = "shared-write") {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return true;
  if (sharedWriteBaselineReady && lastSharedBaselineAt) return true;
  await refreshSupabaseState(`baseline-${reason}`, { force: true, skipWhenHidden: false });
  return Boolean(sharedWriteBaselineReady && lastSharedBaselineAt);
}

function requestSupabaseRefresh(reason, options = {}) {
  if (!supabaseStorage?.isReady?.()) return;
  if (options.invalidateBaseline !== false) invalidateSharedWriteBaseline();
  setTimeout(() => {
    refreshSupabaseState(reason, options).catch((error) => {
      console.warn(`Supabase refresh request failed (${reason}).`, error);
    });
  }, 0);
}

function requestLifecycleSupabaseRefresh(reason, options = {}) {
  const liveGame = activeLiveGameForState(state);
  if (liveGame?.id && (pendingSharedGameIds.has(liveGame.id) || liveGameSyncTimer)) return;
  requestSupabaseRefresh(reason, {
    ...options,
    invalidateBaseline: false
  });
}

function generateClientId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function browserStorageArea(name) {
  try {
    return window?.[name] || null;
  } catch (error) {
    return null;
  }
}

function getStoredClientId(storageArea, key, prefix) {
  try {
    const existing = String(storageArea?.getItem(key) || "").trim();
    if (existing) return existing;
    const next = generateClientId(prefix);
    storageArea?.setItem(key, next);
    return next;
  } catch (error) {
    return generateClientId(prefix);
  }
}

function visitDeviceType() {
  const userAgent = String(navigator?.userAgent || "").toLowerCase();
  const touchPoints = Number(navigator?.maxTouchPoints || 0);
  if (/ipad|tablet/.test(userAgent) || (touchPoints > 1 && /macintosh/.test(userAgent))) return "tablet";
  if (/mobile|iphone|android/.test(userAgent)) return "mobile";
  return "desktop";
}

function visitAlreadyRecorded(sessionId) {
  try {
    return browserStorageArea("sessionStorage")?.getItem(VISIT_RECORDED_STORAGE_KEY) === sessionId;
  } catch (error) {
    return false;
  }
}

function markVisitRecorded(sessionId) {
  try {
    browserStorageArea("sessionStorage")?.setItem(VISIT_RECORDED_STORAGE_KEY, sessionId);
  } catch (error) {
    // Best effort only. Visit tracking should never affect app behavior.
  }
}

function initializeSiteVisitTracking() {
  recordSiteVisitOnce("app-load");
}

function recordSiteVisitOnce(reason = "visit", options = {}) {
  if (!supabaseStorage?.recordSiteVisit || !supabaseStorage?.isReady?.()) return null;
  const sessionId = getStoredClientId(browserStorageArea("sessionStorage"), VISIT_SESSION_ID_STORAGE_KEY, "session");
  if (!options.force && visitAlreadyRecorded(sessionId)) return null;
  if (siteVisitRecordPromise) return siteVisitRecordPromise;
  const visitorId = getStoredClientId(browserStorageArea("localStorage"), VISITOR_ID_STORAGE_KEY, "visitor");
  const pagePath = `${window.location?.pathname || "/"}${window.location?.search || ""}`;
  siteVisitRecordPromise = supabaseStorage.recordSiteVisit({
    visitorId,
    sessionId,
    pagePath,
    viewName: currentView || "home",
    deviceType: visitDeviceType(),
    isAdmin: isAdminMode(),
    metadata: {
      appVersion: APP_VERSION,
      environment: window.ScorebookSupabase?.environment || "",
      reason
    }
  }).then((response) => {
    if (response?.error) throw response.error;
    markVisitRecorded(sessionId);
    return response;
  }).catch((error) => {
    if (!siteVisitWarningShown) {
      siteVisitWarningShown = true;
      console.warn("Unable to record site visit; continuing normally.", error);
    }
    return { data: null, error };
  }).finally(() => {
    siteVisitRecordPromise = null;
  });
  return siteVisitRecordPromise;
}

function normalizeSiteVisitSummary(summary = {}) {
  const totalVisits = Number(summary.totalVisits ?? summary.total_visits ?? 0) || 0;
  const todayVisits = Number(summary.todayVisits ?? summary.today_visits ?? 0) || 0;
  const uniqueVisitors = Number(summary.uniqueVisitors ?? summary.unique_visitors ?? 0) || 0;
  return {
    totalVisits,
    todayVisits,
    uniqueVisitors,
    lastVisitAt: summary.lastVisitAt || summary.last_visit_at || ""
  };
}

function formatVisitCount(value) {
  return new Intl.NumberFormat("en-US", {
    notation: Number(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(Number(value) || 0);
}

function renderSiteVisitCounter() {
  if (!els.homeVisitCounterCard) return;
  const visible = isAdminMode();
  els.homeVisitCounterCard.hidden = !visible;
  if (!visible) return;
  const summary = normalizeSiteVisitSummary(siteVisitSummary || {});
  if (els.homeVisitTotal) {
    els.homeVisitTotal.textContent = siteVisitSummaryState === "ready"
      ? formatVisitCount(summary.totalVisits)
      : "--";
  }
  if (els.homeVisitMeta) {
    if (siteVisitSummaryState === "setup") {
      els.homeVisitMeta.textContent = "Run schema";
    } else if (siteVisitSummaryState === "error") {
      els.homeVisitMeta.textContent = "Unavailable";
    } else if (siteVisitSummaryState === "loading") {
      els.homeVisitMeta.textContent = "Loading visits";
    } else if (siteVisitSummaryState === "ready") {
      els.homeVisitMeta.textContent = `${formatVisitCount(summary.todayVisits)} today | ${formatVisitCount(summary.uniqueVisitors)} visitors`;
    } else {
      els.homeVisitMeta.textContent = "Admin only";
    }
  }
}

function requestSiteVisitSummaryRefresh(reason = "home", options = {}) {
  if (!isAdminMode()) {
    siteVisitSummary = null;
    siteVisitSummaryState = "idle";
    renderSiteVisitCounter();
    return null;
  }
  if (!supabaseStorage?.fetchSiteVisitSummary || !supabaseStorage?.isReady?.()) {
    siteVisitSummaryState = "setup";
    renderSiteVisitCounter();
    return null;
  }
  const now = Date.now();
  if (!options.force && siteVisitSummaryLoadedAt && now - siteVisitSummaryLoadedAt < SITE_VISIT_SUMMARY_REFRESH_MS) {
    renderSiteVisitCounter();
    return null;
  }
  if (siteVisitSummaryPromise) return siteVisitSummaryPromise;
  siteVisitSummaryState = "loading";
  renderSiteVisitCounter();
  siteVisitSummaryPromise = supabaseStorage.fetchSiteVisitSummary()
    .then((response) => {
      if (response?.missingFunction) {
        siteVisitSummary = null;
        siteVisitSummaryState = "setup";
        siteVisitSummaryLoadedAt = Date.now();
        return response;
      }
      if (response?.error) throw response.error;
      siteVisitSummary = normalizeSiteVisitSummary(response?.data || {});
      siteVisitSummaryLoadedAt = Date.now();
      siteVisitSummaryState = "ready";
      return response;
    })
    .catch((error) => {
      siteVisitSummaryState = "error";
      siteVisitSummaryLoadedAt = Date.now();
      console.warn(`Unable to load site visit summary (${reason}).`, error);
      return { data: null, error };
    })
    .finally(() => {
      siteVisitSummaryPromise = null;
      renderSiteVisitCounter();
    });
  return siteVisitSummaryPromise;
}

function activeLiveGameForState(sourceState = state) {
  const games = Array.isArray(sourceState?.games) ? sourceState.games : [];
  const activeById = games.find((game) => game?.id === sourceState?.activeGameId && game.status === "active" && !gameIsFinal(game));
  return activeById || games.find((game) => game?.status === "active" && !gameIsFinal(game)) || null;
}

function requestLiveGameSnapshotSync(reason = "live-game") {
  const game = activeLiveGameForState(state);
  if (!game?.id) return;
  markSharedGamesDirty(game.id);
  requestSharedSnapshotSync(reason);
}

function clearLiveGameSnapshotSyncTimer() {
  if (!liveGameSyncTimer) return;
  window.clearTimeout(liveGameSyncTimer);
  liveGameSyncTimer = null;
}

function queueLiveGameSnapshotSync(game = activeLiveGameForState(state), reason = "live-game") {
  if (!game?.id || game.status !== "active" || gameIsFinal(game)) return;
  markSharedGamesDirty(game.id);
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return;
  clearLiveGameSnapshotSyncTimer();
  liveGameSyncTimer = window.setTimeout(() => {
    liveGameSyncTimer = null;
    requestLiveGameSnapshotSync(reason);
  }, LIVE_GAME_SYNC_DEBOUNCE_MS);
}

function isCloudSyncedGame(game) {
  return Boolean(game?.id);
}

function buildSharedSnapshot(sourceState = state) {
  const sharedGames = (sourceState?.games || [])
    .filter((game) => isCloudSyncedGame(game) && !isGameDeletedTombstoned(game?.id, sourceState))
    .map((game) => {
      const sharedGame = deepClone(game);
      sharedGame.sync = stableGameSyncState(game);
      return sharedGame;
    });
  const activeSharedGame = sharedGames.find((game) => game.id === sourceState?.activeGameId && game.status === "active" && !gameIsFinal(game))
    || sharedGames.find((game) => game.status === "active" && !gameIsFinal(game));
  return {
    roster: deepClone(sourceState?.roster || []),
    lineup: deepClone(sourceState?.lineup || []),
    rosterVersion: sourceState?.rosterVersion ?? ROSTER_VERSION,
    deletedGameTombstones: normalizeDeletedGameTombstones(sourceState?.deletedGameTombstones, sourceState?.games || []),
    activeGameId: activeSharedGame?.id || "",
    games: sharedGames
  };
}

function markSharedSnapshotGamesSynced(gameIds = [], timestamp = new Date().toISOString()) {
  const ids = new Set((Array.isArray(gameIds) ? gameIds : [gameIds]).filter(Boolean));
  if (!ids.size) return;
  state.games.forEach((game) => {
    if (!ids.has(game?.id)) return;
    game.sync = normalizeGameSyncState(game.sync);
    game.sync.status = "synced";
    game.sync.lastSyncedAt = timestamp;
    game.sync.lastAttemptAt = timestamp;
    game.sync.lastError = "";
  });
}

function applyDeletedGameIdsToState(sourceState, deleteGameIds = []) {
  const ids = new Set((Array.isArray(deleteGameIds) ? deleteGameIds : [deleteGameIds]).filter(Boolean));
  if (!ids.size) return sourceState;
  const nextState = normalizeState(deepClone(sourceState || state));
  nextState.games = (nextState.games || []).filter((game) => !ids.has(game?.id));
  ids.forEach((gameId) => {
    nextState.deletedGameTombstones[gameId] = new Date().toISOString();
  });
  if (ids.has(nextState.activeGameId)) nextState.activeGameId = "";
  return nextState;
}

async function syncSharedSnapshot(reason = "manual", options = {}) {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return null;
  if (!options.skipFreshBaselineCheck) {
    const ready = await ensureFreshSharedBaseline(`sync-${reason}`);
    if (!ready) {
      const error = new Error("A fresh shared baseline could not be loaded before sync.");
      console.warn(`Unable to sync shared scorebook snapshot (${reason}).`, error);
      return { data: null, error };
    }
  }
  if (sharedSyncPromise) {
    await sharedSyncPromise;
    return syncSharedSnapshot(reason, options);
  }
  sharedSyncPromise = (async () => {
    let sourceState = options?.sourceState || state;
    const deleteGameIds = Array.isArray(options?.deleteGameIds) ? options.deleteGameIds.filter(Boolean) : [];
    try {
      const remoteBootstrap = await supabaseStorage.fetchBootstrap();
      if (remoteBootstrap?.error) {
        console.warn(`Unable to load remote scorebook snapshot before sync (${reason}).`, remoteBootstrap.error);
        return { data: null, error: remoteBootstrap.error };
      }
      if (hasMeaningfulSupabaseSnapshot(remoteBootstrap?.data)) {
        const mergedState = applyDeletedGameIdsToState(
          overlaySessionSharedChanges(
            normalizeState(
              supabaseStorage.mergeRemoteSnapshot(
                sourceState,
                remoteBootstrap.data.appState,
                remoteBootstrap.data.games,
                remoteBootstrap.data.rosterPlayers,
                remoteBootstrap.data.highlights,
                remoteBootstrap.data.newsArticlesMissingTable ? undefined : remoteBootstrap.data.newsArticles
              )
            ),
            sourceState
          ),
          deleteGameIds
        );
        if (sourceState === state) {
          state = mergedState;
          saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
          render();
          sourceState = state;
        } else {
          sourceState = mergedState;
        }
      } else if (deleteGameIds.length) {
        sourceState = applyDeletedGameIdsToState(sourceState, deleteGameIds);
      }
      const snapshot = buildSharedSnapshot(sourceState);
      const [appStateResponse, rosterPlayersResponse, gamesResponse] = await Promise.all([
        supabaseStorage.upsertAppState(snapshot),
        supabaseStorage.upsertRosterPlayers
          ? supabaseStorage.upsertRosterPlayers(snapshot.roster, snapshot.rosterVersion)
          : Promise.resolve({ data: [], error: null }),
        supabaseStorage.upsertGames(snapshot.games)
      ]);
      const deleteResponse = deleteGameIds.length
        ? await supabaseStorage.deleteGames(deleteGameIds)
        : { data: [], error: null };
      const error = appStateResponse.error || rosterPlayersResponse.error || gamesResponse.error || deleteResponse.error || null;
      if (error) {
        console.warn(`Unable to sync shared scorebook snapshot (${reason}).`, error);
        return { data: null, error };
      }
      if (sourceState === state) {
        const syncedIds = snapshot.games.map((game) => game?.id).filter(Boolean);
        if (syncedIds.length) {
          const syncedAt = new Date().toISOString();
          markSharedSnapshotGamesSynced(syncedIds, syncedAt);
        }
        clearSharedSessionPending({
          clearAppState: true,
          syncedGameIds: syncedIds,
          deletedGameIds: deleteGameIds
        });
        saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
        render();
      }
      console.info(`Synced shared scorebook snapshot to Supabase (${reason}).`);
      return {
        data: {
          appState: appStateResponse.data || null,
          rosterPlayers: rosterPlayersResponse.data || [],
          rosterPlayersMissingTable: Boolean(rosterPlayersResponse.missingTable),
          games: gamesResponse.data || []
        },
        error: null
      };
    } finally {
      sharedSyncPromise = null;
    }
  })();
  return sharedSyncPromise;
}

function requestSharedSnapshotSync(reason, options = {}) {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return;
  setTimeout(() => {
    (async () => {
      if (!sharedWriteBaselineReady) {
        console.info(`Delaying shared snapshot sync until a fresh remote baseline is loaded (${reason}).`);
        const refreshed = await ensureFreshSharedBaseline(`delayed-${reason}`);
        if (!refreshed) {
          console.warn(`Shared snapshot sync still blocked after refresh (${reason}).`);
          return null;
        }
      }
      return syncSharedSnapshot(reason, options);
    })().catch((error) => {
      console.warn(`Shared scorebook sync failed (${reason}).`, error);
    });
  }, 0);
}

function sharedRosterSyncUnavailableError() {
  if (!supabaseStorage?.isReady?.()) {
    return new Error("Supabase is not ready on this device, so the shared roster table was not updated.");
  }
  if (!supabaseAdminEmail) {
    return new Error("Admin sign-in is not active, so the shared roster table was not updated. Sign out and sign back in as an approved admin.");
  }
  return null;
}

async function syncSharedRosterChange(reason = "roster-change") {
  const unavailableError = sharedRosterSyncUnavailableError();
  if (unavailableError) return { data: null, error: unavailableError };
  const response = await syncSharedSnapshot(reason, { skipFreshBaselineCheck: true });
  if (!response) {
    return {
      data: null,
      error: new Error("The shared roster sync did not start. Refresh the page and sign in again before editing the roster.")
    };
  }
  if (response?.data?.rosterPlayersMissingTable) {
    return {
      data: response.data,
      error: new Error("The roster_players table is not available to the app yet. Run supabase-schema.sql in QA or refresh the Supabase API schema cache.")
    };
  }
  return response;
}

async function syncSharedRosterChangeOrAlert(reason = "roster-change") {
  const response = await syncSharedRosterChange(reason);
  if (response?.error) {
    console.warn(`Shared roster sync failed (${reason}).`, response.error);
    window.alert([
      response.error.message || "The shared roster table could not be updated.",
      "",
      "This roster change was saved locally on this device, but it did not reach Supabase. Refresh, sign in again as admin, and try the edit again before relying on QA."
    ].join("\n"));
  }
  return response;
}

async function seedSupabaseFromLocalIfEmpty() {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return null;
  const { data, error } = await supabaseStorage.fetchBootstrap();
  if (error) {
    console.warn("Unable to inspect Supabase before seeding.", error);
    return null;
  }
  if (!hasMeaningfulSupabaseSnapshot(data)) return syncSharedSnapshot("initial-seed");
  if (sharedRosterMissing(data)) return syncSharedSnapshot("recover-shared-roster");
  return data;
}

function markGameSyncPending(game) {
  if (!game) return;
  activeCompletedGameSyncs.delete(game.id);
  game.sync = normalizeGameSyncState(game.sync);
  if (game.sync.status === "syncing") return;
  game.sync.status = "pending";
  game.sync.lastError = "";
}

function markGameSyncStarted(game) {
  if (!game) return;
  activeCompletedGameSyncs.add(game.id);
  game.sync = normalizeGameSyncState(game.sync);
  game.sync.status = "syncing";
  game.sync.lastAttemptAt = new Date().toISOString();
  game.sync.lastError = "";
}

function markGameSyncSucceeded(game) {
  if (!game) return;
  activeCompletedGameSyncs.delete(game.id);
  game.sync = normalizeGameSyncState(game.sync);
  game.sync.status = "synced";
  game.sync.lastSyncedAt = new Date().toISOString();
  game.sync.lastAttemptAt = game.sync.lastSyncedAt;
  game.sync.lastError = "";
}

function markGameSyncFailed(game, error) {
  if (!game) return;
  activeCompletedGameSyncs.delete(game.id);
  game.sync = normalizeGameSyncState(game.sync);
  game.sync.status = "error";
  game.sync.lastAttemptAt = new Date().toISOString();
  game.sync.lastError = error?.message || String(error || "Unable to sync game.");
}

function buildCompletedGamePublishedState(sourceState, gameIds = []) {
  const ids = new Set((Array.isArray(gameIds) ? gameIds : [gameIds]).filter(Boolean));
  if (!ids.size) return deepClone(sourceState || {});
  const snapshotState = deepClone(sourceState || {});
  const timestamp = new Date().toISOString();
  snapshotState.games = (snapshotState.games || []).map((game) => {
    if (!ids.has(game?.id) || !gameIsFinal(game)) return game;
    return {
      ...game,
      sync: {
        ...normalizeGameSyncState(game.sync),
        status: "synced",
        lastSyncedAt: timestamp,
        lastAttemptAt: timestamp,
        lastError: ""
      }
    };
  });
  return snapshotState;
}

async function processCompletedGameSyncQueue(reason = "auto") {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  if (completedGameSyncQueuePromise) return completedGameSyncQueuePromise;
  completedGameSyncQueuePromise = (async () => {
    try {
      const queuedIds = queuedCompletedGameIds();
      if (!queuedIds.length) return null;
      const queuedGames = state.games.filter((game) => queuedIds.includes(game.id) && gameIsFinal(game));
      if (!queuedGames.length) {
        dequeueCompletedGameSync(queuedIds);
        saveStateWithOptions({ markLiveGamesDirty: false });
        render();
        return null;
      }

      queuedGames.forEach((game) => markGameSyncStarted(game));
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();

      const syncResponse = await syncSharedSnapshot(`completed-game-queue-${reason}`, {
        sourceState: buildCompletedGamePublishedState(state, queuedIds)
      });
      const error = syncResponse?.error || null;
      if (error) {
        updateCompletedGameSyncQueueAttempt(queuedIds, error);
        queuedGames.forEach((game) => markGameSyncFailed(game, error));
        saveStateWithOptions({ markLiveGamesDirty: false });
        render();
        return { data: null, error };
      }

      queuedGames.forEach((game) => markGameSyncSucceeded(game));
      dequeueCompletedGameSync(queuedIds);
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();
      return syncResponse;
    } finally {
      completedGameSyncQueuePromise = null;
    }
  })();
  return completedGameSyncQueuePromise;
}

function requestCompletedGameSyncRetry(reason = "auto") {
  if (!supabaseStorage?.isReady?.() || !supabaseAdminEmail) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!queuedCompletedGameIds().length) return;
  setTimeout(() => {
    processCompletedGameSyncQueue(reason).catch((error) => {
      console.warn(`Completed-game retry queue failed (${reason}).`, error);
    });
  }, 0);
}

function canSyncGame(game) {
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  return Boolean(
    game
    && gameIsFinal(game)
    && syncState.status !== "synced"
    && supabaseStorage?.isReady?.()
    && supabaseAdminEmail
    && typeof navigator !== "undefined"
    && navigator.onLine
  );
}

function completedGameSyncButtonLabel(syncState = {}) {
  if (syncState.status === "syncing") return "Syncing...";
  if (syncState.status === "synced") return "Synced";
  return "Sync Completed Game";
}

async function syncCompletedGame(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game || !gameIsFinal(game)) return null;
  if (!supabaseStorage?.isReady?.()) {
    window.alert("Supabase is not ready yet on this device.");
    return null;
  }
  if (!supabaseAdminEmail) {
    openAdminAuthModal("Sign in as an approved admin before syncing a completed game.");
    return null;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueCompletedGameSync(game.id);
    markGameSyncFailed(game, new Error("Device is offline."));
    saveStateWithOptions({ markLiveGamesDirty: false });
    render();
    return null;
  }

  queueCompletedGameSync(game.id);
  saveStateWithOptions({ markLiveGamesDirty: false });
  return processCompletedGameSyncQueue("manual");
}

function formatSyncTimestamp(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderLiveSyncStatus(game = activeScoreGame()) {
  if (!els.syncStatusText || !els.syncStatusRow || !els.syncGameBtn) return;
  const admin = isAdminMode();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  let message = "Local scoring is ready on this iPad.";

  if (!game) {
    message = "No active game is open right now.";
  } else if (!admin) {
    message = "Admin sign-in is required before you can publish a completed game.";
  } else if (!supabaseStorage?.isReady?.()) {
    message = "Supabase is still loading on this device.";
  } else if (!online) {
    message = "Offline - score the game here, then sync it after completion when you are back online.";
  } else if (!supabaseAdminEmail) {
    message = "Live scoring is saved on this device. Sign in as admin to sync resume checkpoints.";
  } else if (gameIsFinal(game)) {
    if (syncState.status === "syncing") {
      message = "Syncing this completed game to the shared site...";
    } else if (syncState.status === "synced" && syncState.lastSyncedAt) {
      message = `Completed game synced ${formatSyncTimestamp(syncState.lastSyncedAt)}.`;
    } else if (syncState.status === "error") {
      message = syncState.lastError
        ? `Sync failed: ${syncState.lastError}`
        : "Sync failed. Try again when the connection is stable.";
    } else {
      message = online
        ? "This completed game is ready to sync to the website."
        : "This completed game is saved here and ready to sync when you reconnect.";
    }
  } else {
    message = syncState.lastSyncedAt
      ? `Live scoring checkpoint synced ${formatSyncTimestamp(syncState.lastSyncedAt)}.`
      : "Live scoring is saved here and auto-syncing for resume.";
  }

  els.syncStatusText.textContent = message;
  els.syncStatusRow.hidden = false;
  const canShowSyncButton = Boolean(admin && game && gameIsFinal(game));
  const syncButtonLabel = completedGameSyncButtonLabel(syncState);
  els.syncGameBtn.hidden = !canShowSyncButton;
  els.syncGameBtn.disabled = !canShowSyncButton || !canSyncGame(game);
  els.syncGameBtn.textContent = syncButtonLabel;
}

function loadAccessMode() {
  if (indexAdminAccessEnabled()) return "admin";
  try {
    return window.localStorage?.getItem(ACCESS_MODE_STORAGE_KEY) === "admin" ? "admin" : "public";
  } catch (error) {
    console.warn("Unable to load access mode.", error);
    return "public";
  }
}

function saveAccessMode() {
  try {
    window.localStorage?.setItem(ACCESS_MODE_STORAGE_KEY, accessMode);
  } catch (error) {
    console.warn("Unable to save access mode.", error);
  }
}

function isProductionSiteHost(hostname = window.location?.hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  return host === "oakmontlions.com" || host === "www.oakmontlions.com";
}

function indexAdminAccessEnabled() {
  if (typeof window === "undefined") return false;
  const protocol = String(window.location?.protocol || "").toLowerCase();
  const host = String(window.location?.hostname || "").trim().toLowerCase();
  if (isProductionSiteHost(host)) return false;
  if (protocol === "file:") return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  return window.ScorebookSupabase?.environment === "qa";
}

function normalizeAccessMode(nextMode) {
  return nextMode === "admin" || indexAdminAccessEnabled() ? "admin" : "public";
}

function ensureIndexAdminAccess() {
  if (!indexAdminAccessEnabled()) return false;
  if (accessMode !== "admin") {
    accessMode = "admin";
    saveAccessMode();
  }
  return true;
}

function boxScoreReturnLabel(view = boxScoreReturnView) {
  if (view === "analysis") return "Archive";
  if (view === "archive") return "Archive";
  if (view === "games") return "Schedule";
  if (view === "home") return "Home";
  if (view === "scorebook") return "Scorebook";
  return "Archive";
}

function loadStoredAdminEmail() {
  try {
    return String(window.localStorage?.getItem(ADMIN_EMAIL_STORAGE_KEY) || "").trim().toLowerCase();
  } catch (error) {
    console.warn("Unable to load stored admin email.", error);
    return "";
  }
}

function saveStoredAdminEmail(email) {
  try {
    if (!email) {
      window.localStorage?.removeItem(ADMIN_EMAIL_STORAGE_KEY);
      return;
    }
    window.localStorage?.setItem(ADMIN_EMAIL_STORAGE_KEY, String(email).trim().toLowerCase());
  } catch (error) {
    console.warn("Unable to store admin email.", error);
  }
}

function restoreOfflineTrustedAdminMode() {
  const cachedAdminEmail = loadStoredAdminEmail();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!offline || !cachedAdminEmail || accessMode !== "admin") return false;
  supabaseAdminEmail = cachedAdminEmail;
  render();
  switchView(currentView);
  return true;
}

function isAdminMode() {
  return accessMode === "admin" || indexAdminAccessEnabled();
}

function canAccessView(view) {
  return isAdminMode() || PUBLIC_READ_VIEWS.has(view);
}

function visibleTabViews() {
  return isAdminMode() ? ADMIN_TAB_VIEWS : PUBLIC_TAB_VIEWS;
}

function browserRoutingEnabled() {
  if (typeof window === "undefined" || !window.history?.pushState) return false;
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function deploymentBasePath(locationObject = window.location) {
  if (!locationObject) return "";
  const host = String(locationObject.hostname || "").toLowerCase();
  if (!host.endsWith(".github.io")) return "";
  const rawPath = String(locationObject.pathname || "/").split("?")[0].split("#")[0];
  const firstSegment = rawPath.split("/").filter(Boolean)[0] || "";
  if (!firstSegment) return "";
  if (ROUTE_VIEW_ALIASES[`/${firstSegment.toLowerCase()}`]) return "";
  return `/${firstSegment}`;
}

function normalizeRoutePath(path = "") {
  let normalized = String(path || "/").trim();
  if (!normalized) return "/";
  try {
    normalized = decodeURIComponent(normalized);
  } catch (error) {
    // Keep the raw path if a copied URL contains a malformed escape sequence.
  }
  normalized = normalized.split("?")[0].split("#")[0].replace(/\/+/g, "/");
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/index.html")) {
    normalized = normalized.slice(0, -"/index.html".length) || "/";
  }
  return normalized.toLowerCase() || "/";
}

function routePathWithoutBase(path = "", locationObject = window.location) {
  const normalizedPath = normalizeRoutePath(path);
  const base = normalizeRoutePath(deploymentBasePath(locationObject));
  if (base === "/" || !base) return normalizedPath;
  if (normalizedPath === base) return "/";
  if (normalizedPath.startsWith(`${base}/`)) {
    return normalizeRoutePath(normalizedPath.slice(base.length) || "/");
  }
  return normalizedPath;
}

function routeViewFromLocation(locationObject = window.location) {
  if (!locationObject) return "home";
  const params = new URLSearchParams(locationObject.search || "");
  const routedPath = params.get("route") || "";
  const hashPath = String(locationObject.hash || "").replace(/^#\/?/, "");
  const path = routedPath || (hashPath ? `/${hashPath}` : locationObject.pathname || "/");
  return ROUTE_VIEW_ALIASES[routePathWithoutBase(path, locationObject)] || "home";
}

function updateBrowserRouteForView(view, options = {}) {
  if (!browserRoutingEnabled()) return;
  const route = VIEW_ROUTES[view];
  if (!route) return;
  const currentRoute = routePathWithoutBase(window.location.pathname || "/", window.location);
  const currentParams = new URLSearchParams(window.location.search || "");
  const routeParam = currentParams.get("route");
  if (!routeParam && currentRoute === normalizeRoutePath(route)) return;
  const method = options.replace ? "replaceState" : "pushState";
  const base = deploymentBasePath(window.location);
  const routedUrl = `${base}${route}` || "/";
  try {
    window.history[method]({ view }, "", routedUrl || "/");
  } catch (error) {
    console.warn("Unable to update browser route.", error);
  }
}

function openAdminAuthModal(message = "Sign in with your Supabase admin account to unlock scoring and editing.") {
  if (!els.adminAuthModal) return;
  if (els.adminAuthMessage) els.adminAuthMessage.textContent = message;
  if (els.adminAuthModeLabel) {
    els.adminAuthModeLabel.textContent = isAdminMode()
      ? `Admin tools are unlocked${supabaseAdminEmail ? ` for ${supabaseAdminEmail}` : ""}.`
      : "Public view is read-only until an approved admin signs in.";
  }
  els.adminAuthModal.hidden = false;
  if (els.adminEmailInput) {
    els.adminEmailInput.value = supabaseAdminEmail || "";
  }
  if (els.adminPasswordInput) {
    els.adminPasswordInput.value = "";
  }
  setTimeout(() => {
    if (els.adminEmailInput && !els.adminEmailInput.value) els.adminEmailInput.focus();
    else els.adminPasswordInput?.focus();
  }, 0);
}

function setAdminAuthBusy(busy, label = "Sign In") {
  if (els.adminEmailInput) els.adminEmailInput.disabled = busy;
  if (els.adminPasswordInput) els.adminPasswordInput.disabled = busy;
  if (els.adminAuthCancelBtn) els.adminAuthCancelBtn.disabled = busy;
  if (els.adminAuthSubmitBtn) {
    els.adminAuthSubmitBtn.disabled = busy;
    els.adminAuthSubmitBtn.textContent = busy ? "Signing In..." : label;
  }
}

function closeAdminAuthModal() {
  if (!els.adminAuthModal) return;
  els.adminAuthModal.hidden = true;
  if (els.adminEmailInput) els.adminEmailInput.value = supabaseAdminEmail || "";
  if (els.adminPasswordInput) els.adminPasswordInput.value = "";
  setAdminAuthBusy(false);
}

function requireAdminAccess(message = "Admin sign-in required.") {
  if (isAdminMode()) return true;
  openAdminAuthModal(message);
  return false;
}

function setAccessMode(nextMode) {
  accessMode = normalizeAccessMode(nextMode);
  saveAccessMode();
  if (!canAccessView(currentView)) currentView = "home";
  closeAdminAuthModal();
  render();
  switchView(currentView);
}

async function applySupabaseAdminState(user, options = {}) {
  const { allowSeed = false, preserveModal = false, allowOfflineCache = false } = options;
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();
  const cachedAdminEmail = loadStoredAdminEmail();
  if (!normalizedEmail) {
    supabaseAdminEmail = "";
    siteVisitSummary = null;
    siteVisitSummaryState = "idle";
    siteVisitSummaryLoadedAt = 0;
    saveStoredAdminEmail("");
    if (ensureIndexAdminAccess()) {
      if (preserveModal) closeAdminAuthModal();
      render();
      switchView(currentView);
      return true;
    }
    if (accessMode !== "public") {
      if (preserveModal) {
        accessMode = "public";
        saveAccessMode();
        render();
        switchView(currentView);
      } else {
        setAccessMode("public");
      }
    } else {
      renderAccessMode();
    }
    return false;
  }
  const canUseOfflineCache = allowOfflineCache && !navigator.onLine && cachedAdminEmail && cachedAdminEmail === normalizedEmail;
  if (canUseOfflineCache) {
    supabaseAdminEmail = normalizedEmail;
    const destination = pendingAdminView && canAccessView("home") ? pendingAdminView : currentView;
    pendingAdminView = "";
    if (preserveModal) {
      accessMode = "admin";
      saveAccessMode();
      closeAdminAuthModal();
      render();
      if (destination && destination !== currentView) switchView(destination);
      else switchView(currentView);
    } else {
      setAccessMode("admin");
      if (destination && destination !== currentView) switchView(destination);
    }
    return true;
  }
  const { data: isAdmin, error } = await supabaseStorage.isAdminEmail(normalizedEmail);
  if (error) {
    console.warn("Unable to verify Supabase admin access.", error);
    if (allowOfflineCache && cachedAdminEmail && cachedAdminEmail === normalizedEmail) {
      supabaseAdminEmail = normalizedEmail;
      const destination = pendingAdminView && canAccessView("home") ? pendingAdminView : currentView;
      pendingAdminView = "";
      if (preserveModal) {
        accessMode = "admin";
        saveAccessMode();
        closeAdminAuthModal();
        render();
        if (destination && destination !== currentView) switchView(destination);
        else switchView(currentView);
      } else {
        setAccessMode("admin");
        if (destination && destination !== currentView) switchView(destination);
      }
      return true;
    }
    if (els.adminAuthMessage) els.adminAuthMessage.textContent = "Sign-in worked, but admin access could not be verified yet.";
    supabaseAdminEmail = "";
    saveStoredAdminEmail("");
    if (preserveModal) {
      accessMode = "public";
      saveAccessMode();
      render();
      switchView(currentView);
    } else {
      setAccessMode("public");
    }
    return false;
  }
  if (!isAdmin) {
    supabaseAdminEmail = "";
    saveStoredAdminEmail("");
    if (els.adminAuthMessage) els.adminAuthMessage.textContent = "This account is signed in, but it is not listed as a Scorebook admin.";
    if (preserveModal) {
      accessMode = "public";
      saveAccessMode();
      render();
      switchView(currentView);
    } else {
      setAccessMode("public");
    }
    return false;
  }

  supabaseAdminEmail = normalizedEmail;
  saveStoredAdminEmail(normalizedEmail);
  const destination = pendingAdminView && canAccessView("home") ? pendingAdminView : currentView;
  pendingAdminView = "";
  if (preserveModal) {
    accessMode = "admin";
    saveAccessMode();
    closeAdminAuthModal();
    render();
    if (destination && destination !== currentView) switchView(destination);
    else switchView(currentView);
  } else {
    setAccessMode("admin");
    if (destination && destination !== currentView) switchView(destination);
  }
  if (allowSeed) {
    seedSupabaseFromLocalIfEmpty().catch((seedError) => {
      console.warn("Unable to seed Supabase from local scorebook data.", seedError);
    });
  }
  requestLiveGameSnapshotSync("admin-ready-live-game");
  requestCompletedGameSyncRetry("admin-ready");
  requestLifecycleSupabaseRefresh("admin-ready", { force: true, skipWhenHidden: false });
  recordSiteVisitOnce("admin-ready", { force: true });
  requestSiteVisitSummaryRefresh("admin-ready", { force: true });
  return true;
}

async function submitAdminCredentials() {
  const client = supabaseStorage?.getClient?.();
  if (!client) {
    if (els.adminAuthMessage) els.adminAuthMessage.textContent = "Supabase is not ready yet, so admin sign-in is unavailable.";
    return;
  }
  const email = String(els.adminEmailInput?.value || "").trim().toLowerCase();
  const password = els.adminPasswordInput?.value || "";
  if (!email || !password) {
    if (els.adminAuthMessage) els.adminAuthMessage.textContent = "Enter both your admin email and password.";
    if (!email) els.adminEmailInput?.focus();
    else els.adminPasswordInput?.focus();
    return;
  }
  setAdminAuthBusy(true);
  if (els.adminAuthMessage) els.adminAuthMessage.textContent = "Signing in...";
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      if (els.adminAuthMessage) els.adminAuthMessage.textContent = error?.message || "Sign-in failed. Check your email and password.";
      els.adminPasswordInput?.focus();
      els.adminPasswordInput?.select();
      return;
    }
    const granted = await applySupabaseAdminState(data.user, { allowSeed: false, preserveModal: true, allowOfflineCache: true });
    if (granted && els.adminAuthMessage && !els.adminAuthModal?.hidden) els.adminAuthMessage.textContent = `Signed in as ${data.user.email}.`;
  } catch (error) {
    console.warn("Admin sign-in failed.", error);
    if (els.adminAuthMessage) els.adminAuthMessage.textContent = error?.message || "Sign-in failed. Try again.";
    els.adminPasswordInput?.focus();
    els.adminPasswordInput?.select();
  } finally {
    setAdminAuthBusy(false);
  }
}

async function signOutAdmin() {
  const client = supabaseStorage?.getClient?.();
  pendingAdminView = "";
  try {
    if (client) {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) console.warn("Supabase sign-out failed.", error);
    }
  } catch (error) {
    console.warn("Supabase sign-out failed.", error);
  } finally {
    supabaseAdminEmail = "";
    siteVisitSummary = null;
    siteVisitSummaryState = "idle";
    siteVisitSummaryLoadedAt = 0;
    saveStoredAdminEmail("");
    setAccessMode("public");
  }
}

async function initializeSupabaseAuth() {
  ensureIndexAdminAccess();
  const client = supabaseStorage?.getClient?.();
  if (!client) {
    if (indexAdminAccessEnabled()) {
      render();
      switchView(currentView);
    }
    return;
  }
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === "SIGNED_OUT") {
        applySupabaseAdminState(null).catch((error) => console.warn("Unable to reset admin mode after sign-out.", error));
        return;
      }
      if (session?.user) {
        applySupabaseAdminState(session.user, { allowSeed: false, allowOfflineCache: true })
          .catch((error) => console.warn("Unable to refresh Supabase admin state.", error));
      }
    }, 0);
  });
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn("Unable to fetch the current Supabase session.", error);
      return;
    }
    const sessionUser = data?.session?.user || null;
    if (sessionUser) {
      await applySupabaseAdminState(sessionUser, { allowSeed: false, allowOfflineCache: true });
    } else if (ensureIndexAdminAccess()) {
      console.info("Using non-production index admin access.");
      render();
      switchView(currentView);
    } else if (restoreOfflineTrustedAdminMode()) {
      console.info("Restored trusted admin mode for offline PWA use.");
    } else if (accessMode !== "public") {
      setAccessMode("public");
    }
  } catch (error) {
    console.warn("Unable to initialize Supabase auth state.", error);
  }
}

function renderAccessMode() {
  const admin = isAdminMode();
  const indexAdmin = indexAdminAccessEnabled();
  document.body.dataset.accessMode = admin ? "admin" : "public";
  if (els.accessModeBadge) els.accessModeBadge.textContent = admin ? (indexAdmin ? "QA Admin" : "Admin Mode") : "Public View";
  if (els.adminUnlockBtn) els.adminUnlockBtn.hidden = isAdminMode();
  if (els.adminLockBtn) els.adminLockBtn.hidden = !isAdminMode();
  if (els.accountMenuBtn) {
    els.accountMenuBtn.dataset.admin = admin ? "true" : "false";
    els.accountMenuBtn.setAttribute("aria-label", admin ? (indexAdmin ? "QA admin access active" : "Exit admin mode") : "Admin sign in");
    els.accountMenuBtn.title = admin ? (indexAdmin ? "QA admin access active" : "Exit admin mode") : "Admin sign in";
  }
  if (els.boxScoreBackBtn) els.boxScoreBackBtn.textContent = `Back to ${boxScoreReturnLabel()}`;
  if (els.boxScoreMobileReturnBtn) els.boxScoreMobileReturnBtn.textContent = boxScoreReturnLabel();
  if (els.tabs?.length) {
    const allowedTabs = visibleTabViews();
    els.tabs.forEach((tab) => {
      const visible = allowedTabs.has(tab.dataset.view);
      tab.hidden = !visible;
    });
  }
  if (els.mobileBottomNavTabs?.length) {
    const allowedTabs = visibleTabViews();
    els.mobileBottomNavTabs.forEach((tab) => {
      const visible = allowedTabs.has(tab.dataset.view);
      tab.hidden = !visible;
      tab.classList.toggle("is-active", visible && tab.dataset.view === currentView);
    });
  }
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  els.mobileBottomNavTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });
  window.addEventListener("popstate", () => {
    switchView(routeViewFromLocation(), { updateRoute: false });
  });
  els.accountMenuBtn?.addEventListener("click", () => {
    if (!isAdminMode()) {
      openAdminAuthModal();
      return;
    }
    if (indexAdminAccessEnabled()) {
      window.alert("QA/local index admin access is always on for this build.");
      return;
    }
    if (window.confirm("Exit Admin Mode? You can sign back in any time from the account icon.")) {
      signOutAdmin();
    }
  });
  els.adminUnlockBtn?.addEventListener("click", () => openAdminAuthModal());
  els.adminLockBtn?.addEventListener("click", signOutAdmin);
  els.adminAuthCancelBtn?.addEventListener("click", closeAdminAuthModal);
  els.adminAuthSubmitBtn?.addEventListener("click", submitAdminCredentials);
  [els.adminEmailInput, els.adminPasswordInput].filter(Boolean).forEach((input) => input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitAdminCredentials();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAdminAuthModal();
    }
  }));
  els.adminAuthModal?.addEventListener("click", (event) => {
    if (event.target === els.adminAuthModal) closeAdminAuthModal();
  });
  els.homeScoreGameBtn?.addEventListener("click", openCurrentGameForScoring);
  els.homeStartGameBtn?.addEventListener("click", startNextGameFromHome);
  els.homeNextGameScoreBtn?.addEventListener("click", handleHomeNextGameScoreAction);
  els.homeGamesBtn?.addEventListener("click", () => switchView("games"));
  els.homeNextGameScheduleLink?.addEventListener("click", () => switchView("games"));
  els.homeScoutingBtn?.addEventListener("click", openNextGameScouting);
  els.homeBattingLeadersLink?.addEventListener("click", () => switchView("stats"));
  els.homePitchingLeadersLink?.addEventListener("click", () => switchView("stats"));
  els.homeTeamNewsLink?.addEventListener("click", () => {
    selectedNewsArticleId = "";
    newsLayoutMode = "latest";
    renderTeamNews();
    switchView("news");
  });
  els.homeRecentResultBody?.addEventListener("click", (event) => {
    const scrollButton = event.target.closest("[data-home-results-scroll]");
    if (scrollButton) {
      const direction = scrollButton.dataset.homeResultsScroll === "next" ? 1 : -1;
      scrollHomeResultsCarousel(direction);
      return;
    }
    if (event.target.closest("[data-game-action]")) {
      handleGameActionClick(event);
      return;
    }
    const button = event.target.closest("[data-home-box-score-game]");
    if (!button) return;
    openBoxScore(button.dataset.homeBoxScoreGame);
  });
  els.homeRecentResultBody?.addEventListener("scroll", (event) => {
    if (event.target?.classList?.contains("home-results-carousel-track")) {
      updateHomeResultsCarouselButtons();
    }
  }, true);
  els.homeTeamNewsBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-news-id]");
    if (!button) return;
    selectedNewsArticleId = button.dataset.homeNewsId || "";
    newsLayoutMode = "article";
    renderTeamNews();
    switchView("news");
  });
  els.newsCategoryFilters?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-news-category]");
    if (!button) return;
    newsCategoryFilter = button.dataset.newsCategory || "all";
    selectedNewsArticleId = "";
    newsLayoutMode = "latest";
    if (els.newsFeaturedStory) els.newsFeaturedStory.scrollIntoView({ behavior: "smooth", block: "start" });
    renderTeamNews();
  });
  els.newsArticleList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-news-read]");
    if (!button) return;
    selectedNewsArticleId = button.dataset.newsRead || "";
    newsLayoutMode = "article";
    renderTeamNews();
    els.newsFeaturedStory?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.highlightFilterChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-highlight-filter]");
    if (!button) return;
    highlightCategoryFilter = button.dataset.highlightFilter || "all";
    renderHighlightsPage();
  });
  els.highlightSearchInput?.addEventListener("input", () => {
    highlightSearchQuery = els.highlightSearchInput.value || "";
    renderHighlightsPage();
  });
  els.publicHighlightsGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-highlight-feature]");
    if (!button) return;
    selectedFeaturedHighlightId = button.dataset.highlightFeature || "";
    renderHighlightsPage();
    els.publicHighlightFeatured?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.newsEditorForm?.addEventListener("submit", saveNewsArticle);
  els.newsEditorResetBtn?.addEventListener("click", resetNewsEditorForm);
  els.newsGenerateFromGameBtn?.addEventListener("click", generateNewsFromSelectedGame);
  els.newsEditorImageInput?.addEventListener("change", handleNewsImageUpload);
  els.newsEditorForm?.addEventListener("click", (event) => {
    const commandButton = event.target.closest("[data-news-command]");
    if (!commandButton) return;
    applyNewsEditorCommand(commandButton.dataset.newsCommand);
  });
  els.newsEditorList?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-news-edit]");
    if (editButton) {
      editNewsArticle(editButton.dataset.newsEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-news-delete]");
    if (deleteButton) {
      deleteNewsArticle(deleteButton.dataset.newsDelete);
    }
  });
  els.homeUpcomingGames?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-scout-opponent]");
    if (!button) return;
    openScoutingForOpponent(button.dataset.homeScoutOpponent);
  });
  els.homePastGames?.addEventListener("click", handleGameActionClick);
  els.scorebookGameSelect.addEventListener("change", () => {
    scorebookGameId = els.scorebookGameSelect.value;
    renderTraditionalScorebook();
  });
  els.boxScoreGameSelect?.addEventListener("change", () => {
    boxScoreGameId = els.boxScoreGameSelect.value;
    renderBoxScore();
  });
  els.boxScoreMobileGameSelect?.addEventListener("change", () => {
    boxScoreGameId = els.boxScoreMobileGameSelect.value;
    renderBoxScore();
  });
  els.boxScorePrevGameBtn?.addEventListener("click", () => navigateBoxScoreGame("previous"));
  els.boxScoreNextGameBtn?.addEventListener("click", () => navigateBoxScoreGame("next"));
  els.boxScoreMobilePrevGameBtn?.addEventListener("click", () => navigateBoxScoreGame("previous"));
  els.boxScoreMobileNextGameBtn?.addEventListener("click", () => navigateBoxScoreGame("next"));
  els.boxScoreBackBtn?.addEventListener("click", () => switchView(boxScoreReturnView || (isAdminMode() ? "analysis" : "games")));
  els.boxScoreMobileBackBtn?.addEventListener("click", () => switchView(boxScoreReturnView || (isAdminMode() ? "analysis" : "games")));
  els.boxScoreMobileReturnBtn?.addEventListener("click", () => switchView(boxScoreReturnView || (isAdminMode() ? "analysis" : "games")));
  els.boxScoreEditBtn?.addEventListener("click", openBoxScoreEditModal);
  els.boxScoreMobileEditBtn?.addEventListener("click", openBoxScoreEditModal);
  els.boxScoreMobileShareBtn?.addEventListener("click", () => {
    shareBoxScoreGame().catch((error) => console.warn("Box score share failed.", error));
  });
  els.boxScoreMobileStatsBtn?.addEventListener("click", () => {
    if (!boxScoreGameId) return;
    openGameStats(boxScoreGameId);
  });
  els.boxScoreTeamTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-box-score-team]");
    if (!button) return;
    boxScoreTeam = button.dataset.boxScoreTeam || "lions";
    renderBoxScore();
  });
  els.gameBreakdown?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-box-score-game]");
    if (!button) return;
    openBoxScore(button.dataset.boxScoreGame);
  });

  els.scoreForm.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  els.scoringStepPanel.addEventListener("click", handleScoringPanelClick);
  els.scoringStepPanel.addEventListener("pointerdown", handleActionFeedbackPointerDown);
  els.scoringStepPanel.addEventListener("pointerdown", handleScoringStepPointerDown);
  els.scoringStepPanel.addEventListener("pointerup", handleScoringPanelPointerUpAction);
  els.scoringStepPanel.addEventListener("pointerup", handleScoringStepPointerUp);
  els.scoringStepPanel.addEventListener("pointercancel", clearScoringStepHold);
  els.scoringStepPanel.addEventListener("pointerleave", clearScoringStepHold);
  els.panelUndoPitchBtn.addEventListener("click", (event) => {
    triggerActionFeedback(actionFeedbackForButton(event.currentTarget), event.currentTarget);
    undoPitch();
  });
  els.openGameActionsBtn?.addEventListener("click", openGameActionsModal);
  els.dockUndoLastPlayBtn?.addEventListener("click", (event) => {
    triggerActionFeedback(actionFeedbackForButton(event.currentTarget), event.currentTarget);
    undoLastPlay();
  });
  els.dockChangePitcherBtn?.addEventListener("click", openPitcherSelectModal);
  els.dockOpponentLineupBtn?.addEventListener("click", openOpponentLineupFocusModal);
  els.dockViewScorebookBtn?.addEventListener("click", () => {
    const game = activeGame();
    if (!game?.id) return;
    openGameScorebook(game.id);
  });
  els.dockViewLineupBtn?.addEventListener("click", openLineupFocusModal);
  els.closeLineupFocusBtn?.addEventListener("click", closeLineupFocusModal);
  els.closeGameActionsBtn?.addEventListener("click", closeGameActionsModal);
  els.lineupFocusModal?.addEventListener("click", (event) => {
    if (event.target === els.lineupFocusModal) closeLineupFocusModal();
  });
  els.gameActionsModal?.addEventListener("click", (event) => {
    if (event.target === els.gameActionsModal) closeGameActionsModal();
  });
  els.closePitcherSelectBtn?.addEventListener("click", closePitcherSelectModal);
  els.pitcherSelectModal?.addEventListener("click", (event) => {
    if (event.target === els.pitcherSelectModal) closePitcherSelectModal();
  });
  els.pitcherSelectModal?.addEventListener("keydown", handlePitcherSelectModalKeydown);
  els.pitcherSelectList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pitcher-select-id]");
    if (!button || button.disabled) return;
    changeActivePitcher(button.dataset.pitcherSelectId);
  });
  els.gameActionsSyncBtn?.addEventListener("click", () => {
    const game = activeGame();
    if (!game?.id || !gameIsFinal(game)) return;
    syncCompletedGame(game.id).catch((error) => {
      markGameSyncFailed(game, error);
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();
    });
    closeGameActionsModal();
  });
  els.gameActionsEndHalfBtn?.addEventListener("click", () => {
    const game = activeGame();
    if (!game || gameIsScoreLocked(game)) return;
    advanceHalfInning(game);
    saveState();
    render();
    closeGameActionsModal();
  });
  els.gameActionsCompleteBtn?.addEventListener("click", () => {
    closeGameActionsModal();
    finishGame();
  });
  els.gameActionsPostponeBtn?.addEventListener("click", () => {
    postponeActiveGame();
  });
  els.gameActionsRestartBtn?.addEventListener("click", () => {
    restartActiveGame();
  });
  els.dismissLineupPreviewBtn?.addEventListener("click", () => dismissLineupPreview(activeGame()));
  els.dismissBatterIntroBtn?.addEventListener("click", () => dismissBatterIntro(activeGame(), { rerender: true }));

  els.gameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    scheduleGame();
  });
  els.scheduleGameBtn.addEventListener("click", showGameCreateForm);
  els.cancelGameCreateBtn?.addEventListener("click", hideGameCreateForm);
  els.scheduleCalendarLink?.addEventListener("click", openScheduleCalendar);
  els.scheduleCalendarBackLink?.addEventListener("click", closeScheduleCalendar);
  els.scheduleCalendarTodayBtn?.addEventListener("click", () => {
    const months = scheduleCalendarMonthOptions(scheduleSeasonFilter);
    const todayMonth = todayValue().slice(0, 7);
    scheduleCalendarMonth = months.includes(todayMonth) ? todayMonth : (months[0] || todayMonth);
    renderGames();
  });
  els.scheduleCalendarPrevBtn?.addEventListener("click", () => {
    const months = scheduleCalendarMonthOptions(scheduleSeasonFilter);
    const currentIndex = months.indexOf(scheduleCalendarMonth);
    if (currentIndex > 0) scheduleCalendarMonth = months[currentIndex - 1];
    renderGames();
  });
  els.scheduleCalendarNextBtn?.addEventListener("click", () => {
    const months = scheduleCalendarMonthOptions(scheduleSeasonFilter);
    const currentIndex = months.indexOf(scheduleCalendarMonth);
    if (currentIndex >= 0 && currentIndex < months.length - 1) scheduleCalendarMonth = months[currentIndex + 1];
    renderGames();
  });
  els.scheduleCalendarMonthSelect?.addEventListener("change", (event) => {
    const nextMonth = monthKeyFromDateValue(event.target.value || "");
    if (!nextMonth) return;
    scheduleCalendarMonth = nextMonth;
    renderGames();
  });
  els.scheduleSeasonSelect?.addEventListener("change", (event) => {
    scheduleSeasonFilter = normalizeScheduleSeasonFilter(event.target.value);
    const nextSeasonMonths = scheduleCalendarMonthOptions(scheduleSeasonFilter);
    if (!nextSeasonMonths.some((monthKey) => monthKey === scheduleCalendarMonth)) {
      scheduleCalendarMonth = nextSeasonMonths[0] || `${scheduleSeasonFilter}-01`;
    }
    renderGames();
  });
  els.scheduleResultsArchiveLink?.addEventListener("click", () => switchView("archive"));
  els.scheduleResultsBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action]");
    if (!button) return;
    handleGameActionClick(event);
  });
  els.scheduleFeaturedBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action]");
    if (!button) return;
    handleGameActionClick(event);
  });
  els.scheduleUpcomingBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action]");
    if (!button) return;
    handleGameActionClick(event);
  });
  els.scheduleCalendarGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action]");
    if (!button) return;
    handleGameActionClick(event);
  });
  els.gamesGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action]");
    if (!button) return;
    const action = button.dataset.gameAction;
    if (["summary", "scorebook", "stats", "boxscore", "sync", "quick-score", "highlights"].includes(action)) {
      handleGameActionClick(event);
      return;
    }
    if (action === "score" || action === "start") scoreScheduledGame(button.dataset.gameId);
    if (action === "resume-postponed") resumePostponedGame(button.dataset.gameId);
    if (action === "complete") completeScheduledGame(button.dataset.gameId);
    if (action === "edit") openGameEditor(button.dataset.gameId);
    if (action === "postpone") postponeScheduledGame(button.dataset.gameId);
    if (action === "delete") removeScheduledGame(button.dataset.gameId);
  });
  els.gamesArchiveNote?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-action='archive']");
    if (button) switchView("archive");
  });
  els.gameFilterRow?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game-filter]");
    if (!button) return;
    gameFilter = button.dataset.gameFilter || "all";
    scheduleGamesLayout = "dashboard";
    renderGames();
  });

  els.closeGameEditBtn.addEventListener("click", () => {
    gameEditId = null;
    renderGameEditor();
  });

  els.saveGameEditBtn.addEventListener("click", saveGameEdits);
  els.editOpponentInput?.addEventListener("input", renderGameEditorPreview);
  els.editLionsSideInput?.addEventListener("change", renderGameEditorPreview);

  els.lineupBuilderRows?.addEventListener("change", (event) => {
    const row = event.target.closest("[data-lineup-entry]");
    if (!row) return;
    updateLineupEntry(row.dataset.lineupEntry, row.querySelector("[data-lineup-player]")?.value, row.querySelector("[data-lineup-role]")?.value);
  });

  els.lineupBuilderRows?.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-lineup-select-spot]");
    if (selectButton) {
      lineupBuilderSelectedEntryId = selectButton.dataset.lineupSelectSpot;
      renderLineupBuilder();
      return;
    }
    const removeButton = event.target.closest("[data-remove-lineup-entry]");
    if (removeButton) {
      removeLineupEntry(removeButton.dataset.removeLineupEntry);
      return;
    }
    const moveButton = event.target.closest("[data-lineup-move]");
    if (moveButton) {
      moveLineupEntry(moveButton.dataset.lineupEntry, moveButton.dataset.lineupMove);
      return;
    }
    const positionButton = event.target.closest("[data-lineup-focus-position]");
    if (positionButton) {
      const row = positionButton.closest("[data-lineup-entry]");
      row?.querySelector("[data-lineup-role]")?.focus();
      return;
    }
    const missingButton = event.target.closest("[data-lineup-missing-warning]");
    if (missingButton) {
      focusMissingLineupPosition(missingButton.dataset.lineupMissingWarning || "");
      return;
    }
    const row = event.target.closest("[data-lineup-entry]");
    if (row && !event.target.closest("button, select, input, textarea")) {
      lineupBuilderSelectedEntryId = row.dataset.lineupEntry;
      renderLineupBuilder();
    }
  });

  els.lineupBenchList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bench-player]");
    if (button) insertBenchPlayer(button.dataset.benchPlayer);
  });
  els.lineupReadyCheck?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lineup-missing-warning]");
    if (button) focusMissingLineupPosition(button.dataset.lineupMissingWarning || "");
  });
  els.lineupPitcherSelect?.addEventListener("change", updateLineupPitcher);
  els.addLineupSpotBtn?.addEventListener("click", addLineupEntry);
  els.resetGameLineupBtn?.addEventListener("click", resetBuilderLineup);
  els.useLastLineupBtn?.addEventListener("click", useLastLineup);
  els.lineupTemplatesBtn?.addEventListener("click", () => window.alert("Lineup templates are ready for a future save/load workflow."));
  els.addOpponentLineupBtn?.addEventListener("click", openOpponentLineupStep);
  els.addOpponentHitterBtn?.addEventListener("click", addPregameOpponentLineupHitter);
  els.importOpponentRosterBtn?.addEventListener("click", openOpponentRosterImport);
  els.opponentRosterSearch?.addEventListener("input", (event) => {
    opponentRosterSearchQuery = event.target.value || "";
    renderOpponentRosterImport();
  });
  els.opponentRosterList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-opponent-roster-player]");
    if (!button) return;
    addOpponentRosterPlayerToLineup(button.dataset.opponentRosterPlayer);
  });
  els.opponentLineupRows?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-opponent-pregame-index]");
    if (!input) return;
    setOpponentLineupActiveRow(Number(input.dataset.opponentPregameIndex));
    updatePregameOpponentLineupEntry(Number(input.dataset.opponentPregameIndex), {
      [input.dataset.opponentPregameField || "name"]: input.value
    });
  });
  els.opponentLineupRows?.addEventListener("focusin", (event) => {
    const input = event.target.closest("[data-opponent-pregame-index]");
    if (!input) return;
    setOpponentLineupActiveRow(Number(input.dataset.opponentPregameIndex));
  });
  els.opponentLineupRows?.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-opponent-pregame-index]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    const next = els.opponentLineupRows.querySelector(`[data-opponent-pregame-index="${Number(input.dataset.opponentPregameIndex) + 1}"]`);
    next?.focus();
  });
  els.backToLineupBuilderBtn?.addEventListener("click", backToLineupBuilderStep);
  els.startFromOpponentLineupBtn?.addEventListener("click", startGameFromOpponentLineupStep);
  els.cancelLineupBuilderBtn?.addEventListener("click", closeLineupBuilder);
  els.closeLineupBuilderBtn?.addEventListener("click", closeLineupBuilder);
  els.confirmLineupBtn?.addEventListener("click", confirmLineupAndStartGame);

  els.choiceButtons.forEach((button) => {
    button.addEventListener("pointerdown", handleActionFeedbackPointerDown);
    button.addEventListener("click", () => {
      const group = button.dataset.choiceGroup;
      const value = button.dataset.choiceValue;
      if (group === "result") {
        triggerActionFeedback(actionFeedbackForButton(button), button);
        if (battedBallResults.has(value)) {
          applyEvent(activeGame(), { type: "ball_in_play", outcome: value });
          return;
        }
        applyEvent(activeGame(), { type: "resolve_play", result: value });
        return;
      }
      selectChoice(group, value);
    });
  });

  els.runnerActionButtons.forEach((button) => {
    button.addEventListener("pointerdown", handleActionFeedbackPointerDown);
    button.addEventListener("click", () => {
      const game = activeGame();
      const base = selectedFieldRunnerBase;
      if (!base || !isOccupied(game.bases?.[base])) return;
      if (button.dataset.runnerAction === "non_runner") {
        triggerActionFeedback(actionFeedbackForButton(button), button);
        openNonRunnerSelect(base);
        return;
      }
      if (button.dataset.runnerAction === "pickoff") {
        triggerActionFeedback(actionFeedbackForButton(button), button);
        applyEvent(game, { type: "special_action", action: "pickoff", source: base, target: base });
        return;
      }
      triggerActionFeedback(actionFeedbackForButton(button), button);
      applyEvent(activeGame(), {
        type: "special_action",
        action: button.dataset.runnerAction,
        source: base,
        target: nextBaseForRunner(base)
      });
    });
  });

  els.runnerOutButtons.forEach((button) => {
    button.addEventListener("pointerdown", handleActionFeedbackPointerDown);
    button.addEventListener("click", () => {
      triggerActionFeedback(actionFeedbackForButton(button), button);
      applyEvent(activeGame(), { type: "runner_out", base: button.dataset.runnerOutBase });
    });
  });
  els.resolvePlayBtn?.addEventListener("pointerdown", handleActionFeedbackPointerDown);
  els.resolvePlayBtn?.addEventListener("click", () => {
    triggerActionFeedback(actionFeedbackForButton(els.resolvePlayBtn), els.resolvePlayBtn);
    applyEvent(activeGame(), { type: "resolve_play" });
  });

  els.opponentOutcomeButtons.forEach((button) => {
    button.addEventListener("pointerdown", handleActionFeedbackPointerDown);
    button.addEventListener("click", () => {
      triggerActionFeedback(actionFeedbackForButton(button), button);
      applyEvent(activeGame(), { type: "resolve_play", result: button.dataset.opponentResult });
    });
  });

  [els.opponentInput, els.gameLionsSideInput, els.gameDateInput, els.gameTimeInput, els.gameLocationInput, els.gameNotesInput]
    .filter(Boolean)
    .forEach((input) => {
      ["input", "change"].forEach((eventName) => input.addEventListener(eventName, () => {
        input.dataset.dirty = "true";
        if (input === els.opponentInput) renderGameSetupPreview();
      }));
    });

  els.scoreOpponentLineupInput.addEventListener("input", () => {
    updateOpponentLineup(els.scoreOpponentLineupInput.value);
  });

  els.liveLineup.addEventListener("blur", (event) => {
    const item = event.target.closest("[data-opponent-lineup-index]");
    if (!item) return;
    const index = Number(item.dataset.opponentLineupIndex);
    const field = item.dataset.opponentLineupField || "name";
    updateOpponentLineupEntry(index, { [field]: "value" in item ? item.value.trim() : item.textContent.trim() });
  }, true);

  els.liveLineup.addEventListener("keydown", (event) => {
    const item = event.target.closest("[data-opponent-lineup-index]");
    if (!item) return;
    if (event.key === "Enter") {
      event.preventDefault();
      item.blur();
    }
  });

  els.opponentMoveTypeSelect?.addEventListener("change", renderSubControls);
  els.applyOpponentMoveBtn?.addEventListener("click", applyOpponentLineupMove);

  els.pitcherSelect?.addEventListener("change", () => {
    const game = activeGame();
    if (gameIsScoreLocked(game)) return;
    game.pitcherId = els.pitcherSelect.value;
    saveState();
    renderAtBat();
  });

  els.pitchButtons.forEach((button) => {
    button.addEventListener("click", () => applyEvent(activeGame(), { type: "pitch", outcome: button.dataset.pitch }));
  });
  els.autoResultButtons.forEach((button) => {
    button.addEventListener("click", () => applyEvent(activeGame(), { type: "resolve_play", result: button.dataset.autoResult }));
  });

  els.resetCountBtn.addEventListener("click", () => {
    const game = activeGame();
    if (gameIsScoreLocked(game)) return;
    game.atBat = makeAtBat();
    const plateAppearance = getCurrentPlateAppearance(game, false);
    if (plateAppearance) plateAppearance.pitches = [];
    if (game.current) {
      game.current.balls = 0;
      game.current.strikes = 0;
    }
    clearPendingPlayState(game, true);
    resetBipChoices();
    saveState();
    renderAtBat();
    renderSprayChart();
    renderScoringStepPanel();
  });

  els.undoPitchBtn.addEventListener("click", undoPitch);
  els.resetOpponentCountBtn.addEventListener("click", () => {
    const game = activeGame();
    if (gameIsScoreLocked(game)) return;
    game.atBat = makeAtBat();
    const plateAppearance = getCurrentPlateAppearance(game, false);
    if (plateAppearance) plateAppearance.pitches = [];
    if (game.current) {
      game.current.balls = 0;
      game.current.strikes = 0;
    }
    saveState();
    renderAtBat();
    renderScoringStepPanel();
  });
  els.undoOpponentPitchBtn.addEventListener("click", undoPitch);
  els.undoOpponentPlayBtn?.addEventListener("click", undoLastPlay);
  els.clearBipBtn.addEventListener("click", () => {
    const game = activeGame();
    if (gameIsScoreLocked(game)) return;
    if (game.atBat) game.atBat.pendingInPlay = false;
    clearPendingPlayState(game, true);
    resetBipChoices();
    saveState();
    renderAtBat();
    renderSprayChart();
    renderScoringStepPanel();
  });
  els.scorerStack.addEventListener("pointerdown", setSprayFromPointer);
  els.sprayChart.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      applyEvent(activeGame(), { type: "spray", x: 50, y: 45 });
    }
  });
  els.sprayFilter.addEventListener("change", renderSprayChart);
  els.batterSelect.addEventListener("change", () => {
    renderBatterSelect();
  });
  els.resultSelect.addEventListener("change", suggestRunValues);
  els.newGameBtn?.addEventListener("click", () => switchView("games"));
  els.scoreEmptyHomeBtn?.addEventListener("click", () => switchView("home"));
  els.scoreEmptyGamesBtn?.addEventListener("click", () => switchView("games"));
  els.undoBtn.addEventListener("click", undoLastPlay);
  els.viewCurrentScorebookBtn?.addEventListener("click", () => {
    const game = activeGame();
    if (!game?.id) return;
    openGameScorebook(game.id);
  });
  els.syncGameBtn?.addEventListener("click", () => {
    const game = activeGame();
    syncCompletedGame(game?.id).catch((error) => {
      markGameSyncFailed(game, error);
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();
    });
  });
  els.endHalfBtn.addEventListener("click", () => {
    const game = activeGame();
    if (gameIsScoreLocked(game)) return;
    advanceHalfInning(game);
    saveState();
    render();
  });
  window.addEventListener("online", () => {
    render();
    recordSiteVisitOnce("online");
    requestSiteVisitSummaryRefresh("online", { force: true });
    requestCompletedGameSyncRetry("online");
    requestLiveGameSnapshotSync("online-live-game");
    requestLifecycleSupabaseRefresh("online", { skipWhenHidden: false });
  });
  window.addEventListener("offline", render);
  window.addEventListener("focus", () => {
    scheduleScoreGameRenderFlush("focus");
    if (isAdminMode()) requestSiteVisitSummaryRefresh("focus");
    requestLifecycleSupabaseRefresh("focus");
  });
window.addEventListener("pageshow", () => {
  scheduleScoreGameRenderFlush("pageshow");
  recordSiteVisitOnce("pageshow");
  requestLifecycleSupabaseRefresh("pageshow", { skipWhenHidden: false });
});

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleScoreGameRenderFlush("visibility");
      requestLifecycleSupabaseRefresh("visibility");
    }
  });
  els.finishGameBtn.addEventListener("click", finishGame);

  els.optimizeBtn.addEventListener("click", () => {
    optimizedIds = buildOptimizedLineup();
    renderOptimizedLineup();
  });

  els.applyOptimizedBtn.addEventListener("click", () => {
    if (!requireAdminAccess("Admin sign-in required to apply lineup changes.")) return;
    if (!optimizedIds.length) optimizedIds = buildOptimizedLineup();
    const game = activeGame();
    game.lineupEntries = makeLineupEntries(optimizedIds);
    game.lineups.away = deepClone(game.lineupEntries);
    game.batterIndex = 0;
    saveState();
    render();
    switchView("score");
  });

  els.addPlayerBtn.addEventListener("click", () => {
    resetPlayerForm();
    setRosterPlayerDetailsOpen(true);
    updatePlayerFormUi();
    els.playerName.focus();
  });
  els.playerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPlayer();
  });
  els.cancelPlayerEditBtn?.addEventListener("click", () => resetPlayerForm());
  els.rosterSearchInput?.addEventListener("input", () => {
    rosterSearchQuery = (els.rosterSearchInput.value || "").trim().toLowerCase();
    renderRoster();
  });
  els.rosterSearchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });

  els.rosterFilter.addEventListener("change", () => {
    rosterFilter = els.rosterFilter.value;
    renderRoster();
  });
  [els.rosterCardsViewBtn, els.rosterListViewBtn].forEach((button) => {
    button?.addEventListener("click", () => {
      rosterViewMode = button.dataset.rosterView || "cards";
      renderRoster();
    });
  });

  els.archiveSeasonSelect?.addEventListener("change", (event) => {
    archiveSeasonFilter = normalizeArchiveSeasonFilter(event.target.value);
    renderArchive();
  });
  els.statsSeasonSelect?.addEventListener("change", (event) => {
    statsSeasonFilter = normalizeStatsSeasonFilter(event.target.value);
    renderSeasonStats();
    renderLeaders();
    renderStatsSprayControls();
  });
  els.clearStatsFocusBtn?.addEventListener("click", () => {
    statsPlayerFocus = "all";
    statsMode = "hitting";
    desktopHitPlayerFilter = "all";
    desktopPitPlayerFilter = "all";
    mobileHitPlayerFilter = "all";
    mobilePitPlayerFilter = "all";
    mobileHitGameFilter = "all";
    mobilePitGameFilter = "all";
    renderSeasonStats();
    renderLeaders();
    renderStatsSprayControls();
  });
  els.statsModeTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stats-mode]");
    if (!button) return;
    const requestedMode = button.dataset.statsMode;
    if (!["hitting", "pitching"].includes(requestedMode)) return;
    statsMode = requestedMode;
    renderStatsMode();
    renderLeaders();
  });
  els.leadersGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scroll-target]");
    if (!button) return;
    const target = document.getElementById(button.dataset.scrollTarget || "");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.statsPlayerSpotlight?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-spotlight-player]");
    if (!button) return;
    focusStatsPlayerFromSpotlight(button.dataset.spotlightPlayer || "");
  });
  els.archiveGrid.addEventListener("click", handleGameActionClick);
  els.gameSummaryBody?.addEventListener("click", handleGameActionClick);
  els.closeGameSummaryBtn?.addEventListener("click", () => {
    gameSummaryId = "";
    renderGameSummary();
  });
  els.applySubBtn.addEventListener("click", applySubstitution);
  els.subSpotSelect?.addEventListener("change", renderSubControls);
  els.subTypeSelect?.addEventListener("change", renderSubControls);
  els.subPlayerSelect?.addEventListener("change", renderSubControls);
  els.statsSprayPlayerSelect.addEventListener("change", renderStatsSprayChart);
  els.statsSprayGameSelect.addEventListener("change", renderStatsSprayChart);
  els.toggleStatsSprayBtn.addEventListener("click", () => {
    statsSprayExpanded = !statsSprayExpanded;
    renderStatsSprayControls();
  });
  els.closeStatsSprayBtn?.addEventListener("click", () => {
    statsSprayExpanded = false;
    renderStatsSprayControls();
  });
  els.statsSprayModal?.addEventListener("click", (event) => {
    if (event.target !== els.statsSprayModal) return;
    statsSprayExpanded = false;
    renderStatsSprayControls();
  });
  els.hittingStatsBody?.addEventListener("click", handleHittingStatsEditClick);
  els.mobileHittingStatsList?.addEventListener("click", handleHittingStatsEditClick);
  els.pitchingStatsBody?.addEventListener("click", handlePitchingStatsEditClick);
  els.mobilePitchingStatsList?.addEventListener("click", handlePitchingStatsEditClick);
  els.bulkStatEditBtn?.addEventListener("click", openBulkStatEditModal);
  els.bulkStatEditCloseBtn?.addEventListener("click", closeBulkStatEditModal);
  els.bulkStatEditCancelBtn?.addEventListener("click", closeBulkStatEditModal);
  els.bulkStatEditModal?.addEventListener("click", (event) => {
    if (event.target === els.bulkStatEditModal) closeBulkStatEditModal();
  });
  els.bulkStatEditGameSelect?.addEventListener("change", (event) => {
    bulkStatEditGameId = event.target.value || "";
    renderBulkStatEditModal();
  });
  els.bulkStatEditModeTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk-stat-mode]");
    if (!button) return;
    bulkStatEditMode = button.dataset.bulkStatMode === "pitching" ? "pitching" : "hitting";
    renderBulkStatEditModal();
  });
  els.bulkStatEditForm?.addEventListener("submit", saveBulkStatEditGameStats);
  els.bulkStatEditBody?.addEventListener("click", handleBulkStatEditBodyClick);
  els.closeStatEditGameSelectBtn?.addEventListener("click", closeStatEditGameSelectModal);
  els.statEditGameSelectModal?.addEventListener("click", (event) => {
    if (event.target === els.statEditGameSelectModal) closeStatEditGameSelectModal();
  });
  els.statEditGameSelectList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stat-edit-game-id]");
    if (!button) return;
    openStatEditGameModal(statEditPlayerId, button.dataset.statEditGameId);
  });
  els.closeStatEditGameBtn?.addEventListener("click", closeStatEditGameModal);
  els.cancelStatEditGameBtn?.addEventListener("click", closeStatEditGameModal);
  els.clearStatEditGameBtn?.addEventListener("click", clearStatEditGameStats);
  els.statEditGameModal?.addEventListener("click", (event) => {
    if (event.target === els.statEditGameModal) closeStatEditGameModal();
  });
  els.statEditGameForm?.addEventListener("submit", saveStatEditGameStats);
  els.closePitchingStatEditGameSelectBtn?.addEventListener("click", closePitchingStatEditGameSelectModal);
  els.pitchingStatEditGameSelectModal?.addEventListener("click", (event) => {
    if (event.target === els.pitchingStatEditGameSelectModal) closePitchingStatEditGameSelectModal();
  });
  els.pitchingStatEditGameSelectList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-pitching-stat-edit-game-id]");
    if (!button) return;
    openPitchingStatEditGameModal(pitchingStatEditPlayerId, button.dataset.pitchingStatEditGameId);
  });
  els.closePitchingStatEditGameBtn?.addEventListener("click", closePitchingStatEditGameModal);
  els.cancelPitchingStatEditGameBtn?.addEventListener("click", closePitchingStatEditGameModal);
  els.pitchingStatEditGameModal?.addEventListener("click", (event) => {
    if (event.target === els.pitchingStatEditGameModal) closePitchingStatEditGameModal();
  });
  els.pitchingStatEditGameForm?.addEventListener("submit", savePitchingStatEditGameStats);
  els.quickScoreForm?.addEventListener("submit", saveQuickScoreResult);
  els.quickScoreCancelBtn?.addEventListener("click", closeQuickScoreModal);
  els.quickScoreCloseBtn?.addEventListener("click", closeQuickScoreModal);
  els.quickScoreModal?.addEventListener("click", (event) => {
    if (event.target === els.quickScoreModal) closeQuickScoreModal();
  });
  els.boxScoreEditForm?.addEventListener("submit", saveBoxScoreEdit);
  els.boxScoreEditCancelBtn?.addEventListener("click", closeBoxScoreEditModal);
  els.boxScoreEditCloseBtn?.addEventListener("click", closeBoxScoreEditModal);
  els.boxScoreEditModal?.addEventListener("click", (event) => {
    if (event.target === els.boxScoreEditModal) closeBoxScoreEditModal();
  });
  els.statEditSprayModeButtons?.forEach((button) => {
    button.addEventListener("click", () => setStatEditSprayMode(button.dataset.statEditSprayMode));
  });
  els.statEditSprayChart?.addEventListener("pointerdown", addStatEditSprayFromPointer);
  els.statEditSprayChart?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    addStatEditSprayAt(50, 45);
  });
  els.statEditSprayList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stat-edit-spray-remove]");
    if (!button) return;
    removeStatEditSpray(button.dataset.statEditSprayRemove);
  });
  els.scoutingTeamSelect.addEventListener("change", () => {
    selectedScoutingTeamId = els.scoutingTeamSelect.value;
    renderScoutingReport();
    refreshScoutingData({ silent: true });
  });
  els.refreshScoutingBtn.addEventListener("click", () => refreshScoutingData());
  els.refreshLeagueStandingsBtn?.addEventListener("click", () => refreshScoutingData({ force: true }));
  document.querySelectorAll("[data-hit-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.hitSort;
      hittingSort = {
        key,
        direction: hittingSort.key === key && hittingSort.direction === "desc" ? "asc" : "desc"
      };
      renderSeasonStats();
    });
  });
  document.querySelectorAll("[data-pit-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.pitSort;
      pitchingSort = {
        key,
        direction: pitchingSort.key === key && pitchingSort.direction === "desc" ? "asc" : "desc"
      };
      renderSeasonStats();
    });
  });
  els.mobileHitPlayerSelect?.addEventListener("change", () => {
    mobileHitPlayerFilter = els.mobileHitPlayerSelect.value || "all";
    renderSeasonStats();
  });
  els.mobileHitGameSelect?.addEventListener("change", () => {
    mobileHitGameFilter = els.mobileHitGameSelect.value || "all";
    renderSeasonStats();
  });
  els.mobilePitPlayerSelect?.addEventListener("change", () => {
    mobilePitPlayerFilter = els.mobilePitPlayerSelect.value || "all";
    renderSeasonStats();
  });
  els.mobilePitGameSelect?.addEventListener("change", () => {
    mobilePitGameFilter = els.mobilePitGameSelect.value || "all";
    renderSeasonStats();
  });
  els.desktopHitPlayerSelect?.addEventListener("change", () => {
    desktopHitPlayerFilter = els.desktopHitPlayerSelect.value || "all";
    renderSeasonStats();
  });
  els.desktopPitPlayerSelect?.addEventListener("change", () => {
    desktopPitPlayerFilter = els.desktopPitPlayerSelect.value || "all";
    renderSeasonStats();
  });
  els.statsHittingExportBtn?.addEventListener("click", () => {
    exportStatsTable("hitting");
  });
  els.statsPitchingExportBtn?.addEventListener("click", () => {
    exportStatsTable("pitching");
  });
  els.highlightForm?.addEventListener("submit", saveHighlightRecord);
  els.highlightResetBtn?.addEventListener("click", resetHighlightForm);
  els.highlightsGameSelect?.addEventListener("change", renderHighlightsManager);
  els.highlightsList?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-highlight-edit]");
    if (editButton) {
      beginHighlightEdit(editButton.dataset.highlightEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-highlight-delete]");
    if (deleteButton) {
      deleteHighlightRecord(deleteButton.dataset.highlightDelete);
    }
  });
  els.closeGameHighlightsBtn?.addEventListener("click", closeGameHighlightsModal);

  document.addEventListener("click", (event) => {
    if (event.target.closest(".sub-custom-select")) return;
    closeCustomSubSelects();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (els.quickScoreModal && !els.quickScoreModal.hidden) {
      closeQuickScoreModal();
      return;
    }
    if (els.boxScoreEditModal && !els.boxScoreEditModal.hidden) {
      closeBoxScoreEditModal();
      return;
    }
    if (els.bulkStatEditModal && !els.bulkStatEditModal.hidden) {
      closeBulkStatEditModal();
      return;
    }
    if (els.statEditGameModal && !els.statEditGameModal.hidden) {
      closeStatEditGameModal();
      return;
    }
    if (els.statEditGameSelectModal && !els.statEditGameSelectModal.hidden) {
      closeStatEditGameSelectModal();
      return;
    }
    if (els.pitchingStatEditGameModal && !els.pitchingStatEditGameModal.hidden) {
      closePitchingStatEditGameModal();
      return;
    }
    if (els.pitchingStatEditGameSelectModal && !els.pitchingStatEditGameSelectModal.hidden) {
      closePitchingStatEditGameSelectModal();
      return;
    }
    if (els.gameHighlightsModal && !els.gameHighlightsModal.hidden) {
      closeGameHighlightsModal();
      return;
    }
    closeCustomSubSelects();
  });
}

function switchView(view, options = {}) {
  const { updateRoute = true, replaceRoute = false } = options;
  const previousView = currentView;
  let nextView = view;
  if (!canAccessView(nextView)) {
    pendingAdminView = nextView;
    openAdminAuthModal("Admin sign-in required to open that area.");
    nextView = canAccessView(currentView) ? currentView : "home";
  }
  currentView = nextView;
  const allowedTabs = visibleTabViews();
  els.tabs.forEach((tab) => {
    const visible = allowedTabs.has(tab.dataset.view);
    tab.hidden = !visible;
    tab.classList.toggle("is-active", visible && tab.dataset.view === nextView);
  });
  els.mobileBottomNavTabs.forEach((tab) => {
    const visible = allowedTabs.has(tab.dataset.view);
    tab.hidden = !visible;
    tab.classList.toggle("is-active", visible && tab.dataset.view === nextView);
  });
  els.views.forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.panel === nextView));
  if (updateRoute) updateBrowserRouteForView(nextView, { replace: replaceRoute });
  if (nextView === "standings") refreshScoutingData({ silent: true });
  if (previousView !== nextView) {
    requestAnimationFrame(() => {
      document.scrollingElement?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if (document.body) {
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
      }
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
      }
    });
  }
}

function scoreCompleteSummaryGame() {
  if (!scoreCompleteSummaryGameId) return null;
  const game = state.games.find((item) => item.id === scoreCompleteSummaryGameId);
  if (!gameIsFinal(game)) {
    scoreCompleteSummaryGameId = "";
    return null;
  }
  return game;
}

function showGameCompleteSummary(game) {
  if (!game?.id || !gameIsFinal(game)) return false;
  scoreCompleteSummaryGameId = game.id;
  if (currentView !== "score" && canAccessView("score")) switchView("score");
  return true;
}

function clearGameCompleteSummary(gameId = "") {
  if (!gameId || scoreCompleteSummaryGameId === gameId) scoreCompleteSummaryGameId = "";
}

function activeGame() {
  const completedScoreGame = currentView === "score" ? scoreCompleteSummaryGame() : null;
  if (completedScoreGame) return completedScoreGame;
  let game = state.games.find((item) => item.id === state.activeGameId);
  if (!game || gameIsFinal(game) || game.status !== "active") {
    game = state.games.find((item) => item.status === "active" && !gameIsFinal(item));
    if (game) state.activeGameId = game.id;
  }
  if (!game) game = state.games.find((item) => !gameIsFinal(item) && item.status !== "postponed") || state.games[0];
  if (!game) {
    game = makeUniqueGame({ opponent: "Opponent", status: "scheduled" });
    state.games.push(game);
    saveGameToLibrary(game, false);
  }
  return game;
}

function activeScoreGame() {
  const completedScoreGame = currentView === "score" ? scoreCompleteSummaryGame() : null;
  if (completedScoreGame) return completedScoreGame;
  const current = state.games.find((item) => item.id === state.activeGameId);
  if (current && current.status === "active" && !gameIsFinal(current)) return current;
  return state.games.find((item) => item.status === "active" && !gameIsFinal(item)) || null;
}

function activePlayers() {
  return gameLineupEntries()
    .map((entry) => state.roster.find((player) => player.id === entry.playerId))
    .filter(Boolean);
}

function gameLineupEntries(game = activeGame()) {
  if (!game.lineupEntries || !game.lineupEntries.length) {
    game.lineupEntries = makeLineupEntries(state.lineup);
  }
  if (!game.lineups) game.lineups = { away: [], home: opponentLineupEntries(game.opponentLineup || []) };
  game.lineups.away = deepClone(game.lineupEntries);
  return game.lineupEntries.filter((entry) => entry.active !== false && entry.playerId);
}

function gameLineupPlayerIds(game = activeGame()) {
  return gameLineupEntries(game).map((entry) => entry.playerId);
}

function currentBatterId(game = activeGame()) {
  const ids = gameLineupPlayerIds(game);
  return ids[game.batterIndex] || ids[0] || state.lineup[0] || state.roster[0]?.id || "";
}

function parseOpponentLineup(value) {
  return value
    .split(/\r?\n/)
    .map((line, index) => parseOpponentLine(line, index))
    .filter((entry) => entry.name || entry.number);
}

function defaultOpponentNames() {
  return ["Batter 1", "Batter 2", "Batter 3", "Batter 4", "Batter 5", "Batter 6", "Batter 7", "Batter 8", "Batter 9"];
}

function opponentLineupEntriesForGame(game = activeGame()) {
  if (!game.lineups) game.lineups = { away: deepClone(game.lineupEntries || []), home: [] };
  const sourceEntries = Array.isArray(game.lineups.home) && game.lineups.home.length
    ? game.lineups.home
    : opponentLineupEntries(game.opponentLineup?.length ? game.opponentLineup : defaultOpponentNames());
  const entries = sourceEntries.map((entry, index) => normalizeOpponentLineupEntry(entry, index));
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries);
  return entries;
}

function opponentLineup(game = activeGame()) {
  return opponentLineupEntriesForGame(game).map((entry, index) => opponentBatterLabel(entry, index));
}

function opponentLineupText(entries = []) {
  return entries
    .map((entry, index) => opponentBatterLabel(entry, index))
    .join("\n");
}

function currentOpponentBatter(game = activeGame()) {
  const lineup = opponentLineup(game);
  const index = game.opponentBatterIndex || 0;
  return lineup[index % lineup.length];
}

function currentOpponentBatterEntry(game = activeGame()) {
  const entries = opponentLineupEntriesForGame(game);
  const index = game.opponentBatterIndex || 0;
  return entries[index % entries.length] || null;
}

function nextOpponentBatterIndex(game) {
  const total = Math.max(opponentLineup(game).length, 1);
  return ((game.opponentBatterIndex || 0) + 1) % total;
}

function updateOpponentLineup(value) {
  const game = activeGame();
  if (gameIsFinal(game)) return;
  game.opponentLineup = parseOpponentLineup(value);
  if (!game.lineups) game.lineups = { away: deepClone(game.lineupEntries || []), home: [] };
  game.lineups.home = opponentLineupEntries(game.opponentLineup);
  game.opponentBatterIndex = Math.min(game.opponentBatterIndex || 0, Math.max(game.opponentLineup.length - 1, 0));
  saveState();
  renderAtBat();
  renderLiveLineup();
  renderGames();
}

function updateOpponentLineupEntry(index, updates = {}) {
  const game = activeGame();
  if (gameIsFinal(game)) return;
  const entries = opponentLineupEntriesForGame(game);
  while (entries.length <= index) {
    entries.push({ id: createId("opp"), name: `Batter ${entries.length + 1}`, number: "", order: entries.length + 1, active: true });
  }
  const nextName = Object.prototype.hasOwnProperty.call(updates, "name") ? String(updates.name || "").trim() : entries[index].name;
  const nextNumber = Object.prototype.hasOwnProperty.call(updates, "number") ? String(updates.number || "").trim() : entries[index].number || "";
  entries[index] = { ...entries[index], name: nextName || `Batter ${index + 1}`, number: nextNumber, order: index + 1, active: true };
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries);
  els.scoreOpponentLineupInput.value = opponentLineupText(entries);
  saveState();
  renderAtBat();
  renderLiveLineup();
  renderGames();
}

function updateOpponentLineupName(index, name) {
  updateOpponentLineupEntry(index, { name });
}

function opponentLineupMoveSnapshot(game = activeGame()) {
  return {
    inning: game.inning,
    half: game.half,
    outs: game.outs,
    bases: deepClone(game.bases),
    batterIndex: game.batterIndex,
    opponentBatterIndex: game.opponentBatterIndex || 0,
    score: deepClone(game.score),
    atBat: cloneAtBat(game.atBat || makeAtBat()),
    opponentLineupEntries: deepClone(opponentLineupEntriesForGame(game))
  };
}

function recordOpponentLineupMove(game, { result = "SUB", playerName = "", note = "", snapshotBefore = null } = {}) {
  if (!game?.id) return;
  syncGameCurrent(game);
  if (!game.events) game.events = [];
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: playerName ? `opp:${playerName}` : "",
    playerName,
    result,
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current.inning,
    half: game.current.half,
    outsBefore: game.current.outs,
    basesBefore: deepClone(game.current.runners),
    scope: "lineup",
    teamSide: opponentSide(game),
    teamLabel: game.opponent,
    note,
    pitches: [],
    count: `${game.current.balls}-${game.current.strikes}`,
    spray: null,
    createdAt: new Date().toISOString(),
    snapshotBefore: snapshotBefore || opponentLineupMoveSnapshot(game)
  });
}

function substituteOpponentLineupHitter(game = activeGame(), lineupIndex = 0, details = {}) {
  const entries = opponentLineupEntriesForGame(game);
  const outgoing = entries[lineupIndex];
  if (!outgoing) return false;
  const snapshotBefore = opponentLineupMoveSnapshot(game);
  const nextName = String(details.name || "").trim();
  const nextNumber = String(details.number || "").trim();
  entries[lineupIndex] = {
    ...outgoing,
    id: createId("opp"),
    name: nextName || outgoing.name || `Batter ${lineupIndex + 1}`,
    number: nextNumber,
    order: lineupIndex + 1,
    active: true
  };
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries);
  recordOpponentLineupMove(game, {
    result: "SUB",
    playerName: entries[lineupIndex].name,
    note: `${opponentBatterLabel(outgoing, lineupIndex)} replaced by ${opponentBatterLabel(entries[lineupIndex], lineupIndex)}.`,
    snapshotBefore
  });
  return true;
}

function appendOpponentLineupHitter(game = activeGame(), details = {}) {
  const entries = opponentLineupEntriesForGame(game);
  const snapshotBefore = opponentLineupMoveSnapshot(game);
  const lineupIndex = entries.length;
  const entry = normalizeOpponentLineupEntry({
    id: createId("opp"),
    name: String(details.name || "").trim() || `Batter ${lineupIndex + 1}`,
    number: String(details.number || "").trim(),
    order: lineupIndex + 1,
    active: true
  }, lineupIndex);
  entries.push(entry);
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries);
  recordOpponentLineupMove(game, {
    result: "ADD",
    playerName: entry.name,
    note: `${opponentBatterLabel(entry, lineupIndex)} added to the end of the lineup.`,
    snapshotBefore
  });
  return true;
}

function applyOpponentLineupMove() {
  if (!requireAdminAccess("Admin sign-in required to change the opponent lineup.")) return;
  const game = activeGame();
  if (!game || gameIsFinal(game)) return;
  const moveType = els.opponentMoveTypeSelect?.value || "sub";
  const name = String(els.opponentMoveNameInput?.value || "").trim();
  const number = String(els.opponentMoveNumberInput?.value || "").trim();
  if (!name) {
    els.opponentMoveNameInput?.focus();
    return;
  }
  const changed = moveType === "append"
    ? appendOpponentLineupHitter(game, { name, number })
    : substituteOpponentLineupHitter(game, Number(els.opponentMoveSpotSelect?.value || 0), { name, number });
  if (!changed) return;
  if (els.opponentMoveNameInput) els.opponentMoveNameInput.value = "";
  if (els.opponentMoveNumberInput) els.opponentMoveNumberInput.value = "";
  saveState();
  render();
}

function currentPitcherId(game = activeGame()) {
  if (game.pitcherId) return game.pitcherId;
  const fallback = gameLineupPlayerIds(game)[0] || state.lineup[0] || state.roster[0]?.id || "";
  game.pitcherId = fallback;
  return fallback;
}

function battingSide(game = activeGame()) {
  return game.half === "bottom" ? "home" : "away";
}

function currentBatterModelId(game = activeGame()) {
  return isLionsAtBat(game) ? currentBatterId(game) : `opp:${currentOpponentBatter(game)}`;
}

function syncGameCurrent(game = activeGame()) {
  if (!game.current) game.current = {};
  if (!game.atBat) game.atBat = makeAtBat();
  game.current.inning = game.inning ?? game.current.inning ?? 1;
  game.current.half = game.half ?? game.current.half ?? "top";
  game.current.outs = game.outs ?? game.current.outs ?? 0;
  game.current.balls = game.atBat.balls ?? 0;
  game.current.strikes = game.atBat.strikes ?? 0;
  game.current.batterId = currentBatterModelId(game);
  game.current.pitcherId = game.pitcherId || game.current.pitcherId || "";
  game.current.runners = deepClone(game.bases || game.current.runners || emptyBases(false));
  syncScoreBySide(game);
  return game.current;
}

function commitCurrentToLegacy(game = activeGame()) {
  if (!game.current) return;
  game.inning = game.current.inning;
  game.half = game.current.half;
  game.outs = game.current.outs;
  game.bases = deepClone(game.current.runners);
  game.pitcherId = game.current.pitcherId || game.pitcherId;
  if (!game.atBat) game.atBat = makeAtBat();
  game.atBat.balls = game.current.balls;
  game.atBat.strikes = game.current.strikes;
  if (game.score) {
    syncScoreBySide(game);
  }
}

function startPlateAppearance(game = activeGame(), batterId = currentBatterModelId(game), pitcherId = currentPitcherId(game)) {
  syncGameCurrent(game);
  const active = getCurrentPlateAppearance(game, false);
  if (active && !active.result) return active;
  const basesBefore = deepClone(game.current.runners);
  const plateAppearance = {
    id: createId("pa"),
    gameId: game.id,
    inning: game.current.inning,
    half: game.current.half,
    battingSide: battingSide(game),
    batterId,
    pitcherId,
    basesBefore,
    hasRISP: Boolean(basesBefore.second || basesBefore.third),
    pitches: [],
    result: null,
    basesAfter: null,
    outsBefore: game.current.outs,
    outsAfter: game.current.outs,
    runsScored: 0,
    startedAt: new Date().toISOString(),
    completedAt: null
  };
  if (!game.plateAppearances) game.plateAppearances = [];
  game.plateAppearances.push(plateAppearance);
  game.currentPlateAppearanceId = plateAppearance.id;
  return plateAppearance;
}

function getCurrentPlateAppearance(game = activeGame(), createIfMissing = true) {
  const current = (game.plateAppearances || []).find((appearance) => appearance.id === game.currentPlateAppearanceId);
  if (current && !current.result) return current;
  if (!createIfMissing) return null;
  return startPlateAppearance(game);
}

function recordPitch(game = activeGame(), outcome) {
  syncGameCurrent(game);
  const plateAppearance = getCurrentPlateAppearance(game);
  const pitcherId = currentPitcherId(game);
  const ballsBefore = game.current.balls;
  const strikesBefore = game.current.strikes;
  const next = nextPitchCount(ballsBefore, strikesBefore, outcome);
  const pitch = {
    id: createId("pitch"),
    pitchNumber: plateAppearance.pitches.length + 1,
    ballsBefore,
    strikesBefore,
    outcome,
    ballsAfter: next.balls,
    strikesAfter: next.strikes,
    pitcherId,
    inPlay: outcome === "in_play",
    type: outcome,
    label: pitchLabels[outcome] || outcome,
    countBefore: `${ballsBefore}-${strikesBefore}`,
    createdAt: new Date().toISOString()
  };
  plateAppearance.pitches.push(pitch);
  game.current.balls = next.balls;
  game.current.strikes = next.strikes;
  if (!game.atBat) game.atBat = makeAtBat();
  game.atBat.balls = next.balls;
  game.atBat.strikes = next.strikes;
  game.atBat.pitches.push(pitch);
  if (pitch.inPlay) game.atBat.pendingInPlay = true;
  commitCurrentToLegacy(game);
  return pitch;
}

function applyRunnerAdvancements(game = activeGame(), runnerAdvancements = []) {
  syncGameCurrent(game);
  const runners = applyAdvancementsToBaseState(game.current.runners || emptyBases(false), runnerAdvancements);
  const summary = summarizeRunnerAdvancements(runnerAdvancements);
  game.current.runners = runners;
  game.bases = deepClone(runners);
  return { runners, ...summary };
}

function applyAdvancementsToBaseState(baseState = emptyBases(false), runnerAdvancements = []) {
  const runners = normalizeBaseState(baseState);
  runnerAdvancements.forEach((advancement) => {
    const from = advancement.from || null;
    const to = advancement.to || null;
    const runnerId = advancement.runnerId || (from && runners[from]) || null;
    if (from && sameRunnerValue(runners[from], runnerId)) runners[from] = false;
    if (advancement.remove || advancement.out || to === "home") return;
    if (to && Object.prototype.hasOwnProperty.call(runners, to)) runners[to] = runnerId;
  });
  return runners;
}

function summarizeRunnerAdvancements(runnerAdvancements = []) {
  let runsScored = 0;
  let outsRecorded = 0;
  runnerAdvancements.forEach((advancement) => {
    const to = advancement.to || null;
    if (advancement.out) {
      outsRecorded += 1;
      return;
    }
    if (to === "home") {
      runsScored += 1;
      return;
    }
  });
  return { runsScored, outsRecorded };
}

function normalizeBaseState(baseState = emptyBases(false)) {
  return {
    first: baseState?.first || false,
    second: baseState?.second || false,
    third: baseState?.third || false
  };
}

function baseStatesEqual(left, right) {
  const leftBases = normalizeBaseState(left);
  const rightBases = normalizeBaseState(right);
  return ["first", "second", "third"].every((base) => {
    const leftRunner = leftBases[base];
    const rightRunner = rightBases[base];
    if (!isOccupied(leftRunner) && !isOccupied(rightRunner)) return true;
    return sameRunnerValue(leftRunner, rightRunner);
  });
}

function eventDerivedBasesAfter(event) {
  if (!event) return null;
  if (event.basesBefore && Array.isArray(event.runnerAdvancements) && event.runnerAdvancements.length) {
    return applyAdvancementsToBaseState(event.basesBefore, event.runnerAdvancements);
  }
  if (event.basesAfter) return normalizeBaseState(event.basesAfter);
  return null;
}

function reconcileGameBasesFromEvents(game = activeGame()) {
  if (!game?.events?.length) return false;
  const currentInning = Number(game.inning ?? game.current?.inning ?? 1);
  const currentHalf = game.half ?? game.current?.half ?? "top";
  const event = [...game.events].reverse().find((item) => {
    if (!item) return false;
    if (Number(item.inning || 0) !== currentInning || item.half !== currentHalf) return false;
    return Boolean(item.basesAfter || (item.basesBefore && item.runnerAdvancements?.length));
  });
  const derivedBases = eventDerivedBasesAfter(event);
  if (!derivedBases) return false;
  const currentBases = normalizeBaseState(game.bases || game.current?.runners || emptyBases(false));
  if (baseStatesEqual(currentBases, derivedBases)) return false;
  game.bases = deepClone(derivedBases);
  if (!game.current) game.current = {};
  game.current.runners = deepClone(derivedBases);
  return true;
}

function runnerIdentity(value) {
  if (!isOccupied(value)) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    return String(value.runnerId || value.playerId || value.id || value.replacementRunnerId || "");
  }
  return String(value);
}

function sameRunnerValue(left, right) {
  const leftKey = runnerIdentity(left);
  const rightKey = runnerIdentity(right);
  if (leftKey && rightKey) return leftKey === rightKey;
  return left === right;
}

function finalizePlateAppearance(game = activeGame(), resultInput = {}) {
  syncGameCurrent(game);
  const plateAppearance = getCurrentPlateAppearance(game);
  const type = resultInput.type || resultInput.result || "GO";
  const rule = eventRules[type] || eventRules.GO;
  if (resultInput.pitcherId) plateAppearance.pitcherId = resultInput.pitcherId;
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "plateAppearance", result: type });
  const runnerAdvancements = resultInput.runnerAdvancements || defaultRunnerAdvancements(game, type, plateAppearance.batterId);
  const movement = applyRunnerAdvancements(game, runnerAdvancements);
  const runsScored = resultInput.runsScored ?? movement.runsScored;
  const outsRecorded = resultInput.outsRecorded ?? (rule.out ? 1 : 0) + movement.outsRecorded;
  const rbi = resultInput.rbi ?? 0;
  const snapshotBefore = resultInput.snapshotBefore || {
    inning: plateAppearance.inning,
    half: plateAppearance.half,
    outs: plateAppearance.outsBefore,
    bases: deepClone(plateAppearance.basesBefore),
    batterIndex: game.batterIndex,
    opponentBatterIndex: game.opponentBatterIndex || 0,
    score: deepClone(game.score),
    atBat: cloneAtBat(game.atBat || makeAtBat()),
    pitcherId: game.pitcherId || game.current?.pitcherId || "",
    currentPlateAppearanceId: game.currentPlateAppearanceId || ""
  };

  addRunsForBattingTeam(game, runsScored);
  game.current.outs += outsRecorded;
  commitCurrentToLegacy(game);

  const result = normalizePlateAppearanceResult({
    type,
    hit: Boolean(rule.hit),
    officialAtBat: Boolean(rule.ab),
    errorOnPlay: resultInput.errorOnPlay ?? type === "ROE",
    errorFielderPosition: resultInput.errorFielderPosition || "",
    rbi,
    outsRecorded,
    contact: resultInput.contact || "none",
    launch: resultInput.launch || rule.launch || "none",
    sprayChart: resultInput.sprayChart || null,
    fieldedBy: resultInput.fieldedBy || "",
    runnerAdvancements,
    notes: resultInput.notes || ""
  });
  plateAppearance.result = result;
  plateAppearance.basesAfter = deepClone(game.current.runners);
  plateAppearance.outsAfter = game.current.outs;
  plateAppearance.runsScored = runsScored;
  plateAppearance.completedAt = new Date().toISOString();
  const lastPitch = plateAppearance.pitches[plateAppearance.pitches.length - 1];

  const event = {
    id: createId("event"),
    plateAppearanceId: plateAppearance.id,
    gameId: game.id,
    playerId: plateAppearance.batterId,
    opponentBatter: isOpponentAtBat(game) ? currentOpponentBatter(game) : undefined,
    result: type,
    runs: runsScored,
    rbi,
    contact: result.contact,
    launch: result.launch,
    leverage: "neutral",
    inning: plateAppearance.inning,
    half: plateAppearance.half,
    outsBefore: plateAppearance.outsBefore,
    outsAfter: plateAppearance.outsAfter,
    basesBefore: deepClone(plateAppearance.basesBefore),
    basesAfter: deepClone(plateAppearance.basesAfter),
    hasRISP: Boolean(plateAppearance.hasRISP),
    scope: plateAppearance.battingSide === lionsSide(game) ? "offense" : "defense",
    pitcherId: plateAppearance.pitcherId,
    note: result.notes,
    pitches: deepClone(plateAppearance.pitches),
    count: `${lastPitch?.ballsAfter ?? 0}-${lastPitch?.strikesAfter ?? 0}`,
    spray: result.sprayChart,
    fieldedBy: result.fieldedBy,
    errorOnPlay: result.errorOnPlay,
    errorFielderPosition: result.errorFielderPosition,
    runnerAdvancements: deepClone(result.runnerAdvancements),
    createdAt: plateAppearance.completedAt,
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  };
  if (!game.events) game.events = [];
  game.events.push(event);

  if (rule.pa) {
    if (plateAppearance.battingSide === lionsSide(game)) {
      game.batterIndex = nextBatterIndex(game.batterIndex, game);
    } else {
      game.opponentBatterIndex = nextOpponentBatterIndex(game);
    }
  }
  game.current.balls = 0;
  game.current.strikes = 0;
  game.atBat = makeAtBat();
  game.currentPlateAppearanceId = "";
  clearPendingPlayState(game, true);
  if (game.current.outs >= 3) advanceHalfInning(game);
  else syncGameCurrent(game);
  return plateAppearance;
}

function defaultRunnerAdvancements(game, result, batterId) {
  return getDefaultRunnerAdvances(result, {
    ...(game.current?.runners || game.bases || emptyBases(false)),
    batter: batterId
  }).advancements;
}

function getDefaultRunnerAdvances(outcome, currentBaseState = {}) {
  const bases = deepClone({
    first: currentBaseState.first || false,
    second: currentBaseState.second || false,
    third: currentBaseState.third || false
  });
  const batterId = currentBaseState.batter || "batter";
  const normalized = normalizeBallInPlayOutcome(outcome);
  const baseNumber = { first: 1, second: 2, third: 3 };
  const baseName = { 1: "first", 2: "second", 3: "third" };
  const occupied = [
    ["third", bases.third],
    ["second", bases.second],
    ["first", bases.first]
  ].filter(([, runner]) => isOccupied(runner));
  const decisions = {};

  const setDecision = (from, runnerId, to, automatic = true) => {
    decisions[from] = {
      runnerId,
      from,
      to,
      automatic,
      out: to === "out",
      scored: to === "home"
    };
  };

  if (normalized === "HR") {
    occupied.forEach(([from, runner]) => setDecision(from, runner, "home"));
    setDecision("batter", batterId, "home");
  } else if (["1B", "2B", "3B"].includes(normalized)) {
    const move = Number(normalized.slice(0, 1));
    occupied.forEach(([from, runner]) => {
      const destination = baseNumber[from] + move;
      setDecision(from, runner, destination > 3 ? "home" : baseName[destination]);
    });
    setDecision("batter", batterId, baseName[move]);
  } else if (normalized === "ROE") {
    occupied.forEach(([from, runner]) => {
      const destination = baseNumber[from] + 1;
      setDecision(from, runner, destination > 3 ? "home" : baseName[destination]);
    });
    setDecision("batter", batterId, "first");
  } else if (["BB", "HBP"].includes(normalized)) {
    if (isOccupied(bases.third) && isOccupied(bases.second) && isOccupied(bases.first)) setDecision("third", bases.third, "home");
    else if (isOccupied(bases.third)) setDecision("third", bases.third, "hold");
    if (isOccupied(bases.second) && isOccupied(bases.first)) setDecision("second", bases.second, "third");
    else if (isOccupied(bases.second)) setDecision("second", bases.second, "hold");
    if (isOccupied(bases.first)) setDecision("first", bases.first, "second");
    setDecision("batter", batterId, "first");
  } else if (normalized === "FC") {
    if (isOccupied(bases.first)) setDecision("first", bases.first, "out");
    occupied.forEach(([from, runner]) => {
      if (!decisions[from]) setDecision(from, runner, "hold");
    });
    setDecision("batter", batterId, "first");
  } else if (normalized === "DP") {
    const outBase = isOccupied(bases.first) ? "first" : isOccupied(bases.second) ? "second" : isOccupied(bases.third) ? "third" : null;
    occupied.forEach(([from, runner]) => setDecision(from, runner, from === outBase ? "out" : "hold"));
    setDecision("batter", batterId, "out");
  } else {
    occupied.forEach(([from, runner]) => setDecision(from, runner, "hold"));
    setDecision("batter", batterId, "out");
  }

  const basesAfter = emptyBases(false);
  let runsScored = 0;
  let outsRecorded = 0;
  const advancements = Object.values(decisions).flatMap((decision) => {
    if (decision.to === "hold") {
      if (decision.from !== "batter" && Object.prototype.hasOwnProperty.call(basesAfter, decision.from)) basesAfter[decision.from] = decision.runnerId;
      return [];
    }
    if (decision.to === "out") {
      outsRecorded += 1;
      if (decision.from === "batter" && eventRules[normalized]?.out) return [];
      return [{ runnerId: decision.runnerId, from: decision.from, out: true }];
    }
    if (decision.to === "home") {
      runsScored += 1;
      return [{ runnerId: decision.runnerId, from: decision.from, to: "home" }];
    }
    if (Object.prototype.hasOwnProperty.call(basesAfter, decision.to)) basesAfter[decision.to] = decision.runnerId;
    return [{ runnerId: decision.runnerId, from: decision.from, to: decision.to }];
  });

  return {
    outcome: normalized,
    decisions,
    basesAfter,
    runsScored,
    outsRecorded,
    advancements
  };
}

function advanceHalfInning(game = activeGame()) {
  if (!game.current) syncGameCurrent(game);
  game.current.outs = 0;
  game.current.balls = 0;
  game.current.strikes = 0;
  game.current.runners = emptyBases(false);
  if (game.current.half === "top") {
    game.current.half = "bottom";
  } else {
    const completedInning = game.current.inning;
    game.current.half = "top";
    game.current.inning += 1;
    if (completedInning >= 7 && !gameIsTied(game)) {
      game.status = "completed";
    }
  }
  game.inning = game.current.inning;
  game.half = game.current.half;
  game.outs = game.current.outs;
  game.bases = deepClone(game.current.runners);
  game.current.batterId = currentBatterModelId(game);
  game.current.pitcherId = game.pitcherId || game.current.pitcherId || "";
  game.currentPlateAppearanceId = "";
  game.atBat = makeAtBat();
  commitCurrentToLegacy(game);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    showGameCompleteSummary(game);
    moveActiveGameOffFinal(game.id);
  }
  clearPendingPlayState(game, true);
  if (lionsWonGame(game)) playLionsWinAnimation(lionsWinAnimationPayloadForGame(game));
  if (!gameIsFinal(game)) playHalfInningChange(game);
}

function addSubstitution(game = activeGame(), substitution = {}) {
  syncGameCurrent(game);
  const entryId = substitution.lineupEntryId || substitution.entryId;
  const incomingPlayerId = substitution.incomingPlayerId || substitution.playerId;
  if (!entryId || !incomingPlayerId) return null;
  const currentEntries = gameLineupEntries(game);
  const outgoing = currentEntries.find((entry) => entry.id === entryId);
  if (!outgoing) return null;
  const record = {
    id: createId("sub"),
    gameId: game.id,
    inning: game.current.inning,
    half: game.current.half,
    teamSide: substitution.teamSide || "away",
    lineupEntryId: entryId,
    outgoingPlayerId: outgoing.playerId,
    incomingPlayerId,
    type: substitution.type || "sub",
    role: substitution.role || outgoing.role,
    notes: substitution.notes || "",
    createdAt: new Date().toISOString()
  };
  game.lineupEntries = currentEntries.map((entry) =>
    entry.id === entryId
      ? { ...entry, playerId: incomingPlayerId, role: record.role || entry.role, note: record.type === "ph" ? "Pinch hitter" : "Substitute" }
      : entry
  );
  game.lineups.away = deepClone(game.lineupEntries);
  if (!game.substitutions) game.substitutions = [];
  game.substitutions.push(record);
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: incomingPlayerId,
    result: "SUB",
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current.inning,
    half: game.current.half,
    outsBefore: game.current.outs,
    basesBefore: deepClone(game.current.runners),
    scope: "lineup",
    substitutionId: record.id,
    note: record.type === "ph" ? "Pinch hitter entered" : "Substitution entered",
    pitches: [],
    count: `${game.current.balls}-${game.current.strikes}`,
    spray: null,
    createdAt: record.createdAt,
    snapshotBefore: liveGameSnapshot(game, {
      lineupEntries: deepClone(currentEntries)
    })
  });
  syncGameCurrent(game);
  return record;
}

function appendLionsLineupHitter(game = activeGame(), details = {}) {
  syncGameCurrent(game);
  const incomingPlayerId = details.incomingPlayerId || details.playerId;
  const incomingPlayer = state.roster.find((player) => player.id === incomingPlayerId);
  if (!incomingPlayerId || !incomingPlayer) return null;
  const currentEntries = gameLineupEntries(game);
  if (currentEntries.some((entry) => entry.playerId === incomingPlayerId)) return null;
  const lineupIndex = currentEntries.length;
  const role = details.role || playerPrimaryPosition(incomingPlayer) || defaultRoleForSpot(lineupIndex);
  const record = {
    id: createId("sub"),
    gameId: game.id,
    inning: game.current.inning,
    half: game.current.half,
    teamSide: lionsSide(game),
    lineupEntryId: "",
    outgoingPlayerId: "",
    incomingPlayerId,
    type: "append",
    role,
    notes: details.notes || "Hitter added to the end of the Lions lineup",
    createdAt: new Date().toISOString()
  };
  const entry = {
    id: createId("lineup"),
    playerId: incomingPlayerId,
    role,
    order: lineupIndex + 1,
    active: true,
    note: "Added hitter"
  };
  game.lineupEntries = [...currentEntries, entry].map((item, index) => ({
    ...item,
    order: index + 1
  }));
  if (!game.lineups) game.lineups = { away: [], home: opponentLineupEntries(game.opponentLineup || []) };
  game.lineups.away = deepClone(game.lineupEntries);
  if (!game.substitutions) game.substitutions = [];
  game.substitutions.push(record);
  if (!game.events) game.events = [];
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: incomingPlayerId,
    playerName: incomingPlayer.name,
    result: "ADD",
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current.inning,
    half: game.current.half,
    outsBefore: game.current.outs,
    basesBefore: deepClone(game.current.runners),
    scope: "lineup",
    teamSide: lionsSide(game),
    teamLabel: "Lions",
    substitutionId: record.id,
    note: `#${incomingPlayer.number || "--"} ${incomingPlayer.name} added to spot ${lineupIndex + 1}.`,
    pitches: [],
    count: `${game.current.balls}-${game.current.strikes}`,
    spray: null,
    createdAt: record.createdAt,
    snapshotBefore: liveGameSnapshot(game, {
      lineupEntries: deepClone(currentEntries)
    })
  });
  syncGameCurrent(game);
  return record;
}

function selectChoice(group, value, silent = false) {
  const target = group === "result" ? els.resultSelect : group === "contact" ? els.contactSelect : group === "error" ? els.errorFielderSelect : els.launchSelect;
  if (!target) return;
  target.value = value;
  els.choiceButtons
    .filter((button) => button.dataset.choiceGroup === group)
    .forEach((button) => button.classList.toggle("is-selected", button.dataset.choiceValue === value));
  if (silent) return;
  if (group === "result") {
    if (battedBallResults.has(value)) {
      const game = activeGame();
      bipOutcomeChosen = true;
      awaitingSprayLocation = true;
      if (game.atBat) game.atBat.pendingInPlay = false;
    }
    suggestRunValues();
    if (value === "BB" || value === "K" || value === "HBP") autoCompleteResult(value);
    if (battedBallResults.has(value)) maybeAutoCompleteBattedBall();
  }
  if (group === "launch" && value !== "none") {
    const game = activeGame();
    if (game.atBat && !awaitingSprayLocation) game.atBat.pendingInPlay = true;
    renderAtBat();
    maybeAutoCompleteBattedBall();
  }
  if (group === "error" && value) {
    bipOutcomeChosen = true;
    awaitingSprayLocation = true;
    const game = activeGame();
    if (game.atBat) game.atBat.pendingInPlay = false;
    selectChoice("result", "ROE", true);
    maybeAutoCompleteBattedBall();
  }
}

function clearPendingPlayState(game = activeGame(), clearAtBat = false) {
  pendingSpray = null;
  pendingRunnerOutBases = [];
  pendingRunnerChoices = {};
  runnerDecisionError = "";
  pendingOutType = "";
  pendingOutFielder = "";
  pendingRunnerReplacementBase = "";
  selectedFieldRunnerBase = "";
  bipOutcomeChosen = false;
  awaitingSprayLocation = false;
  awaitingRunnerDecision = false;
  scoringStep = "pitch";
  if (clearAtBat && game?.atBat) game.atBat.pendingInPlay = false;
  if (clearAtBat && game) game.pendingScoring = null;
}

function healOrphanedScoringStep(game = activeGame()) {
  if (!game?.atBat) return false;
  const hasRunnerChoices = Object.keys(pendingRunnerChoices || {}).length > 0;
  const activePlateAppearance = (game.plateAppearances || []).find((appearance) => (
    appearance?.id === game.currentPlateAppearanceId && !appearance.result
  ));
  const hasActivePlateAppearance = Boolean(activePlateAppearance);
  const hasCompletedAtBatShell = !hasActivePlateAppearance;
  const stepIsOrphaned =
    (hasCompletedAtBatShell && ["outcome", "out_fielder", "spray", "runners"].includes(scoringStep)) ||
    (scoringStep === "outcome" && (!game.atBat.pendingInPlay || !hasActivePlateAppearance)) ||
    (scoringStep === "out_fielder" && !pendingOutType) ||
    (scoringStep === "spray" && !awaitingSprayLocation && !pendingSpray) ||
    (scoringStep === "runners" && !awaitingRunnerDecision && !hasRunnerChoices);
  if (!stepIsOrphaned) return false;
  clearPendingPlayState(game, true);
  return true;
}

function setScoringStep(step) {
  scoringStep = step;
  renderScoringStepPanel();
}

function resetBipChoiceControls() {
  selectChoice("result", "1B", true);
  selectChoice("contact", "none", true);
  selectChoice("launch", "none", true);
  selectChoice("error", "", true);
}

function resetBipChoices() {
  resetBipChoiceControls();
  clearPendingPlayState(activeGame(), false);
  renderRunnerTracker();
}

function applyEvent(game = activeGame(), event = {}) {
  if (!game || !event.type) return null;
  if (gameIsScoreLocked(game)) return null;
  syncGameCurrent(game);
  if (!game.atBat) game.atBat = makeAtBat();
  if (["pitch", "ball_in_play", "resolve_play", "runner_out", "runner_advance", "special_action"].includes(event.type)) {
    dismissBatterIntro(game);
    if (isLionsAtBat(game)) dismissLineupPreview(game);
  }

  if (event.type === "pitch") {
    const outcome = event.outcome;
    const pitch = recordPitch(game, outcome);
    if (isOpponentAtBat(game)) {
      if (outcome === "ball" && pitch.ballsAfter >= 4) {
        return applyEvent(game, { type: "resolve_play", result: "BB" });
      }
      if ((outcome === "strike" || outcome === "called_strike" || outcome === "swinging_strike") && pitch.strikesAfter >= 3) {
        return applyEvent(game, { type: "resolve_play", result: "K" });
      }
      if (outcome === "in_play") {
        clearPendingPlayState(game, true);
        if (game.atBat) game.atBat.pendingInPlay = true;
        scoringStep = "outcome";
      }
      saveState();
      renderScoreboard();
      renderAtBat();
      renderScoringStepPanel();
      return pitch;
    }
    if (outcome === "ball" && pitch.ballsAfter >= 4) return applyEvent(game, { type: "resolve_play", result: "BB" });
    if ((outcome === "strike" || outcome === "called_strike" || outcome === "swinging_strike") && pitch.strikesAfter >= 3) return applyEvent(game, { type: "resolve_play", result: "K" });
    if (outcome === "in_play") {
      clearPendingPlayState(game, true);
      if (game.atBat) game.atBat.pendingInPlay = true;
      if (!battedBallResults.has(els.resultSelect.value)) selectChoice("result", "1B", true);
      els.sprayHint.textContent = "Select the outcome, then tap where the ball landed or was fielded.";
      scoringStep = "outcome";
    }
    saveState();
    renderScoreboard();
    renderAtBat();
    renderSprayChart();
    renderRunnerTracker();
    renderScoringStepPanel();
    return pitch;
  }

  if (event.type === "ball_in_play") {
    const rawOutcome = event.outcome || event.result;
    if (String(rawOutcome || "").toUpperCase() === "OUT") {
      pendingOutType = "";
      pendingOutFielder = "";
      if (game.atBat) game.atBat.pendingInPlay = false;
      scoringStep = "out_type";
      els.sprayHint.textContent = "Choose the out type before marking the field.";
      renderAtBat();
      renderScoringStepPanel();
      return "OUT";
    }
    const result = normalizeBallInPlayOutcome(rawOutcome);
    if (!battedBallResults.has(result)) return applyEvent(game, { type: "resolve_play", result });
    if (scorebookFielderResults.has(result)) {
      pendingOutType = result;
      pendingOutFielder = event.fieldedBy || pendingOutFielder || (result === "ROE" ? els.errorFielderSelect?.value || "" : "");
      if (!pendingOutFielder) {
        if (game.atBat) game.atBat.pendingInPlay = false;
        scoringStep = "out_fielder";
        els.sprayHint.textContent = result === "ROE" ? "Choose the defender charged with the error." : "Choose the defender who made the play.";
        renderAtBat();
        renderScoringStepPanel();
        return result;
      }
    }
    if (isOpponentAtBat(game)) {
      selectChoice("result", result, true);
      if (scorebookFielderResults.has(result)) pendingOutFielder = event.fieldedBy || pendingOutFielder || "";
      if (result === "HR") {
        return applyEvent(game, { type: "resolve_play", result, fieldedBy: pendingOutFielder });
      }
      initializeRunnerDecisionChoices(game, result);
      awaitingRunnerDecision = true;
      awaitingSprayLocation = false;
      if (game.atBat) game.atBat.pendingInPlay = false;
      scoringStep = "runners";
      renderAtBat();
      renderRunnerTracker();
      renderScoringStepPanel();
      return result;
    }
    selectChoice("result", result, true);
    if (result === "HR") selectChoice("launch", "fb", true);
    else if (eventRules[result]?.launch) selectChoice("launch", eventRules[result].launch, true);
    else if (els.launchSelect.value === "none") selectChoice("launch", event.launch || "ld", true);
    clearPendingPlayState(game, true);
    pendingOutType = scorebookFielderResults.has(result) ? result : "";
    pendingOutFielder = event.fieldedBy || pendingOutFielder || "";
    bipOutcomeChosen = true;
    awaitingSprayLocation = true;
    awaitingRunnerDecision = false;
    if (game.atBat) game.atBat.pendingInPlay = false;
    els.sprayHint.textContent = "Tap where the ball landed or was fielded.";
    scoringStep = "spray";
    saveState();
    renderAtBat();
    renderSprayChart();
    renderRunnerTracker();
    renderAutoScorePreview();
    renderScoringStepPanel();
    return result;
  }

  if (event.type === "spray") {
    setPendingSprayState(event.x, event.y);
    if (els.launchSelect.value === "none") selectChoice("launch", "ld", true);
    const result = els.resultSelect.value;
    if (bipOutcomeChosen && battedBallResults.has(result)) {
      awaitingSprayLocation = false;
      if (game.atBat) game.atBat.pendingInPlay = false;
      initializeRunnerDecisionChoices(game, result);
      awaitingRunnerDecision = true;
      els.sprayHint.textContent = "Review runner outs, then tap Resolve Play.";
      scoringStep = "runners";
    } else {
      if (game.atBat) game.atBat.pendingInPlay = true;
      els.sprayHint.textContent = `Marked ${pendingSpray.zone}. Select the outcome to continue.`;
      scoringStep = "outcome";
    }
    saveState();
    renderAtBat();
    renderRunnerTracker();
    renderSprayChart();
    renderAutoScorePreview();
    renderScoringStepPanel();
    return pendingSpray;
  }

  if (event.type === "runner_out") {
    if (event.mode === "steal") {
      recordSteal(event.target, "out");
      return null;
    }
    if (event.base) setRunnerChoice(event.base, "out");
    awaitingRunnerDecision = true;
    renderAutoScorePreview();
    renderScoringStepPanel();
    return pendingRunnerChoices;
  }

  if (event.type === "runner_advance") {
    if (event.mode === "steal") {
      recordSteal(event.target, "safe");
      return null;
    }
    if (event.base && event.to) setRunnerChoice(event.base, event.to);
    awaitingRunnerDecision = true;
    renderRunnerTracker();
    renderAutoScorePreview();
    renderScoringStepPanel();
    return null;
  }

  if (event.type === "special_action") {
    if (event.action === "steal") recordSteal(event.target, "safe", event.source);
    if (event.action === "caught_stealing") recordSteal(event.target, "out", event.source);
    if (event.action === "balk") recordBalk(event.target, event.source);
    if (event.action === "pickoff") recordPickoff(event.target);
    if (event.action === "tag_up") recordTagUp(event.target);
    scoringStep = "pitch";
    renderScoringStepPanel();
    return null;
  }

  if (event.type === "resolve_play") {
    const result = normalizeBallInPlayOutcome(event.result || event.outcome || els.resultSelect.value || "GO");
    selectChoice("result", result, true);
    if (isOpponentAtBat(game)) {
      logOpponentOutcome(result, { fieldedBy: event.fieldedBy || pendingOutFielder });
      return result;
    }
    if (battedBallResults.has(result) && !pendingSpray) {
      bipOutcomeChosen = true;
      awaitingSprayLocation = true;
      awaitingRunnerDecision = false;
      if (game.atBat) game.atBat.pendingInPlay = false;
      els.sprayHint.textContent = "Tap where the ball landed or was fielded before resolving.";
      scoringStep = "spray";
      renderAtBat();
      renderRunnerTracker();
      renderScoringStepPanel();
      return null;
    }
    if (Object.keys(pendingRunnerChoices || {}).length) {
      const validation = validateRunnerDecisionChoices(game, result);
      if (!validation.valid) {
        runnerDecisionError = validation.message;
        awaitingSprayLocation = false;
        awaitingRunnerDecision = true;
        scoringStep = "runners";
        renderAtBat();
        renderRunnerTracker();
        renderAutoScorePreview();
        renderScoringStepPanel();
        return null;
      }
    }
    runnerDecisionError = "";
    awaitingSprayLocation = false;
    awaitingRunnerDecision = false;
    scoringStep = "pitch";
    logPlay();
    return result;
  }

  return null;
}

function normalizeBallInPlayOutcome(value) {
  const key = String(value || "").toLowerCase();
  const map = {
    single: "1B",
    double: "2B",
    triple: "3B",
    home_run: "HR",
    homerun: "HR",
    hr: "HR",
    out: "GO",
    error: "ROE",
    roe: "ROE",
    fielders_choice: "FC",
    fielder_choice: "FC",
    fc: "FC",
    double_play: "DP",
    dp: "DP",
    sacrifice: "SAC",
    sac: "SAC",
    walk: "BB",
    bb: "BB",
    strikeout: "K",
    k: "K",
    hbp: "HBP"
  };
  return map[key] || String(value || "GO").toUpperCase();
}

function needsRunnerDecision(game = activeGame(), result = els.resultSelect.value) {
  if (result === "HR") return false;
  const bases = game.current?.runners || game.bases || emptyBases(false);
  return ["first", "second", "third"].some((base) => isOccupied(bases[base]));
}

function setRunnerChoice(base, to) {
  runnerDecisionError = "";
  const current = pendingRunnerChoices[base] && typeof pendingRunnerChoices[base] === "object"
    ? pendingRunnerChoices[base]
    : { to: pendingRunnerChoices[base] || "hold", automaticTo: pendingRunnerChoices[base] || "hold" };
  pendingRunnerChoices = {
    ...pendingRunnerChoices,
    [base]: {
      ...current,
      to,
      adjusted: to !== current.automaticTo
    }
  };
  if (base !== "batter") {
    pendingRunnerOutBases = to === "out"
      ? [...new Set([...pendingRunnerOutBases, base])]
      : pendingRunnerOutBases.filter((item) => item !== base);
  }
}

function initializeRunnerDecisionChoices(game = activeGame(), result = els.resultSelect.value) {
  runnerDecisionError = "";
  const batterId = currentBatterId(game);
  const bases = deepClone(game.current?.runners || game.bases || emptyBases(false));
  const defaults = getDefaultRunnerAdvances(result, { ...bases, batter: batterId });
  pendingRunnerChoices = {};
  ["third", "second", "first"].forEach((base) => {
    if (!isOccupied(bases[base])) return;
    const decision = defaults.decisions[base] || { runnerId: bases[base], to: "hold" };
    pendingRunnerChoices[base] = {
      runnerId: bases[base],
      from: base,
      to: decision.to || "hold",
      automaticTo: decision.to || "hold",
      adjusted: false
    };
  });
  const batterDecision = defaults.decisions.batter || { runnerId: batterId, to: defaultBatterDestination(result) };
  pendingRunnerChoices.batter = {
    runnerId: batterId,
    from: "batter",
    to: batterDecision.to || defaultBatterDestination(result),
    automaticTo: batterDecision.to || defaultBatterDestination(result),
    adjusted: false
  };
  pendingRunnerOutBases = Object.entries(pendingRunnerChoices)
    .filter(([base, choice]) => base !== "batter" && choice.to === "out")
    .map(([base]) => base);
}

function defaultBatterDestination(result) {
  if (result === "1B" || result === "ROE" || result === "FC") return "first";
  if (result === "2B") return "second";
  if (result === "3B") return "third";
  if (result === "HR") return "home";
  return "out";
}

function runnerDecisionCards(game = activeGame(), result = els.resultSelect.value) {
  const bases = game.current?.runners || game.bases || emptyBases(false);
  const cards = [];
  ["third", "second", "first"].forEach((base) => {
    if (isOccupied(bases[base])) {
      cards.push({
        base,
        label: runnerName(bases[base]) || baseLabel(base),
        start: baseLabel(base),
        options: runnerOptionsForBase(base)
      });
    }
  });
  cards.push({
    base: "batter",
    label: currentBatterLabel(game),
    start: "Batter",
    options: runnerOptionsForBase("batter")
  });
  cards.forEach((card) => {
    if (!pendingRunnerChoices[card.base]) {
      setRunnerChoice(card.base, card.base === "batter" ? defaultBatterDestination(result) : "hold");
    }
    const choice = pendingRunnerChoices[card.base];
    card.to = choice.to;
    card.automaticTo = choice.automaticTo;
    card.adjusted = Boolean(choice.adjusted);
  });
  return cards;
}

function runnerOptionsForBase(base) {
  if (base === "batter") return ["first", "second", "third", "home", "out"];
  if (base === "first") return ["hold", "second", "third", "home", "out"];
  if (base === "second") return ["hold", "third", "home", "out"];
  return ["hold", "home", "out"];
}

function eligibleNonRunnerPlayers(game = activeGame(), base = selectedFieldRunnerBase) {
  if (!game || !isLionsAtBat(game) || !base || !isOccupied(game.bases?.[base])) return [];
  const occupiedIds = new Set(
    Object.entries(game.bases || emptyBases(false))
      .filter(([occupiedBase, runnerId]) => occupiedBase !== base && typeof runnerId === "string")
      .map(([, runnerId]) => runnerId)
  );
  const batterId = currentBatterId(game);
  if (batterId) occupiedIds.add(batterId);
  const currentRunnerId = game.bases[base];
  return gameLineupEntries(game)
    .map((entry) => state.roster.find((player) => player.id === entry.playerId))
    .filter((player) => player?.id && player.id !== currentRunnerId && !occupiedIds.has(player.id));
}

function openNonRunnerSelect(base = selectedFieldRunnerBase) {
  const game = activeGame();
  if (!game || !isLionsAtBat(game) || !base || !isOccupied(game.bases?.[base])) return;
  pendingRunnerReplacementBase = base;
  scoringStep = "runner_replacement";
  renderRunnerTracker();
  renderScoringStepPanel();
}

function assignNonRunner(playerId, base = pendingRunnerReplacementBase || selectedFieldRunnerBase) {
  const game = activeGame();
  if (!game || gameIsScoreLocked(game) || !isLionsAtBat(game)) return null;
  if (game.status !== "completed") game.status = "active";
  syncGameCurrent(game);
  if (!base || !isOccupied(game.bases?.[base])) return null;
  const replacement = eligibleNonRunnerPlayers(game, base).find((player) => player.id === playerId);
  if (!replacement) return null;
  const originalRunnerId = game.bases[base];
  const originalRunner = state.roster.find((player) => player.id === originalRunnerId);
  const snapshotBefore = liveGameSnapshot(game);
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "runnerReplacement", result: "NR" });
  game.bases[base] = replacement.id;
  if (!game.current) game.current = {};
  if (!game.current.runners) game.current.runners = emptyBases(false);
  game.current.runners[base] = replacement.id;
  if (!game.events) game.events = [];
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: replacement.id,
    result: "NR",
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current.inning,
    half: game.current.half,
    outsBefore: game.current.outs,
    outsAfter: game.current.outs,
    basesBefore: deepClone(snapshotBefore.bases),
    basesAfter: deepClone(game.bases),
    scope: "lineup",
    playerName: `#${replacement.number || "--"} ${replacement.name}`,
    note: `NR: #${replacement.number || "--"} ${replacement.name} running for #${originalRunner?.number || "--"} ${originalRunner?.name || "runner"} at ${baseLabel(base)}.`,
    pitches: [],
    count: `${game.current.balls || 0}-${game.current.strikes || 0}`,
    spray: null,
    runnerReplacement: {
      base,
      originalRunnerId,
      replacementRunnerId: replacement.id
    },
    createdAt: new Date().toISOString(),
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  });
  pendingRunnerReplacementBase = "";
  selectedFieldRunnerBase = "";
  scoringStep = "pitch";
  commitCurrentToLegacy(game);
  saveState();
  render();
  return replacement;
}

function baseLabel(base) {
  return {
    batter: "Batter",
    first: "1B",
    second: "2B",
    third: "3B",
    home: "Home",
    hold: "Hold",
    out: "Out"
  }[base] || base;
}

function currentBatterLabel(game = activeGame()) {
  if (isOpponentAtBat(game)) {
    const opponentEntry = currentOpponentBatterEntry(game);
    const opponentLabel = currentOpponentBatter(game);
    return opponentEntry?.number
      ? `#${opponentEntry.number} ${opponentLabel}`
      : opponentLabel || "Batter";
  }
  const player = state.roster.find((item) => item.id === currentBatterId(game));
  return player ? `#${player.number} ${player.name}` : "Batter";
}

function clearBatterIntroTimer() {
  if (!batterIntroTimer) return;
  window.clearTimeout(batterIntroTimer);
  batterIntroTimer = null;
}

function clearPendingBatterIntro() {
  pendingBatterIntroKey = "";
}

function syncBatterIntroLockState(isVisible) {
  els.abCard?.classList.toggle("is-batter-intro", Boolean(isVisible));
  els.scoringStepPanel?.classList.toggle("is-batter-intro-locked", Boolean(isVisible));
}

function currentBatterIntroContext(game = activeGame()) {
  if (!game || game.status !== "active") return null;
  const inning = game.current?.inning ?? game.inning ?? 1;
  const half = game.current?.half ?? game.half ?? "top";
  if (isLionsAtBat(game)) {
    const batterId = currentBatterId(game);
    if (!batterId) return null;
    const currentPlayer = state.roster.find((player) => player.id === batterId);
    const currentEntry = gameLineupEntries(game).find((entry) => entry.playerId === currentPlayer?.id);
    return {
      key: `${game.id}:${inning}:${half}:lions:${game.batterIndex || 0}:${batterId}`,
      name: currentPlayer ? `#${currentPlayer.number} ${currentPlayer.name}` : "Current batter",
      meta: `${currentEntry?.role || "UTIL"} | Lions at bat`
    };
  }
  const opponentLabel = currentOpponentBatter(game);
  if (!opponentLabel) return null;
  const spot = Number(game.opponentBatterIndex || 0) + 1;
  return {
    key: `${game.id}:${inning}:${half}:opponent:${game.opponentBatterIndex || 0}:${opponentLabel}`,
    name: opponentLabel,
    meta: `${opponentSide(game) === "home" ? "Home" : "Away"} ${game.opponent || "Opponent"} batting | Spot ${spot}`
  };
}

function currentBatterIntroKey(game = activeGame()) {
  return currentBatterIntroContext(game)?.key || "";
}

function upcomingBatterIntroRows(game = activeGame()) {
  const entries = gameLineupEntries(game);
  if (!entries.length) return [];
  const slots = ["On Deck", "In The Hole"];
  return slots.map((slot, offset) => {
    const entry = entries[(game.batterIndex + offset + 1) % entries.length];
    const player = state.roster.find((item) => item.id === entry?.playerId);
    return {
      slot,
      name: player?.name || "Open spot",
      number: player?.number || "",
      role: entry?.role || "Ready"
    };
  });
}

function currentLineupPreviewKey(game = activeGame()) {
  if (!game || game.status !== "active") return "";
  const inning = game.current?.inning ?? game.inning ?? 1;
  const half = game.current?.half ?? game.half ?? "top";
  return `${game.id}:${inning}:${half}:${isLionsAtBat(game) ? "lions" : "opponent"}`;
}

function offensiveHalfHasStarted(game = activeGame()) {
  const inning = Number(game?.current?.inning ?? game?.inning ?? 1);
  const half = game?.current?.half ?? game?.half ?? "top";
  return (game?.plateAppearances || []).some((appearance) =>
    Number(appearance?.inning ?? 0) === inning
    && (appearance?.half || "") === half
    && appearance?.completedAt
  );
}

function upcomingLineupPreviewRows(game = activeGame()) {
  const slots = ["Up Next", "On Deck", "In The Hole"];
  if (isLionsAtBat(game)) {
    const entries = gameLineupEntries(game);
    if (!entries.length) return [];
    return slots.map((slot, offset) => {
      const entry = entries[(game.batterIndex + offset) % entries.length];
      const player = state.roster.find((item) => item.id === entry?.playerId);
      return {
        slot,
        name: player?.name || "Open spot",
        number: player?.number || "",
        role: entry?.role || ""
      };
    });
  }
  const entries = opponentLineupEntriesForGame(game);
  if (!entries.length) return [];
  return slots.map((slot, offset) => {
    const lineupIndex = ((game.opponentBatterIndex || 0) + offset) % entries.length;
    const entry = normalizeOpponentLineupEntry(entries[lineupIndex], lineupIndex);
    return {
      slot,
      name: entry.name || `Opponent hitter ${lineupIndex + 1}`,
      number: entry.number || "",
      role: `Spot ${lineupIndex + 1}`
    };
  });
}

function shouldShowLineupPreviewByState(game = activeGame()) {
  const key = currentLineupPreviewKey(game);
  if (!key || shownLineupPreviewKeys.has(key)) return false;
  if (offensiveHalfHasStarted(game)) return false;
  if (game?.atBat?.pitches?.length) return false;
  if (game?.atBat?.pendingInPlay || awaitingSprayLocation || awaitingRunnerDecision) return false;
  return upcomingLineupPreviewRows(game).length > 0;
}

function shouldShowLineupPreview(game = activeGame()) {
  return shouldShowLineupPreviewByState(game);
}

function lineupPreviewHeading(game = activeGame()) {
  const half = game?.current?.half ?? game?.half ?? "top";
  const inning = Number(game?.current?.inning ?? game?.inning ?? 1);
  return `${half === "top" ? "Top" : "Bottom"} Of The ${inning}${inning === 1 ? "st" : inning === 2 ? "nd" : inning === 3 ? "rd" : "th"}`;
}

function dismissLineupPreview(game = activeGame()) {
  const key = currentLineupPreviewKey(game);
  if (key) shownLineupPreviewKeys.add(key);
  if (els.lineupPreviewCard) {
    els.lineupPreviewCard.hidden = true;
    els.lineupPreviewCard.classList.remove("is-visible");
  }
}

function renderLineupPreview(game = activeGame()) {
  if (!els.lineupPreviewCard || !els.lineupPreviewList) return;
  if (!shouldShowLineupPreview(game)) {
    els.lineupPreviewCard.hidden = true;
    els.lineupPreviewCard.classList.remove("is-visible");
    return;
  }
  const rows = upcomingLineupPreviewRows(game);
  if (els.lineupPreviewEyebrow) {
    els.lineupPreviewEyebrow.textContent = isLionsAtBat(game) ? "Lions Batting" : `${game.opponent || "Opponent"} Batting`;
  }
  if (els.lineupPreviewTitle) els.lineupPreviewTitle.textContent = lineupPreviewHeading(game);
  els.lineupPreviewList.innerHTML = rows.map((row) => `<article class="lineup-preview-row">
    <span>${escapeHtml(row.slot)}</span>
    <strong>${row.number ? `#${escapeHtml(row.number)} ` : ""}${escapeHtml(row.name)}</strong>
    <em>${escapeHtml(row.role || "Ready")}</em>
  </article>`).join("");
  els.lineupPreviewCard.hidden = false;
  els.lineupPreviewCard.classList.add("is-visible");
}

function shouldShowBatterIntro(game = activeGame()) {
  const key = currentBatterIntroKey(game);
  if (!key || shownBatterIntroKeys.has(key)) return false;
  if (shouldShowLineupPreviewByState(game)) return false;
  if (game?.atBat?.pitches?.length) return false;
  if (game?.atBat?.pendingInPlay || awaitingSprayLocation || awaitingRunnerDecision) return false;
  return Boolean(currentBatterIntroContext(game));
}

function dismissBatterIntro(game = activeGame(), options = {}) {
  const { markShown = true, rerender = false } = options;
  const key = visibleBatterIntroKey || currentBatterIntroKey(game);
  if (markShown && key) shownBatterIntroKeys.add(key);
  clearBatterIntroTimer();
  clearPendingBatterIntro();
  visibleBatterIntroKey = "";
  if (els.batterIntroCard) {
    els.batterIntroCard.hidden = true;
    els.batterIntroCard.classList.remove("is-visible");
  }
  syncBatterIntroLockState(false);
  if (rerender) {
    renderAtBat();
    renderScoringStepPanel();
  }
}

function renderBatterIntro(game = activeGame()) {
  if (!els.batterIntroCard || !els.batterIntroName || !els.batterIntroMeta || !els.batterIntroList) return;
  const intro = currentBatterIntroContext(game);
  const introKey = currentBatterIntroKey(game);
  if (!shouldShowBatterIntro(game)) {
    if (!introKey || visibleBatterIntroKey !== introKey) {
      dismissBatterIntro(game, { markShown: false });
    }
    return;
  }
  if (runScoreFeedback) {
    pendingBatterIntroKey = introKey;
    clearBatterIntroTimer();
    visibleBatterIntroKey = "";
    if (els.batterIntroCard) {
      els.batterIntroCard.hidden = true;
      els.batterIntroCard.classList.remove("is-visible");
    }
    syncBatterIntroLockState(false);
    return;
  }
  clearPendingBatterIntro();
  els.batterIntroName.textContent = intro?.name || "Current batter";
  els.batterIntroMeta.textContent = intro?.meta || "";
  els.batterIntroList.innerHTML = "";
  els.batterIntroList.hidden = true;
  els.batterIntroCard.hidden = false;
  els.batterIntroCard.classList.add("is-visible");
  syncBatterIntroLockState(true);
  if (visibleBatterIntroKey === introKey) return;
  visibleBatterIntroKey = introKey;
  clearBatterIntroTimer();
  batterIntroTimer = window.setTimeout(() => {
    if (visibleBatterIntroKey !== introKey) return;
    dismissBatterIntro(activeGame(), { rerender: true });
  }, BATTER_INTRO_DURATION_MS);
}

function logPitch(type) {
  return applyEvent(activeGame(), { type: "pitch", outcome: type });
}

function autoCompleteResult(result) {
  return applyEvent(activeGame(), { type: "resolve_play", result });
}

function maybeAutoCompleteBattedBall() {
  const game = activeGame();
  const result = els.resultSelect.value;
  if (!isLionsAtBat(game)) return;
  if (!game.atBat?.pendingInPlay && !awaitingSprayLocation) return;
  if (!battedBallResults.has(result)) return;
  if (!bipOutcomeChosen) {
    els.sprayHint.textContent = "Select the outcome before the field tap saves the AB.";
    return;
  }
  if (!pendingSpray) {
    awaitingSprayLocation = true;
    if (game.atBat) game.atBat.pendingInPlay = false;
    els.sprayHint.textContent = "Now tap the field where the ball landed or was fielded.";
    renderAtBat();
    renderRunnerTracker();
    return;
  }
  awaitingSprayLocation = false;
  awaitingRunnerDecision = true;
  if (game.atBat) game.atBat.pendingInPlay = false;
  els.sprayHint.textContent = "Review runner outs, then tap Resolve Play.";
  renderAtBat();
  renderRunnerTracker();
}

function undoPitch() {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  const plateAppearance = getCurrentPlateAppearance(game, false);
  if (!game.atBat || !game.atBat.pitches.length) return;
  game.atBat.pitches.pop();
  if (plateAppearance?.pitches?.length) plateAppearance.pitches.pop();
  const pitches = normalizePitchTrail(game.atBat.pitches);
  game.atBat = makeAtBat();
  game.atBat.pitches = pitches;
  const lastPitch = pitches[pitches.length - 1];
  game.atBat.balls = lastPitch?.ballsAfter || 0;
  game.atBat.strikes = lastPitch?.strikesAfter || 0;
  game.atBat.pendingInPlay = pitches.some((pitch) => pitch.inPlay);
  if (!game.atBat.pendingInPlay) {
    clearPendingPlayState(game, true);
  }
  if (plateAppearance) plateAppearance.pitches = pitches;
  if (game.current) {
    game.current.balls = game.atBat.balls;
    game.current.strikes = game.atBat.strikes;
  }
  saveState();
  renderAtBat();
  renderScoringStepPanel();
}

function logPlay() {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (isOpponentAtBat(game)) {
    logOpponentOutcome(els.resultSelect.value || "GO");
    return;
  }
  if (game.status !== "completed") game.status = "active";
  game.opponent = game.opponent || "Opponent";
  game.date = game.date || todayValue();

  const playerId = currentBatterId(game);
  const result = els.resultSelect.value;
  const rule = eventRules[result];
  startPlateAppearance(game, playerId, "");
  const runnerAdvancements = runnerAdvancementsForPlay(game, result, playerId);
  const runs = runnerAdvancements.filter((advancement) => advancement.to === "home" && !advancement.out && !advancement.remove).length;
  const rbi = automaticRbiForPlay(result, runs);
  const outsRecorded = result === "DP" ? 2 : undefined;
  const snapshotBefore = liveGameSnapshot(game);
  const inningBeforePlay = game.inning;
  const halfBeforePlay = game.half;

  finalizePlateAppearance(game, {
    type: result,
    runsScored: runs,
    rbi,
    contact: els.contactSelect.value,
    launch: rule.launch || els.launchSelect.value,
    sprayChart: battedBallResults.has(result) ? pendingSpray : null,
    fieldedBy: scorebookFielderResults.has(result) ? pendingOutFielder : "",
    runnerAdvancements,
    outsRecorded,
    errorOnPlay: result === "ROE" || Boolean(els.errorFielderSelect.value),
    errorFielderPosition: els.errorFielderSelect.value || (result === "ROE" ? pendingOutFielder : ""),
    notes: els.noteInput.value.trim(),
    snapshotBefore
  });
  const halfInningChanged = game.inning !== inningBeforePlay || game.half !== halfBeforePlay;
  clearPendingPlayState(game, true);

  els.runsInput.value = "0";
  els.rbiInput.value = "0";
  resetBipChoiceControls();
  if (halfInningChanged) clearPendingPlayState(game, true);
  else renderRunnerTracker();
  els.noteInput.value = "";
  saveState();
  render();
}

function automaticRbiForPlay(result, runs) {
  if (!runs) return 0;
  if (result === "ROE" || result === "DP") return 0;
  if (result === "FC") return runs;
  return runs;
}

function runnerAdvancementsForPlay(game, result, batterId) {
  const choiceKeys = Object.keys(pendingRunnerChoices);
  if (choiceKeys.length) return runnerAdvancementsFromChoices(game, batterId, result);
  const advancements = defaultRunnerAdvancements(game, result, batterId);
  const bases = deepClone(game.current?.runners || game.bases || emptyBases(false));
  if (result === "DP") {
    for (let index = advancements.length - 1; index >= 0; index -= 1) {
      if (advancements[index].out) advancements.splice(index, 1);
    }
  }
  const selectedOuts = new Set(pendingRunnerOutBases.filter((base) => isOccupied(bases[base])));
  if (result === "DP" && !selectedOuts.size) {
    if (isOccupied(bases.first)) selectedOuts.add("first");
    else if (isOccupied(bases.second)) selectedOuts.add("second");
    else if (isOccupied(bases.third)) selectedOuts.add("third");
  }
  selectedOuts.forEach((base) => {
    const runnerId = bases[base];
    const existingIndex = advancements.findIndex((advancement) => advancement.from === base);
    if (existingIndex >= 0) advancements.splice(existingIndex, 1);
    advancements.push({ runnerId, from: base, out: true });
  });
  return advancements;
}

function runnerAdvancementsFromChoices(game, batterId, result) {
  const bases = deepClone(game.current?.runners || game.bases || emptyBases(false));
  const advancements = [];
  ["third", "second", "first"].forEach((base) => {
    const runnerId = bases[base];
    if (!isOccupied(runnerId)) return;
    const choice = runnerChoiceDestination(base);
    if (choice === "hold") return;
    advancements.push(choice === "out"
      ? { runnerId, from: base, out: true }
      : { runnerId, from: base, to: choice });
  });
  const batterChoice = runnerChoiceDestination("batter") || "out";
  if (batterChoice === "out") {
    if (!eventRules[result]?.out) advancements.push({ runnerId: batterId, from: "batter", out: true });
  } else {
    advancements.push({ runnerId: batterId, from: "batter", to: batterChoice });
  }
  return advancements;
}

function runnerChoiceDestination(base) {
  const choice = pendingRunnerChoices[base];
  if (!choice) return "";
  return typeof choice === "object" ? choice.to : choice;
}

function validateRunnerDecisionChoices(game = activeGame(), result = els.resultSelect.value) {
  const bases = game.current?.runners || game.bases || emptyBases(false);
  const assignedBases = {};
  const addDestination = (destination, label) => {
    if (!["first", "second", "third"].includes(destination)) return "";
    if (!assignedBases[destination]) {
      assignedBases[destination] = label;
      return "";
    }
    return `Only one runner can end at ${baseLabel(destination)}. Adjust ${assignedBases[destination]} or ${label} before confirming.`;
  };

  for (const base of ["third", "second", "first"]) {
    const runnerId = bases[base];
    if (!isOccupied(runnerId)) continue;
    const choice = runnerChoiceDestination(base) || "hold";
    const destination = choice === "hold" ? base : choice;
    const label = runnerName(runnerId) || `runner from ${baseLabel(base)}`;
    const message = addDestination(destination, label);
    if (message) return { valid: false, message };
  }

  const batterDestination = runnerChoiceDestination("batter") || defaultBatterDestination(result);
  const batterMessage = addDestination(batterDestination, currentBatterLabel(game) || "batter");
  if (batterMessage) return { valid: false, message: batterMessage };
  return { valid: true, message: "" };
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function nextBatterIndex(index, game = activeGame()) {
  const total = Math.max(gameLineupPlayerIds(game).length, 1);
  return (index + 1) % total;
}

function suggestRunValues() {
  const game = activeGame();
  if (els.resultSelect.value === "HR") {
    const occupied = Object.values(game.bases).filter(Boolean).length;
    const runs = occupied + 1;
    els.runsInput.value = String(runs);
    els.rbiInput.value = String(runs);
    selectChoice("launch", "fb", true);
  } else if (["K", "BB", "HBP", "SB", "CS"].includes(els.resultSelect.value)) {
    clearPendingPlayState(game, true);
    if (["BB", "HBP"].includes(els.resultSelect.value) && game.bases.first && game.bases.second && game.bases.third) {
      els.runsInput.value = "1";
      els.rbiInput.value = "1";
    }
    selectChoice("contact", "none", true);
    selectChoice("launch", "none", true);
    renderAtBat();
    renderSprayChart();
  } else if (battedBallResults.has(els.resultSelect.value)) {
    if (game.atBat && !bipOutcomeChosen && !awaitingSprayLocation) game.atBat.pendingInPlay = true;
    if (els.launchSelect.value === "none") selectChoice("launch", "ld", true);
    renderAtBat();
  }
  renderAutoScorePreview();
}

function applyBaseMovement(game, result, batterId = true) {
  const bases = game.bases;
  if (result === "HR") {
    game.bases = { first: false, second: false, third: false };
    return;
  }

  if (["1B", "2B", "3B"].includes(result)) {
    const move = Number(result.slice(0, 1));
    const occupied = [];
    if (isOccupied(bases.third)) occupied.push({ base: 3, runner: bases.third });
    if (isOccupied(bases.second)) occupied.push({ base: 2, runner: bases.second });
    if (isOccupied(bases.first)) occupied.push({ base: 1, runner: bases.first });
    const next = { first: false, second: false, third: false };
    occupied.forEach(({ base, runner }) => {
      const destination = base + move;
      if (destination === 1) next.first = runner;
      if (destination === 2) next.second = runner;
      if (destination === 3) next.third = runner;
    });
    if (move === 1) next.first = batterId;
    if (move === 2) next.second = batterId;
    if (move === 3) next.third = batterId;
    game.bases = next;
    return;
  }

  if (["BB", "HBP", "ROE"].includes(result)) {
    const next = { ...bases };
    if (isOccupied(next.first) && isOccupied(next.second)) next.third = next.second;
    if (isOccupied(next.first)) next.second = next.first;
    next.first = batterId;
    game.bases = next;
    return;
  }

  if (result === "FC") {
    game.bases = { ...bases, first: batterId };
    if (isOccupied(bases.first)) game.bases.second = false;
    return;
  }

  if (result === "SB") {
    if (isOccupied(bases.third)) return;
    if (isOccupied(bases.second)) {
      game.bases = { first: bases.first, second: false, third: bases.second };
    } else if (isOccupied(bases.first)) {
      game.bases = { first: false, second: bases.first, third: bases.third };
    }
    return;
  }

  if (result === "CS") {
    if (isOccupied(bases.third)) game.bases.third = false;
    else if (isOccupied(bases.second)) game.bases.second = false;
    else if (isOccupied(bases.first)) game.bases.first = false;
  }
}

function isOccupied(value) {
  return Boolean(value);
}

function baseKeyForSteal(target, sourceBase = "") {
  const source = ["first", "second", "third"].includes(sourceBase) ? sourceBase : "";
  const inferred = target === "second"
    ? { from: "first", to: "second", label: "2B" }
    : target === "third"
      ? { from: "second", to: "third", label: "3B" }
      : { from: "third", to: "home", label: "Home" };
  if (!source) return inferred;
  const to = target || nextBaseForRunner(source);
  return { from: source, to, label: baseLabel(to) };
}

function nextBaseForRunner(base) {
  if (base === "first") return "second";
  if (base === "second") return "third";
  if (base === "third") return "home";
  return "";
}

function recordSteal(target, outcome, sourceBase = "") {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (game.status !== "completed") game.status = "active";
  syncGameCurrent(game);
  reconcileGameBasesFromEvents(game);
  const steal = baseKeyForSteal(target, sourceBase);
  const runner = game.bases?.[steal.from];
  if (!isOccupied(runner)) return;
  const runnerId = runnerIdentity(runner) || runner;
  const targetRunner = steal.to !== "home" ? game.bases?.[steal.to] : false;
  if (steal.to !== "home" && isOccupied(targetRunner) && !sameRunnerValue(targetRunner, runner)) return;

  const snapshotBefore = liveGameSnapshot(game);
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "runnerAction", result: outcome === "safe" ? "SB" : "CS" });
  const runnerAdvancements = [
    outcome === "safe"
      ? { runnerId, from: steal.from, to: steal.to }
      : { runnerId, from: steal.from, out: true }
  ];

  const movement = applyRunnerAdvancements(game, runnerAdvancements);
  if (outcome === "safe" && movement.runsScored) {
    addRunsForBattingTeam(game, movement.runsScored);
  }
  if (outcome === "out") {
    game.current.outs += movement.outsRecorded;
  }
  commitCurrentToLegacy(game);

  const event = {
    id: uuid(),
    gameId: game.id,
    playerId: runnerId || currentBatterModelId(game),
    opponentBatter: isOpponentAtBat(game) ? String(runnerId || currentBatterModelId(game)).replace(/^opp:/, "") : undefined,
    result: outcome === "safe" ? "SB" : "CS",
    runs: outcome === "safe" && steal.to === "home" ? 1 : 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current?.inning ?? game.inning,
    half: game.current?.half ?? game.half,
    outsBefore: snapshotBefore.outs,
    outsAfter: game.current?.outs ?? game.outs,
    basesBefore: { ...snapshotBefore.bases },
    basesAfter: { ...game.bases },
    scope: isLionsAtBat(game) ? "offense" : "defense",
    note: `${outcome === "safe" ? "Safe steal of" : "Caught stealing"} ${steal.label}`,
    pitches: [],
    count: game.atBat ? `${game.atBat.balls}-${game.atBat.strikes}` : "0-0",
    spray: null,
    runnerAdvancements: deepClone(runnerAdvancements),
    createdAt: new Date().toISOString(),
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  };
  game.events.push(event);
  selectedFieldRunnerBase = "";
  scoringStep = "pitch";
  if (game.outs >= 3) advanceHalfInning(game);
  saveState();
  render();
}

function recordBalk(target, sourceBase = "") {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (game.status !== "completed") game.status = "active";
  syncGameCurrent(game);
  reconcileGameBasesFromEvents(game);
  const balk = baseKeyForSteal(target, sourceBase);
  const runner = game.bases?.[balk.from];
  if (!isOccupied(runner)) return;
  const runnerId = runnerIdentity(runner) || runner;
  const targetRunner = balk.to !== "home" ? game.bases?.[balk.to] : false;
  if (balk.to !== "home" && isOccupied(targetRunner) && !sameRunnerValue(targetRunner, runner)) return;

  const snapshotBefore = liveGameSnapshot(game);
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "runnerAction", result: "BK" });
  const runnerAdvancements = [{ runnerId, from: balk.from, to: balk.to }];
  const movement = applyRunnerAdvancements(game, runnerAdvancements);
  if (movement.runsScored) {
    addRunsForBattingTeam(game, movement.runsScored);
  }
  commitCurrentToLegacy(game);

  const createdAt = new Date().toISOString();
  game.events.push({
    id: uuid(),
    gameId: game.id,
    playerId: runnerId || currentBatterModelId(game),
    opponentBatter: isOpponentAtBat(game) ? String(runnerId || currentBatterModelId(game)).replace(/^opp:/, "") : undefined,
    result: "BK",
    runs: movement.runsScored,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current?.inning ?? game.inning,
    half: game.current?.half ?? game.half,
    outsBefore: snapshotBefore.outs,
    outsAfter: game.current?.outs ?? game.outs,
    basesBefore: { ...snapshotBefore.bases },
    basesAfter: { ...game.bases },
    scope: isLionsAtBat(game) ? "offense" : "defense",
    note: `${runnerName(runner) || "Runner"} advanced on balk to ${baseLabel(balk.to)}`,
    pitches: [],
    count: game.atBat ? `${game.atBat.balls}-${game.atBat.strikes}` : "0-0",
    spray: null,
    runnerAdvancements: deepClone(runnerAdvancements),
    createdAt,
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  });
  selectedFieldRunnerBase = "";
  scoringStep = "pitch";
  saveState();
  render();
}

function recordPickoff(base) {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (game.status !== "completed") game.status = "active";
  syncGameCurrent(game);
  reconcileGameBasesFromEvents(game);
  const runner = game.bases?.[base];
  if (!isOccupied(runner)) return;
  const runnerId = runnerIdentity(runner) || runner;

  const snapshotBefore = liveGameSnapshot(game);
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "runnerAction", result: "PO" });

  const movement = applyRunnerAdvancements(game, [{ runnerId, from: base, out: true }]);
  game.current.outs += movement.outsRecorded;
  commitCurrentToLegacy(game);

  game.events.push({
    id: uuid(),
    gameId: game.id,
    playerId: runnerId || currentBatterModelId(game),
    opponentBatter: isOpponentAtBat(game) ? String(runnerId || currentBatterModelId(game)).replace(/^opp:/, "") : undefined,
    result: "PO",
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current?.inning ?? game.inning,
    half: game.current?.half ?? game.half,
    outsBefore: snapshotBefore.outs,
    outsAfter: game.current?.outs ?? game.outs,
    basesBefore: { ...snapshotBefore.bases },
    basesAfter: { ...game.bases },
    scope: isLionsAtBat(game) ? "offense" : "defense",
    note: `Picked off at ${baseLabel(base)}`,
    pitches: [],
    count: game.atBat ? `${game.atBat.balls}-${game.atBat.strikes}` : "0-0",
    spray: null,
    runnerAdvancements: [{ runnerId, from: base, out: true }],
    createdAt: new Date().toISOString(),
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  });
  selectedFieldRunnerBase = "";
  scoringStep = "pitch";
  if (game.outs >= 3) advanceHalfInning(game);
  saveState();
  render();
}

function recordTagUp(target) {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (game.status !== "completed") game.status = "active";
  syncGameCurrent(game);
  reconcileGameBasesFromEvents(game);
  const tag = tagUpMovement(target);
  if (!tag) return;
  const runner = game.bases[tag.from];
  if (!isOccupied(runner)) return;
  const runnerId = runnerIdentity(runner) || runner;
  if (tag.to !== "home" && isOccupied(game.bases[tag.to])) return;

  const snapshotBefore = liveGameSnapshot(game);
  const playHistoryEntry = pushPlayHistorySnapshot(game, { reason: "runnerAction", result: "TAG" });
  const movement = applyRunnerAdvancements(game, [{ runnerId, from: tag.from, to: tag.to }]);
  if (movement.runsScored) {
    addRunsForBattingTeam(game, movement.runsScored);
  }
  const createdAt = new Date().toISOString();
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: isLionsAtBat(game) ? runnerId : undefined,
    opponentBatter: isOpponentAtBat(game) ? currentOpponentBatter(game) : undefined,
    result: "TAG",
    runs: movement.runsScored,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.inning,
    half: game.half,
    outsBefore: snapshotBefore.outs,
    outsAfter: game.outs,
    basesBefore: snapshotBefore.bases,
    basesAfter: deepClone(game.bases),
    scope: isLionsAtBat(game) ? "offense" : "defense",
    note: `${runnerName(runner) || "Runner"} tagged up to ${baseLabel(tag.to)}`,
    pitches: [],
    count: `${game.atBat?.balls || 0}-${game.atBat?.strikes || 0}`,
    spray: null,
    runnerAdvancements: [{ runnerId, from: tag.from, to: tag.to }],
    createdAt,
    snapshotBefore,
    playHistoryId: playHistoryEntry?.id || ""
  });
  commitCurrentToLegacy(game);
  saveState();
  render();
}

function tagUpMovement(target) {
  if (target === "second") return { from: "first", to: "second" };
  if (target === "third") return { from: "second", to: "third" };
  if (target === "home") return { from: "third", to: "home" };
  return null;
}

function logOpponentOutcome(result, options = {}) {
  const game = activeGame();
  if (gameIsScoreLocked(game)) return;
  if (game.status !== "completed") game.status = "active";
  const batter = currentOpponentBatter(game);
  const pitcherId = currentPitcherId(game);
  const batterId = `opp:${batter}`;
  startPlateAppearance(game, batterId, pitcherId);
  const runnerAdvancements = runnerAdvancementsForPlay(game, result, batterId);
  const runs = runnerAdvancements.filter((advancement) => advancement.to === "home" && !advancement.out && !advancement.remove).length;
  const rbi = automaticRbiForPlay(result, runs);
  const snapshotBefore = liveGameSnapshot(game);

  finalizePlateAppearance(game, {
    type: result,
    runsScored: runs,
    rbi,
    contact: "none",
    launch: eventRules[result]?.launch || "none",
    fieldedBy: options.fieldedBy || "",
    pitcherId,
    runnerAdvancements,
    notes: "Opponent plate appearance",
    snapshotBefore
  });
  clearPendingPlayState(game, true);
  saveState();
  render();
}

function advanceHalf(game) {
  advanceHalfInning(game);
}

function undoLastPlay(options = {}) {
  const game = activeGame();
  const allowFinal = Boolean(options.allowFinal);
  if (!allowFinal && gameIsScoreLocked(game)) return;
  if (allowFinal && !gameIsFinal(game) && game?.status !== "active") return;
  const history = Array.isArray(game.playHistory) ? game.playHistory : [];
  const historyEntry = history[history.length - 1];
  if (!historyEntry) return;
  const wasFinal = gameIsFinal(game);
  restorePlayHistorySnapshot(game, historyEntry, history.slice(0, -1));
  if (wasFinal || !gameIsFinal(game)) clearGameCompleteSummary(game.id);
  saveState();
  render();
}

function startNewGame() {
  const game = makeUniqueGame({ opponent: "Opponent" });
  state.games.push(game);
  state.activeGameId = game.id;
  saveGameToLibrary(game, true);
  clearPendingPlayState(game, true);
  saveState();
  render();
}

async function scheduleGame() {
  if (!requireAdminAccess("Admin sign-in required to create games.")) return;
  if (!(await ensureFreshSharedBaseline("schedule-game"))) {
    window.alert("We couldn't refresh the latest shared schedule yet. Try again in a moment.");
    return;
  }
  const opponent = els.opponentInput.value.trim() || "Opponent";
  const date = selectedGameDate(els.gameDateInput);
  const game = makeUniqueGame({ opponent, lionsSide: els.gameLionsSideInput.value || "home" });
  const location = selectedFieldLocation(els.gameLocationInput);
  game.date = date;
  game.time = els.gameTimeInput.value || "";
  game.location = location.name;
  game.locationAddress = location.address;
  game.notes = "";
  game.status = "scheduled";
  syncGameTeams(game, game.lionsSide);
  state.games.push(game);
  markSharedGamesDirty(game.id);
  saveGameToLibrary(game, false);
  clearPendingPlayState(game, true);
  saveState();
  resetGameCreationForm();
  hideGameCreateForm();
  render();
  requestSharedSnapshotSync("schedule-game");
}

function showGameCreateForm() {
  if (!requireAdminAccess("Admin sign-in required to create games.")) return;
  if (!els.gameForm) return;
  els.gameForm.hidden = false;
  els.scheduleGameBtn.hidden = true;
  configureGameDateInputs();
  if (!els.gameDateInput.value) els.gameDateInput.value = todayValue();
  renderGameSetupPreview();
  els.opponentInput?.focus();
}

function hideGameCreateForm() {
  if (!els.gameForm) return;
  els.gameForm.hidden = true;
  if (els.scheduleGameBtn) els.scheduleGameBtn.hidden = false;
  resetGameCreationForm();
}

function renderGameSetupPreview() {
  if (!els.gameSetupTeamIndicator) return;
  const opponent = els.opponentInput.value.trim() || "Opponent";
  const side = normalizeLionsSide(els.gameLionsSideInput?.value || "home");
  const away = side === "away" ? "Lions" : opponent;
  const home = side === "home" ? "Lions" : opponent;
  els.gameSetupTeamIndicator.innerHTML = `<span>Away: ${escapeHtml(away)}</span><strong>Home: ${escapeHtml(home)}</strong>`;
}

function resetGameCreationForm() {
  els.opponentInput.value = "";
  if (els.gameLionsSideInput) els.gameLionsSideInput.value = "home";
  els.gameDateInput.value = todayValue();
  configureGameDateInputs();
  els.gameTimeInput.value = "";
  els.gameLocationInput.value = "";
  if (els.gameNotesInput) els.gameNotesInput.value = "";
  [els.opponentInput, els.gameLionsSideInput, els.gameDateInput, els.gameTimeInput, els.gameLocationInput, els.gameNotesInput]
    .filter(Boolean)
    .forEach((input) => {
      delete input.dataset.dirty;
    });
  renderGameSetupPreview();
}

function scoreScheduledGame(gameId) {
  if (!requireAdminAccess("Admin sign-in required to score games.")) return;
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  if (gameIsPostponed(game)) {
    resumePostponedGame(game.id);
    return;
  }
  if (game.status === "active") {
    openActiveGameForScoring(game);
    return;
  }
  openLineupBuilder(game.id, "games");
}

function confirmLineupAndStartGame() {
  if (!requireAdminAccess("Admin sign-in required to start games.")) return;
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game) || gameIsPostponed(game)) return;
  const readiness = lineupReadiness(game);
  if (!readiness.ready) {
    renderLineupBuilder();
    return;
  }
  game.lineupEntries = startingLineupEntries(game);
  if (game.lineupEntries.some((entry) => !entry.playerId)) {
    renderLineupBuilder();
    return;
  }
  game.lineups.away = deepClone(game.lineupEntries);
  game.batterIndex = 0;
  game.opponentBatterIndex = 0;
  game.inning = 1;
  game.half = "top";
  game.outs = 0;
  game.bases = emptyBases(false);
  game.currentPlateAppearanceId = "";
  game.atBat = makeAtBat();
  game.pitcherId = els.lineupPitcherSelect?.value || game.pitcherId || game.lineupEntries.find((entry) => entry.role === "P")?.playerId || "";
  game.status = "active";
  syncGameCurrent(game);
  setActiveGame(game.id);
  clearPendingPlayState(game, true);
  lineupBuilderGameId = null;
  saveState();
  render();
  switchView("score");
}

function startNextGameFromHome() {
  if (!requireAdminAccess("Admin sign-in required to start games.")) return;
  const next = nextScheduledGame();
  if (!next) return;
  openLineupBuilder(next.id, "home");
}

function homeNextGameScoreButtonLabel(game) {
  return game?.status === "active" && !gameIsFinal(game) ? "Score Game" : "Start Game";
}

function openActiveGameForScoring(game, options = {}) {
  if (!game || gameIsFinal(game) || game.status !== "active") return false;
  setActiveGame(game.id);
  syncGameCurrent(game);
  saveState(options.saveStateOptions || {});
  render();
  switchView("score");
  return true;
}

function handleHomeNextGameScoreAction() {
  if (!requireAdminAccess("Admin sign-in required to score games.")) return;
  const gameId = els.homeNextGameScoreBtn?.dataset.gameId || "";
  const game = state.games.find((item) => item.id === gameId) || inProgressGames()[0] || nextScheduledGame();
  if (!game || gameIsFinal(game)) return;
  if (game.status === "active") {
    openActiveGameForScoring(game);
    return;
  }
  openLineupBuilder(game.id, "home");
}

function quickScoreGame() {
  return state.games.find((game) => game.id === quickScoreGameId) || null;
}

function quickScoreInputValue(input) {
  const score = Number.parseInt(input?.value || "0", 10);
  if (Number.isNaN(score)) return 0;
  return Math.min(99, Math.max(0, score));
}

function completeGameLocally(game, options = {}) {
  if (!game) return;
  if (game.status === "active") syncGameCurrent(game);
  game.status = "completed";
  if (options.scoringSource) game.scoringSource = options.scoringSource;
  if (options.quickScored) game.quickScored = true;
  if (!game.completedAt) game.completedAt = new Date().toISOString();
  game.currentPlateAppearanceId = "";
  game.atBat = makeAtBat();
  game.pendingScoring = null;
  clearPendingPlayState(game, true);
  markSharedGamesDirty(game.id);
  markGameSyncPending(game);
  moveActiveGameOffFinal(game.id);
  clearLiveGameSnapshotSyncTimer();
}

function openQuickScoreModal(gameId) {
  if (!requireAdminAccess("Admin sign-in required to enter final scores.")) return;
  const game = state.games.find((item) => item.id === gameId);
  if (!game || gameIsFinal(game) || !els.quickScoreModal) return;
  quickScoreGameId = game.id;
  if (els.quickScoreTitle) els.quickScoreTitle.textContent = "Quick Score";
  if (els.quickScoreMeta) {
    els.quickScoreMeta.textContent = `${gameMatchupLabel(game)} | ${formatGameDateWithYear(game.date || todayValue())}`;
  }
  if (els.quickScoreLionsLabel) els.quickScoreLionsLabel.textContent = "Lions";
  if (els.quickScoreOpponentLabel) els.quickScoreOpponentLabel.textContent = homeOpponentName(game);
  if (els.quickScoreLionsInput) els.quickScoreLionsInput.value = String(Number(game.score?.lions || 0));
  if (els.quickScoreOpponentInput) els.quickScoreOpponentInput.value = String(Number(game.score?.opponent || 0));
  els.quickScoreModal.hidden = false;
  window.setTimeout(() => els.quickScoreLionsInput?.focus(), 0);
}

function closeQuickScoreModal() {
  quickScoreGameId = "";
  if (els.quickScoreModal) els.quickScoreModal.hidden = true;
}

async function saveQuickScoreResult(event) {
  event?.preventDefault?.();
  if (!requireAdminAccess("Admin sign-in required to enter final scores.")) return;
  if (!(await ensureFreshSharedBaseline("quick-score"))) {
    window.alert("We couldn't refresh the latest shared schedule yet. Try again in a moment.");
    return;
  }
  const game = quickScoreGame();
  if (!game || gameIsFinal(game)) return;
  game.score = {
    ...(game.score || {}),
    lions: quickScoreInputValue(els.quickScoreLionsInput),
    opponent: quickScoreInputValue(els.quickScoreOpponentInput)
  };
  syncScoreBySide(game);
  completeGameLocally(game, { scoringSource: "quick-score", quickScored: true });
  closeQuickScoreModal();
  saveStateWithOptions({ markLiveGamesDirty: false });
  render();
  requestSharedSnapshotSync("quick-score");
}

function handleGameActionClick(event) {
  const button = event.target.closest("[data-game-action]");
  if (!button) return;
  const gameId = button.dataset.gameId;
  if (button.dataset.gameAction === "summary") openGameSummary(gameId);
  if (button.dataset.gameAction === "scorebook") openGameScorebook(gameId);
  if (button.dataset.gameAction === "stats") openGameStats(gameId);
  if (button.dataset.gameAction === "boxscore") openBoxScore(gameId);
  if (button.dataset.gameAction === "highlights") openGameHighlights(gameId);
  if (button.dataset.gameAction === "quick-score") openQuickScoreModal(gameId);
  if (button.dataset.gameAction === "sync") {
    syncCompletedGame(gameId).catch((error) => {
      const game = state.games.find((item) => item.id === gameId);
      markGameSyncFailed(game, error);
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();
    });
  }
}

function openGameSummary(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  gameSummaryId = game.id;
  renderGameSummary();
  switchView("archive");
}

function openGameScorebook(gameId) {
  if (!state.games.some((game) => game.id === gameId)) return;
  scorebookGameId = gameId;
  renderTraditionalScorebook();
  switchView("scorebook");
}

function openBoxScore(gameId) {
  if (!state.games.some((game) => game.id === gameId)) return;
  const sourceView = canAccessView(currentView) ? currentView : (isAdminMode() ? "archive" : "games");
  boxScoreReturnView = sourceView === "analysis" ? "archive" : sourceView;
  boxScoreGameId = gameId;
  renderBoxScore();
  switchView("boxscore");
}

function openGameStats(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  const gameSeason = String(game?.date || "").slice(0, 4);
  if (/^\d{4}$/.test(gameSeason)) statsSeasonFilter = normalizeStatsSeasonFilter(gameSeason);
  statsPlayerFocus = "all";
  desktopHitPlayerFilter = "all";
  desktopPitPlayerFilter = "all";
  mobileHitPlayerFilter = "all";
  mobilePitPlayerFilter = "all";
  mobileHitGameFilter = game.id;
  mobilePitGameFilter = game.id;
  renderSeasonStats();
  const select = els.statsSprayGameSelect;
  if (select) {
    renderStatsSprayControls();
    if ([...select.options].some((option) => option.value === game.id)) select.value = game.id;
    renderStatsSprayChart();
  }
  switchView("stats");
}

function defaultStatsSeasonForPlayer(playerId) {
  const seasons = availableStatsSeasons();
  const match = seasons.find((season) => {
    const hit = statsForPlayer(playerId, season);
    const pit = pitcherStats(playerId, null, season);
    return hit.pa > 0 || hasPitchingStats(pit);
  });
  return normalizeStatsSeasonFilter(match || String(currentLeagueSeason()), seasons);
}

function openPlayerStats(playerId) {
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;
  statsSeasonFilter = defaultStatsSeasonForPlayer(playerId);
  statsPlayerFocus = playerId;
  desktopHitPlayerFilter = playerId;
  desktopPitPlayerFilter = playerId;
  mobileHitPlayerFilter = playerId;
  mobilePitPlayerFilter = playerId;
  mobileHitGameFilter = "all";
  mobilePitGameFilter = "all";
  const hitting = statsForPlayer(playerId, statsSeasonFilter);
  const pitching = pitcherStats(playerId, null, statsSeasonFilter);
  statsMode = hitting.pa > 0 || !hasPitchingStats(pitching) ? "hitting" : "pitching";
  renderSeasonStats();
  renderLeaders();
  renderStatsSprayControls();
  switchView("stats");
}

function lionsWonGame(game) {
  return Boolean(gameIsFinal(game) && Number(game?.score?.lions || 0) > Number(game?.score?.opponent || 0));
}

function lionsWinAnimationKey(details = {}) {
  if (details.gameId) return String(details.gameId);
  return [
    displayTeamName(details.awayTeam || ""),
    displayTeamName(details.homeTeam || ""),
    details.awayScore ?? "",
    details.homeScore ?? ""
  ].join("|");
}

function lionsWinDetailText(details = {}) {
  const awayTeam = displayTeamName(details.awayTeam || "Opponent");
  const homeTeam = displayTeamName(details.homeTeam || "Opponent");
  const awayScore = Number.isFinite(Number(details.awayScore)) ? Number(details.awayScore) : 0;
  const homeScore = Number.isFinite(Number(details.homeScore)) ? Number(details.homeScore) : 0;
  return `${awayTeam} ${awayScore} - ${homeScore} ${homeTeam}`;
}

function lionsWinAnimationPayloadForGame(game, extra = {}) {
  return {
    gameId: game?.id || "",
    homeTeam: homeTeamName(game),
    awayTeam: awayTeamName(game),
    homeScore: scoreForSide(game, "home"),
    awayScore: scoreForSide(game, "away"),
    ...extra
  };
}

function resetLionsWinAnimation() {
  if (lionsWinAnimationTimer) {
    clearTimeout(lionsWinAnimationTimer);
    lionsWinAnimationTimer = null;
  }
  activeLionsWinAnimationGameId = "";
  if (!els.lionsWinOverlay) return;
  const animationTargets = [
    els.lionsWinOverlay,
    ...els.lionsWinOverlay.querySelectorAll(".lions-win-burst, .lions-win-sparks, .lions-win-claw, .lions-win-logo-glow, .lions-win-logo, .lions-win-title, .lions-win-detail")
  ];
  els.lionsWinOverlay.classList.remove("is-static");
  if (window.gsap) {
    window.gsap.killTweensOf(animationTargets);
    window.gsap.set(animationTargets, { clearProps: "all" });
  } else {
    els.lionsWinOverlay.removeAttribute("style");
    animationTargets.forEach((node) => node?.removeAttribute?.("style"));
  }
  els.lionsWinOverlay.hidden = true;
  els.lionsWinOverlay.setAttribute("aria-hidden", "true");
}

function playLionsWinAnimation(details = {}) {
  if (!els.lionsWinOverlay) return false;
  const key = lionsWinAnimationKey(details);
  if (!key) return false;
  if (activeLionsWinAnimationGameId === key || playedLionsWinAnimationGameIds.has(key)) return false;
  playedLionsWinAnimationGameIds.add(key);
  activeLionsWinAnimationGameId = key;
  if (lionsWinAnimationTimer) clearTimeout(lionsWinAnimationTimer);
  if (els.lionsWinText) els.lionsWinText.textContent = "LIONS WIN";
  if (els.lionsWinDetail) els.lionsWinDetail.textContent = lionsWinDetailText(details);
  els.lionsWinOverlay.hidden = false;
  els.lionsWinOverlay.setAttribute("aria-hidden", "false");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const overlay = els.lionsWinOverlay;
  const claws = [...overlay.querySelectorAll(".lions-win-claw")];
  const burst = overlay.querySelector(".lions-win-burst");
  const logoGlow = overlay.querySelector(".lions-win-logo-glow");
  const title = overlay.querySelector(".lions-win-title");
  const detail = overlay.querySelector(".lions-win-detail");
  const onComplete = typeof details.onComplete === "function" ? details.onComplete : null;

  if (reduceMotion || !window.gsap) {
    overlay.classList.add("is-static");
    overlay.style.opacity = "1";
    lionsWinAnimationTimer = setTimeout(() => {
      resetLionsWinAnimation();
      onComplete?.();
    }, 2200);
    return true;
  }

  const gsap = window.gsap;
  gsap.set(overlay, { opacity: 0 });
  gsap.set(claws, {
    opacity: 0,
    xPercent: -120,
    yPercent: 38,
    scale: 0.82
  });
  gsap.set(burst, { opacity: 0, scale: 0.42 });
  gsap.set(els.lionsWinSparks, { opacity: 0 });
  gsap.set(logoGlow, { opacity: 0, scale: 0.56 });
  gsap.set(els.lionsWinLogo, { opacity: 0, scale: 0.68 });
  gsap.set(title, { opacity: 0, y: 56, scale: 0.92 });
  gsap.set(detail, { opacity: 0, y: 28 });

  gsap.timeline({
    onComplete: () => {
      resetLionsWinAnimation();
      onComplete?.();
    }
  })
    .to(overlay, { opacity: 1, duration: 0.28, ease: "power1.out" })
    .to(claws, {
      opacity: 1,
      xPercent: 0,
      yPercent: 0,
      scale: 1,
      duration: 0.3,
      stagger: 0.1,
      ease: "power3.out"
    }, 0.08)
    .to(claws, {
      opacity: 0,
      xPercent: 110,
      yPercent: -30,
      duration: 0.3,
      stagger: 0.08,
      ease: "power2.in"
    }, 0.42)
    .to(burst, { opacity: 1, scale: 1.2, duration: 0.5, ease: "power2.out" }, 0.32)
    .to(els.lionsWinSparks, { opacity: 0.8, duration: 0.5, ease: "power2.out" }, 0.36)
    .to(logoGlow, { opacity: 1, scale: 1, duration: 0.48, ease: "power2.out" }, 0.42)
    .to(els.lionsWinLogo, {
      opacity: 1,
      scale: 1.08,
      duration: 0.52,
      ease: "back.out(1.8)"
    }, 0.45)
    .to(els.lionsWinLogo, { scale: 1, duration: 0.24, ease: "power2.out" })
    .to(title, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.36,
      ease: "back.out(2)"
    }, 0.82)
    .to(detail, {
      opacity: 1,
      y: 0,
      duration: 0.28,
      ease: "power2.out"
    }, 0.94)
    .to(overlay, {
      opacity: 0,
      duration: 0.48,
      ease: "power2.inOut"
    }, "+=1.65");
  return true;
}

function resetHalfInningChangeOverlay() {
  if (halfInningChangeTimer) {
    clearTimeout(halfInningChangeTimer);
    halfInningChangeTimer = null;
  }
  activeHalfInningChangeKey = "";
  if (!els.halfInningOverlay) return;
  els.halfInningOverlay.classList.remove("is-active");
  els.halfInningOverlay.hidden = true;
  els.halfInningOverlay.setAttribute("aria-hidden", "true");
}

function halfInningChangeKey(game = activeGame()) {
  if (!game?.id) return "";
  const inning = Number(game.current?.inning ?? game.inning ?? 1);
  const half = game.current?.half ?? game.half ?? "top";
  return `${game.id}:${inning}:${half}`;
}

function halfInningLabel(game = activeGame()) {
  const inning = Number(game.current?.inning ?? game.inning ?? 1);
  const half = game.current?.half ?? game.half ?? "top";
  return `${half === "top" ? "TOP" : "BOT"} ${inning}${ordinalSuffix(inning).toUpperCase()}`;
}

function halfInningBattingTeamText(game = activeGame()) {
  const side = battingSide(game);
  const teamName = side === "away" ? awayTeamName(game) : homeTeamName(game);
  return `${teamName} batting`;
}

function halfInningAccentColor(game = activeGame()) {
  return isLionsAtBat(game) ? "#f5bd21" : "#7ea0ff";
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function playHalfInningChange(game = activeGame()) {
  if (!els.halfInningOverlay || !game?.id || gameIsFinal(game)) return false;
  const key = halfInningChangeKey(game);
  if (!key || activeHalfInningChangeKey === key) return false;
  activeHalfInningChangeKey = key;
  if (halfInningChangeTimer) clearTimeout(halfInningChangeTimer);
  const accent = halfInningAccentColor(game);
  if (els.halfInningTitle) els.halfInningTitle.textContent = halfInningLabel(game);
  if (els.halfInningSubtitle) els.halfInningSubtitle.textContent = halfInningBattingTeamText(game);
  els.halfInningOverlay.style.setProperty("--half-inning-accent", accent);
  if (els.halfInningFlash) {
    els.halfInningFlash.style.background = `radial-gradient(circle, ${hexToRgba(accent, 0.42)} 0%, ${hexToRgba(accent, 0.14)} 45%, rgba(255,255,255,0) 72%)`;
  }
  [els.halfInningLineTop, els.halfInningLineBottom].forEach((line) => {
    if (!line) return;
    line.style.background = `linear-gradient(90deg, transparent 0%, ${hexToRgba(accent, 0.95)} 30%, ${hexToRgba(accent, 0.95)} 70%, transparent 100%)`;
    line.style.boxShadow = `0 0 12px ${hexToRgba(accent, 0.45)}`;
  });
  els.halfInningOverlay.hidden = false;
  els.halfInningOverlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    els.halfInningOverlay?.classList.add("is-active");
  });
  halfInningChangeTimer = setTimeout(() => {
    resetHalfInningChangeOverlay();
  }, 3375);
  return true;
}

function completeScheduledGame(gameId) {
  if (!requireAdminAccess("Admin sign-in required to change game status.")) return;
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  if (game.status !== "active") return;
  completeGameLocally(game);
  saveStateWithOptions({ markLiveGamesDirty: false });
  render();
  requestSharedSnapshotSync("complete-game");
}

function postponeGame(game, options = {}) {
  if (!requireAdminAccess("Admin sign-in required to postpone games.")) return;
  const { fromScore = false } = options;
  if (!game || gameIsFinal(game) || gameIsPostponed(game)) return;
  const matchup = gameMatchupLabel(game);
  const confirmed = window.confirm(`Postpone ${matchup}? Scoring already recorded for this game will stay saved, but the game will no longer appear as the current or next game.`);
  if (!confirmed) return;
  const previousStatus = game.status === "active" ? "active" : "scheduled";
  if (previousStatus === "active") syncGameCurrent(game);
  game.status = "postponed";
  game.postponedAt = new Date().toISOString();
  game.postponedFromStatus = previousStatus;
  if (fromScore || previousStatus === "active") clearPendingPlayState(game, true);
  markSharedGamesDirty(game.id);
  if (state.activeGameId === game.id) moveActiveGameOffGame(game.id);
  closeGameActionsModal();
  gameFilter = "postponed";
  scheduleGamesLayout = "dashboard";
  saveStateWithOptions({ markLiveGamesDirty: false });
  switchView("games");
  render();
  clearLiveGameSnapshotSyncTimer();
  requestSharedSnapshotSync("postpone-game");
}

function postponeActiveGame() {
  const game = activeScoreGame();
  if (!game || gameIsScoreLocked(game)) return;
  postponeGame(game, { fromScore: true });
}

function postponeScheduledGame(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  postponeGame(game);
}

function resetGameScoringState(game) {
  if (!game) return;
  const startingPitcherId = startingPitcherIdForGame(game)
    || gameLineupEntries(game).find((entry) => entry.role === "P")?.playerId
    || game.pitcherId
    || "";
  game.status = "active";
  game.inning = 1;
  game.half = "top";
  game.outs = 0;
  game.bases = emptyBases(false);
  game.batterIndex = 0;
  game.opponentBatterIndex = 0;
  game.score = { lions: 0, opponent: 0, away: 0, home: 0 };
  game.plateAppearances = [];
  game.currentPlateAppearanceId = "";
  game.substitutions = [];
  game.events = [];
  game.playHistory = [];
  game.atBat = makeAtBat();
  game.pendingScoring = null;
  game.pitcherId = startingPitcherId;
  game.current = {
    inning: 1,
    half: "top",
    outs: 0,
    balls: 0,
    strikes: 0,
    batterId: "",
    pitcherId: startingPitcherId,
    runners: emptyBases(false)
  };
  syncGameTeams(game, lionsSide(game));
  syncGameCurrent(game);
}

function restartActiveGame() {
  if (!requireAdminAccess("Admin sign-in required to restart games.")) return;
  const game = activeScoreGame();
  if (!game || gameIsScoreLocked(game)) return;
  const confirmed = window.confirm(`Restart ${gameMatchupLabel(game)} from the first pitch? This clears the score, plays, stats, pitch counts, runner movement, substitutions, and undo history for this game. The schedule details and lineups stay saved.`);
  if (!confirmed) return;
  resetGameScoringState(game);
  clearPendingPlayState(game, true);
  clearGameCompleteSummary(game.id);
  markSharedGamesDirty(game.id);
  setActiveGame(game.id);
  closeGameActionsModal();
  saveStateWithOptions({ capturePendingScoring: false, markLiveGamesDirty: false });
  render();
  switchView("score");
  clearLiveGameSnapshotSyncTimer();
  requestSharedSnapshotSync("restart-game");
}

function resumePostponedGame(gameId) {
  if (!requireAdminAccess("Admin sign-in required to continue postponed games.")) return;
  const game = state.games.find((item) => item.id === gameId);
  if (!game || gameIsFinal(game) || !gameIsPostponed(game)) return;
  const shouldOpenScore = game.postponedFromStatus === "active" || game.lineupSetupStarted || (game.events || []).length;
  game.resumedFromPostponedAt = new Date().toISOString();
  if (shouldOpenScore) {
    game.status = "active";
    markSharedGamesDirty(game.id);
    openActiveGameForScoring(game, { saveStateOptions: { markLiveGamesDirty: false } });
  } else {
    game.status = "scheduled";
    markSharedGamesDirty(game.id);
    saveStateWithOptions({ markLiveGamesDirty: false });
    openLineupBuilder(game.id, "games");
  }
  clearLiveGameSnapshotSyncTimer();
  requestSharedSnapshotSync("resume-postponed-game");
}

function finishGame() {
  if (!requireAdminAccess("Admin sign-in required to complete games.")) return;
  const current = activeGame();
  if (gameIsScoreLocked(current)) return;
  current.status = "completed";
  markSharedGamesDirty(current.id);
  markGameSyncPending(current);
  clearPendingPlayState(current, true);
  showGameCompleteSummary(current);
  moveActiveGameOffFinal(current.id);
  saveStateWithOptions({ markLiveGamesDirty: false });
  render();
  if (lionsWonGame(current) && playLionsWinAnimation(lionsWinAnimationPayloadForGame(current, {
    onComplete: () => render()
  }))) return;
}

async function addPlayer() {
  if (!requireAdminAccess("Admin sign-in required to edit the roster.")) return;
  if (!(await ensureFreshSharedBaseline("edit-roster"))) {
    window.alert("We couldn't refresh the latest shared roster yet. Try again in a moment.");
    return;
  }
  const name = els.playerName.value.trim();
  if (!name) return;
  const existingPlayer = editingRosterPlayerId
    ? state.roster.find((player) => player.id === editingRosterPlayerId)
    : null;
  if (existingPlayer) {
    existingPlayer.name = name;
    existingPlayer.number = els.playerNumber.value.trim() || "--";
    existingPlayer.positions = String(els.playerPositions.value.trim() || "UTL")
      .split(",")
      .map((position) => position.trim())
      .filter(Boolean);
    existingPlayer.primaryPosition = String(els.playerPrimaryPosition?.value || existingPlayer.positions[0] || "UTL").trim().toUpperCase();
    existingPlayer.bats = els.playerBats.value || "R";
    existingPlayer.throws = els.playerThrows?.value || existingPlayer.bats || "R";
    existingPlayer.height = els.playerHeight?.value.trim() || "";
    existingPlayer.weight = normalizeWeight(els.playerWeight?.value.trim() || "");
  } else {
    const player = makePlayer(
      uuid(),
      name,
      els.playerNumber.value.trim() || "--",
      els.playerPositions.value.trim() || "UTL",
      els.playerBats.value,
      defaultPlayerGrades(),
      {
        primaryPosition: els.playerPrimaryPosition?.value || "UTL",
        throws: els.playerThrows?.value || els.playerBats.value || "R",
        height: els.playerHeight?.value.trim() || "",
        weight: els.playerWeight?.value.trim() || ""
      }
    );
    state.roster.push(player);
    state.lineup.push(player.id);
  }
  markSharedAppStateDirty();
  resetPlayerForm();
  saveState();
  render();
  await syncSharedRosterChangeOrAlert(existingPlayer ? "edit-player" : "add-player");
}

function updatePlayerFormUi() {
  const editing = Boolean(editingRosterPlayerId);
  const detailsOpen = rosterPlayerDetailsOpen();
  const admin = isAdminMode();
  if (els.savePlayerBtn) {
    els.savePlayerBtn.textContent = editing ? "Update Player" : "Save Player";
  }
  if (els.cancelPlayerEditBtn) {
    els.cancelPlayerEditBtn.hidden = !admin || !detailsOpen;
  }
  if (els.addPlayerBtn) {
    els.addPlayerBtn.textContent = editing ? "Add New Player" : "Add Player";
    els.addPlayerBtn.hidden = !admin;
  }
}

function resetPlayerForm() {
  editingRosterPlayerId = "";
  els.playerForm?.reset();
  setRosterPlayerDetailsOpen(false);
  if (els.playerPrimaryPosition) els.playerPrimaryPosition.value = "UTL";
  if (els.playerBats) els.playerBats.value = "R";
  if (els.playerThrows) els.playerThrows.value = "R";
  updatePlayerFormUi();
}

function beginPlayerEdit(playerId) {
  if (!requireAdminAccess("Admin sign-in required to edit the roster.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;
  editingRosterPlayerId = player.id;
  setRosterPlayerDetailsOpen(true);
  if (els.playerName) els.playerName.value = player.name || "";
  if (els.playerNumber) els.playerNumber.value = player.number || "";
  if (els.playerPositions) {
    els.playerPositions.value = Array.isArray(player.positions)
      ? player.positions.join(", ")
      : String(player.positions || "");
  }
  if (els.playerPrimaryPosition) els.playerPrimaryPosition.value = player.primaryPosition || normalizePositions(player.positions)[0] || "UTL";
  if (els.playerBats) els.playerBats.value = player.bats || "R";
  if (els.playerThrows) els.playerThrows.value = player.throws || player.bats || "R";
  if (els.playerHeight) els.playerHeight.value = player.height || "";
  if (els.playerWeight) els.playerWeight.value = player.weight || "";
  updatePlayerFormUi();
  els.playerName?.focus();
}

async function removeRosterPlayer(playerId) {
  if (!requireAdminAccess("Admin sign-in required to edit the roster.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;
  const confirmed = window.confirm(`Remove ${player.name} from the active roster?\n\nThis keeps historical game data intact and moves the player out of the active roster view.`);
  if (!confirmed) return;
  if (!(await ensureFreshSharedBaseline("remove-roster-player"))) {
    window.alert("We couldn't refresh the latest shared roster yet. Try again in a moment.");
    return;
  }
  state.lineup = state.lineup.filter((id) => id !== playerId);
  state.roster = state.roster.map((item) => item.id === playerId ? { ...item, active: false } : item);
  if (editingRosterPlayerId === playerId) resetPlayerForm();
  markSharedAppStateDirty();
  saveState();
  optimizedIds = buildOptimizedLineup();
  render();
  await syncSharedRosterChangeOrAlert("remove-roster-player");
}

function render() {
  const scoreGame = activeScoreGame();
  renderAccessMode();
  renderHome();
  renderLeagueStandings();
  renderScoreEmptyState(scoreGame);
  if (scoreGame) {
    renderScoreboard();
    renderAtBat();
    renderScoringStepPanel();
    renderRunnerTracker();
    renderSprayChart();
    renderBatterSelect();
    renderLiveLineup();
    renderPlayFeed();
    renderSubControls();
    renderLiveSyncStatus(scoreGame);
    if (!els.lineupFocusModal?.hidden) renderLineupFocusModal(scoreGame);
    if (!els.gameActionsModal?.hidden) renderGameActionsModal(scoreGame);
  } else {
    setScoreGameLocked(true, null);
    renderLiveSyncStatus(null);
    closeLineupFocusModal();
    closeGameActionsModal();
  }
  renderRoster();
  renderArchive();
  renderTeamNews();
  renderNewsEditor();
  renderAnalysis();
  renderBoxScore();
  renderGameSetupPreview();
  renderGames();
  renderGameEditor();
  renderGameSummary();
  renderSeasonStats();
  renderLeaders();
  renderHighlightsPage();
  renderHighlightsManager();
  renderGameHighlightsModal();
  renderLineupBuilder();
  renderStatsSprayControls();
  renderScoutingReport();
  renderTraditionalScorebook();
  if (!optimizedIds.length) optimizedIds = buildOptimizedLineup();
  renderOptimizedLineup();
  if (!scoreGame || gameIsScoreLocked(scoreGame) || !isAdminMode()) setScoreGameLocked(true, scoreGame);
  else setScoreGameLocked(false, scoreGame);
}

function renderScoreEmptyState(scoreGame = activeScoreGame()) {
  const hasActiveGame = Boolean(scoreGame);
  document.getElementById("scoreView")?.classList.toggle("has-no-game", !hasActiveGame);
  if (els.scoreEmptyState) els.scoreEmptyState.hidden = hasActiveGame;
  if (els.syncStatusRow) els.syncStatusRow.hidden = !hasActiveGame;
  if (!hasActiveGame && els.scoreViewTitle) els.scoreViewTitle.textContent = "Pitch-by-pitch scorekeeping";
}

function renderHome() {
  const record = seasonRecord();
  const totalGames = record.wins + record.losses + record.ties;
  const winPct = totalGames ? formatWinPctDisplay((record.wins + (record.ties * 0.5)) / totalGames) : ".000";
  const upcoming = upcomingScheduledGames(3);
  const liveGame = inProgressGames()[0] || null;
  const next = liveGame || upcoming[0] || null;
  const overview = homeOverviewLeagueSummary(record);
  els.homeRecord.textContent = `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
  if (els.homeWinPct) els.homeWinPct.textContent = winPct;
  if (els.homeLeagueStanding) els.homeLeagueStanding.textContent = overview.standing;
  if (els.homeCurrentStreak) els.homeCurrentStreak.textContent = localCurrentStreakLabel();
  renderSiteVisitCounter();
  if (isAdminMode()) requestSiteVisitSummaryRefresh("home");
  if (els.homeStartGameBtn) els.homeStartGameBtn.hidden = true;
  if (els.homeScoutingBtn) els.homeScoutingBtn.hidden = true;
  if (els.homeGamesBtn) els.homeGamesBtn.hidden = true;
  if (next) {
    const nextGameStatus = homeNextGameStatusState(next);
    if (els.homeNextGame) {
      els.homeNextGame.textContent = gameMatchupLabel(next);
      els.homeNextGame.hidden = true;
    }
    if (els.homeNextGameMobileTitle) {
      els.homeNextGameMobileTitle.textContent = homeNextGameMobileLabel(next);
      els.homeNextGameMobileTitle.hidden = false;
    }
    if (els.homeNextGameWhen) els.homeNextGameWhen.textContent = homeNextGameWhenLabel(next);
    if (els.homeNextGameLocation) els.homeNextGameLocation.textContent = gameLocationLabel(next) || "Field location TBD";
    if (els.homeNextGameStatusText) els.homeNextGameStatusText.textContent = nextGameStatus.text;
    if (els.homeNextGameStatus) els.homeNextGameStatus.classList.toggle("is-live", nextGameStatus.isLive);
    if (els.homeNextGameWeather) {
      els.homeNextGameWeather.dataset.weatherGameId = next.id;
      els.homeNextGameWeather.innerHTML = renderWeatherChip(next);
    }
    if (els.homeNextGameScoreBtn) {
      const showScoreAction = isAdminMode() && !gameIsFinal(next);
      els.homeNextGameScoreBtn.hidden = !showScoreAction;
      els.homeNextGameScoreBtn.dataset.gameId = next.id;
      els.homeNextGameScoreBtn.innerHTML = `<span>${homeNextGameScoreButtonLabel(next)}</span><span aria-hidden="true">></span>`;
      els.homeNextGameScoreBtn.setAttribute("aria-label", `${homeNextGameScoreButtonLabel(next)}: ${gameMatchupLabel(next)}`);
    }
    setHomeMatchupImage(next);
  } else {
    if (els.homeNextGame) {
      els.homeNextGame.textContent = "No upcoming game scheduled";
      els.homeNextGame.hidden = false;
    }
    if (els.homeNextGameMobileTitle) {
      els.homeNextGameMobileTitle.textContent = "No upcoming game scheduled";
      els.homeNextGameMobileTitle.hidden = false;
    }
    if (els.homeNextGameWhen) els.homeNextGameWhen.textContent = "Date and time TBD";
    if (els.homeNextGameLocation) els.homeNextGameLocation.textContent = "Field location TBD";
    if (els.homeNextGameStatusText) els.homeNextGameStatusText.textContent = "Schedule and score updates show up here automatically.";
    if (els.homeNextGameStatus) els.homeNextGameStatus.classList.remove("is-live");
    if (els.homeNextGameWeather) {
      delete els.homeNextGameWeather.dataset.weatherGameId;
      els.homeNextGameWeather.textContent = "Add date and field location for weather.";
    }
    if (els.homeNextGameScoreBtn) {
      els.homeNextGameScoreBtn.hidden = true;
      delete els.homeNextGameScoreBtn.dataset.gameId;
      els.homeNextGameScoreBtn.removeAttribute("aria-label");
    }
    setHomeMatchupImage(null);
  }
  const recentFinals = completedGames();
  renderHomeLastGameResultHeading(recentFinals[0] || null);
  if (els.homeRecentResultBody) {
    els.homeRecentResultBody.innerHTML = renderHomeGameResultsCarousel(recentFinals);
    window.requestAnimationFrame(updateHomeResultsCarouselButtons);
  }
  if (els.homeTeamNewsBody) {
    els.homeTeamNewsBody.innerHTML = renderHomeTeamNewsCard(teamNewsArticles().slice(0, 4));
  }
  hydrateHomeWeather(upcoming);

  const hitterRows = state.roster.map((player) => ({ player, stats: statsForPlayer(player.id), runs: runsScoredForPlayer(player.id) }));
  const pitcherRows = state.roster
    .map((player) => ({ player, stats: pitcherStats(player.id) }))
    .filter((row) => hasPitchingStats(row.stats));
  els.homeBattingLeaders.innerHTML = [
    renderHomeLeaderFeatureCard("AVG", hitterRows, (row) => row.stats.avg, formatRate),
    renderHomeLeaderFeatureCard("H", hitterRows, (row) => row.stats.h, String),
    renderHomeLeaderFeatureCard("RBI", hitterRows, (row) => row.stats.rbi, String)
  ].join("");
  els.homePitchingLeaders.innerHTML = [
    renderHomeLeaderFeatureCard("ERA", pitcherRows, (row) => row.stats.era, formatEra, { lowWins: true, includeZero: true, tieBreaker: (row) => row.stats.outs }),
    renderHomeLeaderFeatureCard("K", pitcherRows, (row) => row.stats.k, String),
    renderHomeLeaderFeatureCard("Wins", pitcherRows, (row) => row.stats.wins, String)
  ].join("");
  if (els.homeLeagueStandings) {
    const totalGames = record.wins + record.losses + record.ties;
    const lionsWinPct = totalGames ? (record.wins / totalGames).toFixed(3).replace(/^0/, ".") : "Preseason";
    const lionsRecord = `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ""}`;
    const baseStandingsRows = (Array.isArray(scoutingData?.teams) && scoutingData.teams.length
      ? scoutingData.teams
      : AA_SCOUTING_SNAPSHOT.teams
    )
      .slice();
    const hasLiveLionsStanding = baseStandingsRows.some((team) => /oakmont lions/i.test(String(team?.name || "")));
    const standingsRows = baseStandingsRows
      .filter((team) => !/oakmont lions/i.test(String(team?.name || "")))
      .concat(hasLiveLionsStanding ? [] : [{
        id: "oakmont-lions",
        name: "Oakmont Lions",
        record: lionsRecord,
        points: 0,
        winPct: lionsWinPct,
        gb: totalGames ? "-" : "Pre",
        streak: totalGames ? `${record.runsFor} RF | ${record.runsAgainst} RA` : "Preseason",
        hitters: [],
        pitchers: []
      }])
      .sort((a, b) => (Number(b?.points) || 0) - (Number(a?.points) || 0) || String(a?.name || "").localeCompare(String(b?.name || "")));
    els.homeLeagueStandings.innerHTML = standingsRows.length
      ? standingsRows.map((team, index) => {
        const isLions = /oakmont lions/i.test(String(team?.name || ""));
        return `<div class="home-standings-row${isLions ? " is-lions" : ""}">
          <span class="home-standings-rank">${index + 1}</span>
          <span class="home-standings-team">
            <strong>${escapeHtml(team.name || "Team")}</strong>
            <small>${escapeHtml(team.record || "--")} | ${escapeHtml(team.winPct || "--")}</small>
          </span>
          <span class="home-standings-stat">
            <small>Pts</small>
            <strong>${escapeHtml(team.points ?? "--")}</strong>
          </span>
          <span class="home-standings-stat">
            <small>GB</small>
            <strong>${escapeHtml(team.gb || "-")}</strong>
          </span>
          <span class="home-standings-stat">
            <small>Streak</small>
            <strong>${escapeHtml(team.streak || "--")}</strong>
          </span>
        </div>`;
      }).join("")
      : `<div class="upcoming-empty">League standings will appear here after the next refresh.</div>`;
  }
}

function renderLeagueStandings() {
  if (!els.leagueStandingsBody) return;
  const rows = leagueStandingsRows.length
    ? leagueStandingsRows
    : (Array.isArray(scoutingData?.teams) && scoutingData.teams.length
      ? scoutingData.teams.map((team, index) => normalizeLeagueStandingRow({
        id: team.id,
        teamName: team.name,
        teamCode: team.code,
        record: team.record,
        points: team.points,
        winPct: team.winPct,
        gb: team.gb,
        rf: team.rf,
        ra: team.ra,
        last10: team.last10,
        streak: team.streak,
        sourceUrl: team.url || PITTSBURGH_NABA_STANDINGS_URL,
        sourceLabel: "Pittsburgh NABA AA standings"
      }, index)).filter(Boolean)
      : []);
  if (els.leagueStandingsStatus) {
    els.leagueStandingsStatus.textContent = rows.length
      ? `${leagueStandingsSourceLabel} | ${leagueStandingsUpdatedLabel}`
      : "Standings will appear after the next cache refresh.";
  }
  if (els.leagueStandingsMeta) {
    els.leagueStandingsMeta.innerHTML = leagueStandingsSourceUrl
      ? `<a href="${escapeHtml(leagueStandingsSourceUrl)}" target="_blank" rel="noopener">${escapeHtml(leagueStandingsSourceLabel)}</a>`
      : escapeHtml(leagueStandingsSourceLabel);
  }
  els.leagueStandingsBody.innerHTML = rows.length
    ? rows.map(renderLeagueStandingsRow).join("")
    : `<tr class="standings-empty-row"><td colspan="9">League standings are not available yet.</td></tr>`;
}

function renderLeagueStandingsRow(row) {
  const isLions = /oakmont lions/i.test(row.teamName || "");
  return `<tr class="${isLions ? "is-lions" : ""}">
    <td data-label="Rank"><span class="standings-rank">${escapeHtml(row.rank || "-")}</span></td>
    <td data-label="Team">
      <span class="standings-team-name">${escapeHtml(row.teamName || "Team")}</span>
      <span class="standings-team-code">${escapeHtml(row.teamCode || "")}</span>
    </td>
    <td data-label="Record">${escapeHtml(row.record || "--")}</td>
    <td data-label="Pts">${escapeHtml(row.pointsLabel ?? row.points ?? "--")}</td>
    <td data-label="Win %">${escapeHtml(row.winPct || "--")}</td>
    <td data-label="GB">${escapeHtml(row.gb || "-")}</td>
    <td data-label="RF">${escapeHtml(row.rf ?? "--")}</td>
    <td data-label="RA">${escapeHtml(row.ra ?? "--")}</td>
    <td data-label="Streak">${escapeHtml(row.streak || "--")}</td>
  </tr>`;
}

function leagueStandingRowsForOverview() {
  if (leagueStandingsRows.length) return leagueStandingsRows;
  const sourceRows = Array.isArray(scoutingData?.teams) && scoutingData.teams.length
    ? scoutingData.teams
    : AA_SCOUTING_SNAPSHOT.teams;
  return sourceRows
    .map((row, index) => normalizeLeagueStandingRow(row, index))
    .filter(Boolean)
    .sort((a, b) => (Number(b?.points) || 0) - (Number(a?.points) || 0) || String(a?.teamName || "").localeCompare(String(b?.teamName || "")))
    .map((row, index) => ({ ...row, rank: Number(row.rank) || index + 1 }));
}

function shortStreakLabel(value) {
  const text = String(value || "").trim();
  if (!text || text === "--" || text === "-") return localCurrentStreakLabel();
  const match = text.match(/^(Won|Win|W|Lost|Loss|L|Tied|Tie|T)\s*([0-9]+)$/i);
  if (!match) return text;
  const type = match[1].toLowerCase();
  const prefix = type.startsWith("w") ? "W" : type.startsWith("l") ? "L" : "T";
  return formatCurrentStreakLabel(prefix, match[2]);
}

function formatCurrentStreakLabel(prefix, count) {
  const safePrefix = ["W", "L", "T"].includes(prefix) ? prefix : "T";
  const safeCount = Math.max(0, Number(count) || 0);
  const label = `${safePrefix}${safeCount}`;
  if (safeCount >= 3 && safePrefix === "W") return `🔥 ${label}`;
  if (safeCount >= 3 && safePrefix === "L") return `🧊 ${label}`;
  return label;
}

function localCurrentStreakLabel() {
  const finals = completedGames();
  if (!finals.length) return "--";
  const firstResult = gameResultKey(finals[0]);
  let count = 0;
  finals.some((game) => {
    if (gameResultKey(game) !== firstResult) return true;
    count += 1;
    return false;
  });
  return formatCurrentStreakLabel(firstResult, count);
}

function gameResultKey(game) {
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  if (lionsScore > opponentScore) return "W";
  if (lionsScore < opponentScore) return "L";
  return "T";
}

function homeOverviewLeagueSummary(record = seasonRecord()) {
  const rows = leagueStandingRowsForOverview();
  const lionsIndex = rows.findIndex((row) => /oakmont lions/i.test(String(row?.teamName || "")));
  if (lionsIndex >= 0) {
    const row = rows[lionsIndex];
    const rank = Number(row.rank) || lionsIndex + 1;
    return {
      standing: `${rank}${ordinalSuffix(rank)}`
    };
  }
  const totalGames = Number(record.wins || 0) + Number(record.losses || 0) + Number(record.ties || 0);
  return {
    standing: totalGames ? "--" : "Preseason"
  };
}

function seasonRecord() {
  const completed = state.games.filter(gameIsFinal);
  const wins = completed.filter((game) => (game.score?.lions || 0) > (game.score?.opponent || 0)).length;
  const losses = completed.filter((game) => (game.score?.lions || 0) < (game.score?.opponent || 0)).length;
  const ties = completed.filter((game) => (game.score?.lions || 0) === (game.score?.opponent || 0)).length;
  return {
    wins,
    losses,
    ties,
    runsFor: completed.reduce((sum, game) => sum + (game.score?.lions || 0), 0),
    runsAgainst: completed.reduce((sum, game) => sum + (game.score?.opponent || 0), 0)
  };
}

function gameIsFinal(game) {
  return Boolean(game && (game.status === "completed" || game.status === "final" || game.quickScored === true));
}

function gameIsPostponed(game) {
  if (!game || gameIsFinal(game)) return false;
  const postponedAt = timestampValue(game.postponedAt);
  const resumedAt = timestampValue(game.resumedFromPostponedAt);
  if (postponedAt && resumedAt > postponedAt) return false;
  return game.status === "postponed" || Boolean(postponedAt);
}

function gameIsScoreLocked(game) {
  return gameIsFinal(game) || game?.status !== "active";
}

function gameIsTied(game) {
  return Number(game?.score?.lions || 0) === Number(game?.score?.opponent || 0);
}

function parseScheduledGameStart(game) {
  if (!game?.date || !game?.time) return null;
  const [year, month, day] = String(game.date).split("-").map(Number);
  const [hour, minute] = String(game.time).split(":").map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const start = dateAtTimeZone(year, month, day, hour, minute, "America/New_York");
  return Number.isNaN(start.getTime()) ? null : start;
}

function timeZoneOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const zonedUtc = Date.UTC(byType.year, (byType.month || 1) - 1, byType.day || 1, byType.hour || 0, byType.minute || 0, byType.second || 0);
  return (zonedUtc - date.getTime()) / 60000;
}

function dateAtTimeZone(year, month, day, hour, minute, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offsetMinutes = timeZoneOffsetMinutes(timeZone, utcGuess);
  return new Date(utcGuess.getTime() - (offsetMinutes * 60000));
}

function isGameInScheduledLiveWindow(game, now = new Date()) {
  if (!game || gameIsFinal(game) || gameIsPostponed(game) || game?.status === "active") return false;
  if ((game?.status || "scheduled") !== "scheduled") return false;
  const start = parseScheduledGameStart(game);
  if (!start) return false;
  const end = new Date(start.getTime() + (SCHEDULED_LIVE_WINDOW_MINUTES * 60 * 1000));
  return now >= start && now <= end;
}

function gameLifecycle(game) {
  if (gameIsFinal(game)) return "completed";
  if (gameIsPostponed(game)) return "postponed";
  if (game?.status === "active") return "active";
  if (isGameInScheduledLiveWindow(game)) return "active";
  return "future";
}

function gameStatusLabel(game) {
  if (gameIsFinal(game)) return "Final";
  if (gameIsPostponed(game)) return "Postponed";
  if (game?.status === "active") return "In progress";
  if (isGameInScheduledLiveWindow(game)) return "Live";
  return "Future";
}

function completedInningCount(game) {
  if (!game) return 0;
  if (gameIsFinal(game) && game.half === "top" && Number(game.outs || 0) === 0 && Number(game.inning || 0) > 1) {
    return Number(game.inning) - 1;
  }
  return Number(game.inning || 1);
}

function scoreableGames(excludeGameId = "") {
  const today = todayValue();
  return [...state.games]
    .filter((game) => !gameIsFinal(game) && !gameIsPostponed(game) && game.id !== excludeGameId)
    .sort((a, b) => {
      const aDate = a.date || today;
      const bDate = b.date || today;
      const dateCompare = aDate.localeCompare(bDate);
      if (dateCompare) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });
}

function inProgressGames() {
  return scoreableGames()
    .filter((game) => gameLifecycle(game) === "active")
    .sort((left, right) => {
      if (left.id === state.activeGameId && right.id !== state.activeGameId) return -1;
      if (right.id === state.activeGameId && left.id !== state.activeGameId) return 1;
      return 0;
    });
}

function moveActiveGameOffGame(gameId = "") {
  const next = inProgressGames().filter((game) => game.id !== gameId)[0];
  if (next) {
    state.activeGameId = next.id;
    storage.setActiveGame(next.id);
  } else {
    state.activeGameId = "";
  }
}

function moveActiveGameOffFinal(finalGameId = "") {
  const current = state.games.find((game) => game.id === state.activeGameId);
  if (state.activeGameId !== finalGameId && !gameIsFinal(current)) return;
  moveActiveGameOffGame(finalGameId);
}

function upcomingScheduledGames(limit = 3) {
  const today = todayValue();
  return [...state.games]
    .filter((game) => !gameIsFinal(game))
    .filter((game) => gameLifecycle(game) === "future")
    .filter((game) => (game.date || today) >= today)
    .sort((a, b) => {
      const aDate = a.date || today;
      const bDate = b.date || today;
      const dateCompare = aDate.localeCompare(bDate);
      if (dateCompare) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    })
    .slice(0, limit);
}

function nextScheduledGame() {
  return upcomingScheduledGames(1)[0] || null;
}

function completedGames(limit = Infinity) {
  return [...state.games]
    .filter(gameIsFinal)
    .sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare) return dateCompare;
      return (b.time || "").localeCompare(a.time || "");
    })
    .slice(0, limit);
}

function homeOpponentName(game) {
  return lionsSide(game) === "home" ? awayTeamName(game) : homeTeamName(game);
}

function getMatchupImage(opponentName, lionsHomeAway = "home") {
  return window.MatchupImages?.getMatchupImage(opponentName, lionsHomeAway) || "new-lion.png";
}

function gameStartMinutes(game) {
  const value = String(game?.time || "").trim();
  if (!value) return null;
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridian = String(match[3] || "").toLowerCase().replace(/\./g, "");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  if (meridian === "pm" && hours < 12) hours += 12;
  if (meridian === "am" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23) return null;
  return (hours * 60) + minutes;
}

function isNightGame(game) {
  const minutes = gameStartMinutes(game);
  return minutes !== null && minutes >= NIGHT_GAME_START_MINUTES;
}

function setHomeMatchupImage(game = null) {
  if (!els.homeMatchupImage) return;
  els.homeMatchupImage.classList.toggle("is-no-game-hero", !game);
  if (!game) {
    els.homeMatchupImage.src = HOME_NO_GAME_HERO_IMAGE;
    els.homeMatchupImage.alt = "Oakmont Lions";
    return;
  }
  els.homeMatchupImage.src = matchupImageForGame(game);
  els.homeMatchupImage.alt = `${gameMatchupLabel(game)} matchup graphic`;
}

function gameScheduleMeta(game) {
  const location = gameLocationLabel(game);
  return `${gameTeamMeta(game)} | ${game.date || "No date"}${game.time ? ` at ${game.time}` : ""}${location ? ` | ${location}` : ""}`;
}

function homeLastGameOutcome(game) {
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  if (lionsScore > opponentScore) return { key: "win", label: "Win" };
  if (lionsScore < opponentScore) return { key: "loss", label: "Loss" };
  return { key: "tie", label: "Tie" };
}

function renderHomeLastGameResultHeading(game) {
  if (!els.homeRecentResultOutcome) return;
  if (!game) {
    els.homeRecentResultOutcome.textContent = "";
    els.homeRecentResultOutcome.className = "home-result-heading-status";
    return;
  }
  els.homeRecentResultOutcome.textContent = "";
  els.homeRecentResultOutcome.className = "home-result-heading-status";
}

function renderHomeGameResultsCarousel(games = []) {
  if (!games.length) return renderHomeLastGameResultCard(null);
  const controls = games.length > 1
    ? `<div class="home-results-carousel-controls" aria-label="Game result carousel controls">
        <button class="home-results-carousel-button" type="button" data-home-results-scroll="prev" aria-label="Previous game result">
          <span aria-hidden="true">&lt;</span>
        </button>
        <button class="home-results-carousel-button" type="button" data-home-results-scroll="next" aria-label="Next game result">
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>`
    : "";
  const singleClass = games.length === 1 ? " is-single" : "";
  return `<div class="home-results-carousel${singleClass}">
    ${controls}
    <div class="home-results-carousel-track" tabindex="0" aria-label="Completed game results">
      ${games.map((game, index) => renderHomeLastGameResultCard(game, { carousel: true, index })).join("")}
    </div>
  </div>`;
}

function homeResultsCarouselElements() {
  const root = els.homeRecentResultBody?.querySelector(".home-results-carousel");
  const track = root?.querySelector(".home-results-carousel-track");
  return {
    root,
    track,
    prev: root?.querySelector('[data-home-results-scroll="prev"]'),
    next: root?.querySelector('[data-home-results-scroll="next"]')
  };
}

function updateHomeResultsCarouselButtons() {
  const { root, track, prev, next } = homeResultsCarouselElements();
  if (!track || !prev || !next) return;
  const cards = [...track.querySelectorAll(".home-results-carousel-card")];
  const activeIndex = homeResultsCarouselActiveIndex(track, cards);
  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= cards.length - 1;
  prev.disabled = atStart;
  next.disabled = atEnd;
  root?.classList.toggle("is-at-start", atStart);
  root?.classList.toggle("is-at-end", atEnd);
}

function homeResultsCarouselActiveIndex(track, cards = []) {
  if (!track || !cards.length) return 0;
  const trackRect = track.getBoundingClientRect();
  const viewportCenter = trackRect.left + (trackRect.width / 2);
  return cards.reduce((closestIndex, card, index) => {
    const cardRect = card.getBoundingClientRect();
    const closestCard = cards[closestIndex];
    const closestRect = closestCard.getBoundingClientRect();
    const cardCenter = cardRect.left + (cardRect.width / 2);
    const closestCenter = closestRect.left + (closestRect.width / 2);
    return Math.abs(cardCenter - viewportCenter) < Math.abs(closestCenter - viewportCenter)
      ? index
      : closestIndex;
  }, 0);
}

function scrollHomeResultsCarousel(direction = 1) {
  const { track } = homeResultsCarouselElements();
  if (!track) return;
  const cards = [...track.querySelectorAll(".home-results-carousel-card")];
  if (!cards.length) return;
  const currentIndex = homeResultsCarouselActiveIndex(track, cards);
  const targetIndex = Math.min(Math.max(currentIndex + direction, 0), cards.length - 1);
  cards[targetIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  window.setTimeout(updateHomeResultsCarouselButtons, 160);
  window.setTimeout(updateHomeResultsCarouselButtons, 420);
}

function renderHomeLastGameResultCard(game, options = {}) {
  if (!game) return `<div class="upcoming-empty">No completed games yet.</div>`;
  const opponentName = homeOpponentName(game);
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  const outcome = homeLastGameOutcome(game);
  const dateLabel = formatGameDateDisplay(game.date);
  const locationLabel = gameLocationLabel(game) || "Field location TBD";
  const carouselClass = options.carousel ? " home-results-carousel-card" : "";
  const cardLabel = `${options.index === 0 ? "Latest final" : "Completed game"}: Lions ${lionsScore}, ${opponentName} ${opponentScore}`;
  return `<article class="home-recent-result-card home-recent-result-card-${outcome.key}${carouselClass}" aria-label="${escapeHtml(cardLabel)}">
    <div class="home-recent-result-scoreline">
      <div class="home-recent-result-team home-recent-result-team-lions">
        <img class="home-recent-result-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.("Lions", "lions") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
        <strong>Lions</strong>
      </div>
      <div class="home-recent-result-score-center">
        <div class="home-recent-result-score-pair">
          <strong class="home-recent-result-score home-recent-result-score-lions">${escapeHtml(String(lionsScore))}</strong>
          <span class="home-recent-result-dash">-</span>
          <strong class="home-recent-result-score home-recent-result-score-opponent">${escapeHtml(String(opponentScore))}</strong>
        </div>
        <span class="home-recent-result-outcome-pill home-recent-result-outcome-${outcome.key}">${escapeHtml(outcome.label)}</span>
      </div>
      <div class="home-recent-result-team home-recent-result-team-opponent">
        <img class="home-recent-result-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
        <strong>${escapeHtml(opponentName)}</strong>
      </div>
    </div>
    <div class="home-recent-result-meta">
      <span class="result-badge">Final</span>
      <span class="player-meta">${escapeHtml(`${dateLabel} | ${locationLabel}`)}</span>
    </div>
    <div class="home-recent-result-footer">
      <button class="home-dashboard-link home-box-score-link" data-home-box-score-game="${escapeHtml(game.id)}" type="button">
        <span>View Box Score</span>
        <span aria-hidden="true">></span>
      </button>
      ${renderGameHighlightsAction(game, "home-highlight-link")}
    </div>
  </article>`;
}

function renderHomeRecentGamesList(games) {
  if (!games.length) return `<div class="upcoming-empty">More recent finals will show up here as games are completed.</div>`;
  return `<div class="home-recent-games-list">
    ${games.map(renderHomeRecentGamesRow).join("")}
  </div>`;
}

function renderHomeRecentGamesRow(game) {
  const opponentName = homeOpponentName(game);
  const isHome = lionsSide(game) === "home";
  const matchupTag = isHome ? "vs" : "@";
  const result = gameResultLabel(game).startsWith("W") ? "W" : gameResultLabel(game).startsWith("L") ? "L" : "T";
  return `<button class="home-recent-games-row" type="button" data-home-box-score-game="${escapeHtml(game.id)}">
    <span class="home-recent-games-date">${escapeHtml(formatShortMonthDay(game.date))}</span>
    <span class="home-recent-games-matchup">${escapeHtml(matchupTag)}</span>
    <img class="home-recent-games-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
    <span class="home-recent-games-opponent">${escapeHtml(opponentName)}</span>
    <span class="home-recent-games-result home-recent-games-result-${result.toLowerCase()}">${escapeHtml(result)}</span>
    <strong class="home-recent-games-score">${escapeHtml(`${Number(game?.score?.lions || 0)} - ${Number(game?.score?.opponent || 0)}`)}</strong>
    <span class="home-recent-games-arrow" aria-hidden="true">></span>
  </button>`;
}

function teamNewsArticles() {
  return normalizeNewsArticles(state.newsArticles || [], state.games);
}

function latestCompletedGameDate() {
  return completedGames(1)[0]?.date || "";
}

function teamNewsSortValue(article) {
  const raw = String(article?.date || "");
  const parsed = raw ? Date.parse(`${raw}T12:00:00`) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function filteredTeamNewsArticles() {
  const articles = teamNewsArticles();
  if (newsCategoryFilter === "all") return articles;
  return articles.filter((article) => article.category === newsCategoryFilter);
}

function renderHomeTeamNewsCard(articles) {
  const items = Array.isArray(articles) ? articles.slice(0, 4) : [];
  if (!items.length) return `<div class="upcoming-empty">Team news will appear here soon.</div>`;
  return `<div class="home-team-news-list">
    ${items.map(renderHomeTeamNewsItem).join("")}
  </div>`;
}

function renderHomeTeamNewsItem(article) {
  return `<button class="home-team-news-item" type="button" data-home-news-id="${escapeHtml(article.id)}">
    <img class="home-team-news-thumb" src="${escapeHtml(newsArticleImage(article))}" alt="" loading="lazy" decoding="async">
    <span class="home-team-news-copy">
      <span class="home-team-news-meta">${escapeHtml(article.category)} | ${escapeHtml(formatShortMonthDay(article.date))}</span>
      <strong>${escapeHtml(article.title)}</strong>
    </span>
    <span class="home-team-news-arrow" aria-hidden="true">></span>
  </button>`;
}

function renderTeamNews() {
  if (!els.newsFeaturedStory || !els.newsArticleList) return;
  const articles = filteredTeamNewsArticles();
  const featured = articles.find((article) => article.id === selectedNewsArticleId) || articles[0] || null;
  selectedNewsArticleId = featured?.id || "";
  els.newsFeaturedStory.closest(".team-news-layout")?.classList.toggle("is-latest-first", newsLayoutMode !== "article");
  els.newsFeaturedStory.innerHTML = featured
    ? renderFeaturedNewsStory(featured)
    : `<div class="upcoming-empty">No articles in this category yet.</div>`;
  els.newsArticleList.innerHTML = articles.length
    ? articles.map((article) => renderNewsArticleCard(article, article.id === selectedNewsArticleId)).join("")
    : `<div class="upcoming-empty">No articles in this category yet.</div>`;
  if (els.newsArticleCount) {
    els.newsArticleCount.textContent = `${articles.length} ${articles.length === 1 ? "article" : "articles"}`;
  }
  els.newsCategoryFilters?.querySelectorAll("[data-news-category]").forEach((button) => {
    const active = button.dataset.newsCategory === newsCategoryFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderFeaturedNewsStory(article) {
  return `<article class="news-feature-card">
    <img class="news-feature-image" src="${escapeHtml(newsArticleImage(article))}" alt="" loading="lazy" decoding="async">
    <div class="news-feature-copy">
      <span class="news-category-pill">${escapeHtml(article.category)}</span>
      <h3>${escapeHtml(article.title)}</h3>
      <span class="news-feature-date">${escapeHtml(newsArticleDateLabel(article))}</span>
      ${article.bodyHtml ? `<div class="news-article-body">${sanitizeNewsBodyHtml(article.bodyHtml)}</div>` : ""}
    </div>
  </article>`;
}

function newsArticleDateLabel(article) {
  const label = article?.gameId ? "Game Date" : "Date";
  return `${label}: ${formatGameDateDisplay(article?.date)}`;
}

function renderNewsArticleCard(article, active = false) {
  return `<article class="news-article-card${active ? " is-active" : ""}">
    <img class="news-article-thumb" src="${escapeHtml(newsArticleImage(article))}" alt="" loading="lazy" decoding="async">
    <div class="news-article-copy">
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.summary)}</p>
      <div class="news-article-card-footer">
        <span class="player-meta">${escapeHtml(formatGameDateDisplay(article.date))}</span>
        <button class="secondary-action compact-action news-read-more-btn" type="button" data-news-read="${escapeHtml(article.id)}">
          Read More
        </button>
      </div>
    </div>
  </article>`;
}

function newsArticleImage(article) {
  if (validNewsImageDataUrl(article?.imageDataUrl)) return article.imageDataUrl;
  const game = article?.gameId ? state.games.find((item) => item.id === article.gameId) : null;
  if (game) return getMatchupImage(game.opponent, lionsSide(game));
  return "new-lion.png";
}

function validNewsImageDataUrl(value = "") {
  const text = String(value || "");
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(text) ? text : "";
}

function sanitizeNewsBodyHtml(input = "") {
  const allowedTags = new Set(["B", "BR", "DIV", "EM", "I", "LI", "OL", "P", "STRONG", "UL"]);
  const template = document.createElement("template");
  template.innerHTML = String(input || "");
  template.content.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());
  [...template.content.querySelectorAll("*")].forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
  });
  return template.innerHTML.trim();
}

function renderNewsEditor() {
  if (!els.newsEditorForm || !els.newsEditorList) return;
  const games = [...state.games].sort(sortGamesNewestFirst);
  if (els.newsEditorGameSelect) {
    const current = els.newsEditorGameSelect.value || "";
    els.newsEditorGameSelect.innerHTML = [
      `<option value="">No linked game</option>`,
      ...games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(`${formatGameDateDisplay(game.date)} | ${gameMatchupLabel(game)} | ${gameStatusLabel(game)}`)}</option>`)
    ].join("");
    if (games.some((game) => game.id === current)) els.newsEditorGameSelect.value = current;
  }
  const articles = teamNewsArticles();
  if (els.newsEditorStatus) {
    els.newsEditorStatus.textContent = `${articles.length} ${articles.length === 1 ? "article" : "articles"}`;
  }
  els.newsEditorList.innerHTML = articles.length
    ? articles.map(renderNewsEditorListItem).join("")
    : `<div class="upcoming-empty">No manual news articles yet.</div>`;
  renderNewsEditorImagePreview();
}

function renderNewsEditorListItem(article) {
  const game = article.gameId ? state.games.find((item) => item.id === article.gameId) : null;
  return `<article class="news-editor-list-item">
    <img class="news-editor-list-thumb" src="${escapeHtml(newsArticleImage(article))}" alt="" loading="lazy" decoding="async">
    <div class="news-editor-list-copy">
      <span class="news-category-pill">${escapeHtml(article.category)}</span>
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.summary)}</p>
      <span class="player-meta">${escapeHtml(game ? gameMatchupLabel(game) : "No linked game")}</span>
    </div>
    <div class="news-editor-list-actions">
      <button type="button" class="secondary-action compact-action" data-news-edit="${escapeHtml(article.id)}">Edit</button>
      <button type="button" class="secondary-action compact-action danger-action" data-news-delete="${escapeHtml(article.id)}">Delete</button>
    </div>
  </article>`;
}

function resetNewsEditorForm() {
  newsEditId = "";
  newsEditorImageDataUrl = "";
  if (els.newsEditorTitle) els.newsEditorTitle.textContent = "New Article";
  if (els.newsEditorForm) els.newsEditorForm.reset();
  if (els.newsEditorCategory) els.newsEditorCategory.value = "Game Recap";
  if (els.newsEditorBodyInput) els.newsEditorBodyInput.innerHTML = "";
  renderNewsEditorImagePreview();
}

function renderNewsEditorImagePreview() {
  if (!els.newsEditorImagePreview) return;
  els.newsEditorImagePreview.innerHTML = newsEditorImageDataUrl
    ? `<img src="${escapeHtml(newsEditorImageDataUrl)}" alt="Article image preview">`
    : `<span>No image selected</span>`;
}

function editNewsArticle(articleId) {
  if (!requireAdminAccess("Admin sign-in required to edit news.")) return;
  const article = teamNewsArticles().find((item) => item.id === articleId);
  if (!article) return;
  newsEditId = article.id;
  newsEditorImageDataUrl = article.imageDataUrl || "";
  if (els.newsEditorTitle) els.newsEditorTitle.textContent = "Edit Article";
  if (els.newsEditorGameSelect) els.newsEditorGameSelect.value = article.gameId || "";
  if (els.newsEditorCategory) els.newsEditorCategory.value = article.category || "Team News";
  if (els.newsEditorTitleInput) els.newsEditorTitleInput.value = article.title || "";
  if (els.newsEditorSummaryInput) els.newsEditorSummaryInput.value = article.summary || "";
  if (els.newsEditorBodyInput) els.newsEditorBodyInput.innerHTML = article.bodyHtml || "";
  renderNewsEditorImagePreview();
  els.newsEditorTitleInput?.focus();
}

async function deleteNewsArticle(articleId) {
  if (!requireAdminAccess("Admin sign-in required to delete news.")) return;
  const article = teamNewsArticles().find((item) => item.id === articleId);
  if (!article) return;
  if (!window.confirm(`Delete "${article.title || "this article"}"?`)) return;
  state.newsArticles = (state.newsArticles || []).filter((item) => item.id !== article.id);
  if (newsEditId === article.id) resetNewsEditorForm();
  await persistNewsArticles("news-delete", { deleteArticleId: article.id });
}

async function saveNewsArticle(event) {
  event?.preventDefault?.();
  if (!requireAdminAccess("Admin sign-in required to save news.")) return;
  const title = String(els.newsEditorTitleInput?.value || "").trim();
  const summary = String(els.newsEditorSummaryInput?.value || "").trim();
  const bodyHtml = sanitizeNewsBodyHtml(els.newsEditorBodyInput?.innerHTML || "");
  if (!title) {
    window.alert("Add a title before saving this article.");
    els.newsEditorTitleInput?.focus();
    return;
  }
  if (!summary) {
    window.alert("Add a summary before saving this article.");
    els.newsEditorSummaryInput?.focus();
    return;
  }
  const previous = (state.newsArticles || []).find((item) => item.id === newsEditId);
  const article = normalizeNewsArticle({
    id: newsEditId || createId("news"),
    title,
    summary,
    bodyHtml,
    category: els.newsEditorCategory?.value || "Team News",
    gameId: els.newsEditorGameSelect?.value || "",
    imageDataUrl: newsEditorImageDataUrl,
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, state.games);
  if (!article) return;
  state.newsArticles = [
    ...(state.newsArticles || []).filter((item) => item.id !== article.id),
    article
  ].sort(sortNewsArticlesNewestFirst);
  resetNewsEditorForm();
  await persistNewsArticles("news-save", { article });
}

function sharedNewsSyncUnavailableError() {
  if (!supabaseStorage?.isReady?.()) {
    return new Error("Supabase is not ready on this device, so the news article table was not updated.");
  }
  if (!supabaseAdminEmail) {
    return new Error("Admin sign-in is not active, so the news article table was not updated. Sign out and sign back in as an approved admin.");
  }
  return null;
}

async function syncSharedNewsArticle(article, reason = "news-save") {
  const unavailableError = sharedNewsSyncUnavailableError();
  if (unavailableError) return { data: null, error: unavailableError };
  const response = await supabaseStorage.upsertNewsArticle(article);
  if (response?.data) {
    const normalizedArticle = normalizeNewsArticle(response.data, state.games);
    if (normalizedArticle) {
      state.newsArticles = [
        ...(state.newsArticles || []).filter((item) => item.id !== normalizedArticle.id),
        normalizedArticle
      ].sort(sortNewsArticlesNewestFirst);
      saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
      render();
    }
  }
  if (response?.missingTable) {
    return {
      data: response.data,
      error: new Error("The news_articles table is not available to the app yet. Run supabase-schema.sql in QA/Production or refresh the Supabase API schema cache.")
    };
  }
  return response;
}

async function deleteSharedNewsArticle(articleId, reason = "news-delete") {
  const unavailableError = sharedNewsSyncUnavailableError();
  if (unavailableError) return { data: null, error: unavailableError };
  const response = await supabaseStorage.deleteNewsArticle(articleId);
  if (response?.missingTable) {
    return {
      data: response.data,
      error: new Error("The news_articles table is not available to the app yet. Run supabase-schema.sql in QA/Production or refresh the Supabase API schema cache.")
    };
  }
  return response;
}

async function persistNewsArticles(reason = "news-change", options = {}) {
  saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
  render();
  const response = options.deleteArticleId
    ? await deleteSharedNewsArticle(options.deleteArticleId, reason)
    : await syncSharedNewsArticle(options.article, reason);
  if (response?.error) {
    console.warn(`Shared news sync failed (${reason}).`, response.error);
    window.alert([
      response.error.message || "The news article was saved locally, but could not sync to Supabase yet.",
      "",
      "Refresh, sign in again as admin, and try saving again before relying on QA or production."
    ].join("\n"));
  }
}

function applyNewsEditorCommand(command) {
  if (!els.newsEditorBodyInput) return;
  els.newsEditorBodyInput.focus();
  document.execCommand(command, false, null);
}

function newsArticleDraftFromGame(game) {
  if (!game) return null;
  const opponentName = homeOpponentName(game);
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  const completed = gameIsFinal(game);
  const result = completed ? gameResultLabel(game) : "";
  const recapVerb = lionsScore > opponentScore ? "top" : lionsScore < opponentScore ? "fall to" : "tie";
  if (!completed) {
    return {
      category: "Game Preview",
      title: `Next up: ${gameMatchupLabel(game)}`,
      summary: `${homeNextGameWhenLabel(game)}${gameLocationLabel(game) ? ` at ${gameLocationLabel(game)}` : ""}.`,
      bodyHtml: `<p>The Lions are set for ${escapeHtml(gameMatchupLabel(game))}${gameLocationLabel(game) ? ` at ${escapeHtml(gameLocationLabel(game))}` : ""}.</p>`
    };
  }
  return {
    category: "Game Recap",
    title: `Lions ${recapVerb} ${opponentName}, ${lionsScore}-${opponentScore}`,
    summary: `${result} | ${gameMatchupLabel(game)} finished ${lionsScore}-${opponentScore}${gameLocationLabel(game) ? ` at ${gameLocationLabel(game)}` : ""}.`,
    bodyHtml: `<p>The Lions finished ${escapeHtml(gameMatchupLabel(game))} with a ${escapeHtml(`${lionsScore}-${opponentScore}`)} final score.</p><p>Use this draft as a starting point, then add the story details before publishing.</p>`
  };
}

function generateNewsFromSelectedGame() {
  if (!requireAdminAccess("Admin sign-in required to generate news drafts.")) return;
  const gameId = els.newsEditorGameSelect?.value || "";
  const game = state.games.find((item) => item.id === gameId);
  if (!game) {
    window.alert("Choose a game before generating article copy.");
    els.newsEditorGameSelect?.focus();
    return;
  }
  const draft = newsArticleDraftFromGame(game);
  if (!draft) return;
  if (els.newsEditorCategory) els.newsEditorCategory.value = draft.category;
  if (els.newsEditorTitleInput) els.newsEditorTitleInput.value = draft.title;
  if (els.newsEditorSummaryInput) els.newsEditorSummaryInput.value = draft.summary;
  if (els.newsEditorBodyInput) els.newsEditorBodyInput.innerHTML = draft.bodyHtml;
  if (!newsEditorImageDataUrl) {
    newsEditorImageDataUrl = getMatchupImage(game.opponent, lionsSide(game));
    renderNewsEditorImagePreview();
  }
}

async function handleNewsImageUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    window.alert("Choose an image file for the article preview.");
    return;
  }
  try {
    newsEditorImageDataUrl = await resizeNewsImageFile(file);
    renderNewsEditorImagePreview();
  } catch (error) {
    console.warn("Unable to load article image.", error);
    window.alert("Unable to load that image. Try a smaller image file.");
  }
}

function resizeNewsImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Unable to read image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Unable to decode image."));
      image.onload = () => {
        const maxWidth = 900;
        const maxHeight = 620;
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(String(reader.result || ""));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function renderUpcomingGameCard(game) {
  return `<article class="upcoming-game-card">
    <img src="${escapeHtml(getMatchupImage(game.opponent, lionsSide(game)))}" alt="${escapeHtml(gameMatchupLabel(game))} matchup">
    <div>
      <span class="scout-kicker">Upcoming</span>
      <h4>${escapeHtml(gameMatchupLabel(game))}</h4>
      <p class="player-meta">${escapeHtml(gameScheduleMeta(game))}</p>
      <div class="weather-chip" data-weather-game-id="${escapeHtml(game.id)}">${renderWeatherChip(game)}</div>
      ${isAdminMode() ? `<button type="button" class="secondary-action upcoming-scout-button" data-home-scout-opponent="${escapeHtml(game.opponent)}">View Scouting Report</button>` : ""}
    </div>
  </article>`;
}

function renderPastGameCard(game) {
  return `<article class="upcoming-game-card">
    <img src="${escapeHtml(getMatchupImage(game.opponent, lionsSide(game)))}" alt="${escapeHtml(gameMatchupLabel(game))} matchup">
    <div>
      <span class="scout-kicker">Final</span>
      <h4>${escapeHtml(gameMatchupLabel(game))}</h4>
      <strong class="result-score ${gameResultClass(game)}">${escapeHtml(gameResultLabel(game))}</strong>
      <p class="player-meta">${escapeHtml(game.date || "No date")}</p>
      <div class="button-row">
        <button type="button" class="secondary-action" data-game-action="summary" data-game-id="${escapeHtml(game.id)}">View Summary</button>
        <button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">Box Score</button>
        <button type="button" class="secondary-action" data-game-action="scorebook" data-game-id="${escapeHtml(game.id)}">Scorebook</button>
        ${renderGameHighlightsAction(game)}
      </div>
    </div>
  </article>`;
}

function weatherKey(game) {
  return `${game.date || ""}|${gameWeatherLocation(game) || ""}`.trim().toLowerCase();
}

function renderWeatherChip(game) {
  if (!game?.date || !gameWeatherLocation(game)) return "Add date and field location for weather.";
  const cached = weatherCache[weatherKey(game)];
  if (!cached) return "Checking weather...";
  if (cached.error) return cached.error;
  return `<span class="weather-icon" aria-hidden="true">${cached.icon}</span><strong>${cached.temp}</strong><span>${escapeHtml(cached.label)}</span>`;
}

function hydrateHomeWeather(games) {
  games.forEach((game) => {
    const key = weatherKey(game);
    if (!game.date || !gameWeatherLocation(game) || weatherCache[key] || weatherRequests[key]) return;
    weatherRequests[key] = fetchGameWeather(game)
      .then((weather) => {
        weatherCache[key] = weather;
        updateWeatherChips(game);
      })
      .catch(() => {
        weatherCache[key] = { error: "Weather unavailable." };
        updateWeatherChips(game);
      })
      .finally(() => {
        delete weatherRequests[key];
      });
  });
}

function updateWeatherChips(game) {
  document.querySelectorAll("[data-weather-game-id]").forEach((node) => {
    if (node.dataset.weatherGameId !== game.id) return;
    if (node.classList.contains("schedule-meta-item-weather-inline")) {
      node.innerHTML = renderScheduleWeatherInlineContent(game);
      return;
    }
    node.innerHTML = renderWeatherChip(game);
  });
}

async function fetchGameWeather(game) {
  if (typeof fetch !== "function") return { error: "Weather unavailable." };
  const location = fieldCoordinatesForGame(game) || await geocodeGameLocation(gameWeatherLocation(game));
  if (!location) return { error: "Location not found." };
  const forecastUrl = [
    "https://api.open-meteo.com/v1/forecast",
    `?latitude=${encodeURIComponent(location.latitude)}`,
    `&longitude=${encodeURIComponent(location.longitude)}`,
    "&daily=weather_code,temperature_2m_max,temperature_2m_min",
    "&temperature_unit=fahrenheit",
    "&timezone=auto",
    `&start_date=${encodeURIComponent(game.date)}`,
    `&end_date=${encodeURIComponent(game.date)}`
  ].join("");
  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) return { error: "Forecast closer to game day." };
  const forecast = await forecastResponse.json();
  const daily = forecast.daily || {};
  const code = Number(daily.weather_code?.[0]);
  const high = Math.round(Number(daily.temperature_2m_max?.[0]));
  const low = Math.round(Number(daily.temperature_2m_min?.[0]));
  const condition = weatherCondition(code);
  return {
    icon: condition.icon,
    label: condition.label,
    temp: Number.isFinite(high) && Number.isFinite(low) ? `${high}/${low}°F` : "--"
  };
}

async function geocodeGameLocation(locationText) {
  const queries = [
    locationText,
    String(locationText || "").replace(/,/g, " "),
    String(locationText || "").split(",")[0]
  ]
    .map((query) => query.trim())
    .filter(Boolean)
    .filter((query, index, list) => list.indexOf(query) === index);
  for (const query of queries) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const geoResponse = await fetch(geocodeUrl);
    if (!geoResponse.ok) continue;
    const geo = await geoResponse.json();
    if (geo.results?.[0]) return geo.results[0];
  }
  return null;
}

function weatherCondition(code) {
  if ([0, 1].includes(code)) return { icon: "☀", label: "Sunny" };
  if ([2, 3, 45, 48].includes(code)) return { icon: "☁", label: "Cloudy" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "☔", label: "Rain" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄", label: "Snow" };
  if ([95, 96, 99].includes(code)) return { icon: "⚡", label: "Storms" };
  return { icon: "◐", label: "Weather" };
}

function openCurrentGameForScoring() {
  if (!requireAdminAccess("Admin sign-in required to score games.")) return;
  const current = inProgressGames()[0] || null;
  if (!current) {
    switchView("games");
    return;
  }
  if (current.status !== "active") {
    scoreScheduledGame(current.id);
    return;
  }
  openActiveGameForScoring(current);
}

function openNextGameScouting() {
  if (!requireAdminAccess("Admin sign-in required to open scouting tools.")) return;
  const next = nextScheduledGame();
  openScoutingForOpponent(next?.opponent || "");
}

function openScoutingForOpponent(opponent) {
  const match = matchScoutingTeam(opponent);
  if (match) selectedScoutingTeamId = match.id;
  renderScoutingReport();
  switchView("scouting");
}

function matchScoutingTeam(opponent) {
  const key = normalizeScoutName(opponent);
  if (!key || !scoutingData?.teams) return null;
  return scoutingData.teams
    .map((team) => ({ team, score: scoutingMatchScore(opponent, team) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.team || null;
}

function scoutingMatchScore(opponent, team) {
  const opponentKey = normalizeScoutName(opponent);
  const teamKeys = [team.name, team.code, team.id, ...(team.aliases || [])].map(normalizeScoutName).filter(Boolean);
  if (teamKeys.includes(opponentKey)) return 100;
  if (teamKeys.some((teamKey) => teamKey.includes(opponentKey) || opponentKey.includes(teamKey))) return 80;

  const opponentTokens = scoutNameTokens(opponent);
  const teamTokens = new Set([team.name, team.code, team.id, ...(team.aliases || [])].flatMap(scoutNameTokens));
  const matches = opponentTokens.filter((token) => teamTokens.has(token));
  if (!matches.length) return 0;
  return Math.round((matches.length / Math.max(opponentTokens.length, 1)) * 60);
}

function scoutNameTokens(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function scoreboardTeamLogo(teamName, side, game = activeGame()) {
  const teamKey = lionsSide(game) === side ? "lions" : "opponent";
  return window.MatchupImages?.getTeamLogo?.(teamName, teamKey) || "assets/team-logos/lions.png";
}

const opponentRunScoreThemes = {
  eagles: { primary: "#22c55e", rgb: "34, 197, 94", secondary: "#052e16" },
  ducks: { primary: "#f97316", rgb: "249, 115, 22", secondary: "#14532d" },
  devils: { primary: "#ef4444", rgb: "239, 68, 68", secondary: "#450a0a" },
  turtles: { primary: "#84cc16", rgb: "132, 204, 22", secondary: "#1f3d14" },
  d2: { primary: "#38bdf8", rgb: "56, 189, 248", secondary: "#082f49" },
  bandidos: { primary: "#f59e0b", rgb: "245, 158, 11", secondary: "#431407" }
};

function runScoreFeedbackTheme(teamId, teamName = "") {
  if (teamId === "lions") {
    return { primary: "#f5bd21", rgb: "245, 189, 33", secondary: "#08204a" };
  }
  const key = window.MatchupImages?.opponentImageKey?.(teamName)
    || window.MatchupImages?.normalizeOpponentName?.(teamName)
    || "";
  return opponentRunScoreThemes[key] || { primary: "#38bdf8", rgb: "56, 189, 248", secondary: "#07172d" };
}

function runScoreFeedbackForBattingTeam(game, runs = 0) {
  const battingSide = sideForHalf(game);
  const teamId = battingSide === lionsSide(game) ? "lions" : "opponent";
  const teamName = battingSide === "away" ? awayTeamName(game) : homeTeamName(game);
  const theme = runScoreFeedbackTheme(teamId, teamName);
  return {
    teamId,
    teamName,
    logoUrl: scoreboardTeamLogo(teamName, battingSide, game),
    runs: Number(runs) || 0,
    color: theme.primary,
    rgb: theme.rgb,
    secondary: theme.secondary
  };
}

function renderScoreboard() {
  const game = activeGame();
  if (!game.atBat) game.atBat = makeAtBat();
  syncGameCurrent(game);
  const lionsBatting = isLionsAtBat(game);
  const awayName = awayTeamName(game);
  const homeName = homeTeamName(game);
  const awayScore = scoreForSide(game, "away");
  const homeScore = scoreForSide(game, "home");
  els.scoreOpponentLineupInput.value = opponentLineup(game).join("\n");
  els.gameTitle.textContent = gameMatchupLabel(game);
  if (els.scoreViewTitle) els.scoreViewTitle.textContent = gameMatchupLabel(game);
  const currentHalf = game.current?.half ?? game.half ?? "top";
  const inningLabel = gameIsFinal(game) ? "FINAL" : halfInningLabel(game);
  const headerBatter = lionsBatting ? currentBatterLabel(game) : currentOpponentBatter(game);
  els.headerBatterDisplay.textContent = lionsBatting ? headerBatter : `${headerBatter} (${opponentSide(game) === "home" ? "Home" : "Away"} ${game.opponent})`;
  const batterHeaderSummary = lionsBatting
    ? currentGameBatterHeaderSummary(game, currentBatterId(game))
    : currentOpponentHeaderSummary(game, currentOpponentBatter(game));
  if (els.currentBatterStatLabel) els.currentBatterStatLabel.textContent = "Game";
  if (els.currentBatterAvgDisplay) {
    els.currentBatterAvgDisplay.textContent = batterHeaderSummary.line;
  }
  if (els.headerBatterOutcomesDisplay) els.headerBatterOutcomesDisplay.textContent = batterHeaderSummary.outcomesLabel;
  if (els.scoreAwayName) els.scoreAwayName.textContent = awayName;
  if (els.scoreHomeName) els.scoreHomeName.textContent = homeName;
  if (els.scoreAwayDisplay) els.scoreAwayDisplay.textContent = awayScore;
  if (els.scoreHomeDisplay) els.scoreHomeDisplay.textContent = homeScore;
  if (els.scoreAwayLogo) {
    els.scoreAwayLogo.src = scoreboardTeamLogo(awayName, "away", game);
    els.scoreAwayLogo.alt = `${awayName} logo`;
  }
  if (els.scoreHomeLogo) {
    els.scoreHomeLogo.src = scoreboardTeamLogo(homeName, "home", game);
    els.scoreHomeLogo.alt = `${homeName} logo`;
  }
  els.inningStateDisplay.textContent = inningLabel;
  if (els.headerCountDisplay) els.headerCountDisplay.textContent = `${game.atBat.balls}-${game.atBat.strikes}`;
  if (els.outsStateDisplay) els.outsStateDisplay.textContent = String(game.outs);
  if (els.scoreBannerArrow) {
    const isBottomHalf = !gameIsFinal(game) && currentHalf === "bottom";
    const isTopHalf = !gameIsFinal(game) && currentHalf === "top";
    els.scoreBannerArrow.classList.toggle("is-bottom", isBottomHalf);
    els.scoreBannerArrow.classList.toggle("is-top", isTopHalf);
    els.scoreBannerArrow.dataset.half = gameIsFinal(game) ? "final" : currentHalf;
  }
  if (els.scoreBannerShell) {
    els.scoreBannerShell.classList.toggle("is-final", gameIsFinal(game));
  }
  if (els.headerOutDots?.length) {
    els.headerOutDots.forEach((dot, index) => {
      dot.classList.toggle("is-filled", index < game.outs);
    });
  }
  if (els.headerBaseIndicators?.length) {
    const currentBases = game.current?.runners || game.bases || emptyBases(false);
    els.headerBaseIndicators.forEach((base) => {
      const key = base.dataset.scoreBase;
      base.classList.toggle("is-filled", Boolean(currentBases?.[key]));
    });
  }
  if (els.headerBatterCountDisplay) els.headerBatterCountDisplay.textContent = `${game.atBat.balls}-${game.atBat.strikes}`;
  if (els.headerBatterOutsDisplay) els.headerBatterOutsDisplay.textContent = `${game.outs}`;
  if (els.pitcherRowCountDisplay) els.pitcherRowCountDisplay.textContent = `${game.atBat.balls}-${game.atBat.strikes}`;
  if (els.pitcherRowOutsDisplay) els.pitcherRowOutsDisplay.textContent = `${game.outs}`;
  if (els.headerBatterStatus) els.headerBatterStatus.hidden = true;
  if (els.headerCountFocus) els.headerCountFocus.hidden = true;
  if (els.headerOutsFocus) els.headerOutsFocus.hidden = false;
  if (els.currentBatterCard) els.currentBatterCard.classList.toggle("is-expanded", lionsBatting);
  if (els.gamePitcherCard) els.gamePitcherCard.hidden = lionsBatting;
  if (els.gamePitcherContent) {
    els.gamePitcherContent.hidden = lionsBatting;
    els.gamePitcherContent.style.display = lionsBatting ? "none" : "";
  }
  if (els.gameBattingStatusRow) {
    els.gameBattingStatusRow.hidden = !lionsBatting;
    els.gameBattingStatusRow.style.display = lionsBatting ? "grid" : "none";
  }
  if (els.gamePitcherCard) els.gamePitcherCard.classList.toggle("is-batting-status", lionsBatting);
  els.gameContext.textContent = gameIsFinal(game)
    ? `${gameTeamMeta(game)} | Final after ${completedInningCount(game)} innings`
    : `${gameTeamMeta(game)} | ${game.half === "top" ? "Top" : "Bottom"} ${game.inning}, ${game.outs} ${game.outs === 1 ? "out" : "outs"}`;
  setScoreGameLocked(gameIsScoreLocked(game), game);
}

function gamePlateAppearanceEvents(events = []) {
  return events.filter((event) => eventRules[event?.result]?.pa);
}

function batterOutcomeTokens(events = []) {
  return gamePlateAppearanceEvents(events).map((event) => event?.result || "--");
}

function batterGameLineFromEvents(events = []) {
  const stats = emptyStats();
  gamePlateAppearanceEvents(events).forEach((event) => applyEventToStats(stats, event));
  return `${stats.h} for ${stats.ab}`;
}

function currentGameBatterHeaderSummary(game, playerId) {
  const events = (game?.events || []).filter((event) => event.scope === "offense" && event.playerId === playerId);
  return batterHeaderSummaryFromEvents(events);
}

function currentOpponentHeaderSummary(game, batterLabel) {
  const events = (game?.events || []).filter((event) => event.scope === "defense" && event.opponentBatter === batterLabel);
  return batterHeaderSummaryFromEvents(events);
}

function batterHeaderSummaryFromEvents(events = []) {
  const outcomes = batterOutcomeTokens(events);
  return {
    line: batterGameLineFromEvents(events),
    outcomesLabel: outcomes.length ? outcomes.join(", ") : "No previous plate appearances yet"
  };
}

function setScoreGameLocked(locked, game = activeScoreGame()) {
  document.querySelectorAll("#scoreView button, #scoreView input, #scoreView select, #scoreView textarea")
    .forEach((control) => {
      if ([els.newGameBtn, els.scoreEmptyHomeBtn, els.scoreEmptyGamesBtn].includes(control)) return;
      if (control.matches("[data-game-complete-action]")) return;
      control.disabled = locked;
    });
  if (els.finishGameBtn) els.finishGameBtn.textContent = game && gameIsFinal(game) ? "Game Final" : "Complete Game";
}

function renderRunnerTracker() {
  const game = activeGame();
  reconcileGameBasesFromEvents(game);
  const baseLabels = {
    first: "1B",
    second: "2B",
    third: "3B"
  };
  const sprayBaseSelectors = {
    first: ".spray-first-base",
    second: ".spray-second-base",
    third: ".spray-third-base"
  };
  const bases = game.bases || emptyBases(false);
  if (selectedFieldRunnerBase && !isOccupied(bases[selectedFieldRunnerBase])) {
    selectedFieldRunnerBase = "";
  }
  const occupied = ["first", "second", "third"]
    .filter((key) => isOccupied(bases[key]))
    .map((key) => `${runnerName(bases[key]) || "Runner"} on ${baseLabels[key]}`);
  els.runnerBases.forEach((baseEl) => {
    const key = baseEl.dataset.runnerBase;
    const runner = bases[key];
    const name = runnerName(runner);
    const occupiedBase = isOccupied(runner);
    baseEl.classList.toggle("is-occupied", occupiedBase);
    baseEl.classList.toggle("is-pending-out", pendingRunnerOutBases.includes(key));
    baseEl.querySelector("span").textContent = name || "Empty";
    const sprayBase = els.sprayChart?.querySelector(sprayBaseSelectors[key]);
    if (sprayBase) {
      sprayBase.classList.toggle("is-occupied", occupiedBase);
    }
  });
  els.runnerSummary.textContent = occupied.length ? occupied.join(" | ") : "Bases empty";
  const selectedBase = selectedFieldRunnerBase;
  const selectedRunner = selectedBase ? bases[selectedBase] : null;
  const selectedLabel = selectedBase ? baseLabels[selectedBase] : "";
  const stealTarget = selectedBase ? nextBaseForRunner(selectedBase) : "";
  const canSteal = Boolean(
    selectedBase
    && selectedRunner
    && (stealTarget === "home" || (stealTarget && !isOccupied(bases[stealTarget])))
  );
  const canBalk = canSteal;
  els.runnerActionButtons.forEach((button) => {
    const action = button.dataset.runnerAction;
    const canUseNonRunner = action === "non_runner" && isLionsAtBat(game) && eligibleNonRunnerPlayers(game, selectedBase).length > 0;
    const enabled = Boolean(
      selectedBase
      && selectedRunner
      && (action === "steal" ? canSteal : action === "balk" ? canBalk : action === "non_runner" ? canUseNonRunner : true)
    );
    button.disabled = !enabled;
    if (action === "steal") button.textContent = selectedBase ? `SB ${baseLabel(stealTarget)}` : "SB";
    if (action === "caught_stealing") button.textContent = stealTarget ? `CS ${baseLabel(stealTarget)}` : "CS";
    if (action === "pickoff") button.textContent = selectedLabel ? `PO ${selectedLabel}` : "PO";
    if (action === "balk") button.textContent = stealTarget ? `BALK ${baseLabel(stealTarget)}` : "BALK";
    if (action === "non_runner") button.textContent = "NR";
  });
  els.runnerHint.textContent = selectedBase
    ? `${runnerName(selectedRunner) || "Runner"} selected on ${selectedLabel}. Choose SB, CS, PO, Balk, or NR.`
    : "Tap a runner badge to choose SB, CS, PO, Balk, or NR.";
  const showRunnerOuts = (Boolean(game.atBat?.pendingInPlay) || awaitingSprayLocation || awaitingRunnerDecision) && isLionsAtBat(game);
  els.runnerPlayControls.classList.toggle("is-visible", showRunnerOuts);
  els.runnerOutButtons.forEach((button) => {
    const base = button.dataset.runnerOutBase;
    const enabled = showRunnerOuts && isOccupied(game.bases[base]);
    button.disabled = !enabled;
    button.classList.toggle("is-selected", pendingRunnerOutBases.includes(base));
  });
  renderFieldRunnerMarkers(game);
  renderAutoScorePreview();
}

function runnerName(runner) {
  if (!isOccupied(runner)) return "";
  const player = state.roster.find((item) => item.id === runnerIdentity(runner));
  if (player) return player.name.split(" ")[0];
  return runner === true ? "Runner" : "Opponent";
}

function runnerNumber(runner) {
  if (!isOccupied(runner)) return "";
  const player = state.roster.find((item) => item.id === runnerIdentity(runner));
  return player?.number || "R";
}

function currentFieldBatterMarker(game = activeGame()) {
  if (!game || game.status !== "active") return null;
  if (isLionsAtBat(game)) {
    const player = state.roster.find((item) => item.id === currentBatterId(game));
    if (!player) return null;
    return {
      number: player.number || "R",
      label: `#${player.number || ""} ${player.name || "Batter"}`.trim()
    };
  }
  const opponentEntry = currentOpponentBatterEntry(game);
  const opponentLabel = currentOpponentBatter(game);
  if (!opponentLabel) return null;
  return {
    number: opponentEntry?.number || "R",
    label: opponentLabel
  };
}

function renderFieldRunnerMarkers(game = activeGame()) {
  if (!els.runnerFieldMarkers || !game) return;
  const bases = game.bases || emptyBases(false);
  const baseLabels = { first: "first", second: "second", third: "third" };
  const runnerButtons = ["first", "second", "third"]
    .filter((base) => isOccupied(bases[base]))
    .map((base) => {
      const runner = bases[base];
      const pending = pendingRunnerOutBases.includes(base) ? " is-pending-out" : "";
      const selected = selectedFieldRunnerBase === base ? " is-selected" : "";
      const label = `${runnerName(runner) || "Runner"} on ${baseLabels[base]}`;
      return `<button type="button" class="field-runner-marker field-runner-${base}${pending}${selected}" data-field-runner-base="${base}" title="${escapeHtml(label)}" onpointerdown="window.handleFieldRunnerClick(event)">${escapeHtml(runnerNumber(runner))}</button>`;
    })
    .join("");
  const batterMarker = currentFieldBatterMarker(game);
  const batterBadge = batterMarker
    ? `<span class="field-runner-marker field-batter-marker" aria-hidden="true" title="${escapeHtml(batterMarker.label)}">${escapeHtml(batterMarker.number)}</span>`
    : "";
  els.runnerFieldMarkers.innerHTML = `${batterBadge}${runnerButtons}`;
}

function handleFieldRunnerClick(event) {
  const button = closestFromEventTarget(event.target, "[data-field-runner-base]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const base = button.dataset.fieldRunnerBase;
  const game = activeGame();
  if (!game || !isOccupied(game.bases?.[base])) return;
  selectedFieldRunnerBase = selectedFieldRunnerBase === base ? "" : base;
  button.classList.toggle("is-selected", selectedFieldRunnerBase === base);
  renderRunnerTracker();
  renderScoringStepPanel();
  const firstVisibleAction = els.scoringStepBody?.querySelector("[data-special-action]:not([disabled])");
  firstVisibleAction?.focus();
}

function clearSelectedRunnerAction() {
  if (!selectedFieldRunnerBase) return;
  selectedFieldRunnerBase = "";
  pendingRunnerReplacementBase = "";
  if (scoringStep === "runner_replacement") scoringStep = "pitch";
  renderRunnerTracker();
  renderScoringStepPanel();
}

window.handleFieldRunnerClick = handleFieldRunnerClick;

function togglePendingRunnerOut(base) {
  if (!base) return;
  if (pendingRunnerOutBases.includes(base)) {
    pendingRunnerOutBases = pendingRunnerOutBases.filter((item) => item !== base);
  } else {
    pendingRunnerOutBases.push(base);
  }
  renderRunnerTracker();
}

function renderAutoScorePreview() {
  const game = activeGame();
  if (!els.autoScorePreview || isOpponentAtBat(game)) return;
  const result = els.resultSelect.value || "1B";
  const batterId = currentBatterId(game);
  const runnerAdvancements = runnerAdvancementsForPlay(game, result, batterId);
  const runs = runnerAdvancements.filter((advancement) => advancement.to === "home" && !advancement.out && !advancement.remove).length;
  const rbi = automaticRbiForPlay(result, runs);
  const extraOuts = result === "DP" ? 2 : Math.min(3, (eventRules[result]?.out ? 1 : 0) + runnerAdvancements.filter((advancement) => advancement.out).length);
  els.runsInput.value = String(runs);
  els.rbiInput.value = String(rbi);
  els.autoScorePreview.textContent = `Auto: ${runs} run${runs === 1 ? "" : "s"}, ${rbi} RBI, ${extraOuts} out${extraOuts === 1 ? "" : "s"} on this result.`;
}

function pitchFeedbackTypeForOutcome(outcome) {
  if (outcome === "ball") return "ball";
  if (["strike", "called_strike", "swinging_strike"].includes(outcome)) return "strike";
  return "";
}

function pitchFeedbackClassForOutcome(outcome) {
  if (!lastPitchFeedback) return "";
  return pitchFeedbackTypeForOutcome(outcome) === lastPitchFeedback.type ? " pitch-button--feedback" : "";
}

function renderPitchFeedbackLayer() {
  if (!els.pitchFeedbackLayer) return;
  if (!lastPitchFeedback) {
    els.pitchFeedbackLayer.innerHTML = "";
    els.pitchFeedbackLayer.removeAttribute("data-feedback-type");
    return;
  }
  const type = lastPitchFeedback.type;
  const label = type === "ball" ? "BALL" : "STRIKE";
  els.pitchFeedbackLayer.dataset.feedbackType = type;
  els.pitchFeedbackLayer.innerHTML = `<div class="pitch-feedback pitch-feedback--${type}" data-feedback-id="${lastPitchFeedback.id}">${label}</div>`;
}

function syncPitchFeedbackButtonState(preferredButton = null) {
  if (!els.scoringStepPanel) return;
  els.scoringStepPanel.querySelectorAll(".pitch-button--feedback").forEach((button) => {
    button.classList.remove("pitch-button--feedback");
  });
  if (!lastPitchFeedback) return;
  const type = lastPitchFeedback.type;
  const selector = type === "ball"
    ? 'button[data-step-pitch="ball"]'
    : 'button[data-step-pitch="strike"], button[data-step-pitch="called_strike"], button[data-step-pitch="swinging_strike"]';
  const target = preferredButton?.matches?.(selector) ? preferredButton : els.scoringStepPanel.querySelector(selector);
  if (!target) return;
  void target.offsetWidth;
  target.classList.add("pitch-button--feedback");
}

function clearPitchFeedback(feedbackId = null) {
  if (feedbackId && lastPitchFeedback?.id !== feedbackId) return;
  lastPitchFeedback = null;
  if (pitchFeedbackTimer) {
    clearTimeout(pitchFeedbackTimer);
    pitchFeedbackTimer = null;
  }
  renderPitchFeedbackLayer();
  syncPitchFeedbackButtonState();
}

function triggerHaptic(pattern = 20) {
  try {
    if (
      typeof navigator !== "undefined"
      && typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch (error) {
    // Haptics are optional; visual feedback remains the source of truth.
  }
}

function triggerPitchFeedback(type, sourceButton = null) {
  if (!["ball", "strike"].includes(type)) return;
  triggerHaptic();
  if (pitchFeedbackTimer) clearTimeout(pitchFeedbackTimer);
  lastPitchFeedback = { type, id: ++pitchFeedbackSequence };
  renderPitchFeedbackLayer();
  syncPitchFeedbackButtonState(sourceButton);
  const feedbackId = lastPitchFeedback.id;
  pitchFeedbackTimer = setTimeout(() => clearPitchFeedback(feedbackId), PITCH_FEEDBACK_DURATION_MS);
}

const actionFeedbackColors = {
  inplay: { color: "#f5bd21", rgb: "245, 189, 33" },
  foul: { color: "#f59e0b", rgb: "245, 158, 11" },
  out: { color: "#ef4444", rgb: "239, 68, 68" },
  single: { color: "#22c55e", rgb: "34, 197, 94" },
  double: { color: "#38bdf8", rgb: "56, 189, 248" },
  triple: { color: "#818cf8", rgb: "129, 140, 248" },
  homer: { color: "#f5bd21", rgb: "245, 189, 33" },
  run: { color: "#facc15", rgb: "250, 204, 21" },
  undo: { color: "#94a3b8", rgb: "148, 163, 184" },
  neutral: { color: "#cbd5e1", rgb: "203, 213, 225" }
};

function makeActionFeedback(type, label) {
  const tone = actionFeedbackColors[type] || actionFeedbackColors.neutral;
  return {
    type,
    label,
    color: tone.color,
    rgb: tone.rgb
  };
}

function actionFeedbackForPitchOutcome(outcome) {
  if (outcome === "in_play") return makeActionFeedback("inplay", "IN PLAY");
  if (outcome === "foul") return makeActionFeedback("foul", "FOUL");
  return null;
}

function actionFeedbackForResult(result) {
  const normalized = normalizeBallInPlayOutcome(result || "");
  if (normalized === "1B") return makeActionFeedback("single", "1B");
  if (normalized === "2B") return makeActionFeedback("double", "2B");
  if (normalized === "3B") return makeActionFeedback("triple", "3B");
  if (normalized === "HR") return makeActionFeedback("homer", "HR");
  if (["OUT", "GO", "FO", "LO", "FC", "DP", "SAC", "K", "CS", "PO"].includes(normalized)) return makeActionFeedback("out", "OUT");
  if (normalized === "BB") return makeActionFeedback("single", "BB");
  if (normalized === "HBP") return makeActionFeedback("foul", "HBP");
  if (normalized === "ROE") return makeActionFeedback("foul", "E");
  return makeActionFeedback("neutral", normalized || "PLAY");
}

function actionFeedbackForSpecialAction(action, target = "") {
  if (action === "steal") return target === "home" ? makeActionFeedback("run", "RUN") : makeActionFeedback("double", "SB");
  if (["caught_stealing", "pickoff"].includes(action)) return makeActionFeedback("out", action === "caught_stealing" ? "CS" : "PO");
  if (action === "balk") return makeActionFeedback("foul", "BALK");
  if (action === "tag_up") return target === "home" ? makeActionFeedback("run", "RUN") : makeActionFeedback("single", baseLabel(target));
  if (action === "non_runner") return makeActionFeedback("neutral", "NR");
  return makeActionFeedback("neutral", "PLAY");
}

function actionFeedbackForRunnerChoice(choice) {
  if (choice === "home") return makeActionFeedback("run", "RUN");
  if (choice === "out") return makeActionFeedback("out", "OUT");
  if (choice === "first") return makeActionFeedback("single", "1B");
  if (choice === "second") return makeActionFeedback("double", "2B");
  if (choice === "third") return makeActionFeedback("triple", "3B");
  return makeActionFeedback("neutral", "HOLD");
}

function actionFeedbackForButton(button) {
  if (!button) return null;
  if (button.id === "panelUndoPitchBtn") return makeActionFeedback("undo", "UNDO");
  if (button.id === "dockUndoLastPlayBtn") return makeActionFeedback("undo", "UNDO PLAY");
  if (button.dataset.stepPitch) return actionFeedbackForPitchOutcome(button.dataset.stepPitch);
  if (button.dataset.stepAutoResult) return actionFeedbackForResult(button.dataset.stepAutoResult);
  if (button.dataset.specialAction) return actionFeedbackForSpecialAction(button.dataset.specialAction, button.dataset.specialTarget);
  if (button.dataset.runnerAction) {
    const base = selectedFieldRunnerBase;
    const target = button.dataset.runnerAction === "pickoff" ? base : nextBaseForRunner(base);
    return actionFeedbackForSpecialAction(button.dataset.runnerAction, target);
  }
  if (button.dataset.runnerReplacementId) return makeActionFeedback("neutral", "NR");
  if (button.dataset.stepOutcome) return actionFeedbackForResult(button.dataset.stepOutcome);
  if (button.dataset.outType) return actionFeedbackForResult(button.dataset.outType);
  if (button.dataset.outFielder) return actionFeedbackForResult(pendingOutType || "OUT");
  if (button.dataset.runnerOutBase) return makeActionFeedback("out", "OUT");
  if (button.dataset.runnerChoice) return actionFeedbackForRunnerChoice(button.dataset.runnerChoice);
  if (button.dataset.confirmPlay !== undefined) return makeActionFeedback("neutral", "PLAY");
  if (button.dataset.gameCompleteAction === "sync") return makeActionFeedback("single", "SYNC");
  if (button.dataset.gameCompleteAction === "undo") return makeActionFeedback("undo", "UNDO");
  if (button.dataset.gameCompleteAction) return makeActionFeedback("neutral", "FINAL");
  if (button.dataset.resolvePlay !== undefined) return makeActionFeedback("neutral", "PLAY");
  if (button.dataset.opponentResult) return actionFeedbackForResult(button.dataset.opponentResult);
  if (button.dataset.choiceGroup === "result") return actionFeedbackForResult(button.dataset.choiceValue);
  return null;
}

function renderActionFeedbackLayer() {
  if (!els.actionFeedbackLayer) return;
  if (!actionFeedback) {
    els.actionFeedbackLayer.innerHTML = "";
    els.actionFeedbackLayer.removeAttribute("data-feedback-type");
    return;
  }
  els.actionFeedbackLayer.dataset.feedbackType = actionFeedback.type;
  els.actionFeedbackLayer.innerHTML = `<div class="action-feedback" style="--action-feedback-color: ${actionFeedback.color}; --action-feedback-rgb: ${actionFeedback.rgb};" data-feedback-id="${actionFeedback.id}">${escapeHtml(actionFeedback.label)}</div>`;
}

function clearActionFeedback(feedbackId = null) {
  if (feedbackId && actionFeedback?.id !== feedbackId) return;
  actionFeedback = null;
  if (actionFeedbackTimer) {
    clearTimeout(actionFeedbackTimer);
    actionFeedbackTimer = null;
  }
  renderActionFeedbackLayer();
}

function syncActionFeedbackButtonState(sourceButton, feedback) {
  if (!sourceButton || !feedback) return;
  sourceButton.style.setProperty("--action-feedback-color", feedback.color);
  sourceButton.style.setProperty("--action-feedback-rgb", feedback.rgb);
  sourceButton.classList.remove("action-button--feedback");
  void sourceButton.offsetWidth;
  sourceButton.classList.add("action-button--feedback");
  window.setTimeout(() => {
    sourceButton.classList.remove("action-button--feedback");
  }, 420);
}

function triggerActionFeedback(feedback, sourceButton = null) {
  if (!feedback?.label) return;
  triggerHaptic();
  if (actionFeedbackTimer) clearTimeout(actionFeedbackTimer);
  actionFeedback = { ...feedback, id: ++actionFeedbackSequence };
  renderActionFeedbackLayer();
  syncActionFeedbackButtonState(sourceButton, actionFeedback);
  const feedbackId = actionFeedback.id;
  actionFeedbackTimer = setTimeout(() => clearActionFeedback(feedbackId), ACTION_FEEDBACK_DURATION_MS);
}

function renderRunScoreFeedbackLayer() {
  if (!els.runScoreFeedbackLayer) return;
  if (!runScoreFeedback) {
    els.runScoreFeedbackLayer.innerHTML = "";
    els.runScoreFeedbackLayer.removeAttribute("data-feedback-team");
    return;
  }
  const runs = Number(runScoreFeedback.runs || 0);
  const scoredLabel = runScoreFeedback.teamId === "lions"
    ? "LIONS SCORED"
    : `${runScoreFeedback.teamName || "Team"} scored`.toUpperCase();
  const runsLabel = `+${runs} ${runs === 1 ? "RUN" : "RUNS"}`;
  els.runScoreFeedbackLayer.dataset.feedbackTeam = runScoreFeedback.teamId;
  els.runScoreFeedbackLayer.innerHTML = `
    <div class="run-score-feedback" style="--run-score-color: ${runScoreFeedback.color}; --run-score-rgb: ${runScoreFeedback.rgb}; --run-score-secondary: ${runScoreFeedback.secondary};" data-feedback-id="${runScoreFeedback.id}">
      <span class="run-score-feedback-logo-wrap" aria-hidden="true">
        <img class="run-score-feedback-logo" src="${escapeHtml(runScoreFeedback.logoUrl)}" alt="">
      </span>
      <span class="run-score-feedback-team">${escapeHtml(scoredLabel)}</span>
      <strong class="run-score-feedback-runs">${escapeHtml(runsLabel)}</strong>
    </div>`;
}

function clearRunScoreFeedback(feedbackId = null) {
  if (feedbackId && runScoreFeedback?.id !== feedbackId) return;
  const delayedBatterIntroKey = pendingBatterIntroKey;
  runScoreFeedback = null;
  if (runScoreFeedbackTimer) {
    clearTimeout(runScoreFeedbackTimer);
    runScoreFeedbackTimer = null;
  }
  renderRunScoreFeedbackLayer();
  if (delayedBatterIntroKey) {
    clearPendingBatterIntro();
    renderBatterIntro(activeGame());
  }
}

function triggerRunScoreFeedback(feedback) {
  const runs = Number(feedback?.runs || 0);
  if (!runs) return;
  if (runScoreFeedbackTimer) clearTimeout(runScoreFeedbackTimer);
  runScoreFeedback = { ...feedback, runs, id: ++runScoreFeedbackSequence };
  renderRunScoreFeedbackLayer();
  const feedbackId = runScoreFeedback.id;
  runScoreFeedbackTimer = setTimeout(() => clearRunScoreFeedback(feedbackId), RUN_SCORE_FEEDBACK_DURATION_MS);
}

function closestFromEventTarget(target, selector) {
  if (!target) return null;
  if (typeof target.closest === "function") return target.closest(selector);
  const parent = target.parentElement || target.parentNode;
  return typeof parent?.closest === "function" ? parent.closest(selector) : null;
}

function scoringActionButtonKey(button) {
  if (!button?.dataset) return "";
  const entries = Object.keys(button.dataset)
    .sort()
    .map((key) => `${key}:${button.dataset[key]}`);
  const label = (button.textContent || "").trim().replace(/\s+/g, " ");
  return `${entries.join("|")}::${label}`;
}

function handleActionFeedbackPointerDown(event) {
  const button = closestFromEventTarget(event.target, "button");
  if (!button || button.disabled) return;
  const feedback = actionFeedbackForButton(button);
  if (!feedback) return;
  syncActionFeedbackButtonState(button, feedback);
}

function handleSpecialActionButton(button) {
  if (!button || button.disabled || !button.dataset.specialAction) return false;
  if (button.dataset.specialAction === "non_runner") {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    openNonRunnerSelect(button.dataset.specialTarget || selectedFieldRunnerBase);
    return true;
  }
  triggerActionFeedback(actionFeedbackForButton(button), button);
  applyEvent(activeGame(), {
    type: "special_action",
    action: button.dataset.specialAction,
    source: button.dataset.specialSource || selectedFieldRunnerBase,
    target: button.dataset.specialTarget
  });
  return true;
}

function handleScoringPanelPointerUpAction(event) {
  const button = closestFromEventTarget(event.target, SCORING_PANEL_POINTERUP_ACTION_SELECTOR);
  if (!button || button.disabled) return;
  if (button === scoringStepHoldConsumedButton && Date.now() - scoringStepHoldConsumedAt < 700) return;
  event.preventDefault();
  scoringStepPointerActionButton = button;
  scoringStepPointerActionKey = scoringActionButtonKey(button);
  scoringStepPointerActionAt = Date.now();
  handleScoringPanelClick({ target: button, pointerActionHandled: true });
}

function handleGameCompleteAction(button) {
  const action = button?.dataset?.gameCompleteAction || "";
  const gameId = button?.dataset?.gameCompleteGameId || scoreCompleteSummaryGameId;
  const game = state.games.find((item) => item.id === gameId);
  if (!game || !gameIsFinal(game)) return;
  if (action === "boxscore") {
    openBoxScore(game.id);
    return;
  }
  if (action === "sync") {
    syncCompletedGame(game.id).catch((error) => {
      markGameSyncFailed(game, error);
      saveStateWithOptions({ markLiveGamesDirty: false });
      render();
    });
    render();
    return;
  }
  if (action === "leave") {
    clearGameCompleteSummary(game.id);
    moveActiveGameOffFinal(game.id);
    switchView("games");
    render();
    return;
  }
  if (action === "undo") {
    undoLastPlay({ allowFinal: true });
  }
}

function handleScoringPanelClick(event) {
  const button = closestFromEventTarget(event.target, "button");
  if (!button) return;
  const fromPointerAction = Boolean(event.pointerActionHandled);
  const pointerActionAge = Date.now() - scoringStepPointerActionAt;
  const buttonActionKey = scoringActionButtonKey(button);
  const isDuplicatePointerClick = button === scoringStepPointerActionButton
    || (buttonActionKey && buttonActionKey === scoringStepPointerActionKey);
  if (!fromPointerAction && isDuplicatePointerClick) {
    const shouldSuppressSyntheticClick = Date.now() - scoringStepPointerActionAt < POINTER_ACTION_CLICK_SUPPRESS_MS || !button.isConnected;
    scoringStepPointerActionButton = null;
    scoringStepPointerActionKey = "";
    if (shouldSuppressSyntheticClick) return;
  }
  if (!fromPointerAction && scoringStepPointerActionAt && pointerActionAge >= POINTER_ACTION_CLICK_SUPPRESS_MS) {
    scoringStepPointerActionButton = null;
    scoringStepPointerActionKey = "";
  }
  if (button === scoringStepHoldConsumedButton && Date.now() - scoringStepHoldConsumedAt < 700) {
    scoringStepHoldConsumedButton = null;
    return;
  }
  if (button.dataset.scoreStepBack !== undefined) {
    backScoringStep();
    return;
  }
  if (button.dataset.gameCompleteAction) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    handleGameCompleteAction(button);
    return;
  }
  if (button.dataset.stepOpen) {
    setScoringStep(button.dataset.stepOpen);
    return;
  }
  if (button.dataset.stepPitch) {
    if (button.dataset.stepPitch === "strike") {
      const game = activeGame();
      const currentStrikes = game?.current?.strikes ?? game?.atBat?.strikes ?? 0;
      if (currentStrikes >= 2) {
        setScoringStep("strike_menu");
        return;
      }
    }
    const feedbackType = pitchFeedbackTypeForOutcome(button.dataset.stepPitch);
    if (feedbackType) triggerPitchFeedback(feedbackType, button);
    else triggerActionFeedback(actionFeedbackForButton(button), button);
    applyEvent(activeGame(), { type: "pitch", outcome: button.dataset.stepPitch });
    return;
  }
  if (button.dataset.stepAutoResult) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    applyEvent(activeGame(), { type: "resolve_play", result: button.dataset.stepAutoResult });
    return;
  }
  if (button.dataset.stepMore !== undefined) {
    setScoringStep("more");
    return;
  }
  if (button.dataset.specialAction) {
    handleSpecialActionButton(button);
    return;
  }
  if (button.dataset.runnerReplacementId) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    assignNonRunner(button.dataset.runnerReplacementId);
    return;
  }
  if (button.dataset.clearRunnerSelection !== undefined) {
    clearSelectedRunnerAction();
    return;
  }
  if (button.dataset.stepOutcome) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    applyEvent(activeGame(), { type: "ball_in_play", outcome: button.dataset.stepOutcome });
    return;
  }
  if (button.dataset.outType) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    pendingOutType = button.dataset.outType;
    pendingOutFielder = "";
    scoringStep = "out_fielder";
    renderScoringStepPanel();
    return;
  }
  if (button.dataset.outFielder) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    pendingOutFielder = button.dataset.outFielder;
    applyEvent(activeGame(), { type: "ball_in_play", outcome: pendingOutType || "GO", fieldedBy: pendingOutFielder });
    return;
  }
  if (button.dataset.runnerChoiceBase) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    const choice = button.dataset.runnerChoice;
    applyEvent(activeGame(), {
      type: choice === "out" ? "runner_out" : "runner_advance",
      base: button.dataset.runnerChoiceBase,
      to: choice
    });
    return;
  }
  if (button.dataset.confirmPlay !== undefined) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    applyEvent(activeGame(), { type: "resolve_play" });
    return;
  }
  if (button.dataset.opponentResult) {
    triggerActionFeedback(actionFeedbackForButton(button), button);
    applyEvent(activeGame(), { type: "resolve_play", result: button.dataset.opponentResult });
  }
}

function clearScoringStepHold() {
  if (scoringStepHoldTimer) {
    clearTimeout(scoringStepHoldTimer);
    scoringStepHoldTimer = null;
  }
  scoringStepHoldButton = null;
}

function handleScoringStepPointerDown(event) {
  const actionButton = closestFromEventTarget(event.target, SCORING_PANEL_POINTERUP_ACTION_SELECTOR);
  if (actionButton && !actionButton.disabled) event.preventDefault();
  const button = closestFromEventTarget(event.target, "button[data-hold-open]");
  if (!button) return;
  clearScoringStepHold();
  scoringStepHoldButton = button;
  scoringStepHoldTimer = setTimeout(() => {
    if (scoringStepHoldButton !== button) return;
    scoringStepHoldConsumedButton = button;
    scoringStepHoldConsumedAt = Date.now();
    clearScoringStepHold();
    setScoringStep(button.dataset.holdOpen);
  }, 450);
}

function handleScoringStepPointerUp(event) {
  const button = closestFromEventTarget(event.target, "button[data-hold-open]");
  if (!button || button !== scoringStepHoldButton) {
    clearScoringStepHold();
    return;
  }
  clearScoringStepHold();
}

function backScoringStep() {
  const game = activeGame();
  if (scoringStep === "runner_replacement") {
    pendingRunnerReplacementBase = "";
    scoringStep = selectedFieldRunnerBase ? "pitch" : "more";
  } else if (scoringStep === "runners") {
    pendingRunnerChoices = {};
    pendingRunnerOutBases = [];
    pendingSpray = null;
    awaitingRunnerDecision = false;
    awaitingSprayLocation = true;
    scoringStep = "spray";
  } else if (scoringStep === "spray") {
    pendingSpray = null;
    pendingRunnerChoices = {};
    pendingRunnerOutBases = [];
    pendingOutType = "";
    pendingOutFielder = "";
    bipOutcomeChosen = false;
    awaitingSprayLocation = false;
    awaitingRunnerDecision = false;
    if (game.atBat) game.atBat.pendingInPlay = true;
    scoringStep = "outcome";
  } else if (scoringStep === "out_fielder") {
    pendingOutFielder = "";
    scoringStep = "out_type";
  } else if (scoringStep === "out_type") {
    pendingOutType = "";
    if (game.atBat) game.atBat.pendingInPlay = true;
    scoringStep = "outcome";
  } else if (["ball_menu", "strike_menu"].includes(scoringStep)) {
    scoringStep = "pitch";
  } else if (scoringStep === "outcome" || scoringStep === "more") {
    clearPendingPlayState(game, true);
    scoringStep = "pitch";
  }
  saveState();
  renderAtBat();
  renderRunnerTracker();
  renderSprayChart();
  renderScoringStepPanel();
}

function latestScoringDockResult(game = activeGame()) {
  const lastEvent = game?.events?.[game.events.length - 1] || null;
  if (lastEvent) {
    const eventLabel = eventRules[lastEvent.result]?.label || lastEvent.result || "Play recorded";
    const outsAfter = Number.isFinite(lastEvent.outsAfter) ? lastEvent.outsAfter : Number.isFinite(lastEvent.outsBefore) ? lastEvent.outsBefore : game?.current?.outs || 0;
    return {
      title: eventLabel,
      meta: `${lastEvent.count || gameCountLabel(game)} \u2022 ${outsAfter} ${outsAfter === 1 ? "out" : "outs"}`
    };
  }
  const lastPitch = game?.atBat?.pitches?.[game.atBat.pitches.length - 1] || null;
  if (lastPitch) {
    const pitchLabel = lastPitch.label || pitchLabels[lastPitch.type] || "Pitch recorded";
    const countAfter = `${lastPitch.ballsAfter ?? game?.current?.balls ?? 0}-${lastPitch.strikesAfter ?? game?.current?.strikes ?? 0}`;
    const outs = game?.current?.outs || 0;
    return {
      title: pitchLabel,
      meta: `${countAfter} \u2022 ${outs} ${outs === 1 ? "out" : "outs"}`
    };
  }
  return {
    title: "No result yet",
    meta: "First pitch is waiting."
  };
}

function formatWinPctDisplay(value) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value || "0").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return ".000";
  const formatted = numeric.toFixed(3);
  return formatted.replace(/^0/, "");
}

function formatGameDateDisplay(value) {
  if (!value) return "Date TBD";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function formatGameDateWithYear(value) {
  if (!value) return "Date TBD";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

async function shareBoxScoreGame() {
  const game = state.games.find((item) => item.id === boxScoreGameId) || activeScoreGame();
  if (!game) return;
  const teams = boxScoreTeams(game);
  const away = teams.find((team) => team.side === "away") || teams[0];
  const home = teams.find((team) => team.side === "home") || teams[1] || teams[0];
  const title = `${gameMatchupLabel(game)} Box Score`;
  const text = `${title}\n${formatGameDateWithYear(game.date)} | ${gameStatusLabel(game)}\n${away.name} ${away.score} - ${home.score} ${home.name}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      window.alert("Box score details copied to clipboard.");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Share failed, falling back to alert.", error);
  }
  window.alert(text);
}

function homeNextGameMobileLabel(game) {
  if (!game) return "No upcoming game scheduled";
  return `Lions vs ${homeOpponentName(game)}`;
}

function formatShortMonthDay(value) {
  if (!value) return "Date TBD";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatArchiveDate(value) {
  if (!value) return "Date TBD";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
  return `${monthLabel}-${String(day).padStart(2, "0")}-${String(year).slice(-2)}`;
}

function formatGameTimeDisplay(value) {
  if (!value) return "";
  const [hours, minutes] = String(value).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function homeNextGameWhenLabel(game) {
  if (!game) return "Date and time TBD";
  const dateLabel = formatGameDateDisplay(game.date);
  const timeLabel = formatGameTimeDisplay(game.time);
  return `${dateLabel}${timeLabel ? ` | ${timeLabel}` : ""}`;
}

function homeNextGameStatusLabel(game) {
  if (!game?.date) return "Schedule and score updates show up here automatically.";
  const today = new Date(`${todayValue()}T00:00:00`);
  const gameDate = new Date(`${game.date}T00:00:00`);
  if (Number.isNaN(gameDate.getTime())) return "Upcoming game";
  const diffDays = Math.round((gameDate.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return "Starts today";
  if (diffDays === 1) return "Starts tomorrow";
  return `Starts in ${diffDays} days`;
}

function homeNextGameStatusState(game) {
  if (!game?.date) {
    return {
      text: "Schedule and score updates show up here automatically.",
      isLive: false
    };
  }
  if (gameLifecycle(game) === "active") {
    return {
      text: "Live",
      isLive: true
    };
  }
  return {
    text: homeNextGameStatusLabel(game),
    isLive: false
  };
}

function scoringDockBatterSummary(game = activeGame()) {
  if (!game) {
    return {
      name: "No batter",
      gameLine: "0 for 0",
      seasonLine: "--",
      number: "--",
      position: "--"
    };
  }
  if (isOpponentAtBat(game)) {
    const opponentLabel = currentOpponentBatter(game) || "Opponent batter";
    const lineupIndex = game.opponentBatterIndex || 0;
    const entry = opponentLineupEntriesForGame(game)[lineupIndex] || {};
    const summary = currentOpponentHeaderSummary(game, opponentLabel);
    return {
      name: entry.name || opponentLabel,
      gameLine: summary.line,
      seasonLine: `Spot ${lineupIndex + 1} in lineup`,
      number: entry.number || "--",
      position: entry.position || "AB"
    };
  }
  const batterId = currentBatterId(game);
  const player = state.roster.find((item) => item.id === batterId);
  const entry = gameLineupEntries(game).find((item) => item.playerId === batterId);
  const summary = currentGameBatterHeaderSummary(game, batterId);
  const stats = player ? statsForPlayer(player.id) : emptyStats();
  return {
    name: player ? player.name : "Current batter",
    gameLine: summary.line,
    seasonLine: `${formatRate(stats.avg)} AVG | ${stats.hr || 0} HR | ${stats.rbi || 0} RBI | ${formatRate(stats.obp)} OBP`,
    number: player?.number || "--",
    position: entry?.role || playerPrimaryPosition(player) || "AB"
  };
}

function scoringDockPitcherSummary(game = activeGame()) {
  if (!game) {
    return {
      name: "No pitcher",
      number: "--",
      pitches: 0,
      balls: 0,
      strikes: 0
    };
  }
  const pitcherId = currentPitcherId(game);
  const player = state.roster.find((item) => item.id === pitcherId);
  const stats = pitcherStatsWithCurrentAtBat(game);
  return {
    name: player ? player.name : "Lions pitcher",
    number: player?.number || "--",
    pitches: stats.pitches || 0,
    balls: stats.balls || 0,
    strikes: stats.strikes || 0
  };
}

function renderScoringDockUtilities(game = activeGame()) {
  if (!els.scoringDockFooter) return;
  const canScore = Boolean(game && game.status === "active" && !gameIsFinal(game));
  els.scoringDockFooter.hidden = !game;
  if (!game) return;
  const lionsBatting = isLionsAtBat(game);
  const opponentBatting = !lionsBatting;
  if (els.scoringDockSummary) {
    els.scoringDockSummary.classList.toggle("is-lions-batting", lionsBatting);
    els.scoringDockSummary.classList.toggle("is-opponent-batting", opponentBatting);
  }
  if (els.dockPitcherCard) els.dockPitcherCard.hidden = lionsBatting;
  if (els.dockSeasonCard) els.dockSeasonCard.hidden = opponentBatting;
  if (els.dockViewLineupBtn) els.dockViewLineupBtn.hidden = opponentBatting;
  if (els.dockBatterNumber) els.dockBatterNumber.hidden = opponentBatting;
  if (els.dockOpponentLineupBtn) els.dockOpponentLineupBtn.hidden = lionsBatting;
  const lastResult = latestScoringDockResult(game);
  if (els.dockLastResultTitle) els.dockLastResultTitle.textContent = lastResult.title;
  if (els.dockLastResultMeta) els.dockLastResultMeta.textContent = lastResult.meta;
  const balls = game?.atBat?.balls ?? game?.current?.balls ?? 0;
  const strikes = game?.atBat?.strikes ?? game?.current?.strikes ?? 0;
  if (els.dockCountValue) {
    els.dockCountValue.innerHTML = `<span class="count-balls">${balls}</span><span class="count-separator">-</span><span class="count-strikes">${strikes}</span>`;
  }
  if (els.dockCountMeta) {
    els.dockCountMeta.innerHTML = `<span class="count-balls">${balls} Ball${balls === 1 ? "" : "s"}</span><span class="count-dot">&bull;</span><span class="count-strikes">${strikes} Strike${strikes === 1 ? "" : "s"}</span>`;
  }
  if (els.dockBaseIndicators?.length) {
    els.dockBaseIndicators.forEach((node) => {
      const base = node.dataset.dockBase;
      node.classList.toggle("is-filled", Boolean(game?.bases?.[base]));
    });
  }
  if (els.dockOutDots?.length) {
    els.dockOutDots.forEach((dot, index) => {
      dot.classList.toggle("is-filled", index < (game?.outs || 0));
    });
  }
  const batterSummary = scoringDockBatterSummary(game);
  const batterNumber = batterSummary.number && batterSummary.number !== "--" ? batterSummary.number : "";
  const pitcherSummary = scoringDockPitcherSummary(game);
  if (els.dockPitcherNumber) els.dockPitcherNumber.textContent = pitcherSummary.number === "--" ? "P" : `#${pitcherSummary.number}`;
  if (els.dockPitcherName) {
    els.dockPitcherName.textContent = pitcherSummary.number && pitcherSummary.number !== "--"
      ? `#${pitcherSummary.number} ${pitcherSummary.name}`
      : pitcherSummary.name;
  }
  if (els.dockPitcherPitchCount) els.dockPitcherPitchCount.textContent = `Pitch Count: ${pitcherSummary.pitches}`;
  if (els.dockPitcherBreakdown) {
    els.dockPitcherBreakdown.innerHTML = `<span class="pitcher-balls">B: ${pitcherSummary.balls}</span><span class="pitcher-divider">|</span><span class="pitcher-strikes">S: ${pitcherSummary.strikes}</span><span class="pitcher-divider">|</span><span class="pitcher-total">T: ${pitcherSummary.pitches}</span>`;
  }
  if (els.dockChangePitcherBtn) {
    els.dockChangePitcherBtn.disabled = !canScore || lionsBatting;
    els.dockChangePitcherBtn.setAttribute("aria-label", `Change pitcher. Current pitcher ${pitcherSummary.name}.`);
  }
  if (els.dockBatterName) {
    els.dockBatterName.textContent = batterNumber ? `#${batterNumber} ${batterSummary.name}` : batterSummary.name;
  }
  if (els.dockBatterGameLine) els.dockBatterGameLine.textContent = batterSummary.gameLine;
  if (els.dockBatterSeasonLine) els.dockBatterSeasonLine.textContent = batterSummary.seasonLine;
  if (els.dockBatterNumber) els.dockBatterNumber.textContent = batterSummary.number && batterSummary.number !== "--" ? batterSummary.number : "--";
  if (els.dockOpponentLineupBtn) {
    els.dockOpponentLineupBtn.disabled = !canScore || lionsBatting;
    els.dockOpponentLineupBtn.setAttribute("aria-label", `Edit ${game.opponent || "opponent"} lineup`);
  }
  if (els.dockUndoLastPlayBtn) els.dockUndoLastPlayBtn.disabled = !canScore || !hasPlayHistory(game);
  if (els.dockViewLineupBtn) els.dockViewLineupBtn.disabled = !game || opponentBatting;
  if (els.dockViewScorebookBtn) els.dockViewScorebookBtn.disabled = !game?.id;
  if (els.openGameActionsBtn) els.openGameActionsBtn.hidden = !game;
}

function configurePanelUndoButton(button, iconType, title, subtitle) {
  if (!button) return;
  button.classList.add("pitch-secondary-card", "pitch-secondary-undo");
  button.innerHTML = `<span class="pitch-secondary-icon" aria-hidden="true">${pitchSecondaryIconMarkup(iconType)}</span>
    <span class="pitch-choice-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(subtitle)}</span>
    </span>`;
  button.hidden = false;
}

function placePanelUndoControls() {
  if (!els.scoringStepBody) return;
  const secondaryRow = els.scoringStepBody.querySelector(".panel-secondary-row");
  if (!secondaryRow) return;
  configurePanelUndoButton(els.panelUndoPitchBtn, "undo", "UNDO PITCH", "Undo Last Pitch");
  configurePanelUndoButton(els.dockUndoLastPlayBtn, "history", "UNDO PLAY", "Undo Last Play");
  if (els.panelUndoPitchBtn) secondaryRow.appendChild(els.panelUndoPitchBtn);
  if (els.dockUndoLastPlayBtn) secondaryRow.appendChild(els.dockUndoLastPlayBtn);
}

function currentLineupFocusRows(game = activeGame()) {
  if (!game) return [];
  if (isOpponentAtBat(game)) {
    const hitters = opponentLineupEntriesForGame(game);
    return hitters.map((entry, index) => ({
      label: opponentBatterLabel(entry, index),
      meta: `Spot ${index + 1}${index === (game.opponentBatterIndex || 0) ? " | Current hitter" : ""}`,
      isCurrent: index === (game.opponentBatterIndex || 0),
      isNext: index === ((game.opponentBatterIndex || 0) + 1) % Math.max(hitters.length, 1),
      isHole: index === ((game.opponentBatterIndex || 0) + 2) % Math.max(hitters.length, 1)
    }));
  }
  const entries = gameLineupEntries(game);
  return entries.map((entry, index) => {
    const player = state.roster.find((item) => item.id === entry.playerId);
    const stats = player ? statsForPlayer(player.id) : emptyStats();
    return {
      label: `#${player?.number || "--"} ${player?.name || "Open spot"}`,
      meta: `${entry.role || "Bench"} | AVG ${formatRate(stats.avg)} | OPS ${formatRate(stats.ops)}`,
      isCurrent: index === (game.batterIndex || 0),
      isNext: index === ((game.batterIndex || 0) + 1) % Math.max(entries.length, 1),
      isHole: index === ((game.batterIndex || 0) + 2) % Math.max(entries.length, 1)
    };
  });
}

function restoreLineupFocusContent() {
  const host = document.getElementById("scoreSidePanel");
  if (!host) return;
  const opponentEditor = els.scoreOpponentLineupInput?.closest(".opponent-lineup-editor") || null;
  const lineupAnchor = opponentEditor || null;
  if (els.liveLineup) host.insertBefore(els.liveLineup, lineupAnchor);
  if (els.subPanel) host.insertBefore(els.subPanel, lineupAnchor);
  if (els.opponentSubPanel) {
    if (opponentEditor) opponentEditor.after(els.opponentSubPanel);
    else host.appendChild(els.opponentSubPanel);
  }
}

function lineupFocusTitle(game = activeGame()) {
  if (!game) return "Lineup";
  return isOpponentAtBat(game) ? `${game.opponent || "Opponent"} Lineup` : "Lions Lineup";
}

function lineupFocusHint(game = activeGame()) {
  if (!game) return "No active game is loaded.";
  if (isOpponentAtBat(game)) {
    return `Review the current ${game.opponent || "opponent"} order, lineup context, and substitutions here.`;
  }
  return "Review the current Lions order, lineup context, and substitutions here.";
}

function renderLineupFocusModal(game = activeGame()) {
  if (!els.lineupFocusBody || !els.lineupFocusHint || !els.lineupFocusTitle) return;
  if (!game) {
    if (els.lineupFocusEyebrow) els.lineupFocusEyebrow.textContent = "Lineup";
    els.lineupFocusTitle.textContent = "Lineup";
    els.lineupFocusHint.textContent = "No active game is loaded.";
    els.lineupFocusBody.innerHTML = `<p class="player-meta">Start or resume a game to view the live lineup.</p>`;
    return;
  }
  renderLiveLineup();
  renderSubControls();
  const lineupLabel = lineupFocusTitle(game);
  if (els.lineupFocusEyebrow) {
    els.lineupFocusEyebrow.textContent = isOpponentAtBat(game) ? "Edit Lineup" : "View Lineup";
  }
  els.lineupFocusTitle.textContent = lineupLabel;
  els.lineupFocusHint.textContent = lineupFocusHint(game);
  const countLabel = els.lineupCount?.textContent || "";
  els.lineupFocusBody.innerHTML = `<div class="lineup-focus-layout">
      <div class="lineup-focus-topline">
        <span class="lineup-focus-section-label">Current Order</span>
        <span class="lineup-focus-count">${escapeHtml(countLabel)}</span>
      </div>
      <section class="lineup-focus-section">
        <div class="lineup-focus-section-head">
          <h4>${escapeHtml(lineupLabel)}</h4>
          <span class="player-meta">${escapeHtml(lineupFocusHint(game))}</span>
        </div>
        <div class="lineup-focus-list-host" id="lineupFocusListHost"></div>
      </section>
      <section class="lineup-focus-section">
        <div class="lineup-focus-section-head">
          <h4>${isOpponentAtBat(game) ? "Opponent Moves" : "Substitutions"}</h4>
          <span class="player-meta">${isOpponentAtBat(game) ? "Update the opposing order without leaving Score Game." : "Make lineup changes and keep the score screen focused."}</span>
        </div>
        <div class="lineup-focus-controls-host" id="lineupFocusControlsHost"></div>
      </section>
    </div>`;
  const listHost = document.getElementById("lineupFocusListHost");
  const controlsHost = document.getElementById("lineupFocusControlsHost");
  if (listHost && els.liveLineup) listHost.appendChild(els.liveLineup);
  if (controlsHost) {
    if (isOpponentAtBat(game)) {
      if (els.opponentSubPanel) controlsHost.appendChild(els.opponentSubPanel);
    } else if (els.subPanel) {
      controlsHost.appendChild(els.subPanel);
    }
  }
}

function openLineupFocusModal() {
  const game = activeGame();
  if (!game || !els.lineupFocusModal) return;
  renderLineupFocusModal(game);
  els.lineupFocusModal.hidden = false;
  window.setTimeout(() => {
    const focusTarget = isOpponentAtBat(game)
      ? els.lineupFocusBody?.querySelector("[data-opponent-lineup-index]")
      : els.closeLineupFocusBtn;
    focusTarget?.focus();
  }, 0);
}

function openOpponentLineupFocusModal() {
  const game = activeGame();
  if (!game || !isOpponentAtBat(game)) return;
  openLineupFocusModal();
}

function closeLineupFocusModal() {
  restoreLineupFocusContent();
  if (els.lineupFocusBody) els.lineupFocusBody.innerHTML = "";
  if (els.lineupFocusModal) els.lineupFocusModal.hidden = true;
}

function renderGameActionsModal(game = activeGame()) {
  if (!els.gameActionsStatusText) return;
  const isFinal = gameIsFinal(game);
  const hasSyncReady = Boolean(game?.id && isFinal);
  if (els.gameActionsSyncBtn) els.gameActionsSyncBtn.disabled = !hasSyncReady;
  if (els.gameActionsEndHalfBtn) els.gameActionsEndHalfBtn.disabled = !game || gameIsScoreLocked(game);
  if (els.gameActionsCompleteBtn) els.gameActionsCompleteBtn.disabled = !game || gameIsScoreLocked(game);
  if (els.gameActionsPostponeBtn) els.gameActionsPostponeBtn.disabled = !game || gameIsScoreLocked(game);
  if (els.gameActionsRestartBtn) els.gameActionsRestartBtn.disabled = !game || gameIsScoreLocked(game);
  if (!game) {
    els.gameActionsStatusText.textContent = "No active game is loaded.";
    return;
  }
  if (isFinal) {
    els.gameActionsStatusText.textContent = `Final score saved locally. Use Sync Completed Game to publish ${gameMatchupLabel(game)}.`;
  } else {
    els.gameActionsStatusText.textContent = `Manage ${gameMatchupLabel(game)} without leaving the scoring screen.`;
  }
}

function openGameActionsModal() {
  const game = activeGame();
  if (!game || !els.gameActionsModal) return;
  renderGameActionsModal(game);
  els.gameActionsModal.hidden = false;
}

function closeGameActionsModal() {
  if (els.gameActionsModal) els.gameActionsModal.hidden = true;
}

function eligiblePitcherOptions(game = activeGame()) {
  const currentPitcher = currentPitcherId(game);
  const eligible = state.roster.filter((player) => playerHasPosition(player, "P") || player.id === currentPitcher);
  return eligible.length ? eligible : [...state.roster];
}

function pitcherOptionMeta(player) {
  return [
    `Positions: ${formatPositions(player.positions)}`,
    `Throws: ${String(player.throws || "-").trim().toUpperCase()}`
  ].join(" | ");
}

function renderPitcherSelectModal(game = activeGame()) {
  if (!els.pitcherSelectList) return;
  const currentPitcher = currentPitcherId(game);
  const players = eligiblePitcherOptions(game);
  if (els.pitcherSelectHint) {
    els.pitcherSelectHint.textContent = "Choose an eligible Lions pitcher. The inning, count, outs, bases, score, and batter stay intact.";
  }
  els.pitcherSelectList.innerHTML = players.length
    ? players.map((player) => {
      const isCurrent = player.id === currentPitcher;
      return `<button type="button" class="pitcher-select-option ${isCurrent ? "is-current" : ""}" data-pitcher-select-id="${escapeHtml(player.id)}" ${isCurrent ? "disabled" : ""}>
        <span class="pitcher-select-number">#${escapeHtml(player.number || "--")}</span>
        <span class="pitcher-select-copy">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(pitcherOptionMeta(player))}</span>
        </span>
        <span class="pitcher-select-status">${isCurrent ? "Current" : "Select"}</span>
      </button>`;
    }).join("")
    : `<p class="player-meta">No rostered pitchers are available.</p>`;
}

function pitcherSelectFocusableElements() {
  if (!els.pitcherSelectModal || els.pitcherSelectModal.hidden) return [];
  return [...els.pitcherSelectModal.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
    .filter((node) => !node.hidden && node.offsetParent !== null);
}

function openPitcherSelectModal() {
  const game = activeGame();
  if (!game || gameIsScoreLocked(game) || !els.pitcherSelectModal) return;
  pitcherSelectLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderPitcherSelectModal(game);
  els.pitcherSelectModal.hidden = false;
  const focusTargets = pitcherSelectFocusableElements();
  (focusTargets.find((node) => node.dataset.pitcherSelectId) || els.closePitcherSelectBtn || focusTargets[0])?.focus();
}

function closePitcherSelectModal() {
  if (!els.pitcherSelectModal) return;
  els.pitcherSelectModal.hidden = true;
  if (els.pitcherSelectList) els.pitcherSelectList.innerHTML = "";
  pitcherSelectLastFocus?.focus?.();
  pitcherSelectLastFocus = null;
}

function handlePitcherSelectModalKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closePitcherSelectModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusTargets = pitcherSelectFocusableElements();
  if (!focusTargets.length) return;
  const first = focusTargets[0];
  const last = focusTargets[focusTargets.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function liveGameSnapshot(game = activeGame(), extras = {}) {
  return {
    inning: game.inning,
    half: game.half,
    outs: game.outs,
    bases: deepClone(game.bases),
    batterIndex: game.batterIndex,
    opponentBatterIndex: game.opponentBatterIndex || 0,
    score: deepClone(game.score),
    atBat: cloneAtBat(game.atBat || makeAtBat()),
    pitcherId: game.pitcherId || game.current?.pitcherId || "",
    currentPlateAppearanceId: game.currentPlateAppearanceId || "",
    ...extras
  };
}

function pendingScoringSnapshot() {
  return {
    pendingSpray: deepClone(pendingSpray),
    pendingRunnerOutBases: [...pendingRunnerOutBases],
    pendingRunnerChoices: deepClone(pendingRunnerChoices),
    pendingOutType,
    pendingOutFielder,
    bipOutcomeChosen,
    awaitingSprayLocation,
    awaitingRunnerDecision,
    scoringStep,
    selectedFieldRunnerBase,
    pendingRunnerReplacementBase
  };
}

function restorePendingScoringSnapshot(snapshot = {}) {
  pendingSpray = deepClone(snapshot.pendingSpray || null);
  pendingRunnerOutBases = Array.isArray(snapshot.pendingRunnerOutBases) ? [...snapshot.pendingRunnerOutBases] : [];
  pendingRunnerChoices = deepClone(snapshot.pendingRunnerChoices || {});
  pendingOutType = snapshot.pendingOutType || "";
  pendingOutFielder = snapshot.pendingOutFielder || "";
  bipOutcomeChosen = Boolean(snapshot.bipOutcomeChosen);
  awaitingSprayLocation = Boolean(snapshot.awaitingSprayLocation);
  awaitingRunnerDecision = Boolean(snapshot.awaitingRunnerDecision);
  scoringStep = snapshot.scoringStep || "pitch";
  selectedFieldRunnerBase = snapshot.selectedFieldRunnerBase || "";
  pendingRunnerReplacementBase = snapshot.pendingRunnerReplacementBase || "";
}

function restoreActiveGamePendingScoringState(game = activeScoreGame()) {
  if (!game?.pendingScoring) return false;
  restorePendingScoringSnapshot(game.pendingScoring);
  syncGameCurrent(game);
  healOrphanedScoringStep(game);
  return true;
}

function gameSnapshotForPlayHistory(game = activeGame()) {
  const snapshot = deepClone(game);
  if (snapshot) snapshot.playHistory = [];
  return snapshot;
}

function hasPlayHistory(game = activeGame()) {
  return Boolean(Array.isArray(game?.playHistory) && game.playHistory.length);
}

function pushPlayHistorySnapshot(game = activeGame(), details = {}) {
  if (!game) return null;
  syncGameCurrent(game);
  const entry = {
    id: createId("play-history"),
    reason: details.reason || "play",
    result: details.result || "",
    createdAt: new Date().toISOString(),
    game: gameSnapshotForPlayHistory(game),
    pending: pendingScoringSnapshot()
  };
  game.playHistory = normalizePlayHistory([...(game.playHistory || []), entry], game.id);
  return game.playHistory[game.playHistory.length - 1] || null;
}

function restorePlayHistorySnapshot(currentGame, historyEntry, remainingHistory = []) {
  if (!historyEntry?.game?.id) return null;
  const restoredGame = deepClone(historyEntry.game);
  restoredGame.playHistory = normalizePlayHistory(remainingHistory, restoredGame.id);
  restorePendingScoringSnapshot(historyEntry.pending);
  syncGameCurrent(restoredGame);
  const index = state.games.findIndex((game) => game.id === currentGame.id);
  if (index >= 0) state.games[index] = restoredGame;
  else state.games.push(restoredGame);
  state.activeGameId = restoredGame.id;
  return restoredGame;
}

function tagOpenPitcherPitches(game = activeGame(), pitcherId = currentPitcherId(game)) {
  if (!game || !pitcherId) return;
  const activeAppearance = getCurrentPlateAppearance(game, false);
  const openPitches = [
    ...(game.atBat?.pitches || []),
    ...(activeAppearance?.pitches || [])
  ];
  openPitches.forEach((pitch) => {
    if (!pitch.pitcherId) pitch.pitcherId = pitcherId;
  });
}

function changeActivePitcher(incomingPitcherId, game = activeGame()) {
  if (!game || gameIsScoreLocked(game) || !incomingPitcherId) return null;
  syncGameCurrent(game);
  const outgoingPitcherId = currentPitcherId(game);
  if (incomingPitcherId === outgoingPitcherId) {
    closePitcherSelectModal();
    return null;
  }
  const incoming = state.roster.find((player) => player.id === incomingPitcherId);
  if (!incoming) return null;
  const outgoing = state.roster.find((player) => player.id === outgoingPitcherId);
  tagOpenPitcherPitches(game, outgoingPitcherId);
  const snapshotBefore = liveGameSnapshot(game);
  const createdAt = new Date().toISOString();
  const record = {
    id: createId("sub"),
    gameId: game.id,
    inning: game.current.inning,
    half: game.current.half,
    teamSide: lionsSide(game),
    outgoingPlayerId: outgoingPitcherId,
    incomingPlayerId: incomingPitcherId,
    type: "pitcher",
    role: "P",
    notes: "Pitching change",
    createdAt
  };
  if (!game.substitutions) game.substitutions = [];
  if (!game.events) game.events = [];
  game.substitutions.push(record);
  game.pitcherId = incomingPitcherId;
  game.current.pitcherId = incomingPitcherId;
  const activeAppearance = getCurrentPlateAppearance(game, false);
  if (activeAppearance && !activeAppearance.result) activeAppearance.pitcherId = incomingPitcherId;
  game.events.push({
    id: createId("event"),
    gameId: game.id,
    playerId: incomingPitcherId,
    pitcherId: incomingPitcherId,
    result: "SUB",
    runs: 0,
    rbi: 0,
    contact: "none",
    launch: "none",
    leverage: "neutral",
    inning: game.current.inning,
    half: game.current.half,
    outsBefore: game.current.outs,
    outsAfter: game.current.outs,
    basesBefore: deepClone(game.current.runners),
    basesAfter: deepClone(game.current.runners),
    scope: "lineup",
    teamLabel: "Lions",
    substitutionId: record.id,
    substitutionType: "pitcher",
    playerName: incoming.name,
    note: `Pitching change: ${outgoing ? `#${outgoing.number} ${outgoing.name}` : "Previous pitcher"} to #${incoming.number} ${incoming.name}`,
    pitches: [],
    count: `${game.current.balls}-${game.current.strikes}`,
    spray: null,
    createdAt,
    snapshotBefore
  });
  saveState();
  render();
  closePitcherSelectModal();
  return record;
}

function latestScoringDockResult(game = activeGame()) {
  const lastEvent = game?.events?.[game.events.length - 1] || null;
  if (lastEvent) {
    const eventLabel = eventRules[lastEvent.result]?.label || lastEvent.result || "Play recorded";
    const outsAfter = Number.isFinite(lastEvent.outsAfter)
      ? lastEvent.outsAfter
      : Number.isFinite(lastEvent.outsBefore)
        ? lastEvent.outsBefore
        : game?.current?.outs || 0;
    return {
      title: eventLabel,
      meta: `${lastEvent.count || gameCountLabel(game)} \u2022 ${outsAfter} ${outsAfter === 1 ? "out" : "outs"}`
    };
  }
  const lastPitch = game?.atBat?.pitches?.[game.atBat.pitches.length - 1] || null;
  if (lastPitch) {
    const pitchLabel = lastPitch.label || pitchLabels[lastPitch.type] || "Pitch recorded";
    const countAfter = `${lastPitch.ballsAfter ?? game?.current?.balls ?? 0}-${lastPitch.strikesAfter ?? game?.current?.strikes ?? 0}`;
    const outs = game?.current?.outs || 0;
    return {
      title: pitchLabel,
      meta: `${countAfter} \u2022 ${outs} ${outs === 1 ? "out" : "outs"}`
    };
  }
  return {
    title: "No result yet",
    meta: "First pitch is waiting."
  };
}

function currentLineupFocusRows(game = activeGame()) {
  if (!game) return [];
  if (isOpponentAtBat(game)) {
    const hitters = opponentLineupEntriesForGame(game);
    return hitters.map((entry, index) => ({
      label: opponentBatterLabel(entry, index),
      meta: `Spot ${index + 1}${index === (game.opponentBatterIndex || 0) ? " | Current hitter" : ""}`,
      isCurrent: index === (game.opponentBatterIndex || 0),
      isNext: index === ((game.opponentBatterIndex || 0) + 1) % Math.max(hitters.length, 1),
      isHole: index === ((game.opponentBatterIndex || 0) + 2) % Math.max(hitters.length, 1)
    }));
  }
  const entries = gameLineupEntries(game);
  return entries.map((entry, index) => {
    const player = state.roster.find((item) => item.id === entry.playerId);
    const stats = player ? statsForPlayer(player.id) : emptyStats();
    return {
      label: `#${player?.number || "--"} ${player?.name || "Open spot"}`,
      meta: `${entry.role || "Bench"} | AVG ${formatRate(stats.avg)} | OPS ${formatRate(stats.ops)}`,
      isCurrent: index === (game.batterIndex || 0),
      isNext: index === ((game.batterIndex || 0) + 1) % Math.max(entries.length, 1),
      isHole: index === ((game.batterIndex || 0) + 2) % Math.max(entries.length, 1)
    };
  });
}

function gameCompleteResultLabel(game) {
  const lions = Number(game?.score?.lions || 0);
  const opponent = Number(game?.score?.opponent || 0);
  if (lions > opponent) return "Lions Win";
  if (lions < opponent) return "Game Complete";
  return "Final Tie";
}

function gameCompleteSyncMessage(game) {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  if (syncState.status === "syncing") return "Syncing this completed game to the shared site.";
  if (syncState.status === "synced") {
    return syncState.lastSyncedAt
      ? `Synced ${formatSyncTimestamp(syncState.lastSyncedAt)}.`
      : "Synced to the shared site.";
  }
  if (syncState.status === "error") {
    return syncState.lastError ? `Sync failed: ${syncState.lastError}` : "Sync failed. Try again when online.";
  }
  if (!online) return "Saved offline. Sync when online.";
  if (!isAdminMode() || !supabaseAdminEmail) return "Saved locally. Sign in as admin to sync.";
  if (!supabaseStorage?.isReady?.()) return "Saved locally. Supabase is still loading.";
  return "Saved locally and ready to sync.";
}

function gameCompleteSyncButtonLabel(game) {
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  if (syncState.status === "syncing") return "Syncing...";
  if (syncState.status === "synced") return "Synced";
  return "Sync Game";
}

function renderGameCompleteSummary(game) {
  const lastPlay = latestScoringDockResult(game);
  const finalDate = formatGameDateWithYear(game?.date || todayValue()) || "No date";
  const innings = completedInningCount(game);
  const undoDisabled = hasPlayHistory(game) ? "" : " disabled";
  const syncDisabled = canSyncGame(game) ? "" : " disabled";
  return `<section class="score-complete-summary">
    <div class="score-complete-card">
      <span class="score-complete-kicker">Final</span>
      <strong>${escapeHtml(gameScoreLabel(game))}</strong>
      <span>${escapeHtml(`${finalDate} | ${innings} ${innings === 1 ? "inning" : "innings"}`)}</span>
    </div>
    <div class="score-complete-details">
      <article>
        <span>Result</span>
        <strong>${escapeHtml(gameCompleteResultLabel(game))}</strong>
        <small>${escapeHtml(gameMatchupLabel(game))}</small>
      </article>
      <article>
        <span>Last Play</span>
        <strong>${escapeHtml(lastPlay.title)}</strong>
        <small>${escapeHtml(lastPlay.meta)}</small>
      </article>
      <article>
        <span>Sync Status</span>
        <strong>${escapeHtml(gameCompleteSyncMessage(game))}</strong>
        <small>Leaving this screen will not remove the saved final game.</small>
      </article>
    </div>
    <div class="score-complete-actions">
      <button type="button" class="primary-action" data-game-complete-action="boxscore" data-game-complete-game-id="${escapeHtml(game.id)}">View Box Score</button>
      <button type="button" class="secondary-action" data-game-complete-action="sync" data-game-complete-game-id="${escapeHtml(game.id)}"${syncDisabled}>${escapeHtml(gameCompleteSyncButtonLabel(game))}</button>
      <button type="button" class="secondary-action" data-game-complete-action="leave" data-game-complete-game-id="${escapeHtml(game.id)}">Leave Score Game</button>
      <button type="button" class="secondary-action" data-game-complete-action="undo" data-game-complete-game-id="${escapeHtml(game.id)}"${undoDisabled}>Undo Last Play</button>
    </div>
  </section>`;
}

function renderScoringStepPanel() {
  if (!els.scoringStepPanel) return;
  const game = activeGame();
  if (!game.atBat) game.atBat = makeAtBat();
  if (gameIsFinal(game)) {
    els.scoringStepPanel.dataset.step = "final";
    els.scoringStepEyebrow.textContent = "Final";
    els.scoringStepTitle.textContent = gameCompleteResultLabel(game);
    els.scoringStepHint.textContent = "Review the final summary, sync when available, or undo the final play if it needs correction.";
    els.panelUndoPitchBtn.hidden = true;
    els.scoringStepBody.innerHTML = renderGameCompleteSummary(game);
    renderScoringDockUtilities(game);
    return;
  }
  const selectedRunnerConfig = selectedRunnerActionConfig(game);
  if (selectedRunnerConfig) {
    els.scoringStepPanel.dataset.step = "runner_action";
    els.scoringStepEyebrow.textContent = selectedRunnerConfig.eyebrow;
    els.scoringStepTitle.textContent = selectedRunnerConfig.title;
    els.scoringStepHint.textContent = selectedRunnerConfig.hint;
    els.panelUndoPitchBtn.hidden = true;
    const backButton = els.scoringStepPanel.querySelector("[data-score-step-back]");
    if (backButton) backButton.hidden = true;
    els.scoringStepBody.innerHTML = selectedRunnerConfig.body;
    renderScoringDockUtilities(game);
    return;
  }
  if (game.status !== "active") {
    els.scoringStepPanel.dataset.step = "scheduled";
    els.scoringStepEyebrow.textContent = "Future";
    els.scoringStepTitle.textContent = "Game not started";
    els.scoringStepHint.textContent = "Start this game from the Home or Games tab before scoring.";
    els.panelUndoPitchBtn.hidden = true;
    els.scoringStepBody.innerHTML = `<div class="auto-score">${escapeHtml(gameMatchupLabel(game))}</div>`;
    renderScoringDockUtilities(game);
    return;
  }
  healOrphanedScoringStep(game);
  if (isOpponentAtBat(game)) {
    renderOpponentScoringStepPanel(game);
    renderScoringDockUtilities(game);
    return;
  }
  if (awaitingRunnerDecision) scoringStep = "runners";
  else if (awaitingSprayLocation) scoringStep = "spray";
  else if (game.atBat.pendingInPlay && !["out_type", "out_fielder"].includes(scoringStep)) scoringStep = "outcome";
  const config = scoringStepConfig(game);
  els.scoringStepPanel.dataset.step = scoringStep;
  els.scoringStepEyebrow.textContent = config.eyebrow;
  els.scoringStepTitle.textContent = config.title;
  els.scoringStepHint.textContent = config.hint;
  els.panelUndoPitchBtn.hidden = !["pitch", "more", "ball_menu", "strike_menu"].includes(scoringStep);
  const backButton = els.scoringStepPanel.querySelector("[data-score-step-back]");
    if (backButton) backButton.hidden = scoringStep === "pitch";
    els.scoringStepBody.innerHTML = config.body;
    placePanelUndoControls();
    renderScoringDockUtilities(game);
  }

function selectedRunnerActionConfig(game) {
  if (!selectedFieldRunnerBase) return null;
  if (!["pitch", "more"].includes(scoringStep)) return null;
  if (awaitingSprayLocation || awaitingRunnerDecision || game.atBat?.pendingInPlay) return null;
  reconcileGameBasesFromEvents(game);
  const base = selectedFieldRunnerBase;
  const runner = game.bases?.[base];
  if (!isOccupied(runner)) return null;
  const stealTarget = nextBaseForRunner(base);
  const canSteal = Boolean(
    stealTarget && (stealTarget === "home" || !isOccupied(game.bases?.[stealTarget]))
  );
  const canBalk = canSteal;
  const canUseNonRunner = isLionsAtBat(game) && eligibleNonRunnerPlayers(game, base).length > 0;
  const runnerLabel = runnerName(runner) || `#${runnerNumber(runner) || ""}`.trim() || "Runner";
  return {
    eyebrow: "Runner Action",
    title: `${runnerLabel} on ${baseLabel(base)}`,
    hint: "Choose SB, CS, PO, Balk, or NR. Use Back if you selected the runner by mistake.",
    body: `<div class="special-action-group runner-action-group">
      <span>${escapeHtml(runnerLabel)} selected on ${escapeHtml(baseLabel(base))}</span>
      <div class="step-grid step-grid-special runner-action-grid">
        <button type="button" class="step-button step-safe" data-special-action="steal" data-special-source="${escapeHtml(base)}" data-special-target="${escapeHtml(stealTarget)}"${canSteal ? "" : " disabled"}>SB ${escapeHtml(baseLabel(stealTarget))}</button>
        <button type="button" class="step-button step-danger" data-special-action="caught_stealing" data-special-source="${escapeHtml(base)}" data-special-target="${escapeHtml(stealTarget)}">CS ${escapeHtml(baseLabel(stealTarget))}</button>
        <button type="button" class="step-button step-danger" data-special-action="pickoff" data-special-source="${escapeHtml(base)}" data-special-target="${escapeHtml(base)}">PO ${escapeHtml(baseLabel(base))}</button>
        <button type="button" class="step-button step-neutral" data-special-action="balk" data-special-source="${escapeHtml(base)}" data-special-target="${escapeHtml(stealTarget)}"${canBalk ? "" : " disabled"}>BALK ${escapeHtml(baseLabel(stealTarget))}</button>
        <button type="button" class="step-button step-neutral" data-special-action="non_runner" data-special-target="${escapeHtml(base)}"${canUseNonRunner ? "" : " disabled"}>NR</button>
      </div>
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-clear-runner-selection>Back</button>
      </div>
    </div>`
  };
}

function scoringStepConfig(game) {
  if (scoringStep === "runner_replacement") {
    const base = pendingRunnerReplacementBase || selectedFieldRunnerBase;
    const currentRunner = game.bases?.[base];
    const options = eligibleNonRunnerPlayers(game, base);
    const optionButtons = options.length
      ? `<div class="step-grid step-grid-runner-replacement">
          ${options.map((player) => `<button type="button" class="step-button step-neutral nr-runner-choice" data-runner-replacement-id="${escapeHtml(player.id)}">#${escapeHtml(player.number || "--")} ${escapeHtml(player.name)}</button>`).join("")}
        </div>`
      : `<div class="auto-score">No eligible lineup runners are available.</div>`;
    return {
      eyebrow: "Non Runner",
      title: `Select NR for ${baseLabel(base)}`,
      hint: `Choose who is running for ${playerDisplayName(currentRunner)}. Future steals and runs score to the NR.`,
      body: `${optionButtons}
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
      </div>`
    };
  }
  if (scoringStep === "ball_menu") {
    return {
      eyebrow: "Ball",
      title: "Ball Options",
      hint: "Choose a special ball result.",
      body: `<div class="step-grid step-grid-three">
        ${stepButton("Record Ball", "step-pitch", "ball", "ball")}
        ${stepButton("Intentional Walk", "step-auto-result", "BB", "neutral")}
        ${stepButton("HBP", "step-auto-result", "HBP", "hbp")}
      </div>
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
      </div>`
    };
  }
  if (scoringStep === "strike_menu") {
    const strikeThree = (game?.current?.strikes || 0) >= 2;
    return {
      eyebrow: strikeThree ? "Strike Three" : "Strike",
      title: strikeThree ? "How Did Strike Three Happen?" : "Strike Options",
      hint: strikeThree ? "Choose swinging or looking to finish the at-bat." : "Track whether the strike was called or swinging.",
      body: `<div class="step-grid step-grid-two">
        ${stepButton("Swinging K", "step-pitch", "swinging_strike", "strike")}
        ${stepButton("Looking K", "step-pitch", "called_strike", "strike")}
      </div>
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
      </div>`
    };
  }
  if (scoringStep === "more") {
    return {
      eyebrow: "More",
      title: "Quick Result",
      hint: "Use quick results or separate runner actions outside ball-in-play flow.",
      body: `<div class="step-grid step-grid-three">
        ${stepButton("Walk", "step-auto-result", "BB", "neutral")}
        ${stepButton("Strikeout", "step-auto-result", "K", "out")}
        ${stepButton("HBP", "step-auto-result", "HBP", "hbp")}
      </div>
      ${renderSpecialActionGrid(game)}`
    };
  }
  if (scoringStep === "outcome") {
    return {
      eyebrow: "Ball In Play",
      title: "Select Outcome",
      hint: "Choose result, then tap field location.",
      body: `<div class="step-grid step-grid-outcomes">
        ${stepButton("Single", "step-outcome", "1B", "hit")}
        ${stepButton("Double", "step-outcome", "2B", "hit")}
        ${stepButton("Triple", "step-outcome", "3B", "hit")}
        ${stepButton("Home Run", "step-outcome", "HR", "hit")}
        ${stepButton("Out", "step-outcome", "OUT", "out")}
        ${stepButton("Error", "step-outcome", "ROE", "error")}
        ${stepButton("Fielder's Choice", "step-outcome", "FC", "out")}
        ${stepButton("Double Play", "step-outcome", "DP", "out")}
        ${stepButton("Sacrifice", "step-outcome", "SAC", "out")}
      </div>
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
      </div>`
    };
  }
  if (scoringStep === "out_type") {
    return {
      eyebrow: "Out Detail",
      title: "Choose Out Type",
      hint: "Scorebook notation depends on the out type and fielder.",
      body: `<div class="step-grid step-grid-three">
        ${stepButton("Ground Out", "out-type", "GO", "out")}
        ${stepButton("Fly Out", "out-type", "FO", "out")}
        ${stepButton("Line Out", "out-type", "LO", "out")}
      </div>`
    };
  }
  if (scoringStep === "out_fielder") {
    const isErrorFielder = pendingOutType === "ROE";
    return {
      eyebrow: isErrorFielder ? "Error Detail" : "Scorebook Detail",
      title: `${resultLabel(pendingOutType || "GO")} - Fielder`,
      hint: isErrorFielder ? "Choose the defender charged with the error." : "Choose the primary defender who made the play.",
      body: `<div class="step-grid step-grid-fielders">
        ${defensivePositions.map((position) => stepButton(position, "out-fielder", position, "neutral")).join("")}
      </div>`
    };
  }
  if (scoringStep === "spray") {
    return {
      eyebrow: "Spray Chart",
      title: `${resultLabel(els.resultSelect.value)} Selected`,
      hint: pendingSpray ? `Marked ${pendingSpray.zone}.` : "Tap the field where the ball landed or was fielded.",
      body: `<div class="spray-instruction-card">
        <strong>${escapeHtml(resultLabel(els.resultSelect.value))}</strong>
        <span>Keep the field clear. Tap the landing or fielded spot on the diamond.</span>
      </div>
      <div class="confirm-play-row spray-step-actions">
        <button type="button" class="secondary-action" data-score-step-back>Back to Select Outcome</button>
      </div>`
    };
  }
  if (scoringStep === "runners") {
    const result = els.resultSelect.value;
    if (!Object.keys(pendingRunnerChoices).length) initializeRunnerDecisionChoices(game, result);
    return {
      eyebrow: "Runner Decisions",
      title: "Set Advancements",
      hint: runnerDecisionError || "Choose where each involved runner ended, then confirm.",
      body: `${runnerDecisionCards(game, result).map(renderRunnerDecisionCard).join("")}
        <div class="confirm-play-row">
          <button type="button" class="secondary-action" data-score-step-back>Back</button>
          <button type="button" class="primary-action confirm-play-button" data-confirm-play>Confirm Play</button>
        </div>`
    };
  }
  return {
    eyebrow: "Pitch Mode",
    title: "Record Pitch",
    hint: "Tap a result. Hold Ball for intentional walk or HBP.",
    body: `${pitchModePrimaryCards()}
      ${pitchModeSecondaryRow()}`
  };
}

function legacyPitchModePrimaryCards() {
  return `<div class="pitch-choice-stack">
    ${pitchChoiceActionCard("Ball", "Record Ball", "step-open", "ball_menu", "ball", "⚾")}
    ${pitchChoiceActionCard("Strike", "Record Strike", "step-open", "strike_menu", "strike", "◎")}
    ${pitchChoiceActionCard("In Play", "Ball In Play", "step-pitch", "in_play", "inplay", "◇")}
  </div>`;
}

function legacyPitchChoiceActionCard(title, subtitle, dataName, value, tone, icon) {
  return `<button type="button" class="pitch-choice-card pitch-choice-${tone}" data-${dataName}="${escapeHtml(value)}">
    <span class="pitch-choice-icon" aria-hidden="true">${escapeHtml(icon)}</span>
    <span class="pitch-choice-copy">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(subtitle)}</span>
    </span>
    <span class="pitch-choice-arrow" aria-hidden="true">›</span>
  </button>`;
}

function pitchModePrimaryCards() {
  return `<div class="pitch-choice-stack pitch-choice-primary-row">
    ${pitchChoiceActionCard("BALL", "Record Ball", "step-pitch", "ball", "ball", "", "Hold for IBB or HBP", "ball_menu")}
    ${pitchChoiceActionCard("STRIKE", "Record Strike", "step-pitch", "strike", "strike", "")}
    ${pitchChoiceActionCard("IN PLAY", "Ball In Play", "step-pitch", "in_play", "inplay", "")}
  </div>`;
}

function pitchChoiceIconMarkup(tone) {
  if (tone === "ball") {
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2.2"></circle>
      <path d="M17 10c3 4 4 8 4 14s-1 10-4 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path>
      <path d="M31 10c-3 4-4 8-4 14s1 10 4 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path>
      <path d="M15 17c2 1 4 2 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <path d="M15 31c2-1 4-2 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <path d="M33 17c-2 1-4 2-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      <path d="M33 31c-2-1-4-2-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
    </svg>`;
  }
  if (tone === "strike") {
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="11" fill="none" stroke="currentColor" stroke-width="2.2"></circle>
      <path d="M8 14v-6h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M40 14v-6h-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M8 34v6h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M40 34v6h-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path d="M24 6l18 18-18 18L6 24 24 6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"></path>
    <path d="M24 11l4 4-4 4-4-4 4-4z" fill="none" stroke="currentColor" stroke-width="2"></path>
    <path d="M37 24l-4 4-4-4 4-4 4 4z" fill="none" stroke="currentColor" stroke-width="2"></path>
    <path d="M24 37l-4-4 4-4 4 4-4 4z" fill="none" stroke="currentColor" stroke-width="2"></path>
    <path d="M11 24l4-4 4 4-4 4-4-4z" fill="none" stroke="currentColor" stroke-width="2"></path>
  </svg>`;
}

function pitchChoiceActionCard(title, subtitle, dataName, value, tone, icon, helper = "", holdOpen = "") {
  const feedbackClass = dataName === "step-pitch" ? pitchFeedbackClassForOutcome(value) : "";
  return `<button type="button" class="pitch-choice-card pitch-choice-${tone}${holdOpen ? " has-hold" : ""}${feedbackClass}" data-${dataName}="${escapeHtml(value)}"${holdOpen ? ` data-hold-open="${escapeHtml(holdOpen)}"` : ""}>
    <span class="pitch-choice-content">
      <span class="pitch-choice-icon" aria-hidden="true">${pitchChoiceIconMarkup(tone)}</span>
      <span class="pitch-choice-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
        ${helper ? `<small>${escapeHtml(helper)}</small>` : ""}
      </span>
    </span>
  </button>`;
}

function pitchModeSecondaryRow() {
  return `<div class="panel-secondary-row pitch-choice-secondary-row">
    <button type="button" class="pitch-secondary-card pitch-secondary-foul" data-step-pitch="foul">
      <span class="pitch-secondary-icon" aria-hidden="true">${pitchSecondaryIconMarkup("foul")}</span>
      <span class="pitch-choice-copy">
        <strong>FOUL</strong>
        <span>Record Foul</span>
      </span>
    </button>
  </div>`;
}

function pitchSecondaryIconMarkup(type) {
  if (type === "history") {
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M16 12h-7v-7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M10 12c4-5 10-8 17-6 9 2 15 10 13 20-2 9-11 16-21 13" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M24 15v10l7 4" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
  }
  if (type === "undo") {
    return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M18 16h-8v-8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M12 16c4-5 10-8 17-6 8 2 13 10 11 18-2 9-11 14-20 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="3"></circle>
    <path d="M17 17l14 14M31 17L17 31" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
  </svg>`;
}

function renderOpponentScoringStepPanel(game) {
  els.scoringStepPanel.dataset.step = "opponent";
  els.scoringStepEyebrow.textContent = "Opponent";
  els.scoringStepTitle.textContent = currentOpponentBatter(game);
  els.panelUndoPitchBtn.hidden = !["pitch", "more", "ball_menu", "strike_menu"].includes(scoringStep);
  const backButton = els.scoringStepPanel.querySelector("[data-score-step-back]");
  if (backButton) backButton.hidden = scoringStep === "pitch";

  if (scoringStep === "ball_menu") {
    els.scoringStepHint.textContent = "Choose a special ball result.";
    els.scoringStepBody.innerHTML = `<div class="step-grid step-grid-three">
      ${stepButton("Record Ball", "step-pitch", "ball", "ball")}
      ${stepButton("Intentional Walk", "step-auto-result", "BB", "neutral")}
      ${stepButton("HBP", "step-auto-result", "HBP", "hbp")}
    </div>
    <div class="confirm-play-row">
      <button type="button" class="secondary-action" data-score-step-back>Back</button>
    </div>`;
    return;
  }

  if (scoringStep === "strike_menu") {
    const strikeThree = (game?.current?.strikes || 0) >= 2;
    els.scoringStepHint.textContent = strikeThree
      ? "Choose swinging or looking to finish the at-bat."
      : "Track whether the strike was called or swinging.";
    els.scoringStepBody.innerHTML = `<div class="step-grid step-grid-two">
      ${stepButton("Swinging K", "step-pitch", "swinging_strike", "strike")}
      ${stepButton("Looking K", "step-pitch", "called_strike", "strike")}
    </div>
    <div class="confirm-play-row">
      <button type="button" class="secondary-action" data-score-step-back>Back</button>
    </div>`;
    return;
  }

  if (scoringStep === "out_type") {
    els.scoringStepHint.textContent = "Choose the type of out.";
    els.scoringStepBody.innerHTML = `<div class="step-grid step-grid-three">
      ${stepButton("Ground Out", "out-type", "GO", "out")}
      ${stepButton("Fly Out", "out-type", "FO", "out")}
      ${stepButton("Line Out", "out-type", "LO", "out")}
    </div>`;
    return;
  }

  if (scoringStep === "out_fielder") {
    els.scoringStepHint.textContent = pendingOutType === "ROE" ? "Choose the defender charged with the error." : "Choose the primary defender who made the play.";
    els.scoringStepBody.innerHTML = `<div class="step-grid step-grid-fielders">
      ${defensivePositions.map((position) => stepButton(position, "out-fielder", position, "neutral")).join("")}
    </div>`;
    return;
  }

  if (scoringStep === "outcome" || game.atBat.pendingInPlay) {
    scoringStep = "outcome";
    els.scoringStepHint.textContent = "Choose the ball-in-play result to complete this opponent AB.";
    els.scoringStepBody.innerHTML = `${opponentOutcomeGrid()}
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
      </div>`;
    return;
  }

  if (scoringStep === "runners" || awaitingRunnerDecision) {
    const result = normalizeBallInPlayOutcome(els.resultSelect.value || pendingOutType || "GO");
    if (!Object.keys(pendingRunnerChoices).length) initializeRunnerDecisionChoices(game, result);
    scoringStep = "runners";
    els.scoringStepPanel.dataset.step = "runners";
    els.scoringStepHint.textContent = runnerDecisionError || "Set the opponent runner destinations, then confirm the play.";
    els.scoringStepBody.innerHTML = `${runnerDecisionCards(game, result).map(renderRunnerDecisionCard).join("")}
      <div class="confirm-play-row">
        <button type="button" class="secondary-action" data-score-step-back>Back</button>
        <button type="button" class="primary-action confirm-play-button" data-confirm-play>Confirm Play</button>
      </div>`;
    return;
  }

  if (scoringStep === "more") {
    els.scoringStepHint.textContent = "Use quick opponent results or runner actions without a ball in play.";
    els.scoringStepBody.innerHTML = `<div class="step-grid step-grid-three">
      ${stepButton("Walk", "step-auto-result", "BB", "neutral")}
      ${stepButton("Strikeout", "step-auto-result", "K", "out")}
      ${stepButton("HBP", "step-auto-result", "HBP", "hbp")}
    </div>
    ${renderSpecialActionGrid(game)}`;
    return;
  }

  scoringStep = "pitch";
  els.scoringStepHint.textContent = "Tap a result. Hold Ball for intentional walk or HBP. Runner badges open SB, CS, or PO.";
  els.scoringStepBody.innerHTML = `${pitchModePrimaryCards()}
      ${pitchModeSecondaryRow()}`;
  placePanelUndoControls();
}

function stepButton(label, dataName, value, tone) {
  const feedbackClass = dataName === "step-pitch" ? pitchFeedbackClassForOutcome(value) : "";
  return `<button type="button" class="step-button step-${tone}${feedbackClass}" data-${dataName}="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function opponentOutcomeGrid() {
  return `<div class="step-grid step-grid-opponent">
    ${["1B", "2B", "3B", "HR", "OUT", "ROE", "FC", "DP", "SAC"]
      .map((result) => {
        const label = result === "OUT" ? "Out" : resultLabel(result);
        const tone = result === "OUT" ? "step-out" : stepToneForResult(result);
        return `<button type="button" class="step-button ${tone}" data-step-outcome="${result}">${escapeHtml(label)}</button>`;
      })
      .join("")}
  </div>`;
}

function renderSpecialActionGrid(game = activeGame()) {
  const buttons = [];
  const add = (label, action, target, tone = "neutral") => {
    buttons.push(`<button type="button" class="step-button step-${tone}" data-special-action="${action}" data-special-target="${target}">${escapeHtml(label)}</button>`);
  };
  if (isOccupied(game.bases.first) && !isOccupied(game.bases.second)) {
    add("Steal 2B", "steal", "second", "hit");
    add("Caught 2B", "caught_stealing", "second", "out");
    add("Pick Off 1B", "pickoff", "first", "out");
    add("Tag 1B to 2B", "tag_up", "second", "neutral");
  }
  if (isOccupied(game.bases.second) && !isOccupied(game.bases.third)) {
    add("Steal 3B", "steal", "third", "hit");
    add("Caught 3B", "caught_stealing", "third", "out");
    add("Pick Off 2B", "pickoff", "second", "out");
    add("Tag 2B to 3B", "tag_up", "third", "neutral");
  }
  if (isOccupied(game.bases.third)) {
    add("Steal Home", "steal", "home", "hit");
    add("Caught Home", "caught_stealing", "home", "out");
    add("Pick Off 3B", "pickoff", "third", "out");
    add("Tag 3B Home", "tag_up", "home", "neutral");
  }
  if (!buttons.length) {
    return `<div class="special-action-empty">No runners are available for steal, caught stealing, pickoff, or tag up.</div>`;
  }
  return `<div class="special-action-group">
    <span>Runner Actions</span>
    <div class="step-grid step-grid-special">${buttons.join("")}</div>
  </div>`;
}

function renderRunnerDecisionCard(card) {
  const selected = runnerChoiceDestination(card.base) || "hold";
  const destination = baseLabel(card.to || "hold");
  return `<article class="runner-decision-card ${card.adjusted ? "is-adjusted" : "is-auto"}">
    <div class="runner-decision-summary">
      <strong>Runner: ${escapeHtml(card.label)}</strong>
      <span class="runner-route">${escapeHtml(card.start)} &rarr; ${escapeHtml(destination)}</span>
      <em class="runner-auto-badge">${card.adjusted ? "ADJUSTED" : "AUTO"}</em>
    </div>
    <div class="runner-choice-group">
      ${runnerOverrideOptions(card).map((option) => `<button type="button" class="runner-choice ${selected === option ? "is-selected" : ""} ${option === "out" ? "is-out" : ""}" data-runner-choice-base="${card.base}" data-runner-choice="${option}">${escapeHtml(runnerOverrideLabel(card, option))}</button>`).join("")}
    </div>
  </article>`;
}

function runnerOverrideOptions(card) {
  return (card.options || []).filter((option) => {
    if (card.base === "batter") return option !== "hold";
    return ["hold", ...runnerDestinationsAheadOf(card.start), "out"].includes(option);
  });
}

function runnerOverrideLabel(card, option) {
  if (option === "home") return "Score";
  if (option === "out") return "Out";
  if (option === "hold") return "Hold";
  return baseLabel(option);
}

function runnerDestinationsAheadOf(start) {
  if (start === "Batter") return ["first", "second", "third", "home"];
  if (start === "1B") return ["second", "third", "home"];
  if (start === "2B") return ["third", "home"];
  if (start === "3B") return ["home"];
  return [];
}

function nextBaseFrom(start) {
  if (start === "Batter") return "first";
  if (start === "1B") return "second";
  if (start === "2B") return "third";
  if (start === "3B") return "home";
  return "";
}

function resultLabel(result) {
  return eventRules[result]?.label || result || "Result";
}

function stepToneForResult(result) {
  if (["1B", "2B", "3B", "HR"].includes(result)) return "step-hit";
  if (["ROE", "HBP"].includes(result)) return "step-error";
  if (["BB"].includes(result)) return "step-neutral";
  return "step-out";
}

function renderAtBat() {
  const game = activeGame();
  if (!game.atBat) game.atBat = makeAtBat();
  const isOpponentHalf = isOpponentAtBat(game);
  const currentPlayer = state.roster.find((player) => player.id === currentBatterId(game));
  const currentEntry = gameLineupEntries(game).find((entry) => entry.playerId === currentPlayer?.id);
  els.currentBatterName.textContent = currentPlayer ? `#${currentPlayer.number} ${currentPlayer.name}` : "Current batter";
  els.currentBatterMeta.textContent = currentPlayer
    ? `${currentEntry?.role || "UTIL"} | ${lionsSide(game) === "home" ? "Home" : "Away"} Lions hitting`
    : "Set an active lineup to begin.";
  renderCurrentBatterSummary(game, currentPlayer);
  els.countDisplay.textContent = `${game.atBat.balls}-${game.atBat.strikes}`;
  els.currentOutsDisplay.textContent = `${game.outs} ${game.outs === 1 ? "out" : "outs"}`;
  const opponentBatter = currentOpponentBatter(game);
  renderPitcherSelect(game);
  els.opponentBatterName.textContent = opponentBatter;
  els.opponentBatterMeta.textContent = `${opponentSide(game) === "home" ? "Home" : "Away"} ${game.opponent} lineup | Batter ${(game.opponentBatterIndex || 0) + 1} of ${opponentLineup(game).length}`;
  renderOpponentBatterSummary(game, opponentBatter);
  els.opponentCountDisplay.textContent = `${game.atBat.balls}-${game.atBat.strikes}`;
  els.opponentOutsDisplay.textContent = `${game.outs} ${game.outs === 1 ? "out" : "outs"}`;
  els.opponentPitchTrail.innerHTML = game.atBat.pitches.length
    ? game.atBat.pitches
        .map((pitch, index) => `<span class="pitch-chip ${pitch.type}">${index + 1}. ${escapeHtml(pitch.label)}</span>`)
        .join("")
    : `<span class="player-meta">No pitches to this opponent hitter.</span>`;
  if (els.undoOpponentPlayBtn) {
    els.undoOpponentPlayBtn.disabled = !game.events.length || gameIsScoreLocked(game);
  }
  renderPitcherStatStrip(game);
  els.pitchTrail.innerHTML = game.atBat.pitches.length
    ? game.atBat.pitches
        .map((pitch, index) => `<span class="pitch-chip ${pitch.type}">${index + 1}. ${escapeHtml(pitch.label)}</span>`)
        .join("")
    : `<span class="player-meta">No pitches in this plate appearance.</span>`;
  els.abCard.classList.toggle("is-opponent", isOpponentHalf);
  els.scorerStack.classList.toggle("is-defense", isOpponentHalf);
  const isResolvingBattedBall = awaitingSprayLocation || awaitingRunnerDecision;
  els.abCard.classList.toggle("is-placing", !isOpponentHalf && isResolvingBattedBall);
  els.abCard.classList.toggle("is-runner-decision", !isOpponentHalf && awaitingRunnerDecision);
  els.scorerStack.classList.toggle("is-placing", !isOpponentHalf && isResolvingBattedBall);
  els.scorerStack.classList.toggle("is-runner-decision", !isOpponentHalf && awaitingRunnerDecision);
  els.abCard.classList.toggle("is-outcome", !isOpponentHalf && Boolean(game.atBat.pendingInPlay));
  els.bipPanel.classList.toggle("is-visible", Boolean(game.atBat.pendingInPlay));
  els.scoreForm.classList.toggle("is-defense", isOpponentHalf);
  els.sprayChart.closest(".spray-panel").classList.toggle("is-defense", isOpponentHalf);
  if (awaitingRunnerDecision) {
    els.sprayHint.textContent = "Review runner outs, then tap Resolve Play.";
  } else if (awaitingSprayLocation && !pendingSpray) {
    els.sprayHint.textContent = "Tap the field where the ball landed or was fielded.";
  } else if (!pendingSpray && !game.atBat.pendingInPlay) {
    els.sprayHint.textContent = "Tap the field after a ball is put in play.";
  }
  renderBatterIntro(game);
  renderLineupPreview(game);
}

function renderPitcherSelect(game = activeGame()) {
  if (!els.pitcherSelect) return;
  const current = currentPitcherId(game);
  els.pitcherSelect.innerHTML = state.roster
    .map((player) => `<option value="${player.id}">#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
    .join("");
  els.pitcherSelect.value = current;
}

function batterReachedByError(event) {
  const rule = eventRules[event?.result] || {};
  if (event?.result === "ROE") return true;
  if (!event?.errorOnPlay) return false;
  if (rule.hit || rule.bb || rule.hbp) return false;
  return (event.runnerAdvancements || []).some((advancement) =>
    advancement?.from === "batter"
      && !advancement.out
      && !advancement.remove
      && ["first", "second", "third", "home"].includes(advancement.to)
  );
}

function lionsEarnedRunsByEvent(game) {
  const earnedRuns = new Map();
  const runnerStates = new Map();
  lionsDefensiveEvents(game).forEach((event, index) => {
    let eventEarnedRuns = 0;
    const batterId = event?.playerId || `opp-batter-${index}`;
    const batterReachedViaError = batterReachedByError(event);
    (event.runnerAdvancements || []).forEach((advancement) => {
      const isBatter = advancement?.from === "batter";
      const runnerId = advancement?.runnerId || (isBatter ? batterId : "");
      if (!runnerId) return;
      const state = isBatter
        ? { reachedByError: batterReachedViaError }
        : runnerStates.get(runnerId) || { reachedByError: false };
      if (advancement.remove || advancement.out) {
        runnerStates.delete(runnerId);
        return;
      }
      if (advancement.to === "home") {
        if (!state.reachedByError) eventEarnedRuns += 1;
        runnerStates.delete(runnerId);
        return;
      }
      if (["first", "second", "third"].includes(advancement.to)) {
        runnerStates.set(runnerId, state);
      }
    });
    earnedRuns.set(event.id, eventEarnedRuns);
  });
  return earnedRuns;
}

function pitcherStats(playerId, gameId = null, season = null) {
  const stats = {
    wins: 0,
    losses: 0,
    noDecision: 0,
    decisions: 0,
    pitches: 0,
    balls: 0,
    strikes: 0,
    batters: 0,
    outs: 0,
    h: 0,
    hr: 0,
    k: 0,
    bb: 0,
    hbp: 0,
    runs: 0,
    earnedRuns: 0
  };
  const games = statsGamesForSeason(season).filter((game) => !gameId || game.id === gameId);
  const earnedRunMaps = new Map(games.map((game) => [game.id, lionsEarnedRunsByEvent(game)]));
  games
    .filter(gameIsFinal)
    .forEach((game) => {
      const manualDecision = normalizePitchingStatEdit(pitchingStatEditMap(game)[playerId], playerId, game).stats.decision;
      if (manualDecision === "win") {
        stats.wins += 1;
        return;
      }
      if (manualDecision === "loss") {
        stats.losses += 1;
        return;
      }
      if (manualDecision === "noDecision") {
        stats.noDecision += 1;
        return;
      }
      if (hasPitchingStatEdit(game, playerId)) return;
      const decision = lionsPitchingDecision(game);
      if (decision.winPitcherId === playerId) stats.wins += 1;
      if (decision.lossPitcherId === playerId) stats.losses += 1;
      if (decision.noDecisionPitcherIds.includes(playerId)) stats.noDecision += 1;
    });
  games
    .flatMap((game) => pitchingEventsForStatsGame(game).map((event) => ({ event, game })))
    .filter(({ event }) => event.scope === "defense" && (
      event.pitcherId === playerId ||
      (event.pitches || []).some((pitch) => pitch.pitcherId === playerId)
    ))
    .forEach(({ event, game }) => {
      const rule = eventRules[event.result] || {};
      const isPitcherOfRecord = event.pitcherId === playerId;
      if (isPitcherOfRecord) {
        stats.batters += rule.pa ? 1 : 0;
        stats.outs += Math.max(0, (event.outsAfter ?? event.outsBefore ?? 0) - (event.outsBefore ?? 0)) || (rule.out ? 1 : 0);
        stats.h += rule.hit ? 1 : 0;
        stats.hr += event.result === "HR" ? 1 : 0;
        stats.k += event.result === "K" ? 1 : 0;
        stats.bb += event.result === "BB" ? 1 : 0;
        stats.hbp += event.result === "HBP" ? 1 : 0;
        stats.runs += event.runs || 0;
        stats.earnedRuns += pitchingEventEarnedRuns(event, earnedRunMaps.get(game.id));
      }
      (event.pitches || []).forEach((pitch) => {
        if (pitch.pitcherId) {
          if (pitch.pitcherId !== playerId) return;
        } else if (!isPitcherOfRecord) {
          return;
        }
        addPitchToPitcherStats(stats, pitch);
      });
    });
  stats.decisions = stats.wins + stats.losses;
  stats.ip = stats.outs / 3;
  stats.strikeRate = divide(stats.strikes, stats.pitches);
  stats.kRate = divide(stats.k, stats.batters);
  stats.bbRate = divide(stats.bb, stats.batters);
  stats.kbb = stats.bb ? stats.k / stats.bb : stats.k;
  stats.k9 = divide(stats.k * 9, stats.ip);
  stats.era = stats.ip ? (stats.earnedRuns * ERA_GAME_INNINGS) / stats.ip : Number.NaN;
  stats.r9 = divide(stats.runs * 9, stats.ip);
  stats.whip = divide(stats.bb + stats.h, stats.ip);
  stats.pitchesPerInning = divide(stats.pitches, stats.ip);
  return stats;
}

function hasPitchingStats(stats) {
  return Boolean(stats && (stats.outs > 0 || stats.pitches > 0 || stats.batters > 0 || stats.wins > 0 || stats.losses > 0 || stats.noDecision > 0));
}

function plateAppearanceOutsRecorded(event) {
  const delta = Math.max(0, Number(event?.outsAfter ?? 0) - Number(event?.outsBefore ?? 0));
  if (delta) return delta;
  const rule = eventRules[event?.result] || {};
  return rule.out ? 1 : 0;
}

function lionsDefensiveEvents(game) {
  return (game?.events || []).filter((event) => event.scope === "defense" && event.pitcherId);
}

function startingPitcherIdForGame(game) {
  const firstDefenseEvent = lionsDefensiveEvents(game)[0];
  if (firstDefenseEvent?.pitcherId) return firstDefenseEvent.pitcherId;
  return game?.lineupEntries?.find((entry) => entry.role === "P")?.playerId || game?.pitcherId || "";
}

function buildLionsPitcherAppearances(game) {
  const appearances = [];
  let lastPitcherId = "";
  lionsDefensiveEvents(game).forEach((event, index) => {
    const pitcherId = event.pitcherId;
    const rule = eventRules[event.result] || {};
    if (!pitcherId) return;
    if (pitcherId !== lastPitcherId) {
      appearances.push({
        pitcherId,
        appearanceIndex: appearances.length,
        startEventIndex: index,
        outs: 0,
        runs: 0,
        pitches: 0,
        batters: 0
      });
      lastPitcherId = pitcherId;
    }
    const appearance = appearances[appearances.length - 1];
    appearance.outs += plateAppearanceOutsRecorded(event);
    appearance.runs += Number(event.runs || 0);
    appearance.pitches += Array.isArray(event.pitches) ? event.pitches.length : 0;
    appearance.batters += rule.pa ? 1 : 0;
  });
  return appearances;
}

function offensePitcherOfRecordAtEvent(game, eventIndex) {
  const events = game?.events || [];
  const starterId = startingPitcherIdForGame(game);
  let pitcherId = starterId;
  for (let index = 0; index < eventIndex; index += 1) {
    const event = events[index];
    if (event?.scope === "defense" && event.pitcherId) pitcherId = event.pitcherId;
  }
  return pitcherId;
}

function scoreAfterEvent(event) {
  const before = event?.snapshotBefore?.score || { lions: 0, opponent: 0 };
  const after = {
    lions: Number(before.lions || 0),
    opponent: Number(before.opponent || 0)
  };
  if ((event?.scope || "") === "offense") after.lions += Number(event?.runs || 0);
  if ((event?.scope || "") === "defense") after.opponent += Number(event?.runs || 0);
  return after;
}

function teamLeadsScore(score, team = "lions") {
  return team === "lions"
    ? Number(score?.lions || 0) > Number(score?.opponent || 0)
    : Number(score?.opponent || 0) > Number(score?.lions || 0);
}

function leadHeldAfterEventIndex(game, eventIndex, team = "lions") {
  const events = game?.events || [];
  const baseEvent = events[eventIndex];
  if (!baseEvent) return false;
  const after = scoreAfterEvent(baseEvent);
  if (!teamLeadsScore(after, team)) return false;
  return events.slice(eventIndex + 1).every((laterEvent) => teamLeadsScore(scoreAfterEvent(laterEvent), team));
}

function decisiveLeadEventIndex(game, winningTeam = "lions") {
  const events = game?.events || [];
  const finalLions = Number(game?.score?.lions || 0);
  const finalOpponent = Number(game?.score?.opponent || 0);
  return events.findIndex((event, index) => {
    const after = scoreAfterEvent(event);
    const teamAhead = teamLeadsScore(after, winningTeam);
    if (!teamAhead) return false;
    return leadHeldAfterEventIndex(game, index, winningTeam)
      && (winningTeam === "lions" ? finalLions > finalOpponent : finalOpponent > finalLions);
  });
}

function starterWinPitcherIdForLions(game, appearances = buildLionsPitcherAppearances(game)) {
  const starter = appearances[0];
  if (!starter?.pitcherId || starter.outs < 12) return "";
  const events = lionsDefensiveEvents(game);
  const nextAppearance = appearances[1] || null;
  const starterLastEventIndex = nextAppearance
    ? Math.max(nextAppearance.startEventIndex - 1, 0)
    : Math.max(events.length - 1, -1);
  if (starterLastEventIndex < 0) return "";
  return leadHeldAfterEventIndex(game, starterLastEventIndex, "lions") ? starter.pitcherId : "";
}

function isBriefIneffectiveReliefAppearance(appearance) {
  return Boolean(appearance && appearance.outs < 3 && appearance.runs >= 2);
}

function chooseMostEffectiveReliever(appearances = []) {
  if (!appearances.length) return null;
  return appearances
    .slice()
    .sort((left, right) => {
      if (left.runs !== right.runs) return left.runs - right.runs;
      if (left.outs !== right.outs) return right.outs - left.outs;
      if (left.pitches !== right.pitches) return left.pitches - right.pitches;
      return left.appearanceIndex - right.appearanceIndex;
    })[0];
}

function winningPitcherIdForLions(game) {
  if (!gameIsFinal(game) || Number(game?.score?.lions || 0) <= Number(game?.score?.opponent || 0)) return "";
  const appearances = buildLionsPitcherAppearances(game);
  if (!appearances.length) return "";
  const starterWinId = starterWinPitcherIdForLions(game, appearances);
  if (starterWinId) return starterWinId;
  const decisiveIndex = decisiveLeadEventIndex(game, "lions");
  if (decisiveIndex < 0) return "";
  const pitcherOfRecordId = offensePitcherOfRecordAtEvent(game, decisiveIndex);
  if (!pitcherOfRecordId) return "";
  const starter = appearances[0];
  const pitcherOfRecordAppearance = appearances.find((appearance) => appearance.pitcherId === pitcherOfRecordId) || null;
  const starterEligible = starter?.pitcherId === pitcherOfRecordId && starter.outs >= 12;
  if (starterEligible) return pitcherOfRecordId;
  if (pitcherOfRecordAppearance && pitcherOfRecordAppearance.pitcherId !== starter?.pitcherId) {
    if (!isBriefIneffectiveReliefAppearance(pitcherOfRecordAppearance)) return pitcherOfRecordId;
    const succeeding = appearances.filter((appearance) => appearance.appearanceIndex > pitcherOfRecordAppearance.appearanceIndex && appearance.outs > 0);
    return chooseMostEffectiveReliever(succeeding)?.pitcherId || pitcherOfRecordId;
  }
  const relievers = appearances.filter((appearance) => appearance.pitcherId !== starter?.pitcherId && appearance.outs > 0);
  return chooseMostEffectiveReliever(relievers)?.pitcherId || "";
}

function losingPitcherIdForLions(game) {
  if (!gameIsFinal(game) || Number(game?.score?.lions || 0) >= Number(game?.score?.opponent || 0)) return "";
  const decisiveIndex = decisiveLeadEventIndex(game, "opponent");
  if (decisiveIndex < 0) return "";
  const decisiveEvent = game.events?.[decisiveIndex];
  return decisiveEvent?.pitcherId || "";
}

function lionsPitchingDecision(game) {
  const appearances = buildLionsPitcherAppearances(game);
  const pitcherIds = [...new Set(appearances.map((appearance) => appearance.pitcherId).filter(Boolean))];
  const starterId = appearances[0]?.pitcherId || "";
  if (!gameIsFinal(game) || !pitcherIds.length) {
    return { winPitcherId: "", lossPitcherId: "", noDecisionPitcherIds: [] };
  }
  if (gameIsTied(game)) {
    return { winPitcherId: "", lossPitcherId: "", noDecisionPitcherIds: starterId ? [starterId] : [] };
  }
  const winPitcherId = winningPitcherIdForLions(game);
  const lossPitcherId = losingPitcherIdForLions(game);
  if (Number(game.score?.lions || 0) > Number(game.score?.opponent || 0)) {
    return {
      winPitcherId,
      lossPitcherId: "",
      noDecisionPitcherIds: starterId && starterId !== winPitcherId ? [starterId] : []
    };
  }
  return {
    winPitcherId: "",
    lossPitcherId,
    noDecisionPitcherIds: starterId && starterId !== lossPitcherId ? [starterId] : []
  };
}

function addPitchToPitcherStats(stats, pitch) {
  stats.pitches += 1;
  if (pitch.type === "ball") stats.balls += 1;
  if (["strike", "called_strike", "swinging_strike", "foul", "in_play"].includes(pitch.type)) stats.strikes += 1;
}

function pitcherStatsWithCurrentAtBat(game = activeGame()) {
  const pitcherId = currentPitcherId(game);
  const stats = pitcherStats(pitcherId, game.id);
  if (isOpponentAtBat(game) && Array.isArray(game.atBat?.pitches) && game.atBat.pitches.length) {
    game.atBat.pitches
      .filter((pitch) => !pitch.pitcherId || pitch.pitcherId === pitcherId)
      .forEach((pitch) => addPitchToPitcherStats(stats, pitch));
    stats.strikeRate = divide(stats.strikes, stats.pitches);
  }
  return stats;
}

function renderPitcherStatStrip(game = activeGame()) {
  if (!els.pitcherStatStrip) return;
  const stats = pitcherStatsWithCurrentAtBat(game);
  els.pitcherStatStrip.innerHTML = [
    statCell("Pitches", stats.pitches),
    statCell("Balls", stats.balls),
    statCell("Strikes", stats.strikes),
    statCell("Strike %", `${Math.round(stats.strikeRate * 100)}%`)
  ].join("");
}

function renderCurrentBatterSummary(game, player) {
  if (!player) {
    els.batterSummary.innerHTML = `<div class="summary-chip"><strong>No batter</strong><span>Set lineup</span></div>`;
    return;
  }
  const events = game.events.filter((event) => event.scope === "offense" && event.playerId === player.id && eventRules[event.result]?.pa);
  els.batterSummary.innerHTML = batterSummaryMarkup(events, "First AB today");
}

function renderOpponentBatterSummary(game, batter) {
  const events = game.events.filter((event) => event.scope === "defense" && event.opponentBatter === batter && eventRules[event.result]?.pa);
  els.opponentBatterSummary.innerHTML = batterSummaryMarkup(events, "First AB for this hitter");
}

function batterSummaryMarkup(events, emptyLabel) {
  if (!events.length) {
    return `<div class="summary-chip"><strong>0 AB</strong><span>${escapeHtml(emptyLabel)}</span></div>`;
  }
  const hits = events.filter((event) => eventRules[event.result]?.hit).length;
  const reach = events.filter((event) => eventRules[event.result]?.reach).length;
  const last = [...events].slice(-3).map((event) => event.result).join(", ");
  return [
    `<div class="summary-chip"><strong>${events.length}</strong><span>PA today</span></div>`,
    `<div class="summary-chip"><strong>${hits}</strong><span>Hits</span></div>`,
    `<div class="summary-chip"><strong>${reach}</strong><span>Reached</span></div>`,
    `<div class="summary-chip"><strong>${escapeHtml(last)}</strong><span>Previous ABs</span></div>`
  ].join("");
}

function setSprayFromPointer(event) {
  const game = activeGame();
  if (isOpponentAtBat(game)) return;
  if (!awaitingSprayLocation && !game.atBat?.pendingInPlay) return;
  if (event.target.closest?.("button, input, select, textarea, [contenteditable='true']")) return;
  const rect = els.sprayChart.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  event.preventDefault();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  applyEvent(game, { type: "spray", x, y });
}

function setPendingSprayState(x, y) {
  pendingSpray = {
    x: Math.max(4, Math.min(96, Math.round(x))),
    y: Math.max(4, Math.min(96, Math.round(y))),
    zone: sprayZone(x, y)
  };
  return pendingSpray;
}

function setPendingSpray(x, y) {
  return applyEvent(activeGame(), { type: "spray", x, y });
}

function sprayZone(x, y) {
  if (y > 69) return x < 42 ? "Left infield" : x > 58 ? "Right infield" : "Middle infield";
  if (x < 35) return "Left field";
  if (x > 65) return "Right field";
  if (x < 46) return "Left-center";
  if (x > 54) return "Right-center";
  return "Center field";
}

function renderSprayChart() {
  const events = sprayEvents();
  const dots = events.map(renderSprayDot).join("");
  const pending = pendingSpray
    ? `<span class="spray-dot pending" style="left:${pendingSpray.x}%;top:${pendingSpray.y}%;" title="Pending ${escapeHtml(pendingSpray.zone)}">${escapeHtml(els.resultSelect?.value || "+")}</span>`
    : "";
  els.sprayMarkers.innerHTML = `${dots}${pending}`;
}

function sprayEvents() {
  const game = activeGame();
  if (!game) return [];
  const filter = els.sprayFilter.value;
  const currentScope = isLionsAtBat(game) ? "offense" : "defense";
  const currentHitterId = currentBatterId(game);
  const currentOpponentHitter = currentOpponentBatter(game);
  const sourceEvents = currentScope === "offense"
    ? sprayEventsForGame(game)
    : (Array.isArray(game.events) ? game.events : []).map((event) => ({ event, game }));
  return sourceEvents
    .filter(({ event, game: item }) => {
      if (!event.spray) return false;
      if ((event.scope || "offense") !== currentScope) return false;
      const rule = eventRules[event.result] || {};
      if (filter === "hitter" && currentScope === "offense" && event.playerId !== currentHitterId) return false;
      if (filter === "hitter" && currentScope === "defense" && event.opponentBatter !== currentOpponentHitter) return false;
      if (filter === "hits" && !rule.hit) return false;
      if (filter === "outs" && !rule.out) return false;
      return true;
    });
}

function renderSprayDot({ event, game }, options = {}) {
  const rule = eventRules[event.result] || {};
  const player = state.roster.find((item) => item.id === event.playerId);
  const kind = rule.hit ? "hit" : "out";
  const name = event.scope === "defense" ? event.opponentBatter || "Opponent batter" : player?.name || "Unknown";
  const title = `${name} ${rule.label || event.result || "Batted ball"} vs ${game.opponent} (${event.spray.zone})`;
  const label = options.outlineOnly
    ? ""
    : options.resultLabel
    ? (event.result || (rule.hit ? "H" : "O"))
    : options.compact
      ? (rule.hit ? "H" : "O")
      : event.result || (rule.hit ? "H" : "O");
  return `<span class="spray-dot ${kind}" style="left:${event.spray.x}%;top:${event.spray.y}%;" title="${escapeHtml(title)}">${label}</span>`;
}

function renderBatterSelect() {
  const game = activeGame();
  if (isOpponentAtBat(game)) {
    els.batterSelect.innerHTML = `<option>${escapeHtml(currentOpponentBatter(game))}</option>`;
    els.batterSelect.disabled = true;
    return;
  }
  const entries = gameLineupEntries(game);
  const options = entries.map((entry, index) => {
    const player = state.roster.find((item) => item.id === entry.playerId);
    if (!player) return "";
    const label = `${index + 1}. #${player.number} ${player.name}`;
    return `<option value="${player.id}">${escapeHtml(label)}</option>`;
  });
  els.batterSelect.innerHTML = options.join("");
  const current = currentBatterId(game);
  if (current) els.batterSelect.value = current;
  els.batterSelect.disabled = true;
  els.batterSelect.title = "Batting order is locked to the current lineup spot.";
}

function renderLiveLineup() {
  const game = activeGame();
  if (isOpponentAtBat(game)) {
    const hitters = opponentLineupEntriesForGame(game);
    els.lineupCount.textContent = `${hitters.length} hitters`;
    els.liveLineup.innerHTML = hitters
      .map((entry, index) => {
        const current = index === (game.opponentBatterIndex || 0) ? " is-current" : "";
        return `<li class="opponent-lineup-row${current}">
          <div class="lineup-order">${index + 1}</div>
          <label class="opponent-lineup-number">
            <span>No.</span>
            <input value="${escapeHtml(entry.number || "")}" placeholder="#" inputmode="numeric" spellcheck="false" data-opponent-lineup-index="${index}" data-opponent-lineup-field="number">
          </label>
          <label>
            <span>Home hitter</span>
            <input value="${escapeHtml(entry.name)}" spellcheck="false" data-opponent-lineup-index="${index}" data-opponent-lineup-field="name">
          </label>
          <div class="player-meta">${opponentSide(game) === "home" ? "Home" : "Away"} ${escapeHtml(game.opponent)} batting | Type to edit</div>
        </li>`;
      })
      .join("");
    return;
  }
  const entries = gameLineupEntries(game);
  els.lineupCount.textContent = `${entries.length} active`;
  els.liveLineup.innerHTML = entries
    .map((entry, index) => {
      const player = state.roster.find((item) => item.id === entry.playerId);
      if (!player) return "";
      const stats = statsForPlayer(player.id);
      const current = index === game.batterIndex && isLionsAtBat(game) ? " is-current" : "";
      return `<li class="${current}">
        <strong>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</strong>
        <div class="player-meta">${lionsSide(game) === "home" ? "Home" : "Away"} Lions | Game position ${escapeHtml(entry.role)} | OPS ${formatRate(stats.ops)} | Contact ${Math.round(contactQuality(stats) * 100)}</div>
      </li>`;
    })
    .join("");
}

function closeCustomSubSelects(exceptId = "") {
  document.querySelectorAll(".sub-custom-select.is-open").forEach((shell) => {
    if (exceptId && shell.dataset.selectId === exceptId) return;
    shell.classList.remove("is-open");
    const trigger = shell.querySelector(".sub-custom-select-trigger");
    trigger?.setAttribute("aria-expanded", "false");
  });
  activeCustomSubSelect = exceptId || null;
}

function renderCustomSubSelect(select) {
  if (!select) return;
  select.hidden = true;
  select.setAttribute("aria-hidden", "true");
  select.style.display = "none";
  let shell = select.parentElement?.querySelector(`.sub-custom-select[data-select-id="${select.id}"]`);
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "sub-custom-select";
    shell.dataset.selectId = select.id;
    shell.innerHTML = `
      <button type="button" class="sub-custom-select-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="sub-custom-select-menu" role="listbox"></div>
    `;
    select.insertAdjacentElement("afterend", shell);
    const trigger = shell.querySelector(".sub-custom-select-trigger");
    const menu = shell.querySelector(".sub-custom-select-menu");
    trigger?.addEventListener("click", () => {
      const willOpen = !shell.classList.contains("is-open");
      closeCustomSubSelects(willOpen ? select.id : "");
      shell.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen) activeCustomSubSelect = select.id;
    });
    menu?.addEventListener("click", (event) => {
      const optionButton = event.target.closest("[data-custom-select-value]");
      if (!optionButton || optionButton.disabled) return;
      select.value = optionButton.dataset.customSelectValue || "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      renderCustomSubSelect(select);
      closeCustomSubSelects();
      trigger?.focus();
    });
  }
  shell.classList.toggle("is-disabled", Boolean(select.disabled));
  const trigger = shell.querySelector(".sub-custom-select-trigger");
  const menu = shell.querySelector(".sub-custom-select-menu");
  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  const hasOptions = select.options.length > 0;
  if (trigger) {
    trigger.disabled = Boolean(select.disabled || !hasOptions);
    trigger.innerHTML = `
      <span>${escapeHtml(selectedOption?.textContent?.trim() || (hasOptions ? "Select" : "No options"))}</span>
      <span class="sub-custom-select-chevron" aria-hidden="true">⌄</span>
    `;
  }
  if (menu) {
    menu.innerHTML = [...select.options]
      .map((option) => {
        const selected = option.selected;
        const disabled = option.disabled;
        return `<button type="button" class="sub-custom-select-option${selected ? " is-selected" : ""}" role="option" aria-selected="${selected ? "true" : "false"}" data-custom-select-value="${escapeHtml(option.value)}" ${disabled ? "disabled" : ""}>${escapeHtml(option.textContent.trim())}</button>`;
      })
      .join("");
  }
}

function syncCustomSubControls() {
  [
    els.subSpotSelect,
    els.subPlayerSelect,
    els.subTypeSelect,
    els.subPositionSelect,
    els.opponentMoveTypeSelect,
    els.opponentMoveSpotSelect
  ].forEach((select) => renderCustomSubSelect(select));
}

function renderSubControls() {
  const game = activeGame();
  els.subPanel.classList.toggle("is-hidden", isOpponentAtBat(game));
  if (els.opponentSubPanel) els.opponentSubPanel.classList.toggle("is-hidden", gameIsFinal(game));
  const opponentEntries = opponentLineupEntriesForGame(game);
  const fallbackSelectedSpot = Math.min(game.opponentBatterIndex || 0, Math.max(opponentEntries.length - 1, 0));
  const opponentSelectedSpot = Number(els.opponentMoveSpotSelect?.value || fallbackSelectedSpot);
  if (els.opponentMoveSpotSelect) {
    els.opponentMoveSpotSelect.innerHTML = opponentEntries
      .map((entry, index) => {
        const isCurrent = index === (game.opponentBatterIndex || 0) ? " (current)" : "";
        return `<option value="${index}" ${index === opponentSelectedSpot ? "selected" : ""}>${index + 1}. ${escapeHtml(opponentBatterLabel(entry, index))}${isCurrent}</option>`;
      })
      .join("");
  }
  const opponentMoveType = els.opponentMoveTypeSelect?.value || "sub";
  if (els.opponentMoveSpotSelect) els.opponentMoveSpotSelect.disabled = opponentMoveType === "append";
  if (els.opponentMoveHint) {
    els.opponentMoveHint.textContent = opponentMoveType === "append"
      ? `This hitter will be added as spot ${opponentEntries.length + 1} and join the order the next time it turns over.`
      : "Choose the lineup spot to replace, then enter the new hitter's name and number.";
  }
  if (isOpponentAtBat(game)) {
    els.subSpotSelect.innerHTML = "";
    els.subPlayerSelect.innerHTML = "";
    if (els.subPositionSelect) els.subPositionSelect.innerHTML = "";
    syncCustomSubControls();
    return;
  }
  const entries = gameLineupEntries(game);
  const moveType = els.subTypeSelect?.value || "sub";
  const appendMode = moveType === "append";
  const selectedSpot = els.subSpotSelect.value || entries[0]?.id || "";
  els.subSpotSelect.innerHTML = entries
    .map((entry, index) => {
      const player = state.roster.find((item) => item.id === entry.playerId);
      return `<option value="${entry.id}" ${entry.id === selectedSpot ? "selected" : ""}>${index + 1}. ${escapeHtml(player?.name || "Empty")} (${escapeHtml(entry.role)})</option>`;
    })
    .join("");
  els.subSpotSelect.disabled = appendMode;
  const activeIds = new Set(entries.map((entry) => entry.playerId));
  const eligiblePlayers = state.roster.filter((player) => !activeIds.has(player.id));
  const selectedPlayerId = els.subPlayerSelect.value;
  els.subPlayerSelect.innerHTML = state.roster
    .map((player) => `<option value="${player.id}" ${activeIds.has(player.id) ? "disabled" : ""}>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
    .join("");
  if (eligiblePlayers.some((player) => player.id === selectedPlayerId)) {
    els.subPlayerSelect.value = selectedPlayerId;
  } else if (eligiblePlayers[0]) {
    els.subPlayerSelect.value = eligiblePlayers[0].id;
  }
  els.subPlayerSelect.disabled = !eligiblePlayers.length;
  const selectedPlayer = state.roster.find((player) => player.id === els.subPlayerSelect.value);
  if (els.subPositionSelect) {
    const selectedEntry = entries.find((entry) => entry.id === (els.subSpotSelect.value || selectedSpot)) || entries[0];
    const preferredPosition = appendMode
      ? playerPrimaryPosition(selectedPlayer) || defaultRoleForSpot(entries.length)
      : selectedEntry?.role;
    els.subPositionSelect.innerHTML = lineupPositions
      .map((position) => `<option value="${position}" ${position === preferredPosition ? "selected" : ""}>${position}</option>`)
      .join("");
  }
  if (els.subMoveHint) {
    els.subMoveHint.textContent = appendMode
      ? `This hitter will be added as spot ${entries.length + 1} and join the order the next time it turns over.`
      : moveType === "ph"
        ? "Choose the lineup spot to replace with a pinch hitter."
        : "Choose the lineup spot to replace with a defensive substitute.";
  }
  if (els.applySubBtn) {
    els.applySubBtn.textContent = appendMode ? "Add Lions Hitter" : "Apply";
    els.applySubBtn.disabled = !eligiblePlayers.length || (!appendMode && !entries.length);
  }
  syncCustomSubControls();
}

function applySubstitution() {
  if (!requireAdminAccess("Admin sign-in required to change the live lineup.")) return;
  const game = activeGame();
  const entryId = els.subSpotSelect.value;
  const playerId = els.subPlayerSelect.value;
  if (!playerId) return;
  const type = els.subTypeSelect.value;
  if (type === "append") {
    const record = appendLionsLineupHitter(game, {
      incomingPlayerId: playerId,
      role: els.subPositionSelect?.value || "",
      notes: "Hitter added to the end of the Lions lineup"
    });
    if (!record) return;
    saveState();
    render();
    return;
  }
  if (!entryId) return;
  addSubstitution(game, {
    lineupEntryId: entryId,
    incomingPlayerId: playerId,
    type,
    role: els.subPositionSelect?.value || "",
    notes: type === "ph" ? "Pinch hitter entered" : "Substitution entered"
  });
  saveState();
  render();
}

function renderPlayFeed() {
  if (!els.playFeed || !els.playCount) return;
  const game = activeGame();
  const recent = [...game.events].reverse().slice(0, 12);
  els.playCount.textContent = `${game.events.length} plays`;
  els.playFeed.innerHTML = recent.length
    ? recent
        .map((event) => {
          const player = state.roster.find((item) => item.id === event.playerId);
          const name = event.scope === "defense"
            ? event.opponentBatter || "Opponent batter"
            : event.scope === "lineup"
              ? event.playerName || player?.name || "Lineup move"
              : player ? player.name : "Opponent";
          const scope = event.scope === "defense"
            ? "Opponent"
            : event.scope === "lineup"
              ? event.teamLabel || "Lions"
              : "Lions";
          const rule = eventRules[event.result] || { label: event.result };
          const battedBallDetail = [
            event.launch && event.launch !== "none" ? launchLabels[event.launch] || event.launch : "",
            event.spray ? event.spray.zone : ""
          ].filter(Boolean).join(" | ");
          return `<article class="play-item">
            <strong>${escapeHtml(scope)} ${inningLabel(event)}: ${escapeHtml(name)} ${escapeHtml(rule.label)}</strong>
            <div class="play-meta">${event.pitches?.length || 0} pitches | Count ${escapeHtml(event.count || "0-0")} | Runs ${event.runs}, RBI ${event.rbi}</div>
            ${battedBallDetail ? `<div class="play-meta">${escapeHtml(battedBallDetail)}</div>` : ""}
            ${event.errorOnPlay ? `<div class="play-meta">Error charged${event.errorFielderPosition ? ` to ${escapeHtml(event.errorFielderPosition)}` : ""}</div>` : ""}
            ${event.runnerAdvancements?.some((advancement) => advancement.out) ? `<div class="play-meta">Runner out on play</div>` : ""}
            ${event.note ? `<div class="play-meta">${escapeHtml(event.note)}</div>` : ""}
          </article>`;
        })
        .join("")
    : `<p class="player-meta">No plays yet. First pitch is waiting.</p>`;
}

function inningLabel(event) {
  return `${event.half === "top" ? "T" : "B"}${event.inning}`;
}

function renderTraditionalScorebook() {
  if (!els.scorebookBody) return;
  const active = activeScoreGame() || state.games[0] || null;
  if (!active) {
    scorebookGameId = "";
    els.scorebookGameSelect.innerHTML = "";
    els.scorebookGameMeta.textContent = "No games saved yet.";
    els.scorebookHead.innerHTML = "";
    els.opponentScorebookHead.innerHTML = "";
    els.scorebookBody.innerHTML = "";
    els.opponentScorebookBody.innerHTML = "";
    return;
  }
  if (!scorebookGameId || !state.games.some((game) => game.id === scorebookGameId)) scorebookGameId = active.id;
  els.scorebookGameSelect.innerHTML = [...state.games]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((game) => `<option value="${game.id}" ${game.id === scorebookGameId ? "selected" : ""}>${escapeHtml(game.date || "No date")} ${escapeHtml(gameMatchupLabel(game))}</option>`)
    .join("");
  const game = state.games.find((item) => item.id === scorebookGameId) || active;
  els.scorebookGameMeta.textContent = `${game.date || "No date"} | ${gameTeamMeta(game)} | ${gameScoreLabel(game)}`;
  const innings = scorebookInnings(game);
  const head = `<tr><th>Lineup</th>${innings.map((inning) => `<th>${inning}</th>`).join("")}<th>R</th><th>H</th><th>RBI</th></tr>`;
  els.scorebookHead.innerHTML = head;
  els.opponentScorebookHead.innerHTML = head.replace("Lineup", "Opponent");

  const offenseEvents = game.events.filter((event) => event.scope === "offense" && isScorebookEvent(event));
  const defenseEvents = game.events.filter((event) => event.scope === "defense" && isScorebookEvent(event));
  els.scorebookBody.innerHTML = renderScorebookRows(
    gameLineupEntries(game).map((entry, index) => {
      const player = state.roster.find((item) => item.id === entry.playerId);
      return {
        id: entry.playerId,
        label: `${index + 1}. #${player?.number ?? ""} ${player?.name || "Open spot"}`,
        role: entry.role,
        events: offenseEvents.filter((event) => event.playerId === entry.playerId)
      };
    }),
    innings
  );
  els.opponentScorebookBody.innerHTML = renderScorebookRows(
    opponentLineupEntriesForGame(game).map((entry, index) => {
      const name = opponentBatterLabel(entry, index);
      const opponentPlayerId = entry.playerId || `opp:${name}`;
      return {
        id: opponentPlayerId,
        label: `${index + 1}. ${name}`,
        role: game.opponent,
        events: defenseEvents.filter((event) => event.playerId === opponentPlayerId || event.opponentBatter === name)
      };
    }),
    innings
  );
}

function isScorebookEvent(event) {
  return Boolean(eventRules[event?.result]?.pa || scorebookBaseRunningResults.has(event?.result));
}

function scorebookInnings(game) {
  const highestEventInning = Math.max(0, ...(game.events || []).map((event) => Number(event.inning || 0)));
  const highest = Math.max(7, Number(game.inning || 1), highestEventInning);
  return Array.from({ length: highest }, (_, index) => index + 1);
}

function renderScorebookRows(rows, innings) {
  if (!rows.length) {
    return `<tr><td colspan="${innings.length + 4}" class="scorebook-empty">No lineup loaded.</td></tr>`;
  }
  return rows.map((row) => {
    const runs = row.events.reduce((sum, event) => sum + (event.runs || 0), 0);
    const hits = row.events.filter((event) => eventRules[event.result]?.hit).length;
    const rbi = row.events.reduce((sum, event) => sum + (event.rbi || 0), 0);
    return `<tr>
      <th>
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row.role || "")}</span>
      </th>
      ${innings.map((inning) => `<td>${renderScorebookCell(row.events.filter((event) => event.inning === inning))}</td>`).join("")}
      <td>${runs}</td>
      <td>${hits}</td>
      <td>${rbi}</td>
    </tr>`;
  }).join("");
}

function renderScorebookCell(events) {
  if (!events.length) return `<span class="scorebook-empty">-</span>`;
  return events.map((event) => {
    const rule = eventRules[event.result] || { label: event.result };
    const pitchCount = event.pitches?.length || 0;
    const notation = scorebookNotation(event);
    const reached = batterReachedBase(event.result);
    const scored = Boolean((event.runs || 0) && ["HR"].includes(event.result));
    const detail = scorebookDetail(event, pitchCount);
    return `<div class="scorebook-cell ${rule.hit ? "is-hit" : rule.out ? "is-out" : "is-reach"}">
      <div class="scorebook-diamond ${scored ? "is-run" : ""}">
        <span class="path hp-1 ${reached >= 1 ? "is-active" : ""}"></span>
        <span class="path one-2 ${reached >= 2 ? "is-active" : ""}"></span>
        <span class="path two-3 ${reached >= 3 ? "is-active" : ""}"></span>
        <span class="path three-h ${reached >= 4 ? "is-active" : ""}"></span>
        <strong>${escapeHtml(notation)}</strong>
        ${rule.out ? `<small>${escapeHtml(outNumber(event))}</small>` : ""}
      </div>
      <span>${escapeHtml(detail || rule.label)}</span>
      ${event.note ? `<em>${escapeHtml(event.note)}</em>` : ""}
    </div>`;
  }).join("");
}

function scorebookNotation(event) {
  const result = event.result;
  const fieldedBy = scorebookPrimaryFielder(event);
  if (result === "SB") return `SB ${scorebookRunnerDestinationLabel(event)}`.trim();
  if (result === "CS") return `CS ${scorebookRunnerDestinationLabel(event)}`.trim();
  if (result === "PO") return `PO ${scorebookRunnerOriginLabel(event)}`.trim();
  if (result === "GO") return scorebookGroundoutNotation(fieldedBy);
  if (result === "FO") return scorebookAirOutNotation("F", fieldedBy, "FO");
  if (result === "LO") return scorebookAirOutNotation("L", fieldedBy, "LO");
  if (result === "K") return "K";
  if (result === "BB") return "BB";
  if (result === "HBP") return "HP";
  if (result === "ROE") return scorebookErrorNotation(event);
  if (result === "FC") return scorebookFieldersChoiceNotation(event, fieldedBy);
  if (result === "DP") return scorebookDoublePlayNotation(event, fieldedBy);
  if (result === "SAC") return scorebookSacrificeNotation(event, fieldedBy);
  return result;
}

function scorebookPrimaryFielder(event) {
  return event.fieldedBy || event.errorFielderPosition || inferFielderFromSpray(event);
}

function scorebookGroundoutNotation(fieldedBy = "") {
  const number = fielderNumber(fieldedBy);
  if (!number) return "GO";
  if (fieldedBy === "1B") return "3U";
  return `${number}-3`;
}

function scorebookAirOutNotation(prefix, fieldedBy = "", fallback = "") {
  const number = fielderNumber(fieldedBy);
  return number ? `${prefix}${number}` : fallback;
}

function scorebookErrorNotation(event) {
  const number = fielderNumber(event.errorFielderPosition || event.fieldedBy || inferFielderFromSpray(event));
  return number ? `E${number}` : "E";
}

function scorebookFieldersChoiceNotation(event, fieldedBy = "") {
  const number = fielderNumber(fieldedBy);
  if (!number) return "FC";
  const outAdvancement = (event.runnerAdvancements || []).find((advancement) => advancement.out);
  const putout = forceOutPutoutNumber(fieldedBy, outAdvancement?.from);
  return putout ? `FC ${number}-${putout}` : `FC${number}`;
}

function scorebookDoublePlayNotation(event, fieldedBy = "") {
  const number = fielderNumber(fieldedBy);
  if (!number) return "DP";
  if (fieldedBy === "1B") return "3-6-3";
  if (fieldedBy === "2B") return "4-6-3";
  if (fieldedBy === "SS") return "6-4-3";
  if (fieldedBy === "3B") return "5-4-3";
  if (fieldedBy === "P") return "1-6-3";
  if (fieldedBy === "C") return "2-6-3";
  return `DP ${number}`;
}

function scorebookSacrificeNotation(event, fieldedBy = "") {
  const number = fielderNumber(fieldedBy);
  if (!number) return "SAC";
  if (["LF", "CF", "RF"].includes(fieldedBy) || event.launch === "fb") return `SF${number}`;
  return `SAC ${scorebookGroundoutNotation(fieldedBy)}`;
}

function forceOutPutoutNumber(fieldedBy = "", fromBase = "") {
  if (fromBase === "third") return 2;
  if (fromBase === "second") return 5;
  if (fromBase === "first") return ["1B", "2B"].includes(fieldedBy) ? 6 : 4;
  return "";
}

function inferFielderFromSpray(event) {
  const spray = event.spray || {};
  const zone = String(spray.zone || "").toLowerCase();
  if (zone.includes("left infield")) return "3B";
  if (zone.includes("middle infield")) return Number(spray.x || 50) < 50 ? "SS" : "2B";
  if (zone.includes("right infield")) return Number(spray.x || 50) > 76 ? "1B" : "2B";
  if (zone.includes("left-center")) return "LF";
  if (zone.includes("right-center")) return "RF";
  if (zone.includes("left field")) return "LF";
  if (zone.includes("center field")) return "CF";
  if (zone.includes("right field")) return "RF";
  return "";
}

function batterReachedBase(result) {
  if (result === "1B" || result === "BB" || result === "HBP" || result === "ROE" || result === "FC") return 1;
  if (result === "2B") return 2;
  if (result === "3B") return 3;
  if (result === "HR") return 4;
  return 0;
}

function scorebookDetail(event, pitchCount) {
  if (scorebookBaseRunningResults.has(event.result)) return scorebookRunnerDetail(event);
  return [
    pitchCount ? `${pitchCount} pitches` : "",
    event.count ? `Count ${event.count}` : "",
    event.rbi ? `${event.rbi} RBI` : "",
    event.runs ? `${event.runs} R` : "",
    event.spray?.zone || "",
    event.runnerAdvancements?.some((advancement) => advancement.out) ? "Runner out" : ""
  ].filter(Boolean).join(" | ");
}

function scorebookRunnerOriginBase(event) {
  const runnerId = event.playerId || "";
  const bases = event.basesBefore || event.snapshotBefore?.bases || emptyBases(false);
  return ["first", "second", "third"].find((base) => bases?.[base] === runnerId) || "";
}

function scorebookRunnerOriginLabel(event) {
  const origin = scorebookRunnerOriginBase(event);
  if (origin) return baseLabel(origin);
  const noteMatch = String(event.note || "").match(/\b(1B|2B|3B|Home)\b/i);
  return noteMatch ? noteMatch[1].replace(/^home$/i, "Home") : "";
}

function scorebookRunnerDestinationLabel(event) {
  const origin = scorebookRunnerOriginBase(event);
  const destination = origin ? nextBaseForRunner(origin) : "";
  if (destination) return baseLabel(destination);
  const noteMatch = String(event.note || "").match(/\b(2B|3B|Home)\b/i);
  return noteMatch ? noteMatch[1].replace(/^home$/i, "Home") : "";
}

function scorebookRunnerDetail(event) {
  if (event.result === "SB") return `Stole ${scorebookRunnerDestinationLabel(event)}`.trim();
  if (event.result === "CS") return `Out trying for ${scorebookRunnerDestinationLabel(event)}`.trim();
  if (event.result === "PO") return `Picked off at ${scorebookRunnerOriginLabel(event)}`.trim();
  if (event.result === "BK") return `Advanced on balk to ${scorebookRunnerDestinationLabel(event)}`.trim();
  return "";
}

function outNumber(event) {
  const after = event.outsAfter ?? event.outsBefore ?? 0;
  if (!after) return "OUT";
  return `${after}${ordinalSuffix(after)} out`;
}

function fielderNumber(position) {
  return { P: 1, C: 2, "1B": 3, "2B": 4, "3B": 5, SS: 6, LF: 7, CF: 8, RF: 9 }[position] || "";
}

function renderRoster() {
  els.rosterGrid.innerHTML = "";
  if (els.rosterListBody) els.rosterListBody.innerHTML = "";
  if (els.rosterSearchInput && els.rosterSearchInput.value !== rosterSearchQuery) {
    els.rosterSearchInput.value = rosterSearchQuery;
  }
  els.rosterFilter.value = rosterFilter;
  els.rosterCardsViewBtn?.classList.toggle("is-active", rosterViewMode === "cards");
  els.rosterListViewBtn?.classList.toggle("is-active", rosterViewMode === "list");
  if (els.rosterGrid) els.rosterGrid.hidden = rosterViewMode !== "cards";
  if (els.rosterListShell) els.rosterListShell.hidden = rosterViewMode !== "list";
  if (!isAdminMode()) setRosterPlayerDetailsOpen(false);
  updatePlayerFormUi();
  const visiblePlayers = state.roster.filter((player) => {
    if (rosterFilter === "all") return true;
    if (rosterFilter === "inactive") return !state.lineup.includes(player.id);
    return state.lineup.includes(player.id);
  }).filter((player) => {
    if (!rosterSearchQuery) return true;
    const haystack = [
      player.name,
      player.number,
      playerPrimaryPosition(player),
      formatPositions(player.positions),
      player.bats,
      player.throws,
      player.height,
      player.weight
    ].join(" ").toLowerCase();
    return haystack.includes(rosterSearchQuery);
    });
  const rankedPlayers = visiblePlayers
    .map((player) => ({ player, stats: statsForPlayer(player.id) }))
    .sort((a, b) => compareRosterRows(a, b, "number"));
  els.rosterFilterSummary.textContent = `${rankedPlayers.length} ${rosterFilter === "all" ? "total" : rosterFilter} player${rankedPlayers.length === 1 ? "" : "s"}`;
  if (els.rosterListMeta) {
    els.rosterListMeta.textContent = `${rankedPlayers.length} player${rankedPlayers.length === 1 ? "" : "s"} ordered by jersey number.`;
  }
    if (!rankedPlayers.length) {
      const empty = `<p class="player-meta">No ${escapeHtml(rosterSearchQuery ? "matching" : rosterFilter)} players to show.</p>`;
      els.rosterGrid.innerHTML = empty;
      if (els.rosterListBody) {
        els.rosterListBody.innerHTML = `<tr><td colspan="3" class="player-meta">No players to show.</td></tr>`;
      }
      return;
    }
    rankedPlayers.forEach(({ player, stats }) => {
      const node = els.playerTemplate.content.cloneNode(true);
      const card = node.querySelector(".player-card");
      card.dataset.playerId = player.id;
      node.querySelector(".number-pill").textContent = `#${player.number || "--"}`;
      const positionsSummary = formatPositions(player.positions);
      const primaryPosition = playerPrimaryPosition(player);
      const primaryPositionPill = node.querySelector("[data-player-primary-position]");
      if (primaryPositionPill) {
        primaryPositionPill.textContent = primaryPosition;
        primaryPositionPill.classList.toggle("is-long-position", primaryPosition.length > 3);
      }
      const positionsLabel = node.querySelector("[data-player-positions-summary]");
      if (positionsLabel) positionsLabel.textContent = positionsSummary;
        const silhouette = node.querySelector("[data-player-silhouette-image]");
        if (silhouette) {
          silhouette.src = rosterSilhouetteAsset(player);
          silhouette.alt = `${player.name} player silhouette`;
        }
        const [firstName, lastName] = rosterDisplayNameParts(player.name);
        const nameHeading = node.querySelector("h3");
        if (nameHeading) {
          nameHeading.innerHTML = `${`<span>${escapeHtml(firstName)}</span>`}${lastName ? `<span>${escapeHtml(lastName)}</span>` : ""}`;
        }
        const metaCopy = node.querySelector("[data-player-card-meta]");
        if (metaCopy) metaCopy.textContent = `${primaryPosition} | Bats ${player.bats || "R"}`;
        node.querySelectorAll("[data-player-stats]").forEach((button) => {
          button?.addEventListener("click", () => openPlayerStats(player.id));
        });
      const adminActions = node.querySelector("[data-roster-admin-actions]");
      if (adminActions) adminActions.hidden = !isAdminMode();
      node.querySelectorAll("[data-player-edit]").forEach((button) => {
        button?.addEventListener("click", () => beginPlayerEdit(player.id));
      });
      node.querySelectorAll("[data-player-remove]").forEach((button) => {
        button?.addEventListener("click", () => {
          removeRosterPlayer(player.id).catch((error) => console.warn("Roster removal failed.", error));
        });
      });
        node.querySelector("[data-player-bats-throws]").textContent = formatRosterBatsThrows(player);
        node.querySelector("[data-player-height-weight]").textContent = formatRosterHeightWeight(player);
      els.rosterGrid.appendChild(node);
        if (els.rosterListBody) {
          els.rosterListBody.insertAdjacentHTML("beforeend", rosterListRow(player));
        }
    });
  }

function compareRosterRows(a, b, key = "number") {
  if (key === "name") return a.player.name.localeCompare(b.player.name);
  if (key === "number") {
    const numberDiff = Number(a.player.number || 0) - Number(b.player.number || 0);
    if (numberDiff) return numberDiff;
    return a.player.name.localeCompare(b.player.name);
  }
  if (key === "grade") return b.grade.score - a.grade.score;
  const diff = {
    avg: b.stats.avg - a.stats.avg,
    obp: b.stats.obp - a.stats.obp,
    ops: b.stats.ops - a.stats.ops
  }[key] ?? (b.stats.ops - a.stats.ops);
  if (Math.abs(diff) > 0.0001) return diff;
  return a.player.name.localeCompare(b.player.name);
}

function rosterGradeData(player) {
  const score = Math.round(playerValue(player));
  if (score >= 150) return { score, label: "Elite", tier: "elite" };
  if (score >= 115) return { score, label: "Starter", tier: "starter" };
  return { score, label: "Developing", tier: "developing" };
}

function rosterListRow(player) {
    return `<tr>
        <td>${escapeHtml(player.number || "--")}</td>
        <td><strong>${escapeHtml(player.name)}</strong></td>
        <td>${escapeHtml(formatPositions(player.positions))}</td>
      </tr>`;
  }

function setGradeFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value) || min;
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  input.style.setProperty("--grade-fill", `${pct}%`);
}

async function togglePlayerActive(playerId, isActive) {
  if (!(await ensureFreshSharedBaseline("toggle-player-active"))) {
    window.alert("We couldn't refresh the latest shared roster yet. Try again in a moment.");
    return;
  }
  if (isActive && !state.lineup.includes(playerId)) state.lineup.push(playerId);
  if (!isActive) state.lineup = state.lineup.filter((id) => id !== playerId);
  state.roster = state.roster.map((player) => (player.id === playerId ? { ...player, active: isActive } : player));
  const game = activeScoreGame();
  if (game) game.batterIndex = Math.min(game.batterIndex, Math.max(state.lineup.length - 1, 0));
  markSharedAppStateDirty();
  saveState();
  optimizedIds = buildOptimizedLineup();
  render();
  await syncSharedRosterChangeOrAlert("toggle-player-active");
}

function statCell(label, value) {
  return `<span>${label}<strong>${value}</strong></span>`;
}

function availableArchiveSeasons() {
  const seasons = new Set([String(currentLeagueSeason())]);
  state.games.filter(gameIsFinal).forEach((game) => {
    const season = String(game?.date || "").slice(0, 4);
    if (/^\d{4}$/.test(season)) seasons.add(season);
  });
  return [...seasons].sort((a, b) => Number(b) - Number(a));
}

function normalizeArchiveSeasonFilter(value, options = availableArchiveSeasons()) {
  const requested = String(value || "");
  if (options.includes(requested)) return requested;
  return options[0] || String(currentLeagueSeason());
}

function populateArchiveSeasonSelect() {
  if (!els.archiveSeasonSelect) return;
  const seasons = availableArchiveSeasons();
  archiveSeasonFilter = normalizeArchiveSeasonFilter(archiveSeasonFilter, seasons);
  els.archiveSeasonSelect.innerHTML = seasons
    .map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(`${season} Season`)}</option>`)
    .join("");
  els.archiveSeasonSelect.value = archiveSeasonFilter;
}

function renderArchive() {
  populateArchiveSeasonSelect();
  const games = state.games
    .filter((game) => gameIsFinal(game) && String(game?.date || "").startsWith(`${archiveSeasonFilter}-`))
    .sort(sortGamesNewestFirst);

  els.archiveGrid.innerHTML = games.length
    ? games.map(renderArchiveCard).join("")
    : `<p class="player-meta">No games in Game Archive yet.</p>`;
}

function renderArchiveCard(game) {
  const lionsHome = lionsSide(game) === "home";
  const opponentName = homeOpponentName(game);
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  const outcome = lionsScore > opponentScore ? "W" : lionsScore < opponentScore ? "L" : "T";
  const outcomeClass = outcome === "W" ? "is-win" : outcome === "L" ? "is-loss" : "is-tie";
  const leftTeam = lionsHome
    ? {
        name: "Lions",
        score: lionsScore,
        logo: "assets/team-logos/lions.png"
      }
    : {
        name: opponentName,
        score: opponentScore,
        logo: window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png"
      };
  const rightTeam = lionsHome
    ? {
        name: opponentName,
        score: opponentScore,
        logo: window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png"
      }
    : {
        name: "Lions",
        score: lionsScore,
        logo: "assets/team-logos/lions.png"
      };
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  const isAdmin = isAdminMode();
  const syncButton = isAdminMode()
    ? `<button type="button" class="secondary-action archive-card-action archive-card-sync" data-game-action="sync" data-game-id="${escapeHtml(game.id)}" ${!canSyncGame(game) ? "disabled" : ""}>${escapeHtml(completedGameSyncButtonLabel(syncState))}</button>`
    : "";
  return `<article class="archive-card archive-card-${escapeHtml(outcomeClass)}">
    <div class="archive-card-head">
      <span class="archive-result-badge ${escapeHtml(outcomeClass)}">${escapeHtml(outcome)}</span>
      <span class="archive-card-date">${escapeHtml(formatArchiveDate(game.date))}</span>
    </div>
    <div class="archive-card-scoreline">
      <div class="archive-card-team archive-card-team-left">
        <img class="archive-card-logo" src="${escapeHtml(leftTeam.logo)}" alt="" loading="lazy" decoding="async">
        <strong class="archive-card-team-name">${escapeHtml(leftTeam.name)}</strong>
      </div>
      <div class="archive-card-score-center">
        <strong class="archive-card-score">${escapeHtml(String(leftTeam.score))}</strong>
        <span class="archive-card-score-separator">-</span>
        <strong class="archive-card-score">${escapeHtml(String(rightTeam.score))}</strong>
      </div>
      <div class="archive-card-team archive-card-team-right">
        <img class="archive-card-logo" src="${escapeHtml(rightTeam.logo)}" alt="" loading="lazy" decoding="async">
        <strong class="archive-card-team-name">${escapeHtml(rightTeam.name)}</strong>
      </div>
    </div>
    <div class="archive-card-meta">
      <span>${escapeHtml(gameLocationLabel(game) || "Location TBD")}</span>
      <span aria-hidden="true">&bull;</span>
      <span>Final</span>
    </div>
    <div class="archive-card-actions ${isAdmin ? "archive-card-actions-admin" : "archive-card-actions-public"}">
      <button type="button" class="secondary-action archive-card-action" data-game-action="summary" data-game-id="${escapeHtml(game.id)}">View Summary</button>
      <button type="button" class="secondary-action archive-card-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">View Box Score</button>
      ${renderGameHighlightsAction(game, "archive-card-action")}
      ${syncButton}
    </div>
  </article>`;
}

function renderGameSummary() {
  const game = state.games.find((item) => item.id === gameSummaryId);
  els.gameSummaryPanel?.classList.toggle("is-visible", Boolean(game));
  if (!game || !els.gameSummaryBody) return;
  const summary = gameSummaryStats(game);
  els.gameSummaryTitle.textContent = "Summary";
  els.gameSummaryMeta.textContent = `${game.date || "No date"} • ${gameMatchupLabel(game)} • ${completedInningCount(game)} ${completedInningCount(game) === 1 ? "inning" : "innings"}`;
  els.gameSummaryBody.innerHTML = `<div class="game-summary-desktop">
    <div class="record-summary">
      ${metricCard("Final", gameScoreLabel(game), gameTeamMeta(game))}
      ${metricCard("Lions Hits", String(summary.hitting.h), `${summary.hitting.pa} PA | ${summary.hitting.rbi} RBI`)}
      ${metricCard("OPS", formatRate(summary.hitting.ops), `AVG ${formatRate(summary.hitting.avg)} | OBP ${formatRate(summary.hitting.obp)}`)}
      ${metricCard("Pitching", `${summary.pitching.k} K`, `${summary.pitching.pitches} pitches | WHIP ${summary.pitching.whip.toFixed(2)}`)}
    </div>
    <div class="game-summary-grid">
      <article class="breakdown-card">
        <div class="mini-head"><h3>Lions Batting</h3><span class="player-meta">Top performers</span></div>
        ${summary.hitters.map(renderGameSummaryHitter).join("") || `<p class="player-meta">No Lions plate appearances logged.</p>`}
      </article>
      <article class="breakdown-card">
        <div class="mini-head"><h3>Lions Pitching</h3><span class="player-meta">This game</span></div>
        ${summary.pitchers.map(renderGameSummaryPitcher).join("") || `<p class="player-meta">No pitching events logged.</p>`}
      </article>
    </div>
    <div class="button-row">
      <button type="button" class="primary-action" data-game-action="scorebook" data-game-id="${escapeHtml(game.id)}">View Scorebook</button>
      <button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">View Box Score</button>
      ${renderGameHighlightsAction(game)}
    </div>
  </div>
  ${renderGameSummaryMobile(game, summary)}`;
}

function gameSummaryStats(game) {
  const hitting = emptyStats();
  game.events
    .filter((event) => event.scope === "offense")
    .forEach((event) => applyEventToStats(hitting, event));
  finishStats(hitting);
  const hitters = state.roster
    .map((player) => {
      const stats = emptyStats();
      game.events
        .filter((event) => event.scope === "offense" && event.playerId === player.id)
        .forEach((event) => applyEventToStats(stats, event));
      finishStats(stats);
      const summaryScore = safeRate(stats.avg) + safeRate(stats.ops) + Number(stats.rbi || 0);
      return { player, stats, summaryScore };
    })
    .filter((row) => row.stats.pa || row.stats.h || row.stats.rbi)
    .sort((a, b) => b.summaryScore - a.summaryScore || b.stats.rbi - a.stats.rbi || b.stats.ops - a.stats.ops || b.stats.avg - a.stats.avg)
    .slice(0, 5);
  const pitchers = state.roster
    .map((player) => ({ player, stats: pitcherStats(player.id, game.id) }))
    .filter((row) => row.stats.pitches || row.stats.batters || row.stats.outs)
    .sort((a, b) => b.stats.outs - a.stats.outs || b.stats.k - a.stats.k);
  const pitching = pitchers.reduce((total, row) => {
    total.pitches += row.stats.pitches;
    total.k += row.stats.k;
    total.outs += row.stats.outs;
    total.h += row.stats.h;
    total.bb += row.stats.bb;
    total.runs += row.stats.runs;
    return total;
  }, { pitches: 0, k: 0, outs: 0, h: 0, bb: 0, runs: 0, whip: 0 });
  pitching.whip = pitching.outs ? ((pitching.h + pitching.bb) / (pitching.outs / 3)) : 0;
  return { hitting, hitters, topHitters: hitters.slice(0, 3), pitching, pitchers, leadPitcher: pitchers[0] || null };
}

function renderGameSummaryHitter(row) {
  return `<div class="scout-row">
    <span>${escapeHtml(row.player.name)}</span>
    <strong>${row.stats.h} H | ${row.stats.rbi} RBI | OPS ${formatRate(row.stats.ops)}</strong>
  </div>`;
}

function renderGameSummaryPitcher(row) {
  return `<div class="scout-row">
    <span>${escapeHtml(row.player.name)}</span>
    <strong>${formatInnings(row.stats.outs)} IP | ${row.stats.k} K | ${row.stats.pitches} NP</strong>
  </div>`;
}

function renderGameSummaryMobile(game, summary) {
  const opponentName = homeOpponentName(game);
  const lionsAway = lionsSide(game) === "away";
  const opponentLogo = window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png";
  const featuredPitcher = summary.leadPitcher;
  return `<div class="game-summary-mobile-shell">
    <article class="game-summary-mobile-scorecard">
      <div class="game-summary-mobile-team game-summary-mobile-team-left">
        <img class="game-summary-mobile-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.("Lions", "lions") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
      </div>
      <div class="game-summary-mobile-center">
        <h3>${escapeHtml(`Lions ${game.score?.lions ?? 0} - ${game.score?.opponent ?? 0} ${opponentName}`)}</h3>
        <p class="player-meta">${escapeHtml(`Away: ${lionsAway ? "Lions" : opponentName} | Home: ${lionsAway ? opponentName : "Lions"}`)}</p>
      </div>
      <div class="game-summary-mobile-team game-summary-mobile-team-right">
        <img class="game-summary-mobile-logo" src="${escapeHtml(opponentLogo)}" alt="" loading="lazy" decoding="async">
      </div>
    </article>

    <section class="game-summary-mobile-section">
      <div class="game-summary-mobile-section-head">
        <h3>Top Lions Batting Performers</h3>
      </div>
      <div class="game-summary-mobile-list">
        ${summary.topHitters.map((row, index) => renderGameSummaryMobileHitter(row, index)).join("") || `<p class="player-meta">No Lions plate appearances logged.</p>`}
      </div>
    </section>

    <section class="game-summary-mobile-section">
      <div class="game-summary-mobile-section-head">
        <h3>Lions Pitching (This Game)</h3>
      </div>
      ${featuredPitcher ? renderGameSummaryMobilePitcher(featuredPitcher) : `<p class="player-meta">No pitching events logged.</p>`}
    </section>

    <div class="game-summary-mobile-actions">
      <button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">View Box Score</button>
      ${renderGameHighlightsAction(game)}
    </div>
  </div>`;
}

function renderGameSummaryMobileHitter(row, index) {
  const rankClass = index === 0 ? "is-top" : "";
  return `<article class="game-summary-mobile-player ${rankClass}">
    <span class="game-summary-mobile-rank">${index + 1}</span>
    <span class="number-pill game-summary-mobile-number-pill" aria-hidden="true">#${escapeHtml(row.player.number || "--")}</span>
    <div class="game-summary-mobile-player-copy">
      <strong>${escapeHtml(row.player.name)}</strong>
      <span>${escapeHtml(`${row.stats.h} H | ${row.stats.rbi} RBI | OPS ${formatRate(row.stats.ops)}`)}</span>
    </div>
  </article>`;
}

function renderGameSummaryMobilePitcher(row) {
  return `<article class="game-summary-mobile-pitcher">
    <span class="number-pill game-summary-mobile-number-pill game-summary-mobile-number-pill-pitch" aria-hidden="true">#${escapeHtml(row.player.number || "--")}</span>
    <div class="game-summary-mobile-player-copy">
      <strong>${escapeHtml(row.player.name)}</strong>
      <span>${escapeHtml(`${formatInnings(row.stats.outs)} IP | ${row.stats.k} K | ${row.stats.pitches} NP`)}</span>
    </div>
  </article>`;
}

function renderGames() {
  const admin = isAdminMode();
  const activeId = activeScoreGame()?.id || "";
  const visibleFilters = new Set(["all", "future", "completed", "postponed"]);
  populateScheduleSeasonSelect();
  if (!visibleFilters.has(gameFilter)) gameFilter = "all";
  renderRecordSummary();
  if (!admin) {
    if (els.gameForm) els.gameForm.hidden = true;
    if (els.scheduleGameBtn) els.scheduleGameBtn.hidden = true;
    gameEditId = null;
  } else if (els.scheduleGameBtn) {
    els.scheduleGameBtn.hidden = !els.gameForm?.hidden;
  }
  if (els.gameFilterRow) {
    els.gameFilterRow.querySelectorAll("[data-game-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.gameFilter === gameFilter);
    });
  }
  const completedGamesSorted = gamesForLifecycle("completed", { season: scheduleSeasonFilter });
  const completedTotal = completedGamesSorted.length;
  if (gameFilter === "all") {
    const upcomingGames = scheduleDashboardUpcomingGames({ season: scheduleSeasonFilter });
    const featuredUpcoming = upcomingGames[0] || null;
    const additionalUpcoming = upcomingGames.slice(featuredUpcoming ? 1 : 0, featuredUpcoming ? 3 : 2);
    const recentCompleted = completedGamesSorted.slice(0, 6);
    if (els.scheduleDashboard) els.scheduleDashboard.hidden = scheduleGamesLayout === "calendar";
    if (els.scheduleCalendarView) els.scheduleCalendarView.hidden = scheduleGamesLayout !== "calendar";
    if (els.gamesGrid) {
      els.gamesGrid.classList.remove("is-grouped");
      els.gamesGrid.innerHTML = "";
      els.gamesGrid.hidden = true;
    }
    if (els.scheduleFeaturedBody) {
      els.scheduleFeaturedBody.innerHTML = featuredUpcoming
        ? renderScheduleFeaturedGameCard(featuredUpcoming)
        : `<p class="player-meta schedule-shell-empty">No upcoming games scheduled.</p>`;
    }
    if (els.scheduleUpcomingBody) {
      els.scheduleUpcomingBody.innerHTML = additionalUpcoming.length
        ? renderScheduleUpcomingGamesList(additionalUpcoming)
        : `<p class="player-meta schedule-shell-empty">No additional upcoming games right now.</p>`;
    }
    if (els.scheduleResultsBody) {
      els.scheduleResultsBody.innerHTML = recentCompleted.length
        ? renderScheduleResultsList(recentCompleted)
        : `<p class="player-meta schedule-shell-empty">No completed games yet.</p>`;
    }
    if (scheduleGamesLayout === "calendar") renderScheduleCalendar();
    hydrateHomeWeather([featuredUpcoming, ...additionalUpcoming].filter(Boolean));
  } else {
    if (els.scheduleDashboard) els.scheduleDashboard.hidden = true;
    if (els.scheduleCalendarView) els.scheduleCalendarView.hidden = true;
    if (els.gamesGrid) els.gamesGrid.hidden = false;
    els.gamesGrid.classList.remove("is-grouped");
    const filtered = gamesForLifecycle(gameFilter, { season: scheduleSeasonFilter });
    els.gamesGrid.innerHTML = filtered.length
      ? filtered.map((game) => renderScheduleGameCard(game, activeId)).join("")
      : `<p class="player-meta">No ${escapeHtml(gameFilter)} games found.</p>`;
  }
  if (els.gamesArchiveNote) {
    if (gameFilter === "all" || gameFilter === "completed") {
      els.gamesArchiveNote.hidden = true;
      els.gamesArchiveNote.innerHTML = "";
    } else {
      els.gamesArchiveNote.hidden = false;
      els.gamesArchiveNote.innerHTML = `<span>Full game history lives in Game Archive.</span><button type="button" class="secondary-action" data-game-action="archive">Open Game Archive</button>`;
    }
  }
}

function renderScheduleFeaturedGameCard(game) {
  const status = homeNextGameStatusState(game);
  const location = gameLocationLabel(game);
  const dateLabel = formatGameDateDisplay(game?.date);
  const timeLabel = formatGameTimeDisplay(game?.time);
  const quickScoreAction = renderQuickScoreAction(game, "schedule-quick-score-feature");
  const heroMeta = [
    renderScheduleMetaItem("calendar", `${dateLabel}${timeLabel ? ` | ${timeLabel}` : ""}`),
    renderScheduleMetaItem("location", location || "Location TBD"),
    renderScheduleWeatherItem(game)
  ].filter(Boolean).join("");
  return `<article class="schedule-feature-card">
    <img class="schedule-feature-image" src="${escapeHtml(matchupImageForGame(game))}" alt="${escapeHtml(gameMatchupLabel(game))} matchup" loading="lazy" decoding="async">
    <div class="schedule-feature-content">
      <h4 class="schedule-feature-title">${escapeHtml(gameMatchupLabel(game))}</h4>
      <div class="schedule-feature-meta">${heroMeta}</div>
      <p class="home-next-game-status${status.isLive ? " is-live" : ""}">
        <span class="home-next-game-status-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <path d="M12 8v4l2.5 2.5"></path>
          </svg>
        </span>
        <span>${escapeHtml(status.text)}</span>
      </p>
      ${quickScoreAction}
    </div>
  </article>`;
}

function renderScheduleUpcomingGamesList(games = []) {
  return `<div class="schedule-upcoming-list">
    ${games.map((game) => renderScheduleUpcomingRow(game)).join("")}
  </div>`;
}

function renderScheduleResultsList(games = []) {
  return `<div class="schedule-results-list">
    ${games.map((game) => renderScheduleResultRow(game)).join("")}
  </div>`;
}

function availableScheduleSeasons() {
  const seasons = new Set([String(currentLeagueSeason())]);
  state.games.forEach((game) => {
    const season = String(game?.date || "").slice(0, 4);
    if (/^\d{4}$/.test(season)) seasons.add(season);
  });
  return [...seasons].sort((a, b) => Number(b) - Number(a));
}

function normalizeScheduleSeasonFilter(value, options = availableScheduleSeasons()) {
  const requested = String(value || "");
  if (options.includes(requested)) return requested;
  return options[0] || String(currentLeagueSeason());
}

function scheduleCalendarMonthOptions(season = scheduleSeasonFilter) {
  const seasonValue = normalizeScheduleSeasonFilter(season);
  return Array.from({ length: 12 }, (_, index) => `${seasonValue}-${String(index + 1).padStart(2, "0")}`);
}

function populateScheduleSeasonSelect() {
  if (!els.scheduleSeasonSelect) return;
  const seasons = availableScheduleSeasons();
  scheduleSeasonFilter = normalizeScheduleSeasonFilter(scheduleSeasonFilter, seasons);
  els.scheduleSeasonSelect.innerHTML = seasons
    .map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(`${season} Season`)}</option>`)
    .join("");
  els.scheduleSeasonSelect.value = scheduleSeasonFilter;
}

function populateScheduleCalendarMonthSelect() {
  if (!els.scheduleCalendarMonthSelect) return;
  const months = scheduleCalendarMonthOptions(scheduleSeasonFilter);
  if (!months.includes(scheduleCalendarMonth)) {
    scheduleCalendarMonth = months[0] || monthKeyFromDateValue(todayValue());
  }
  els.scheduleCalendarMonthSelect.innerHTML = months
    .map((monthKey) => `<option value="${escapeHtml(monthKey)}">${escapeHtml(formatCalendarMonthLabel(monthKey))}</option>`)
    .join("");
  els.scheduleCalendarMonthSelect.value = scheduleCalendarMonth;
}

function availableStatsSeasons() {
  const seasons = new Set([String(currentLeagueSeason())]);
  state.games
    .filter((game) => game?.status !== "scheduled")
    .forEach((game) => {
      const season = String(game?.date || "").slice(0, 4);
      if (/^\d{4}$/.test(season)) seasons.add(season);
    });
  return [...seasons].sort((a, b) => Number(b) - Number(a));
}

function normalizeStatsSeasonFilter(value, options = availableStatsSeasons()) {
  const requested = String(value || "");
  if (options.includes(requested)) return requested;
  return options[0] || String(currentLeagueSeason());
}

function populateStatsSeasonSelect() {
  if (!els.statsSeasonSelect) return;
  const seasons = availableStatsSeasons();
  statsSeasonFilter = normalizeStatsSeasonFilter(statsSeasonFilter, seasons);
  els.statsSeasonSelect.innerHTML = seasons
    .map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(`${season} Season`)}</option>`)
    .join("");
  els.statsSeasonSelect.value = statsSeasonFilter;
}

function statsGamesForSeason(season = null) {
  const activeSeason = season ? normalizeStatsSeasonFilter(season) : "";
  return state.games.filter((game) => {
    if (!game || game.status === "scheduled") return false;
    if (activeSeason && !String(game?.date || "").startsWith(`${activeSeason}-`)) return false;
    return true;
  });
}

function getSeasonHittingRows() {
  return state.roster
    .map((player) => ({ player, hit: statsForPlayer(player.id, statsSeasonFilter), gp: gamesPlayedForPlayer(player.id, statsSeasonFilter) }))
    .sort((a, b) => compareHittingRows(a, b));
}

function getSeasonPitchingRows() {
  return state.roster
    .map((player) => ({ player, pit: pitcherStats(player.id, null, statsSeasonFilter) }))
    .filter(({ player, pit }) => hasPitchingStats(pit) || playerHasPosition(player, "P"))
    .sort((a, b) => comparePitchingRows(a, b));
}

function desktopStatsPlayerOption(player) {
  return `<option value="${escapeHtml(player.id)}">#${escapeHtml(player.number || "--")} ${escapeHtml(player.name)}</option>`;
}

function syncDesktopStatsPlayerSelect(select, players, currentValue, focusedPlayerId) {
  if (!select) return currentValue;
  const focusedPlayer = focusedPlayerId ? state.roster.find((player) => player.id === focusedPlayerId) : null;
  const availablePlayers = focusedPlayer ? [focusedPlayer] : players;
  select.innerHTML = [
    focusedPlayer ? "" : `<option value="all">All players</option>`,
    ...availablePlayers.map(desktopStatsPlayerOption)
  ].join("");
  let nextValue = focusedPlayer ? focusedPlayer.id : currentValue;
  if (!focusedPlayer && !availablePlayers.some((player) => player.id === nextValue)) nextValue = "all";
  select.value = nextValue;
  select.disabled = Boolean(focusedPlayer);
  return nextValue;
}

function renderDesktopStatsFilters(hittingRows, pitchingRows) {
  const focusedPlayerId = statsFocusedPlayerId();
  desktopHitPlayerFilter = syncDesktopStatsPlayerSelect(
    els.desktopHitPlayerSelect,
    hittingRows.map(({ player }) => player),
    desktopHitPlayerFilter,
    focusedPlayerId
  );
  desktopPitPlayerFilter = syncDesktopStatsPlayerSelect(
    els.desktopPitPlayerSelect,
    pitchingRows.map(({ player }) => player),
    desktopPitPlayerFilter,
    focusedPlayerId
  );
}

function statsGamesWithDataForSeason(season = statsSeasonFilter) {
  return statsGamesForSeason(season)
    .filter((game) => (Array.isArray(game?.events) && game.events.length) || Object.keys(hittingStatEditMap(game)).length)
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));
}

function statsGameOptionLabel(game) {
  return `${game.date} ${gameMatchupLabel(game)}`;
}

function getMobileHittingRows(playerId = "all", gameId = "all") {
  return state.roster
    .map((player) => ({
      player,
      hit: statsForPlayer(player.id, statsSeasonFilter, gameId === "all" ? null : gameId),
      gp: gamesPlayedForPlayer(player.id, statsSeasonFilter)
    }))
    .filter(({ player, hit, gp }) => (playerId === "all" || player.id === playerId) && (hit.pa > 0 || gp > 0))
    .sort((a, b) => compareHittingRows(a, b));
}

function getMobilePitchingRows(playerId = "all", gameId = "all") {
  return state.roster
    .map((player) => ({
      player,
      pit: pitcherStats(player.id, gameId === "all" ? null : gameId, statsSeasonFilter)
    }))
    .filter(({ player, pit }) => (playerId === "all" || player.id === playerId) && (hasPitchingStats(pit) || playerHasPosition(player, "P")))
    .sort((a, b) => comparePitchingRows(a, b));
}

function renderMobileStatsFilters() {
  const focusedPlayerId = statsFocusedPlayerId();
  const gameOptions = [
    `<option value="all">All games</option>`,
    ...statsGamesWithDataForSeason(statsSeasonFilter).map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(statsGameOptionLabel(game))}</option>`)
  ].join("");

  const hittingPlayers = state.roster.filter((player) =>
    getMobileHittingRows("all", mobileHitGameFilter).some((row) => row.player.id === player.id)
  );
  const pitchingPlayers = state.roster.filter((player) =>
    getMobilePitchingRows("all", mobilePitGameFilter).some((row) => row.player.id === player.id)
  );

  if (els.mobileHitPlayerSelect) {
    const hitPlayerLabel = els.mobileHitPlayerSelect.closest("label");
    if (focusedPlayerId) {
      const focusedPlayer = state.roster.find((player) => player.id === focusedPlayerId);
      els.mobileHitPlayerSelect.innerHTML = focusedPlayer
        ? `<option value="${escapeHtml(focusedPlayer.id)}">#${escapeHtml(focusedPlayer.number)} ${escapeHtml(focusedPlayer.name)}</option>`
        : "";
      mobileHitPlayerFilter = focusedPlayerId;
      els.mobileHitPlayerSelect.value = focusedPlayerId;
      els.mobileHitPlayerSelect.disabled = true;
      if (hitPlayerLabel) hitPlayerLabel.hidden = true;
    } else {
      els.mobileHitPlayerSelect.innerHTML = [
        `<option value="all">All players</option>`,
        ...hittingPlayers.map((player) => `<option value="${escapeHtml(player.id)}">#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
      ].join("");
      if (!hittingPlayers.some((player) => player.id === mobileHitPlayerFilter)) mobileHitPlayerFilter = "all";
      els.mobileHitPlayerSelect.value = mobileHitPlayerFilter;
      els.mobileHitPlayerSelect.disabled = false;
      if (hitPlayerLabel) hitPlayerLabel.hidden = false;
    }
  }

  if (els.mobileHitGameSelect) {
    els.mobileHitGameSelect.innerHTML = gameOptions;
    if (![...els.mobileHitGameSelect.options].some((option) => option.value === mobileHitGameFilter)) mobileHitGameFilter = "all";
    els.mobileHitGameSelect.value = mobileHitGameFilter;
  }

  if (els.mobilePitPlayerSelect) {
    const pitPlayerLabel = els.mobilePitPlayerSelect.closest("label");
    if (focusedPlayerId) {
      const focusedPlayer = state.roster.find((player) => player.id === focusedPlayerId);
      els.mobilePitPlayerSelect.innerHTML = focusedPlayer
        ? `<option value="${escapeHtml(focusedPlayer.id)}">#${escapeHtml(focusedPlayer.number)} ${escapeHtml(focusedPlayer.name)}</option>`
        : "";
      mobilePitPlayerFilter = focusedPlayerId;
      els.mobilePitPlayerSelect.value = focusedPlayerId;
      els.mobilePitPlayerSelect.disabled = true;
      if (pitPlayerLabel) pitPlayerLabel.hidden = true;
    } else {
      els.mobilePitPlayerSelect.innerHTML = [
        `<option value="all">All players</option>`,
        ...pitchingPlayers.map((player) => `<option value="${escapeHtml(player.id)}">#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
      ].join("");
      if (!pitchingPlayers.some((player) => player.id === mobilePitPlayerFilter)) mobilePitPlayerFilter = "all";
      els.mobilePitPlayerSelect.value = mobilePitPlayerFilter;
      els.mobilePitPlayerSelect.disabled = false;
      if (pitPlayerLabel) pitPlayerLabel.hidden = false;
    }
  }

  if (els.mobilePitGameSelect) {
    els.mobilePitGameSelect.innerHTML = gameOptions;
    if (![...els.mobilePitGameSelect.options].some((option) => option.value === mobilePitGameFilter)) mobilePitGameFilter = "all";
    els.mobilePitGameSelect.value = mobilePitGameFilter;
  }
}

function statsSeasonLabel(season = statsSeasonFilter) {
  return `${normalizeStatsSeasonFilter(season)} Season`;
}

function playerDisplayName(playerId) {
  const player = state.roster.find((item) => item.id === playerId);
  return player ? `#${player.number || "--"} ${player.name}` : "this player";
}

function statsFocusedPlayerId() {
  return statsPlayerFocus !== "all" ? statsPlayerFocus : "";
}

function isPlayerFocusedStatsMode() {
  return Boolean(statsFocusedPlayerId());
}

function applyStatsPageMode() {
  const focusedMode = isPlayerFocusedStatsMode();
  if (els.statsView) {
    els.statsView.classList.toggle("is-player-focused", focusedMode);
  }
  if (els.statsPageHead) els.statsPageHead.hidden = focusedMode;
  if (els.statsDashboardEmpty) els.statsDashboardEmpty.hidden = focusedMode || els.statsDashboardEmpty.hidden;
  if (els.statsSnapshotCard) els.statsSnapshotCard.hidden = focusedMode;
  if (els.statsDashboardGrid) els.statsDashboardGrid.hidden = focusedMode;
  if (els.statsLeadersShell) els.statsLeadersShell.hidden = focusedMode;
  if (els.statsView) {
    if (focusedMode) {
      if (els.statsFocusBanner) els.statsView.appendChild(els.statsFocusBanner);
      if (els.statsHittingSection) els.statsView.appendChild(els.statsHittingSection);
      if (els.statsPitchingSection) els.statsView.appendChild(els.statsPitchingSection);
      if (els.statsSprayShell) els.statsView.appendChild(els.statsSprayShell);
    } else {
      if (els.statsPageHead && els.statsFocusBanner) {
        els.statsPageHead.insertAdjacentElement("afterend", els.statsFocusBanner);
      }
      if (els.statsFocusBanner && els.statsSnapshotCard) {
        els.statsFocusBanner.insertAdjacentElement("afterend", els.statsSnapshotCard);
      }
      if (els.statsSnapshotCard && els.statsDashboardGrid) {
        els.statsSnapshotCard.insertAdjacentElement("afterend", els.statsDashboardGrid);
      }
      if (els.statsDashboardGrid && els.statsLeadersShell) {
        els.statsDashboardGrid.insertAdjacentElement("afterend", els.statsLeadersShell);
      }
      if (els.statsLeadersShell && els.statsSprayShell) {
        els.statsLeadersShell.insertAdjacentElement("afterend", els.statsSprayShell);
      }
      if (els.statsSprayShell && els.statsHittingSection) {
        els.statsSprayShell.insertAdjacentElement("afterend", els.statsHittingSection);
      }
      if (els.statsHittingSection && els.statsPitchingSection) {
        els.statsHittingSection.insertAdjacentElement("afterend", els.statsPitchingSection);
      }
    }
  }
}

function renderStatsFocusBanner() {
  if (!els.statsFocusBanner || !els.statsFocusLabel) return;
  const focusedPlayerId = statsFocusedPlayerId();
  els.statsFocusBanner.hidden = !focusedPlayerId;
  if (!focusedPlayerId) return;
  els.statsFocusLabel.textContent = `Showing stats for ${playerDisplayName(focusedPlayerId)}.`;
}

function exportStatsTable(mode) {
  const isPitching = mode === "pitching";
  const playerFilter = statsFocusedPlayerId() || (isPitching ? desktopPitPlayerFilter : desktopHitPlayerFilter);
  const rows = (isPitching ? getSeasonPitchingRows() : getSeasonHittingRows())
    .filter(({ player }) => playerFilter === "all" || player.id === playerFilter);
  const headers = isPitching
    ? ["Player", "W", "L", "ND", "IP", "NP", "Balls", "Strikes", "Str%", "BF", "H", "R", "ERA", "BB", "HBP", "K", "K%", "BB%", "K/BB", "K/9", "R/9", "WHIP", "P/IP"]
    : ["Player", "GP", "PA", "AB", "H", "1B", "2B", "3B", "HR", "AVG", "OPS", "R", "OBP", "SLG", "RBI", "BB", "HBP", "K", "SB", "CS", "PO", "ROE", "E"];
  const dataRows = isPitching
    ? rows.map(({ player, pit }) => [
      `#${player.number} ${player.name}`,
      pit.wins,
      pit.losses,
      pit.noDecision,
      formatInnings(pit.outs),
      pit.pitches,
      pit.balls,
      pit.strikes,
      `${Math.round(pit.strikeRate * 100)}%`,
      pit.batters,
      pit.h,
      pit.runs,
      formatEra(pit.era),
      pit.bb,
      pit.hbp,
      pit.k,
      `${Math.round(pit.kRate * 100)}%`,
      `${Math.round(pit.bbRate * 100)}%`,
      pit.kbb.toFixed(1),
      pit.k9.toFixed(1),
      pit.r9.toFixed(1),
      pit.whip.toFixed(2),
      pit.pitchesPerInning.toFixed(1)
    ])
    : rows.map(({ player, hit, gp }) => [
      `#${player.number} ${player.name}`,
      gp,
      hit.pa,
      hit.ab,
      hit.h,
      hit.singles,
      hit.doubles,
      hit.triples,
      hit.hr,
      formatRate(hit.avg),
      formatRate(hit.ops),
      hit.runs,
      formatRate(hit.obp),
      formatRate(hit.slg),
      hit.rbi,
      hit.bb,
      hit.hbp,
      hit.k,
      hit.sb,
      hit.cs,
      hit.po,
      hit.roe,
      hit.errors
    ]);
  const csv = [headers, ...dataRows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const filename = `oakmont-lions-${normalizeStatsSeasonFilter(statsSeasonFilter)}-${mode}-stats.csv`;
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
}

function totalTeamRuns(scopedGames = []) {
  return scopedGames.reduce((total, game) => total + (Number(game?.score?.lions) || 0), 0);
}

function teamPitchingStats(season = null) {
  const stats = {
    wins: 0,
    losses: 0,
    noDecision: 0,
    decisions: 0,
    pitches: 0,
    balls: 0,
    strikes: 0,
    batters: 0,
    outs: 0,
    h: 0,
    hr: 0,
    k: 0,
    bb: 0,
    hbp: 0,
    runs: 0,
    earnedRuns: 0
  };
  const games = statsGamesForSeason(season);
  const earnedRunMaps = new Map(games.map((game) => [game.id, lionsEarnedRunsByEvent(game)]));
  games
    .filter(gameIsFinal)
    .forEach((game) => {
      const lionsRuns = Number(game?.score?.lions || 0);
      const opponentRuns = Number(game?.score?.opponent || 0);
      if (lionsRuns > opponentRuns) stats.wins += 1;
      if (lionsRuns < opponentRuns) stats.losses += 1;
    });
  games
    .flatMap((game) => pitchingEventsForStatsGame(game).map((event) => ({ event, game })))
    .filter(({ event }) => event.scope === "defense" && event.pitcherId)
    .forEach(({ event, game }) => {
      const rule = eventRules[event.result] || {};
      stats.batters += rule.pa ? 1 : 0;
      stats.outs += Math.max(0, (event.outsAfter ?? event.outsBefore ?? 0) - (event.outsBefore ?? 0)) || (rule.out ? 1 : 0);
      stats.h += rule.hit ? 1 : 0;
      stats.hr += event.result === "HR" ? 1 : 0;
      stats.k += event.result === "K" ? 1 : 0;
      stats.bb += event.result === "BB" ? 1 : 0;
      stats.hbp += event.result === "HBP" ? 1 : 0;
      stats.runs += event.runs || 0;
      stats.earnedRuns += pitchingEventEarnedRuns(event, earnedRunMaps.get(game.id));
      (event.pitches || []).forEach((pitch) => {
        stats.pitches += 1;
        if (pitch.type === "ball") stats.balls += 1;
        if (["strike", "called_strike", "swinging_strike", "foul", "in_play"].includes(pitch.type)) stats.strikes += 1;
      });
    });
  stats.decisions = stats.wins + stats.losses;
  stats.ip = stats.outs / 3;
  stats.strikeRate = divide(stats.strikes, stats.pitches);
  stats.kRate = divide(stats.k, stats.batters);
  stats.bbRate = divide(stats.bb, stats.batters);
  stats.kbb = stats.bb ? stats.k / stats.bb : stats.k;
  stats.k9 = divide(stats.k * 9, stats.ip);
  stats.era = stats.ip ? (stats.earnedRuns * ERA_GAME_INNINGS) / stats.ip : Number.NaN;
  stats.r9 = divide(stats.runs * 9, stats.ip);
  stats.whip = divide(stats.bb + stats.h, stats.ip);
  stats.pitchesPerInning = divide(stats.pitches, stats.ip);
  return stats;
}

function openScheduleCalendar() {
  scheduleGamesLayout = "calendar";
  const anchorGame = gamesForLifecycle("future", { season: scheduleSeasonFilter })[0]
    || [...state.games]
      .filter((game) => String(game?.date || "").startsWith(`${scheduleSeasonFilter}-`))
      .sort(sortGamesOldestFirst)[0]
    || null;
  scheduleCalendarMonth = monthKeyFromDateValue(anchorGame?.date || `${scheduleSeasonFilter}-01-01`);
  renderGames();
}

function closeScheduleCalendar() {
  scheduleGamesLayout = "dashboard";
  renderGames();
}

function monthKeyFromDateValue(value = todayValue()) {
  return /^\d{4}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 7) : todayValue().slice(0, 7);
}

function shiftMonthKey(monthKey, delta = 0) {
  const { year, month } = parseMonthKey(monthKey);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(monthKey = todayValue().slice(0, 7)) {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) {
    const today = todayValue().slice(0, 7).split("-").map(Number);
    return { year: today[0], month: today[1] };
  }
  return { year, month };
}

function formatCalendarMonthLabel(monthKey = scheduleCalendarMonth) {
  const { year, month } = parseMonthKey(monthKey);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function renderScheduleCalendar() {
  if (!els.scheduleCalendarGrid) return;
  populateScheduleCalendarMonthSelect();
  const calendarGames = [...state.games]
    .filter((game) => String(game?.date || "").startsWith(`${scheduleSeasonFilter}-`))
    .sort(sortGamesOldestFirst);
  const gamesByDate = calendarGames.reduce((map, game) => {
    if (!game?.date) return map;
    const list = map.get(game.date) || [];
    list.push(game);
    map.set(game.date, list);
    return map;
  }, new Map());
  els.scheduleCalendarView?.classList.remove("is-list-mode");
  els.scheduleCalendarGrid.classList.remove("is-list-mode");
  if (els.scheduleCalendarWeekdays) els.scheduleCalendarWeekdays.hidden = false;
  if (els.scheduleCalendarFooter) els.scheduleCalendarFooter.hidden = false;
  els.scheduleCalendarGrid.innerHTML = buildScheduleCalendarCells(scheduleCalendarMonth, gamesByDate);
}

function buildScheduleCalendarCells(monthKey, gamesByDate) {
  const { year, month } = parseMonthKey(monthKey);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const monthStartDay = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - monthStartDay));
  const today = todayValue();
  const monthString = `${year}-${String(month).padStart(2, "0")}`;
  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart.getTime());
    cellDate.setUTCDate(gridStart.getUTCDate() + index);
    const dateValue = `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, "0")}-${String(cellDate.getUTCDate()).padStart(2, "0")}`;
    const outsideMonth = !dateValue.startsWith(monthString);
    const games = outsideMonth ? [] : (gamesByDate.get(dateValue) || []);
    const isToday = dateValue === today;
    const mobileDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    }).format(cellDate);
    return `<article class="schedule-calendar-cell${outsideMonth ? " is-outside-month" : ""}${isToday && !outsideMonth ? " is-today" : ""}${games.length ? "" : " is-empty"}">
      <div class="schedule-calendar-date">${outsideMonth ? "" : escapeHtml(String(cellDate.getUTCDate()))}</div>
      <div class="schedule-calendar-date-label">${outsideMonth ? "" : escapeHtml(mobileDateLabel)}</div>
      <div class="schedule-calendar-events">
        ${games.map((game) => renderScheduleCalendarCellEvent(game)).join("")}
      </div>
    </article>`;
  }).join("");
}

function renderScheduleCalendarCellEvent(game) {
  const opponentName = homeOpponentName(game);
  const logo = window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png";
  const home = lionsSide(game) === "home";
  const lifecycle = gameLifecycle(game);
  const completed = lifecycle === "completed";
  const live = lifecycle === "active";
  const postponed = lifecycle === "postponed";
  const outcome = completed
    ? (Number(game?.score?.lions || 0) > Number(game?.score?.opponent || 0) ? "W" : Number(game?.score?.lions || 0) < Number(game?.score?.opponent || 0) ? "L" : "T")
    : "";
  const finalScore = `${Number(game?.score?.lions || 0)} - ${Number(game?.score?.opponent || 0)}`;
  const timeLabel = completed ? `Final - ${finalScore}` : (live ? `Live - ${finalScore}` : postponed ? `Postponed - ${finalScore}` : (formatGameTimeDisplay(game?.time) || "TBD"));
  const statusClass = `${home ? " is-home" : " is-away"}${completed ? " is-completed" : ""}${live ? " is-live" : ""}${postponed ? " is-postponed" : ""}`;
  const action = completed || postponed ? "boxscore" : "";
  return `<button type="button" class="schedule-calendar-event${statusClass}" ${action ? `data-game-action="${escapeHtml(action)}" data-game-id="${escapeHtml(game.id)}"` : "disabled"}>
    <div class="schedule-calendar-event-top">
      <span class="schedule-calendar-event-side">${escapeHtml(home ? "vs" : "@")}</span>
      <img class="schedule-calendar-event-logo" src="${escapeHtml(logo)}" alt="" loading="lazy" decoding="async">
      ${completed ? `<span class="schedule-calendar-event-outcome schedule-calendar-event-outcome-${escapeHtml(outcome.toLowerCase())}">${escapeHtml(outcome)}</span>` : ""}
    </div>
    <strong class="schedule-calendar-event-opponent">${escapeHtml(opponentName)}</strong>
    <span class="schedule-calendar-event-time">${escapeHtml(timeLabel)}</span>
  </button>`;
}

function renderScheduleCalendarEvent(game) {
  const opponentName = homeOpponentName(game);
  const logo = window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png";
  const home = lionsSide(game) === "home";
  const lifecycle = gameLifecycle(game);
  const completed = lifecycle === "completed";
  const live = lifecycle === "active";
  const postponed = lifecycle === "postponed";
  const outcome = completed ? (Number(game?.score?.lions || 0) > Number(game?.score?.opponent || 0) ? "W" : Number(game?.score?.lions || 0) < Number(game?.score?.opponent || 0) ? "L" : "T") : "";
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  const scoreLabel = `${lionsScore} - ${opponentScore}`;
  const dateLabel = formatShortMonthDay(game?.date || "") || formatGameDateDisplay(game?.date) || "Date TBD";
  const timeLabel = formatGameTimeDisplay(game?.time) || "TBD";
  const statusLabel = completed ? "Final" : (live ? "Live" : postponed ? "Postponed" : "Scheduled");
  const subStatusLabel = completed || postponed ? dateLabel : `${dateLabel}${timeLabel ? ` • ${timeLabel}` : ""}`;
  const statusClass = `${home ? " is-home" : " is-away"}${completed ? " is-completed" : ""}${live ? " is-live" : ""}${postponed ? " is-postponed" : ""}`;
  const action = completed || postponed ? "boxscore" : "";
  return `<button type="button" class="schedule-calendar-event schedule-calendar-list-card${statusClass}" ${action ? `data-game-action="${escapeHtml(action)}" data-game-id="${escapeHtml(game.id)}"` : "disabled"}>
    <div class="schedule-calendar-list-main">
      <div class="schedule-calendar-list-team">
        <span class="schedule-calendar-event-side">${escapeHtml(home ? "vs" : "@")}</span>
        <img class="schedule-calendar-event-logo" src="${escapeHtml(logo)}" alt="" loading="lazy" decoding="async">
        <strong class="schedule-calendar-event-opponent">${escapeHtml(opponentName)}</strong>
      </div>
      <strong class="schedule-calendar-list-score">${escapeHtml(completed || live || postponed ? scoreLabel : timeLabel)}</strong>
    </div>
    <div class="schedule-calendar-list-meta">
      <div class="schedule-calendar-list-status">
        <span class="schedule-calendar-list-status-primary">${escapeHtml(statusLabel)}</span>
        <span class="schedule-calendar-list-status-secondary">${escapeHtml(subStatusLabel)}</span>
      </div>
      ${completed ? `<span class="schedule-calendar-event-outcome schedule-calendar-event-outcome-${escapeHtml(outcome.toLowerCase())}">${escapeHtml(outcome)}</span>` : ""}
    </div>
  </button>`;
}

function scheduleCompletedMatchupLabel(game) {
  const opponentName = homeOpponentName(game);
  return lionsSide(game) === "away"
    ? `Lions @ ${opponentName}`
    : `${opponentName} vs Lions`;
}

function renderScheduleUpcomingRow(game) {
  const dateLabel = formatGameDateDisplay(game?.date);
  const timeLabel = formatGameTimeDisplay(game?.time);
  const quickScoreAction = renderQuickScoreAction(game, "schedule-quick-score-row");
  return `<article class="schedule-upcoming-row">
    <img class="schedule-upcoming-row-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.(game?.opponent, "opponent") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
    <div class="schedule-upcoming-row-copy">
      <h4>${escapeHtml(gameMatchupLabel(game))}</h4>
      <div class="schedule-upcoming-row-meta">
        ${renderScheduleMetaItem("calendar", `${dateLabel}${timeLabel ? ` | ${timeLabel}` : ""}`)}
        ${renderScheduleMetaItem("location", gameLocationLabel(game) || "Location TBD")}
        ${renderScheduleWeatherInlineItem(game)}
      </div>
    </div>
    ${quickScoreAction}
  </article>`;
}

function renderScheduleResultRow(game) {
  const opponentName = homeOpponentName(game);
  const lionsScore = Number(game?.score?.lions || 0);
  const opponentScore = Number(game?.score?.opponent || 0);
  const result = lionsScore > opponentScore ? "W" : lionsScore < opponentScore ? "L" : "T";
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  const syncButton = isAdminMode()
    ? `<button type="button" class="secondary-action schedule-result-sync" data-game-action="sync" data-game-id="${escapeHtml(game.id)}" ${!canSyncGame(game) ? "disabled" : ""}>${escapeHtml(completedGameSyncButtonLabel(syncState))}</button>`
    : "";
  return `<article class="schedule-result-row schedule-result-row-${escapeHtml(result.toLowerCase())}">
    <img class="schedule-result-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.(opponentName, "opponent") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
    <div class="schedule-result-copy">
      <div class="schedule-result-headline">
        <span class="schedule-result-matchup-label">${escapeHtml(scheduleCompletedMatchupLabel(game))}</span>
      </div>
      <div class="schedule-result-meta">Final | ${escapeHtml(formatShortMonthDay(game.date))} | ${escapeHtml(gameLocationLabel(game) || "Location TBD")}</div>
    </div>
    <div class="schedule-result-score-wrap">
      <span class="schedule-result-outcome schedule-result-outcome-${escapeHtml(result.toLowerCase())}">${escapeHtml(result)}</span>
      <strong class="schedule-result-score">${escapeHtml(`${lionsScore} - ${opponentScore}`)}</strong>
    </div>
    <div class="schedule-result-actions">
      <button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">View Box Score</button>
      ${renderGameHighlightsAction(game)}
      ${syncButton}
    </div>
  </article>`;
}

function renderScheduleMetaItem(type, text) {
  if (!text) return "";
  const icon = type === "calendar"
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11Z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>`;
  return `<span class="schedule-meta-item schedule-meta-item-${escapeHtml(type)}">
    <span class="schedule-meta-item-icon" aria-hidden="true">${icon}</span>
    <span>${escapeHtml(text)}</span>
  </span>`;
}

function renderQuickScoreAction(game, className = "schedule-quick-score-action") {
  if (!isAdminMode() || !game?.id || gameIsFinal(game) || gameIsPostponed(game)) return "";
  return `<button type="button" class="secondary-action ${escapeHtml(className)}" data-game-action="quick-score" data-game-id="${escapeHtml(game.id)}">Quick Score</button>`;
}

function renderGameHighlightsAction(game, className = "") {
  if (!game?.id || !gameIsFinal(game) || !highlightCountForGame(game.id)) return "";
  const extraClass = className ? ` ${escapeHtml(className)}` : "";
  return `<button type="button" class="secondary-action${extraClass}" data-game-action="highlights" data-game-id="${escapeHtml(game.id)}">Game Highlights</button>`;
}

function highlightCountForGame(gameId) {
  return highlightsForGame(gameId).length;
}

function highlightsForGame(gameId) {
  const id = String(gameId || "").trim();
  return normalizeHighlights(state.highlights || [], state.games)
    .filter((highlight) => highlight.gameId === id)
    .sort(sortHighlightsNewestFirst);
}

function sortHighlightsNewestFirst(left, right) {
  const updatedCompare = String(right?.createdAt || right?.updatedAt || "").localeCompare(String(left?.createdAt || left?.updatedAt || ""));
  if (updatedCompare) return updatedCompare;
  return String(right?.title || "").localeCompare(String(left?.title || ""));
}

function completedGamesForHighlights() {
  return state.games
    .filter(gameIsFinal)
    .sort(sortGamesNewestFirst);
}

function youtubeVideoIdFromUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const fallbackMatch = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const marker = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
      if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
    }
  } catch (error) {
    // Fall through to the regex parser for pasted share fragments.
  }
  return fallbackMatch?.[1] || "";
}

function youtubeEmbedUrl(videoId = "") {
  const id = String(videoId || "").trim();
  return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
}

function highlightPlayerNames(highlight) {
  const names = (highlight?.playerIds || [])
    .map((playerId) => state.roster.find((player) => player.id === playerId))
    .filter(Boolean)
    .map((player) => `#${player.number || "--"} ${player.name}`);
  return names.join(", ");
}

function highlightTagText(highlight) {
  return highlightDisplayTags(highlight).join(" | ");
}

function renderHighlightEmbed(highlight) {
  const embedUrl = youtubeEmbedUrl(highlight.youtubeVideoId || youtubeVideoIdFromUrl(highlight.youtubeUrl));
  if (!embedUrl) return `<a class="secondary-action" href="${escapeHtml(highlight.youtubeUrl)}" target="_blank" rel="noopener">Open YouTube</a>`;
  return `<div class="highlight-video-frame">
    <iframe
      src="${escapeHtml(embedUrl)}"
      title="${escapeHtml(highlight.title || "Game highlight")}"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen></iframe>
  </div>`;
}

function renderHighlightsPage() {
  if (els.highlightsAdminTools) els.highlightsAdminTools.hidden = !isAdminMode();
  if (!els.publicHighlightsGrid) return;
  if (els.highlightSearchInput && els.highlightSearchInput.value !== highlightSearchQuery) {
    els.highlightSearchInput.value = highlightSearchQuery;
  }
  renderHighlightFilterChips();
  const allHighlights = highlightSourceData();
  const highlights = filteredPublicHighlights(allHighlights);
  const featured = selectedFeaturedHighlight(highlights, allHighlights);
  if (els.publicHighlightFeatured) {
    els.publicHighlightFeatured.innerHTML = featured
      ? renderFeaturedHighlight(featured)
      : renderHighlightsEmptyState("No featured highlight available", "Published highlights will appear here once they are added.");
  }
  if (els.publicHighlightsStatus) {
    els.publicHighlightsStatus.textContent = highlights.length
      ? `${highlights.length} ${highlights.length === 1 ? "highlight" : "highlights"} showing`
      : allHighlights.length ? "No highlights match the current filters." : "No saved highlights yet.";
  }
  els.publicHighlightsGrid.innerHTML = highlights.length
    ? highlights.map(renderPublicHighlightCard).join("")
    : renderHighlightsEmptyState(
        allHighlights.length ? "No highlights found" : "No game highlights yet",
        allHighlights.length ? "Try another category or search term." : "Saved YouTube highlights from completed games will appear here."
      );
}

function highlightSourceData() {
  return normalizeHighlights(state.highlights || [], state.games)
    .filter((highlight) => {
      const game = highlightGame(highlight);
      return game && gameIsFinal(game);
    })
    .sort(sortHighlightsNewestFirst);
}

function filteredPublicHighlights(highlights = highlightSourceData()) {
  const query = normalizeLocationKey(highlightSearchQuery);
  return highlights.filter((highlight) => {
    const tags = highlightDisplayTags(highlight);
    const categories = highlightCategories(highlight);
    const categoryMatch = highlightCategoryFilter === "all" || categories.includes(highlightCategoryFilter);
    const searchMatch = !query || normalizeLocationKey([
      highlight.title,
      highlightOpponentName(highlight),
      ...categories,
      ...categories.map(highlightCategoryLabel),
      highlight.playType,
      highlight.description,
      ...tags
    ].join(" ")).includes(query);
    return categoryMatch && searchMatch;
  });
}

function selectedFeaturedHighlight(filteredHighlights = [], allHighlights = highlightSourceData()) {
  const candidatePools = [filteredHighlights, allHighlights];
  for (const pool of candidatePools) {
    const selected = selectedFeaturedHighlightId
      ? pool.find((highlight) => highlight.id === selectedFeaturedHighlightId)
      : null;
    if (selected) return selected;
    const featured = pool.find((highlight) => highlight.featured);
    if (featured) return featured;
    if (pool[0]) return pool[0];
  }
  return null;
}

function renderHighlightFilterChips() {
  if (!els.highlightFilterChips) return;
  els.highlightFilterChips.innerHTML = HIGHLIGHT_FILTERS.map((filter) => {
    const active = filter.value === highlightCategoryFilter;
    return `<button type="button" class="highlight-filter-chip${active ? " is-active" : ""}" data-highlight-filter="${escapeHtml(filter.value)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(filter.label)}</button>`;
  }).join("");
}

function renderFeaturedHighlight(highlight) {
  const scoreLabel = highlightScoreLabel(highlight);
  const tags = renderHighlightTags(highlightDisplayTags(highlight));
  const outcome = highlightOutcome(highlight);
  return `<div class="featured-highlight-media">
      ${renderHighlightEmbed({
        title: highlight.title,
        youtubeUrl: highlight.youtubeUrl,
        youtubeVideoId: highlight.youtubeVideoId
      })}
    </div>
    <div class="featured-highlight-copy">
      <p class="eyebrow">Featured Highlight</p>
      <h3>${escapeHtml(highlight.title)}</h3>
      <div class="featured-highlight-meta">
        <span>${escapeHtml(highlightDateLabel(highlight))}</span>
        <span>${escapeHtml(scoreLabel)}</span>
      </div>
      <div class="highlight-feature-scoreline highlight-feature-scoreline-${escapeHtml(outcome.key)}">
        <div class="home-recent-result-team home-recent-result-team-lions">
          <img class="home-recent-result-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.("Lions", "lions") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
          <strong>Lions</strong>
        </div>
        <div class="home-recent-result-score-center">
          <div class="home-recent-result-score-pair">
            <strong class="home-recent-result-score home-recent-result-score-lions">${escapeHtml(String(highlightLionsScore(highlight)))}</strong>
            <span class="home-recent-result-dash">-</span>
            <strong class="home-recent-result-score home-recent-result-score-opponent">${escapeHtml(String(highlightOpponentScore(highlight)))}</strong>
          </div>
          <span class="home-recent-result-outcome-pill home-recent-result-outcome-${escapeHtml(outcome.key)}">${escapeHtml(outcome.label)}</span>
        </div>
        <div class="home-recent-result-team home-recent-result-team-opponent">
          <img class="home-recent-result-logo" src="${escapeHtml(window.MatchupImages?.getTeamLogo?.(highlightOpponentName(highlight), "opponent") || "assets/team-logos/lions.png")}" alt="" loading="lazy" decoding="async">
          <strong>${escapeHtml(highlightOpponentName(highlight))}</strong>
        </div>
      </div>
      ${tags}
      <p>${escapeHtml(highlight.description)}</p>
      <a class="secondary-action highlight-youtube-link" href="${escapeHtml(highlight.youtubeUrl)}" target="_blank" rel="noopener">Watch on YouTube</a>
    </div>`;
}

function highlightOutcome(highlight) {
  const lions = highlightLionsScore(highlight);
  const opponent = highlightOpponentScore(highlight);
  if (lions > opponent) return { key: "win", label: "Win" };
  if (lions < opponent) return { key: "loss", label: "Loss" };
  return { key: "tie", label: "Tie" };
}

function renderPublicHighlightCard(highlight) {
  const thumbnail = youtubeThumbnailUrl(highlight.youtubeVideoId);
  return `<article class="game-highlight-card public-highlight-card">
    <button type="button" class="highlight-card-media" data-highlight-feature="${escapeHtml(highlight.id)}" aria-label="Feature ${escapeHtml(highlight.title)}">
      <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async">
      <span class="highlight-play-overlay" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5L18 12L8 18.5V5.5Z"></path></svg>
      </span>
    </button>
    <div class="game-highlight-copy highlight-card-copy">
      <h3>${escapeHtml(highlight.title)}</h3>
      <div class="highlight-card-meta">
        <span>${escapeHtml(highlightDateLabel(highlight))}</span>
        <span>vs ${escapeHtml(highlightOpponentName(highlight))}</span>
      </div>
      <div class="highlight-card-score">
        <strong>Lions ${escapeHtml(String(highlightLionsScore(highlight)))}</strong>
        <span>Final</span>
        <strong>${escapeHtml(highlightOpponentName(highlight))} ${escapeHtml(String(highlightOpponentScore(highlight)))}</strong>
      </div>
      <p>${escapeHtml(highlight.description)}</p>
      ${renderHighlightTags(highlightDisplayTags(highlight))}
    </div>
  </article>`;
}

function renderHighlightTags(tags = []) {
  const visibleTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!visibleTags.length) return "";
  return `<div class="highlight-tags">${visibleTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderHighlightsEmptyState(title, body) {
  return `<article class="empty-card public-highlights-empty">
    <h3>${escapeHtml(title)}</h3>
    <p class="player-meta">${escapeHtml(body)}</p>
  </article>`;
}

function youtubeThumbnailUrl(youtubeId = "") {
  const id = String(youtubeId || "").trim();
  return id ? `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : "assets/backgrounds/lions-no-game-hero.png";
}

function highlightScoreLabel(highlight) {
  return `Lions ${highlightLionsScore(highlight)} - ${highlightOpponentScore(highlight)} ${highlightOpponentName(highlight)}`;
}

function highlightGame(highlight) {
  return state.games.find((game) => game.id === highlight?.gameId) || null;
}

function highlightOpponentName(highlight) {
  const game = highlightGame(highlight);
  return game ? homeOpponentName(game) : "Opponent";
}

function highlightLionsScore(highlight) {
  return Number(highlightGame(highlight)?.score?.lions || 0);
}

function highlightOpponentScore(highlight) {
  return Number(highlightGame(highlight)?.score?.opponent || 0);
}

function highlightDateLabel(highlight) {
  const game = highlightGame(highlight);
  return game?.date ? formatGameDateWithYear(game.date) : "Game date TBD";
}

function highlightDisplayTags(highlight) {
  return [
    ...highlightCategories(highlight).map(highlightCategoryLabel),
    highlight?.inning ? `Inning ${highlight.inning}` : "",
    highlight?.playType || "",
    highlightPlayerNames(highlight)
  ].filter(Boolean);
}

function normalizeHighlightCategory(category = "") {
  const raw = String(category || "").trim();
  if (!raw) return "";
  const normalized = normalizeLocationKey(raw).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (HIGHLIGHT_FILTERS.some((filter) => filter.value === normalized && filter.value !== "all")) return normalized;
  if (["game-recap", "game-recaps", "recap", "recaps"].includes(normalized)) return "game-recaps";
  if (["walk-off", "walk-offs", "walkoff", "walkoffs"].includes(normalized)) return "walk-offs";
  if (["top-play", "top-plays", "highlight", "highlights"].includes(normalized)) return "top-plays";
  if (["player", "player-highlight", "player-highlights"].includes(normalized)) return "player-highlights";
  if (["pitch", "pitching", "pitcher"].includes(normalized)) return "pitching";
  if (["defense", "defensive", "fielding", "fielding-gem", "web-gem"].includes(normalized)) return "defense";
  return "";
}

function highlightCategoryLabel(category = "") {
  const normalized = normalizeHighlightCategory(category);
  return HIGHLIGHT_FILTERS.find((filter) => filter.value === normalized)?.label || "";
}

function normalizeHighlightCategories(categories = [], fallbackCategory = "") {
  const source = Array.isArray(categories)
    ? [...categories]
    : String(categories || "")
      .split(/[|,]/)
      .map((category) => category.trim())
      .filter(Boolean);
  if (fallbackCategory) source.unshift(fallbackCategory);
  const seen = new Set();
  return source
    .map(normalizeHighlightCategory)
    .filter((category) => {
      if (!category || seen.has(category)) return false;
      seen.add(category);
      return true;
    });
}

function inferredHighlightCategory(highlight) {
  const haystack = normalizeLocationKey([
    highlight?.title,
    highlight?.description,
    highlight?.playType,
    highlightPlayerNames(highlight)
  ].filter(Boolean).join(" "));
  if (haystack.includes("walk off") || haystack.includes("walkoff")) return "walk-offs";
  if (haystack.includes("pitch") || haystack.includes("strikeout") || haystack.includes("shutout")) return "pitching";
  if (haystack.includes("defense") || haystack.includes("fielding") || haystack.includes("double play") || haystack.includes("catch") || haystack.includes("web gem")) return "defense";
  if (haystack.includes("recap")) return "game-recaps";
  if ((highlight?.playerIds || []).length) return "player-highlights";
  return DEFAULT_HIGHLIGHT_CATEGORY;
}

function highlightCategories(highlight) {
  const savedCategories = normalizeHighlightCategories(highlight?.categories || highlight?.highlight_categories || highlight?.tags, highlight?.category || "");
  return savedCategories.length ? savedCategories : [inferredHighlightCategory(highlight)];
}

function highlightCategory(highlight) {
  return highlightCategories(highlight)[0] || DEFAULT_HIGHLIGHT_CATEGORY;
}

function renderHighlightsManager() {
  if (!els.highlightsGameSelect || !els.highlightsList) return;
  const games = completedGamesForHighlights();
  const currentGameId = els.highlightsGameSelect.value || games[0]?.id || "";
  els.highlightsGameSelect.innerHTML = games.length
    ? games.map((game) => `<option value="${escapeHtml(game.id)}" ${game.id === currentGameId ? "selected" : ""}>${escapeHtml(formatGameDateWithYear(game.date || ""))} | ${escapeHtml(gameMatchupLabel(game))}</option>`).join("")
    : `<option value="">No completed games</option>`;
  if (els.highlightsGameSelect.value !== currentGameId && games.some((game) => game.id === currentGameId)) {
    els.highlightsGameSelect.value = currentGameId;
  }

  const selectedPlayerIds = new Set([...els.highlightPlayersSelect?.selectedOptions || []].map((option) => option.value));
  if (els.highlightPlayersSelect) {
    els.highlightPlayersSelect.innerHTML = state.roster
      .filter((player) => player.active !== false)
      .map((player) => `<option value="${escapeHtml(player.id)}" ${selectedPlayerIds.has(player.id) ? "selected" : ""}>#${escapeHtml(player.number || "--")} ${escapeHtml(player.name)}</option>`)
      .join("");
  }

  const gameId = els.highlightsGameSelect.value || "";
  const highlights = highlightsForGame(gameId);
  if (els.highlightsStatus) {
    els.highlightsStatus.textContent = games.length
      ? `${highlights.length} ${highlights.length === 1 ? "highlight" : "highlights"} for the selected game.`
      : "Complete a game before adding highlights.";
  }
  if (els.highlightSaveBtn) els.highlightSaveBtn.disabled = !games.length;
  els.highlightsList.innerHTML = highlights.length
    ? highlights.map(renderHighlightManagerCard).join("")
    : `<p class="player-meta highlights-empty">No highlights saved for this game yet.</p>`;
}

function renderHighlightManagerCard(highlight) {
  const tag = highlightTagText(highlight);
  return `<article class="highlight-admin-card">
    <div class="highlight-admin-copy">
      <h3>${escapeHtml(highlight.title || "Untitled highlight")}</h3>
      ${tag ? `<p class="player-meta">${escapeHtml(tag)}</p>` : ""}
      ${highlight.description ? `<p>${escapeHtml(highlight.description)}</p>` : ""}
      <a href="${escapeHtml(highlight.youtubeUrl)}" target="_blank" rel="noopener">Open YouTube URL</a>
    </div>
    <div class="highlight-admin-actions">
      <button type="button" class="secondary-action compact-action" data-highlight-edit="${escapeHtml(highlight.id)}">Edit</button>
      <button type="button" class="secondary-action compact-action danger-action" data-highlight-delete="${escapeHtml(highlight.id)}">Delete</button>
    </div>
  </article>`;
}

function selectedHighlightTags() {
  const tags = [...(els.highlightTagInputs || [])]
    .filter((input) => input.checked)
    .map((input) => input.value);
  return normalizeHighlightCategories(tags, tags.length ? "" : DEFAULT_HIGHLIGHT_CATEGORY);
}

function setHighlightTagInputs(tags = DEFAULT_HIGHLIGHT_CATEGORIES) {
  const selected = new Set(normalizeHighlightCategories(tags, tags.length ? "" : DEFAULT_HIGHLIGHT_CATEGORY));
  [...(els.highlightTagInputs || [])].forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function resetHighlightForm() {
  highlightEditId = "";
  if (els.highlightFormTitle) els.highlightFormTitle.textContent = "Add Highlight";
  if (els.highlightUrlInput) els.highlightUrlInput.value = "";
  if (els.highlightTitleInput) els.highlightTitleInput.value = "";
  if (els.highlightDescriptionInput) els.highlightDescriptionInput.value = "";
  setHighlightTagInputs(DEFAULT_HIGHLIGHT_CATEGORIES);
  if (els.highlightInningInput) els.highlightInningInput.value = "";
  if (els.highlightPlayTypeInput) els.highlightPlayTypeInput.value = "";
  if (els.highlightPlayersSelect) [...els.highlightPlayersSelect.options].forEach((option) => { option.selected = false; });
  if (els.highlightSaveBtn) els.highlightSaveBtn.textContent = "Save Highlight";
}

function beginHighlightEdit(highlightId) {
  if (!requireAdminAccess("Admin sign-in required to edit highlights.")) return;
  const highlight = (state.highlights || []).find((item) => item.id === highlightId);
  if (!highlight) return;
  highlightEditId = highlight.id;
  if (els.highlightsGameSelect) els.highlightsGameSelect.value = highlight.gameId;
  if (els.highlightFormTitle) els.highlightFormTitle.textContent = "Edit Highlight";
  if (els.highlightUrlInput) els.highlightUrlInput.value = highlight.youtubeUrl || "";
  if (els.highlightTitleInput) els.highlightTitleInput.value = highlight.title || "";
  if (els.highlightDescriptionInput) els.highlightDescriptionInput.value = highlight.description || "";
  setHighlightTagInputs(highlightCategories(highlight));
  if (els.highlightInningInput) els.highlightInningInput.value = highlight.inning || "";
  if (els.highlightPlayTypeInput) els.highlightPlayTypeInput.value = highlight.playType || "";
  if (els.highlightPlayersSelect) {
    const selected = new Set(highlight.playerIds || []);
    [...els.highlightPlayersSelect.options].forEach((option) => { option.selected = selected.has(option.value); });
  }
  if (els.highlightSaveBtn) els.highlightSaveBtn.textContent = "Update Highlight";
  els.highlightUrlInput?.focus();
}

async function saveHighlightRecord(event) {
  event?.preventDefault?.();
  if (!requireAdminAccess("Admin sign-in required to manage highlights.")) return;
  if (!supabaseStorage?.isReady?.()) {
    window.alert("Supabase is not ready yet on this device.");
    return;
  }
  if (!supabaseAdminEmail) {
    openAdminAuthModal("Sign in as an approved admin before managing highlights.");
    return;
  }
  const gameId = els.highlightsGameSelect?.value || "";
  const game = state.games.find((item) => item.id === gameId);
  if (!game || !gameIsFinal(game)) {
    window.alert("Choose a completed game before saving a highlight.");
    return;
  }
  const youtubeUrl = String(els.highlightUrlInput?.value || "").trim();
  const youtubeVideoId = youtubeVideoIdFromUrl(youtubeUrl);
  if (!youtubeVideoId) {
    window.alert("Paste a valid YouTube URL before saving.");
    els.highlightUrlInput?.focus();
    return;
  }
  const title = String(els.highlightTitleInput?.value || "").trim();
  if (!title) {
    window.alert("Add a highlight title before saving.");
    els.highlightTitleInput?.focus();
    return;
  }
  const highlight = normalizeHighlight({
    id: highlightEditId || createId("highlight"),
    gameId,
    youtubeUrl,
    youtubeVideoId,
    title,
    description: els.highlightDescriptionInput?.value || "",
    categories: selectedHighlightTags(),
    inning: els.highlightInningInput?.value || "",
    playType: els.highlightPlayTypeInput?.value || "",
    playerIds: [...els.highlightPlayersSelect?.selectedOptions || []].map((option) => option.value),
    createdAt: (state.highlights || []).find((item) => item.id === highlightEditId)?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, state.games);
  if (!highlight) return;

  if (els.highlightSaveBtn) {
    els.highlightSaveBtn.disabled = true;
    els.highlightSaveBtn.textContent = highlightEditId ? "Updating..." : "Saving...";
  }
  try {
    const gameResult = await supabaseStorage.upsertGames([game]);
    if (gameResult?.error) throw gameResult.error;
    const { data, error } = await supabaseStorage.upsertHighlight(highlight);
    if (error) throw error;
    const saved = normalizeHighlight(data || highlight, state.games);
    state.highlights = [
      ...(state.highlights || []).filter((item) => item.id !== saved.id),
      saved
    ].sort(sortHighlightsNewestFirst);
    saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
    resetHighlightForm();
    render();
    requestSupabaseRefresh("highlight-save", { force: true, skipWhenHidden: false, invalidateBaseline: false });
  } catch (error) {
    console.warn("Unable to save highlight.", error);
    window.alert(error?.message || "Unable to save this highlight.");
  } finally {
    if (els.highlightSaveBtn) {
      els.highlightSaveBtn.disabled = false;
      els.highlightSaveBtn.textContent = highlightEditId ? "Update Highlight" : "Save Highlight";
    }
  }
}

async function deleteHighlightRecord(highlightId) {
  if (!requireAdminAccess("Admin sign-in required to delete highlights.")) return;
  if (!supabaseStorage?.isReady?.()) {
    window.alert("Supabase is not ready yet on this device.");
    return;
  }
  const highlight = (state.highlights || []).find((item) => item.id === highlightId);
  if (!highlight) return;
  if (!window.confirm(`Delete "${highlight.title || "this highlight"}"?`)) return;
  try {
    const { error } = await supabaseStorage.deleteHighlight(highlight.id);
    if (error) throw error;
    state.highlights = (state.highlights || []).filter((item) => item.id !== highlight.id);
    if (highlightEditId === highlight.id) resetHighlightForm();
    saveState({ markLiveGamesDirty: false, capturePendingScoring: false });
    render();
    requestSupabaseRefresh("highlight-delete", { force: true, skipWhenHidden: false, invalidateBaseline: false });
  } catch (error) {
    console.warn("Unable to delete highlight.", error);
    window.alert(error?.message || "Unable to delete this highlight.");
  }
}

function openGameHighlights(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game || !highlightCountForGame(game.id)) return;
  highlightModalGameId = game.id;
  renderGameHighlightsModal();
  if (els.gameHighlightsModal) {
    els.gameHighlightsModal.hidden = false;
    window.setTimeout(() => els.closeGameHighlightsBtn?.focus(), 0);
  }
}

function closeGameHighlightsModal() {
  highlightModalGameId = "";
  if (els.gameHighlightsModal) els.gameHighlightsModal.hidden = true;
}

function renderGameHighlightsModal() {
  if (!els.gameHighlightsModal || !els.gameHighlightsBody) return;
  const game = state.games.find((item) => item.id === highlightModalGameId);
  const highlights = highlightsForGame(highlightModalGameId);
  if (!game || !highlights.length) {
    els.gameHighlightsBody.innerHTML = "";
    if (els.gameHighlightsModal) els.gameHighlightsModal.hidden = true;
    return;
  }
  if (els.gameHighlightsTitle) els.gameHighlightsTitle.textContent = "Game Highlights";
  if (els.gameHighlightsMeta) els.gameHighlightsMeta.textContent = `${gameMatchupLabel(game)} | ${formatGameDateWithYear(game.date || "")}`;
  els.gameHighlightsBody.innerHTML = highlights.map((highlight) => {
    const tag = highlightTagText(highlight);
    return `<article class="game-highlight-card">
      ${renderHighlightEmbed(highlight)}
      <div class="game-highlight-copy">
        <h3>${escapeHtml(highlight.title || "Game highlight")}</h3>
        ${tag ? `<p class="player-meta">${escapeHtml(tag)}</p>` : ""}
        ${highlight.description ? `<p>${escapeHtml(highlight.description)}</p>` : ""}
      </div>
    </article>`;
  }).join("");
}

function renderScheduleWeatherItem(game) {
  return `<span class="schedule-meta-item schedule-meta-item-weather">
    <span class="weather-chip" data-weather-game-id="${escapeHtml(game.id)}">${renderWeatherChip(game)}</span>
  </span>`;
}

function renderScheduleWeatherInlineItem(game) {
  return `<span class="schedule-meta-item schedule-meta-item-weather-inline" data-weather-game-id="${escapeHtml(game.id)}">
    ${renderScheduleWeatherInlineContent(game)}
  </span>`;
}

function renderScheduleWeatherInlineContent(game) {
  if (!game?.date || !gameWeatherLocation(game)) return "Weather TBD";
  const cached = weatherCache[weatherKey(game)];
  if (!cached) return "Checking weather...";
  if (cached.error) return escapeHtml(cached.error);
  return `<span class="schedule-weather-inline-icon" aria-hidden="true">${cached.icon}</span><strong>${escapeHtml(cached.temp)}</strong><span>${escapeHtml(cached.label)}</span>`;
}

function gamesForLifecycle(lifecycle, options = {}) {
  const season = normalizeScheduleSeasonFilter(options.season || scheduleSeasonFilter);
  const games = state.games.filter((game) => {
    if (gameLifecycle(game) !== lifecycle) return false;
    if (!season) return true;
    return String(game?.date || "").startsWith(`${season}-`);
  });
  return lifecycle === "completed"
    ? games.sort(sortGamesNewestFirst)
    : games.sort(sortGamesOldestFirst);
}

function scheduleDashboardUpcomingGames(options = {}) {
  const today = todayValue();
  return gamesForLifecycle("future", options)
    .filter((game) => !gameIsPostponed(game))
    .filter((game) => (game.date || today) >= today);
}

function sortGamesOldestFirst(a, b) {
  const today = todayValue();
  const dateCompare = (a.date || today).localeCompare(b.date || today);
  if (dateCompare) return dateCompare;
  const timeCompare = (a.time || "").localeCompare(b.time || "");
  if (timeCompare) return timeCompare;
  return (a.opponent || "").localeCompare(b.opponent || "");
}

function sortGamesNewestFirst(a, b) {
  const dateCompare = (b.date || "").localeCompare(a.date || "");
  if (dateCompare) return dateCompare;
  const timeCompare = (b.time || "").localeCompare(a.time || "");
  if (timeCompare) return timeCompare;
  return (a.opponent || "").localeCompare(b.opponent || "");
}

function renderGameOrderSection(title, subtitle, games, activeId, type) {
  const cards = games.length
    ? games.map((game) => renderScheduleGameCard(game, activeId)).join("")
    : `<p class="player-meta game-order-empty">No ${escapeHtml(title.toLowerCase())} games.</p>`;
  return `<section class="game-order-section is-${escapeHtml(type)}">
    <div class="game-order-head">
      <div>
        <span class="scout-kicker">${escapeHtml(title)}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <span class="player-meta">${escapeHtml(subtitle)}</span>
    </div>
    <div class="game-order-grid">${cards}</div>
  </section>`;
}

function renderScheduleGameCard(game, activeId = "") {
  const admin = isAdminMode();
  const locked = gameIsFinal(game);
  const lifecycle = gameLifecycle(game);
  const actualActive = game.status === "active" && !gameIsFinal(game);
  const active = game.id === activeId && lifecycle === "active" ? " is-active" : "";
  const score = game.events.length || locked || lifecycle === "postponed" ? gameScoreLabel(game) : gameMatchupLabel(game);
  const status = gameStatusLabel(game);
  const completed = lifecycle === "completed";
  const postponed = lifecycle === "postponed";
  const statusTag = lifecycle === "active" ? "LIVE" : completed ? "FINAL" : postponed ? "POSTPONED" : "UPCOMING";
  const cardClass = `game-card${active} is-${lifecycle}`;
  const matchupImage = matchupImageForGame(game);
  const location = gameLocationLabel(game);
  const syncState = stableGameSyncState(game, { keepActiveSync: true });
  const completedSyncMeta = completed ? completedGameSyncMeta(game, syncState) : "";
  const completedSyncButton = admin && completed
    ? `<button type="button" class="secondary-action" data-game-action="sync" data-game-id="${game.id}" ${!canSyncGame(game) ? "disabled" : ""}>${escapeHtml(completedGameSyncButtonLabel(syncState))}</button>`
    : "";
  const quickScoreAction = renderQuickScoreAction(game, "schedule-quick-score-card");
  const highlightsAction = renderGameHighlightsAction(game);
  const reviewActions = `<button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${escapeHtml(game.id)}">View Box Score</button>
         <button type="button" class="secondary-action" data-game-action="scorebook" data-game-id="${escapeHtml(game.id)}">View Scorebook</button>`;
  const postponedAdminActions = `<button type="button" class="primary-action" data-game-action="resume-postponed" data-game-id="${escapeHtml(game.id)}">Continue Scoring</button>
         <button type="button" class="secondary-action" data-game-action="scorebook" data-game-id="${escapeHtml(game.id)}">View Scorebook</button>`;
  const primaryAction = admin
    ? (lifecycle === "active"
      ? `<button type="button" class="primary-action" data-game-action="score" data-game-id="${game.id}">${actualActive ? (game.id === activeId ? "Continue Scoring" : "Open In Progress") : "Start Live Game"}</button>`
      : lifecycle === "future"
        ? `<button type="button" class="primary-action" data-game-action="start" data-game-id="${game.id}">Start Game</button>`
        : "")
    : "";
  const publicActions = lifecycle === "completed"
    ? `<button type="button" class="secondary-action" data-game-action="summary" data-game-id="${game.id}">View Summary</button>
       <button type="button" class="secondary-action" data-game-action="boxscore" data-game-id="${game.id}">View Box Score</button>
       <button type="button" class="secondary-action" data-game-action="scorebook" data-game-id="${game.id}">View Scorebook</button>
       ${highlightsAction}`
    : lifecycle === "active"
      ? reviewActions
      : postponed
        ? reviewActions
        : "";
  const canComplete = lifecycle === "active";
  const canPostpone = lifecycle === "active" || lifecycle === "future";
  return `<article class="${cardClass}">
    <img class="game-card-matchup" src="${escapeHtml(matchupImage)}" alt="${escapeHtml(gameMatchupLabel(game))} matchup">
    <div>
      <span class="game-status-tag">${escapeHtml(statusTag)}</span>
      <span class="player-meta">${escapeHtml(gameTeamMeta(game))}</span>
      <h3>${escapeHtml(score)}</h3>
      <span class="player-meta">${escapeHtml(game.date || "No date")} ${game.time ? `| ${escapeHtml(game.time)}` : ""} ${location ? `| ${escapeHtml(location)}` : ""}</span>
    </div>
    ${completedSyncMeta}
    ${completed ? "" : `<div class="archive-meta">${escapeHtml(status)}</div>`}
    ${!completed && game.notes ? `<div class="archive-meta">${escapeHtml(game.notes)}</div>` : ""}
    <div class="game-actions">
      ${primaryAction}
      ${admin
        ? `${quickScoreAction}
           ${completed ? `<button type="button" class="secondary-action" data-game-action="summary" data-game-id="${game.id}">View Summary</button>` : ""}
           ${postponed ? postponedAdminActions : ""}
           ${highlightsAction}
           ${completedSyncButton}
           <button type="button" class="secondary-action" data-game-action="edit" data-game-id="${game.id}" ${locked ? "disabled" : ""}>Edit</button>
           <button type="button" class="secondary-action" data-game-action="postpone" data-game-id="${game.id}" ${canPostpone ? "" : "disabled"}>Postpone</button>
           <button type="button" class="secondary-action" data-game-action="complete" data-game-id="${game.id}" ${canComplete ? "" : "disabled"}>Mark Final</button>
           <button type="button" class="secondary-action danger-action" data-game-action="delete" data-game-id="${game.id}">Remove</button>`
        : publicActions}
    </div>
  </article>`;
}

function completedGameSyncMeta(game, syncState = stableGameSyncState(game, { keepActiveSync: true })) {
  if (!gameIsFinal(game)) return "";
  let message = "Stored on this iPad. Sync after the game when you are back online.";
  if (syncState.status === "syncing") {
    message = "Syncing completed game to the website...";
  } else if (syncState.status === "synced" && syncState.lastSyncedAt) {
    message = `Synced ${formatSyncTimestamp(syncState.lastSyncedAt)}.`;
  } else if (syncState.status === "error") {
    message = syncState.lastError
      ? `Sync failed: ${syncState.lastError}`
      : "Sync failed. Try again when the connection is stable.";
  } else if (typeof navigator !== "undefined" && navigator.onLine) {
    message = "Ready to sync this completed game to the website.";
  }
  return `<div class="archive-meta game-sync-meta">${escapeHtml(message)}</div>`;
}

function matchupImageForGame(game) {
  const side = lionsSide(game);
  const nightImage = isNightGame(game)
    ? window.MatchupImages?.getNightMatchupImage?.(game?.opponent, side)
    : "";
  return nightImage || window.MatchupImages?.getMatchupImage?.(game?.opponent, side) || window.MatchupImages?.fallback || "new-lion.png";
}

function renderRecordSummary() {
  const completed = state.games.filter(gameIsFinal);
  const wins = completed.filter((game) => (game.score?.lions || 0) > (game.score?.opponent || 0)).length;
  const losses = completed.filter((game) => (game.score?.lions || 0) < (game.score?.opponent || 0)).length;
  const ties = completed.filter((game) => (game.score?.lions || 0) === (game.score?.opponent || 0)).length;
  els.recordSummary.innerHTML = [
    metricCard("Record", `${wins}-${losses}${ties ? `-${ties}` : ""}`, "Completed games only."),
    metricCard("Games Saved", String(state.games.length), "Stored in the local game library."),
    metricCard("Runs For", String(completed.reduce((sum, game) => sum + (game.score?.lions || 0), 0)), "Lions runs in final games."),
    metricCard("Runs Against", String(completed.reduce((sum, game) => sum + (game.score?.opponent || 0), 0)), "Opponent runs in final games.")
  ].join("");
}

function openGameEditor(gameId) {
  if (!requireAdminAccess("Admin sign-in required to edit games.")) return;
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  gameEditId = gameId;
  els.editOpponentInput.value = game.opponent || "";
  els.editLionsSideInput.value = lionsSide(game);
  els.editDateInput.value = game.date || todayValue();
  configureGameDateInputs();
  els.editTimeInput.value = game.time || "";
  setSelectValueWithLegacy(els.editLocationInput, gameLocationName(game));
  els.editNotesInput.value = game.notes || "";
  renderGameEditor();
}

function renderGameEditor() {
  const game = state.games.find((item) => item.id === gameEditId);
  els.gameEditPanel.classList.toggle("is-visible", Boolean(game) && isAdminMode());
  if (!game) return;
  els.gameEditTitle.textContent = `Edit ${gameMatchupLabel(game)}`;
  renderGameEditorPreview();
}

function renderGameEditorPreview() {
  if (!els.editTeamIndicator) return;
  const game = state.games.find((item) => item.id === gameEditId);
  if (!game) return;
  const opponent = els.editOpponentInput.value.trim() || game.opponent || "Opponent";
  const side = normalizeLionsSide(els.editLionsSideInput.value || lionsSide(game));
  const away = side === "away" ? "Lions" : opponent;
  const home = side === "home" ? "Lions" : opponent;
  els.editTeamIndicator.innerHTML = `<span>Away: ${escapeHtml(away)}</span><strong>Home: ${escapeHtml(home)}</strong>`;
}

async function saveGameEdits() {
  if (!requireAdminAccess("Admin sign-in required to edit games.")) return;
  if (!(await ensureFreshSharedBaseline("save-game-edits"))) {
    window.alert("We couldn't refresh the latest shared schedule yet. Try again in a moment.");
    return;
  }
  const game = state.games.find((item) => item.id === gameEditId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  const date = selectedGameDate(els.editDateInput);
  const location = selectedFieldLocation(els.editLocationInput);
  game.opponent = els.editOpponentInput.value.trim() || "Opponent";
  syncGameTeams(game, els.editLionsSideInput.value || lionsSide(game));
  game.date = date;
  game.time = els.editTimeInput.value || "";
    game.location = location.name;
    game.locationAddress = location.address;
    game.notes = els.editNotesInput.value.trim();
    markSharedGamesDirty(game.id);
    saveState();
  render();
  requestSharedSnapshotSync("save-game-edits");
}

async function removeScheduledGame(gameId) {
  if (!requireAdminAccess("Admin sign-in required to remove games.")) return;
  if (!(await ensureFreshSharedBaseline("remove-scheduled-game"))) {
    window.alert("We couldn't refresh the latest shared schedule yet. Try again in a moment.");
    return;
  }
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return;
  const ok = window.confirm(`Remove ${game.opponent} on ${game.date || "this date"}?`);
  if (!ok) return;
  deleteGame(gameId);
  markSharedGamesDeleted(gameId);
  rememberDeletedGame(gameId);
  dequeueCompletedGameSync(gameId);
  if (!state.activeGameId) state.activeGameId = inProgressGames()[0]?.id || "";
  if (gameEditId === gameId) gameEditId = null;
  saveState();
  render();
  requestSharedSnapshotSync("remove-scheduled-game", { deleteGameIds: [gameId] });
}

function openLineupBuilder(gameId, returnView = "games") {
  if (!requireAdminAccess("Admin sign-in required to start or edit lineups.")) return;
  lineupBuilderGameId = gameId;
  lineupBuilderReturnView = returnView;
  const game = state.games.find((item) => item.id === gameId);
  if (gameIsFinal(game)) {
    lineupBuilderGameId = null;
    renderLineupBuilder();
    return;
  }
  if (game && game.status !== "active" && !game.lineupSetupStarted) {
    game.lineupEntries = blankStartingLineupEntries();
    game.lineups.away = deepClone(game.lineupEntries);
    game.pitcherId = "";
    game.batterIndex = 0;
    game.lineupSetupStarted = true;
    lineupBuilderSelectedEntryId = game.lineupEntries[0]?.id || "";
    saveState();
  }
  if (game) ensureStartingLineup(game);
  renderLineupBuilder();
  switchView("lineupSetup");
}

function closeLineupBuilder() {
  lineupBuilderGameId = null;
  renderLineupBuilder();
  switchView(lineupBuilderReturnView || "games");
}

function ensureStartingLineup(game) {
  if (!game) return [];
  const source = Array.isArray(game.lineupEntries)
    ? game.lineupEntries
    : Array.isArray(game.lineups?.away)
      ? game.lineups.away
      : [];
  const existing = source.slice();
  while (existing.length < 9) {
    existing.push({
      id: uuid(),
      playerId: "",
      role: defaultBuilderRoleForSpot(existing.length),
      order: existing.length + 1,
      active: true,
      note: ""
    });
  }
  game.lineupEntries = existing.map((entry, index) => {
    const hasPlayerId = entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "playerId");
    const hasRole = entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "role");
    const playerId = hasPlayerId ? entry.playerId : "";
    return {
      ...entry,
      id: entry.id || uuid(),
      playerId,
      role: playerId && hasRole ? entry.role : "",
      order: index + 1,
      active: true
    };
  });
  game.lineups.away = deepClone(game.lineupEntries);
  return game.lineupEntries;
}

function startingLineupEntries(game) {
  return ensureStartingLineup(game);
}

function lineupReadiness(game) {
  const entries = startingLineupEntries(game);
  const playerIds = entries.map((entry) => entry.playerId).filter(Boolean);
  const roles = new Set(entries.filter((entry) => entry.playerId).map((entry) => entry.role).filter(Boolean));
  const startersAssigned = playerIds.length >= 9;
  const battingOrderComplete = startersAssigned && new Set(playerIds).size === playerIds.length;
  const pitcherAssigned = Boolean(game.pitcherId || entries.find((entry) => entry.role === "P")?.playerId);
  const missingPositions = fieldPositionsWithoutPitcher.filter((position) => !roles.has(position));
  if (!pitcherAssigned) missingPositions.unshift("P");
  const positionsFilled = missingPositions.length === 0;
  return {
    startersAssigned,
    positionsFilled,
    battingOrderComplete,
    pitcherAssigned,
    missingPositions,
    ready: startersAssigned && positionsFilled && battingOrderComplete
  };
}

function renderLineupBuilder() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  els.lineupBuilderPanel.classList.toggle("is-visible", Boolean(game));
  els.opponentLineupPanel?.classList.remove("is-visible");
  if (!game) return;
  const entries = startingLineupEntries(game);
  if (!entries.some((entry) => entry.id === lineupBuilderSelectedEntryId)) {
    lineupBuilderSelectedEntryId = entries.find((entry) => !entry.playerId)?.id || "";
  }
  const readiness = lineupReadiness(game);
  const lastLineup = lastLineupGame(game.id);
  els.lineupBuilderTitle.textContent = "Starting Lineup";
  if (els.lineupBuilderContext) {
    const location = gameLocationLabel(game);
    els.lineupBuilderContext.textContent = `${gameMatchupLabel(game)} | ${game.date || "No date"}${game.time ? ` | ${game.time}` : ""}${location ? ` | ${location}` : ""}`;
  }
  if (els.useLastLineupBtn) els.useLastLineupBtn.disabled = !lastLineup;
  if (els.confirmLineupBtn) els.confirmLineupBtn.disabled = !readiness.ready;
  if (els.addOpponentLineupBtn) els.addOpponentLineupBtn.disabled = !readiness.ready;
  els.lineupBuilderRows.innerHTML = entries.map((entry, index) => renderLineupBuilderRow(game, entry, index)).join("");
  if (els.lineupBenchList) els.lineupBenchList.innerHTML = renderLineupBench(entries);
  renderLineupPitcher(game);
  if (els.lineupReadyCheck) els.lineupReadyCheck.innerHTML = renderLineupReadyCheck(readiness);
}

function openOpponentLineupStep() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const readiness = lineupReadiness(game);
  if (!readiness.ready) {
    renderLineupBuilder();
    return;
  }
  savePregameOpponentLineup();
  opponentRosterSearchQuery = "";
  opponentRosterStatusMessage = "";
  if (els.opponentRosterImportPanel) els.opponentRosterImportPanel.hidden = true;
  renderOpponentLineupStep();
}

function backToLineupBuilderStep() {
  savePregameOpponentLineup();
  renderLineupBuilder();
}

function startGameFromOpponentLineupStep() {
  savePregameOpponentLineup();
  confirmLineupAndStartGame();
}

function renderOpponentLineupStep(options = {}) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  els.lineupBuilderPanel?.classList.remove("is-visible");
  els.opponentLineupPanel?.classList.toggle("is-visible", Boolean(game));
  if (!game) return;
  const entries = pregameOpponentLineupEntries(game);
  const requestedFocusIndex = Number.isFinite(Number(options.focusIndex))
    ? Number(options.focusIndex)
    : opponentLineupActiveIndex;
  const focusIndex = Math.max(0, Math.min(requestedFocusIndex || 0, Math.max(entries.length - 1, 0)));
  opponentLineupActiveIndex = focusIndex;
  if (els.opponentLineupContext) {
    els.opponentLineupContext.textContent = `${opponentSide(game) === "home" ? "Home" : "Away"} ${game.opponent || "Opponent"} | Optional lineup`;
  }
  els.opponentLineupRows.innerHTML = entries.map((entry, index) => renderOpponentLineupSetupRow(entry, index, index === focusIndex)).join("");
  renderOpponentRosterImport(game);
  const focusTarget = els.opponentLineupRows.querySelector(`[data-opponent-pregame-index="${focusIndex}"][data-opponent-pregame-field="name"]`)
    || els.opponentLineupRows.querySelector(`[data-opponent-pregame-index="${focusIndex}"]`)
    || els.opponentLineupRows.querySelector("[data-opponent-pregame-index]");
  focusTarget?.focus();
}

function setOpponentLineupActiveRow(index = 0) {
  opponentLineupActiveIndex = Math.max(0, Number(index) || 0);
  els.opponentLineupRows?.querySelectorAll("[data-opponent-lineup-row]").forEach((row) => {
    row.classList.toggle("is-active", Number(row.dataset.opponentLineupRow) === opponentLineupActiveIndex);
  });
}

function pregameOpponentLineupEntries(game) {
  if (!game.lineups) game.lineups = { away: deepClone(game.lineupEntries || []), home: [] };
  const existing = Array.isArray(game.lineups.home) ? game.lineups.home : [];
  const names = Array.isArray(game.opponentLineup) ? game.opponentLineup : [];
  const totalSpots = Math.max(9, existing.length, names.length);
  const entries = [];
  for (let index = 0; index < totalSpots; index += 1) {
    const entry = existing[index] || names[index] || {};
    const normalized = normalizeOpponentLineupEntry(entry, index, { preserveBlank: true });
    const hasEntryData = pregameOpponentEntryHasData(entry, index);
    entries.push({
      ...normalized,
      name: hasEntryData ? normalized.name : "",
      order: index + 1,
      active: true
    });
  }
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries, { preserveBlank: true });
  return entries;
}

function addPregameOpponentLineupHitter() {
  let game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  savePregameOpponentLineup();
  game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const entries = pregameOpponentLineupEntries(game);
  const index = entries.length;
  entries.push({
    id: createId("opp"),
    name: "",
    number: "",
    order: index + 1,
    active: true
  });
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries, { preserveBlank: true });
  saveState();
  renderOpponentLineupStep({ focusIndex: index });
}

function renderOpponentLineupSetupRow(entry, index, isActive = false) {
  const spot = index + 1;
  return `<article class="opponent-lineup-setup-row${isActive ? " is-active" : ""}" data-opponent-lineup-row="${index}">
    <div class="lineup-order">${spot}</div>
    <label class="opponent-lineup-number">
      <span>No.</span>
      <input value="${escapeHtml(entry.number || "")}" placeholder="#" inputmode="numeric" autocomplete="off" data-opponent-pregame-index="${index}" data-opponent-pregame-field="number">
    </label>
    <label class="opponent-lineup-name">
      <span>Batting Spot</span>
      <input value="${escapeHtml(entry.name || "")}" placeholder="Opponent hitter ${spot}" autocomplete="off" data-opponent-pregame-index="${index}" data-opponent-pregame-field="name">
    </label>
  </article>`;
}

function updatePregameOpponentLineupEntry(index, updates = {}) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const entries = pregameOpponentLineupEntries(game);
  if (!entries[index]) return;
  entries[index] = {
    ...entries[index],
    name: Object.prototype.hasOwnProperty.call(updates, "name") ? String(updates.name || "").trim() : entries[index].name,
    number: Object.prototype.hasOwnProperty.call(updates, "number") ? String(updates.number || "").trim() : entries[index].number || "",
    order: index + 1,
    active: true
  };
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries, { preserveBlank: true });
  saveState();
}

function updatePregameOpponentLineupName(index, name) {
  updatePregameOpponentLineupEntry(index, { name });
}

function savePregameOpponentLineup() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || !els.opponentLineupRows || gameIsFinal(game)) return;
  const entries = pregameOpponentLineupEntries(game);
  els.opponentLineupRows.querySelectorAll("[data-opponent-pregame-index]").forEach((input) => {
    const index = Number(input.dataset.opponentPregameIndex);
    if (!entries[index]) return;
    const field = input.dataset.opponentPregameField || "name";
    entries[index] = {
      ...entries[index],
      [field]: input.value.trim(),
      order: index + 1,
      active: true
    };
  });
  game.lineups.home = entries;
  game.opponentLineup = opponentLineupSnapshot(entries, { preserveBlank: true });
  saveState();
}

function renderLineupBuilderRow(game, entry, index) {
  const player = state.roster.find((item) => item.id === entry.playerId);
  const stats = player ? statsForPlayer(player.id) : null;
  const spot = index + 1;
  const lastIndex = Math.max(0, startingLineupEntries(game).length - 1);
  const selected = entry.id === lineupBuilderSelectedEntryId;
  const rowClass = `lineup-builder-row${player ? "" : " is-empty"}${selected ? " is-selected" : ""}`;
  const playerSlot = player
    ? `<div class="lineup-player-picker">
      <span>${spot > 9 ? "Extra Hitter" : "Starter"}</span>
      <strong>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</strong>
    </div>`
    : `<div class="lineup-player-picker">
      <span>Batting Spot</span>
      <strong>Empty</strong>
    </div>`;
  const rowAction = player
    ? `<button type="button" class="secondary-action" data-remove-lineup-entry="${entry.id}">Bench</button>`
    : `<span class="lineup-slot-state">${selected ? "Selected" : "Tap Spot"}</span>`;
  const helper = player
    ? `AVG ${stats ? formatRate(stats.avg) : ".000"} | OPS ${stats ? formatRate(stats.ops) : ".000"} | ${selected ? "Selected for bench swap" : "Tap to select this batting spot"}`
    : `${selected ? "Choose a player from the bench." : "Tap this spot, then choose from the bench."}`;
  return `<article class="${rowClass}" data-lineup-entry="${entry.id}">
    <div class="lineup-builder-controls">
      <div class="lineup-order">${spot}</div>
      <div class="lineup-move-group" aria-label="Move ${spot} hitter">
        <button type="button" class="lineup-move" data-lineup-entry="${entry.id}" data-lineup-move="up" ${index === 0 ? "disabled" : ""} aria-label="Move batting spot ${spot} up">&#9650;</button>
        <button type="button" class="lineup-move" data-lineup-entry="${entry.id}" data-lineup-move="down" ${index === lastIndex ? "disabled" : ""} aria-label="Move batting spot ${spot} down">&#9660;</button>
      </div>
    </div>
    ${playerSlot}
    <label class="lineup-position-card">
      <span>Game Position</span>
      ${roleSelectMarkup(entry.role, !player)}
    </label>
    ${rowAction}
    <div class="lineup-player-eligibility">${helper}</div>
  </article>`;
}

function renderLineupBench(entries) {
  const used = new Set(entries.map((entry) => entry.playerId).filter(Boolean));
  const bench = state.roster.filter((player) => !used.has(player.id));
  if (!bench.length) return `<p class="player-meta">No bench players available.</p>`;
  const selectedEntry = entries.find((entry) => entry.id === lineupBuilderSelectedEntryId);
  const assignedCount = entries.filter((entry) => entry.playerId).length;
  const benchActionLabel = selectedEntry
    ? selectedEntry.playerId
      ? `Swap Spot ${selectedEntry.order || entries.indexOf(selectedEntry) + 1}`
      : `Add to Spot ${selectedEntry.order || entries.indexOf(selectedEntry) + 1}`
    : assignedCount >= 9
      ? "Add addl. player"
      : "Add Next";
  return bench
    .map((player) => {
      const stats = statsForPlayer(player.id);
      return `<article class="bench-player-card" data-bench-player="${player.id}">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <span>AVG ${formatRate(stats.avg)} | OPS ${formatRate(stats.ops)}</span>
      </div>
      <button type="button" class="secondary-action" data-bench-player="${player.id}">${benchActionLabel}</button>
    </article>`;
    })
    .join("");
}

function renderLineupPitcher(game) {
  if (!els.lineupPitcherSelect) return;
  const selected = game.pitcherId || game.lineupEntries.find((entry) => entry.role === "P")?.playerId || "";
  els.lineupPitcherSelect.innerHTML = state.roster
    .map((player) => `<option value="${player.id}" ${player.id === selected ? "selected" : ""}>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
    .join("");
  els.lineupPitcherSelect.innerHTML = `<option value="" ${selected ? "" : "selected"}>Select starting pitcher</option>${els.lineupPitcherSelect.innerHTML}`;
  const pitcher = state.roster.find((player) => player.id === (els.lineupPitcherSelect.value || selected));
  if (els.lineupPitcherStats) {
    els.lineupPitcherStats.innerHTML = pitcher
      ? `ERA -- | Record 0-0`
      : "Choose a starting pitcher to complete setup.";
  }
}

function renderLineupReadyCheck(readiness) {
  const missingWarning = readiness.missingPositions?.length
    ? `<button type="button" class="lineup-missing-warning" data-lineup-missing-warning="${escapeHtml(readiness.missingPositions[0])}">
        Missing positions: ${escapeHtml(readiness.missingPositions.join(", "))}. Tap to fix.
      </button>`
    : "";
  return [
    missingWarning,
    readyCheckItem(readiness.startersAssigned, "At least 9 hitters assigned"),
    readyCheckItem(readiness.pitcherAssigned, "Starting pitcher assigned"),
    readyCheckItem(readiness.positionsFilled, "All defensive positions filled"),
    readyCheckItem(readiness.battingOrderComplete, "Batting order complete")
  ].filter(Boolean).join("");
}

function readyCheckItem(ok, label) {
  return `<div class="ready-check-item ${ok ? "is-ready" : "is-waiting"}"><span>${ok ? "OK" : "!"}</span>${escapeHtml(label)}</div>`;
}

function playerSelectMarkup(attributeName, selectedId = "") {
  return `<select ${attributeName}>
    <option value="" ${selectedId ? "" : "selected"}>Select player</option>
    ${state.roster
    .map((player) => `<option value="${player.id}" ${player.id === selectedId ? "selected" : ""}>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
    .join("")}</select>`;
}

function roleSelectMarkup(selected = "", disabled = false) {
  return `<select data-lineup-role ${disabled ? "disabled" : ""}>
    <option value="" ${selected ? "" : "selected"}>Select position</option>
    ${lineupPositions.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${role}</option>`).join("")}
  </select>`;
}

function updateLineupEntry(entryId, playerId, role) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  game.lineupEntries = startingLineupEntries(game).map((entry) => (entry.id === entryId ? {
    ...entry,
    playerId: playerId !== undefined ? playerId : entry.playerId,
    role: role !== undefined ? role : entry.role
  } : entry));
  game.lineups.away = deepClone(game.lineupEntries);
  saveState();
  renderLineupBuilder();
}

function updateLineupPitcher() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  game.pitcherId = els.lineupPitcherSelect?.value || "";
  saveState();
  renderLineupBuilder();
}

function focusMissingLineupPosition(position = "") {
  if (position === "P" && els.lineupPitcherSelect) {
    els.lineupPitcherSelect.focus();
    els.lineupPitcherSelect.closest(".starting-pitcher-card")?.classList.add("is-attention");
    window.setTimeout(() => els.lineupPitcherSelect.closest(".starting-pitcher-card")?.classList.remove("is-attention"), 1400);
    return;
  }
  const rows = [...(els.lineupBuilderRows?.querySelectorAll("[data-lineup-entry]") || [])];
  const targetRow = rows.find((row) => {
    const value = row.querySelector("[data-lineup-role]")?.value || "";
    return !value || !fieldPositionsWithoutPitcher.includes(value);
  }) || rows[0];
  const target = targetRow?.querySelector("[data-lineup-role]");
  target?.focus();
  targetRow?.querySelector(".lineup-position-card")?.classList.add("is-attention");
  targetRow?.scrollIntoView({ block: "center", behavior: "smooth" });
  window.setTimeout(() => targetRow?.querySelector(".lineup-position-card")?.classList.remove("is-attention"), 1400);
}

function focusMissingLineupPosition(position = "") {
  if (position === "P" && els.lineupPitcherSelect) {
    els.lineupPitcherSelect.focus();
    els.lineupPitcherSelect.closest(".starting-pitcher-card")?.classList.add("is-attention");
    window.setTimeout(() => els.lineupPitcherSelect.closest(".starting-pitcher-card")?.classList.remove("is-attention"), 1400);
    return;
  }
  const rows = [...(els.lineupBuilderRows?.querySelectorAll("[data-lineup-entry]") || [])];
  const targetRow = rows.find((row) => {
    const value = row.querySelector("[data-lineup-role]")?.value || "";
    return !value || !fieldPositionsWithoutPitcher.includes(value);
  }) || rows[0];
  const target = targetRow?.querySelector("[data-lineup-role]");
  target?.focus();
  targetRow?.querySelector(".lineup-position-card")?.classList.add("is-attention");
  targetRow?.scrollIntoView({ block: "center", behavior: "smooth" });
  window.setTimeout(() => targetRow?.querySelector(".lineup-position-card")?.classList.remove("is-attention"), 1400);
}

function moveLineupEntry(entryId, direction) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const entries = startingLineupEntries(game);
  const from = entries.findIndex((entry) => entry.id === entryId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= entries.length) return;
  [entries[from], entries[to]] = [entries[to], entries[from]];
  game.lineupEntries = entries.map((entry, index) => ({ ...entry, order: index + 1 }));
  game.lineups.away = deepClone(game.lineupEntries);
  saveState();
  renderLineupBuilder();
}

function addLineupEntry() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  const used = new Set(gameLineupPlayerIds(game));
  const player = state.roster.find((item) => !used.has(item.id)) || state.roster[0];
  if (!player) return;
  const entries = startingLineupEntries(game);
  const target = entries.find((entry) => !entry.playerId);
  if (target) {
    target.playerId = player.id;
    target.role = "";
    lineupBuilderSelectedEntryId = entries.find((entry) => !entry.playerId)?.id || "";
  } else {
    entries.push({
      id: uuid(),
      playerId: player.id,
      role: "",
      order: entries.length + 1,
      active: true,
      note: ""
    });
    lineupBuilderSelectedEntryId = "";
  }
  game.lineupEntries = entries.map((entry, index) => ({ ...entry, order: index + 1 }));
  game.lineups.away = deepClone(game.lineupEntries);
  saveState();
  renderLineupBuilder();
}

function removeLineupEntry(entryId) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  const entries = startingLineupEntries(game);
  const removeIndex = entries.findIndex((entry) => entry.id === entryId);
  const nextEntries = removeIndex >= 9
    ? entries.filter((entry) => entry.id !== entryId)
    : entries.map((entry, index) => (entry.id === entryId ? {
      ...entry,
      playerId: "",
      role: "",
      order: index + 1
    } : {
      ...entry,
      order: index + 1
    }));
  game.lineupEntries = nextEntries.map((entry, index) => ({ ...entry, order: index + 1 }));
  game.lineups.away = deepClone(game.lineupEntries);
  game.batterIndex = Math.min(game.batterIndex, Math.max(game.lineupEntries.length - 1, 0));
  lineupBuilderSelectedEntryId = entryId;
  saveState();
  renderLineupBuilder();
}

function resetBuilderLineup() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game) return;
  if (gameIsFinal(game)) return;
  game.lineupEntries = blankStartingLineupEntries();
  game.pitcherId = "";
  ensureStartingLineup(game);
  game.lineups.away = deepClone(game.lineupEntries);
  game.batterIndex = 0;
  saveState();
  renderLineupBuilder();
}

function insertBenchPlayer(playerId) {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  if (!game || gameIsFinal(game)) return;
  const entries = startingLineupEntries(game);
  const selected = entries.find((entry) => entry.id === lineupBuilderSelectedEntryId);
  const target = selected || entries.find((entry) => !entry.playerId);
  if (target) {
    const wasEmpty = !target.playerId;
    entries.forEach((entry) => {
      if (entry.id !== target.id && entry.playerId === playerId) entry.playerId = "";
    });
    target.playerId = playerId;
    target.role = "";
    const nextEmpty = entries.find((entry) => !entry.playerId);
    lineupBuilderSelectedEntryId = wasEmpty && nextEmpty ? nextEmpty.id : target.id;
    if (wasEmpty && !nextEmpty && entries.filter((entry) => entry.playerId).length >= 9) {
      lineupBuilderSelectedEntryId = "";
    }
  } else {
    entries.push({
      id: uuid(),
      playerId,
      role: "",
      order: entries.length + 1,
      active: true,
      note: ""
    });
    lineupBuilderSelectedEntryId = "";
  }
  game.lineupEntries = entries.map((entry, index) => ({ ...entry, order: index + 1 }));
  game.lineups.away = deepClone(game.lineupEntries);
  saveState();
  renderLineupBuilder();
}

function lastLineupGame(currentGameId = "") {
  return [...state.games]
    .filter((game) => game.id !== currentGameId)
    .filter((game) => (game.lineupEntries || game.lineups?.away || []).some((entry) => entry.playerId))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.time || "").localeCompare(a.time || ""))[0] || null;
}

function useLastLineup() {
  const game = state.games.find((item) => item.id === lineupBuilderGameId);
  const last = lastLineupGame(game?.id || "");
  if (!game || !last || gameIsFinal(game)) return;
  const source = (last.lineupEntries?.length ? last.lineupEntries : last.lineups?.away || []);
  game.lineupEntries = source.map((entry, index) => ({
    id: uuid(),
    playerId: entry.playerId,
    role: Object.prototype.hasOwnProperty.call(entry, "role") ? entry.role : defaultBuilderRoleForSpot(index),
    order: index + 1,
    active: true,
    note: ""
  }));
  ensureStartingLineup(game);
  game.lineups.away = deepClone(game.lineupEntries);
  game.batterIndex = 0;
  saveState();
  renderLineupBuilder();
}

function renderAnalysis() {
  const team = teamStats();
  els.metricsGrid.innerHTML = [
    metricCard("Team OPS", formatRate(team.ops), "OBP plus slugging from logged plate appearances."),
    metricCard("wOBA-lite", formatRate(team.woba), "Weighted offensive value using MLB-style event weights."),
    metricCard("Pitches/PA", team.pitchesPerPa.toFixed(2), "Plate discipline signal from pitch-by-pitch scoring."),
    metricCard("AVG", formatRate(team.avg), "Team batting average from scored at-bats."),
    metricCard("K rate", `${Math.round(team.kRate * 100)}%`, "Strikeouts per plate appearance."),
    metricCard("First-pitch strike", `${Math.round(team.firstPitchStrikeRate * 100)}%`, "How often the AB starts in a pitcher count.")
  ].join("");
  renderGameBreakdown();
  renderValueBoard();
}

function renderGameBreakdown() {
  els.gameBreakdown.innerHTML = state.games
    .filter((game) => game.events.length || Object.keys(hittingStatEditMap(game)).length || game.status !== "scheduled")
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map((game) => {
      const offensiveEvents = offensiveEventsForStatsGame(game).filter((event) => eventRules[event.result]?.pa);
      const stats = emptyStats();
      offensiveEvents.forEach((event) => applyEventToStats(stats, event));
      finishStats(stats);
      return `<article class="breakdown-card">
        <div class="mini-head">
          <div>
            <h3>${escapeHtml(game.date || "No date")} ${escapeHtml(gameMatchupLabel(game))}</h3>
            <span class="player-meta">${escapeHtml(gameScoreLabel(game))} | ${escapeHtml(gameStatusLabel(game))}</span>
          </div>
          <button type="button" class="secondary-action" data-box-score-game="${escapeHtml(game.id)}">View Box Score</button>
        </div>
        <div class="stat-strip">
          ${statCell("AVG", formatRate(stats.avg))}
          ${statCell("OPS", formatRate(stats.ops))}
          ${statCell("K%", `${Math.round(stats.kRate * 100)}%`)}
          ${statCell("P/PA", stats.pitchesPerPa.toFixed(2))}
        </div>
        <p class="player-meta">${offensiveEvents.length} scored plate appearances</p>
      </article>`;
    })
    .join("") || `<p class="player-meta">Game analysis appears after scorekeeping begins.</p>`;
}

function setBoxScoreEditButtonsVisible(visible) {
  [els.boxScoreEditBtn, els.boxScoreMobileEditBtn].filter(Boolean).forEach((button) => {
    button.hidden = !visible;
  });
}

function rawBoxScoreLineEditMap(game) {
  return game?.boxScoreLineEdits && typeof game.boxScoreLineEdits === "object" && !Array.isArray(game.boxScoreLineEdits)
    ? game.boxScoreLineEdits
    : {};
}

function boxScoreLineEditMap(game) {
  if (!game) return {};
  if (!game.boxScoreLineEdits || typeof game.boxScoreLineEdits !== "object" || Array.isArray(game.boxScoreLineEdits)) {
    game.boxScoreLineEdits = {};
  }
  return game.boxScoreLineEdits;
}

function boxScoreLineEditForTeam(game, teamKey) {
  return rawBoxScoreLineEditMap(game)[teamKey] || null;
}

function boxScoreEditNumber(value, fallback = 0, max = 999) {
  if (value === null || value === undefined || String(value).trim() === "") return Math.max(0, Math.min(max, Number(fallback) || 0));
  return clampNumber(value, 0, max);
}

function normalizeBoxScoreLineEdit(input = {}, innings = [], fallbackLine = {}) {
  const storedRunsByInning = input.runsByInning && typeof input.runsByInning === "object" ? input.runsByInning : {};
  const fallbackRunsByInning = fallbackLine.runsByInning || {};
  const runsByInning = {};
  innings.forEach((inning) => {
    const rawValue = Object.prototype.hasOwnProperty.call(storedRunsByInning, inning)
      ? storedRunsByInning[inning]
      : storedRunsByInning[String(inning)];
    runsByInning[inning] = boxScoreEditNumber(rawValue, fallbackRunsByInning[inning] || 0, 99);
  });
  const inningRunTotal = Object.values(runsByInning).reduce((sum, value) => sum + (Number(value) || 0), 0);
  return {
    runsByInning,
    runs: boxScoreEditNumber(input.runs ?? input.totalRuns, fallbackLine.runs ?? inningRunTotal, 999),
    hits: boxScoreEditNumber(input.hits, fallbackLine.hits ?? 0, 999),
    errors: boxScoreEditNumber(input.errors, fallbackLine.errors ?? 0, 999),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function boxScoreEditGame() {
  return state.games.find((game) => game.id === boxScoreEditGameId) || null;
}

function renderBoxScoreEditTeam(team, line, innings) {
  return `<section class="box-score-edit-team" data-box-score-edit-section="${escapeHtml(team.key)}">
    <h4>${escapeHtml(team.name)}</h4>
    <div class="box-score-edit-innings">
      ${innings.map((inning) => `<label>
        <span>${inning}</span>
        <input type="number" min="0" max="99" step="1" inputmode="numeric" value="${line.runsByInning[inning] || 0}" data-box-score-edit-team="${escapeHtml(team.key)}" data-box-score-edit-inning="${inning}">
      </label>`).join("")}
    </div>
    <div class="box-score-edit-totals">
      <label>
        <span>Runs</span>
        <input type="number" min="0" max="999" step="1" inputmode="numeric" value="${line.runs || 0}" data-box-score-edit-team="${escapeHtml(team.key)}" data-box-score-edit-field="runs">
      </label>
      <label>
        <span>Hits</span>
        <input type="number" min="0" max="999" step="1" inputmode="numeric" value="${line.hits || 0}" data-box-score-edit-team="${escapeHtml(team.key)}" data-box-score-edit-field="hits">
      </label>
      <label>
        <span>Errors</span>
        <input type="number" min="0" max="999" step="1" inputmode="numeric" value="${line.errors || 0}" data-box-score-edit-team="${escapeHtml(team.key)}" data-box-score-edit-field="errors">
      </label>
    </div>
  </section>`;
}

function renderBoxScoreEditForm(game) {
  if (!game || !els.boxScoreEditFields) return;
  const innings = boxScoreInnings(game);
  const teams = boxScoreTeams(game);
  const lines = new Map(teams.map((team) => [team.key, boxScoreLineForTeam(game, team, innings)]));
  if (els.boxScoreEditTitle) els.boxScoreEditTitle.textContent = "Edit Box Score";
  if (els.boxScoreEditMeta) els.boxScoreEditMeta.textContent = `${gameMatchupLabel(game)} | ${formatGameDateWithYear(game.date || todayValue())}`;
  els.boxScoreEditFields.innerHTML = teams
    .map((team) => renderBoxScoreEditTeam(team, lines.get(team.key), innings))
    .join("");
}

function openBoxScoreEditModal() {
  if (!requireAdminAccess("Admin sign-in required to edit box scores.")) return;
  const game = state.games.find((item) => item.id === boxScoreGameId) || activeScoreGame();
  if (!game || !els.boxScoreEditModal) return;
  boxScoreEditGameId = game.id;
  renderBoxScoreEditForm(game);
  els.boxScoreEditModal.hidden = false;
  window.setTimeout(() => els.boxScoreEditFields?.querySelector("input")?.focus(), 0);
}

function closeBoxScoreEditModal() {
  boxScoreEditGameId = "";
  if (els.boxScoreEditModal) els.boxScoreEditModal.hidden = true;
}

function boxScoreEditFieldValue(teamKey, field) {
  const input = els.boxScoreEditFields?.querySelector(`[data-box-score-edit-team="${teamKey}"][data-box-score-edit-field="${field}"]`);
  return boxScoreEditNumber(input?.value, 0, 999);
}

function boxScoreEditInningValues(teamKey, innings) {
  const runsByInning = {};
  innings.forEach((inning) => {
    const input = els.boxScoreEditFields?.querySelector(`[data-box-score-edit-team="${teamKey}"][data-box-score-edit-inning="${inning}"]`);
    runsByInning[inning] = boxScoreEditNumber(input?.value, 0, 99);
  });
  return runsByInning;
}

function collectBoxScoreEditForTeam(teamKey, innings) {
  return normalizeBoxScoreLineEdit({
    runsByInning: boxScoreEditInningValues(teamKey, innings),
    runs: boxScoreEditFieldValue(teamKey, "runs"),
    hits: boxScoreEditFieldValue(teamKey, "hits"),
    errors: boxScoreEditFieldValue(teamKey, "errors")
  }, innings);
}

function saveBoxScoreEdit(event) {
  event?.preventDefault?.();
  if (!requireAdminAccess("Admin sign-in required to edit box scores.")) return;
  const game = boxScoreEditGame();
  if (!game) return;
  const innings = boxScoreInnings(game);
  const edits = boxScoreLineEditMap(game);
  const lionsEdit = collectBoxScoreEditForTeam("lions", innings);
  const opponentEdit = collectBoxScoreEditForTeam("opponent", innings);
  edits.lions = lionsEdit;
  edits.opponent = opponentEdit;
  game.score = {
    ...(game.score || {}),
    lions: lionsEdit.runs,
    opponent: opponentEdit.runs
  };
  syncScoreBySide(game);
  markSharedGamesDirty(game.id);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    queueCompletedGameSync(game.id, { reason: "box-score-edit" });
  }
  saveStateWithOptions({ liveSyncReason: "box-score-edit" });
  closeBoxScoreEditModal();
  render();
  requestSharedSnapshotSync("box-score-edit");
  requestCompletedGameSyncRetry("box-score-edit");
}

function boxScoreGames() {
  return [...state.games].sort(sortGamesNewestFirst);
}

function updateBoxScoreGameNav(games = boxScoreGames(), gameId = boxScoreGameId) {
  const index = games.findIndex((game) => game.id === gameId);
  const hasOlderGame = index >= 0 && index < games.length - 1;
  const hasNewerGame = index > 0;
  [els.boxScorePrevGameBtn, els.boxScoreMobilePrevGameBtn].filter(Boolean).forEach((button) => {
    button.disabled = !hasOlderGame;
    button.setAttribute("aria-disabled", String(!hasOlderGame));
  });
  [els.boxScoreNextGameBtn, els.boxScoreMobileNextGameBtn].filter(Boolean).forEach((button) => {
    button.disabled = !hasNewerGame;
    button.setAttribute("aria-disabled", String(!hasNewerGame));
  });
}

function navigateBoxScoreGame(direction = "next") {
  const games = boxScoreGames();
  if (!games.length) return;
  const currentIndex = games.findIndex((game) => game.id === boxScoreGameId);
  const index = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = direction === "previous"
    ? Math.min(games.length - 1, index + 1)
    : Math.max(0, index - 1);
  const nextGame = games[nextIndex];
  if (!nextGame || nextGame.id === boxScoreGameId) return;
  boxScoreGameId = nextGame.id;
  renderBoxScore();
}

function renderBoxScore() {
  if (!els.boxScoreSummary) return;
  const games = boxScoreGames();
  const active = activeScoreGame() || games[0] || null;
  if (!active) {
    boxScoreGameId = "";
    setBoxScoreEditButtonsVisible(false);
    els.boxScoreGameSelect.innerHTML = "";
    if (els.boxScoreMobileGameSelect) els.boxScoreMobileGameSelect.innerHTML = "";
    updateBoxScoreGameNav([], "");
    els.boxScoreTitle.textContent = "Game box score";
    if (els.boxScoreMobileTitle) els.boxScoreMobileTitle.textContent = "Game box score";
    els.boxScoreMeta.textContent = "No games saved yet.";
    if (els.boxScoreMobileMetaPrimary) els.boxScoreMobileMetaPrimary.textContent = "No games saved yet.";
    if (els.boxScoreMobileMetaSecondary) els.boxScoreMobileMetaSecondary.textContent = "";
    els.boxScoreSummary.innerHTML = `<p class="player-meta">Box scores appear after a game is created.</p>`;
    if (els.boxScoreStars) els.boxScoreStars.innerHTML = renderBoxScoreStars(null, []);
    els.boxScoreLineHead.innerHTML = "";
    els.boxScoreLineBody.innerHTML = "";
    els.boxScoreTeamTabs.innerHTML = "";
    if (els.boxScoreBattingHead) els.boxScoreBattingHead.innerHTML = renderBoxScoreBattingHeader(boxScoreBattingColumns([]));
    els.boxScoreBattingBody.innerHTML = "";
    if (els.boxScoreBattingFoot) els.boxScoreBattingFoot.innerHTML = "";
    els.boxScorePitchingBody.innerHTML = "";
    return;
  }
  if (!boxScoreGameId || !state.games.some((game) => game.id === boxScoreGameId)) boxScoreGameId = active.id;
  const game = state.games.find((item) => item.id === boxScoreGameId) || active;
  setBoxScoreEditButtonsVisible(isAdminMode());
  const teams = boxScoreTeams(game);
  if (!teams.some((team) => team.key === boxScoreTeam)) boxScoreTeam = "lions";
  const selectedTeam = teams.find((team) => team.key === boxScoreTeam) || teams[0];
  const innings = boxScoreInnings(game);
  const lineScores = teams.map((team) => boxScoreLineForTeam(game, team, innings));

  const boxScoreOptions = games
    .map((item) => `<option value="${item.id}" ${item.id === game.id ? "selected" : ""}>${escapeHtml(item.date || "No date")} ${escapeHtml(gameMatchupLabel(item))}</option>`)
    .join("");
  els.boxScoreGameSelect.innerHTML = boxScoreOptions;
  if (els.boxScoreMobileGameSelect) els.boxScoreMobileGameSelect.innerHTML = boxScoreOptions;
  updateBoxScoreGameNav(games, game.id);
  els.boxScoreTitle.textContent = gameMatchupLabel(game);
  if (els.boxScoreMobileTitle) els.boxScoreMobileTitle.textContent = gameMatchupLabel(game);
  els.boxScoreMeta.textContent = `${game.date || "No date"} | ${gameTeamMeta(game)} | ${gameStatusLabel(game)}`;
  if (els.boxScoreMobileMetaPrimary) {
    els.boxScoreMobileMetaPrimary.textContent = `${formatGameDateWithYear(game.date) || "No date"} | ${gameStatusLabel(game)}`;
  }
  if (els.boxScoreMobileMetaSecondary) {
    const away = teams.find((team) => team.side === "away") || teams[0];
    const home = teams.find((team) => team.side === "home") || teams[1] || teams[0];
    els.boxScoreMobileMetaSecondary.textContent = `Away: ${away?.name || "Away"} | Home: ${home?.name || "Home"}`;
  }
  els.boxScoreSummary.innerHTML = renderBoxScoreSummary(game, teams);
  if (els.boxScoreStars) els.boxScoreStars.innerHTML = renderBoxScoreStars(game, teams);
  els.boxScoreLineHead.innerHTML = `<tr><th>Team</th>${innings.map((inning) => `<th>${inning}</th>`).join("")}<th>R</th><th>H</th><th>E</th></tr>`;
  els.boxScoreLineBody.innerHTML = lineScores.map((line) => renderBoxScoreLineRow(line, innings)).join("");
  els.boxScoreTeamTabs.innerHTML = teams
    .map((team) => `<button type="button" class="${team.key === selectedTeam.key ? "is-active" : ""}" data-box-score-team="${team.key}" role="tab" aria-selected="${team.key === selectedTeam.key ? "true" : "false"}">${escapeHtml(team.name)}</button>`)
    .join("");
  els.boxScoreBattingTitle.textContent = `${selectedTeam.name} Batting`;
  els.boxScorePitchingTitle.textContent = `${selectedTeam.name} Pitching`;
  const battingRows = boxScoreBattingRows(game, selectedTeam, { includeBaseRunning: true });
  const battingColumns = boxScoreBattingColumns(battingRows);
  const pitchingRows = boxScorePitchingRows(game, selectedTeam);
  if (els.boxScoreBattingHead) els.boxScoreBattingHead.innerHTML = renderBoxScoreBattingHeader(battingColumns);
  els.boxScoreBattingBody.innerHTML = battingRows.length
    ? battingRows.map((row) => renderBoxScoreBattingRow(row, battingColumns)).join("")
    : `<tr><td colspan="${battingColumns.length}" class="box-score-empty">No batting events logged for this team.</td></tr>`;
  if (els.boxScoreBattingFoot) {
    els.boxScoreBattingFoot.innerHTML = battingRows.length
      ? renderBoxScoreBattingTotalsRow(battingRows, battingColumns)
      : "";
  }
  els.boxScorePitchingBody.innerHTML = pitchingRows.length
    ? pitchingRows.map(renderBoxScorePitchingRow).join("")
    : `<tr><td colspan="7" class="box-score-empty">No pitching events logged for this team.</td></tr>`;
}

function boxScoreTeams(game) {
  return [
    { key: "lions", name: "Lions", side: lionsSide(game), score: game.score?.lions || 0 },
    { key: "opponent", name: game.opponent || "Opponent", side: opponentSide(game), score: game.score?.opponent || 0 }
  ].sort((a, b) => (a.side === "away" ? 0 : 1) - (b.side === "away" ? 0 : 1));
}

function boxScoreInnings(game) {
  const highestEventInning = Math.max(0, ...(game.events || []).map((event) => Number(event.inning || 0)));
  const highest = Math.max(7, Number(game.inning || 1), highestEventInning);
  return Array.from({ length: highest }, (_, index) => index + 1);
}

function boxScoreBattingEvents(game, team) {
  const scope = team.key === "lions" ? "offense" : "defense";
  const sourceEvents = team.key === "lions" ? offensiveEventsForStatsGame(game) : (game.events || []);
  return sourceEvents.filter((event) => event.scope === scope && eventRules[event.result]?.pa);
}

function boxScoreBaseRunningEvents(game, team) {
  const scope = team.key === "lions" ? "offense" : "defense";
  const sourceEvents = team.key === "lions" ? offensiveEventsForStatsGame(game) : (game.events || []);
  return sourceEvents.filter((event) => event.scope === scope && scorebookBaseRunningResults.has(event.result));
}

function boxScoreFieldingErrorEvents(game, team) {
  const battingScopeAgainstTeam = team.key === "lions" ? "defense" : "offense";
  return (game.events || []).filter((event) => event.scope === battingScopeAgainstTeam && event.errorOnPlay);
}

function boxScoreLineForTeam(game, team, innings) {
  const events = boxScoreBattingEvents(game, team);
  const runsByInning = {};
  innings.forEach((inning) => {
    runsByInning[inning] = events
      .filter((event) => Number(event.inning || 0) === inning)
      .reduce((sum, event) => sum + (event.runs || 0), 0);
  });
  const computedLine = {
    ...team,
    runsByInning,
    runs: team.score,
    hits: events.filter((event) => eventRules[event.result]?.hit).length,
    errors: boxScoreFieldingErrorEvents(game, team).length
  };
  const edit = boxScoreLineEditForTeam(game, team.key);
  if (!edit) return computedLine;
  return {
    ...computedLine,
    ...normalizeBoxScoreLineEdit(edit, innings, computedLine),
    manualBoxScoreLine: true
  };
}

function renderBoxScoreSummary(game, teams) {
  const away = teams.find((team) => team.side === "away") || teams[0];
  const home = teams.find((team) => team.side === "home") || teams[1] || teams[0];
  return `<div class="box-score-summary-grid">
    ${renderBoxScoreTeamSummary(away)}
    <div class="box-score-final">
      <span>${escapeHtml(gameStatusLabel(game))}</span>
      <strong>${away.score} - ${home.score}</strong>
    </div>
    ${renderBoxScoreTeamSummary(home)}
  </div>`;
}

function parseBoxScoreDisplayName(value = "") {
  const text = String(value || "").trim();
  const match = text.match(/^#([^\s]+)\s+(.+)$/);
  return {
    number: match ? match[1] : "",
    name: match ? match[2] : text
  };
}

function boxScoreStarIdentity(team, row = {}) {
  const player = team?.key === "lions" ? state.roster.find((item) => item.id === row.id) : null;
  const parsed = parseBoxScoreDisplayName(row.name);
  return {
    key: `${team?.key || "team"}:${row.id || parsed.name}`,
    teamName: team?.name || "",
    name: player?.name || parsed.name || "Player",
    number: player?.number || parsed.number || "",
    position: row.position || (player ? playerPrimaryPosition(player) : "")
  };
}

function boxScoreHitterStarSummary(row = {}) {
  const parts = [];
  if (row.ab > 0) {
    parts.push(`${row.h || 0}-${row.ab}`);
  } else if (row.h > 0) {
    parts.push(`${row.h} H`);
  }
  if (row.hr) parts.push(row.hr === 1 ? "HR" : `${row.hr} HR`);
  if (row.triples) parts.push(row.triples === 1 ? "3B" : `${row.triples} 3B`);
  if (row.doubles) parts.push(row.doubles === 1 ? "2B" : `${row.doubles} 2B`);
  if (row.rbi) parts.push(`${row.rbi} RBI`);
  if (row.r) parts.push(`${row.r} R`);
  if (row.bb) parts.push(row.bb === 1 ? "BB" : `${row.bb} BB`);
  if (row.hbp) parts.push(row.hbp === 1 ? "HBP" : `${row.hbp} HBP`);
  if (row.sb) parts.push(`${row.sb} SB`);
  return parts.join(", ") || `${row.pa || 0} PA`;
}

function boxScorePitcherStarSummary(row = {}) {
  const erLabel = row.erUnknown ? `${row.r || 0} R` : `${row.er || 0} ER`;
  const extras = [];
  if (row.w) extras.push("W");
  if (row.sv) extras.push(row.sv === 1 ? "SV" : `${row.sv} SV`);
  if (row.qs) extras.push("QS");
  return [
    `${formatInnings(row.outs || 0)} IP`,
    `${row.h || 0} H`,
    erLabel,
    `${row.so || 0} K`,
    ...extras
  ].join(", ");
}

function boxScoreHitterStarScore(row = {}) {
  return ((row.h || 0) * 3)
    + ((row.rbi || 0) * 3)
    + ((row.r || 0) * 2)
    + ((row.bb || 0) * 1)
    + ((row.hbp || 0) * 1)
    + ((row.sb || 0) * 2)
    + ((row.doubles || 0) * 1)
    + ((row.triples || 0) * 2)
    + ((row.hr || 0) * 4)
    - ((row.so || 0) * 0.5);
}

function boxScorePitcherQualityStart(row = {}) {
  return !row.erUnknown && (row.outs || 0) >= 18 && (row.er || 0) <= 3 ? 1 : 0;
}

function boxScorePitcherStarScore(row = {}) {
  const inningsPitched = (row.outs || 0) / 3;
  const earnedRuns = row.erUnknown ? (row.r || 0) : (row.er || 0);
  const qualityStart = row.qs ?? boxScorePitcherQualityStart(row);
  return (inningsPitched * 3)
    + ((row.so || 0) * 1.5)
    + ((row.w || 0) * 4)
    + ((row.sv || 0) * 3)
    + (qualityStart * 3)
    - (earnedRuns * 4)
    - ((row.h || 0) * 0.75)
    - ((row.bb || 0) * 1)
    - ((row.hbp || 0) * 1);
}

function upsertBoxScoreStarCandidate(candidates, identity, score, summary, type) {
  if (!identity?.key || !summary) return;
  const existing = candidates.get(identity.key) || {
    ...identity,
    score: 0,
    summaries: [],
    types: new Set()
  };
  existing.score += score;
  existing.summaries.push({ type, text: summary });
  if (type) existing.types.add(type);
  candidates.set(identity.key, existing);
}

function boxScoreThreeStars(game, teams = []) {
  if (!game) return [];
  const candidates = new Map();
  teams.forEach((team) => {
    boxScoreBattingRows(game, team, { includeBaseRunning: true }).forEach((row) => {
      upsertBoxScoreStarCandidate(candidates, boxScoreStarIdentity(team, row), boxScoreHitterStarScore(row), boxScoreHitterStarSummary(row), "Hitting");
    });
    boxScorePitchingRows(game, team).forEach((row) => {
      row.qs = boxScorePitcherQualityStart(row);
      upsertBoxScoreStarCandidate(candidates, boxScoreStarIdentity(team, row), boxScorePitcherStarScore(row), boxScorePitcherStarSummary(row), "Pitching");
    });
  });
  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, 3)
    .map((star) => ({
      ...star,
      typeLabel: star.types.size > 1 ? "Two-Way" : [...star.types][0],
      summary: star.summaries.length > 1
        ? star.summaries.slice(0, 2).map((item) => `${item.type}: ${item.text}`).join(" | ")
        : star.summaries[0]?.text || ""
    }));
}

function renderBoxScoreStarCard(star, index) {
  const labels = ["First Star", "Second Star", "Third Star"];
  if (!star) {
    return `<article class="box-score-star-card is-empty">
      <div class="box-score-star-rank"><span aria-hidden="true">&#9733;</span><strong>${labels[index]}</strong></div>
      <p>More game statistics needed.</p>
    </article>`;
  }
  const detail = [
    star.number ? `#${star.number}` : "",
    star.position || star.typeLabel,
    star.teamName
  ].filter(Boolean).join(" | ");
  return `<article class="box-score-star-card ${index === 0 ? "is-first" : ""}">
    <div class="box-score-star-rank"><span aria-hidden="true">&#9733;</span><strong>${labels[index]}</strong></div>
    <div class="box-score-star-player">
      <strong>${escapeHtml(star.name)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    <span class="box-score-star-badge">${escapeHtml(star.typeLabel)}</span>
    <p>${escapeHtml(star.summary)}</p>
  </article>`;
}

function renderBoxScoreStars(game, teams = []) {
  const stars = boxScoreThreeStars(game, teams);
  if (!stars.length) {
    return `<div class="mini-head">
      <h3>3 Stars of the Game</h3>
      <span>Top game performances</span>
    </div>
    <p class="box-score-stars-empty">Three Stars will be generated when game statistics are available.</p>`;
  }
  return `<div class="mini-head">
    <h3>3 Stars of the Game</h3>
    <span>Top game performances</span>
  </div>
  <div class="box-score-stars-grid">
    ${[0, 1, 2].map((index) => renderBoxScoreStarCard(stars[index], index)).join("")}
  </div>`;
}

function boxScoreTeamLogo(team) {
  return window.MatchupImages?.getTeamLogo?.(team?.name, team?.key) || "assets/team-logos/lions.png";
}

function renderBoxScoreTeamSummary(team) {
  return `<div class="box-score-team-summary">
    <img class="box-score-team-logo" src="${escapeHtml(boxScoreTeamLogo(team))}" alt="" loading="lazy" decoding="async">
    <strong class="box-score-team-name">${escapeHtml(team.name)}</strong>
    <span>${team.side === "away" ? "Away" : "Home"}</span>
  </div>`;
}

function renderBoxScoreLineRow(line, innings) {
  return `<tr>
    <th>${escapeHtml(line.name)}</th>
    ${innings.map((inning) => `<td>${line.runsByInning[inning] || 0}</td>`).join("")}
    <td><strong>${line.runs}</strong></td>
    <td>${line.hits}</td>
    <td>${line.errors}</td>
  </tr>`;
}

function boxScoreBattingRows(game, team, options = {}) {
  const includeBaseRunning = Boolean(options.includeBaseRunning);
  const rows = new Map();
  const ensureRow = (id, name, position = "") => {
    if (!rows.has(id)) {
      rows.set(id, {
        id,
        name,
        position,
        pa: 0,
        ab: 0,
        r: 0,
        h: 0,
        rbi: 0,
        bb: 0,
        hbp: 0,
        so: 0,
        sb: 0,
        cs: 0,
        sac: 0,
        doubles: 0,
        triples: 0,
        hr: 0
      });
    }
    return rows.get(id);
  };
  if (team.key === "lions") {
    gameLineupEntries(game).forEach((entry) => {
      const player = state.roster.find((item) => item.id === entry.playerId);
      if (player) ensureRow(player.id, `#${player.number} ${player.name}`, entry.role || "");
    });
  } else {
    opponentLineupEntriesForGame(game).forEach((entry, index) => {
      const label = opponentBatterLabel(entry, index);
      ensureRow(`opp:${label}`, label, "");
    });
  }
  boxScoreBattingEvents(game, team).forEach((event) => {
    const rule = eventRules[event.result] || {};
    const id = team.key === "lions" ? event.playerId : event.playerId || `opp:${event.opponentBatter || "Opponent batter"}`;
    const fallbackName = team.key === "lions"
      ? state.roster.find((player) => player.id === event.playerId)?.name || "Unknown Lion"
      : event.opponentBatter || String(event.playerId || "Opponent batter").replace(/^opp:/, "");
    const row = ensureRow(id, fallbackName, "");
    row.pa += rule.pa ? 1 : 0;
    if (rule.ab) row.ab += 1;
    if (rule.hit) row.h += 1;
    if (rule.bb) row.bb += 1;
    if (rule.hbp) row.hbp += 1;
    if (rule.k) row.so += 1;
    if (rule.sb) row.sb += 1;
    if (rule.sac) row.sac += 1;
    if (event.result === "2B") row.doubles += 1;
    if (event.result === "3B") row.triples += 1;
    if (event.result === "HR") row.hr += 1;
    row.rbi += event.rbi || 0;
    row.r += boxScoreRunsScoredByBatter(event, id);
  });
  if (includeBaseRunning) {
    boxScoreBaseRunningEvents(game, team).forEach((event) => {
      if (!["SB", "CS"].includes(event.result)) return;
      const id = team.key === "lions" ? event.playerId : event.playerId || `opp:${event.opponentBatter || "Opponent runner"}`;
      const fallbackName = team.key === "lions"
        ? state.roster.find((player) => player.id === event.playerId)?.name || "Unknown Lion"
        : event.opponentBatter || String(event.playerId || "Opponent runner").replace(/^opp:/, "");
      const row = ensureRow(id, fallbackName, "");
      if (event.result === "SB") row.sb += 1;
      if (event.result === "CS") row.cs += 1;
    });
  }
  if (team.key === "lions") {
    Object.entries(hittingStatEditMap(game)).forEach(([playerId, edit]) => {
      const normalized = normalizeHittingStatEdit(edit, playerId, game);
      const stats = normalized.stats;
      const player = state.roster.find((item) => item.id === playerId);
      const lineupEntry = gameLineupEntries(game).find((entry) => entry.playerId === playerId);
      const name = player ? `#${player.number} ${player.name}` : "Unknown Lion";
      const position = normalized.position || lineupEntry?.role || (player ? playerPrimaryPosition(player) : "");
      const row = ensureRow(playerId, name, position);
      row.position = position;
      row.pa = stats.ab + stats.bb + stats.hbp + stats.sac;
      row.ab = stats.ab;
      row.r = stats.runs;
      row.h = stats.h;
      row.rbi = stats.rbi;
      row.bb = stats.bb;
      row.hbp = stats.hbp;
      row.so = stats.k;
      row.sb = stats.sb;
      row.cs = stats.cs;
      row.sac = stats.sac;
      row.doubles = stats.doubles;
      row.triples = stats.triples;
      row.hr = stats.hr;
      row.manualStatEdit = true;
    });
  }
  return [...rows.values()].filter((row) =>
    row.pa
      || row.ab
      || row.r
      || row.h
      || row.rbi
      || row.bb
      || row.hbp
      || row.so
      || row.sac
      || row.doubles
      || row.triples
      || row.hr
      || (includeBaseRunning && (row.sb || row.cs))
  );
}

function boxScoreRunsScoredByBatter(event, batterId) {
  const scoredOnAdvancement = (event.runnerAdvancements || [])
    .filter((advancement) => advancement.to === "home" && !advancement.out && !advancement.remove)
    .filter((advancement) => advancement.runnerId === batterId)
    .length;
  if (scoredOnAdvancement) return scoredOnAdvancement;
  return event.result === "HR" ? 1 : 0;
}

function boxScoreBattingTotalBases(row = {}) {
  const doubles = Number(row.doubles || 0);
  const triples = Number(row.triples || 0);
  const homers = Number(row.hr || 0);
  const singles = Math.max(0, Number(row.h || 0) - doubles - triples - homers);
  return singles + (doubles * 2) + (triples * 3) + (homers * 4);
}

function boxScoreBattingRates(row = {}) {
  const avg = divide(row.h || 0, row.ab || 0);
  const obp = divide((row.h || 0) + (row.bb || 0) + (row.hbp || 0), (row.ab || 0) + (row.bb || 0) + (row.hbp || 0) + (row.sac || 0));
  const slg = divide(boxScoreBattingTotalBases(row), row.ab || 0);
  return {
    avg,
    obp,
    slg,
    ops: obp + slg
  };
}

function boxScoreBattingTotals(rows = []) {
  return rows.reduce((total, row) => {
    ["pa", "ab", "r", "h", "rbi", "bb", "hbp", "so", "sb", "cs", "sac", "doubles", "triples", "hr"].forEach((key) => {
      total[key] += Number(row[key] || 0);
    });
    return total;
  }, {
    name: "Totals",
    position: "",
    pa: 0,
    ab: 0,
    r: 0,
    h: 0,
    rbi: 0,
    bb: 0,
    hbp: 0,
    so: 0,
    sb: 0,
    cs: 0,
    sac: 0,
    doubles: 0,
    triples: 0,
    hr: 0
  });
}

function boxScoreBattingColumns(rows = []) {
  const hasStat = (key) => rows.some((row) => Number(row[key] || 0) > 0);
  return [
    { key: "player", label: "Player", align: "left" },
    { key: "pa", label: "PA" },
    { key: "ab", label: "AB" },
    { key: "r", label: "R" },
    { key: "h", label: "H" },
    ...(hasStat("doubles") ? [{ key: "doubles", label: "2B" }] : []),
    ...(hasStat("triples") ? [{ key: "triples", label: "3B" }] : []),
    ...(hasStat("hr") ? [{ key: "hr", label: "HR" }] : []),
    { key: "rbi", label: "RBI" },
    { key: "bb", label: "BB" },
    { key: "so", label: "SO" },
    ...(hasStat("sac") ? [{ key: "sac", label: "SACF" }] : []),
    ...(hasStat("sb") ? [{ key: "sb", label: "SB" }] : []),
    ...(hasStat("cs") ? [{ key: "cs", label: "CS" }] : []),
    { key: "avg", label: "AVG", rate: true },
    { key: "obp", label: "OBP", rate: true },
    { key: "slg", label: "SLG", rate: true },
    { key: "ops", label: "OPS", rate: true }
  ];
}

function renderBoxScoreBattingHeader(columns = boxScoreBattingColumns([])) {
  return `<tr>
    ${columns.map((column) =>
      `<th scope="col" class="${column.align === "left" ? "box-score-player-col" : column.rate ? "box-score-rate-col" : ""}">${escapeHtml(column.label)}</th>`
    ).join("")}
  </tr>`;
}

function boxScoreBattingCellValue(row, column) {
  if (column.key === "player") {
    return `${escapeHtml(row.name)}${row.position ? ` <span>${escapeHtml(row.position)}</span>` : ""}`;
  }
  if (column.rate) return formatRate(boxScoreBattingRates(row)[column.key]);
  return String(Number(row[column.key] || 0));
}

function renderBoxScoreBattingRow(row, columns = boxScoreBattingColumns([row])) {
  return `<tr>
    ${columns.map((column) => `<td data-label="${escapeHtml(column.label)}" class="${column.rate ? "box-score-rate-cell" : ""}">${boxScoreBattingCellValue(row, column)}</td>`).join("")}
  </tr>`;
}

function renderBoxScoreBattingTotalsRow(rows = [], columns = boxScoreBattingColumns(rows)) {
  const totals = boxScoreBattingTotals(rows);
  return `<tr class="box-score-total-row">
    ${columns.map((column) => {
      if (column.key === "player") return `<th scope="row">${escapeHtml(totals.name)}</th>`;
      return `<td class="${column.rate ? "box-score-rate-cell" : ""}">${boxScoreBattingCellValue(totals, column)}</td>`;
    }).join("")}
  </tr>`;
}

function boxScorePitchingRows(game, team) {
  const events = team.key === "lions"
    ? (game.events || []).filter((event) => event.scope === "defense" && eventRules[event.result]?.pa)
    : (game.events || []).filter((event) => event.scope === "offense" && eventRules[event.result]?.pa);
  const lionsEarnedRunMap = team.key === "lions" ? lionsEarnedRunsByEvent(game) : null;
  const rows = new Map();
  const ensureRow = (id, name) => {
    if (!rows.has(id)) rows.set(id, { id, name, pa: 0, outs: 0, h: 0, r: 0, er: 0, erUnknown: false, bb: 0, hbp: 0, so: 0, w: 0, sv: 0, qs: 0 });
    return rows.get(id);
  };
  events.forEach((event) => {
    const id = team.key === "lions" ? event.pitcherId || "lions-pitching" : "opponent-pitching";
    const player = team.key === "lions" ? state.roster.find((item) => item.id === id) : null;
    const row = ensureRow(id, player ? `#${player.number} ${player.name}` : `${team.name} pitching`);
    const rule = eventRules[event.result] || {};
    row.pa += rule.pa ? 1 : 0;
    row.outs += boxScoreOutsRecorded(event, rule);
    row.h += rule.hit ? 1 : 0;
    row.r += event.runs || 0;
    if (team.key === "lions") {
      row.er += lionsEarnedRunMap?.get(event.id) || 0;
    } else if (event.errorOnPlay) {
      row.erUnknown = true;
    } else {
      row.er += event.runs || 0;
    }
    row.bb += event.result === "BB" ? 1 : 0;
    row.hbp += event.result === "HBP" ? 1 : 0;
    row.so += event.result === "K" ? 1 : 0;
  });
  if (team.key === "lions") {
    Object.entries(pitchingStatEditMap(game)).forEach(([playerId, edit]) => {
      const normalized = normalizePitchingStatEdit(edit, playerId, game);
      const stats = normalized.stats;
      const player = state.roster.find((item) => item.id === playerId);
      const row = ensureRow(playerId, player ? `#${player.number} ${player.name}` : "Lions pitching");
      row.pa = stats.batters;
      row.outs = stats.outs;
      row.h = stats.h;
      row.r = stats.runs;
      row.er = stats.earnedRuns;
      row.erUnknown = false;
      row.bb = stats.bb;
      row.hbp = stats.hbp;
      row.so = stats.k;
      row.w = stats.decision === "win" ? 1 : 0;
      row.sv = stats.sv;
      row.manualStatEdit = true;
    });
    if (gameIsFinal(game)) {
      const decision = lionsPitchingDecision(game);
      rows.forEach((row, playerId) => {
        if (hasPitchingStatEdit(game, playerId)) return;
        row.w = decision.winPitcherId === playerId ? 1 : 0;
      });
    }
  }
  rows.forEach((row) => {
    row.qs = boxScorePitcherQualityStart(row);
  });
  return [...rows.values()].filter((row) => row.pa || row.outs || row.h || row.r || row.er || row.bb || row.hbp || row.so || row.w || row.sv);
}

function boxScoreOutsRecorded(event, rule = eventRules[event.result] || {}) {
  const delta = Math.max(0, (event.outsAfter ?? event.outsBefore ?? 0) - (event.outsBefore ?? 0));
  if (delta) return delta;
  return event.outsRecorded ?? (rule.out ? 1 : 0);
}

function renderBoxScorePitchingRow(row) {
  return `<tr>
    <td data-label="Pitcher">${escapeHtml(row.name)}</td>
    <td data-label="IP">${formatInnings(row.outs)}</td>
    <td data-label="H">${row.h}</td>
    <td data-label="R">${row.r}</td>
    <td data-label="ER">${row.erUnknown ? "--" : row.er}</td>
    <td data-label="BB">${row.bb}</td>
    <td data-label="SO">${row.so}</td>
  </tr>`;
}

function teamAbbrev(name = "") {
  const words = String(name || "Team").split(/\s+/).filter(Boolean);
  const initials = words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
  return initials || String(name || "TM").slice(0, 3).toUpperCase();
}

function currentLeagueSeason() {
  return new Date().getFullYear();
}

function normalizeLeagueWinPct(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "";
  if (text === "1" || text === "1.000") return "1.000";
  if (/^0?\.\d{3}$/.test(text)) return text.replace(/^0/, "");
  return text;
}

function normalizeLeaguePointsLabel(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function normalizeLeagueStandingRow(row = {}, index = 0) {
  const teamName = String(row.teamName || row.team_name || row.name || "").trim();
  if (!teamName) return null;
  const sourceUrl = row.sourceUrl || row.source_url || PITTSBURGH_NABA_STANDINGS_URL;
  const sourceLabel = row.sourceLabel || row.source_label || "Pittsburgh NABA AA standings";
  const syncedAt = row.syncedAt || row.synced_at || "";
  return {
    id: row.id || `${currentLeagueSeason()}-aa-${scoutingTeamId(teamName)}`,
    rank: Number(row.rank) || index + 1,
    teamName,
    teamCode: row.teamCode || row.team_code || teamAbbrev(teamName),
    record: row.record || "0-0",
    points: Number(row.points) || 0,
    pointsLabel: normalizeLeaguePointsLabel(row.pointsLabel ?? row.points_label ?? row.points),
    winPct: normalizeLeagueWinPct(row.winPct || row.win_pct || ""),
    gb: String(row.gb || row.games_back || "-"),
    rf: Number(row.rf ?? row.runs_for) || 0,
    ra: Number(row.ra ?? row.runs_against) || 0,
    last10: row.last10 || row.last_ten || "--",
    streak: row.streak || "--",
    sourceUrl,
    sourceLabel,
    syncedAt
  };
}

function formatStandingsUpdatedLabel(value) {
  if (!value) return "Waiting for standings cache.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `Updated ${date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function setLeagueStandingsCache(rows = [], meta = {}) {
  const normalized = rows
    .map((row, index) => normalizeLeagueStandingRow(row, index))
    .filter(Boolean);
  if (!normalized.length) return;
  leagueStandingsRows = normalized;
  leagueStandingsUpdatedLabel = formatStandingsUpdatedLabel(meta.syncedAt || normalized[0]?.syncedAt);
  leagueStandingsSourceLabel = meta.sourceLabel || normalized[0]?.sourceLabel || "Pittsburgh NABA AA standings";
  leagueStandingsSourceUrl = meta.sourceUrl || normalized[0]?.sourceUrl || PITTSBURGH_NABA_STANDINGS_URL;
}

function supabaseRowsFromLeagueRows(rows = []) {
  return rows.map((row) => ({
    team_name: row.teamName,
    team_code: row.teamCode,
    record: row.record,
    points: row.points,
    points_label: row.pointsLabel,
    win_pct: row.winPct,
    games_back: row.gb,
    runs_for: row.rf,
    runs_against: row.ra,
    last_ten: row.last10,
    streak: row.streak,
    source_url: row.sourceUrl,
    source_label: row.sourceLabel,
    synced_at: row.syncedAt
  }));
}

function mergeSupabaseLeagueStandings(rows = [], currentData) {
  const parsed = deepClone(currentData || AA_SCOUTING_SNAPSHOT);
  if (rows.length) {
    parsed.sourceUrl = PITTSBURGH_NABA_STANDINGS_URL;
    parsed.sourceLabel = "Supabase AA standings cache";
    parsed.updatedLabel = "Supabase standings cache";
  }
  rows.forEach((row, index) => {
    const normalized = normalizeLeagueStandingRow(row, index);
    const teamName = normalized?.teamName || "";
    if (!teamName) return;
    const standing = {
      name: teamName,
      record: normalized.record || "--",
      points: normalized.points,
      winPct: normalized.winPct || "--",
      gb: normalized.gb || "-",
      rf: normalized.rf,
      ra: normalized.ra,
      last10: normalized.last10 || "--",
      streak: normalized.streak || "--"
    };
    const team = parsed.teams.find((item) => normalizeScoutName(item.name) === normalizeScoutName(teamName));
    if (team) {
      Object.assign(team, standing);
      if (!team.code && normalized.teamCode) team.code = normalized.teamCode;
      if (!team.url && normalized.sourceUrl) team.url = normalized.sourceUrl;
      return;
    }
    parsed.teams.push({
      id: scoutingTeamId(teamName),
      code: normalized.teamCode || teamAbbrev(teamName),
      url: normalized.sourceUrl || PITTSBURGH_NABA_STANDINGS_URL,
      hitters: [],
      pitchers: [],
      ...standing
    });
  });
  parsed.teams = parsed.teams
    .slice()
    .sort((a, b) => (Number(b?.points) || 0) - (Number(a?.points) || 0) || String(a?.name || "").localeCompare(String(b?.name || "")));
  return parsed;
}

function initializeScoutingReport() {
  scoutingData = deepClone(AA_SCOUTING_SNAPSHOT);
  selectedScoutingTeamId = scoutingData.teams[0]?.id || "";
  scoutingRefreshState = "snapshot";
  scoutingStatusMessage = "Using Pittsburgh NABA AA snapshot.";
  setTimeout(() => refreshScoutingData({ silent: true }), 0);
}

async function fetchStaticLeagueStandingsCache() {
  const scriptCache = window.ScorebookLeagueStandingsCache;
  if (Array.isArray(scriptCache?.rows) && scriptCache.rows.length) {
    return scriptCache;
  }
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(`${LEAGUE_STANDINGS_CACHE_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload?.rows) || !payload.rows.length) return null;
    return payload;
  } catch (error) {
    console.warn("Unable to load static AA standings cache.", error);
    return null;
  }
}

function leagueRefreshUrl(url) {
  try {
    const requestUrl = new URL(url, window.location.href);
    requestUrl.searchParams.set("_scorebookRefresh", String(Date.now()));
    return requestUrl.toString();
  } catch {
    return url;
  }
}

async function refreshScoutingData(options = {}) {
  if (!scoutingData) scoutingData = deepClone(AA_SCOUTING_SNAPSHOT);
  let supabaseStandingsLoaded = false;
  if (supabaseStorage?.isReady?.() && supabaseStorage?.fetchLeagueStandings) {
    try {
      const { data, error } = await supabaseStorage.fetchLeagueStandings("AA", currentLeagueSeason());
      if (!error && Array.isArray(data) && data.length) {
        setLeagueStandingsCache(data, {
          sourceLabel: "Supabase AA standings cache",
          sourceUrl: PITTSBURGH_NABA_STANDINGS_URL,
          syncedAt: data[0]?.synced_at
        });
        scoutingData = mergeSupabaseLeagueStandings(data, scoutingData);
        supabaseStandingsLoaded = true;
      }
    } catch (error) {
      console.warn("Unable to load cached AA standings from Supabase.", error);
    }
  }
  const staticStandingsCache = await fetchStaticLeagueStandingsCache();
  if (staticStandingsCache?.rows?.length) {
    setLeagueStandingsCache(staticStandingsCache.rows, staticStandingsCache);
    scoutingData = mergeSupabaseLeagueStandings(supabaseRowsFromLeagueRows(leagueStandingsRows), scoutingData);
    supabaseStandingsLoaded = true;
  }
  const selectedTeam = getSelectedScoutingTeam();
  const urls = [PITTSBURGH_NABA_STANDINGS_URL, PITTSBURGH_NABA_URL, teamStatsPageUrl(selectedTeam)]
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index);

  if (!urls.length || typeof fetch !== "function") {
    scoutingRefreshState = "snapshot";
    scoutingStatusMessage = "Using Pittsburgh NABA AA snapshot.";
    renderScoutingReport();
    return;
  }

  if (!options.silent) {
    scoutingStatusMessage = "Checking Pittsburgh NABA for the latest AA data...";
    els.refreshScoutingBtn.disabled = true;
    if (els.refreshLeagueStandingsBtn) els.refreshLeagueStandingsBtn.disabled = true;
    renderScoutingReport();
    renderLeagueStandings();
  }

  let touchedLiveData = false;
  let fetchFailed = false;
  for (const url of urls) {
    try {
      const response = await fetch(leagueRefreshUrl(url), { cache: "no-store" });
      if (!response.ok) throw new Error(`Pittsburgh NABA returned ${response.status}`);
      const html = await response.text();
      if (url === PITTSBURGH_NABA_STANDINGS_URL || url === PITTSBURGH_NABA_URL) {
        const parsedLeague = parsePittsburghNabaScouting(html, scoutingData);
        if (parsedLeague.latestStandings?.length && (options.force || !leagueStandingsRows.length)) {
          const syncedAt = new Date().toISOString();
          setLeagueStandingsCache(parsedLeague.latestStandings, {
            sourceLabel: "Live Pittsburgh NABA refresh",
            sourceUrl: PITTSBURGH_NABA_STANDINGS_URL,
            syncedAt
          });
        }
        touchedLiveData = touchedLiveData || Boolean(parsedLeague.liveDataFound);
        delete parsedLeague.liveDataFound;
        delete parsedLeague.latestStandings;
        scoutingData = parsedLeague;
      } else {
        const parsedTeam = parseTeamPageScouting(html);
        if (parsedTeam.hitters.length || parsedTeam.pitchers.length) {
          mergeScoutingTeamLeaders(selectedTeam.id, parsedTeam);
          touchedLiveData = true;
        }
      }
    } catch (error) {
      fetchFailed = true;
    }
  }
  scoutingRefreshState = touchedLiveData ? "live" : "snapshot";
  scoutingStatusMessage = touchedLiveData
    ? `Updated from Pittsburgh NABA for ${selectedTeam?.name || "AA opponents"}.`
    : supabaseStandingsLoaded
      ? "Using Supabase AA standings cache. League-site live refresh is blocked from this browser."
      : "Using Pittsburgh NABA AA snapshot. Live refresh may be blocked by the league site from this browser.";
  if (!fetchFailed && !touchedLiveData && !supabaseStandingsLoaded) scoutingStatusMessage = "Using Pittsburgh NABA AA snapshot.";
  els.refreshScoutingBtn.disabled = false;
  if (els.refreshLeagueStandingsBtn) els.refreshLeagueStandingsBtn.disabled = false;
  renderScoutingReport();
  renderLeagueStandings();
  renderHome();
}
function parsePittsburghNabaScouting(html, currentData) {
  const parsed = deepClone(currentData || AA_SCOUTING_SNAPSHOT);
  const text = visibleTextFromHtml(html);
  const standings = parseAaStandingsFromHtml(html) || parseAaStandings(text);
  standings.forEach((standing) => {
    const team = parsed.teams.find((item) => normalizeScoutName(item.name) === normalizeScoutName(standing.name));
    if (team) {
      Object.assign(team, standing);
    } else {
      parsed.teams.push({
        id: scoutingTeamId(standing.name),
        code: teamAbbrev(standing.name),
        url: PITTSBURGH_NABA_URL,
        hitters: [],
        pitchers: [],
        ...standing
      });
    }
  });
  const leagueLeaders = parseLeagueAaLeaders(text);
  if (leagueLeaders.hitters.length) parsed.leagueLeaders.hitters = leagueLeaders.hitters;
  if (leagueLeaders.pitchers.length) parsed.leagueLeaders.pitchers = leagueLeaders.pitchers;
  parsed.updatedLabel = "Live Pittsburgh NABA refresh";
  parsed.liveDataFound = Boolean(standings.length || leagueLeaders.hitters.length || leagueLeaders.pitchers.length);
  parsed.latestStandings = standings;
  return parsed;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanStandingsCell(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAaStandingsFromHtml(html) {
  const tableMatch = String(html || "").match(/<table\b[^>]*id=["']standingsTable["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch?.[1]) return null;
  const rowMatches = [...tableMatch[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)];
  const standingsRows = [];
  let activeDivision = "";
  rowMatches.forEach((match) => {
    const rowAttrs = match[1] || "";
    const rowHtml = match[2] || "";
    if (/standDiv0/i.test(rowAttrs)) {
      activeDivision = cleanStandingsCell(rowHtml).toUpperCase();
      return;
    }
    if (activeDivision !== "AA" || !/standTeam/i.test(rowAttrs)) return;
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => cleanStandingsCell(cell[1]));
    if (cells.length < 10) return;
    standingsRows.push({
      name: cells[0],
      record: cells[1] || "0-0",
      points: cells[2] && cells[2] !== "-" ? Number(cells[2]) || 0 : 0,
      pointsLabel: cells[2] || "-",
      winPct: cells[3] || "--",
      gb: cells[4] || "-",
      rf: Number(cells[7]) || 0,
      ra: Number(cells[8]) || 0,
      last10: cells[9] || "--",
      streak: cells[10] || "--"
    });
  });
  return standingsRows.length ? standingsRows : null;
}

function parseAaStandings(text) {
  const lines = scoutingLines(text);
  const divisionIndex = lines.findIndex((line) => /^AA$/i.test(line));
  if (divisionIndex >= 0) {
    const headerIndex = lines.findIndex((line, index) => index > divisionIndex && /^Team\s*\|/i.test(line));
    const standingsRows = [];
    const compactRowPattern = /^(?<name>.+?)(?<record>\d+-\d+(?:-\d+)?)\s+(?<points>\d+)\s+(?<winPct>1\.000|\.\d{3})\s+(?<gb>-|\d+(?:\.\d+)?)\s+(?<home>\d+-\d+(?:-\d+)?)\s+(?<away>\d+-\d+(?:-\d+)?)\s+(?<rf>\d+)\s+(?<ra>\d+)\s+(?<last10>\d+-\d+(?:-\d+)?)\s+(?<streak>(?:Won|Lost|Tied)\s+\d+)$/i;
    for (let index = headerIndex + 1; headerIndex > -1 && index < lines.length; index += 1) {
      const line = lines[index];
      if (/^(AAA|AA|A)$/i.test(line)) break;
      if (/^(PRINT|Image:|Previous|Next|Number of Visitors|\d{4}\s*-)/i.test(line)) break;
      const cells = line.includes("|")
        ? line.split("|").map((cell) => cell.trim()).filter(Boolean)
        : [];
      if (cells.length >= 11 && !/^Team$/i.test(cells[0])) {
        standingsRows.push({
          name: cells[0],
          record: cells[1],
          points: Number(cells[2]),
          winPct: cells[3],
          gb: cells[4],
          rf: Number(cells[7]),
          ra: Number(cells[8]),
          last10: cells[9],
          streak: cells[10]
        });
        continue;
      }
      const match = line.match(compactRowPattern);
      if (!match?.groups) continue;
      standingsRows.push({
        name: match.groups.name.trim(),
        record: match.groups.record,
        points: Number(match.groups.points),
        winPct: match.groups.winPct,
        gb: match.groups.gb,
        rf: Number(match.groups.rf),
        ra: Number(match.groups.ra),
        last10: match.groups.last10,
        streak: match.groups.streak
      });
    }
    if (standingsRows.length) return standingsRows;
  }

  const normalizedText = String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const allTokens = normalizedText
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
  const aaHeader = ["AA", "Team", "Record", "Pts", "Win %", "GB", "Home", "Away", "RF", "RA", "Last 10", "Streak"];
  const aaTokenIndex = allTokens.findIndex((token, index) => (
    token === "AA" && aaHeader.every((expected, offset) => String(allTokens[index + offset] || "").toLowerCase() === expected.toLowerCase())
  ));
  if (aaTokenIndex >= 0) {
    const standingsRows = [];
    for (let index = aaTokenIndex + aaHeader.length; index <= allTokens.length - 11; index += 11) {
      const maybeDivision = String(allTokens[index] || "").toUpperCase();
      if (maybeDivision === "A" || maybeDivision === "AAA" || maybeDivision === "PRINT") break;
      const record = allTokens[index + 1];
      const points = allTokens[index + 2];
      const winPct = allTokens[index + 3];
      if (!/^\d+-\d+(?:-\d+)?$/.test(record || "") || !/^\d+$/.test(points || "") || !/^(?:1\.000|\.\d{3})$/.test(winPct || "")) {
        continue;
      }
      standingsRows.push({
        name: allTokens[index],
        record,
        points: Number(points),
        winPct,
        gb: allTokens[index + 4],
        rf: Number(allTokens[index + 7]),
        ra: Number(allTokens[index + 8]),
        last10: allTokens[index + 9],
        streak: allTokens[index + 10]
      });
    }
    if (standingsRows.length) return standingsRows;
  }
  const aaPipeBlockMatch = normalizedText.match(/\bAA\s*\|\s*Team\s*\|\s*Record\s*\|\s*Pts\s*\|\s*Win\s*%\s*\|\s*GB\s*\|\s*Home\s*\|\s*Away\s*\|\s*RF\s*\|\s*RA\s*\|\s*Last\s*10\s*\|\s*Streak\s*\|\s*([\s\S]*?)(?:\|\s*A\s*\|\s*Team\s*\|\s*Record\s*\|\s*Pts\s*\|\s*Win\s*%|\|\s*PRINT\b|$)/i);
  if (aaPipeBlockMatch?.[1]) {
    const tokens = aaPipeBlockMatch[1]
      .split("|")
      .map((token) => token.trim())
      .filter(Boolean);
    const standingsRows = [];
    for (let index = 0; index <= tokens.length - 11; index += 11) {
      const record = tokens[index + 1];
      const points = tokens[index + 2];
      const winPct = tokens[index + 3];
      if (!/^\d+-\d+(?:-\d+)?$/.test(record || "") || !/^\d+$/.test(points || "") || !/^(?:1\.000|\.\d{3})$/.test(winPct || "")) {
        continue;
      }
      standingsRows.push({
        name: tokens[index],
        record,
        points: Number(points),
        winPct,
        gb: tokens[index + 4],
        rf: Number(tokens[index + 7]),
        ra: Number(tokens[index + 8]),
        last10: tokens[index + 9],
        streak: tokens[index + 10]
      });
    }
    if (standingsRows.length) return standingsRows;
  }
  const aaBlockMatch = normalizedText.match(/\bAA\s+Team\s+Record\s+Pts\s+Win\s+%GB\s+Home\s+Away\s+RF\s+RA\s+Last\s+10\s+Streak\s+([\s\S]*?)(?:\s+\bA\s+Team\s+Record\s+Pts\s+Win\s+%GB|\s+PRINT\b|$)/i);
  if (aaBlockMatch?.[1]) {
    const compactRowPattern = /(?<name>[A-Za-z0-9&'’:\-. ]+?)(?<record>\d+-\d+(?:-\d+)?)\s+(?<points>\d+)\s+(?<winPct>1\.000|\.\d{3})\s+(?<gb>-|\d+(?:\.\d+)?)\s+(?<home>\d+-\d+(?:-\d+)?)\s+(?<away>\d+-\d+(?:-\d+)?)\s+(?<rf>\d+)\s+(?<ra>\d+)\s+(?<last10>\d+-\d+(?:-\d+)?)\s+(?<streak>(?:Won|Lost|Tied)\s+\d+)/gi;
    const standingsRows = [];
    for (const match of aaBlockMatch[1].matchAll(compactRowPattern)) {
      if (!match.groups) continue;
      standingsRows.push({
        name: match.groups.name.trim(),
        record: match.groups.record,
        points: Number(match.groups.points),
        winPct: match.groups.winPct,
        gb: match.groups.gb,
        rf: Number(match.groups.rf),
        ra: Number(match.groups.ra),
        last10: match.groups.last10,
        streak: match.groups.streak
      });
    }
    if (standingsRows.length) return standingsRows;
  }

  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  return AA_SCOUTING_SNAPSHOT.teams.map((team) => {
    const escapedName = team.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`${escapedName}\\s+\\|\\s+([\\d-]+)\\s+\\|\\s+(\\d+)\\s+\\|\\s+([.\\d]+)\\s+\\|\\s+([^|]+?)\\s+\\|\\s+[^|]+\\|\\s+[^|]+\\|\\s+(\\d+)\\s+\\|\\s+(\\d+)\\s+\\|\\s+([^|]+?)\\s+\\|\\s+([^|]+?)(?=\\s+[A-Z][A-Za-z]|\\s+A\\s+Team|$)`, "i");
    const match = normalized.match(pattern);
    if (!match) return null;
    return {
      name: team.name,
      record: match[1],
      points: Number(match[2]),
      winPct: match[3],
      gb: match[4].trim(),
      rf: Number(match[5]),
      ra: Number(match[6]),
      last10: match[7].trim(),
      streak: match[8].trim()
    };
  }).filter(Boolean);
}

function parseLeagueAaLeaders(text) {
  const aaMatch = text.match(/\bAA\b([\s\S]*?)(?:\bA\b\s+Batting|2023|Number of Visitors|$)/i);
  if (!aaMatch) return { hitters: [], pitchers: [] };
  const block = aaMatch[1];
  const hitters = parseScoutingHitterRows(linesBetween(block, "Batting", "Pitching"), "team");
  const pitchers = parseScoutingPitcherRows(linesBetween(block, "Pitching", ""));
  return { hitters, pitchers };
}

function parseTeamPageScouting(html) {
  const text = visibleTextFromHtml(html);
  const leadersBlock = text.match(/Stat Leaders([\s\S]*?)(?:Team Schedule|Schedule|Standings|Last Game|Number of Visitors|Admin Log In|$)/i);
  const block = leadersBlock ? leadersBlock[1] : text;
  return {
    hitters: parseScoutingHitterRows(linesBetween(block, "Batting", "Pitching"), "position"),
    pitchers: parseScoutingPitcherRows(linesBetween(block, "Pitching", ""))
  };
}

function visibleTextFromHtml(html) {
  if (typeof DOMParser === "function") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body?.innerText || doc.body?.textContent || html).replace(/\u00a0/g, " ");
  }
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\u00a0/g, " ");
}

function linesBetween(text, startLabel, endLabel) {
  const lines = scoutingLines(text);
  const cleanLine = (line) => line.replace(/^\*\s*/, "").toLowerCase();
  const start = startLabel ? lines.findIndex((line) => cleanLine(line).startsWith(startLabel.toLowerCase())) : 0;
  if (start < 0) return [];
  const end = endLabel
    ? lines.findIndex((line, index) => index > start && cleanLine(line).startsWith(endLabel.toLowerCase()))
    : lines.length;
  return lines.slice(start + 1, end > start ? end : lines.length);
}

function scoutingLines(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " | ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseScoutingHitterRows(lines, secondaryKey) {
  const pipeRows = lines
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length >= 4 && /^\d+$/.test(cells[2]) && /^\.\d{3}$/.test(cells[3]))
    .map((cells) => ({
      name: cells[0],
      [secondaryKey === "team" ? "team" : "pos"]: cells[1],
      ab: Number(cells[2]),
      avg: cells[3]
    }));
  if (pipeRows.length) return pipeRows.slice(0, 7);

  const tokens = lines.filter((line) => !/^(pos|team|ab|avg|batting|\*)$/i.test(line));
  const rows = [];
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (/^\d+$/.test(tokens[index + 2]) && /^\.\d{3}$/.test(tokens[index + 3])) {
      rows.push({
        name: tokens[index],
        [secondaryKey === "team" ? "team" : "pos"]: tokens[index + 1],
        ab: Number(tokens[index + 2]),
        avg: tokens[index + 3]
      });
      index += 3;
    }
  }
  return rows.slice(0, 7);
}

function parseScoutingPitcherRows(lines) {
  const pipeRows = lines
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => (
      cells.length >= 5 && /^\d+$/.test(cells[1]) && /^\d+$/.test(cells[2]) && /^\d+$/.test(cells[3]) && eraLike(cells[4])
    ) || (
      cells.length >= 4 && /^[A-Z]{2,4}$/.test(cells[1]) && /^\d+$/.test(cells[2]) && eraLike(cells[3])
    ))
    .map((cells) => {
      if (cells.length >= 5 && /^\d+$/.test(cells[1])) {
        return { name: cells[0], w: Number(cells[1]), l: Number(cells[2]), k: Number(cells[3]), era: cells[4] };
      }
      return { name: cells[0], team: cells[1], w: Number(cells[2]), era: cells[3] };
    });
  if (pipeRows.length) return pipeRows.slice(0, 7);

  const tokens = lines.filter((line) => !/^(w|l|k|era|pitching|\*)$/i.test(line));
  const rows = [];
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (/^\d+$/.test(tokens[index + 1]) && /^\d+$/.test(tokens[index + 2]) && /^\d+$/.test(tokens[index + 3]) && eraLike(tokens[index + 4])) {
      rows.push({ name: tokens[index], w: Number(tokens[index + 1]), l: Number(tokens[index + 2]), k: Number(tokens[index + 3]), era: tokens[index + 4] });
      index += 4;
    } else if (/^[A-Z]{2,4}$/.test(tokens[index + 1]) && /^\d+$/.test(tokens[index + 2]) && eraLike(tokens[index + 3])) {
      rows.push({ name: tokens[index], team: tokens[index + 1], w: Number(tokens[index + 2]), era: tokens[index + 3] });
      index += 3;
    }
  }
  return rows.slice(0, 7);
}

function eraLike(value) {
  return /^\d+\.\d{2}$/.test(String(value || ""));
}

function mergeScoutingTeamLeaders(teamId, parsedTeam) {
  const team = scoutingData?.teams.find((item) => item.id === teamId);
  if (!team) return;
  if (parsedTeam.hitters.length) team.hitters = parsedTeam.hitters;
  if (parsedTeam.pitchers.length) team.pitchers = parsedTeam.pitchers;
}

function getSelectedScoutingTeam() {
  if (!scoutingData) scoutingData = deepClone(AA_SCOUTING_SNAPSHOT);
  return scoutingData.teams.find((team) => team.id === selectedScoutingTeamId) || scoutingData.teams[0];
}

function renderScoutingReport() {
  if (!els.scoutingReport || !els.scoutingTeamSelect) return;
  if (!scoutingData) scoutingData = deepClone(AA_SCOUTING_SNAPSHOT);
  if (!selectedScoutingTeamId) selectedScoutingTeamId = scoutingData.teams[0]?.id || "";
  const team = getSelectedScoutingTeam();
  els.scoutingTeamSelect.innerHTML = scoutingData.teams
    .map((item) => `<option value="${item.id}" ${item.id === team.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
    .join("");
  els.scoutingTeamSelect.value = team.id;
  els.scoutingSourceStatus.textContent = scoutingStatusMessage;

  const hitters = scoutingTopHitters(team);
  const pitchers = team.pitchers?.length ? team.pitchers : scoutingData.leagueLeaders.pitchers.filter((leader) => leader.team === team.code);
  const games = gamesFromRecord(team.record);
  const rfPerGame = games ? team.rf / games : 0;
  const raPerGame = games ? team.ra / games : 0;
  const differential = (team.rf || 0) - (team.ra || 0);
  const gamePlan = buildScoutingGamePlan(team, hitters, pitchers, rfPerGame, raPerGame);

  els.scoutingReport.innerHTML = `
    <article class="scouting-card scouting-hero-card">
      <div class="mini-head">
        <div>
          <h3>${escapeHtml(team.name)}</h3>
          <span class="player-meta">AA Division | ${escapeHtml(team.record)} | ${escapeHtml(team.streak)}</span>
        </div>
        <a class="scout-link" href="${escapeHtml(teamStatsPageUrl(team))}" target="_blank" rel="noreferrer">Team Stats Page</a>
      </div>
      <div class="scout-metrics">
        ${scoutMetric("Win %", team.winPct)}
        ${scoutMetric("RF/G", rfPerGame.toFixed(1))}
        ${scoutMetric("RA/G", raPerGame.toFixed(1))}
        ${scoutMetric("Run Diff", signedNumber(differential))}
        ${scoutMetric("Last 10", team.last10)}
      </div>
    </article>
    <div class="scouting-grid">
      <article class="scouting-card">
        <div class="mini-head">
          <h3>Circle These Bats</h3>
          <span>Top five by AVG</span>
        </div>
        ${renderScoutingHitters(hitters, team)}
      </article>
      <article class="scouting-card">
        <div class="mini-head">
          <h3>Pitching Looks</h3>
          <span>${pitchers.length ? "Likely arms" : "No listed arms"}</span>
        </div>
        ${renderScoutingPitchers(pitchers, team)}
      </article>
      <article class="scouting-card scout-plan-card">
        <div class="mini-head">
          <h3>Coach's Plan</h3>
          <span>${scoutingRefreshState === "live" ? "Live data" : "Snapshot"}</span>
        </div>
        <ul class="scout-plan">
          ${gamePlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    </div>
  `;
}

function renderScoutingHitters(hitters, team) {
  if (!hitters.length) {
    const league = scoutingData.leagueLeaders.hitters.slice(0, 5);
    return `<p class="player-meta">No team-specific batting leaders were available. Keep the AA league leaders on the card:</p>
      <div class="scout-list">${league.map((row) => hitterScoutRow(row)).join("")}</div>`;
  }
  const missing = Math.max(0, 5 - hitters.length);
  return `<div class="scout-list">
    ${hitters.slice(0, 5).map((row) => hitterScoutRow(row, team)).join("")}
    ${Array.from({ length: missing }).map(() => `<div class="scout-row scout-row-muted">
      <strong>Refresh for next listed bat</strong>
      <span>${escapeHtml(team.code)}</span>
      <span>-</span>
      <span class="scout-value">--</span>
    </div>`).join("")}
  </div>`;
}

function scoutingTopHitters(team) {
  const seen = new Set();
  return [
    ...(team.hitters || []),
    ...scoutingData.leagueLeaders.hitters.filter((leader) => leader.team === team.code)
  ]
    .filter((row) => {
      const key = normalizeScoutName(row.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number.parseFloat(b.avg || "0") - Number.parseFloat(a.avg || "0"))
    .slice(0, 5);
}

function hitterScoutRow(row) {
  const side = row.pos || row.team || "-";
  return `<div class="scout-row">
    <strong>${escapeHtml(row.name)}</strong>
    <span>${escapeHtml(side)}</span>
    <span>${Number(row.ab || 0)} AB</span>
    <span class="scout-value">${escapeHtml(row.avg || "-")}</span>
  </div>`;
}

function renderScoutingPitchers(pitchers) {
  if (!pitchers.length) {
    const league = scoutingData.leagueLeaders.pitchers.slice(0, 5);
    return `<p class="player-meta">No team-specific pitching leaders were available. Scout the AA run prevention leaders first:</p>
      <div class="scout-list">${league.map((row) => pitcherScoutRow(row)).join("")}</div>`;
  }
  return `<div class="scout-list">${pitchers.slice(0, 7).map((row) => pitcherScoutRow(row)).join("")}</div>`;
}

function pitcherScoutRow(row) {
  const record = row.l === undefined ? `${row.w ?? "-"} W` : `${row.w ?? "-"}-${row.l ?? "-"}`;
  const strikeouts = row.k === undefined ? "" : `<span>${Number(row.k || 0)} K</span>`;
  return `<div class="scout-row">
    <strong>${escapeHtml(row.name)}</strong>
    <span>${escapeHtml(row.team || record)}</span>
    ${strikeouts}
    <span class="scout-value">${escapeHtml(row.era || "-")} ERA</span>
  </div>`;
}

function buildScoutingGamePlan(team, hitters, pitchers, rfPerGame, raPerGame) {
  const topHitter = hitters[0];
  const topPitcher = pitchers[0];
  const runDiff = (team.rf || 0) - (team.ra || 0);
  const winPct = Number.parseFloat(team.winPct || "0");
  const teamRank = [...scoutingData.teams]
    .sort((a, b) => Number.parseFloat(b.winPct || "0") - Number.parseFloat(a.winPct || "0"))
    .findIndex((item) => item.id === team.id) + 1;
  const bestAvg = Number.parseFloat(topHitter?.avg || "0");
  const topFiveAverage = divide(
    hitters.reduce((sum, hitter) => sum + Number.parseFloat(hitter.avg || "0"), 0),
    hitters.length || 1
  );
  const plan = [];
  if (topHitter) {
    plan.push(`${topHitter.name} is the first red flag at ${topHitter.avg}. With runners on, expand carefully and make the next bat prove it.`);
  }
  if (topPitcher) {
    const pitcherShape = topPitcher.k ? `${topPitcher.k} strikeouts` : `${topPitcher.w ?? "-"} wins`;
    plan.push(`Prepare for ${topPitcher.name}: ${topPitcher.era || "--"} ERA with ${pitcherShape}. Track first-pitch strikes and make him show command from the stretch.`);
  }
  if (winPct >= 0.65) {
    plan.push(`They sit near the top of AA at ${team.record}. We need clean first innings: no free 90s, no extra outs, no missed cutoff throws.`);
  } else if (winPct <= 0.4) {
    plan.push(`Their ${team.record} profile says pressure matters. Score first, run the bases hard, and force them to defend every routine ball.`);
  } else {
    plan.push(`This is a middle-table matchup. Win counts early and avoid giving their top five a second chance with runners aboard.`);
  }
  if (rfPerGame >= 6.5 && runDiff > 0) {
    plan.push(`${team.rf} runs for is real offense. Keep double-play depth ready and treat walks before the order turns over like doubles.`);
  } else if (team.ra > team.rf) {
    plan.push(`${team.ra} runs allowed gives us an opening. Bunt looks, steal reads, and first-to-third pressure should stay on until they stop it.`);
  } else {
    plan.push(`Their run margin is ${signedNumber(runDiff)}. One clean defensive inning after we score can swing this game.`);
  }
  if (topFiveAverage >= 0.4) {
    plan.push(`The listed top bats average ${topFiveAverage.toFixed(3).replace(/^0/, "")}. Pitch to the bottom edge and make them hit our pitch, not theirs.`);
  } else if (bestAvg > 0) {
    plan.push(`The danger is concentrated at the top. Do not let the ${teamRank}${ordinalSuffix(teamRank)}-ranked profile get free traffic for ${topHitter.name}.`);
  }
  return plan;
}

function ordinalSuffix(value) {
  if ([11, 12, 13].includes(value % 100)) return "th";
  if (value % 10 === 1) return "st";
  if (value % 10 === 2) return "nd";
  if (value % 10 === 3) return "rd";
  return "th";
}

function scoutMetric(label, value) {
  return `<div class="scout-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function gamesFromRecord(record) {
  return String(record || "")
    .split("-")
    .map((part) => Number(part) || 0)
    .reduce((sum, value) => sum + value, 0);
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}

function normalizeScoutName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoutingTeamId(value) {
  return normalizeScoutName(value) || createId("scout-team");
}

function teamStatsPageUrl(team) {
  if (!team) return PITTSBURGH_NABA_URL;
  if (team.statsUrl) return team.statsUrl;
  try {
    const url = new URL(team.url || PITTSBURGH_NABA_URL, window.location.href);
    const teamCode = url.searchParams.get("u");
    if (teamCode) {
      return `https://www.pittsburghnaba.org/teams/default.asp?u=${encodeURIComponent(teamCode)}&s=baseball&p=stats`;
    }
  } catch (error) {
    // Fall back to the league page when a team URL is not parseable.
  }
  return team.url || PITTSBURGH_NABA_URL;
}

function statsEditButtonMarkup(player) {
  return `<button type="button" class="stats-row-edit-button" data-edit-hitting-player="${escapeHtml(player.id)}" aria-label="Edit game stats for #${escapeHtml(player.number)} ${escapeHtml(player.name)}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
    </svg>
  </button>`;
}

function pitchingStatsEditButtonMarkup(player) {
  return `<button type="button" class="stats-row-edit-button" data-edit-pitching-player="${escapeHtml(player.id)}" aria-label="Edit pitching stats for #${escapeHtml(player.number)} ${escapeHtml(player.name)}">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
    </svg>
  </button>`;
}

function renderSeasonStats() {
  populateStatsSeasonSelect();
  applyStatsPageMode();
  if (els.bulkStatEditBtn) els.bulkStatEditBtn.hidden = !isAdminMode();
  if (!isPlayerFocusedStatsMode()) {
    renderStatsSnapshot();
  }
  renderStatsFocusBanner();
  updateSortIndicators();
  const focusedPlayerId = statsFocusedPlayerId();
  const allHittingRows = getSeasonHittingRows();
  const allPitchingRows = getSeasonPitchingRows();
  const seasonHasStats = allHittingRows.some(playerHasHittingLine) || allPitchingRows.some(({ pit }) => hasPitchingStats(pit));
  if (els.statsDashboardEmpty && !focusedPlayerId) els.statsDashboardEmpty.hidden = seasonHasStats;
  renderPlayerSpotlight(recentHittingRowsForSpotlight());
  renderHotBats(allHittingRows);
  renderStatsProfiles(teamStats(statsSeasonFilter), teamPitchingStats(statsSeasonFilter));
  renderStatsSprayDashboard();
  renderDesktopStatsFilters(allHittingRows, allPitchingRows);
  const hittingPlayerFilter = focusedPlayerId || (desktopHitPlayerFilter !== "all" ? desktopHitPlayerFilter : "");
  const pitchingPlayerFilter = focusedPlayerId || (desktopPitPlayerFilter !== "all" ? desktopPitPlayerFilter : "");
  const hittingRows = allHittingRows.filter(({ player }) => !hittingPlayerFilter || player.id === hittingPlayerFilter);
  els.hittingStatsBody.innerHTML = hittingRows
    .map(({ player, hit, gp }) => {
      return `<tr>
        <td>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</td>
        <td>${gp}</td>
        <td>${hit.pa}</td>
        <td>${hit.ab}</td>
        <td>${hit.h}</td>
        <td>${hit.singles}</td>
        <td>${hit.doubles}</td>
        <td>${hit.triples}</td>
        <td>${hit.hr}</td>
        <td${statsThresholdClass("avg", hit.avg, hit.ab > 0)}>${formatRate(hit.avg)}</td>
        <td${statsThresholdClass("ops", hit.ops, hit.pa > 0)}>${formatRate(hit.ops)}</td>
        <td>${hit.runs}</td>
        <td>${formatRate(hit.obp)}</td>
        <td>${formatRate(hit.slg)}</td>
        <td>${hit.rbi}</td>
        <td>${hit.bb}</td>
        <td>${hit.hbp}</td>
        <td>${hit.k}</td>
        <td>${hit.sb}</td>
        <td>${hit.cs}</td>
        <td>${hit.po}</td>
        <td>${hit.roe}</td>
        <td>${hit.errors}</td>
        <td class="stats-row-edit-cell">${statsEditButtonMarkup(player)}</td>
      </tr>`;
    })
    .join("")
    || `<tr><td colspan="24" class="stats-empty-row">No season stats yet. Score a game to populate the Lions dashboard.</td></tr>`;
  const pitchingRows = allPitchingRows.filter(({ player }) => !pitchingPlayerFilter || player.id === pitchingPlayerFilter);
  els.pitchingStatsBody.innerHTML = pitchingRows
    .map(({ player, pit }) => {
      return `<tr>
        <td>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</td>
        <td>${pit.wins}</td>
        <td>${pit.losses}</td>
        <td>${pit.noDecision}</td>
        <td>${formatInnings(pit.outs)}</td>
        <td>${pit.pitches}</td>
        <td>${pit.balls}</td>
        <td>${pit.strikes}</td>
        <td>${Math.round(pit.strikeRate * 100)}%</td>
        <td>${pit.batters}</td>
        <td>${pit.h}</td>
        <td>${pit.runs}</td>
        <td>${formatEra(pit.era)}</td>
        <td>${pit.bb}</td>
        <td>${pit.hbp}</td>
        <td>${pit.k}</td>
        <td>${Math.round(pit.kRate * 100)}%</td>
        <td>${Math.round(pit.bbRate * 100)}%</td>
        <td>${pit.kbb.toFixed(1)}</td>
        <td>${pit.k9.toFixed(1)}</td>
        <td>${pit.r9.toFixed(1)}</td>
        <td>${pit.whip.toFixed(2)}</td>
        <td>${pit.pitchesPerInning.toFixed(1)}</td>
        <td class="stats-row-edit-cell">${pitchingStatsEditButtonMarkup(player)}</td>
      </tr>`;
    })
    .join("")
    || `<tr><td colspan="24" class="stats-empty-row">No season stats yet. Score a game to populate the Lions dashboard.</td></tr>`;
  if (els.statsHittingMeta) {
    els.statsHittingMeta.textContent = hittingPlayerFilter
      ? `${statsSeasonLabel()} batting lines for ${playerDisplayName(hittingPlayerFilter)} across completed and in-progress games.`
      : `${statsSeasonLabel()} roster batting lines for ${hittingRows.length} players.`;
  }
  if (els.statsPitchingMeta) {
    els.statsPitchingMeta.textContent = pitchingPlayerFilter
      ? `${statsSeasonLabel()} pitching lines for ${playerDisplayName(pitchingPlayerFilter)} across completed and in-progress games.`
      : `${statsSeasonLabel()} pitching lines and run prevention for ${pitchingRows.length} arms.`;
  }
  renderMobileStatsFilters();
  const mobileHittingRows = getMobileHittingRows(mobileHitPlayerFilter, mobileHitGameFilter);
  const mobileHittingLeaders = mobileHittingLeaderMap(getMobileHittingRows("all", mobileHitGameFilter));
  if (els.mobileHittingStatsList) {
    els.mobileHittingStatsList.innerHTML = mobileHittingRows.length
      ? mobileHittingRows.map(({ player, hit, gp }) => {
        return `<article class="stats-mobile-card">
          <div class="stats-mobile-card-head">
            <div>
              <strong>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</strong>
            </div>
            ${statsEditButtonMarkup(player)}
          </div>
          <div class="stats-mobile-pill-grid">
            ${mobileStatPill("GP", gp, mobileStatIsLeader(mobileHittingLeaders, "gp", player.id))}
            ${mobileStatPill("PA", hit.pa, mobileStatIsLeader(mobileHittingLeaders, "pa", player.id))}
            ${mobileStatPill("AVG", formatRate(hit.avg), mobileStatIsLeader(mobileHittingLeaders, "avg", player.id))}
            ${mobileStatPill("H", hit.h, mobileStatIsLeader(mobileHittingLeaders, "h", player.id))}
            ${mobileStatPill("OPS", formatRate(hit.ops), mobileStatIsLeader(mobileHittingLeaders, "ops", player.id))}
            ${mobileStatPill("RBI", hit.rbi, mobileStatIsLeader(mobileHittingLeaders, "rbi", player.id))}
            ${mobileStatPill("R", hit.runs, mobileStatIsLeader(mobileHittingLeaders, "runs", player.id))}
            ${mobileStatPill("SB", hit.sb, mobileStatIsLeader(mobileHittingLeaders, "sb", player.id))}
            ${mobileStatPill("K", hit.k, mobileStatIsLeader(mobileHittingLeaders, "k", player.id))}
          </div>
        </article>`;
      }).join("")
      : `<p class="stats-mobile-empty">No batting stats yet.</p>`;
  }
  const mobilePitchingRows = getMobilePitchingRows(mobilePitPlayerFilter, mobilePitGameFilter);
  const mobilePitchingLeaders = mobilePitchingLeaderMap(getMobilePitchingRows("all", mobilePitGameFilter));
  if (els.mobilePitchingStatsList) {
    els.mobilePitchingStatsList.innerHTML = mobilePitchingRows.length
      ? mobilePitchingRows.map(({ player, pit }) => {
        return `<article class="stats-mobile-card">
          <div class="stats-mobile-card-head">
            <div>
              <strong>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</strong>
            </div>
            ${pitchingStatsEditButtonMarkup(player)}
          </div>
          <div class="stats-mobile-pill-grid">
            ${mobileStatPill("W-L", `${pit.wins}-${pit.losses}`, mobileStatIsLeader(mobilePitchingLeaders, "record", player.id))}
            ${mobileStatPill("IP", formatInnings(pit.outs), mobileStatIsLeader(mobilePitchingLeaders, "outs", player.id))}
            ${mobileStatPill("ERA", formatEra(pit.era), mobileStatIsLeader(mobilePitchingLeaders, "era", player.id))}
            ${mobileStatPill("K", pit.k, mobileStatIsLeader(mobilePitchingLeaders, "k", player.id))}
            ${mobileStatPill("BB", pit.bb, mobileStatIsLeader(mobilePitchingLeaders, "bb", player.id))}
            ${mobileStatPill("WHIP", pit.whip.toFixed(2), mobileStatIsLeader(mobilePitchingLeaders, "whip", player.id))}
            ${mobileStatPill("Str%", `${Math.round(pit.strikeRate * 100)}%`, mobileStatIsLeader(mobilePitchingLeaders, "strikeRate", player.id))}
            ${mobileStatPill("BB%", `${Math.round(pit.bbRate * 100)}%`, mobileStatIsLeader(mobilePitchingLeaders, "bbRate", player.id))}
          </div>
        </article>`;
      }).join("")
      : `<p class="stats-mobile-empty">No pitching stats yet.</p>`;
  }
}
function renderStatsSnapshot() {
  if (!els.statsSnapshotGrid) return;
  const hitting = teamStats(statsSeasonFilter);
  const pitching = teamPitchingStats(statsSeasonFilter);
  const scopedGames = statsGamesForSeason(statsSeasonFilter);
  const battingMetrics = [
    { label: "AVG", value: formatRate(hitting.avg), detail: "Team Average", tone: "gold" },
    { label: "OPS", value: formatRate(hitting.ops), detail: "On Base + Slugging", tone: "gold" },
    { label: "Runs", value: String(totalTeamRuns(scopedGames)), detail: "Runs Scored", tone: "gold" },
    { label: "H", value: String(hitting.h), detail: "Hits", tone: "gold" }
  ];
  const pitchingMetrics = [
    { label: "ERA", value: formatEra(pitching.era), detail: "Team ERA", tone: "blue" },
    { label: "WHIP", value: Number.isFinite(pitching.whip) ? pitching.whip.toFixed(2) : "--", detail: "Walks + Hits / IP", tone: "blue" },
    { label: "K", value: String(pitching.k), detail: "Strikeouts", tone: "blue" },
    { label: "Wins", value: String(pitching.wins), detail: "Wins", tone: "blue" }
  ];
  const renderMetric = (metric, index, options = {}) => `<article class="stats-snapshot-metric${options.isBattingEnd ? " is-batting-end" : ""}${options.isPitchingStart ? " is-pitching-start" : ""}" data-tone="${escapeHtml(metric.tone)}">
    <span class="stats-snapshot-label">${escapeHtml(metric.label)}</span>
    <strong class="stats-snapshot-value">${escapeHtml(metric.value)}</strong>
    <span class="stats-snapshot-detail">${escapeHtml(metric.detail)}</span>
  </article>`;
  els.statsSnapshotGrid.innerHTML = `
    <section class="stats-snapshot-slide is-batting" aria-label="Batting snapshot">
      ${battingMetrics.map((metric, index) => renderMetric(metric, index, { isBattingEnd: index === battingMetrics.length - 1 })).join("")}
    </section>
    <section class="stats-snapshot-slide is-pitching" aria-label="Pitching snapshot">
      ${pitchingMetrics.map((metric, index) => renderMetric(metric, index, { isPitchingStart: index === 0 })).join("")}
    </section>`;
}

function renderStatsMode() {
  const focusedMode = isPlayerFocusedStatsMode();
  if (els.statsModeTabs) {
    els.statsModeTabs.querySelectorAll("[data-stats-mode]").forEach((button) => {
      const isActive = button.dataset.statsMode === statsMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }
  if (els.statsLeadersSectionTitle) {
    els.statsLeadersSectionTitle.textContent = statsMode === "pitching" ? "Pitching Leaders" : "Hitting Leaders";
  }
  const showSprayShell = focusedMode || statsMode !== "pitching";
  if (els.statsHotBats) els.statsHotBats.hidden = focusedMode || statsMode === "pitching";
  if (els.statsSprayShell) els.statsSprayShell.hidden = !showSprayShell;
  if (!showSprayShell && statsSprayExpanded) {
    statsSprayExpanded = false;
    if (els.statsSprayModal) els.statsSprayModal.hidden = true;
  }
  if (els.statsHittingSection) els.statsHittingSection.hidden = focusedMode ? false : statsMode !== "hitting";
  if (els.statsPitchingSection) els.statsPitchingSection.hidden = focusedMode ? false : statsMode !== "pitching";
}

function renderStatsSprayControls() {
  const focusedPlayerId = statsFocusedPlayerId();
  if (els.statsSprayModal) els.statsSprayModal.hidden = !statsSprayExpanded;
  if (els.statsSprayPanel) els.statsSprayPanel.classList.add("is-visible");
  if (els.toggleStatsSprayBtn) els.toggleStatsSprayBtn.textContent = "Open Spray Chart >";
  const preferredPlayer = focusedPlayerId;
  const selectedPlayer = preferredPlayer || els.statsSprayPlayerSelect.value || state.roster[0]?.id || "";
  const sprayPlayerLabel = els.statsSprayPlayerSelect?.closest("label");
  if (focusedPlayerId) {
    const focusedPlayer = state.roster.find((player) => player.id === focusedPlayerId);
    els.statsSprayPlayerSelect.innerHTML = focusedPlayer
      ? `<option value="${escapeHtml(focusedPlayer.id)}">#${escapeHtml(focusedPlayer.number)} ${escapeHtml(focusedPlayer.name)}</option>`
      : "";
    els.statsSprayPlayerSelect.value = focusedPlayerId;
    els.statsSprayPlayerSelect.disabled = true;
    if (sprayPlayerLabel) sprayPlayerLabel.hidden = true;
  } else {
    els.statsSprayPlayerSelect.innerHTML = state.roster
      .map((player) => `<option value="${player.id}" ${player.id === selectedPlayer ? "selected" : ""}>#${escapeHtml(player.number)} ${escapeHtml(player.name)}</option>`)
      .join("");
    if (selectedPlayer) els.statsSprayPlayerSelect.value = selectedPlayer;
    els.statsSprayPlayerSelect.disabled = false;
    if (sprayPlayerLabel) sprayPlayerLabel.hidden = false;
  }
  const selectedGame = els.statsSprayGameSelect.value || "all";
  els.statsSprayGameSelect.innerHTML = [
    `<option value="all">All games</option>`,
    ...statsGamesForSeason(statsSeasonFilter)
      .filter((game) => sprayEventsForGame(game).length)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((game) => `<option value="${game.id}" ${game.id === selectedGame ? "selected" : ""}>${escapeHtml(game.date)} ${escapeHtml(gameMatchupLabel(game))}</option>`)
  ].join("");
  if ([...els.statsSprayGameSelect.options].some((option) => option.value === selectedGame)) els.statsSprayGameSelect.value = selectedGame;
  renderStatsSprayChart();
}

function renderStatsSprayChart() {
  const playerId = statsFocusedPlayerId() || els.statsSprayPlayerSelect.value || state.roster[0]?.id;
  const gameId = els.statsSprayGameSelect.value || "all";
  const events = statsGamesForSeason(statsSeasonFilter)
    .flatMap((game) => sprayEventsForGame(game))
    .filter(({ event, game }) => event.spray && event.playerId === playerId && (gameId === "all" || game.id === gameId));
  els.statsSprayMarkers.innerHTML = events.length
    ? events.map((item) => renderSprayDot(item, { resultLabel: true })).join("")
    : `<span class="spray-empty">No tracked batted balls</span>`;
}

function bulkStatEditGames() {
  return statsGamesForSeason(statsSeasonFilter).sort(sortGamesNewestFirst);
}

function bulkStatEditGame() {
  return state.games.find((game) => game.id === bulkStatEditGameId) || null;
}

function comparePlayersForBulkStats(a, b) {
  const aNumber = Number.parseInt(a?.number, 10);
  const bNumber = Number.parseInt(b?.number, 10);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
  if (Number.isFinite(aNumber) && !Number.isFinite(bNumber)) return -1;
  if (!Number.isFinite(aNumber) && Number.isFinite(bNumber)) return 1;
  return String(a?.name || "").localeCompare(String(b?.name || ""));
}

function bulkStatRosterPlayers(game) {
  const editedIds = new Set([
    ...Object.keys(hittingStatEditMap(game)),
    ...Object.keys(pitchingStatEditMap(game))
  ]);
  return state.roster
    .filter((player) => player?.active !== false || editedIds.has(player.id))
    .sort(comparePlayersForBulkStats);
}

function openBulkStatEditModal() {
  if (!requireAdminAccess("Admin sign-in required to enter game stats.")) return;
  if (!els.bulkStatEditModal) return;
  const games = bulkStatEditGames();
  if (!games.length) {
    window.alert(`No completed or scored games are available in ${statsSeasonLabel()}.`);
    return;
  }
  if (!games.some((game) => game.id === bulkStatEditGameId)) bulkStatEditGameId = games[0].id;
  renderBulkStatEditModal();
  els.bulkStatEditModal.hidden = false;
  window.setTimeout(() => els.bulkStatEditGameSelect?.focus(), 0);
}

function closeBulkStatEditModal() {
  if (els.bulkStatEditModal) els.bulkStatEditModal.hidden = true;
}

function renderBulkStatEditModal() {
  if (!els.bulkStatEditBody) return;
  const games = bulkStatEditGames();
  if (!games.some((game) => game.id === bulkStatEditGameId)) bulkStatEditGameId = games[0]?.id || "";
  const game = bulkStatEditGame();
  if (els.bulkStatEditGameSelect) {
    els.bulkStatEditGameSelect.innerHTML = games.length
      ? games.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(statsGameOptionLabel(item))}</option>`).join("")
      : `<option value="">No games available</option>`;
    els.bulkStatEditGameSelect.value = bulkStatEditGameId;
  }
  els.bulkStatEditModeTabs?.querySelectorAll("[data-bulk-stat-mode]").forEach((button) => {
    const active = button.dataset.bulkStatMode === bulkStatEditMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (!game) {
    if (els.bulkStatEditMeta) els.bulkStatEditMeta.textContent = `No completed or scored games are available in ${statsSeasonLabel()}.`;
    els.bulkStatEditBody.innerHTML = `<p class="stat-edit-empty">No games are available for bulk stat entry.</p>`;
    return;
  }
  if (els.bulkStatEditMeta) {
    const modeLabel = bulkStatEditMode === "pitching" ? "pitching" : "hitting";
    els.bulkStatEditMeta.textContent = `${formatGameDateWithYear(game.date)} | ${gameMatchupLabel(game)} | ${gameScoreLabel(game)} | ${modeLabel}`;
  }
  els.bulkStatEditBody.innerHTML = bulkStatEditMode === "pitching"
    ? renderBulkPitchingStatTable(game)
    : renderBulkHittingStatTable(game);
}

function bulkStatInputValue(value) {
  const number = Number(value || 0);
  return number > 0 ? String(number) : "";
}

function bulkHittingStatDraft(playerId, game) {
  const existing = hittingStatEditMap(game)[playerId];
  return normalizeHittingStatEdit(existing || { playerId, gameId: game?.id || "", stats: {}, sprays: [] }, playerId, game);
}

function gameStatPositionFallback(player, game) {
  const lineupEntry = gameLineupEntries(game).find((entry) => entry.playerId === player?.id);
  return normalizeGameStatPosition(lineupEntry?.role || playerPrimaryPosition(player));
}

function gameStatPositionOptions(value = "", fallback = "") {
  const selected = normalizeGameStatPosition(value);
  const defaultLabel = fallback ? `Default (${fallback})` : "Default";
  return [
    `<option value=""${selected ? "" : " selected"}>${escapeHtml(defaultLabel)}</option>`,
    ...gameStatPositions.map((position) =>
      `<option value="${escapeHtml(position)}"${selected === position ? " selected" : ""}>${escapeHtml(position)}</option>`
    )
  ].join("");
}

function renderBulkHittingPositionSelect(player, game, position = "") {
  const fallback = gameStatPositionFallback(player, game);
  return `<select
    class="bulk-stat-position-select"
    aria-label="${escapeHtml(`Game position for #${player.number || "--"} ${player.name}`)}"
    data-bulk-stat-player="${escapeHtml(player.id)}"
    data-bulk-stat-key="position">
      ${gameStatPositionOptions(position, fallback)}
  </select>`;
}

function bulkPitchingStatDraft(playerId, game) {
  const existing = pitchingStatEditMap(game)[playerId];
  return normalizePitchingStatEdit(existing || { playerId, gameId: game?.id || "", stats: {} }, playerId, game);
}

function renderBulkStatPlayerCell(player, options = {}) {
  const sprayButton = options.sprayAction
    ? `<button type="button" class="secondary-action compact-action bulk-stat-spray-button" data-bulk-stat-spray-player="${escapeHtml(player.id)}" aria-label="Open spray chart for #${escapeHtml(player.number || "--")} ${escapeHtml(player.name || "Player")}">Spray</button>`
    : "";
  return `<th scope="row" class="bulk-stat-player-cell">
    <strong>#${escapeHtml(player.number || "--")} ${escapeHtml(player.name || "Player")}</strong>
    <span>${escapeHtml(formatPositions(player.positions))}</span>
    ${sprayButton}
  </th>`;
}

function playerNumberName(player) {
  return `#${player?.number || "--"} ${player?.name || "Player"}`;
}

function playerHasHittingLine(row) {
  const hit = row?.hit || {};
  return Boolean((row?.gp || 0) > 0 || hit.pa > 0 || hit.ab > 0 || hit.h > 0 || hit.rbi > 0 || hit.runs > 0 || hit.rispAB > 0);
}

const PLAYER_SPOTLIGHT_GAME_LIMIT = 3;
const PLAYER_SPOTLIGHT_MIN_PA = 5;

function gamesPlayedForPlayerInGames(playerId, games = []) {
  return games.filter((game) => {
    const storedLineupIds = Array.isArray(game.lineupEntries)
      ? game.lineupEntries
        .filter((entry) => entry?.active !== false && entry?.playerId)
        .map((entry) => entry.playerId)
      : [];
    return hasHittingStatEdit(game, playerId)
      || offensiveEventsForStatsGame(game).some((event) => event.playerId === playerId)
      || (gameUsesLineupForGamesPlayed(game) && storedLineupIds.includes(playerId));
  }).length;
}

function statsForPlayerInGames(playerId, games = []) {
  const stats = emptyStats();
  games
    .flatMap((game) => offensiveEventsForStatsGame(game))
    .filter((event) => event.playerId === playerId)
    .forEach((event) => applyEventToStats(stats, event));
  stats.runs = runsScoredForPlayerInGames(playerId, games);
  finishStats(stats);
  return stats;
}

function runsScoredForPlayerInGames(playerId, games = []) {
  return runsScoredFromEvents(games.flatMap((game) => offensiveEventsForStatsGame(game)), playerId);
}

function recentHittingRowsForSpotlight(limit = PLAYER_SPOTLIGHT_GAME_LIMIT) {
  const recentGames = statsGamesWithDataForSeason(statsSeasonFilter).slice(0, limit);
  return state.roster.map((player) => ({
    player,
    hit: statsForPlayerInGames(player.id, recentGames),
    gp: gamesPlayedForPlayerInGames(player.id, recentGames),
    spotlightGameCount: recentGames.length
  }));
}

function topHittingRows(rows = [], limit = 3) {
  return rows
    .filter(playerHasHittingLine)
    .sort((a, b) =>
      (b.hit.ops || 0) - (a.hit.ops || 0)
      || (b.hit.avg || 0) - (a.hit.avg || 0)
      || (b.hit.rbi || 0) - (a.hit.rbi || 0)
      || String(a.player.name || "").localeCompare(String(b.player.name || ""))
    )
    .slice(0, limit);
}

function playerSpotlightHitterScore(row = {}) {
  const hit = row.hit || {};
  return boxScoreHitterStarScore({
    h: hit.h || 0,
    rbi: hit.rbi || 0,
    r: hit.runs || 0,
    bb: hit.bb || 0,
    hbp: hit.hbp || 0,
    sb: hit.sb || 0,
    doubles: hit.doubles || 0,
    triples: hit.triples || 0,
    hr: hit.hr || 0,
    so: hit.k || 0
  });
}

function topPlayerSpotlightRows(rows = [], limit = 1) {
  return rows
    .filter(playerHasHittingLine)
    .sort((a, b) =>
      playerSpotlightHitterScore(b) - playerSpotlightHitterScore(a)
      || (b.hit?.ops || 0) - (a.hit?.ops || 0)
      || (b.hit?.avg || 0) - (a.hit?.avg || 0)
      || String(a.player.name || "").localeCompare(String(b.player.name || ""))
    )
    .slice(0, limit);
}

function playerSpotlightSelection(rows = []) {
  const qualifiedRows = rows.filter((row) => playerHasHittingLine(row) && (row.hit?.pa || 0) >= PLAYER_SPOTLIGHT_MIN_PA);
  const [qualifiedRow] = topPlayerSpotlightRows(qualifiedRows, 1);
  if (qualifiedRow) return { row: qualifiedRow, limitedSample: false };
  const [fallbackRow] = topPlayerSpotlightRows(rows, 1);
  return { row: fallbackRow || null, limitedSample: Boolean(fallbackRow) };
}

function statProfileMetric(label, value, detail = "") {
  return `<div class="stats-profile-metric">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
  </div>`;
}

function formatRatio(numerator, denominator) {
  if (denominator > 0) return (numerator / denominator).toFixed(2);
  return numerator > 0 ? "INF" : "--";
}

function formatNullableRate(value, eligible = true) {
  return eligible ? formatRate(value) : "--";
}

function renderPlayerSpotlight(rows = []) {
  if (!els.statsPlayerSpotlight) return;
  const { row, limitedSample } = playerSpotlightSelection(rows);
  if (!row) {
    els.statsPlayerSpotlight.innerHTML = `<p class="player-meta">Player Spotlight</p>
      <h3>No season stats yet.</h3>
      <p>Score a game to populate the Lions dashboard.</p>`;
    return;
  }
  const { player, hit } = row;
  const gameCount = Math.max(1, Math.min(row.spotlightGameCount || PLAYER_SPOTLIGHT_GAME_LIMIT, PLAYER_SPOTLIGHT_GAME_LIMIT));
  const gameWindowLabel = gameCount === 1 ? "the last game" : `the last ${gameCount} games`;
  const spotlightSummary = limitedSample
    ? `Limited recent sample over ${gameWindowLabel}.`
    : `Best hitter over ${gameWindowLabel} by production score. Min ${PLAYER_SPOTLIGHT_MIN_PA} PA.`;
  els.statsPlayerSpotlight.innerHTML = `<div class="stats-spotlight-copy">
      <p class="player-meta">Player Spotlight</p>
      <h3>${escapeHtml(playerNumberName(player))}</h3>
      <p>${escapeHtml(spotlightSummary)}</p>
    </div>
    <div class="stats-spotlight-metrics">
      ${statProfileMetric("AVG", formatRate(hit.avg))}
      ${statProfileMetric("OPS", formatRate(hit.ops))}
      ${statProfileMetric("RBI", String(hit.rbi))}
      ${statProfileMetric("H", String(hit.h))}
      ${statProfileMetric("R", String(hit.runs))}
    </div>
    <button type="button" class="secondary-action compact-action stats-spotlight-action" data-spotlight-player="${escapeHtml(player.id)}">View Player Card</button>`;
}

function renderHotBats(rows = []) {
  if (!els.statsHotBatsGrid || !els.statsHotBats) return;
  const hotRows = topHittingRows(rows, 3);
  els.statsHotBats.hidden = isPlayerFocusedStatsMode() || statsMode === "pitching";
  els.statsHotBatsGrid.innerHTML = hotRows.length
    ? hotRows.map(({ player, hit }, index) => `<article class="stats-hot-bat-card">
        <span class="stats-hot-bat-rank">${index + 1}</span>
        <strong>${escapeHtml(playerNumberName(player))}</strong>
        <div class="stats-hot-bat-line">
          <span>AVG <b>${escapeHtml(formatRate(hit.avg))}</b></span>
          <span>OPS <b>${escapeHtml(formatRate(hit.ops))}</b></span>
          <span>RBI <b>${escapeHtml(String(hit.rbi))}</b></span>
        </div>
      </article>`).join("")
    : `<p class="player-meta">No season stats yet. Score a game to populate the Lions dashboard.</p>`;
}

function renderStatsProfiles(hitting, pitching) {
  if (els.statsOffensiveProfile) {
    els.statsOffensiveProfile.innerHTML = `<div class="mini-head">
        <h3 class="stats-subhead">Team Offensive Profile</h3>
      </div>
      <div class="stats-profile-grid">
        ${statProfileMetric("AVG", formatRate(hitting.avg))}
        ${statProfileMetric("OBP", formatRate(hitting.obp))}
        ${statProfileMetric("SLG", formatRate(hitting.slg))}
        ${statProfileMetric("OPS", formatRate(hitting.ops))}
        ${statProfileMetric("R", String(hitting.runs || 0))}
        ${statProfileMetric("BB/K", formatRatio(hitting.bb, hitting.k))}
      </div>`;
  }
  if (els.statsPitchingProfile) {
    const ip = pitching.ip || 0;
    const opponentAtBats = Math.max(0, (pitching.batters || 0) - (pitching.bb || 0) - (pitching.hbp || 0));
    const opponentAvg = opponentAtBats ? divide(pitching.h, opponentAtBats) : 0;
    const kPerSeven = ip ? divide(pitching.k * ERA_GAME_INNINGS, ip) : 0;
    els.statsPitchingProfile.innerHTML = `<div class="mini-head">
        <h3 class="stats-subhead">Team Pitching Profile</h3>
      </div>
      <div class="stats-profile-grid">
        ${statProfileMetric("ERA", formatEra(pitching.era))}
        ${statProfileMetric("WHIP", ip ? pitching.whip.toFixed(2) : "--")}
        ${statProfileMetric("K", String(pitching.k || 0))}
        ${statProfileMetric("BB", String(pitching.bb || 0))}
        ${statProfileMetric(`K/${ERA_GAME_INNINGS}`, ip ? kPerSeven.toFixed(1) : "--")}
        ${statProfileMetric("Opp AVG", formatNullableRate(opponentAvg, opponentAtBats > 0))}
      </div>`;
  }
}

function sprayTendencyLane(event) {
  const x = Number(event?.spray?.x);
  if (!Number.isFinite(x)) return "center";
  if (x < 40) return "pull";
  if (x > 60) return "oppo";
  return "center";
}

function teamSprayDashboardEvents(season = statsSeasonFilter) {
  return statsGamesForSeason(season)
    .flatMap((game) => sprayEventsForGame(game))
    .filter(({ event }) => event?.spray);
}

function renderStatsSprayDashboard() {
  const events = teamSprayDashboardEvents(statsSeasonFilter);
  if (els.statsSpraySummary) {
    els.statsSpraySummary.textContent = events.length
      ? `${events.length} tracked balls in play from the ${statsSeasonLabel()}.`
      : "Spray chart data will appear after balls in play are recorded.";
  }
  if (els.statsSprayPreviewMarkers) {
    const previewEvents = events.slice(-18);
    els.statsSprayPreviewMarkers.innerHTML = previewEvents.length
      ? previewEvents.map(({ event, game }) => {
        const rule = eventRules[event.result] || {};
        const kind = rule.hit ? "hit" : "out";
        const player = state.roster.find((item) => item.id === event.playerId);
        const title = `${player?.name || "Lions hitter"} ${rule.label || event.result || "Batted ball"} vs ${game.opponent}`;
        return `<span class="stats-spray-preview-dot ${kind}" style="left:${Number(event.spray.x) || 50}%;top:${Number(event.spray.y) || 50}%;" title="${escapeHtml(title)}"></span>`;
      }).join("")
      : `<span class="stats-spray-preview-empty">No spray data</span>`;
  }
  if (!els.statsTendenciesPanel) return;
  const total = events.length;
  const hits = events.filter(({ event }) => eventRules[event.result]?.hit).length;
  const outs = events.filter(({ event }) => eventRules[event.result]?.out).length;
  const pull = events.filter(({ event }) => sprayTendencyLane(event) === "pull").length;
  const center = events.filter(({ event }) => sprayTendencyLane(event) === "center").length;
  const oppo = events.filter(({ event }) => sprayTendencyLane(event) === "oppo").length;
  const pct = (value) => total ? `${Math.round((value / total) * 100)}%` : "--";
  els.statsTendenciesPanel.innerHTML = `<div class="mini-head">
      <h3 class="stats-subhead">Team Tendencies</h3>
    </div>
    <div class="stats-tendency-grid">
      ${statProfileMetric("Pull", pct(pull))}
      ${statProfileMetric("Center", pct(center))}
      ${statProfileMetric("Oppo", pct(oppo))}
      ${statProfileMetric("Hits", pct(hits))}
      ${statProfileMetric("Outs", pct(outs))}
    </div>`;
}

function statsThresholdClass(metric, value, eligible = true) {
  if (!eligible) return "";
  if (metric === "avg" && value > 0.35) return " class=\"stats-highlight-cell\"";
  if (metric === "ops" && value > 1) return " class=\"stats-highlight-cell\"";
  return "";
}

function focusStatsPlayerFromSpotlight(playerId) {
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;
  statsPlayerFocus = player.id;
  statsMode = "hitting";
  desktopHitPlayerFilter = player.id;
  desktopPitPlayerFilter = player.id;
  mobileHitPlayerFilter = player.id;
  mobilePitPlayerFilter = player.id;
  mobileHitGameFilter = "all";
  mobilePitGameFilter = "all";
  renderSeasonStats();
  renderLeaders();
  renderStatsSprayControls();
  window.requestAnimationFrame(() => els.statsHittingSection?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function renderBulkHittingStatTable(game) {
  const players = bulkStatRosterPlayers(game);
  if (!players.length) return `<p class="stat-edit-empty">No roster players are available for this game.</p>`;
  return `<div class="bulk-stat-table-wrap">
    <table class="bulk-stat-table">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col" class="bulk-stat-position-col">POS</th>
          ${bulkHittingStatFields.map((field) => `<th scope="col">${escapeHtml(field.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${players.map((player) => {
          const draft = bulkHittingStatDraft(player.id, game);
          return `<tr>
            ${renderBulkStatPlayerCell(player, { sprayAction: true })}
            <td class="bulk-stat-position-cell">${renderBulkHittingPositionSelect(player, game, draft.position)}</td>
            ${bulkHittingStatFields.map((field) => `<td>
              <input
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                aria-label="${escapeHtml(`${field.label} for #${player.number || "--"} ${player.name}`)}"
                data-bulk-stat-player="${escapeHtml(player.id)}"
                data-bulk-stat-key="${escapeHtml(field.key)}"
                value="${escapeHtml(bulkStatInputValue(draft.stats[field.key]))}">
            </td>`).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderBulkPitchingInput(player, field, stats) {
  const ariaLabel = `${field.label} for #${player.number || "--"} ${player.name}`;
  if (field.type === "select") {
    const value = normalizePitchingDecision(stats.decision);
    return `<select
      aria-label="${escapeHtml(ariaLabel)}"
      data-bulk-stat-player="${escapeHtml(player.id)}"
      data-bulk-stat-key="${escapeHtml(field.key)}">
        <option value=""${!value ? " selected" : ""}>None</option>
        <option value="win"${value === "win" ? " selected" : ""}>Win</option>
        <option value="loss"${value === "loss" ? " selected" : ""}>Loss</option>
        <option value="noDecision"${value === "noDecision" ? " selected" : ""}>No Decision</option>
    </select>`;
  }
  const value = field.key === "ip" ? (Number(stats.outs || 0) > 0 ? formatInnings(stats.outs) : "") : bulkStatInputValue(stats[field.key]);
  return `<input
    type="${escapeHtml(field.type || "number")}"
    ${field.type === "text" ? "" : 'min="0" step="1"'}
    inputmode="${escapeHtml(field.inputmode || "numeric")}"
    ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ""}
    aria-label="${escapeHtml(ariaLabel)}"
    data-bulk-stat-player="${escapeHtml(player.id)}"
    data-bulk-stat-key="${escapeHtml(field.key)}"
    value="${escapeHtml(value)}">`;
}

function renderBulkPitchingStatTable(game) {
  const players = bulkStatRosterPlayers(game);
  if (!players.length) return `<p class="stat-edit-empty">No roster players are available for this game.</p>`;
  return `<div class="bulk-stat-table-wrap">
    <table class="bulk-stat-table">
      <thead>
        <tr>
          <th scope="col">Player</th>
          ${bulkPitchingStatFields.map((field) => `<th scope="col">${escapeHtml(field.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${players.map((player) => {
          const draft = bulkPitchingStatDraft(player.id, game);
          return `<tr>
            ${renderBulkStatPlayerCell(player)}
            ${bulkPitchingStatFields.map((field) => `<td>${renderBulkPitchingInput(player, field, draft.stats)}</td>`).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  </div>`;
}

function collectBulkStatEditRows() {
  const rows = new Map();
  els.bulkStatEditBody?.querySelectorAll("[data-bulk-stat-player][data-bulk-stat-key]").forEach((input) => {
    const playerId = input.dataset.bulkStatPlayer || "";
    const key = input.dataset.bulkStatKey || "";
    if (!playerId || !key) return;
    if (!rows.has(playerId)) rows.set(playerId, {});
    rows.get(playerId)[key] = input.value;
  });
  return rows;
}

function bulkRowHasInput(raw = {}) {
  return Object.values(raw).some((value) => String(value ?? "").trim() !== "");
}

function persistBulkHittingDraftForSpray(game) {
  if (!game) return;
  applyBulkHittingStatRows(game, collectBulkStatEditRows());
  saveStateWithOptions({ liveSyncReason: "bulk-game-stat-spray-draft" });
}

function openBulkStatSprayEditor(playerId) {
  if (!requireAdminAccess("Admin sign-in required to edit spray charts.")) return;
  const game = bulkStatEditGame();
  const player = state.roster.find((item) => item.id === playerId);
  if (!game || !player) return;
  persistBulkHittingDraftForSpray(game);
  reopenBulkStatEditAfterStatModal = true;
  bulkStatEditMode = "hitting";
  closeBulkStatEditModal();
  openStatEditGameModal(player.id, game.id);
}

function handleBulkStatEditBodyClick(event) {
  const sprayButton = event.target.closest("[data-bulk-stat-spray-player]");
  if (!sprayButton) return;
  event.preventDefault();
  openBulkStatSprayEditor(sprayButton.dataset.bulkStatSprayPlayer || "");
}

function applyBulkHittingStatRows(game, rows) {
  const edits = hittingStatEditMap(game);
  const updatedAt = new Date().toISOString();
  bulkStatRosterPlayers(game).forEach((player) => {
    const raw = rows.get(player.id) || {};
    const existing = edits[player.id] ? normalizeHittingStatEdit(edits[player.id], player.id, game) : null;
    const stats = normalizeManualHittingStats(raw);
    const hasStats = manualHittingStatLineHasValues(stats);
    const sprays = existing?.sprays || [];
    const rawPosition = Object.prototype.hasOwnProperty.call(raw, "position") ? raw.position : existing?.position || "";
    const position = normalizeGameStatPosition(rawPosition);
    const hasPosition = Boolean(position);
    if (!bulkRowHasInput(raw) || (!hasStats && !hasPosition)) {
      if (existing && sprays.length) {
        edits[player.id] = normalizeHittingStatEdit({ playerId: player.id, gameId: game.id, position, stats: {}, sprays, updatedAt }, player.id, game);
      } else if (existing) {
        delete edits[player.id];
      }
      return;
    }
    edits[player.id] = normalizeHittingStatEdit({
      playerId: player.id,
      gameId: game.id,
      position,
      stats,
      sprays,
      updatedAt
    }, player.id, game);
  });
}

function applyBulkPitchingStatRows(game, rows) {
  const edits = pitchingStatEditMap(game);
  const updatedAt = new Date().toISOString();
  bulkStatRosterPlayers(game).forEach((player) => {
    const raw = rows.get(player.id) || {};
    const existing = edits[player.id];
    const stats = normalizeManualPitchingStats(raw);
    if (!bulkRowHasInput(raw) || !manualPitchingStatLineHasValues(stats)) {
      if (existing) delete edits[player.id];
      return;
    }
    edits[player.id] = normalizePitchingStatEdit({
      playerId: player.id,
      gameId: game.id,
      stats,
      updatedAt
    }, player.id, game);
  });
}

function saveBulkStatEditGameStats(event) {
  event.preventDefault();
  if (!requireAdminAccess("Admin sign-in required to enter game stats.")) return;
  const game = bulkStatEditGame();
  if (!game) return;
  const rows = collectBulkStatEditRows();
  const reason = bulkStatEditMode === "pitching" ? "bulk-pitching-stat-edit" : "bulk-game-stat-edit";
  if (bulkStatEditMode === "pitching") {
    applyBulkPitchingStatRows(game, rows);
  } else {
    applyBulkHittingStatRows(game, rows);
  }
  markSharedGamesDirty(game.id);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    queueCompletedGameSync(game.id, { reason });
  }
  saveStateWithOptions({ liveSyncReason: reason });
  closeBulkStatEditModal();
  render();
  requestSharedSnapshotSync(reason);
  requestCompletedGameSyncRetry(reason);
}

function handleHittingStatsEditClick(event) {
  const button = event.target.closest("[data-edit-hitting-player]");
  if (!button) return;
  event.preventDefault();
  openStatEditGameSelectModal(button.dataset.editHittingPlayer || "");
}

function handlePitchingStatsEditClick(event) {
  const button = event.target.closest("[data-edit-pitching-player]");
  if (!button) return;
  event.preventDefault();
  openPitchingStatEditGameSelectModal(button.dataset.editPitchingPlayer || "");
}

function statEditPlayer() {
  return state.roster.find((player) => player.id === statEditPlayerId) || null;
}

function statEditGame() {
  return state.games.find((game) => game.id === statEditGameId) || null;
}

function playerHasStatsInGame(playerId, game) {
  if (!playerId || !game) return false;
  if (hasHittingStatEdit(game, playerId)) return true;
  if (gameLineupPlayerIds(game).includes(playerId)) return true;
  if (offensiveEventsForStatsGame(game).some((event) => event.playerId === playerId)) return true;
  if (sprayEventsForGame(game).some(({ event }) => event.playerId === playerId)) return true;
  return allOffensiveEvents(null, game.id).some((event) =>
    (event.runnerAdvancements || []).some((advancement) => advancement?.runnerId === playerId)
  );
}

function gameAvailableForHittingStatEdit(playerId, game) {
  if (!game) return false;
  if (gameIsFinal(game)) return true;
  return playerHasStatsInGame(playerId, game);
}

function hittingStatEditGames(playerId) {
  return statsGamesForSeason(statsSeasonFilter)
    .filter((game) => gameAvailableForHittingStatEdit(playerId, game))
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")) || String(b?.time || "").localeCompare(String(a?.time || "")));
}

function statEditGameLine(playerId, game) {
  const hit = statsForPlayer(playerId, statsSeasonFilter, game.id);
  const runs = runsScoredForPlayer(playerId, statsSeasonFilter, game.id);
  return `${hit.ab} AB | ${hit.h} H | ${hit.rbi} RBI | ${runs} R`;
}

function openStatEditGameSelectModal(playerId) {
  if (!requireAdminAccess("Admin sign-in required to edit game stats.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  if (!player || !els.statEditGameSelectModal) return;
  statEditPlayerId = playerId;
  statEditGameId = "";
  renderStatEditGameSelectModal();
  els.statEditGameSelectModal.hidden = false;
  window.setTimeout(() => {
    els.statEditGameSelectList?.querySelector("button")?.focus();
    if (!els.statEditGameSelectList?.querySelector("button")) els.closeStatEditGameSelectBtn?.focus();
  }, 0);
}

function closeStatEditGameSelectModal() {
  if (els.statEditGameSelectModal) els.statEditGameSelectModal.hidden = true;
}

function renderStatEditGameSelectModal() {
  const player = statEditPlayer();
  if (!player || !els.statEditGameSelectList) return;
  if (els.statEditGameSelectTitle) els.statEditGameSelectTitle.textContent = "Select Game to Edit";
  if (els.statEditGameSelectHint) {
    els.statEditGameSelectHint.textContent = `Choose a game-level line for #${player.number || "--"} ${player.name}. Season rates stay calculated from saved game lines.`;
  }
  const games = hittingStatEditGames(player.id);
  els.statEditGameSelectList.innerHTML = games.length
    ? games.map((game) => {
      const edited = hasHittingStatEdit(game, player.id);
      const playerHasLine = playerHasStatsInGame(player.id, game);
      return `<button type="button" class="stat-edit-game-option${edited ? " is-edited" : ""}" data-stat-edit-game-id="${escapeHtml(game.id)}">
        <span class="stat-edit-game-date">${escapeHtml(formatGameDateWithYear(game.date))}</span>
        <span class="stat-edit-game-copy">
          <strong>${escapeHtml(gameMatchupLabel(game))}</strong>
          <small>${escapeHtml(gameScoreLabel(game))}</small>
        </span>
        <span class="stat-edit-game-line">
          <strong>${escapeHtml(statEditGameLine(player.id, game))}</strong>
          <small>${edited ? "Manual edit saved" : playerHasLine ? "Scored line" : "Ready for manual entry"}</small>
        </span>
      </button>`;
    }).join("")
    : `<p class="stat-edit-empty">No completed or scored games are available in ${escapeHtml(statsSeasonLabel())}.</p>`;
}

function gameSpraysForEditDraft(playerId, game) {
  return sprayEventsForGame(game)
    .filter(({ event }) => event.playerId === playerId && event.spray)
    .map(({ event }, index) => {
      const rule = eventRules[event.result] || {};
      return {
        id: event.id || createId("spray"),
        type: rule.hit ? "hit" : "out",
        result: event.result || (rule.hit ? "1B" : "GO"),
        x: event.spray.x,
        y: event.spray.y,
        zone: event.spray.zone || sprayZone(event.spray.x, event.spray.y),
        order: index + 1
      };
    });
}

function hittingStatEditDraft(playerId, game) {
  const existing = hittingStatEditMap(game)[playerId];
  if (existing) return normalizeHittingStatEdit(existing, playerId, game);
  const hit = statsForPlayer(playerId, statsSeasonFilter, game.id);
  const gameEvents = offensiveEventsForStatsGame(game).filter((event) => event.playerId === playerId);
  const resultCount = (result) => gameEvents.filter((event) => event.result === result).length;
  return normalizeHittingStatEdit({
    playerId,
    gameId: game.id,
    stats: {
      ab: hit.ab,
      h: hit.h,
      rispAB: hit.rispAB,
      rispH: hit.rispH,
      singles: hit.singles,
      doubles: hit.doubles,
      triples: hit.triples,
      hr: hit.hr,
      bb: hit.bb,
      hbp: hit.hbp,
      k: hit.k,
      roe: hit.roe,
      errors: hit.errors,
      fc: resultCount("FC"),
      sac: hit.sac,
      dp: hit.dp,
      go: resultCount("GO"),
      lo: resultCount("LO"),
      fo: resultCount("FO"),
      sb: hit.sb,
      cs: hit.cs,
      po: hit.po,
      rbi: hit.rbi,
      runs: runsScoredForPlayer(playerId, statsSeasonFilter, game.id)
    },
    sprays: gameSpraysForEditDraft(playerId, game)
  }, playerId, game);
}

function openStatEditGameModal(playerId, gameId) {
  if (!requireAdminAccess("Admin sign-in required to edit game stats.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  const game = state.games.find((item) => item.id === gameId);
  if (!player || !game || !els.statEditGameModal) return;
  statEditPlayerId = playerId;
  statEditGameId = gameId;
  const draft = hittingStatEditDraft(playerId, game);
  setStatEditInputs(draft.stats);
  setStatEditPosition(draft.position, player, game);
  statEditSprays = normalizeStatEditSprays(draft.sprays);
  setStatEditSprayMode("1B");
  renderStatEditSprayEditor();
  if (els.statEditGameTitle) els.statEditGameTitle.textContent = "Edit Game Stats";
  if (els.statEditGameMeta) {
    els.statEditGameMeta.textContent = `#${player.number || "--"} ${player.name} | ${formatGameDateWithYear(game.date)} | ${gameMatchupLabel(game)}`;
  }
  if (els.clearStatEditGameBtn) {
    const hasSavedEdit = hasHittingStatEdit(game, playerId);
    els.clearStatEditGameBtn.hidden = !hasSavedEdit;
    els.clearStatEditGameBtn.disabled = !hasSavedEdit;
  }
  closeStatEditGameSelectModal();
  els.statEditGameModal.hidden = false;
  window.setTimeout(() => els.statEditInputs?.ab?.focus(), 0);
}

function closeStatEditGameModal() {
  if (els.statEditGameModal) els.statEditGameModal.hidden = true;
  if (reopenBulkStatEditAfterStatModal) {
    reopenBulkStatEditAfterStatModal = false;
    renderBulkStatEditModal();
    if (els.bulkStatEditModal) {
      els.bulkStatEditModal.hidden = false;
      window.setTimeout(() => els.bulkStatEditBody?.querySelector("[data-bulk-stat-spray-player]")?.focus(), 0);
    }
  }
}

function setStatEditInputs(stats = {}) {
  Object.entries(els.statEditInputs || {}).forEach(([key, input]) => {
    if (!input) return;
    const value = Number(stats[key] || 0);
    input.value = value > 0 ? String(value) : "";
  });
}

function setStatEditPosition(position = "", player = null, game = null) {
  if (!els.statEditPosition) return;
  const selected = normalizeGameStatPosition(position);
  const fallback = gameStatPositionFallback(player, game);
  els.statEditPosition.innerHTML = gameStatPositionOptions(selected, fallback);
  els.statEditPosition.value = selected;
}

function collectStatEditPosition() {
  return normalizeGameStatPosition(els.statEditPosition?.value || "");
}

function collectStatEditInputs() {
  const raw = {};
  Object.entries(els.statEditInputs || {}).forEach(([key, input]) => {
    raw[key] = input ? input.value : 0;
  });
  return normalizeManualHittingStats(raw);
}

function setStatEditSprayMode(mode = "1B") {
  statEditSprayMode = normalizeStatEditSprayResult(mode);
  els.statEditSprayModeButtons?.forEach((button) => {
    const active = button.dataset.statEditSprayMode === statEditSprayMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function addStatEditSprayFromPointer(event) {
  if (event.target.closest?.("button, input, select, textarea, [contenteditable='true']")) return;
  const rect = els.statEditSprayChart?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return;
  event.preventDefault();
  addStatEditSprayAt(
    ((event.clientX - rect.left) / rect.width) * 100,
    ((event.clientY - rect.top) / rect.height) * 100
  );
}

function addStatEditSprayAt(x, y) {
  const nextX = Math.max(4, Math.min(96, Math.round(Number(x) || 50)));
  const nextY = Math.max(4, Math.min(96, Math.round(Number(y) || 45)));
  const result = normalizeStatEditSprayResult(statEditSprayMode);
  statEditSprays = normalizeStatEditSprays([
    ...statEditSprays,
    {
      id: createId("spray"),
      type: statEditSprayTypeForResult(result),
      result,
      x: nextX,
      y: nextY,
      zone: sprayZone(nextX, nextY),
      order: statEditSprays.length + 1
    }
  ]);
  renderStatEditSprayEditor();
}

function removeStatEditSpray(sprayId) {
  statEditSprays = statEditSprays.filter((spray) => spray.id !== sprayId);
  renderStatEditSprayEditor();
}

function renderStatEditSprayEditor() {
  const sprays = normalizeStatEditSprays(statEditSprays);
  statEditSprays = sprays;
  if (els.statEditSprayMarkers) {
    els.statEditSprayMarkers.innerHTML = sprays.length
      ? sprays.map((spray) => {
        const label = spray.result || (spray.type === "out" ? "GO" : "1B");
        return `<span class="spray-dot ${escapeHtml(spray.type)}" style="left:${spray.x}%;top:${spray.y}%;" title="${escapeHtml(`${resultLabel(label)}: ${spray.zone}`)}">${escapeHtml(label)}</span>`;
      }).join("")
      : `<span class="spray-empty">Tap the field to add a spray dot</span>`;
  }
  if (els.statEditSprayList) {
    els.statEditSprayList.innerHTML = sprays.length
      ? sprays.map((spray, index) => `<div class="stat-edit-spray-row">
        <span>
          <strong>${index + 1}. ${escapeHtml(spray.result)} - ${escapeHtml(resultLabel(spray.result))}</strong>
          <small>${escapeHtml(spray.zone)} | ${spray.x}, ${spray.y}</small>
        </span>
        <button type="button" class="secondary-action compact-action" data-stat-edit-spray-remove="${escapeHtml(spray.id)}">Remove</button>
      </div>`).join("")
      : `<p class="stat-edit-empty">No spray locations saved for this game line.</p>`;
  }
}

function saveStatEditGameStats(event) {
  event.preventDefault();
  if (!requireAdminAccess("Admin sign-in required to edit game stats.")) return;
  const game = statEditGame();
  const player = statEditPlayer();
  if (!game || !player) return;
  const edit = normalizeHittingStatEdit({
    playerId: player.id,
    gameId: game.id,
    position: collectStatEditPosition(),
    stats: collectStatEditInputs(),
    sprays: statEditSprays,
    updatedAt: new Date().toISOString()
  }, player.id, game);
  hittingStatEditMap(game)[player.id] = edit;
  markSharedGamesDirty(game.id);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    queueCompletedGameSync(game.id, { reason: "game-stat-edit" });
  }
  saveStateWithOptions({ liveSyncReason: "game-stat-edit" });
  closeStatEditGameModal();
  render();
  requestSharedSnapshotSync("game-stat-edit");
  requestCompletedGameSyncRetry("game-stat-edit");
}

function clearStatEditGameStats() {
  if (!requireAdminAccess("Admin sign-in required to clear game stats.")) return;
  const game = statEditGame();
  const player = statEditPlayer();
  if (!game || !player || !hasHittingStatEdit(game, player.id)) return;
  const ok = window.confirm(`Clear saved manual stats for #${player.number || "--"} ${player.name} in ${gameMatchupLabel(game)}?`);
  if (!ok) return;
  delete hittingStatEditMap(game)[player.id];
  markSharedGamesDirty(game.id);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    queueCompletedGameSync(game.id, { reason: "clear-game-stat-edit" });
  }
  saveStateWithOptions({ liveSyncReason: "clear-game-stat-edit" });
  closeStatEditGameModal();
  render();
  requestSharedSnapshotSync("clear-game-stat-edit");
  requestCompletedGameSyncRetry("clear-game-stat-edit");
}

function pitchingStatEditPlayer() {
  return state.roster.find((player) => player.id === pitchingStatEditPlayerId) || null;
}

function pitchingStatEditGame() {
  return state.games.find((game) => game.id === pitchingStatEditGameId) || null;
}

function playerHasPitchingStatsInGame(playerId, game) {
  if (!playerId || !game) return false;
  if (hasPitchingStatEdit(game, playerId)) return true;
  if (game?.pitcherId === playerId || game?.current?.pitcherId === playerId) return true;
  if ((game?.lineupEntries || []).some((entry) => entry?.playerId === playerId && entry?.role === "P")) return true;
  return (game?.events || []).some((event) =>
    event.scope === "defense"
      && (event.pitcherId === playerId || (event.pitches || []).some((pitch) => pitch.pitcherId === playerId))
  );
}

function gameAvailableForPitchingStatEdit(playerId, game) {
  if (!game) return false;
  if (gameIsFinal(game)) return true;
  return playerHasPitchingStatsInGame(playerId, game);
}

function pitchingStatEditGames(playerId) {
  return statsGamesForSeason(statsSeasonFilter)
    .filter((game) => gameAvailableForPitchingStatEdit(playerId, game))
    .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")) || String(b?.time || "").localeCompare(String(a?.time || "")));
}

function pitchingStatEditGameLine(playerId, game) {
  const pit = pitcherStats(playerId, game.id, statsSeasonFilter);
  return `${formatInnings(pit.outs)} IP | ${pit.pitches} NP | ${pit.runs} R | ${pit.k} K`;
}

function pitchingDecisionForEdit(playerId, game) {
  const existing = normalizePitchingStatEdit(pitchingStatEditMap(game)[playerId], playerId, game).stats.decision;
  if (existing) return existing;
  if (!gameIsFinal(game)) return "";
  const decision = lionsPitchingDecision(game);
  if (decision.winPitcherId === playerId) return "win";
  if (decision.lossPitcherId === playerId) return "loss";
  if (decision.noDecisionPitcherIds.includes(playerId)) return "noDecision";
  return "";
}

function pitchingStatEditDraft(playerId, game) {
  const existing = pitchingStatEditMap(game)[playerId];
  if (existing) return normalizePitchingStatEdit(existing, playerId, game);
  const pit = pitcherStats(playerId, game.id, statsSeasonFilter);
  return normalizePitchingStatEdit({
    playerId,
    gameId: game.id,
    stats: {
      outs: pit.outs,
      pitches: pit.pitches,
      balls: pit.balls,
      strikes: pit.strikes,
      batters: pit.batters,
      h: pit.h,
      hr: pit.hr,
      runs: pit.runs,
      earnedRuns: pit.earnedRuns,
      bb: pit.bb,
      hbp: pit.hbp,
      k: pit.k,
      decision: pitchingDecisionForEdit(playerId, game)
    }
  }, playerId, game);
}

function openPitchingStatEditGameSelectModal(playerId) {
  if (!requireAdminAccess("Admin sign-in required to edit pitching stats.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  if (!player || !els.pitchingStatEditGameSelectModal) return;
  pitchingStatEditPlayerId = playerId;
  pitchingStatEditGameId = "";
  renderPitchingStatEditGameSelectModal();
  els.pitchingStatEditGameSelectModal.hidden = false;
  window.setTimeout(() => {
    els.pitchingStatEditGameSelectList?.querySelector("button")?.focus();
    if (!els.pitchingStatEditGameSelectList?.querySelector("button")) els.closePitchingStatEditGameSelectBtn?.focus();
  }, 0);
}

function closePitchingStatEditGameSelectModal() {
  if (els.pitchingStatEditGameSelectModal) els.pitchingStatEditGameSelectModal.hidden = true;
}

function renderPitchingStatEditGameSelectModal() {
  const player = pitchingStatEditPlayer();
  if (!player || !els.pitchingStatEditGameSelectList) return;
  if (els.pitchingStatEditGameSelectTitle) els.pitchingStatEditGameSelectTitle.textContent = "Select Game to Edit";
  if (els.pitchingStatEditGameSelectHint) {
    els.pitchingStatEditGameSelectHint.textContent = `Choose a game-level pitching line for #${player.number || "--"} ${player.name}. Season rates stay calculated from saved game lines.`;
  }
  const games = pitchingStatEditGames(player.id);
  els.pitchingStatEditGameSelectList.innerHTML = games.length
    ? games.map((game) => {
      const edited = hasPitchingStatEdit(game, player.id);
      const playerHasLine = playerHasPitchingStatsInGame(player.id, game);
      return `<button type="button" class="stat-edit-game-option${edited ? " is-edited" : ""}" data-pitching-stat-edit-game-id="${escapeHtml(game.id)}">
        <span class="stat-edit-game-date">${escapeHtml(formatGameDateWithYear(game.date))}</span>
        <span class="stat-edit-game-copy">
          <strong>${escapeHtml(gameMatchupLabel(game))}</strong>
          <small>${escapeHtml(gameScoreLabel(game))}</small>
        </span>
        <span class="stat-edit-game-line">
          <strong>${escapeHtml(pitchingStatEditGameLine(player.id, game))}</strong>
          <small>${edited ? "Manual edit saved" : playerHasLine ? "Scored line" : "Ready for manual entry"}</small>
        </span>
      </button>`;
    }).join("")
    : `<p class="stat-edit-empty">No completed or scored games are available in ${escapeHtml(statsSeasonLabel())}.</p>`;
}

function openPitchingStatEditGameModal(playerId, gameId) {
  if (!requireAdminAccess("Admin sign-in required to edit pitching stats.")) return;
  const player = state.roster.find((item) => item.id === playerId);
  const game = state.games.find((item) => item.id === gameId);
  if (!player || !game || !els.pitchingStatEditGameModal) return;
  pitchingStatEditPlayerId = playerId;
  pitchingStatEditGameId = gameId;
  const draft = pitchingStatEditDraft(playerId, game);
  setPitchingStatEditInputs(draft.stats);
  if (els.pitchingStatEditGameTitle) els.pitchingStatEditGameTitle.textContent = "Edit Pitching Stats";
  if (els.pitchingStatEditGameMeta) {
    els.pitchingStatEditGameMeta.textContent = `#${player.number || "--"} ${player.name} | ${formatGameDateWithYear(game.date)} | ${gameMatchupLabel(game)}`;
  }
  closePitchingStatEditGameSelectModal();
  els.pitchingStatEditGameModal.hidden = false;
  window.setTimeout(() => els.pitchingStatEditInputs?.ip?.focus(), 0);
}

function closePitchingStatEditGameModal() {
  if (els.pitchingStatEditGameModal) els.pitchingStatEditGameModal.hidden = true;
}

function pitchingStatInputValue(stats = {}, key = "") {
  const value = Number(stats[key] || 0);
  return value > 0 ? String(value) : "";
}

function setPitchingStatEditInputs(stats = {}) {
  Object.entries(els.pitchingStatEditInputs || {}).forEach(([key, input]) => {
    if (!input) return;
    if (key === "ip") {
      input.value = Number(stats.outs || 0) > 0 ? formatInnings(stats.outs) : "";
      return;
    }
    if (key === "decision") {
      input.value = normalizePitchingDecision(stats.decision);
      return;
    }
    input.value = pitchingStatInputValue(stats, key);
  });
}

function collectPitchingStatEditInputs() {
  const raw = {};
  Object.entries(els.pitchingStatEditInputs || {}).forEach(([key, input]) => {
    raw[key] = input ? input.value : "";
  });
  return normalizeManualPitchingStats(raw);
}

function savePitchingStatEditGameStats(event) {
  event.preventDefault();
  if (!requireAdminAccess("Admin sign-in required to edit pitching stats.")) return;
  const game = pitchingStatEditGame();
  const player = pitchingStatEditPlayer();
  if (!game || !player) return;
  const edit = normalizePitchingStatEdit({
    playerId: player.id,
    gameId: game.id,
    stats: collectPitchingStatEditInputs(),
    updatedAt: new Date().toISOString()
  }, player.id, game);
  pitchingStatEditMap(game)[player.id] = edit;
  markSharedGamesDirty(game.id);
  if (gameIsFinal(game)) {
    markGameSyncPending(game);
    queueCompletedGameSync(game.id, { reason: "pitching-stat-edit" });
  }
  saveStateWithOptions({ liveSyncReason: "pitching-stat-edit" });
  closePitchingStatEditGameModal();
  render();
  requestSharedSnapshotSync("pitching-stat-edit");
  requestCompletedGameSyncRetry("pitching-stat-edit");
}

function renderLeaders() {
  const focusedPlayerId = statsPlayerFocus !== "all" ? statsPlayerFocus : "";
  const hitterRows = state.roster
    .map((player) => ({ player, stats: statsForPlayer(player.id, statsSeasonFilter), gp: gamesPlayedForPlayer(player.id, statsSeasonFilter) }))
    .filter((row) => !focusedPlayerId || row.player.id === focusedPlayerId)
    .filter((row) => playerHasHittingLine({ player: row.player, hit: row.stats, gp: row.gp }));
  const pitcherRows = state.roster
    .map((player) => ({ player, stats: pitcherStats(player.id, null, statsSeasonFilter) }))
    .filter((row) => !focusedPlayerId || row.player.id === focusedPlayerId)
    .filter((row) => hasPitchingStats(row.stats));
  renderStatsMode();
  const cards = statsMode === "pitching"
    ? [
      leaderCard("ERA", pitcherRows, (row) => row.stats.era, formatEra, { lowWins: true, includeZero: true, targetId: "statsPitchingSection" }),
      leaderCard("K", pitcherRows, (row) => row.stats.k, String, { targetId: "statsPitchingSection" }),
      leaderCard("Wins", pitcherRows, (row) => row.stats.wins, String, { targetId: "statsPitchingSection" }),
      leaderCard("WHIP", pitcherRows, (row) => row.stats.whip, (value) => value.toFixed(2), { lowWins: true, includeZero: true, targetId: "statsPitchingSection" })
    ]
    : [
      leaderCard("AVG", hitterRows, (row) => row.stats.avg, (value) => formatRate(value), { targetId: "statsHittingSection" }),
      leaderCard("OBP", hitterRows, (row) => row.stats.obp, (value) => formatRate(value), { targetId: "statsHittingSection" }),
      leaderCard("RBI", hitterRows, (row) => row.stats.rbi, String, { targetId: "statsHittingSection" }),
      leaderCard("OPS", hitterRows, (row) => row.stats.ops, (value) => formatRate(value), { targetId: "statsHittingSection" })
    ];
  els.leadersGrid.innerHTML = cards.join("");
}

function leaderCard(label, rows, scorer, formatter, options = {}) {
  const normalizedOptions = typeof options === "boolean" ? { lowWins: options } : options;
  const { lowWins = false, includeZero = false, targetId = "" } = normalizedOptions;
  const leaders = rows
    .filter((row) => {
      const value = scorer(row);
      if (!Number.isFinite(value)) return false;
      return value > 0 || includeZero || (row.player.active && !lowWins);
    })
    .sort((a, b) => lowWins ? scorer(a) - scorer(b) : scorer(b) - scorer(a))
    .slice(0, 3);
  const topLeader = leaders[0] || null;
  const topValue = topLeader ? formatter(scorer(topLeader)) : "--";
  return `<article class="leader-card stats-leader-card">
    <div class="stats-leader-card-head">
      <h3>${escapeHtml(label)}</h3>
      <strong class="stats-leader-card-value">${escapeHtml(topValue)}</strong>
    </div>
    <div class="stats-leader-list">
      ${leaders.length
        ? leaders.map((row, index) => `<div class="leader-row stats-leader-row${index === 0 ? " is-top" : ""}">
            <span>${index + 1}. ${escapeHtml(row.player.name)}</span>
            <strong>${escapeHtml(formatter(scorer(row)))}</strong>
          </div>`).join("")
        : `<p class="player-meta">No data yet.</p>`}
    </div>
    <button type="button" class="secondary-action stats-leader-action" ${targetId ? `data-scroll-target="${escapeHtml(targetId)}"` : ""}>View Full List &gt;</button>
  </article>`;
}

function renderHomeLeaderFeatureCard(label, rows, scorer, formatter, options = {}) {
  const normalizedOptions = typeof options === "boolean" ? { lowWins: options } : options;
  const { lowWins = false, includeZero = false, tieBreaker = null } = normalizedOptions;
  const leader = rows
    .filter((row) => {
      const value = scorer(row);
      if (!Number.isFinite(value)) return false;
      return value > 0 || includeZero || (row.player.active && !lowWins);
    })
    .sort((a, b) => compareLeaderRows(a, b, scorer, { lowWins, tieBreaker }))[0] || null;
  if (!leader) {
    return `<article class="home-feature-leader-card is-empty"><div class="home-feature-leader-stat"><span>${escapeHtml(label)}</span><strong>--</strong></div><p class="player-meta">No data yet.</p></article>`;
  }
  const player = leader.player;
  const statValue = formatter(scorer(leader));
  return `<article class="home-feature-leader-card">
    <div class="home-feature-leader-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(statValue)}</strong>
    </div>
    <div class="home-feature-leader-body">
      <span class="home-feature-leader-badge">#${escapeHtml(player.number || "--")}</span>
      <h4>${escapeHtml(player.name)}</h4>
    </div>
  </article>`;
}

function compareLeaderRows(a, b, scorer, options = {}) {
  const { lowWins = false, tieBreaker = null } = options;
  const valueA = Number(scorer(a));
  const valueB = Number(scorer(b));
  if (Math.abs(valueA - valueB) > 0.0000001) {
    return lowWins ? valueA - valueB : valueB - valueA;
  }
  if (typeof tieBreaker === "function") {
    const tieA = Number(tieBreaker(a)) || 0;
    const tieB = Number(tieBreaker(b)) || 0;
    if (tieA !== tieB) return tieB - tieA;
  }
  return String(a?.player?.name || "").localeCompare(String(b?.player?.name || ""));
}

function homeLeaderGameLine(label, row) {
  if (!row?.player || !row?.stats) return "Season snapshot";
  const statLabel = String(label || "").toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, "runs")) {
    if (statLabel === "AVG") return `${gamesPlayedForPlayer(row.player.id)} G | ${row.stats.h} H | ${row.runs} R`;
    if (statLabel === "H") return `${gamesPlayedForPlayer(row.player.id)} G | ${formatRate(row.stats.avg)} AVG | ${row.stats.rbi} RBI`;
    return `${gamesPlayedForPlayer(row.player.id)} G | ${formatRate(row.stats.avg)} AVG | ${row.stats.hr} HR`;
  }
  if (statLabel === "ERA") return `${formatInnings(row.stats.outs)} IP | ${row.stats.k} K | ${row.stats.wins} W`;
  if (statLabel === "K") return `${formatInnings(row.stats.outs)} IP | ${formatEra(row.stats.era)} ERA | ${row.stats.wins} W`;
  return `${formatInnings(row.stats.outs)} IP | ${row.stats.k} K | ${formatEra(row.stats.era)} ERA`;
}

function gameUsesLineupForGamesPlayed(game) {
  if (!game || game.quickScored || game.scoringSource === "quick-score") return false;
  const hasScoredEvent = (Array.isArray(game.events) ? game.events : []).some((event) =>
    event
      && !event.manualStatEdit
      && event.scope !== "lineup"
      && (eventRules[event.result]?.pa || scorebookBaseRunningResults.has(event.result))
  );
  if (hasScoredEvent) return true;
  return (Array.isArray(game.plateAppearances) ? game.plateAppearances : []).some((appearance) =>
    Boolean(appearance?.result || appearance?.completedAt || (Array.isArray(appearance?.pitches) && appearance.pitches.length))
  );
}

function gamesPlayedForPlayer(playerId, season = null) {
  return statsGamesForSeason(season).filter((game) => {
    const storedLineupIds = Array.isArray(game.lineupEntries)
      ? game.lineupEntries
        .filter((entry) => entry?.active !== false && entry?.playerId)
        .map((entry) => entry.playerId)
      : [];
    return hasHittingStatEdit(game, playerId)
      || offensiveEventsForStatsGame(game).some((event) => event.playerId === playerId)
      || (gameUsesLineupForGamesPlayed(game) && storedLineupIds.includes(playerId));
  }).length;
}

function updateSortIndicators() {
  document.querySelectorAll("[data-hit-sort]").forEach((button) => {
    const active = button.dataset.hitSort === hittingSort.key;
    button.classList.toggle("is-sorted", active);
    button.dataset.direction = active ? hittingSort.direction : "";
  });
  document.querySelectorAll("[data-pit-sort]").forEach((button) => {
    const active = button.dataset.pitSort === pitchingSort.key;
    button.classList.toggle("is-sorted", active);
    button.dataset.direction = active ? pitchingSort.direction : "";
  });
}

function mobileStatPill(label, value, isLeader = false) {
  return `<span class="stats-mobile-pill${isLeader ? " is-leader" : ""}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value))}</strong></span>`;
}

function mobileStatIsLeader(leaderMap, key, playerId) {
  return Boolean(leaderMap?.[key]?.has(playerId));
}

function mobileHittingLeaderMap(rows = []) {
  return mobileLeaderMap(rows, [
    { key: "gp", value: (row) => row.gp, eligible: (row) => row.gp > 0 },
    { key: "pa", value: (row) => row.hit.pa, eligible: (row) => row.hit.pa > 0 },
    { key: "avg", value: (row) => row.hit.avg, eligible: (row) => row.hit.ab > 0 },
    { key: "h", value: (row) => row.hit.h, eligible: (row) => row.hit.h > 0 },
    { key: "ops", value: (row) => row.hit.ops, eligible: (row) => row.hit.pa > 0 },
    { key: "rbi", value: (row) => row.hit.rbi, eligible: (row) => row.hit.rbi > 0 },
    { key: "runs", value: (row) => row.hit.runs, eligible: (row) => row.hit.runs > 0 },
    { key: "sb", value: (row) => row.hit.sb, eligible: (row) => row.hit.sb > 0 },
    { key: "k", value: (row) => row.hit.k, eligible: (row) => row.hit.pa > 0, lowWins: true }
  ]);
}

function mobilePitchingLeaderMap(rows = []) {
  return mobileLeaderMap(rows, [
    { key: "record", value: (row) => row.pit.wins - row.pit.losses, eligible: (row) => row.pit.wins > 0 },
    { key: "outs", value: (row) => row.pit.outs, eligible: (row) => row.pit.outs > 0 },
    { key: "era", value: (row) => row.pit.era, eligible: (row) => row.pit.outs > 0, lowWins: true },
    { key: "k", value: (row) => row.pit.k, eligible: (row) => row.pit.k > 0 },
    { key: "bb", value: (row) => row.pit.bb, eligible: (row) => row.pit.outs > 0, lowWins: true },
    { key: "whip", value: (row) => row.pit.whip, eligible: (row) => row.pit.outs > 0, lowWins: true },
    { key: "strikeRate", value: (row) => row.pit.strikeRate, eligible: (row) => row.pit.pitches > 0 },
    { key: "bbRate", value: (row) => row.pit.bbRate, eligible: (row) => row.pit.batters > 0, lowWins: true }
  ]);
}

function mobileLeaderMap(rows = [], metrics = []) {
  return metrics.reduce((map, metric) => {
    const eligibleRows = rows
      .map((row) => ({ row, value: Number(metric.value(row)) }))
      .filter(({ row, value }) => Number.isFinite(value) && (!metric.eligible || metric.eligible(row)));
    if (!eligibleRows.length) {
      map[metric.key] = new Set();
      return map;
    }
    const values = eligibleRows.map((item) => item.value);
    const best = metric.lowWins ? Math.min(...values) : Math.max(...values);
    map[metric.key] = new Set(
      eligibleRows
        .filter((item) => Math.abs(item.value - best) <= 0.0000001)
        .map((item) => item.row.player.id)
    );
    return map;
  }, {});
}

function mobileHittingSortLabel() {
  if (hittingSort.key === "name") return "Name";
  const labels = {
    gp: "Games",
    pa: "PA",
    ab: "AB",
    singles: "1B",
    doubles: "2B",
    triples: "3B",
    hr: "HR",
    avg: "AVG",
    obp: "OBP",
    slg: "SLG",
    ops: "OPS",
    runs: "Runs",
    h: "Hits",
    rbi: "RBI",
    bb: "BB",
    hbp: "HBP",
    k: "K",
    sb: "SB",
    cs: "CS",
    po: "PO",
    roe: "ROE",
    errors: "E"
  };
  return labels[hittingSort.key] || hittingSort.key.toUpperCase();
}

function mobilePitchingSortLabel() {
  if (pitchingSort.key === "name") return "Name";
  const labels = {
    losses: "Losses",
    noDecision: "ND",
    outs: "IP",
    pitches: "NP",
    balls: "Balls",
    strikes: "Strikes",
    whip: "WHIP",
    k: "K",
    wins: "Wins",
    batters: "BF",
    h: "Hits",
    runs: "Runs",
    era: "ERA",
    strikeRate: "Strike %",
    kRate: "K %",
    bbRate: "BB %",
    bb: "BB",
    hbp: "HBP",
    kbb: "K/BB",
    k9: "K/9",
    r9: "R/9",
    pitchesPerInning: "P/IP"
  };
  return labels[pitchingSort.key] || pitchingSort.key.toUpperCase();
}

function formatMobileHittingSortValue(hit, gp, player) {
  if (hittingSort.key === "name") return player.name;
  if (hittingSort.key === "gp") return String(gp);
  const value = hit[hittingSort.key] ?? 0;
  if (["avg", "obp", "slg", "ops"].includes(hittingSort.key)) return formatRate(value);
  return String(value);
}

function formatMobilePitchingSortValue(pit, player) {
  if (pitchingSort.key === "name") return player.name;
  if (pitchingSort.key === "outs") return formatInnings(pit.outs);
  if (pitchingSort.key === "era") return formatEra(pit.era);
  const value = pit[pitchingSort.key] ?? 0;
  if (pitchingSort.key === "whip") return Number(value).toFixed(2);
  if (["k9", "r9", "pitchesPerInning", "kbb"].includes(pitchingSort.key)) return Number(value).toFixed(1);
  if (["strikeRate", "kRate", "bbRate"].includes(pitchingSort.key)) return `${Math.round(Number(value) * 100)}%`;
  return String(value);
}

function compareHittingRows(a, b) {
  const key = hittingSort.key;
  const direction = hittingSort.direction === "asc" ? 1 : -1;
  const valueFor = (row) => {
    if (key === "name") return row.player.name;
    if (key === "gp") return row.gp;
    return row.hit[key] ?? 0;
  };
  const left = valueFor(a);
  const right = valueFor(b);
  if (typeof left === "string") return left.localeCompare(right) * direction;
  return (left - right) * direction;
}

function comparePitchingRows(a, b) {
  const key = pitchingSort.key;
  const direction = pitchingSort.direction === "asc" ? 1 : -1;
  const valueFor = (row) => key === "name" ? row.player.name : row.pit[key] ?? 0;
  const left = valueFor(a);
  const right = valueFor(b);
  if (typeof left === "string") return left.localeCompare(right) * direction;
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  if (!Number.isFinite(left)) return 1;
  if (!Number.isFinite(right)) return -1;
  return (left - right) * direction;
}

function metricCard(label, value, copy) {
  return `<article class="metric-card">
    <span class="player-meta">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <div class="player-meta">${escapeHtml(copy)}</div>
  </article>`;
}

function renderValueBoard() {
  const ranked = state.roster
    .filter((player) => state.lineup.includes(player.id))
    .map((player) => ({ player, value: playerValue(player) }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...ranked.map((item) => item.value), 1);
  els.valueBoard.innerHTML = ranked
    .map(({ player, value }) => {
      const pct = Math.max(8, Math.round((value / max) * 100));
      return `<div class="value-row">
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        <span>${Math.round(value)}</span>
      </div>`;
    })
    .join("");
}

function buildOptimizedLineup() {
  const candidates = state.roster
    .filter((player) => state.lineup.includes(player.id))
    .map((player) => {
      const stats = statsForPlayer(player.id);
      return {
        player,
        stats,
        overall: playerValue(player),
        obp: safeRate(stats.obp) * 100 + player.grades.contact * 0.35,
        power: safeRate(stats.slg) * 75 + player.grades.power,
        speed: player.grades.speed + stats.sb * 4 - stats.cs * 5,
        contact: (1 - safeRate(stats.kRate)) * 60 + contactQuality(stats) * 45 + player.grades.contact * 0.45
      };
    });

  const selected = [];
  const takeBest = (scorer) => {
    const remaining = candidates.filter((item) => !selected.includes(item.player.id));
    if (!remaining.length) return;
    remaining.sort((a, b) => scorer(b) - scorer(a));
    selected.push(remaining[0].player.id);
  };

  takeBest((item) => item.obp * 1.3 + item.speed + item.contact);
  takeBest((item) => item.obp * 1.2 + item.contact * 1.1);
  takeBest((item) => item.overall + item.contact + item.power * 0.5);
  takeBest((item) => item.power * 1.35 + item.overall);
  takeBest((item) => item.overall + item.power);

  candidates
    .filter((item) => !selected.includes(item.player.id))
    .sort((a, b) => b.overall - a.overall)
    .forEach((item) => selected.push(item.player.id));

  if (selected.length >= 9) {
    const lastThree = selected.slice(6).sort((a, b) => {
      const playerA = state.roster.find((player) => player.id === a);
      const playerB = state.roster.find((player) => player.id === b);
      return playerValue(playerB) + playerB.grades.speed * 0.25 - (playerValue(playerA) + playerA.grades.speed * 0.25);
    });
    return [...selected.slice(0, 6), ...lastThree];
  }
  return selected;
}

function renderOptimizedLineup() {
  if (!optimizedIds.length) optimizedIds = buildOptimizedLineup();
  const defensiveMap = assignDefense(optimizedIds);
  els.optimizerMode.textContent = "Stat-informed order";
  els.optimizedLineup.innerHTML = optimizedIds
    .map((id) => {
      const player = state.roster.find((item) => item.id === id);
      if (!player) return "";
      const stats = statsForPlayer(id);
      const role = battingRole(optimizedIds.indexOf(id));
      return `<li>
        <strong>${escapeHtml(player.name)}</strong>
        <div class="player-meta">${role} | ${escapeHtml(defensiveMap[id] || "UTIL")} | OBP ${formatRate(stats.obp)} | SLG ${formatRate(stats.slg)} | Value ${Math.round(playerValue(player))}</div>
      </li>`;
    })
    .join("");
}

function battingRole(index) {
  const roles = ["Table setter", "Contact bridge", "Best all-around bat", "Run producer", "Damage support", "Pressure bat", "Defensive balance", "Second leadoff", "Turnover speed"];
  return roles[index] || "Depth matchup";
}

function assignDefense(ids) {
  const positions = ["C", "P", "SS", "CF", "2B", "3B", "1B", "LF", "RF"];
  const assignment = {};
  const used = new Set();
  positions.forEach((position) => {
    const best = ids
      .map((id) => state.roster.find((player) => player.id === id))
      .filter(Boolean)
      .filter((player) => !used.has(player.id))
      .filter((player) => playerHasPosition(player, position))
      .sort((a, b) => b.grades.defense - a.grades.defense)[0];
    if (best) {
      assignment[best.id] = position;
      used.add(best.id);
    }
  });
  ids.forEach((id) => {
    if (!assignment[id]) assignment[id] = "UTIL";
  });
  return assignment;
}

function playerValue(player) {
  const stats = statsForPlayer(player.id);
  const runs = runsScoredForPlayer(player.id);
  return Math.max(0, stats.tb + stats.bb + stats.hbp + stats.rbi + runs + stats.sb + stats.sac - stats.cs - stats.po);
}

function hittingStatEditMap(game) {
  if (!game) return {};
  if (!game.hittingStatEdits || typeof game.hittingStatEdits !== "object" || Array.isArray(game.hittingStatEdits)) {
    game.hittingStatEdits = {};
  }
  return game.hittingStatEdits;
}

function hasHittingStatEdit(game, playerId) {
  return Boolean(game && playerId && Object.prototype.hasOwnProperty.call(hittingStatEditMap(game), playerId));
}

function pitchingStatEditMap(game) {
  if (!game) return {};
  if (!game.pitchingStatEdits || typeof game.pitchingStatEdits !== "object" || Array.isArray(game.pitchingStatEdits)) {
    game.pitchingStatEdits = {};
  }
  return game.pitchingStatEdits;
}

function hasPitchingStatEdit(game, playerId) {
  return Boolean(game && playerId && Object.prototype.hasOwnProperty.call(pitchingStatEditMap(game), playerId));
}

function manualStatValue(input = {}, ...keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (value === null || value === undefined || String(value).trim() === "") continue;
    return clampNumber(value, 0, 99);
  }
  return null;
}

function normalizeManualHittingStats(input = {}) {
  let doubles = manualStatValue(input, "doubles", "2B") ?? 0;
  let triples = manualStatValue(input, "triples", "3B") ?? 0;
  let hr = manualStatValue(input, "hr", "HR") ?? 0;
  let singles = manualStatValue(input, "singles", "1B") ?? 0;
  let h = manualStatValue(input, "h", "H") ?? singles + doubles + triples + hr;
  const hitBreakdown = singles + doubles + triples + hr;
  if (h < hitBreakdown) h = hitBreakdown;
  if (h > hitBreakdown) singles += h - hitBreakdown;
  const k = manualStatValue(input, "k", "K") ?? 0;
  const roe = manualStatValue(input, "roe", "ROE") ?? 0;
  const fc = manualStatValue(input, "fc", "FC") ?? 0;
  const sac = manualStatValue(input, "sac", "SAC") ?? 0;
  const dp = manualStatValue(input, "dp", "DP") ?? 0;
  const go = manualStatValue(input, "go", "GO") ?? 0;
  const lo = manualStatValue(input, "lo", "LO") ?? 0;
  const fo = manualStatValue(input, "fo", "FO") ?? 0;
  const explicitAtBats = h + k + roe + fc + dp + go + lo + fo;
  let ab = manualStatValue(input, "ab", "AB") ?? explicitAtBats;
  if (ab < explicitAtBats) ab = explicitAtBats;
  let rispAB = manualStatValue(input, "rispAB", "rispAb", "RISPAB", "RISP AB");
  let rispH = manualStatValue(input, "rispH", "RISPH", "RISP H") ?? 0;
  if (rispAB === null) rispAB = rispH;
  if (rispAB > ab) rispAB = ab;
  if (rispH > rispAB) rispH = rispAB;
  if (rispH > h) rispH = h;
  return {
    ab,
    h,
    rispAB,
    rispH,
    singles,
    doubles,
    triples,
    hr,
    bb: manualStatValue(input, "bb", "BB") ?? 0,
    hbp: manualStatValue(input, "hbp", "HBP") ?? 0,
    k,
    roe,
    errors: manualStatValue(input, "errors", "E") ?? 0,
    fc,
    sac,
    dp,
    go,
    lo,
    fo,
    sb: manualStatValue(input, "sb", "SB") ?? 0,
    cs: manualStatValue(input, "cs", "CS") ?? 0,
    po: manualStatValue(input, "po", "PO") ?? 0,
    rbi: manualStatValue(input, "rbi", "RBI") ?? 0,
    runs: manualStatValue(input, "runs", "R") ?? 0
  };
}

function normalizePitchingDecision(value = "") {
  return ["win", "loss", "noDecision"].includes(value) ? value : "";
}

function parsePitchingOuts(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^\d+(?:\.[012])?$/.test(raw)) {
    const [inningsRaw, outsRaw = "0"] = raw.split(".");
    return clampNumber(inningsRaw, 0, 99) * 3 + clampNumber(outsRaw, 0, 2);
  }
  return clampNumber(raw, 0, 297);
}

function normalizeManualPitchingStats(input = {}) {
  const storedOuts = manualStatValue(input, "outs", "OUTS");
  let outs = parsePitchingOuts(input.ip ?? input.IP);
  if (outs === null) outs = storedOuts ?? 0;
  let h = manualStatValue(input, "h", "H") ?? 0;
  const hr = manualStatValue(input, "hr", "HR") ?? 0;
  if (h < hr) h = hr;
  const k = manualStatValue(input, "k", "K") ?? 0;
  if (outs < k) outs = k;
  const bb = manualStatValue(input, "bb", "BB") ?? 0;
  const hbp = manualStatValue(input, "hbp", "HBP") ?? 0;
  const sv = manualStatValue(input, "sv", "SV") ?? 0;
  const runs = manualStatValue(input, "runs", "R") ?? 0;
  let earnedRuns = manualStatValue(input, "earnedRuns", "ER") ?? 0;
  if (runs < earnedRuns) earnedRuns = runs;
  const balls = manualStatValue(input, "balls", "B") ?? 0;
  const strikes = manualStatValue(input, "strikes", "S") ?? 0;
  let pitches = manualStatValue(input, "pitches", "NP") ?? (balls + strikes);
  if (pitches < balls + strikes) pitches = balls + strikes;
  const nonStrikeoutOuts = Math.max(0, outs - k);
  const minimumBatters = h + bb + hbp + k + nonStrikeoutOuts;
  let batters = manualStatValue(input, "batters", "BF") ?? minimumBatters;
  if (batters < minimumBatters) batters = minimumBatters;
  return {
    outs,
    pitches,
    balls,
    strikes,
    batters,
    h,
    hr,
    runs,
    earnedRuns,
    bb,
    hbp,
    k,
    sv,
    decision: normalizePitchingDecision(input.decision)
  };
}

function normalizePitchingStatEdit(edit = {}, playerId = "", game = null) {
  return {
    playerId: edit?.playerId || playerId,
    gameId: edit?.gameId || game?.id || "",
    stats: normalizeManualPitchingStats(edit?.stats || edit || {}),
    updatedAt: edit?.updatedAt || new Date().toISOString()
  };
}

function normalizeStatEditSprayResult(result = "1B", fallback = "1B") {
  const normalized = String(result || "").trim().toUpperCase();
  if (statEditSprayResultSet.has(normalized)) return normalized;
  return statEditSprayResultSet.has(fallback) ? fallback : "1B";
}

function statEditSprayTypeForResult(result = "1B") {
  return statEditSprayHitResults.has(normalizeStatEditSprayResult(result)) ? "hit" : "out";
}

function normalizeStatEditSprays(sprays = []) {
  return (Array.isArray(sprays) ? sprays : [])
    .map((spray, index) => {
      const x = Math.max(4, Math.min(96, Math.round(Number(spray?.x) || 50)));
      const y = Math.max(4, Math.min(96, Math.round(Number(spray?.y) || 45)));
      const fallback = spray?.type === "out" ? "GO" : "1B";
      const result = normalizeStatEditSprayResult(spray?.result, fallback);
      const type = statEditSprayTypeForResult(result);
      return {
        id: spray?.id || createId("spray"),
        type,
        result,
        x,
        y,
        zone: spray?.zone || sprayZone(x, y),
        order: Number(spray?.order || index + 1)
      };
    });
}

function normalizeHittingStatEdit(edit = {}, playerId = "", game = null) {
  return {
    playerId: edit.playerId || playerId,
    gameId: edit.gameId || game?.id || "",
    position: normalizeGameStatPosition(edit.position || edit.gamePosition || edit.role || ""),
    stats: normalizeManualHittingStats(edit.stats || edit),
    sprays: normalizeStatEditSprays(edit.sprays || []),
    updatedAt: edit.updatedAt || new Date().toISOString()
  };
}

function manualRunAdvancements(playerId, runs = 0) {
  return Array.from({ length: Math.max(0, Number(runs) || 0) }, () => ({
    runnerId: playerId,
    from: "manual",
    to: "home",
    out: false,
    remove: false
  }));
}

function manualHittingStatEvent(game, playerId, result, index, edit, extras = {}) {
  const rule = eventRules[result] || {};
  return {
    id: `stat-edit-${game.id}-${playerId}-${index}`,
    gameId: game.id,
    playerId,
    result,
    runs: 0,
    rbi: extras.rbi || 0,
    hasRISP: Boolean(extras.hasRISP),
    contact: "none",
    launch: rule.launch || "none",
    leverage: "neutral",
    inning: 1,
    half: lionsSide(game) === "away" ? "top" : "bottom",
    outsBefore: 0,
    basesBefore: emptyBases(false),
    scope: "offense",
    errorOnPlay: Boolean(extras.errorOnPlay),
    note: "Manual game stat edit",
    spray: null,
    pitches: [],
    runnerAdvancements: extras.runnerAdvancements || [],
    createdAt: edit.updatedAt || new Date().toISOString(),
    manualStatEdit: true
  };
}

function applyManualHittingRispToEvents(events = [], stats = {}) {
  let rispHitsRemaining = Math.max(0, Number(stats.rispH) || 0);
  events
    .filter((event) => eventRules[event.result]?.ab && eventRules[event.result]?.hit)
    .forEach((event) => {
      if (rispHitsRemaining <= 0) return;
      event.hasRISP = true;
      rispHitsRemaining -= 1;
    });
  let rispAtBatsRemaining = Math.max(0, Number(stats.rispAB) || 0) - Math.max(0, Number(stats.rispH) || 0);
  events
    .filter((event) => eventRules[event.result]?.ab && !event.hasRISP)
    .forEach((event) => {
      if (rispAtBatsRemaining <= 0) return;
      event.hasRISP = true;
      rispAtBatsRemaining -= 1;
    });
}

function manualHittingStatEvents(game, playerId, rawEdit = {}) {
  const edit = normalizeHittingStatEdit(rawEdit, playerId, game);
  const stats = edit.stats;
  const events = [];
  const pushEvents = (result, count, extrasForIndex = () => ({})) => {
    for (let index = 0; index < count; index += 1) {
      events.push(manualHittingStatEvent(game, playerId, result, events.length, edit, extrasForIndex(index)));
    }
  };
  pushEvents("1B", stats.singles);
  pushEvents("2B", stats.doubles);
  pushEvents("3B", stats.triples);
  pushEvents("HR", stats.hr);
  pushEvents("K", stats.k);
  pushEvents("ROE", stats.roe, (index) => ({ errorOnPlay: index < stats.errors }));
  pushEvents("FC", stats.fc);
  pushEvents("DP", stats.dp);
  pushEvents("GO", stats.go);
  pushEvents("LO", stats.lo);
  pushEvents("FO", stats.fo);
  const specifiedAtBats = stats.h + stats.k + stats.roe + stats.fc + stats.dp + stats.go + stats.lo + stats.fo;
  pushEvents("GO", Math.max(0, stats.ab - specifiedAtBats));
  pushEvents("SAC", stats.sac);
  pushEvents("BB", stats.bb);
  pushEvents("HBP", stats.hbp);
  pushEvents("SB", stats.sb);
  pushEvents("CS", stats.cs);
  pushEvents("PO", stats.po);
  pushEvents("SUB", Math.max(0, stats.errors - stats.roe), () => ({ errorOnPlay: true }));
  if (!events.length && (stats.rbi || stats.runs)) {
    events.push(manualHittingStatEvent(game, playerId, "SUB", events.length, edit));
  }
  applyManualHittingRispToEvents(events, stats);
  if (events.length) {
    events[0].rbi = stats.rbi;
    events[0].runnerAdvancements = manualRunAdvancements(playerId, stats.runs);
  }
  return events;
}

function manualSprayEventsForGame(game, playerId, rawEdit = {}) {
  const edit = normalizeHittingStatEdit(rawEdit, playerId, game);
  return edit.sprays.map((spray, index) => ({
    event: {
      id: `stat-edit-spray-${game.id}-${playerId}-${spray.id || index}`,
      gameId: game.id,
      playerId,
      result: spray.result || (spray.type === "out" ? "GO" : "1B"),
      scope: "offense",
      spray: {
        x: spray.x,
        y: spray.y,
        zone: spray.zone || sprayZone(spray.x, spray.y)
      },
      manualStatEdit: true
    },
    game
  }));
}

function manualHittingStatLineHasValues(stats = {}) {
  return Boolean(
    stats.ab
      || stats.h
      || stats.rispAB
      || stats.rispH
      || stats.singles
      || stats.doubles
      || stats.triples
      || stats.hr
      || stats.bb
      || stats.hbp
      || stats.k
      || stats.roe
      || stats.errors
      || stats.fc
      || stats.sac
      || stats.dp
      || stats.go
      || stats.lo
      || stats.fo
      || stats.sb
      || stats.cs
      || stats.po
      || stats.rbi
      || stats.runs
  );
}

function manualPitchingStatLineHasValues(stats = {}) {
  return Boolean(
    stats.outs
      || stats.pitches
      || stats.batters
      || stats.h
      || stats.hr
      || stats.runs
      || stats.earnedRuns
      || stats.bb
      || stats.hbp
      || stats.k
      || stats.sv
      || stats.decision
  );
}

function manualPitchingPitches(playerId, stats = {}) {
  const balls = Array.from({ length: Math.max(0, Number(stats.balls) || 0) }, () => ({ type: "ball", pitcherId: playerId }));
  const strikes = Array.from({ length: Math.max(0, Number(stats.strikes) || 0) }, () => ({ type: "strike", pitcherId: playerId }));
  const tracked = balls.length + strikes.length;
  const other = Array.from({ length: Math.max(0, (Number(stats.pitches) || 0) - tracked) }, () => ({ type: "other", pitcherId: playerId }));
  return [...balls, ...strikes, ...other];
}

function manualPitchingStatEvent(game, playerId, result, index, edit, extras = {}) {
  const outsBefore = Math.max(0, Number(extras.outsBefore) || 0);
  const outsRecorded = Math.max(0, Number(extras.outsRecorded) || 0);
  return {
    id: `pitching-stat-edit-${game.id}-${playerId}-${index}`,
    gameId: game.id,
    playerId,
    pitcherId: playerId,
    result,
    runs: Number(extras.runs || 0),
    earnedRuns: Number(extras.earnedRuns || 0),
    rbi: 0,
    contact: "none",
    launch: eventRules[result]?.launch || "none",
    leverage: "neutral",
    inning: 1,
    half: lionsSide(game) === "away" ? "bottom" : "top",
    outsBefore,
    outsAfter: outsBefore + outsRecorded,
    basesBefore: emptyBases(false),
    scope: "defense",
    note: "Manual pitching stat edit",
    spray: null,
    pitches: extras.pitches || [],
    runnerAdvancements: [],
    createdAt: edit.updatedAt || new Date().toISOString(),
    manualPitchingStatEdit: true
  };
}

function manualPitchingStatEvents(game, playerId, rawEdit = {}) {
  const edit = normalizePitchingStatEdit(rawEdit, playerId, game);
  const stats = edit.stats;
  const events = [];
  let outsLogged = 0;
  const pushEvent = (result, extras = {}) => {
    events.push(manualPitchingStatEvent(game, playerId, result, events.length, edit, {
      outsBefore: outsLogged,
      ...extras
    }));
    outsLogged += Math.max(0, Number(extras.outsRecorded) || 0);
  };
  for (let index = 0; index < stats.hr; index += 1) pushEvent("HR");
  for (let index = 0; index < Math.max(0, stats.h - stats.hr); index += 1) pushEvent("1B");
  for (let index = 0; index < stats.bb; index += 1) pushEvent("BB");
  for (let index = 0; index < stats.hbp; index += 1) pushEvent("HBP");
  for (let index = 0; index < stats.k; index += 1) pushEvent("K", { outsRecorded: 1 });
  const nonStrikeoutOuts = Math.max(0, stats.outs - stats.k);
  for (let index = 0; index < nonStrikeoutOuts; index += 1) pushEvent("GO", { outsRecorded: 1 });
  const minimumBatters = stats.h + stats.bb + stats.hbp + stats.k + nonStrikeoutOuts;
  for (let index = 0; index < Math.max(0, stats.batters - minimumBatters); index += 1) pushEvent("ROE");
  if (!events.length && manualPitchingStatLineHasValues(stats)) pushEvent("SUB");
  if (events.length) {
    events[0].runs = stats.runs;
    events[0].earnedRuns = stats.earnedRuns;
    events[0].pitches = manualPitchingPitches(playerId, stats);
  }
  return events;
}

function pitchingEventsForStatsGame(game) {
  if (!game) return [];
  const edits = pitchingStatEditMap(game);
  const editedPlayerIds = new Set(Object.keys(edits));
  const baseEvents = (Array.isArray(game.events) ? game.events : [])
    .filter((event) => {
      if (event.scope !== "defense") return false;
      if (editedPlayerIds.has(event.pitcherId)) return false;
      return !(event.pitches || []).some((pitch) => editedPlayerIds.has(pitch.pitcherId));
    });
  const editEvents = Object.entries(edits)
    .flatMap(([playerId, edit]) => manualPitchingStatEvents(game, playerId, edit));
  return [...baseEvents, ...editEvents];
}

function pitchingEventEarnedRuns(event, earnedRunMap = new Map()) {
  if (event?.manualPitchingStatEdit) return Math.max(0, Number(event.earnedRuns) || 0);
  return earnedRunMap?.get(event?.id) || 0;
}

function offensiveEventsForStatsGame(game) {
  const edits = hittingStatEditMap(game);
  const editedPlayerIds = new Set(Object.keys(edits));
  const baseEvents = (Array.isArray(game?.events) ? game.events : [])
    .filter((event) => {
      if (event.scope === "defense") return false;
      if (!editedPlayerIds.has(event.playerId)) return true;
      return !(eventRules[event.result]?.pa);
    });
  const editEvents = Object.entries(edits)
    .flatMap(([playerId, edit]) => manualHittingStatEvents(game, playerId, edit));
  return [...baseEvents, ...editEvents];
}

function sprayEventsForGame(game) {
  if (!game) return [];
  const edits = hittingStatEditMap(game);
  const editedPlayerIds = new Set(Object.keys(edits));
  const baseEvents = (Array.isArray(game.events) ? game.events : [])
    .map((event) => ({ event, game }))
    .filter(({ event }) => event.spray && event.scope !== "defense" && !editedPlayerIds.has(event.playerId));
  const editEvents = Object.entries(edits)
    .flatMap(([playerId, edit]) => manualSprayEventsForGame(game, playerId, edit));
  return [...baseEvents, ...editEvents];
}

function allOffensiveEvents(season = null, gameId = null) {
  return statsGamesForSeason(season)
    .filter((game) => !gameId || game.id === gameId)
    .flatMap((game) => offensiveEventsForStatsGame(game));
}

function statsForPlayer(playerId, season = null, gameId = null) {
  const stats = emptyStats();
  const events = allOffensiveEvents(season, gameId);
  events.filter((event) => event.playerId === playerId)
    .forEach((event) => applyEventToStats(stats, event));
  stats.runs = runsScoredFromEvents(events, playerId);
  finishStats(stats);
  return stats;
}

function teamStats(season = null) {
  const stats = emptyStats();
  const events = allOffensiveEvents(season);
  events.forEach((event) => applyEventToStats(stats, event));
  stats.runs = runsScoredFromEvents(events);
  finishStats(stats);
  return stats;
}

function runsScoredFromEvents(events = [], playerId = null) {
  return events.reduce((total, event) => {
    const scoredOnAdvancement = (event.runnerAdvancements || []).filter((advancement) =>
      (!playerId || advancement?.runnerId === playerId)
        && advancement.to === "home"
        && !advancement.out
        && !advancement.remove
    ).length;
    return total + scoredOnAdvancement;
  }, 0);
}

function runsScoredForPlayer(playerId, season = null, gameId = null) {
  return runsScoredFromEvents(allOffensiveEvents(season, gameId), playerId);
}

function emptyStats() {
  return {
    pa: 0,
    ab: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    rispAB: 0,
    rispH: 0,
    k: 0,
    sac: 0,
    dp: 0,
    tb: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    cs: 0,
    po: 0,
    roe: 0,
    fc: 0,
    go: 0,
    lo: 0,
    fo: 0,
    errors: 0,
    bip: 0,
    hard: 0,
    barrel: 0,
    solid: 0,
    gb: 0,
    ld: 0,
    fb: 0,
    pu: 0,
    reach: 0,
    highLevPa: 0,
    highLevSuccess: 0,
    pitches: 0,
    balls: 0,
    calledStrikes: 0,
    swingingStrikes: 0,
    fouls: 0,
    inPlayPitches: 0,
    firstPitchStrikes: 0,
    firstPitchTrackedPa: 0
  };
}

function applyEventToStats(stats, event) {
  const rule = eventRules[event.result];
  if (!rule) return;
  const hasRISP = eventHasRISP(event);
  if (rule.pa) stats.pa += 1;
  if (rule.ab) stats.ab += 1;
  if (rule.hit) stats.h += 1;
  if (hasRISP && rule.ab) stats.rispAB += 1;
  if (hasRISP && rule.hit) stats.rispH += 1;
  if (event.result === "1B") stats.singles += 1;
  if (event.result === "2B") stats.doubles += 1;
  if (event.result === "3B") stats.triples += 1;
  if (event.result === "HR") stats.hr += 1;
  if (rule.bb) stats.bb += 1;
  if (rule.hbp) stats.hbp += 1;
  if (rule.k) stats.k += 1;
  if (rule.sac) stats.sac += 1;
  if (rule.dp) stats.dp += 1;
  if (rule.sb) stats.sb += 1;
  if (rule.cs) stats.cs += 1;
  if (rule.po) stats.po += 1;
  if (event.result === "ROE") stats.roe += 1;
  if (event.result === "FC") stats.fc += 1;
  if (event.result === "GO") stats.go += 1;
  if (event.result === "LO") stats.lo += 1;
  if (event.result === "FO") stats.fo += 1;
  if (event.errorOnPlay) stats.errors += 1;
  if (rule.reach) stats.reach += 1;
  stats.tb += rule.tb || 0;
  stats.rbi += event.rbi || 0;
  if (rule.bip) stats.bip += 1;
  if (event.contact === "hard") stats.hard += 1;
  if (event.contact === "barrel") {
    stats.hard += 1;
    stats.barrel += 1;
  }
  if (event.contact === "solid") stats.solid += 1;
  if (event.launch === "gb") stats.gb += 1;
  if (event.launch === "ld") stats.ld += 1;
  if (event.launch === "fb") stats.fb += 1;
  if (event.launch === "pu") stats.pu += 1;
  if (event.leverage === "high" && rule.pa) {
    stats.highLevPa += 1;
    if (rule.reach || event.rbi > 0 || event.result === "SAC") stats.highLevSuccess += 1;
  }
  const pitches = event.pitches || [];
  stats.pitches += pitches.length;
  pitches.forEach((pitch, index) => {
    if (pitch.type === "ball") stats.balls += 1;
    if (pitch.type === "called_strike") stats.calledStrikes += 1;
    if (pitch.type === "swinging_strike") stats.swingingStrikes += 1;
    if (pitch.type === "foul") stats.fouls += 1;
    if (pitch.type === "in_play") stats.inPlayPitches += 1;
    if (index === 0) {
      stats.firstPitchTrackedPa += 1;
  if (["strike", "called_strike", "swinging_strike", "foul", "in_play"].includes(pitch.type)) stats.firstPitchStrikes += 1;
    }
  });
}

function finishStats(stats) {
  stats.avg = divide(stats.h, stats.ab);
  stats.risp = divide(stats.rispH, stats.rispAB);
  stats.obp = divide(stats.h + stats.bb + stats.hbp, stats.ab + stats.bb + stats.hbp + stats.sac);
  stats.slg = divide(stats.tb, stats.ab);
  stats.ops = stats.obp + stats.slg;
  stats.babip = divide(stats.h - stats.hr, stats.ab - stats.k - stats.hr + stats.sac);
  stats.woba = divide(
    0.69 * stats.bb + 0.72 * stats.hbp + 0.89 * stats.singles + 1.27 * stats.doubles + 1.62 * stats.triples + 2.1 * stats.hr,
    stats.ab + stats.bb + stats.hbp + stats.sac
  );
  stats.kRate = divide(stats.k, stats.pa);
  stats.bbRate = divide(stats.bb, stats.pa);
  stats.hardRate = divide(stats.hard, stats.bip);
  stats.sbRate = divide(stats.sb, stats.sb + stats.cs);
  stats.highLevRate = divide(stats.highLevSuccess, stats.highLevPa);
  stats.pitchesPerPa = divide(stats.pitches, stats.pa);
  stats.firstPitchStrikeRate = divide(stats.firstPitchStrikes, stats.firstPitchTrackedPa);
}

function contactQuality(stats) {
  return divide(stats.solid * 0.55 + stats.hard * 0.95 + stats.barrel * 0.4, stats.bip);
}

function divide(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return numerator / denominator;
}

function safeRate(value) {
  return Number.isFinite(value) ? value : 0;
}

function eventHasRISP(event) {
  if (typeof event?.hasRISP === "boolean") return event.hasRISP;
  return Boolean(event?.basesBefore?.second || event?.basesBefore?.third);
}

function formatRate(value) {
  const safe = safeRate(value);
  if (safe === 0) return ".000";
  return safe.toFixed(3).replace(/^0/, "");
}

function formatRispRate(stats) {
  if (!stats || !stats.rispAB) return "—";
  return formatRate(stats.risp);
}

function formatEra(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "--";
}

function formatPercent(value) {
  return `${Math.round(safeRate(value) * 100)}%`;
}

function formatInnings(outs) {
  const whole = Math.floor(outs / 3);
  const remainder = outs % 3;
  return `${whole}.${remainder}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serviceWorkerRegistrationDisabled() {
  const params = new URLSearchParams(window.location.search);
  return DISABLE_SERVICE_WORKER_REGISTRATION
    || params.has("no-sw")
    || window.localStorage?.getItem("oakmont:disableServiceWorker") === "1";
}

function renderAppVersion() {
  const node = document.getElementById("appVersion");
  if (!node) return;
  const envLabel = window.ScorebookSupabase?.environment ? ` | ${String(window.ScorebookSupabase.environment).toUpperCase()}` : "";
  const configuredLabel = window.ScorebookSupabase?.configured?.() ? "" : " DB off";
  node.textContent = `Build ${APP_VERSION}${envLabel}${configuredLabel}${serviceWorkerRegistrationDisabled() ? " | SW off" : ""}`;
}

function initializeAnalytics() {
  if (!GA_MEASUREMENT_ID) return;
  if (window.gtag) {
    window.gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  const analyticsScript = document.createElement("script");
  analyticsScript.async = true;
  analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(analyticsScript);
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true
  });
}

function unregisterServiceWorkersForDebug() {
  return navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => {
      console.log("Service worker registration disabled for debugging");
    });
}

renderAppVersion();
initializeAnalytics();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (serviceWorkerRegistrationDisabled()) {
      unregisterServiceWorkersForDebug().catch((error) => {
        console.error("Service worker unregister failed:", error);
      });
      return;
    }
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        const promoteWaitingWorker = (worker) => {
          if (!worker) return;
          pendingServiceWorkerRefresh = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        };
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!pendingServiceWorkerRefresh) return;
          pendingServiceWorkerRefresh = false;
          window.location.reload();
        });
        if (registration.waiting) {
          promoteWaitingWorker(registration.waiting);
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promoteWaitingWorker(registration.waiting || installing);
            }
          });
        });
        registration.update?.().catch((error) => {
          console.warn("Service worker update check failed:", error);
        });
        console.log("Service worker registered");
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}








