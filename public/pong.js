// pong.js — Neon Pong (ArcadeHub pattern)
// Key: "pong" (must match Supabase games.key)

(function () {
  function onHubReady(fn) {
    if (window.ArcadeHub) return fn();
    window.addEventListener("ArcadeHubReady", fn, { once: true });
  }

  onHubReady(() => {
    const hub = () => window.ArcadeHub;
    const $ = (id) => document.getElementById(id);

    const view = $("view-game-pong");
    const canvas = $("pongCanvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    const btnStart = $("btnStartPong");
    const btnBack = $("btnBackFromPong");

    const overlay = $("pongOverlay");
    const overlayTitle = $("pongOverlayTitle");
    const overlayText = $("pongOverlayText");
    const btnRestart = $("btnPongRestart");
    const btnHome = $("btnPongHome");

    const hudYou = $("pongYou");
    const hudAI = $("pongAI");
    const statusEl = $("pongStatus");

    const GAME_KEY = "pong";

    const State = { Idle: "idle", Playing: "playing", Over: "over" };
    let state = State.Idle;

    let raf = null;
    let lastTs = 0;

    const W = canvas?.width || 900;
    const H = canvas?.height || 520;

    const GOAL = 7;

    // paddles
    const paddleW = 14;
    const paddleH = 90;

    const player = { x: 26, y: H / 2 - paddleH / 2, vy: 0 };
    const ai = { x: W - 26 - paddleW, y: H / 2 - paddleH / 2, vy: 0 };

    // ball
    const ball = { r: 9, x: W / 2, y: H / 2, vx: 320, vy: 140 };

    let scoreYou = 0;
    let scoreAI = 0;

    // pointer control
    let pointerY = null;

    function isActive() {
      return !!(view && view.classList.contains("active"));
    }
    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function setOverlay(show, title, html) {
      if (!overlay) return;
      overlay.style.display = show ? "flex" : "none";
      if (overlayTitle) overlayTitle.textContent = title || "";
      if (overlayText) overlayText.innerHTML = html || "";
    }

    function syncHUD() {
      if (hudYou) hudYou.textContent = String(scoreYou);
      if (hudAI) hudAI.textContent = String(scoreAI);
    }

    function stopLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      lastTs = 0;
    }

    function stopGame() {
      stopLoop();
      state = State.Idle;
    }

    function resetRound(direction) {
      // direction: +1 -> to AI, -1 -> to player
      ball.x = W / 2;
      ball.y = H / 2;
      const dir = direction || (Math.random() < 0.5 ? 1 : -1);
      ball.vx = 320 * dir;
      ball.vy = (Math.random() * 220 - 110);
    }

    function resetRun() {
      scoreYou = 0;
      scoreAI = 0;
      player.y = H / 2 - paddleH / 2;
      ai.y = H / 2 - paddleH / 2;
      player.vy = 0;
      ai.vy = 0;
      pointerY = null;
      resetRound(1);
      syncHUD();
    }

    function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
      const x = clamp(cx, rx, rx + rw);
      const y = clamp(cy, ry, ry + rh);
      const dx = cx - x;
      const dy = cy - y;
      return dx * dx + dy * dy <= cr * cr;
    }

    function reflectFromPaddle(p) {
      // add "spin" based on hit position
      const mid = p.y + paddleH / 2;
      const hit = (ball.y - mid) / (paddleH / 2); // -1..1
      ball.vx *= -1;
      ball.vy = clamp(ball.vy + hit * 220, -420, 420);

      // speed up slightly over time
      ball.vx *= 1.03;
      ball.vy *= 1.02;

      // prevent sticking
      if (p === player) ball.x = p.x + paddleW + ball.r + 0.5;
      else ball.x = p.x - ball.r - 0.5;
    }

    function coinsFromScore(you, won) {
      // simple: 10 coins per point, +25 bonus if win
      return you * 10 + (won ? 25 : 0);
    }

    async function endGame(won) {
      if (state !== State.Playing) return;
      state = State.Over;
      stopLoop();

      const coins = coinsFromScore(scoreYou, won);

      setOverlay(
        true,
        won ? "You Win!" : "Game Over",
        `Score: <b>${scoreYou}-${scoreAI}</b><br/>Reward: <b>+${coins} coins</b><br/><span class="muted">Submitting…</span>`
      );

      try {
        const res = await Promise.race([
          hub().submitCoins({
            gameKey: GAME_KEY,
            coins,
            reason: won ? "pong_win" : "pong_game_over",
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
            `Score: <b>${scoreYou}-${scoreAI}</b><br/>+${coins} coins<br/>Total: <b>${res.total}</b>`
          );
        } else {
          setOverlay(
            true,
            "Submit Failed",
            `Score: <b>${scoreYou}-${scoreAI}</b><br/>+${coins} coins<br/><span class="muted">${res.msg}</span>`
          );
        }
      } catch (e) {
        const msg = e?.message || String(e);
        setOverlay(
          true,
          "Submit Failed",
          `Score: <b>${scoreYou}-${scoreAI}</b><br/>+${coins} coins<br/><span class="muted">${msg}</span>`
        );
      }
    }

    function update(dt) {
      if (state !== State.Playing) return;

      // player paddle
      if (pointerY != null) {
        player.y = clamp(pointerY - paddleH / 2, 0, H - paddleH);
      } else {
        player.y = clamp(player.y + player.vy * dt, 0, H - paddleH);
      }

      // AI paddle (simple follow with lag)
      const target = ball.y - paddleH / 2;
      const aiSpeed = 360;
      if (ai.y < target) ai.y += aiSpeed * dt;
      else if (ai.y > target) ai.y -= aiSpeed * dt;
      ai.y = clamp(ai.y, 0, H - paddleH);

      // move ball
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // wall bounce (top/bottom)
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }
      if (ball.y + ball.r > H) { ball.y = H - ball.r; ball.vy *= -1; }

      // paddle collisions
      if (rectCircleCollide(player.x, player.y, paddleW, paddleH, ball.x, ball.y, ball.r)) {
        reflectFromPaddle(player);
      } else if (rectCircleCollide(ai.x, ai.y, paddleW, paddleH, ball.x, ball.y, ball.r)) {
        reflectFromPaddle(ai);
      }

      // scoring
      if (ball.x + ball.r < 0) {
        scoreAI += 1;
        syncHUD();
        if (scoreAI >= GOAL) return endGame(false);
        resetRound(-1); // serve toward player
      } else if (ball.x - ball.r > W) {
        scoreYou += 1;
        syncHUD();
        if (scoreYou >= GOAL) return endGame(true);
        resetRound(1); // serve toward AI
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      // center line
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#22314d";
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 20);
      ctx.lineTo(W / 2, H - 20);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // paddles
      ctx.fillStyle = "#e7eefc";
      ctx.fillRect(player.x, player.y, paddleW, paddleH);
      ctx.fillRect(ai.x, ai.y, paddleW, paddleH);

      // ball
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = "#6aa7ff";
      ctx.fill();
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (!isActive()) {
        stopGame();
        return;
      }

      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    function startGame() {
      const name = hub().getLocalName ? hub().getLocalName() : hub().getPlayerName?.();
      if (!name) {
        hub().showView("home");
        return;
      }

      if (statusEl) statusEl.textContent = "";
      resetRun();
      state = State.Playing;
      setOverlay(false);

      stopLoop();
      raf = requestAnimationFrame(loop);
    }

    // keyboard controls
    window.addEventListener("keydown", (e) => {
      if (!isActive() || state !== State.Playing) return;
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") player.vy = -520;
      if (k === "arrowdown" || k === "s") player.vy = 520;
    });

    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w" || k === "arrowdown" || k === "s") player.vy = 0;
    });

    // pointer drag controls
    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        if (!isActive() || state !== State.Playing) return;
        pointerY = e.offsetY * (H / canvas.clientHeight);
        canvas.setPointerCapture(e.pointerId);
      });

      canvas.addEventListener("pointermove", (e) => {
        if (!isActive() || state !== State.Playing) return;
        if (e.buttons === 0 && e.pointerType === "mouse") return;
        pointerY = e.offsetY * (H / canvas.clientHeight);
      });

      canvas.addEventListener("pointerup", () => { pointerY = null; });
      canvas.addEventListener("pointercancel", () => { pointerY = null; });
    }

    // UI wiring
    if (btnStart) btnStart.addEventListener("click", startGame);
    if (btnRestart) btnRestart.addEventListener("click", startGame);

    if (btnBack) btnBack.addEventListener("click", () => hub().showView("home"));
    if (btnHome) btnHome.addEventListener("click", () => hub().showView("home"));

    // Register hooks
    hub().registerGame("pong", {
      stop: stopGame,
      onShow: () => {
        syncHUD();
        setOverlay(true, "Ready?", "Controls: <b>W/S</b> or <b>↑/↓</b>, or <b>mouse/touch drag</b>.");
        if (statusEl) statusEl.textContent = "";
      },
    });
  });
})();
