// snake.js — Neon Snake (wrap walls + multiple foods spawn over time)
// Requires app.js to create window.ArcadeHub and dispatch "ArcadeHubReady"

(function () {
  function onHubReady(fn) {
    if (window.ArcadeHub) return fn();
    window.addEventListener("ArcadeHubReady", fn, { once: true });
  }

  onHubReady(() => {
    const hub = () => window.ArcadeHub;
    const $ = (id) => document.getElementById(id);

    // ---------- DOM ----------
    const view = $("view-game-snake");

    const canvas = $("snakeCanvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    const btnStart = $("btnStartSnake");
    const btnBack = $("btnBackFromSnake");

    const overlay = $("snakeOverlay");
    const overlayTitle = $("snakeOverlayTitle");
    const overlayText = $("snakeOverlayText");
    const btnOverlayRestart = $("btnSnakeRestart");
    const btnOverlayHome = $("btnSnakeHome");

    const hudScore = $("snakeScore");
    const hudBest = $("snakeBest");
    const hudSpeed = $("snakeSpeed");

    const statusEl = $("snakeStatus");

    // ---------- Config ----------
    const GAME_KEY = "snake";

    const CELL = 20;
    const COLS = Math.floor((canvas?.width || 900) / CELL);
    const ROWS = Math.floor((canvas?.height || 520) / CELL);

    // Multi-food settings
    const FOOD_MAX = 4;           // max foods on board
    const FOOD_SPAWN_EVERY = 10;  // seconds: spawn a new food if below max

    const State = {
      Idle: "idle",
      Playing: "playing",
      GameOver: "gameover",
    };

    let state = State.Idle;

    // game loop
    let rafId = null;
    let lastTs = 0;
    let acc = 0;

    // food spawn timer
    let foodSpawnAcc = 0;

    // controls
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };

    // swipe tracking
    let swipe = { active: false, x: 0, y: 0 };

    // run data
    let snake = [];
    let foods = []; // <-- multiple foods
    let score = 0;
    let speedLevel = 1;

    // best score local
    const BEST_KEY = "arcadehub_snake_best";
    const storage = (() => {
      try {
        const k = "__t";
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        return localStorage;
      } catch {
        return sessionStorage;
      }
    })();

    function getBest() {
      const v = Number(storage.getItem(BEST_KEY) || 0);
      return Number.isFinite(v) ? v : 0;
    }
    function setBest(v) {
      storage.setItem(BEST_KEY, String(v));
    }

    function isActive() {
      return !!(view && view.classList.contains("active"));
    }

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function setOverlay(show, title = "", html = "") {
      if (!overlay) return;
      overlay.style.display = show ? "flex" : "none";
      if (overlayTitle) overlayTitle.textContent = title;
      if (overlayText) overlayText.innerHTML = html;
    }

    function syncHUD() {
      if (hudScore) hudScore.textContent = String(score);
      if (hudBest) hudBest.textContent = String(getBest());
      if (hudSpeed) hudSpeed.textContent = String(speedLevel);
    }

    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      lastTs = 0;
      acc = 0;
      foodSpawnAcc = 0;
    }

    function stopGame() {
      stopLoop();
      state = State.Idle;
    }

    function rndCell(max) {
      return Math.floor(Math.random() * max);
    }

    function cellEq(a, b) {
      return a.x === b.x && a.y === b.y;
    }

    function spawnOneFood() {
  // Build a set of occupied cells (snake + existing foods)
  const occ = new Set();
  for (const s of snake) occ.add(s.x + "," + s.y);
  for (const f of foods) occ.add(f.x + "," + f.y);

  // Collect all empty cells
  const empty = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const key = x + "," + y;
      if (!occ.has(key)) empty.push({ x, y });
    }
  }

  // No empty cell => board full
  if (empty.length === 0) return false;

  // Pick a random empty cell
  const p = empty[Math.floor(Math.random() * empty.length)];
  foods.push(p);
  return true;
}


    function ensureAtLeastOneFood() {
        if (foods.length === 0) spawnOneFood();
    }

    function resetRun() {
      const cx = Math.floor(COLS / 2);
      const cy = Math.floor(ROWS / 2);

      snake = [
        { x: cx, y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
      ];

      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };

      score = 0;
      speedLevel = 1;

      foods = [];
      spawnOneFood();     // start with 1 food
      foodSpawnAcc = 0;

      syncHUD();
    }

    function stepIntervalSeconds() {
      const base = 0.12;
      const interval = base - (speedLevel - 1) * 0.01;
      return clamp(interval, 0.06, 0.12);
    }

    function trySetDir(dx, dy) {
      // avoid 180-degree reversal
      if (dx === -dir.x && dy === -dir.y) return;
      nextDir = { x: dx, y: dy };
    }

    function updateSpeedLevel() {
      speedLevel = 1 + Math.floor(score / 6);
      speedLevel = clamp(speedLevel, 1, 10);
    }

    function tick() {
      if (state !== State.Playing) return;

      dir = nextDir;

      const head = snake[0];

      // ---------- WRAP WALLS (traditional snake) ----------
      let nh = { x: head.x + dir.x, y: head.y + dir.y };
      nh.x = (nh.x + COLS) % COLS;
      nh.y = (nh.y + ROWS) % ROWS;

      // self collision
      if (snake.some((p) => cellEq(p, nh))) {
        endGame();
        return;
      }

      snake.unshift(nh);

      // eat? (any food)
      const foodIndex = foods.findIndex((f) => cellEq(f, nh));
      if (foodIndex >= 0) {
        foods.splice(foodIndex, 1);
        score += 1;
        updateSpeedLevel();

        // update best
        const best = getBest();
        if (score > best) setBest(score);

        // never allow “no food”
        ensureAtLeastOneFood();
      } else {
        snake.pop();
      }

      syncHUD();
    }

    function draw() {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // background grid
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#22314d";
      for (let x = 0; x <= canvas.width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // foods (multiple)
      ctx.font = "18px system-ui";
      for (const f of foods) {
        ctx.fillText("⚡", f.x * CELL + 2, f.y * CELL + 18);
      }

      // snake blocks
      for (let i = 0; i < snake.length; i++) {
        const p = snake[i];
        const px = p.x * CELL;
        const py = p.y * CELL;

        ctx.globalAlpha = i === 0 ? 0.95 : 0.75;
        ctx.fillStyle = "#6aa7ff";
        ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);

        if (i === 0) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#0b0f17";
          const ex = px + CELL / 2 + dir.x * 4;
          const ey = py + CELL / 2 + dir.y * 4;
          ctx.beginPath();
          ctx.arc(ex - 4, ey - 2, 2, 0, Math.PI * 2);
          ctx.arc(ex + 4, ey - 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (!isActive()) {
        stopGame();
        return;
      }

      if (state === State.Playing) {
        ensureAtLeastOneFood(); // <-- ALWAYS guarantee at least 1 food
        // spawn extra foods over time (up to max)
        foodSpawnAcc += dt;
        if (foodSpawnAcc >= FOOD_SPAWN_EVERY) {
          // keep remainder time so it stays consistent
          foodSpawnAcc = foodSpawnAcc % FOOD_SPAWN_EVERY;

          if (foods.length < FOOD_MAX) {
            spawnOneFood();
          }
          ensureAtLeastOneFood();
        }

        acc += dt;
        const step = stepIntervalSeconds();
        while (acc >= step) {
          tick();
          ensureAtLeastOneFood(); // <-- ALWAYS guarantee at least 1 food
          acc -= step;
        }
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    function startGame() {
      const name = hub().getLocalName();
      if (!name) {
        hub().showView("home");
        return;
      }

      if (statusEl) statusEl.textContent = "";
      resetRun();
      state = State.Playing;

      setOverlay(false);

      stopLoop();
      rafId = requestAnimationFrame(loop);
    }

    function coinsFromScore(s) {
      return clamp(Math.floor(s * 2), 0, 5000);
    }

    async function endGame() {
  if (state !== State.Playing) return;

  state = State.GameOver;
  stopLoop();

  const coins = coinsFromScore(score);

  setOverlay(
    true,
    "Game Over",
    `Score: <b>${score}</b><br/>Reward: <b>+${coins} coins</b><br/><span class="muted">Submitting…</span>`
  );

  try {
    // Timeout protection (so it never stays stuck forever)
    const res = await Promise.race([
      hub().submitCoins({
        gameKey: GAME_KEY,
        coins,
        reason: "snake_game_over",
        statusEl,
      }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, msg: "Submit timeout (check network / Supabase)" }), 12000)
      ),
    ]);

    if (res.ok) {
      setOverlay(
        true,
        "Submitted!",
        `Score: <b>${score}</b><br/>+${coins} coins<br/>Total: <b>${res.total}</b>`
      );
    } else {
      setOverlay(
        true,
        "Submit Failed",
        `Score: <b>${score}</b><br/>+${coins} coins<br/><span class="muted">${res.msg}</span>`
      );
    }
  } catch (e) {
    const msg = e?.message || String(e);
    setOverlay(
      true,
      "Submit Failed",
      `Score: <b>${score}</b><br/>+${coins} coins<br/><span class="muted">${msg}</span>`
    );
  }
}

    // ---------- Controls ----------
    window.addEventListener("keydown", (e) => {
      if (!isActive()) return;
      if (state !== State.Playing) return;

      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") trySetDir(0, -1);
      if (k === "arrowdown" || k === "s") trySetDir(0, 1);
      if (k === "arrowleft" || k === "a") trySetDir(-1, 0);
      if (k === "arrowright" || k === "d") trySetDir(1, 0);
    });

    // Mobile swipe
    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        if (!isActive()) return;
        if (state !== State.Playing) return;
        swipe.active = true;
        swipe.x = e.clientX;
        swipe.y = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener("pointermove", (e) => {
        if (!swipe.active) return;
        if (!isActive()) return;
        if (state !== State.Playing) return;

        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;

        if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;

        if (Math.abs(dx) > Math.abs(dy)) {
          trySetDir(dx > 0 ? 1 : -1, 0);
        } else {
          trySetDir(0, dy > 0 ? 1 : -1);
        }

        swipe.x = e.clientX;
        swipe.y = e.clientY;
      });

      canvas.addEventListener("pointerup", () => (swipe.active = false));
      canvas.addEventListener("pointercancel", () => (swipe.active = false));
    }

    // ---------- UI wiring ----------
    if (btnStart) btnStart.addEventListener("click", startGame);
    if (btnOverlayRestart) btnOverlayRestart.addEventListener("click", startGame);

    if (btnBack) btnBack.addEventListener("click", () => hub().showView("home"));
    if (btnOverlayHome) btnOverlayHome.addEventListener("click", () => hub().showView("home"));

    // Register game hooks in hub
    hub().registerGame("snake", {
      stop: stopGame,
      onShow: () => {
        syncHUD();
        setOverlay(
          true,
          "Ready?",
          "Controls: <b>Arrow keys</b> / <b>WASD</b>. On mobile: <b>swipe</b> to turn."
        );
        if (statusEl) statusEl.textContent = "";
      },
    });
  });
})();
