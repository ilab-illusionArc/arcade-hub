// inbox.js — Inbox Invaders (standalone) for ArcadeHub
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
    const viewInbox = $("view-game-inbox-invaders");

    const canvas = $("gameCanvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    const btnStartRun = $("btnStartRun");
    const btnOverlayStart = $("btnOverlayStart");
    const btnBackFromGame = $("btnBackFromGame");

    const overlay = $("overlay");
    const overlayTitle = $("overlayTitle");
    const overlayText = $("overlayText");

    const submitStatus = $("submitStatus");

    const hudScore = $("hudScore");
    const hudLives = $("hudLives");
    const hudTime = $("hudTime");
    const hudCombo = $("hudCombo");

    // ---------- Config ----------
    const GAME_KEY = "inbox_invaders";

    const State = {
      Idle: "idle",
      Playing: "playing",
      GameOver: "gameover",
    };

    let state = State.Idle;
    let rafId = null;
    let lastTs = 0;
    let run = null;

    const cfg = {
      runSeconds: 45,
      lives: 3,
      spawnPerSecond: 2.2,
      spamChance: 0.22,
      speedMin: 120,
      speedMax: 320,
      cursorSpeed: 520,
      pickupRadius: 34,
    };

    // ---------- Utils ----------
    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }
    function rand(a, b) {
      return a + Math.random() * (b - a);
    }
    function isInboxActive() {
      return !!(viewInbox && viewInbox.classList.contains("active"));
    }

    function setOverlay(show, title = "", html = "") {
      if (!overlay) return;
      overlay.style.display = show ? "flex" : "none";
      if (overlayTitle) overlayTitle.textContent = title;
      if (overlayText) overlayText.innerHTML = html;
    }

    function syncHUD() {
      if (!run) return;
      if (hudScore) hudScore.textContent = String(run.score);
      if (hudLives) hudLives.textContent = String(run.lives);
      if (hudTime) hudTime.textContent = String(Math.max(0, Math.ceil(run.remaining)));
      if (hudCombo) hudCombo.textContent = "x" + String(Math.round(run.combo * 10) / 10);
    }

    function resetRun() {
      if (!canvas) return;
      run = {
        remaining: cfg.runSeconds,
        lives: cfg.lives,
        score: 0,
        combo: 1,
        comboTimer: 0,
        items: [],
        spawnAcc: 0,
        submitted: false,
        cursor: {
          x: canvas.width / 2,
          y: canvas.height - 60,
          vx: 0,
          dragging: false,
        },
      };
      syncHUD();
    }

    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      lastTs = 0;
    }

    function stopGame() {
      stopLoop();
      state = State.Idle;
      run = null;
    }

    // ---------- Gameplay ----------
    function spawnItem() {
      if (!run || !canvas) return;
      const isSpam = Math.random() < cfg.spamChance;
      run.items.push({
        x: rand(40, canvas.width - 40),
        y: -20,
        vy: rand(cfg.speedMin, cfg.speedMax),
        type: isSpam ? "spam" : "mail",
        emoji: isSpam ? "💣" : "✅",
      });
    }

    function awardMail() {
      run.score += Math.round(10 * run.combo);
      run.comboTimer = 1.2;
      run.combo = clamp(run.combo + 0.15, 1, 5);
    }

    function hitSpam() {
      run.lives -= 1;
      run.combo = 1;
      run.comboTimer = 0;
    }

    function update(dt) {
      if (!run || state !== State.Playing || !canvas) return;

      run.remaining -= dt;
      if (run.remaining <= 0) {
        run.remaining = 0;
        endGame();
        return;
      }

      if (run.comboTimer > 0) {
        run.comboTimer -= dt;
        if (run.comboTimer <= 0) {
          run.combo = 1;
          run.comboTimer = 0;
        }
      }

      run.spawnAcc += dt * cfg.spawnPerSecond;
      while (run.spawnAcc >= 1) {
        spawnItem();
        run.spawnAcc -= 1;
      }

      run.cursor.x += run.cursor.vx * dt;
      run.cursor.x = clamp(run.cursor.x, 30, canvas.width - 30);

      const cx = run.cursor.x;
      const cy = run.cursor.y;
      const r2 = cfg.pickupRadius * cfg.pickupRadius;

      run.items = run.items.filter((it) => {
        it.y += it.vy * dt;
        if (it.y > canvas.height + 40) return false;

        const dx = it.x - cx;
        const dy = it.y - cy;

        if (dx * dx + dy * dy <= r2) {
          it.type === "mail" ? awardMail() : hitSpam();
          if (run.lives <= 0) endGame();
          return false;
        }
        return true;
      });

      syncHUD();
    }

    function draw() {
      if (!ctx || !canvas || !run) return;

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

      // items
      ctx.font = "28px system-ui";
      for (const it of run.items) {
        ctx.fillText(it.emoji, it.x - 12, it.y + 10);
      }

      // player
      ctx.font = "34px system-ui";
      ctx.fillText("🧹", run.cursor.x - 16, run.cursor.y + 12);
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      // if user navigated away, stop
      if (!isInboxActive()) {
        stopGame();
        return;
      }

      update(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function startGame() {
      if (!canvas || !ctx) return;

      const name = hub().getLocalName();
      if (!name) {
        hub().showView("home");
        return;
      }

      if (submitStatus) submitStatus.textContent = "";

      resetRun();
      state = State.Playing;
      setOverlay(false);

      stopLoop();
      rafId = requestAnimationFrame(loop);
    }

    function coinsFromScore(score) {
      return clamp(Math.floor(score / 8), 0, 5000);
    }

    async function endGame() {
      if (!run) return;

      state = State.GameOver;
      stopLoop();

      const coins = coinsFromScore(run.score);

      setOverlay(
        true,
        "Game Over",
        `Score: <b>${run.score}</b><br/>Reward: <b>+${coins} coins</b><br/><span class="muted">Submitting…</span>`
      );

      if (run.submitted) return;
      run.submitted = true;

      const res = await hub().submitCoins({
        gameKey: GAME_KEY,
        coins,
        reason: "run_end",
        statusEl: submitStatus,
      });

      if (res.ok) {
        setOverlay(
          true,
          "Submitted!",
          `Score: <b>${run.score}</b><br/>+${coins} coins<br/>Total: <b>${res.total}</b>`
        );
      } else {
        setOverlay(
          true,
          "Submit Failed",
          `Score: <b>${run.score}</b><br/>+${coins} coins<br/><span class="muted">${res.msg}</span>`
        );
      }
    }

    // ---------- Controls ----------
    window.addEventListener("keydown", (e) => {
      if (!isInboxActive()) return;
      if (state !== State.Playing || !run) return;

      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") run.cursor.vx = -cfg.cursorSpeed;
      if (k === "arrowright" || k === "d") run.cursor.vx = cfg.cursorSpeed;
    });

    window.addEventListener("keyup", (e) => {
      if (!isInboxActive()) return;
      if (state !== State.Playing || !run) return;

      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "arrowright" || k === "a" || k === "d") run.cursor.vx = 0;
    });

    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        if (!isInboxActive()) return;
        if (state !== State.Playing || !run) return;
        run.cursor.dragging = true;
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener("pointermove", (e) => {
        if (!isInboxActive()) return;
        if (state !== State.Playing || !run || !run.cursor.dragging) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        run.cursor.x = clamp(x, 30, canvas.width - 30);
      });

      canvas.addEventListener("pointerup", () => {
        if (!run) return;
        run.cursor.dragging = false;
      });
    }

    // ---------- UI wiring ----------
    if (btnStartRun) btnStartRun.addEventListener("click", startGame);
    if (btnOverlayStart) btnOverlayStart.addEventListener("click", startGame);

    if (btnBackFromGame) {
      btnBackFromGame.addEventListener("click", () => {
        hub().showView("home");
      });
    }

    // Register game hooks in hub (stop loop when navigating away)
    hub().registerGame("inbox", {
      stop: stopGame,
      onShow: () => {
        // When the view opens, show ready overlay (no auto-start)
        setOverlay(
          true,
          "Ready?",
          "Move with <b>Arrow keys</b>/<b>A-D</b> or drag on mobile. Collect ✅ and avoid 💣."
        );
        if (submitStatus) submitStatus.textContent = "";
        // keep the last HUD if you want; otherwise reset:
        if (!run) {
          // small HUD reset
          if (hudScore) hudScore.textContent = "0";
          if (hudLives) hudLives.textContent = String(cfg.lives);
          if (hudTime) hudTime.textContent = String(cfg.runSeconds);
          if (hudCombo) hudCombo.textContent = "x1";
        }
      },
    });
  });
})();
