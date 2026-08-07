(function initScorebookSupabaseStorage(global) {
  const NEWS_IMAGE_BUCKET = "news-images";
  const NEWS_ARTICLE_COLUMNS = [
    "id",
    "title",
    "summary",
    "body_html",
    "category",
    "game_id",
    "article_date",
    "image_url",
    "thumbnail_url",
    "image_path",
    "thumbnail_path",
    "created_at",
    "updated_at"
  ].join(",");
  const NEWS_ARTICLE_FULL_COLUMNS = `${NEWS_ARTICLE_COLUMNS},image_data_url,metadata`;
  const NEWS_ARTICLE_LEGACY_COLUMNS = [
    "id",
    "title",
    "summary",
    "body_html",
    "category",
    "game_id",
    "article_date",
    "created_at",
    "updated_at"
  ].join(",");
  const NEWS_ARTICLE_LEGACY_FULL_COLUMNS = `${NEWS_ARTICLE_LEGACY_COLUMNS},image_data_url,metadata`;
  const FINANCIAL_PLAN_COLUMNS = [
    "id",
    "season",
    "charges",
    "custom_fees",
    "expense_payments",
    "transactions",
    "players",
    "notes",
    "metadata",
    "created_at",
    "updated_at"
  ].join(",");

  function deepClone(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function getClient() {
    return global.ScorebookSupabase?.getClient?.() || null;
  }

  function isReady() {
    return Boolean(getClient());
  }

  function currentSeasonValue() {
    return new Date().getFullYear();
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

  function rosterPlayerFromRow(row) {
    if (!row?.id) return null;
    const positions = normalizePositions(row.positions);
    const bats = String(row.bats || "R").trim().toUpperCase();
    return {
      id: row.id,
      name: String(row.name || "").trim(),
      number: String(row.jersey_number || "").trim(),
      positions,
      primaryPosition: String(row.primary_position || positions[0] || "UTL").trim().toUpperCase(),
      bats,
      throws: String(row.throws || bats || "R").trim().toUpperCase(),
      height: String(row.height || "").trim(),
      weight: String(row.weight || "").trim(),
      active: row.active !== false,
      grades: row.grades && typeof row.grades === "object" ? deepClone(row.grades) : {}
    };
  }

  function buildRosterPlayerRow(player, index = 0, rosterVersion = "") {
    const positions = normalizePositions(player?.positions);
    const bats = String(player?.bats || "R").trim().toUpperCase();
    return {
      id: player.id,
      team_id: "lions",
      roster_version: String(rosterVersion || ""),
      name: String(player?.name || "").trim(),
      jersey_number: String(player?.number || "").trim(),
      positions,
      primary_position: String(player?.primaryPosition || positions[0] || "UTL").trim().toUpperCase(),
      bats,
      throws: String(player?.throws || bats || "R").trim().toUpperCase(),
      height: String(player?.height || "").trim(),
      weight: String(player?.weight || "").trim(),
      active: player?.active !== false,
      grades: deepClone(player?.grades || {}),
      sort_order: index,
      metadata: {
        updated_from: "scorebook-app"
      }
    };
  }

  function isMissingTableError(error, tableName) {
    if (!error) return false;
    const text = `${error.code || ""} ${error.message || ""} ${error.details || ""}`.toLowerCase();
    const table = String(tableName || "").toLowerCase();
    return text.includes("42p01")
      || text.includes("pgrst205")
      || (table && text.includes(table) && (text.includes("could not find") || text.includes("does not exist")));
  }

  function isMissingColumnError(error, columnName) {
    if (!error) return false;
    const text = `${error.code || ""} ${error.message || ""} ${error.details || ""}`.toLowerCase();
    const column = String(columnName || "").toLowerCase();
    return Boolean(column) && text.includes(column) && (
      text.includes("could not find")
      || text.includes("column")
      || text.includes("schema cache")
      || text.includes("pgrst204")
    );
  }

  function isMissingRoutineError(error, routineName) {
    if (!error) return false;
    const text = `${error.code || ""} ${error.message || ""} ${error.details || ""}`.toLowerCase();
    const routine = String(routineName || "").toLowerCase();
    return text.includes("42883")
      || text.includes("pgrst202")
      || (routine && text.includes(routine) && (text.includes("could not find") || text.includes("does not exist")));
  }

  function isFinalGameStatus(status) {
    return status === "completed" || status === "final";
  }

  function isFinalGameData(game) {
    return Boolean(game && (isFinalGameStatus(game.status) || game.quickScored === true));
  }

  function normalizeHighlightCategoryList(categories, fallbackCategory = "") {
    const source = Array.isArray(categories)
      ? [...categories]
      : String(categories || "")
        .split(/[|,]/)
        .map((category) => category.trim())
        .filter(Boolean);
    if (fallbackCategory) source.unshift(fallbackCategory);
    const seen = new Set();
    return source
      .map((category) => String(category || "").trim())
      .filter((category) => {
        if (!category || seen.has(category)) return false;
        seen.add(category);
        return true;
      });
  }

  function isPostponedGameData(game) {
    return Boolean(game && game.status === "postponed");
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
      isPostponedGameData(existingGame)
      && !isPostponedGameData(incomingGame)
      && !gameResumedAfterPostponed(incomingGame, existingGame)
    );
  }

  function shouldUseLocalGameOverRemote(localGame, remoteGame) {
    if (!remoteGame) return true;
    if (isFinalGameData(remoteGame) && !isFinalGameData(localGame)) return false;
    if (isFinalGameData(localGame) && !isFinalGameData(remoteGame)) return true;
    if (postponedGameBlocksIncoming(remoteGame, localGame)) return false;
    if (postponedGameBlocksIncoming(localGame, remoteGame)) return true;
    return localGame?.status === "active";
  }

  function rowRepresentsFinalGame(row) {
    return Boolean(row?.is_final || isFinalGameStatus(row?.status) || isFinalGameData(row?.game_data));
  }

  function hasMeaningfulPlayoffBracket(bracket = null) {
    if (!bracket || typeof bracket !== "object") return false;
    const directMatchups = Array.isArray(bracket.matchups) ? bracket.matchups : [];
    const roundMatchups = Array.isArray(bracket.rounds)
      ? bracket.rounds.flatMap((round) => Array.isArray(round?.matchups) ? round.matchups : [])
      : [];
    return [...directMatchups, ...roundMatchups].some((matchup) => {
      if (!matchup || typeof matchup !== "object") return false;
      return Boolean(
        matchup.matchupCode
        || matchup.matchup_code
        || matchup.label
        || matchup.teamA
        || matchup.team_a
        || matchup.teamB
        || matchup.team_b
        || matchup.linkedGameId
        || matchup.linked_game_id
        || matchup.isBye
        || matchup.is_bye
        || matchup.slotA
        || matchup.slotB
      );
    });
  }

  function buildAppStateRow(state) {
    const deletedGameTombstones = deepClone(state?.deletedGameTombstones || {});
    const currentGameIds = Array.isArray(state?.games)
      ? state.games.map((game) => game?.id).filter(Boolean).filter((gameId) => !deletedGameTombstones[gameId])
      : [];
    return {
      id: "primary",
      roster: deepClone(state?.roster || []),
      lineup: deepClone(state?.lineup || []),
      roster_version: state?.rosterVersion ?? null,
      active_game_id: state?.activeGameId || "",
      metadata: {
        updated_from: "scorebook-app",
        games_count: currentGameIds.length,
        current_game_ids: currentGameIds,
        deleted_game_tombstones: deletedGameTombstones,
        season_storylines: deepClone(state?.seasonStorylines || []),
        playoff_bracket: hasMeaningfulPlayoffBracket(state?.playoffBracket)
          ? deepClone(state.playoffBracket)
          : null
      }
    };
  }

  function buildGameRow(game) {
    return {
      id: game.id,
      opponent: game.opponent || "Opponent",
      game_date: game.date || null,
      game_time: game.time || "",
      status: isFinalGameData(game) ? "completed" : game.status || "scheduled",
      lions_side: game.lionsSide || "away",
      is_final: isFinalGameData(game),
      game_data: deepClone(game)
    };
  }

  function highlightFromRow(row) {
    if (!row?.id || !row?.game_id) return null;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const categories = normalizeHighlightCategoryList(row.categories || metadata.categories || metadata.highlight_categories, row.category || metadata.category || metadata.highlight_category || "");
    const playerIds = Array.isArray(row.player_ids)
      ? row.player_ids.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const hasSeasonFeaturedColumn = Object.prototype.hasOwnProperty.call(row, "season_featured");
    return {
      id: String(row.id || "").trim(),
      gameId: String(row.game_id || "").trim(),
      youtubeUrl: String(row.youtube_url || "").trim(),
      youtubeVideoId: String(row.youtube_video_id || "").trim(),
      title: String(row.title || "").trim(),
      description: String(row.description || "").trim(),
      category: categories[0] || "",
      categories,
      featured: Boolean(row.featured || metadata.featured),
      seasonFeatured: hasSeasonFeaturedColumn
        ? row.season_featured === true
        : Boolean(metadata.season_featured || metadata.seasonFeatured),
      inning: String(row.inning || "").trim(),
      playType: String(row.play_type || "").trim(),
      playerIds,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  function buildHighlightRow(highlight) {
    const categories = normalizeHighlightCategoryList(highlight?.categories || highlight?.highlight_categories || highlight?.tags, highlight?.category || highlight?.highlight_category || "");
    const category = categories[0] || "";
    return {
      id: String(highlight?.id || "").trim(),
      game_id: String(highlight?.gameId || highlight?.game_id || "").trim(),
      youtube_url: String(highlight?.youtubeUrl || highlight?.youtube_url || "").trim(),
      youtube_video_id: String(highlight?.youtubeVideoId || highlight?.youtube_video_id || "").trim(),
      title: String(highlight?.title || "").trim(),
      description: String(highlight?.description || "").trim(),
      category,
      categories,
      season_featured: Boolean(highlight?.seasonFeatured || highlight?.season_featured),
      inning: String(highlight?.inning || "").trim(),
      play_type: String(highlight?.playType || highlight?.play_type || "").trim(),
      player_ids: Array.isArray(highlight?.playerIds)
        ? highlight.playerIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      metadata: {
        updated_from: "scorebook-app",
        category,
        categories,
        season_featured: Boolean(highlight?.seasonFeatured || highlight?.season_featured)
      }
    };
  }

  function newsArticleFromRow(row) {
    if (!row?.id) return null;
    return {
      id: String(row.id || "").trim(),
      title: String(row.title || "").trim(),
      summary: String(row.summary || "").trim(),
      bodyHtml: String(row.body_html || "").trim(),
      category: String(row.category || "Team News").trim(),
      gameId: String(row.game_id || "").trim(),
      date: row.article_date || "",
      imageUrl: String(row.image_url || "").trim(),
      thumbnailUrl: String(row.thumbnail_url || "").trim(),
      imagePath: String(row.image_path || "").trim(),
      thumbnailPath: String(row.thumbnail_path || "").trim(),
      imageDataUrl: String(row.image_data_url || "").trim(),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  function buildNewsArticleRow(article) {
    const articleDate = String(article?.date || article?.article_date || "").trim();
    const imageUrl = String(article?.imageUrl || article?.image_url || "").trim();
    const thumbnailUrl = String(article?.thumbnailUrl || article?.thumbnail_url || imageUrl).trim();
    return {
      id: String(article?.id || "").trim(),
      title: String(article?.title || "").trim(),
      summary: String(article?.summary || "").trim(),
      body_html: String(article?.bodyHtml || article?.body_html || "").trim(),
      category: String(article?.category || "Team News").trim(),
      game_id: String(article?.gameId || article?.game_id || "").trim(),
      article_date: articleDate || null,
      image_url: imageUrl,
      thumbnail_url: thumbnailUrl,
      image_path: String(article?.imagePath || article?.image_path || "").trim(),
      thumbnail_path: String(article?.thumbnailPath || article?.thumbnail_path || "").trim(),
      image_data_url: "",
      metadata: {
        updated_from: "scorebook-app"
      }
    };
  }

  function financialPlanFromRow(row) {
    if (!row?.id) return null;
    return {
      id: String(row.id || "").trim(),
      season: String(row.season || "").trim(),
      charges: row.charges && typeof row.charges === "object" ? deepClone(row.charges) : {},
      customFees: Array.isArray(row.custom_fees) ? deepClone(row.custom_fees) : [],
      expensePayments: Array.isArray(row.expense_payments) ? deepClone(row.expense_payments) : [],
      transactions: Array.isArray(row.transactions) ? deepClone(row.transactions) : [],
      players: Array.isArray(row.players) ? deepClone(row.players) : [],
      notes: String(row.notes || "").trim(),
      metadata: row.metadata && typeof row.metadata === "object" ? deepClone(row.metadata) : {},
      createdAt: String(row.created_at || "").trim(),
      updatedAt: String(row.updated_at || "").trim()
    };
  }

  function buildFinancialPlanRow(plan = {}) {
    const season = Number.parseInt(String(plan.season || currentSeasonValue()), 10) || currentSeasonValue();
    return {
      id: String(plan.id || `finance-${season}`).trim(),
      season,
      charges: plan.charges && typeof plan.charges === "object" ? deepClone(plan.charges) : {},
      custom_fees: Array.isArray(plan.customFees || plan.custom_fees) ? deepClone(plan.customFees || plan.custom_fees) : [],
      expense_payments: Array.isArray(plan.expensePayments || plan.expense_payments) ? deepClone(plan.expensePayments || plan.expense_payments) : [],
      transactions: Array.isArray(plan.transactions || plan.transaction_history) ? deepClone(plan.transactions || plan.transaction_history) : [],
      players: Array.isArray(plan.players) ? deepClone(plan.players) : [],
      notes: String(plan.notes || "").trim(),
      metadata: {
        ...(plan.metadata && typeof plan.metadata === "object" ? deepClone(plan.metadata) : {}),
        updated_from: "scorebook-app"
      }
    };
  }

  function safeTournamentKey(value = "", fallback = "item") {
    return String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback;
  }

  function maybeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : null;
  }

  function maybeScore(value) {
    if (value === "" || value === undefined || value === null) return null;
    return maybeInteger(value);
  }

  function normalizeTournamentSource(source = {}, fallback = {}) {
    const raw = source && typeof source === "object" ? source : {};
    const textSource = typeof source === "string" ? String(source || "").trim() : "";
    const type = String(raw.type || raw.sourceType || fallback.type || "").trim().toLowerCase();
    const seed = maybeInteger(raw.seed ?? raw.sourceSeed ?? fallback.seed);
    const matchupCode = String(raw.matchupCode || raw.sourceMatchupCode || raw.matchup_code || fallback.matchupCode || "").trim().toUpperCase();
    const teamName = String(raw.teamName || raw.displayName || raw.name || fallback.teamName || textSource || "").trim();
    const teamId = String(raw.teamId || raw.sourceTeamId || fallback.teamId || (teamName ? safeTournamentKey(teamName, "") : "")).trim();
    if (type === "seed" || seed) {
      return {
        type: "seed",
        seed,
        teamId: teamId || "",
        matchupCode: "",
        label: String(raw.label || fallback.label || (seed ? `#${seed} Seed` : "Seed")).trim()
      };
    }
    if (type === "winner" || /^winner\s+/i.test(textSource)) {
      const sourceCode = matchupCode || textSource.replace(/^winner\s+/i, "").trim().toUpperCase();
      return {
        type: "winner",
        seed: null,
        teamId: "",
        matchupCode: sourceCode,
        label: String(raw.label || fallback.label || `Winner ${sourceCode || "TBD"}`).trim()
      };
    }
    if (type === "loser" || /^loser\s+/i.test(textSource)) {
      const sourceCode = matchupCode || textSource.replace(/^loser\s+/i, "").trim().toUpperCase();
      return {
        type: "loser",
        seed: null,
        teamId: "",
        matchupCode: sourceCode,
        label: String(raw.label || fallback.label || `Loser ${sourceCode || "TBD"}`).trim()
      };
    }
    if (type === "qualifier") {
      return {
        type: "qualifier",
        seed: null,
        teamId: "",
        matchupCode: "",
        label: String(raw.label || fallback.label || "Qualifier").trim()
      };
    }
    if (teamName) {
      return {
        type: "team",
        seed: null,
        teamId: teamId || safeTournamentKey(teamName),
        matchupCode: "",
        label: String(raw.label || fallback.label || teamName).trim()
      };
    }
    return {
      type: "tbd",
      seed: null,
      teamId: "",
      matchupCode: "",
      label: String(raw.label || fallback.label || "TBD").trim()
    };
  }

  function tournamentMatchupCode(matchup = {}, index = 0) {
    return String(matchup.matchupCode || matchup.matchup_code || matchup.code || matchup.label || `G-${index + 1}`)
      .trim()
      .toUpperCase();
  }

  function tournamentMatchupRowId(tournamentId, matchup = {}, index = 0) {
    const code = tournamentMatchupCode(matchup, index);
    return `${String(tournamentId || "primary-playoff-bracket").trim()}:${safeTournamentKey(code, `game-${index + 1}`)}`;
  }

  function buildTournamentRow(bracket = {}) {
    const season = maybeInteger(bracket.season) || currentSeasonValue();
    const status = String(bracket.status || (bracket.isPublic ? "published" : "draft")).trim() || "draft";
    return {
      id: String(bracket.id || "primary-playoff-bracket").trim(),
      name: String(bracket.name || bracket.title || `${season} AA Championship Series`).trim(),
      season,
      division: String(bracket.division || "AA").trim(),
      tournament_type: String(bracket.tournamentType || bracket.tournament_type || bracket.format || "double-elimination").trim(),
      status,
      starts_at: String(bracket.startsAt || bracket.starts_at || "").trim() || null,
      ends_at: String(bracket.endsAt || bracket.ends_at || "").trim() || null,
      is_public: bracket.isPublic === undefined ? status === "published" : Boolean(bracket.isPublic),
      championship_format: String(bracket.championshipFormat || bracket.championship_format || "Best of 3").trim(),
      description: String(bracket.description || "").trim(),
      template_id: String(bracket.templateId || bracket.template_id || "").trim(),
      metadata: {
        updated_from: "scorebook-app",
        title: String(bracket.title || bracket.name || `${season} AA Championship Series`).trim(),
        subtitle: String(bracket.subtitle || "").trim(),
        format: String(bracket.format || bracket.tournamentType || bracket.tournament_type || "double-elimination").trim(),
        updatedAt: String(bracket.updatedAt || bracket.updated_at || "").trim()
      }
    };
  }

  function buildTournamentEntryRows(bracket = {}) {
    const tournamentId = String(bracket.id || "primary-playoff-bracket").trim();
    return (Array.isArray(bracket.entries) ? bracket.entries : [])
      .map((entry, index) => {
        const seed = maybeInteger(entry.seed) || index + 1;
        const teamName = String(entry.teamName || entry.name || entry.displayNameOverride || entry.display_name_override || `#${seed} Seed`).trim();
        const teamId = String(entry.teamId || entry.team_id || safeTournamentKey(teamName || `seed-${seed}`)).trim();
        return {
          id: String(entry.id || `${tournamentId}:seed-${seed}`).trim(),
          tournament_id: tournamentId,
          team_id: teamId,
          seed,
          display_name_override: String(entry.displayNameOverride || entry.display_name_override || teamName).trim(),
          entry_status: String(entry.entryStatus || entry.entry_status || "active").trim(),
          metadata: {
            updated_from: "scorebook-app",
            teamName,
            source_entry: deepClone(entry)
          }
        };
      })
      .filter((row) => row.tournament_id && row.seed);
  }

  function buildTournamentMatchupRows(bracket = {}) {
    const tournamentId = String(bracket.id || "primary-playoff-bracket").trim();
    const matchups = Array.isArray(bracket.matchups) ? bracket.matchups : [];
    const codeToRowId = new Map(matchups.map((matchup, index) => [tournamentMatchupCode(matchup, index), tournamentMatchupRowId(tournamentId, matchup, index)]));
    return matchups
      .map((matchup, index) => {
        const code = tournamentMatchupCode(matchup, index);
        const homeSource = normalizeTournamentSource(matchup.slotA || matchup.homeSource || matchup.home_source, {
          seed: matchup.seedA || matchup.seed_a,
          teamName: matchup.teamA || matchup.team_a,
          label: matchup.sourceLabelA || matchup.source_label_a
        });
        const awaySource = normalizeTournamentSource(matchup.slotB || matchup.awaySource || matchup.away_source, {
          seed: matchup.seedB || matchup.seed_b,
          teamName: matchup.teamB || matchup.team_b,
          label: matchup.sourceLabelB || matchup.source_label_b
        });
        const winnerDestinationCode = String(matchup.winnerDestination || matchup.winner_destination || "").trim().toUpperCase();
        const loserDestinationCode = String(matchup.loserDestination || matchup.loser_destination || "").trim().toUpperCase();
        return {
          id: tournamentMatchupRowId(tournamentId, matchup, index),
          tournament_id: tournamentId,
          matchup_code: code,
          bracket_section: String(matchup.bracketSection || matchup.bracket_section || matchup.bracketSide || matchup.bracket_side || "winners").trim(),
          round_number: maybeInteger(matchup.roundNumber || matchup.round_number || matchup.round || matchup.order) || 1,
          display_order: maybeInteger(matchup.displayOrder || matchup.display_order || matchup.order) || index + 1,
          scheduled_at: null,
          date_label: String(matchup.dateLabel || matchup.date_label || "").trim(),
          time_label: String(matchup.timeLabel || matchup.time_label || "").trim(),
          location: String(matchup.location || "").trim(),
          status: String(matchup.status || (matchup.isBye ? "bye" : "scheduled")).trim(),
          series_best_of: maybeInteger(matchup.seriesBestOf || matchup.series_best_of) || 1,
          series_game_number: maybeInteger(matchup.seriesGameNumber || matchup.series_game_number) || 1,
          home_source_type: homeSource.type,
          home_source_seed: homeSource.seed,
          home_source_team_id: homeSource.teamId || null,
          home_source_matchup_id: homeSource.matchupCode ? (codeToRowId.get(homeSource.matchupCode) || null) : null,
          home_source_outcome: homeSource.type === "winner" || homeSource.type === "loser" ? homeSource.type : "",
          away_source_type: awaySource.type,
          away_source_seed: awaySource.seed,
          away_source_team_id: awaySource.teamId || null,
          away_source_matchup_id: awaySource.matchupCode ? (codeToRowId.get(awaySource.matchupCode) || null) : null,
          away_source_outcome: awaySource.type === "winner" || awaySource.type === "loser" ? awaySource.type : "",
          resolved_home_team_id: homeSource.teamId || null,
          resolved_away_team_id: awaySource.teamId || null,
          home_score: maybeScore(matchup.scoreA ?? matchup.score_a),
          away_score: maybeScore(matchup.scoreB ?? matchup.score_b),
          winner_team_id: matchup.winner === "A" || matchup.winnerSide === "A" ? homeSource.teamId || null : matchup.winner === "B" || matchup.winnerSide === "B" ? awaySource.teamId || null : null,
          loser_team_id: matchup.winner === "A" || matchup.winnerSide === "A" ? awaySource.teamId || null : matchup.winner === "B" || matchup.winnerSide === "B" ? homeSource.teamId || null : null,
          winner_destination_matchup_id: winnerDestinationCode ? (codeToRowId.get(winnerDestinationCode) || null) : null,
          winner_destination_slot: String(matchup.winnerDestinationSlot || matchup.winner_destination_slot || "").trim().toUpperCase(),
          loser_destination_matchup_id: loserDestinationCode ? (codeToRowId.get(loserDestinationCode) || null) : null,
          loser_destination_slot: String(matchup.loserDestinationSlot || matchup.loser_destination_slot || "").trim().toUpperCase(),
          linked_game_id: String(matchup.linkedGameId || matchup.linked_game_id || matchup.gameId || "").trim() || null,
          notes: String(matchup.note || matchup.notes || "").trim(),
          metadata: {
            updated_from: "scorebook-app",
            matchup: deepClone(matchup),
            homeSource,
            awaySource
          }
        };
      })
      .filter((row) => row.tournament_id && row.matchup_code);
  }

  function tournamentSourceFromRow(row = {}, prefix = "home") {
    const type = String(row[`${prefix}_source_type`] || "tbd").trim();
    const seed = maybeInteger(row[`${prefix}_source_seed`]);
    const teamId = String(row[`${prefix}_source_team_id`] || "").trim();
    const outcome = String(row[`${prefix}_source_outcome`] || "").trim();
    const sourceMatchupId = String(row[`${prefix}_source_matchup_id`] || "").trim();
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const metadataSource = prefix === "home" ? metadata.homeSource : metadata.awaySource;
    if (metadataSource && typeof metadataSource === "object") return deepClone(metadataSource);
    if ((type === "winner" || outcome === "winner") && sourceMatchupId) return { type: "winner", matchupCode: sourceMatchupId.split(":").pop()?.toUpperCase() || "", label: `Winner ${sourceMatchupId}` };
    if ((type === "loser" || outcome === "loser") && sourceMatchupId) return { type: "loser", matchupCode: sourceMatchupId.split(":").pop()?.toUpperCase() || "", label: `Loser ${sourceMatchupId}` };
    if (type === "seed" || seed) return { type: "seed", seed, teamId, label: seed ? `#${seed} Seed` : "Seed" };
    if (teamId) return { type: "team", teamId, teamName: "", label: teamId };
    return { type: type || "tbd", label: "TBD" };
  }

  function playoffBracketFromTournamentRows(tournamentRow, entryRows = [], matchupRows = []) {
    if (!tournamentRow?.id) return null;
    const metadata = tournamentRow.metadata && typeof tournamentRow.metadata === "object" ? tournamentRow.metadata : {};
    const entries = (Array.isArray(entryRows) ? entryRows : [])
      .filter((row) => row?.tournament_id === tournamentRow.id)
      .map((row) => ({
        id: String(row.id || "").trim(),
        teamId: String(row.team_id || "").trim(),
        teamName: String(row.metadata?.teamName || row.display_name_override || row.team_id || "").trim(),
        seed: maybeInteger(row.seed) || 0,
        displayNameOverride: String(row.display_name_override || "").trim(),
        entryStatus: String(row.entry_status || "active").trim()
      }))
      .filter((entry) => entry.seed)
      .sort((left, right) => left.seed - right.seed);
    const entriesByTeamId = new Map(entries.map((entry) => [entry.teamId, entry]).filter(([teamId]) => Boolean(teamId)));
    const entriesBySeed = new Map(entries.map((entry) => [entry.seed, entry]));
    const teamNameForSource = (source) => {
      if (!source || typeof source !== "object") return "";
      if (source.teamName) return source.teamName;
      if (source.seed && entriesBySeed.has(source.seed)) return entriesBySeed.get(source.seed).teamName;
      if (source.teamId && entriesByTeamId.has(source.teamId)) return entriesByTeamId.get(source.teamId).teamName;
      return "";
    };
    const matchups = (Array.isArray(matchupRows) ? matchupRows : [])
      .filter((row) => row?.tournament_id === tournamentRow.id)
      .map((row, index) => {
        const rowMetadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
        const sourceMatchup = rowMetadata.matchup && typeof rowMetadata.matchup === "object" ? rowMetadata.matchup : {};
        const homeSource = tournamentSourceFromRow(row, "home");
        const awaySource = tournamentSourceFromRow(row, "away");
        const teamA = String(sourceMatchup.teamA || sourceMatchup.team_a || teamNameForSource(homeSource)).trim();
        const teamB = String(sourceMatchup.teamB || sourceMatchup.team_b || teamNameForSource(awaySource)).trim();
        const winnerSide = String(sourceMatchup.winnerSide || sourceMatchup.winner || "").trim().toUpperCase();
        return {
          ...deepClone(sourceMatchup),
          id: String(sourceMatchup.id || row.id || "").trim(),
          matchupCode: String(row.matchup_code || sourceMatchup.matchupCode || sourceMatchup.label || `G-${index + 1}`).trim(),
          label: String(sourceMatchup.label || row.matchup_code || "").trim(),
          bracketSection: String(row.bracket_section || sourceMatchup.bracketSection || sourceMatchup.bracketSide || "winners").trim(),
          bracketSide: String(row.bracket_section || sourceMatchup.bracketSide || sourceMatchup.bracketSection || "winners").trim(),
          roundNumber: maybeInteger(row.round_number) || maybeInteger(sourceMatchup.roundNumber) || 1,
          displayOrder: maybeInteger(row.display_order) || maybeInteger(sourceMatchup.displayOrder) || index + 1,
          order: maybeInteger(row.display_order) || maybeInteger(sourceMatchup.order) || index + 1,
          dateLabel: String(row.date_label || sourceMatchup.dateLabel || "").trim(),
          timeLabel: String(row.time_label || sourceMatchup.timeLabel || "").trim(),
          location: String(row.location || sourceMatchup.location || "").trim(),
          status: String(row.status || sourceMatchup.status || "scheduled").trim(),
          seriesBestOf: maybeInteger(row.series_best_of) || maybeInteger(sourceMatchup.seriesBestOf) || 1,
          seriesGameNumber: maybeInteger(row.series_game_number) || maybeInteger(sourceMatchup.seriesGameNumber) || 1,
          slotA: homeSource,
          slotB: awaySource,
          teamA,
          seedA: sourceMatchup.seedA || homeSource.seed || "",
          sourceLabelA: sourceMatchup.sourceLabelA || homeSource.label || "",
          scoreA: row.home_score === null || row.home_score === undefined ? String(sourceMatchup.scoreA || "") : String(row.home_score),
          teamB,
          seedB: sourceMatchup.seedB || awaySource.seed || "",
          sourceLabelB: sourceMatchup.sourceLabelB || awaySource.label || "",
          scoreB: row.away_score === null || row.away_score === undefined ? String(sourceMatchup.scoreB || "") : String(row.away_score),
          winner: winnerSide,
          winnerSide,
          winnerDestination: String(sourceMatchup.winnerDestination || "").trim(),
          winnerDestinationSlot: String(row.winner_destination_slot || sourceMatchup.winnerDestinationSlot || "").trim(),
          loserDestination: String(sourceMatchup.loserDestination || "").trim(),
          loserDestinationSlot: String(row.loser_destination_slot || sourceMatchup.loserDestinationSlot || "").trim(),
          linkedGameId: String(row.linked_game_id || sourceMatchup.linkedGameId || "").trim(),
          note: String(row.notes || sourceMatchup.note || "").trim()
        };
      })
      .sort((left, right) => (left.roundNumber - right.roundNumber) || (left.displayOrder - right.displayOrder));
    return {
      id: String(tournamentRow.id || "").trim(),
      name: String(tournamentRow.name || "").trim(),
      title: String(metadata.title || tournamentRow.name || "").trim(),
      subtitle: String(metadata.subtitle || tournamentRow.description || "").trim(),
      description: String(tournamentRow.description || "").trim(),
      season: String(tournamentRow.season || "").trim(),
      division: String(tournamentRow.division || "AA").trim(),
      tournamentType: String(tournamentRow.tournament_type || metadata.format || "double-elimination").trim(),
      format: String(metadata.format || tournamentRow.tournament_type || "double-elimination").trim(),
      templateId: String(tournamentRow.template_id || "").trim(),
      status: String(tournamentRow.status || "draft").trim(),
      isPublic: Boolean(tournamentRow.is_public),
      startsAt: String(tournamentRow.starts_at || "").trim(),
      endsAt: String(tournamentRow.ends_at || "").trim(),
      championshipFormat: String(tournamentRow.championship_format || "Best of 3").trim(),
      entries,
      matchups,
      updatedAt: String(tournamentRow.updated_at || metadata.updatedAt || "").trim(),
      rounds: []
    };
  }

  function mergeRemoteSnapshot(baseState, appStateRow, gamesRows, rosterRows = [], highlightRows = [], newsRows = undefined, playoffBrackets = undefined) {
    const nextState = deepClone(baseState || {});
    const remoteMetadata = appStateRow?.metadata && typeof appStateRow.metadata === "object" ? appStateRow.metadata : {};
    const remoteDeletedGameTombstones = remoteMetadata.deleted_game_tombstones && typeof remoteMetadata.deleted_game_tombstones === "object"
      ? deepClone(remoteMetadata.deleted_game_tombstones)
      : {};
    nextState.deletedGameTombstones = deepClone(remoteDeletedGameTombstones);
    if (Array.isArray(playoffBrackets) && playoffBrackets.length) {
      const metadataBracketId = String(remoteMetadata.playoff_bracket?.id || "").trim();
      nextState.playoffBracket = deepClone(playoffBrackets.find((bracket) => bracket.id === metadataBracketId) || playoffBrackets[0]);
    } else if (remoteMetadata.playoff_bracket && typeof remoteMetadata.playoff_bracket === "object") {
      nextState.playoffBracket = deepClone(remoteMetadata.playoff_bracket);
    }
    nextState.seasonStorylines = Array.isArray(remoteMetadata.season_storylines)
      ? deepClone(remoteMetadata.season_storylines)
      : deepClone(nextState.seasonStorylines || []);
    if (Array.isArray(newsRows)) {
      nextState.newsArticles = newsRows.map(newsArticleFromRow).filter((article) => article?.id);
    } else {
      nextState.newsArticles = Array.isArray(remoteMetadata.news_articles)
        ? deepClone(remoteMetadata.news_articles)
        : deepClone(nextState.newsArticles || []);
    }
    const rosterFromRows = Array.isArray(rosterRows)
      ? rosterRows.map(rosterPlayerFromRow).filter((player) => player?.id)
      : [];
    if (rosterFromRows.length) {
      nextState.roster = rosterFromRows;
    }
    if (appStateRow) {
      if (!rosterFromRows.length && Array.isArray(appStateRow.roster) && appStateRow.roster.length) {
        nextState.roster = deepClone(appStateRow.roster);
      }
      if (Array.isArray(appStateRow.lineup) && appStateRow.lineup.length) {
        nextState.lineup = deepClone(appStateRow.lineup);
      }
      if (appStateRow.roster_version !== undefined && appStateRow.roster_version !== null) {
        nextState.rosterVersion = appStateRow.roster_version;
      }
      if (typeof appStateRow.active_game_id === "string") {
        nextState.activeGameId = appStateRow.active_game_id;
      }
    }
    if (Array.isArray(gamesRows)) {
      const localGames = Array.isArray(nextState.games) ? nextState.games.map((game) => deepClone(game)).filter(Boolean) : [];
      const remoteGamesById = new Map(
        gamesRows
          .map((row) => {
            const game = deepClone(row.game_data || null);
            const id = row.id || game?.id || "";
            return id && game ? [id, game] : null;
          })
          .filter(Boolean)
      );
      const mergedGames = [];
      const seenIds = new Set();
      localGames.forEach((game) => {
        const gameId = game?.id || "";
        if (!gameId || seenIds.has(gameId)) return;
        const remoteGame = remoteGamesById.get(gameId);
        if (!remoteGame && nextState.deletedGameTombstones?.[gameId]) {
          seenIds.add(gameId);
          return;
        }
        if (shouldUseLocalGameOverRemote(game, remoteGame)) {
          mergedGames.push(game);
          seenIds.add(gameId);
          remoteGamesById.delete(gameId);
          return;
        }
        if (remoteGame) {
          mergedGames.push(remoteGame);
          seenIds.add(gameId);
          remoteGamesById.delete(gameId);
          return;
        }
        seenIds.add(gameId);
      });
      remoteGamesById.forEach((game, gameId) => {
        if (!gameId || seenIds.has(gameId)) return;
        mergedGames.push(game);
        seenIds.add(gameId);
      });
      nextState.games = mergedGames;
    }
    if (Array.isArray(highlightRows)) {
      nextState.highlights = highlightRows.map(highlightFromRow).filter((highlight) => highlight?.id);
    }
    return nextState;
  }

  async function fetchAppState() {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const response = await client
      .from("app_state")
      .select("*")
      .eq("id", "primary")
      .maybeSingle();
    return response;
  }

  async function fetchGames() {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const response = await client
      .from("games")
      .select("*")
      .order("game_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false });
    return response;
  }

  async function fetchRosterPlayers() {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const response = await client
      .from("roster_players")
      .select("*")
      .eq("team_id", "lions")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (isMissingTableError(response.error, "roster_players")) {
      return { data: [], error: null, missingTable: true };
    }
    return response;
  }

  async function fetchHighlights() {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const response = await client
      .from("game_highlights")
      .select("*")
      .order("game_id", { ascending: true })
      .order("created_at", { ascending: false });
    if (isMissingTableError(response.error, "game_highlights")) {
      return { data: [], error: null, missingTable: true };
    }
    return response;
  }

  async function fetchNewsArticles(options = {}) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const columns = options.includeLegacyImageData ? NEWS_ARTICLE_FULL_COLUMNS : NEWS_ARTICLE_COLUMNS;
    let response = await client
      .from("news_articles")
      .select(columns)
      .order("article_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (
      isMissingColumnError(response.error, "image_url")
      || isMissingColumnError(response.error, "thumbnail_url")
      || isMissingColumnError(response.error, "image_path")
      || isMissingColumnError(response.error, "thumbnail_path")
    ) {
      const legacyColumns = options.includeLegacyImageData ? NEWS_ARTICLE_LEGACY_FULL_COLUMNS : NEWS_ARTICLE_LEGACY_COLUMNS;
      response = await client
        .from("news_articles")
        .select(legacyColumns)
        .order("article_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    }
    if (isMissingTableError(response.error, "news_articles")) {
      return { data: [], error: null, missingTable: true };
    }
    return response;
  }

  async function fetchFinancialPlans() {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const response = await client
      .from("season_financial_plans")
      .select(FINANCIAL_PLAN_COLUMNS)
      .order("season", { ascending: false });
    if (isMissingTableError(response.error, "season_financial_plans")) {
      return { data: [], error: null, missingTable: true };
    }
    return {
      ...response,
      data: (response.data || []).map(financialPlanFromRow).filter((plan) => plan?.id)
    };
  }

  async function fetchPlayoffBrackets() {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const tournamentsResponse = await client
      .from("tournaments")
      .select("*")
      .order("season", { ascending: false })
      .order("updated_at", { ascending: false });
    if (isMissingTableError(tournamentsResponse.error, "tournaments")) {
      return { data: [], error: null, missingTable: true };
    }
    if (tournamentsResponse.error) return { data: [], error: tournamentsResponse.error };
    const tournamentIds = (tournamentsResponse.data || []).map((row) => row.id).filter(Boolean);
    if (!tournamentIds.length) return { data: [], error: null };
    const [entriesResponse, matchupsResponse] = await Promise.all([
      client
        .from("tournament_entries")
        .select("*")
        .in("tournament_id", tournamentIds)
        .order("seed", { ascending: true }),
      client
        .from("tournament_matchups")
        .select("*")
        .in("tournament_id", tournamentIds)
        .order("bracket_section", { ascending: true })
        .order("round_number", { ascending: true })
        .order("display_order", { ascending: true })
    ]);
    const error = entriesResponse.error || matchupsResponse.error || null;
    if (isMissingTableError(error, "tournament_entries") || isMissingTableError(error, "tournament_matchups")) {
      return { data: [], error: null, missingTable: true };
    }
    if (error) return { data: [], error };
    return {
      data: (tournamentsResponse.data || [])
        .map((tournament) => playoffBracketFromTournamentRows(tournament, entriesResponse.data || [], matchupsResponse.data || []))
        .filter((bracket) => bracket?.id),
      error: null
    };
  }

  async function fetchBootstrap() {
    const [appStateResponse, rosterPlayersResponse, gamesResponse, highlightsResponse, newsArticlesResponse, playoffBracketsResponse] = await Promise.all([
      fetchAppState(),
      fetchRosterPlayers(),
      fetchGames(),
      fetchHighlights(),
      fetchNewsArticles(),
      fetchPlayoffBrackets()
    ]);
    const error = appStateResponse.error || rosterPlayersResponse.error || gamesResponse.error || highlightsResponse.error || newsArticlesResponse.error || playoffBracketsResponse.error || null;
    return {
      data: {
        appState: appStateResponse.data || null,
        rosterPlayers: rosterPlayersResponse.data || [],
        rosterPlayersMissingTable: Boolean(rosterPlayersResponse.missingTable),
        games: gamesResponse.data || [],
        highlights: highlightsResponse.data || [],
        highlightsMissingTable: Boolean(highlightsResponse.missingTable),
        newsArticles: newsArticlesResponse.data || [],
        newsArticlesMissingTable: Boolean(newsArticlesResponse.missingTable),
        playoffBrackets: playoffBracketsResponse.data || [],
        playoffBracketsMissingTable: Boolean(playoffBracketsResponse.missingTable)
      },
      error
    };
  }

  async function fetchLeagueStandings(division = "AA", season = currentSeasonValue()) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const response = await client
      .from("league_standings")
      .select("*")
      .eq("division", String(division || "AA").toUpperCase())
      .eq("season", Number(season) || currentSeasonValue())
      .order("rank", { ascending: true, nullsFirst: false })
      .order("points", { ascending: false });
    return response;
  }

  async function recordSiteVisit(visit = {}) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const response = await client.rpc("record_site_visit", {
      p_visitor_id: String(visit.visitorId || visit.visitor_id || "").trim(),
      p_session_id: String(visit.sessionId || visit.session_id || "").trim(),
      p_page_path: String(visit.pagePath || visit.page_path || "").trim(),
      p_view_name: String(visit.viewName || visit.view_name || "").trim(),
      p_device_type: String(visit.deviceType || visit.device_type || "").trim(),
      p_is_admin: Boolean(visit.isAdmin || visit.is_admin),
      p_metadata: visit.metadata && typeof visit.metadata === "object" ? visit.metadata : {}
    });
    if (isMissingRoutineError(response.error, "record_site_visit")) {
      return {
        data: null,
        error: new Error("Supabase record_site_visit function is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingFunction: true
      };
    }
    return response;
  }

  async function fetchSiteVisitSummary() {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const response = await client.rpc("get_site_visit_summary");
    if (isMissingRoutineError(response.error, "get_site_visit_summary")) {
      return {
        data: null,
        error: new Error("Supabase get_site_visit_summary function is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingFunction: true
      };
    }
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    return {
      ...response,
      data: row || {
        total_visits: 0,
        today_visits: 0,
        unique_visitors: 0,
        last_visit_at: null
      }
    };
  }

  async function upsertAppState(state) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const row = buildAppStateRow(state);
    return client
      .from("app_state")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();
  }

  async function upsertRosterPlayers(roster = [], rosterVersion = "") {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const rows = (Array.isArray(roster) ? roster : [])
      .filter((player) => player?.id)
      .map((player, index) => buildRosterPlayerRow(player, index, rosterVersion));
    if (!rows.length) return { data: [], error: null };
    const response = await client
      .from("roster_players")
      .upsert(rows, { onConflict: "id" })
      .select("id, updated_at");
    if (isMissingTableError(response.error, "roster_players")) {
      return {
        data: [],
        error: new Error("Supabase roster_players table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return response;
  }

  async function upsertGames(games = []) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const rows = games.filter((game) => game?.id).map(buildGameRow);
    if (!rows.length) return { data: [], error: null };
    const ids = rows.map((row) => row.id).filter(Boolean);
    const existingResponse = await client
      .from("games")
      .select("id,status,is_final,game_data")
      .in("id", ids);
    if (existingResponse.error) {
      return { data: [], error: existingResponse.error };
    }
    const finalRemoteIds = new Set(
      (existingResponse.data || [])
        .filter(rowRepresentsFinalGame)
        .map((row) => row.id)
        .filter(Boolean)
    );
    const existingGamesById = new Map(
      (existingResponse.data || [])
        .map((row) => [row.id, row.game_data])
        .filter(([id, game]) => Boolean(id && game))
    );
    const skippedFinalGameIds = [];
    const skippedPostponedGameIds = [];
    const safeRows = rows.filter((row) => {
      const blocked = finalRemoteIds.has(row.id) && !isFinalGameData(row.game_data);
      if (blocked) {
        skippedFinalGameIds.push(row.id);
        return false;
      }
      const existingGame = existingGamesById.get(row.id);
      const postponedBlocked = postponedGameBlocksIncoming(existingGame, row.game_data);
      if (postponedBlocked) {
        skippedPostponedGameIds.push(row.id);
        return false;
      }
      return true;
    });
    if (!safeRows.length) {
      return { data: [], error: null, skippedFinalGameIds, skippedPostponedGameIds };
    }
    const response = await client
      .from("games")
      .upsert(safeRows, { onConflict: "id" })
      .select("id, updated_at");
    return {
      ...response,
      skippedFinalGameIds,
      skippedPostponedGameIds
    };
  }

  async function upsertPlayoffBracket(bracket) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    if (!bracket?.id) return { data: null, error: null };
    const tournamentRow = buildTournamentRow(bracket);
    const entryRows = buildTournamentEntryRows(bracket);
    const matchupRows = buildTournamentMatchupRows(bracket);
    const missingTournamentTableError = () => ({
      data: null,
      error: new Error("Supabase tournament tables are not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
      missingTable: true
    });
    const clearReferencesResponse = await client
      .from("tournament_matchups")
      .update({
        home_source_matchup_id: null,
        away_source_matchup_id: null,
        winner_destination_matchup_id: null,
        loser_destination_matchup_id: null
      })
      .eq("tournament_id", tournamentRow.id);
    if (isMissingTableError(clearReferencesResponse.error, "tournament_matchups")) return missingTournamentTableError();
    if (clearReferencesResponse.error) return { data: null, error: clearReferencesResponse.error };
    const deleteMatchupsResponse = await client
      .from("tournament_matchups")
      .delete()
      .eq("tournament_id", tournamentRow.id);
    if (deleteMatchupsResponse.error) return { data: null, error: deleteMatchupsResponse.error };
    const deleteEntriesResponse = await client
      .from("tournament_entries")
      .delete()
      .eq("tournament_id", tournamentRow.id);
    if (isMissingTableError(deleteEntriesResponse.error, "tournament_entries")) return missingTournamentTableError();
    if (deleteEntriesResponse.error) return { data: null, error: deleteEntriesResponse.error };
    const tournamentResponse = await client
      .from("tournaments")
      .upsert(tournamentRow, { onConflict: "id" })
      .select("*")
      .single();
    if (isMissingTableError(tournamentResponse.error, "tournaments")) return missingTournamentTableError();
    if (tournamentResponse.error) return { data: null, error: tournamentResponse.error };
    const entriesResponse = entryRows.length
      ? await client.from("tournament_entries").insert(entryRows).select("*")
      : { data: [], error: null };
    if (entriesResponse.error) return { data: null, error: entriesResponse.error };
    const matchupsResponse = matchupRows.length
      ? await client.from("tournament_matchups").insert(matchupRows).select("*")
      : { data: [], error: null };
    if (matchupsResponse.error) return { data: null, error: matchupsResponse.error };
    return {
      data: playoffBracketFromTournamentRows(tournamentResponse.data, entriesResponse.data || [], matchupsResponse.data || []),
      error: null
    };
  }

  async function pushSnapshot(state) {
    const [appStateResponse, rosterPlayersResponse, gamesResponse] = await Promise.all([
      upsertAppState(state),
      upsertRosterPlayers(state?.roster || [], state?.rosterVersion || ""),
      upsertGames(state?.games || [])
    ]);
    const baseWriteError = appStateResponse.error || rosterPlayersResponse.error || gamesResponse.error || null;
    const playoffBracketResponse = !baseWriteError && hasMeaningfulPlayoffBracket(state?.playoffBracket)
      ? await upsertPlayoffBracket(state.playoffBracket)
      : { data: null, error: null };
    return {
      data: {
        appState: appStateResponse.data || null,
        rosterPlayers: rosterPlayersResponse.data || [],
        rosterPlayersMissingTable: Boolean(rosterPlayersResponse.missingTable),
        games: gamesResponse.data || [],
        playoffBracket: playoffBracketResponse.data || null,
        playoffBracketsMissingTable: Boolean(playoffBracketResponse.missingTable)
      },
      error: baseWriteError || playoffBracketResponse.error || null
    };
  }

  async function replaceGamesSnapshot(games = []) {
    return upsertGames(games);
  }

  async function deleteGames(gameIds = []) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const ids = [...new Set(gameIds.filter(Boolean))];
    if (!ids.length) return { data: [], error: null };
    return client
      .from("games")
      .delete()
      .in("id", ids)
      .select("id");
  }

  async function upsertHighlight(highlight) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const row = buildHighlightRow(highlight);
    if (!row.id || !row.game_id) return { data: null, error: new Error("Highlight is missing an id or game id.") };
    let response = await client
      .from("game_highlights")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (isMissingColumnError(response.error, "categories")) {
      const { categories, ...legacyRow } = row;
      response = await client
        .from("game_highlights")
        .upsert(legacyRow, { onConflict: "id" })
        .select("*")
        .single();
    }
    if (isMissingColumnError(response.error, "category")) {
      const { category, categories, ...legacyRow } = row;
      response = await client
        .from("game_highlights")
        .upsert(legacyRow, { onConflict: "id" })
        .select("*")
        .single();
    }
    if (isMissingColumnError(response.error, "season_featured")) {
      const { season_featured, ...legacyRow } = row;
      response = await client
        .from("game_highlights")
        .upsert(legacyRow, { onConflict: "id" })
        .select("*")
        .single();
      if (response.data) {
        response.data.metadata = {
          ...(response.data.metadata && typeof response.data.metadata === "object" ? response.data.metadata : {}),
          season_featured: Boolean(row.season_featured)
        };
      }
    }
    if (isMissingTableError(response.error, "game_highlights")) {
      return {
        data: null,
        error: new Error("Supabase game_highlights table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return {
      ...response,
      data: highlightFromRow(response.data)
    };
  }

  async function clearSeasonFeaturedHighlights(exceptHighlightId = "") {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    let query = client
      .from("game_highlights")
      .update({ season_featured: false })
      .eq("season_featured", true);
    const exceptId = String(exceptHighlightId || "").trim();
    if (exceptId) query = query.neq("id", exceptId);
    const response = await query.select("id");
    if (isMissingColumnError(response.error, "season_featured")) {
      return { data: [], error: response.error, missingColumn: true };
    }
    if (isMissingTableError(response.error, "game_highlights")) {
      return {
        data: [],
        error: new Error("Supabase game_highlights table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return response;
  }

  async function deleteHighlight(highlightId) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const id = String(highlightId || "").trim();
    if (!id) return { data: [], error: null };
    const response = await client
      .from("game_highlights")
      .delete()
      .eq("id", id)
      .select("id");
    if (isMissingTableError(response.error, "game_highlights")) {
      return {
        data: [],
        error: new Error("Supabase game_highlights table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return response;
  }

  async function upsertNewsArticle(article) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const row = buildNewsArticleRow(article);
    if (!row.id || !row.title) return { data: null, error: new Error("News article is missing an id or title.") };
    const response = await client
      .from("news_articles")
      .upsert(row, { onConflict: "id" })
      .select(NEWS_ARTICLE_FULL_COLUMNS)
      .single();
    if (isMissingTableError(response.error, "news_articles")) {
      return {
        data: null,
        error: new Error("Supabase news_articles table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return {
      ...response,
      data: newsArticleFromRow(response.data)
    };
  }

  async function deleteNewsArticle(articleId) {
    const client = getClient();
    if (!client) return { data: [], error: new Error("Supabase client not ready.") };
    const id = String(articleId || "").trim();
    if (!id) return { data: [], error: null };
    const response = await client
      .from("news_articles")
      .delete()
      .eq("id", id)
      .select("id");
    if (isMissingTableError(response.error, "news_articles")) {
      return {
        data: [],
        error: new Error("Supabase news_articles table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return response;
  }

  async function upsertFinancialPlan(plan) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const row = buildFinancialPlanRow(plan);
    if (!row.id || !row.season) return { data: null, error: new Error("Financial plan is missing a season.") };
    const response = await client
      .from("season_financial_plans")
      .upsert(row, { onConflict: "season" })
      .select(FINANCIAL_PLAN_COLUMNS)
      .single();
    if (isMissingTableError(response.error, "season_financial_plans")) {
      return {
        data: null,
        error: new Error("Supabase season_financial_plans table is not available to the app. Run supabase-schema.sql in this environment or refresh the Supabase API schema cache."),
        missingTable: true
      };
    }
    return {
      ...response,
      data: financialPlanFromRow(response.data)
    };
  }

  function parseImageDataUrl(dataUrl = "") {
    const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([\s\S]+)$/i);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const extension = mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : "jpg";
    const binary = global.atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return {
      blob: new Blob([bytes], { type: mimeType }),
      extension,
      mimeType
    };
  }

  function safeStoragePathSegment(value = "") {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article";
  }

  async function uploadNewsImageAsset(articleId, dataUrl, options = {}) {
    const client = getClient();
    if (!client) return { data: null, error: new Error("Supabase client not ready.") };
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) return { data: null, error: new Error("News image is not a supported image data URL.") };
    const kind = safeStoragePathSegment(options.kind || "image");
    const articleKey = safeStoragePathSegment(articleId || "article");
    const path = `articles/${articleKey}/${kind}-${Date.now()}.${parsed.extension}`;
    const bucket = client.storage.from(NEWS_IMAGE_BUCKET);
    const uploadResponse = await bucket.upload(path, parsed.blob, {
      cacheControl: "31536000",
      contentType: parsed.mimeType,
      upsert: true
    });
    if (uploadResponse.error) {
      return {
        data: null,
        error: uploadResponse.error
      };
    }
    const publicResponse = bucket.getPublicUrl(path);
    return {
      data: {
        bucket: NEWS_IMAGE_BUCKET,
        path,
        publicUrl: publicResponse?.data?.publicUrl || ""
      },
      error: null
    };
  }

  async function isAdminEmail(email) {
    const client = getClient();
    if (!client) return { data: false, error: new Error("Supabase client not ready.") };
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return { data: false, error: null };
    const response = await client
      .from("app_admins")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    return {
      data: Boolean(response.data?.email),
      error: response.error || null
    };
  }

  global.ScorebookSupabaseStorage = {
    getClient,
    isReady,
    buildAppStateRow,
    buildGameRow,
    buildHighlightRow,
    buildNewsArticleRow,
    buildRosterPlayerRow,
    highlightFromRow,
    newsArticleFromRow,
    rosterPlayerFromRow,
    mergeRemoteSnapshot,
    fetchAppState,
    fetchRosterPlayers,
    fetchGames,
    fetchHighlights,
    fetchNewsArticles,
    fetchFinancialPlans,
    fetchPlayoffBrackets,
    fetchBootstrap,
    fetchLeagueStandings,
    recordSiteVisit,
    fetchSiteVisitSummary,
    upsertAppState,
    upsertRosterPlayers,
    upsertGames,
    upsertPlayoffBracket,
    pushSnapshot,
    replaceGamesSnapshot,
    deleteGames,
    upsertHighlight,
    clearSeasonFeaturedHighlights,
    deleteHighlight,
    upsertNewsArticle,
    deleteNewsArticle,
    upsertFinancialPlan,
    uploadNewsImageAsset,
    isAdminEmail
  };
})(window);
