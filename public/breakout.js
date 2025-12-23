// breakout.js — Neon Breakout (ArcadeHub pattern)
(function () {
  function onHubReady(fn) {
    if (window.ArcadeHub) return fn();
    window.addEventListener("ArcadeHubReady", fn, { once: true });
  }

  onHubReady(() => {
    const hub = () => window.ArcadeHub;
    const $ = (id) => document.getElementById(id);

    const view = $("view-game-breakout");
    const canvas = $("breakoutCanvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    const btnStart = $("btnStartBreakout");
    const btnBack = $("btnBackFromBreakout");

    const overlay = $("breakoutOverlay");
    const overlayTitle = $("breakoutOverlayTitle");
    const overlayText = $("breakoutOverlayText");
    const btnRestart = $("btnBreakoutRestart");
    const btnHome = $("btnBreakoutHome");

    const hudScore = $("breakoutScore");
    const hudLives = $("breakoutLives");
    const hudBricks = $("breakoutBricks");
    const statusEl = $("breakoutStatus");

    const GAME_KEY = "breakout";

    const State = { Idle: "idle", Playing: "playing", Over: "over" };
    let state = State.Idle;

    let raf = null;
    let lastTs = 0;

    const W = canvas?.width || 900;
    const H = canvas?.height || 520;

    const paddle = { w: 120, h: 14, x: W / 2 - 60, y: H - 30, vx: 0 };
    const ball = { r: 8, x: W / 2, y: H - 60, vx: 280, vy: -280 };

    let bricks = [];
    const BR = { cols: 10, rows: 5, w: 72, h: 18, pad: 10, top: 70, left: 60 };

    let score = 0;
    let lives = 3;
    let pointerX = null;

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
      if (hudScore) hudScore.textContent = String(score);
      if (hudLives) hudLives.textContent = String(lives);
      if (hudBricks) hudBricks.textContent = String(bricks.filter(b => !b.dead).length);
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

    function resetRun() {
      score = 0;
      lives = 3;

      paddle.x = W / 2 - paddle.w / 2;
      paddle.vx = 0;

      ball.x = W / 2;
      ball.y = H - 60;
      ball.vx = 280;
      ball.vy = -280;

      bricks = [];
      for (let r = 0; r < BR.rows; r++) {
        for (let c = 0; c < BR.cols; c++) {
          bricks.push({
            x: BR.left + c * (BR.w + BR.pad),
            y: BR.top + r * (BR.h + BR.pad),
            w: BR.w,
            h: BR.h,
            dead: false,
          });
        }
      }

      syncHUD();
    }

    function rectCircleCollide(rx, ry, rw, rh, cx, cy, cr) {
      const x = clamp(cx, rx, rx + rw);
      const y = clamp(cy, ry, ry + rh);
      const dx = cx - x;
      const dy = cy - y;
      return dx * dx + dy * dy <= cr * cr;
    }

    function bounceOffRect(rx, ry, rw, rh) {
      const closestX = clamp(ball.x, rx, rx + rw);
      const closestY = clamp(ball.y, ry, ry + rh);
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -1;
      else ball.vy *= -1;
    }

    function update(dt) {
      if (state !== State.Playing) return;

      // paddle control
      if (pointerX != null) {
        paddle.x = clamp(pointerX - paddle.w / 2, 0, W - paddle.w);
      } else {
        paddle.x = clamp(paddle.x + paddle.vx * dt, 0, W - paddle.w);
      }

      // ball move
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // wall bounce
      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
      if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; }
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }

      // miss bottom
      if (ball.y - ball.r > H) {
        lives -= 1;
        syncHUD();

        if (lives <= 0) { endGame(false); return; }

        ball.x = W / 2;
        ball.y = H - 60;
        ball.vx = 280 * (Math.random() < 0.5 ? 1 : -1);
        ball.vy = -280;
      }

      // paddle collision
      if (rectCircleCollide(paddle.x, paddle.y, paddle.w, paddle.h, ball.x, ball.y, ball.r)) {
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        ball.vx = 360 * hit;
        ball.vy = -Math.abs(ball.vy);
        ball.y = paddle.y - ball.r - 0.5;
      }

      // bricks
      let alive = 0;
      for (const b of bricks) {
        if (b.dead) continue;
        alive++;
        if (rectCircleCollide(b.x, b.y, b.w, b.h, ball.x, ball.y, ball.r)) {
          b.dead = true;
          score += 10;
          bounceOffRect(b.x, b.y, b.w, b.h);
          ball.vx *= 1.01;
          ball.vy *= 1.01;
          break;
        }
      }

      if (alive === 0) { endGame(true); return; }
      syncHUD();
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#22314d";
      for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // bricks
      for (const b of bricks) {
        if (b.dead) continue;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#6aa7ff";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.globalAlpha = 1;

      // paddle
      ctx.fillStyle = "#e7eefc";
      ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

      // ball
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = "#9ab0d0";
      ctx.fill();
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      if (!isActive()) { stopGame(); return; }

      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    function coinsFromScore(s) {
      return clamp(Math.floor(s / 10), 0, 5000); // 1 coin per brick
    }

    async function endGame(won) {
      if (state !== State.Playing) return;
      state = State.Over;
      stopLoop();

      const coins = coinsFromScore(score);

      setOverlay(
        true,
        won ? "You Win!" : "Game Over",
        `Score: <b>${score}</b><br/>Reward: <b>+${coins} coins</b><br/><span class="muted">Submitting…</span>`
      );

      try {
        const res = await Promise.race([
          hub().submitCoins({
            gameKey: GAME_KEY,
            coins,
            reason: won ? "breakout_win" : "breakout_game_over",
            statusEl,
          }),
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: false, msg: "Submit timeout (check network / Supabase)" }), 12000)
          ),
        ]);

        if (res.ok) {
          setOverlay(true, "Submitted!", `Score: <b>${score}</b><br/>+${coins} coins<br/>Total: <b>${res.total}</b>`);
        } else {
          setOverlay(true, "Submit Failed", `Score: <b>${score}</b><br/>+${coins} coins<br/><span class="muted">${res.msg}</span>`);
        }
      } catch (e) {
        setOverlay(true, "Submit Failed", `Score: <b>${score}</b><br/><span class="muted">${e?.message || e}</span>`);
      }
    }

    function startGame() {
      const name = hub().getLocalName();
      if (!name) { hub().showView("home"); return; }
      if (statusEl) statusEl.textContent = "";
      resetRun();
      state = State.Playing;
      setOverlay(false);
      stopLoop();
      raf = requestAnimationFrame(loop);
    }

    // keyboard
    window.addEventListener("keydown", (e) => {
      if (!isActive() || state !== State.Playing) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") paddle.vx = -520;
      if (k === "arrowright" || k === "d") paddle.vx = 520;
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a" || k === "arrowright" || k === "d") paddle.vx = 0;
    });

    // pointer drag
    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        if (!isActive() || state !== State.Playing) return;
        pointerX = e.offsetX * (W / canvas.clientWidth);
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!isActive() || state !== State.Playing) return;
        if (e.buttons === 0 && e.pointerType === "mouse") return;
        pointerX = e.offsetX * (W / canvas.clientWidth);
      });
      canvas.addEventListener("pointerup", () => { pointerX = null; });
      canvas.addEventListener("pointercancel", () => { pointerX = null; });
    }

    // UI
    btnStart && btnStart.addEventListener("click", startGame);
    btnRestart && btnRestart.addEventListener("click", startGame);

    btnBack && btnBack.addEventListener("click", () => hub().showView("home"));
    btnHome && btnHome.addEventListener("click", () => hub().showView("home"));

    hub().registerGame("breakout", {
      stop: stopGame,
      onShow: () => {
        syncHUD();
        setOverlay(true, "Ready?", "Controls: <b>Mouse</b> / <b>Touch drag</b> / <b>A-D</b> or <b>← →</b>");
        if (statusEl) statusEl.textContent = "";
      },
    });
  });
})();
