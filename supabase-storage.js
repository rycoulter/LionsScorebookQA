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
        playoff_bracket: deepClone(state?.playoffBracket || null)
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
    return {
      id: String(row.id || "").trim(),
      gameId: String(row.game_id || "").trim(),
      youtubeUrl: String(row.youtube_url || "").trim(),
      youtubeVideoId: String(row.youtube_video_id || "").trim(),
      title: String(row.title || "").trim(),
      description: String(row.description || "").trim(),
      category: categories[0] || "",
      categories,
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
      inning: String(highlight?.inning || "").trim(),
      play_type: String(highlight?.playType || highlight?.play_type || "").trim(),
      player_ids: Array.isArray(highlight?.playerIds)
        ? highlight.playerIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
      metadata: {
        updated_from: "scorebook-app",
        category,
        categories
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

  function mergeRemoteSnapshot(baseState, appStateRow, gamesRows, rosterRows = [], highlightRows = [], newsRows = undefined) {
    const nextState = deepClone(baseState || {});
    const remoteMetadata = appStateRow?.metadata && typeof appStateRow.metadata === "object" ? appStateRow.metadata : {};
    const remoteDeletedGameTombstones = remoteMetadata.deleted_game_tombstones && typeof remoteMetadata.deleted_game_tombstones === "object"
      ? deepClone(remoteMetadata.deleted_game_tombstones)
      : {};
    nextState.deletedGameTombstones = deepClone(remoteDeletedGameTombstones);
    if (remoteMetadata.playoff_bracket && typeof remoteMetadata.playoff_bracket === "object") {
      nextState.playoffBracket = deepClone(remoteMetadata.playoff_bracket);
    }
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

  async function fetchBootstrap() {
    const [appStateResponse, rosterPlayersResponse, gamesResponse, highlightsResponse, newsArticlesResponse] = await Promise.all([
      fetchAppState(),
      fetchRosterPlayers(),
      fetchGames(),
      fetchHighlights(),
      fetchNewsArticles()
    ]);
    const error = appStateResponse.error || rosterPlayersResponse.error || gamesResponse.error || highlightsResponse.error || newsArticlesResponse.error || null;
    return {
      data: {
        appState: appStateResponse.data || null,
        rosterPlayers: rosterPlayersResponse.data || [],
        rosterPlayersMissingTable: Boolean(rosterPlayersResponse.missingTable),
        games: gamesResponse.data || [],
        highlights: highlightsResponse.data || [],
        highlightsMissingTable: Boolean(highlightsResponse.missingTable),
        newsArticles: newsArticlesResponse.data || [],
        newsArticlesMissingTable: Boolean(newsArticlesResponse.missingTable)
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

  async function pushSnapshot(state) {
    const [appStateResponse, rosterPlayersResponse, gamesResponse] = await Promise.all([
      upsertAppState(state),
      upsertRosterPlayers(state?.roster || [], state?.rosterVersion || ""),
      upsertGames(state?.games || [])
    ]);
    return {
      data: {
        appState: appStateResponse.data || null,
        rosterPlayers: rosterPlayersResponse.data || [],
        rosterPlayersMissingTable: Boolean(rosterPlayersResponse.missingTable),
        games: gamesResponse.data || []
      },
      error: appStateResponse.error || rosterPlayersResponse.error || gamesResponse.error || null
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
    fetchBootstrap,
    fetchLeagueStandings,
    recordSiteVisit,
    fetchSiteVisitSummary,
    upsertAppState,
    upsertRosterPlayers,
    upsertGames,
    pushSnapshot,
    replaceGamesSnapshot,
    deleteGames,
    upsertHighlight,
    deleteHighlight,
    upsertNewsArticle,
    deleteNewsArticle,
    uploadNewsImageAsset,
    isAdminEmail
  };
})(window);
