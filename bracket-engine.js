(function initScorebookBracketEngine(global) {
  const SECTION_LABELS = {
    bye: "Bye Round",
    winners: "Winners Bracket",
    losers: "Elimination Bracket",
    championship: "Championship Series"
  };

  const TEMPLATE_LABELS = {
    "pittsburgh-naba-aa": "Pittsburgh NABA AA Playoffs",
    "single-4": "Four-team single elimination",
    "single-8": "Eight-team single elimination",
    "double-8": "Eight-team double elimination"
  };

  function clone(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function createId(prefix = "tournament") {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
  }

  function normalizeText(value = "") {
    return String(value || "").trim();
  }

  function normalizeKey(value = "") {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function normalizeSection(value = "winners") {
    const key = normalizeKey(value);
    if (["bye", "byes", "advance"].includes(key)) return "bye";
    if (["loser", "losers", "losers-bracket", "elimination", "elimination-bracket"].includes(key)) return "losers";
    if (["championship", "championship-series", "final", "finals"].includes(key)) return "championship";
    return "winners";
  }

  function sectionLabel(section = "winners") {
    return SECTION_LABELS[normalizeSection(section)] || SECTION_LABELS.winners;
  }

  function normalizeStatus(value = "scheduled") {
    const key = normalizeKey(value);
    if (["final", "completed", "complete"].includes(key)) return "final";
    if (["live", "active", "in-progress"].includes(key)) return "live";
    if (["postponed", "ppd"].includes(key)) return "postponed";
    if (["bye", "advance", "advanced"].includes(key)) return "bye";
    return "scheduled";
  }

  function normalizeSlot(value = "") {
    const slot = normalizeText(value).toUpperCase();
    if (slot === "A" || slot === "HOME" || slot === "TEAM 1") return "A";
    if (slot === "B" || slot === "AWAY" || slot === "TEAM 2") return "B";
    return "";
  }

  function sourceLabel(source = {}) {
    const normalized = normalizeSource(source);
    if (normalized.type === "seed") return `#${normalized.seed} Seed`;
    if (normalized.type === "team") return normalized.teamName || "Team";
    if (normalized.type === "winner") return `Winner ${normalized.matchupCode || "TBD"}`;
    if (normalized.type === "loser") return `Loser ${normalized.matchupCode || "TBD"}`;
    if (normalized.type === "qualifier") return normalized.label || "Championship qualifier";
    return normalized.label || "TBD";
  }

  function normalizeSource(source = {}, fallback = {}) {
    if (typeof source === "string") {
      const text = normalizeText(source);
      const winner = text.match(/^winner\s+(.+)$/i);
      const loser = text.match(/^loser\s+(.+)$/i);
      const seed = text.match(/^#?(\d+)\s*seed$/i);
      if (winner) return { type: "winner", matchupCode: normalizeText(winner[1]).toUpperCase() };
      if (loser) return { type: "loser", matchupCode: normalizeText(loser[1]).toUpperCase() };
      if (seed) return { type: "seed", seed: Number(seed[1]), label: `#${seed[1]} Seed` };
      if (!text || /^tbd$/i.test(text)) return { type: "tbd", label: "TBD" };
      return { type: "team", teamName: text, teamId: normalizeKey(text), label: text };
    }

    const type = normalizeKey(source.type || source.sourceType || fallback.type || "tbd");
    const seed = Number(source.seed ?? source.sourceSeed ?? fallback.seed ?? 0) || 0;
    const matchupCode = normalizeText(source.matchupCode || source.sourceMatchupCode || source.matchup || fallback.matchupCode).toUpperCase();
    const normalized = {
      type: ["seed", "team", "winner", "loser", "qualifier", "tbd"].includes(type) ? type : "tbd",
      seed,
      teamId: normalizeText(source.teamId || source.sourceTeamId || fallback.teamId),
      teamName: normalizeText(source.teamName || source.displayName || source.name || fallback.teamName),
      matchupCode,
      label: normalizeText(source.label || fallback.label)
    };
    if (normalized.type === "seed" && normalized.seed) normalized.label = normalized.label || `#${normalized.seed} Seed`;
    if (normalized.type === "winner") normalized.label = normalized.label || `Winner ${normalized.matchupCode || "TBD"}`;
    if (normalized.type === "loser") normalized.label = normalized.label || `Loser ${normalized.matchupCode || "TBD"}`;
    if (normalized.type === "team") normalized.label = normalized.label || normalized.teamName;
    if (normalized.type === "tbd") normalized.label = normalized.label || "TBD";
    return normalized;
  }

  function seedSource(seed) {
    return { type: "seed", seed: Number(seed), label: `#${Number(seed)} Seed` };
  }

  function winnerSource(matchupCode) {
    return { type: "winner", matchupCode: normalizeText(matchupCode).toUpperCase(), label: `Winner ${normalizeText(matchupCode).toUpperCase()}` };
  }

  function loserSource(matchupCode) {
    return { type: "loser", matchupCode: normalizeText(matchupCode).toUpperCase(), label: `Loser ${normalizeText(matchupCode).toUpperCase()}` };
  }

  function tbdSource(label = "TBD") {
    return { type: "tbd", label };
  }

  function normalizeEntry(entry = {}, index = 0) {
    const seed = Number(entry.seed || index + 1) || index + 1;
    const teamName = normalizeText(entry.teamName || entry.name || entry.displayNameOverride || entry.display_name_override || `#${seed} Seed`);
    return {
      id: normalizeText(entry.id || entry.entryId || `seed-${seed}`),
      teamId: normalizeText(entry.teamId || entry.team_id || normalizeKey(teamName)),
      teamName,
      seed,
      displayNameOverride: normalizeText(entry.displayNameOverride || entry.display_name_override),
      entryStatus: normalizeText(entry.entryStatus || entry.entry_status || "active")
    };
  }

  function seedEntries(teamCount = 7, teams = []) {
    const safeCount = Math.max(1, Number(teamCount || teams.length || 7) || 7);
    return Array.from({ length: safeCount }, (_, index) => {
      const team = teams[index];
      if (typeof team === "string") {
        return normalizeEntry({ seed: index + 1, teamName: team }, index);
      }
      return normalizeEntry({
        seed: index + 1,
        teamId: team?.teamId || team?.id || "",
        teamName: team?.teamName || team?.name || `#${index + 1} Seed`
      }, index);
    });
  }

  function normalizeMatchup(raw = {}, index = 0) {
    const matchupCode = normalizeText(raw.matchupCode || raw.matchup_code || raw.code || raw.label || raw.gameCode || raw.game_code || `G-${index + 1}`).toUpperCase();
    const bracketSection = normalizeSection(raw.bracketSection || raw.bracket_section || raw.bracketSide || raw.bracket_side || raw.side);
    const roundNumber = Number(raw.roundNumber || raw.round_number || raw.round || raw.order || index + 1) || index + 1;
    const displayOrder = Number(raw.displayOrder || raw.display_order || raw.order || index + 1) || index + 1;
    const slotA = normalizeSource(raw.slotA || raw.homeSource || raw.home_source || raw.teamASource || raw.teamA || raw.team_a || tbdSource());
    const slotB = normalizeSource(raw.slotB || raw.awaySource || raw.away_source || raw.teamBSource || raw.teamB || raw.team_b || tbdSource());
    const status = normalizeStatus(raw.status);
    const isBye = Boolean(raw.isBye || raw.is_bye || raw.bye || status === "bye");
    return {
      id: normalizeText(raw.id || matchupCode || createId("matchup")),
      matchupCode,
      code: matchupCode,
      label: matchupCode,
      bracketSection,
      bracketSide: bracketSection === "losers" ? "losers" : bracketSection === "championship" ? "championship" : bracketSection === "bye" ? "bye" : "winners",
      roundNumber,
      round: roundNumber,
      displayOrder,
      order: displayOrder,
      dateLabel: normalizeText(raw.dateLabel || raw.date_label),
      timeLabel: normalizeText(raw.timeLabel || raw.time_label || raw.time),
      location: normalizeText(raw.location || raw.locationName || raw.location_name),
      note: normalizeText(raw.note || raw.notes),
      seriesBestOf: Number(raw.seriesBestOf || raw.series_best_of || 1) || 1,
      seriesGameNumber: Number(raw.seriesGameNumber || raw.series_game_number || 1) || 1,
      resetGame: Boolean(raw.resetGame || raw.reset_game),
      linkedGameId: normalizeText(raw.linkedGameId || raw.linked_game_id || raw.gameId || raw.game_id),
      status,
      isBye,
      slotA,
      slotB,
      homeSource: slotA,
      awaySource: slotB,
      scoreA: normalizeText(raw.scoreA ?? raw.score_a),
      scoreB: normalizeText(raw.scoreB ?? raw.score_b),
      winner: normalizeSlot(raw.winner || raw.winnerSide || raw.winner_side),
      winnerSide: normalizeSlot(raw.winner || raw.winnerSide || raw.winner_side),
      winnerDestination: normalizeText(raw.winnerDestination || raw.winner_destination || raw.winnerDestinationMatchupId || raw.winner_destination_matchup_id).toUpperCase(),
      winnerDestinationSlot: normalizeSlot(raw.winnerDestinationSlot || raw.winner_destination_slot),
      loserDestination: normalizeText(raw.loserDestination || raw.loser_destination || raw.loserDestinationMatchupId || raw.loser_destination_matchup_id).toUpperCase(),
      loserDestinationSlot: normalizeSlot(raw.loserDestinationSlot || raw.loser_destination_slot),
      resolvedHomeTeamId: normalizeText(raw.resolvedHomeTeamId || raw.resolved_home_team_id),
      resolvedAwayTeamId: normalizeText(raw.resolvedAwayTeamId || raw.resolved_away_team_id),
      winnerTeamId: normalizeText(raw.winnerTeamId || raw.winner_team_id),
      loserTeamId: normalizeText(raw.loserTeamId || raw.loser_team_id)
    };
  }

  function matchupRoundName(matchup) {
    if (matchup.bracketSection === "bye") return "Byes";
    if (matchup.bracketSection === "championship") return "Championship Series";
    if (matchup.bracketSection === "losers") return `Elimination Round ${matchup.roundNumber}`;
    return `Winners Round ${matchup.roundNumber}`;
  }

  function normalizeTournament(raw = {}) {
    const season = normalizeText(raw.season || new Date().getFullYear());
    const flatLegacy = Array.isArray(raw.rounds) && !Array.isArray(raw.matchups)
      ? raw.rounds.flatMap((round) => (Array.isArray(round.matchups) ? round.matchups : []).map((matchup, index) => ({
        ...matchup,
        bracketSection: matchup.bracketSection || matchup.bracketSide || round.bracketSection || round.bracketSide,
        roundNumber: matchup.roundNumber || round.order || 1,
        displayOrder: matchup.displayOrder || matchup.order || index + 1,
        matchupCode: matchup.matchupCode || matchup.label
      })))
      : [];
    const matchups = (Array.isArray(raw.matchups) ? raw.matchups : flatLegacy)
      .map((matchup, index) => normalizeMatchup(matchup, index))
      .sort((left, right) => (left.roundNumber - right.roundNumber) || (left.displayOrder - right.displayOrder));
    return {
      id: normalizeText(raw.id || "primary-playoff-bracket"),
      name: normalizeText(raw.name || raw.title || `${season} AA Championship Series`),
      title: normalizeText(raw.title || raw.name || `${season} AA Championship Series`),
      subtitle: normalizeText(raw.subtitle || raw.description || "Double Elimination Tournament"),
      description: normalizeText(raw.description),
      season,
      division: normalizeText(raw.division || "AA"),
      tournamentType: normalizeText(raw.tournamentType || raw.tournament_type || raw.format || "double-elimination"),
      format: normalizeText(raw.format || raw.tournamentType || raw.tournament_type || "double-elimination"),
      templateId: normalizeText(raw.templateId || raw.template_id || ""),
      status: normalizeText(raw.status || (raw.isPublic ? "published" : "draft")),
      isPublic: raw.isPublic === undefined ? raw.status === "published" : Boolean(raw.isPublic),
      startsAt: normalizeText(raw.startsAt || raw.starts_at || raw.startDate || raw.start_date),
      endsAt: normalizeText(raw.endsAt || raw.ends_at || raw.endDate || raw.end_date),
      championshipFormat: normalizeText(raw.championshipFormat || raw.championship_format || "Best of 3"),
      updatedAt: normalizeText(raw.updatedAt || raw.updated_at),
      entries: (Array.isArray(raw.entries) ? raw.entries : seedEntries(Number(raw.teamCount || raw.numberOfTeams || 7) || 7))
        .map((entry, index) => normalizeEntry(entry, index))
        .sort((left, right) => left.seed - right.seed),
      matchups,
      validation: Array.isArray(raw.validation) ? raw.validation : []
    };
  }

  function sourceParticipant(source, context, stack = []) {
    const normalized = normalizeSource(source);
    if (normalized.type === "seed") {
      const entry = context.entriesBySeed.get(Number(normalized.seed));
      return {
        teamId: entry?.teamId || "",
        teamName: entry?.displayNameOverride || entry?.teamName || normalized.label || `#${normalized.seed} Seed`,
        seed: normalized.seed,
        sourceLabel: normalized.label || `#${normalized.seed} Seed`,
        resolved: Boolean(entry?.teamName && !/^#\d+\s*seed$/i.test(entry.teamName))
      };
    }
    if (normalized.type === "team") {
      return {
        teamId: normalized.teamId || normalizeKey(normalized.teamName),
        teamName: normalized.teamName || normalized.label || "Team",
        seed: normalized.seed || "",
        sourceLabel: normalized.label || normalized.teamName || "Team",
        resolved: Boolean(normalized.teamName)
      };
    }
    if (normalized.type === "winner" || normalized.type === "loser") {
      const matchup = context.matchupsByCode.get(normalized.matchupCode);
      if (!matchup) {
        return { teamId: "", teamName: sourceLabel(normalized), seed: "", sourceLabel: sourceLabel(normalized), resolved: false };
      }
      if (stack.includes(matchup.matchupCode)) {
        context.errors.push({
          type: "circular",
          matchupCode: matchup.matchupCode,
          message: `${matchup.matchupCode} has a circular participant source.`
        });
        return { teamId: "", teamName: sourceLabel(normalized), seed: "", sourceLabel: sourceLabel(normalized), resolved: false };
      }
      const result = resolveMatchupResult(matchup, context, [...stack, matchup.matchupCode]);
      const participant = normalized.type === "winner" ? result.winnerParticipant : result.loserParticipant;
      return participant || {
        teamId: "",
        teamName: sourceLabel(normalized),
        seed: "",
        sourceLabel: sourceLabel(normalized),
        resolved: false
      };
    }
    return { teamId: "", teamName: normalized.label || "TBD", seed: "", sourceLabel: normalized.label || "TBD", resolved: false };
  }

  function scoreNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function inferWinnerSide(matchup) {
    const explicit = normalizeSlot(matchup.winnerSide || matchup.winner);
    if (explicit) return explicit;
    if (matchup.isBye || matchup.status === "bye") return "A";
    const scoreA = scoreNumber(matchup.scoreA);
    const scoreB = scoreNumber(matchup.scoreB);
    if (scoreA === null || scoreB === null || scoreA === scoreB) return "";
    return scoreA > scoreB ? "A" : "B";
  }

  function resolveMatchupResult(matchup, context, stack = []) {
    const participantA = sourceParticipant(matchup.slotA, context, stack);
    const participantB = matchup.isBye ? null : sourceParticipant(matchup.slotB, context, stack);
    const winnerSide = inferWinnerSide(matchup);
    const loserSide = winnerSide === "A" ? "B" : winnerSide === "B" ? "A" : "";
    const winnerParticipant = winnerSide === "A" ? participantA : winnerSide === "B" ? participantB : null;
    const loserParticipant = loserSide === "A" ? participantA : loserSide === "B" ? participantB : null;
    return { participantA, participantB, winnerSide, loserSide, winnerParticipant, loserParticipant };
  }

  function validateTournament(tournament) {
    const errors = [];
    const seedCounts = new Map();
    const teamCounts = new Map();
    tournament.entries.forEach((entry) => {
      seedCounts.set(entry.seed, (seedCounts.get(entry.seed) || 0) + 1);
      const teamKey = normalizeKey(entry.teamId || entry.teamName);
      if (teamKey && !/^seed-\d+$/.test(teamKey)) teamCounts.set(teamKey, (teamCounts.get(teamKey) || 0) + 1);
    });
    seedCounts.forEach((count, seed) => {
      if (count > 1) errors.push({ type: "duplicate-seed", message: `Seed ${seed} is assigned more than once.` });
    });
    teamCounts.forEach((count) => {
      if (count > 1) errors.push({ type: "duplicate-team", message: "The same team is selected more than once." });
    });

    const matchupsByCode = new Map(tournament.matchups.map((matchup) => [matchup.matchupCode, matchup]));
    tournament.matchups.forEach((matchup) => {
      [matchup.slotA, matchup.slotB].forEach((slot) => {
        const source = normalizeSource(slot);
        if ((source.type === "winner" || source.type === "loser") && source.matchupCode === matchup.matchupCode) {
          errors.push({
            type: "self-reference",
            matchupCode: matchup.matchupCode,
            message: `${matchup.matchupCode} cannot feed itself.`
          });
        }
        if ((source.type === "winner" || source.type === "loser") && source.matchupCode && !matchupsByCode.has(source.matchupCode)) {
          errors.push({
            type: "missing-source",
            matchupCode: matchup.matchupCode,
            message: `${matchup.matchupCode} references ${sourceLabel(source)}, but that matchup does not exist.`
          });
        }
      });
    });
    return errors;
  }

  function resolveTournament(raw = {}) {
    const tournament = normalizeTournament(raw);
    const errors = validateTournament(tournament);
    const context = {
      entriesBySeed: new Map(tournament.entries.map((entry) => [entry.seed, entry])),
      matchupsByCode: new Map(tournament.matchups.map((matchup) => [matchup.matchupCode, matchup])),
      errors
    };

    const resolvedMatchups = tournament.matchups.map((matchup) => {
      const result = resolveMatchupResult(matchup, context, [matchup.matchupCode]);
      const sameResolvedTeam = result.participantA?.teamId && result.participantB?.teamId && result.participantA.teamId === result.participantB.teamId;
      if (sameResolvedTeam && !matchup.isBye) {
        context.errors.push({
          type: "same-team",
          matchupCode: matchup.matchupCode,
          message: `${matchup.matchupCode} has the same team in both slots.`
        });
      }
      return {
        ...matchup,
        teamA: result.participantA?.teamName || "TBD",
        seedA: result.participantA?.seed ? String(result.participantA.seed) : "",
        sourceLabelA: result.participantA?.sourceLabel || sourceLabel(matchup.slotA),
        teamB: matchup.isBye ? "" : (result.participantB?.teamName || "TBD"),
        seedB: matchup.isBye ? "" : (result.participantB?.seed ? String(result.participantB.seed) : ""),
        sourceLabelB: matchup.isBye ? "BYE" : (result.participantB?.sourceLabel || sourceLabel(matchup.slotB)),
        winner: result.winnerSide,
        winnerSide: result.winnerSide,
        winnerTeamId: result.winnerParticipant?.teamId || "",
        loserTeamId: result.loserParticipant?.teamId || ""
      };
    });

    const roundMap = new Map();
    resolvedMatchups.forEach((matchup) => {
      const key = `${matchup.bracketSection}-${matchup.roundNumber}`;
      if (!roundMap.has(key)) {
        roundMap.set(key, {
          id: `round-${key}`,
          name: matchupRoundName(matchup),
          order: matchup.roundNumber,
          bracketSide: matchup.bracketSection,
          bracketSection: matchup.bracketSection,
          matchups: []
        });
      }
      roundMap.get(key).matchups.push(matchup);
    });

    const rounds = [...roundMap.values()]
      .sort((left, right) => (left.order - right.order) || sectionSort(left.bracketSection) - sectionSort(right.bracketSection))
      .map((round, index) => ({
        ...round,
        order: index + 1,
        matchups: round.matchups.sort((left, right) => left.displayOrder - right.displayOrder)
      }));

    return {
      ...tournament,
      matchups: resolvedMatchups,
      rounds,
      validation: context.errors
    };
  }

  function sectionSort(section) {
    return ["bye", "winners", "losers", "championship"].indexOf(normalizeSection(section));
  }

  function applyMatchupResult(rawTournament, matchupCode, result = {}) {
    const tournament = normalizeTournament(rawTournament);
    const code = normalizeText(matchupCode).toUpperCase();
    tournament.matchups = tournament.matchups.map((matchup) => {
      if (matchup.matchupCode !== code) return matchup;
      const explicitWinner = normalizeSlot(result.winnerSide || result.winner);
      const next = {
        ...matchup,
        scoreA: normalizeText(result.scoreA ?? matchup.scoreA),
        scoreB: normalizeText(result.scoreB ?? matchup.scoreB),
        status: normalizeStatus(result.status || matchup.status || "final"),
        winnerSide: explicitWinner,
        winner: explicitWinner
      };
      if (!next.winnerSide) next.winnerSide = inferWinnerSide(next);
      next.winner = next.winnerSide;
      return next;
    });
    return resolveTournament(tournament);
  }

  function createPittsburghNabaAaTemplate(options = {}) {
    const season = normalizeText(options.season || new Date().getFullYear());
    const entries = seedEntries(7, options.teams || options.entries || []);
    const base = {
      id: normalizeText(options.id || "primary-playoff-bracket"),
      name: normalizeText(options.name || options.title || `${season} AA Championship Series`),
      title: normalizeText(options.title || `${season} AA Championship Series`),
      subtitle: "Pittsburgh NABA AA Playoffs | Double Elimination",
      description: normalizeText(options.description),
      season,
      division: normalizeText(options.division || "AA"),
      tournamentType: "custom-bracket",
      format: "double-elimination",
      templateId: "pittsburgh-naba-aa",
      status: normalizeText(options.status || "draft"),
      isPublic: Boolean(options.isPublic),
      championshipFormat: normalizeText(options.championshipFormat || "Best of 3"),
      entries
    };
    const m = (matchup) => normalizeMatchup(matchup);
    base.matchups = [
      m({ matchupCode: "BYE-1", bracketSection: "bye", roundNumber: 1, displayOrder: 1, slotA: seedSource(1), slotB: tbdSource("BYE"), status: "bye", isBye: true, winnerSide: "A", winnerDestination: "AA-4", winnerDestinationSlot: "A", note: "#1 seed advances" }),
      m({ matchupCode: "AA-1", bracketSection: "winners", roundNumber: 1, displayOrder: 1, dateLabel: "7/18", slotA: seedSource(4), slotB: seedSource(5), winnerDestination: "AA-4", winnerDestinationSlot: "B", loserDestination: "AA-8", loserDestinationSlot: "A" }),
      m({ matchupCode: "AA-2", bracketSection: "winners", roundNumber: 1, displayOrder: 2, dateLabel: "7/18", slotA: seedSource(3), slotB: seedSource(6), winnerDestination: "AA-5", winnerDestinationSlot: "B", loserDestination: "AA-6", loserDestinationSlot: "A" }),
      m({ matchupCode: "AA-3", bracketSection: "winners", roundNumber: 1, displayOrder: 3, dateLabel: "7/18", slotA: seedSource(2), slotB: seedSource(7), winnerDestination: "AA-5", winnerDestinationSlot: "A", loserDestination: "AA-6", loserDestinationSlot: "B" }),
      m({ matchupCode: "AA-4", bracketSection: "winners", roundNumber: 2, displayOrder: 1, dateLabel: "7/18", slotA: winnerSource("BYE-1"), slotB: winnerSource("AA-1"), winnerDestination: "AA-9", winnerDestinationSlot: "A", loserDestination: "AA-7", loserDestinationSlot: "A" }),
      m({ matchupCode: "AA-5", bracketSection: "winners", roundNumber: 2, displayOrder: 2, dateLabel: "7/20", slotA: winnerSource("AA-3"), slotB: winnerSource("AA-2"), winnerDestination: "AA-9", winnerDestinationSlot: "B", loserDestination: "AA-8", loserDestinationSlot: "B" }),
      m({ matchupCode: "AA-6", bracketSection: "losers", roundNumber: 1, displayOrder: 1, dateLabel: "7/19", slotA: loserSource("AA-2"), slotB: loserSource("AA-3"), winnerDestination: "AA-7", winnerDestinationSlot: "B" }),
      m({ matchupCode: "AA-7", bracketSection: "losers", roundNumber: 2, displayOrder: 1, dateLabel: "7/25", slotA: loserSource("AA-4"), slotB: winnerSource("AA-6"), winnerDestination: "AA-10", winnerDestinationSlot: "A" }),
      m({ matchupCode: "AA-8", bracketSection: "losers", roundNumber: 2, displayOrder: 2, dateLabel: "7/25", slotA: loserSource("AA-1"), slotB: loserSource("AA-5"), winnerDestination: "AA-10", winnerDestinationSlot: "B" }),
      m({ matchupCode: "AA-9", bracketSection: "winners", roundNumber: 3, displayOrder: 1, dateLabel: "7/25", slotA: winnerSource("AA-4"), slotB: winnerSource("AA-5"), winnerDestination: "AAPNC-1", winnerDestinationSlot: "A", note: "AA-11 if needed" }),
      m({ matchupCode: "AA-10", bracketSection: "losers", roundNumber: 3, displayOrder: 1, dateLabel: "7/25", slotA: winnerSource("AA-7"), slotB: winnerSource("AA-8"), winnerDestination: "AAPNC-1", winnerDestinationSlot: "B", note: "AA-12 if needed" }),
      m({ matchupCode: "AAPNC-1", bracketSection: "championship", roundNumber: 1, displayOrder: 1, slotA: winnerSource("AA-9"), slotB: winnerSource("AA-10"), seriesBestOf: 3, seriesGameNumber: 1, note: "Best of 3" }),
      m({ matchupCode: "AAPNC-2", bracketSection: "championship", roundNumber: 1, displayOrder: 2, slotA: winnerSource("AA-9"), slotB: winnerSource("AA-10"), seriesBestOf: 3, seriesGameNumber: 2, note: "If needed" }),
      m({ matchupCode: "AAPNC-3", bracketSection: "championship", roundNumber: 1, displayOrder: 3, slotA: winnerSource("AA-9"), slotB: winnerSource("AA-10"), seriesBestOf: 3, seriesGameNumber: 3, note: "If needed" })
    ];
    return resolveTournament(base);
  }

  function createSingleEliminationTemplate(teamCount = 4, options = {}) {
    const season = normalizeText(options.season || new Date().getFullYear());
    const entries = seedEntries(teamCount, options.teams || options.entries || []);
    const opening = teamCount === 4
      ? [[1, 4], [2, 3]]
      : [[1, 8], [4, 5], [2, 7], [3, 6]];
    const matchups = opening.map(([seedA, seedB], index) => normalizeMatchup({
      matchupCode: `SE-${index + 1}`,
      bracketSection: "winners",
      roundNumber: 1,
      displayOrder: index + 1,
      slotA: seedSource(seedA),
      slotB: seedSource(seedB),
      winnerDestination: teamCount === 4 ? "SE-FINAL" : `SE-SF-${index < 2 ? 1 : 2}`,
      winnerDestinationSlot: index % 2 === 0 ? "A" : "B"
    }));
    if (teamCount === 8) {
      matchups.push(
        normalizeMatchup({ matchupCode: "SE-SF-1", bracketSection: "winners", roundNumber: 2, displayOrder: 1, slotA: winnerSource("SE-1"), slotB: winnerSource("SE-2"), winnerDestination: "SE-FINAL", winnerDestinationSlot: "A" }),
        normalizeMatchup({ matchupCode: "SE-SF-2", bracketSection: "winners", roundNumber: 2, displayOrder: 2, slotA: winnerSource("SE-3"), slotB: winnerSource("SE-4"), winnerDestination: "SE-FINAL", winnerDestinationSlot: "B" })
      );
    }
    matchups.push(normalizeMatchup({
      matchupCode: "SE-FINAL",
      bracketSection: "championship",
      roundNumber: teamCount === 4 ? 2 : 3,
      displayOrder: 1,
      slotA: teamCount === 4 ? winnerSource("SE-1") : winnerSource("SE-SF-1"),
      slotB: teamCount === 4 ? winnerSource("SE-2") : winnerSource("SE-SF-2")
    }));
    return resolveTournament({
      id: normalizeText(options.id || "primary-playoff-bracket"),
      title: normalizeText(options.title || `${season} Single Elimination Bracket`),
      subtitle: TEMPLATE_LABELS[`single-${teamCount}`],
      season,
      division: normalizeText(options.division || "AA"),
      tournamentType: "single-elimination",
      format: "single-elimination",
      templateId: `single-${teamCount}`,
      status: normalizeText(options.status || "draft"),
      entries,
      matchups
    });
  }

  function createTemplate(templateId, options = {}) {
    const key = normalizeKey(templateId || "pittsburgh-naba-aa");
    if (key === "single-4") return createSingleEliminationTemplate(4, options);
    if (key === "single-8") return createSingleEliminationTemplate(8, options);
    if (key === "double-8") {
      const template = createPittsburghNabaAaTemplate({ ...options, entries: seedEntries(8, options.teams || options.entries || []) });
      template.templateId = "double-8";
      template.subtitle = TEMPLATE_LABELS["double-8"];
      return template;
    }
    return createPittsburghNabaAaTemplate(options);
  }

  global.ScorebookBracketEngine = {
    TEMPLATE_LABELS,
    sectionLabel,
    sourceLabel,
    normalizeSource,
    normalizeEntry,
    normalizeMatchup,
    normalizeTournament,
    resolveTournament,
    applyMatchupResult,
    validateTournament,
    seedEntries,
    seedSource,
    winnerSource,
    loserSource,
    tbdSource,
    createPittsburghNabaAaTemplate,
    createSingleEliminationTemplate,
    createTemplate
  };
})(window);
