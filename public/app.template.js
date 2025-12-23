// app.js — ArcadeHub core (Auth + Profile + Leaderboard + Navigation + Shared submitCoins)
// Requires: <script src="https://unpkg.com/@supabase/supabase-js@2"></script>

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // 1) Supabase Configuration
  // =========================
  const SUPABASE_URL = '%%SUPABASE_URL%%';
  const SUPABASE_ANON_KEY = '%%SUPABASE_ANON_KEY%%';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('%%') || SUPABASE_ANON_KEY.includes('%%')) {
    console.error("Supabase config missing or not replaced. Check deployment settings.");
    // Optional: Show a user-friendly error in the UI
    if (authState) authState.textContent = "Configuration error - check console.";
    return;  // Stop execution if config is invalid
  }
  const safeStorage = (() => {
    try {
      const k = "__storage_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return localStorage;
    } catch {
      return sessionStorage;
    }
  })();

  const $ = (id) => document.getElementById(id);

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label || "Timeout")), ms)),
    ]);
  }

  if (!window.supabase) {
    console.error("Supabase CDN not loaded. Add supabase-js before app.js.");
  }

  const sb =
    window.supabase &&
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.startsWith("http") &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_ANON_KEY.length > 20
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: safeStorage,
          },
        })
      : null;

  // ======================
  // 2) DOM
  // ======================
  const views = {
    home: $("view-home"),
    leaderboard: $("view-leaderboard"),
    inbox: $("view-game-inbox-invaders"),
    tetris: $("view-game-tetris"),
    snake: $("view-game-snake"),
    breakout: $("view-game-breakout"),
    pong: $("view-game-pong"),
  };

  const playerNameInput = $("playerName");
  const btnContinue = $("btnContinue");
  const nameStatus = $("nameStatus");

  const btnBackFromLeaderboard = $("btnBackFromLeaderboard");
  const lbRows = $("lbRows");
  const lbSearch = $("lbSearch");
  const btnLbSearch = $("btnLbSearch");
  const btnLbClear = $("btnLbClear");
  const btnLbPrev = $("btnLbPrev");
  const btnLbNext = $("btnLbNext");
  const lbPageLabel = $("lbPageLabel");
  const lbStatus = $("lbStatus");

  const myRankName = $("myRankName");
  const myRankCoins = $("myRankCoins");
  const myRankPos = $("myRankPos");

  const authState = $("authState");
  const btnOpenAuth = $("btnOpenAuth");
  const btnLogout = $("btnLogout");

  const authModal = $("authModal");
  const btnCloseAuth = $("btnCloseAuth");
  const authEmail = $("authEmail");
  const authPass = $("authPass");
  const btnSignup = $("btnSignup");
  const btnLogin = $("btnLogin");
  const authMsg = $("authMsg");

  const displayName = $("displayName");
  const btnSaveName = $("btnSaveName");
  const nameMsg = $("nameMsg");

  // ======================
  // 3) Local name utilities
  // ======================
  const LOCAL_NAME_KEY = "arcadehub_playerName";

  function getLocalName() {
    return (safeStorage.getItem(LOCAL_NAME_KEY) || "").trim();
  }

  function setLocalName(name) {
    safeStorage.setItem(LOCAL_NAME_KEY, (name || "").trim());
    const n = (name || "").trim() || "Not set";
    const a = $("currentPlayer");
    const b = $("currentPlayerTetris");
    const c = $("currentPlayerSnake");
    const d = $("currentPlayerBreakout");
    const e = $("currentPlayerPong");
    if (a) a.textContent = n;
    if (b) b.textContent = n;
    if (c) c.textContent = n;
    if (d) d.textContent = n;
    if (e) e.textContent = n;
  }

  function validateName(name) {
    const n = (name || "").trim();
    if (n.length < 3 || n.length > 16) return { ok: false, msg: "Name must be 3–16 characters." };
    if (!/^[A-Za-z0-9_]+$/.test(n)) return { ok: false, msg: "Use letters/numbers/_ only." };
    return { ok: true, msg: "Saved!" };
  }

  function setNameGate(enabled) {
    if (playerNameInput) {
      playerNameInput.disabled = !enabled;
      if (!enabled) playerNameInput.value = "";
    }
    if (btnContinue) btnContinue.disabled = !enabled;

    if (nameStatus) {
      nameStatus.textContent = enabled
        ? "Set your name (3–16 chars, letters/numbers/_)."
        : "Login to set your player name.";
    }
  }

  // ======================
  // 4) Games registry (stop loops on nav)
  // ======================
  const games = new Map();
  function registerGame(key, hooks) {
    games.set(key, hooks || {});
  }
  function stopAllGames() {
    for (const [, g] of games) {
      try { g.stop && g.stop(); } catch {}
    }
  }

  // ======================
  // 5) View navigation
  // ======================
  function showView(which) {
    stopAllGames();
    Object.values(views).forEach((v) => v && v.classList.remove("active"));

    if (which === "home" && views.home) views.home.classList.add("active");
    if (which === "leaderboard" && views.leaderboard) views.leaderboard.classList.add("active");
    if (which === "inbox" && views.inbox) views.inbox.classList.add("active");
    if (which === "tetris" && views.tetris) views.tetris.classList.add("active");
    if (which === "snake" && views.snake) views.snake.classList.add("active");
    if (which === "breakout" && views.breakout) views.breakout.classList.add("active");
    if (which === "pong" && views.pong) views.pong.classList.add("active");

    setLocalName(getLocalName());

    try { games.get(which)?.onShow?.(); } catch {}
  }

  // ======================
  // 6) Auth: session + profile
  // ======================
  let currentSession = null;

  async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session ?? null;
  }

  function sanitizeBaseName(s) {
    return (s || "")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 12);
  }

  async function refreshAuthUI(session) {
    const user = session?.user || null;

    if (!authState) return;

    if (!sb) {
      authState.textContent = "Supabase not configured";
      if (btnLogout) btnLogout.style.display = "none";
      if (btnOpenAuth) btnOpenAuth.style.display = "none";
      setNameGate(false);
      return;
    }

    if (!user) {
      authState.textContent = "Not logged in";
      if (btnLogout) btnLogout.style.display = "none";
      if (btnOpenAuth) btnOpenAuth.style.display = "inline-block";
      setLocalName("");
      setNameGate(false);
      return;
    }

    authState.textContent = `Logged in: ${user.email || "user"}`;
    if (btnLogout) btnLogout.style.display = "inline-block";
    if (btnOpenAuth) btnOpenAuth.style.display = "none";
    setNameGate(true);
  }

  async function ensurePlayerProfile(session) {
    if (!sb || !session?.user) return null;
    const user = session.user;

    const { data: profile, error } = await sb
      .from("players")
      .select("username, coins_total")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && profile?.username) {
      setLocalName(profile.username);
      if (playerNameInput) playerNameInput.value = profile.username;
      if (displayName) displayName.value = profile.username;
      return profile;
    }

    const emailPrefix = (user.email || "").split("@")[0] || "Player";
    const base = sanitizeBaseName(emailPrefix);
    const suffix = String(user.id).replace(/-/g, "").slice(0, 4);
    const fallback = (base.length >= 3 ? base : "Player") + "_" + suffix;

    const { error: upErr } = await sb.from("players").upsert(
      { user_id: user.id, username: fallback },
      { onConflict: "user_id" }
    );
    if (upErr) throw upErr;

    setLocalName(fallback);
    if (playerNameInput) playerNameInput.value = fallback;
    if (displayName) displayName.value = fallback;

    return { username: fallback, coins_total: 0 };
  }

  // ======================
  // 7) Leaderboard
  // ======================
  let lbPage = 0;
  const LB_PAGE_SIZE = 25;
  let lbQuery = "";

  async function fetchLeaderboard() {
    if (!sb || !lbRows) return;

    if (lbPageLabel) lbPageLabel.textContent = String(lbPage + 1);
    if (lbStatus) lbStatus.textContent = "Loading…";

    lbRows.innerHTML = `<div class="trow"><div>…</div><div>Loading</div><div class="right">…</div></div>`;

    try {
      let q = sb.from("players").select("username, coins_total");
      if (lbQuery && lbQuery.trim()) q = q.ilike("username", `%${lbQuery.trim()}%`);

      const from = lbPage * LB_PAGE_SIZE;
      const to = from + (LB_PAGE_SIZE - 1);

      const res = await withTimeout(
        q.order("coins_total", { ascending: false })
          .order("username", { ascending: true })
          .range(from, to),
        12000,
        "Leaderboard timeout"
      );

      const { data, error } = res;

      if (error) {
        lbRows.innerHTML = `<div class="trow"><div>!</div><div>${error.message}</div><div class="right">0</div></div>`;
        if (lbStatus) lbStatus.textContent = "Failed to load.";
        return;
      }

      lbRows.innerHTML = "";
      const me = getLocalName();

      (data || []).forEach((row, i) => {
        const div = document.createElement("div");
        div.className = "trow";
        const isMe = me && row.username === me;
        if (isMe) div.style.background = "rgba(106,167,255,.10)";
        div.innerHTML = `
          <div>${from + i + 1}</div>
          <div>${row.username}${isMe ? " (You)" : ""}</div>
          <div class="right">${row.coins_total}</div>
        `;
        lbRows.appendChild(div);
      });

      if (lbStatus) lbStatus.textContent = (data || []).length ? "" : "No results.";
    } catch (e) {
      lbRows.innerHTML = `<div class="trow"><div>!</div><div>${e?.message || "Network error"}</div><div class="right">0</div></div>`;
      if (lbStatus) lbStatus.textContent = "Failed to load.";
    }
  }

  async function fetchMyRank() {
    if (!sb) return;
    if (!myRankName && !myRankCoins && !myRankPos) return;

    const name = getLocalName();
    if (myRankName) myRankName.textContent = name || "-";
    if (myRankCoins) myRankCoins.textContent = "-";
    if (myRankPos) myRankPos.textContent = "-";
    if (!name) return;

    try {
      const res = await withTimeout(
        sb.rpc("get_player_rank", { p_username: name }),
        12000,
        "Rank timeout"
      );

      const { data, error } = res;
      if (error) return;

      const row = Array.isArray(data) ? data[0] : data;
      if (myRankCoins) myRankCoins.textContent = String(row?.out_coins_total ?? 0);
      if (myRankPos) myRankPos.textContent = row?.out_rank == null ? "-" : String(row.out_rank);
    } catch {
      // ignore
    }
  }

  // ======================
  // 8) Shared submit coins (RPC add_coins_auth)
  // ======================
  async function submitCoins({ gameKey, coins, reason, statusEl }) {
    if (!sb) return { ok: false, msg: "Supabase not configured" };

    if (!currentSession?.user) {
      const m = "Login required to submit coins.";
      statusEl && (statusEl.textContent = m);
      return { ok: false, msg: m };
    }

    statusEl && (statusEl.textContent = `Submitting +${coins} coins…`);

    try {
      const res = await withTimeout(
        sb.rpc("add_coins_auth", {
          p_game_key: gameKey,
          p_coins: coins,
          p_reason: reason || "game_over",
        }),
        12000,
        "Submit timeout (check network / Supabase)"
      );

      const { data, error } = res;

      if (error) {
        statusEl && (statusEl.textContent = `Submit failed: ${error.message}`);
        return { ok: false, msg: error.message };
      }

      const row = Array.isArray(data) ? data[0] : data;
      const uname = row?.out_username || getLocalName();
      const total = row?.out_new_total ?? "?";

      setLocalName(uname);
      if (playerNameInput) playerNameInput.value = uname;
      if (displayName) displayName.value = uname;

      statusEl && (statusEl.textContent = `Submitted! Total coins: ${total}`);

      // ✅ do NOT block UI if these fail/hang
      Promise.resolve().then(fetchMyRank).catch(() => {});
      Promise.resolve().then(fetchLeaderboard).catch(() => {});

      return { ok: true, total };
    } catch (e) {
      const msg = e?.message || String(e);
      statusEl && (statusEl.textContent = `Submit failed: ${msg}`);
      return { ok: false, msg };
    }
  }

  // ======================
  // 9) Wire UI
  // ======================
  function wireUI() {
    // NAV
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const to = btn.getAttribute("data-nav");
        if (to === "home") return showView("home");

        if (to === "leaderboard") {
          showView("leaderboard");
          Promise.resolve().then(fetchMyRank).catch(() => {});
          Promise.resolve().then(fetchLeaderboard).catch(() => {});
          return;
        }
      });
    });

    // ✅ Games click (FIXED ROUTES)
    document.querySelectorAll("[data-game]").forEach((card) => {
      card.addEventListener("click", () => {
        if (!currentSession?.user) {
          nameStatus && (nameStatus.textContent = "Login first to play.");
          showView("home");
          return;
        }

        if (!getLocalName()) {
          nameStatus && (nameStatus.textContent = "Set your player name first.");
          showView("home");
          return;
        }

        const g = card.getAttribute("data-game");

        // Accept both old + new ids
        if (g === "inbox-invaders") return showView("inbox");
        if (g === "tetris") return showView("tetris");

        if (g === "snake" || g === "neon-snake") return showView("snake");
        if (g === "breakout" || g === "neon-breakout") return showView("breakout");
        if (g === "pong" || g === "neon-pong") return showView("pong");

        // If you ever use data-game="snake" AND also have a view key match:
        if (views[g]) return showView(g);
      });
    });

    // Leaderboard back
    if (btnBackFromLeaderboard) btnBackFromLeaderboard.addEventListener("click", () => showView("home"));

    // Save name (DB + local)
    if (btnContinue && playerNameInput) {
      btnContinue.addEventListener("click", async () => {
        if (!sb) return;

        if (!currentSession?.user) {
          if (nameStatus) nameStatus.textContent = "Login first.";
          setNameGate(false);
          return;
        }

        const nm = (playerNameInput.value || "").trim();
        const v = validateName(nm);
        if (nameStatus) nameStatus.textContent = v.msg;
        if (!v.ok) return;

        if (nameStatus) nameStatus.textContent = "Saving…";

        const { error } = await sb.from("players").upsert(
          { user_id: currentSession.user.id, username: nm },
          { onConflict: "user_id" }
        );

        if (error) {
          if (nameStatus) nameStatus.textContent = error.message;
          return;
        }

        setLocalName(nm);
        if (displayName) displayName.value = nm;

        if (nameStatus) nameStatus.textContent = "Saved!";
        Promise.resolve().then(fetchMyRank).catch(() => {});
        Promise.resolve().then(fetchLeaderboard).catch(() => {});
      });
    }

    // Leaderboard search/paging
    if (btnLbSearch) {
      btnLbSearch.addEventListener("click", async () => {
        lbQuery = lbSearch ? lbSearch.value : "";
        lbPage = 0;
        await fetchLeaderboard();
      });
    }

    if (btnLbClear) {
      btnLbClear.addEventListener("click", async () => {
        lbQuery = "";
        lbPage = 0;
        if (lbSearch) lbSearch.value = "";
        await fetchLeaderboard();
      });
    }

    if (btnLbPrev) {
      btnLbPrev.addEventListener("click", async () => {
        lbPage = Math.max(0, lbPage - 1);
        await fetchLeaderboard();
      });
    }

    if (btnLbNext) {
      btnLbNext.addEventListener("click", async () => {
        lbPage = lbPage + 1;
        await fetchLeaderboard();
      });
    }

    // Auth modal open/close
    if (btnOpenAuth) btnOpenAuth.addEventListener("click", () => (authModal.style.display = "flex"));
    if (btnCloseAuth) btnCloseAuth.addEventListener("click", () => (authModal.style.display = "none"));

    // Signup
    if (btnSignup) {
      btnSignup.addEventListener("click", async () => {
        if (!sb) return;
        if (authMsg) authMsg.textContent = "Signing up…";

        const { error } = await sb.auth.signUp({
          email: (authEmail?.value || "").trim(),
          password: authPass?.value || "",
        });

        if (authMsg) authMsg.textContent = error ? error.message : "Signed up! Now login.";
      });
    }

    // Login
    if (btnLogin) {
      btnLogin.addEventListener("click", async () => {
        if (!sb) return;
        if (authMsg) authMsg.textContent = "Logging in…";
        btnLogin.disabled = true;

        sb.auth
          .signInWithPassword({
            email: (authEmail?.value || "").trim(),
            password: authPass?.value || "",
          })
          .then(({ error }) => {
            if (error && authMsg) authMsg.textContent = error.message;
          })
          .finally(() => setTimeout(() => (btnLogin.disabled = false), 500));
      });
    }

    // Logout
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        if (!sb) return;
        await sb.auth.signOut();
      });
    }

    // Save name from modal
    if (btnSaveName) {
      btnSaveName.addEventListener("click", async () => {
        if (!sb) return;

        if (!currentSession?.user) {
          if (nameMsg) nameMsg.textContent = "Login first.";
          return;
        }

        const nm = (displayName?.value || "").trim();
        const v = validateName(nm);
        if (!v.ok) {
          if (nameMsg) nameMsg.textContent = v.msg;
          return;
        }

        if (nameMsg) nameMsg.textContent = "Saving…";

        const { error } = await sb.from("players").upsert(
          { user_id: currentSession.user.id, username: nm },
          { onConflict: "user_id" }
        );

        if (error) {
          if (nameMsg) nameMsg.textContent = error.message;
          return;
        }

        if (nameMsg) nameMsg.textContent = "Saved!";
        setLocalName(nm);

        if (playerNameInput) playerNameInput.value = nm;

        Promise.resolve().then(fetchMyRank).catch(() => {});
        Promise.resolve().then(fetchLeaderboard).catch(() => {});
      });
    }
  }

  // ======================
  // 10) Expose API for games
  // ======================
  window.ArcadeHub = {
    sb,
    getLocalName,
    setLocalName,
    showView,
    registerGame,
    submitCoins,
    fetchLeaderboard,
    fetchMyRank,
    get session() {
      return currentSession;
    },
  };

  window.dispatchEvent(new Event("ArcadeHubReady"));

  // ======================
  // 11) Boot
  // ======================
  wireUI();
  showView("home");
  setNameGate(false);

  if (sb) {
    getSession().then(async (sess) => {
      currentSession = sess;
      await refreshAuthUI(sess);

      if (sess?.user) {
        try {
          await ensurePlayerProfile(sess);
          setNameGate(true);
        } catch (e) {
          console.warn("ensurePlayerProfile failed:", e?.message || e);
        }
      } else {
        setNameGate(false);
      }
    });

    sb.auth.onAuthStateChange(async (event, session) => {
      console.log("[AUTH EVENT]", event, session?.user?.id || null);

      currentSession = session || null;
      await refreshAuthUI(session);

      if (event === "SIGNED_IN" && session?.user) {
        if (authMsg) authMsg.textContent = "Logged in!";
        try {
          await ensurePlayerProfile(session);
          setNameGate(true);
        } catch (e) {
          console.warn("ensurePlayerProfile failed:", e?.message || e);
        }
        if (authModal) authModal.style.display = "none";
      }

      if (event === "SIGNED_OUT") {
        if (authMsg) authMsg.textContent = "Logged out";
        setLocalName("");
        setNameGate(false);
      }
    });
  } else {
    setNameGate(false);
  }
});
