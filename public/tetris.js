// tetris.js — Tetris (standalone) for ArcadeHub
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
    const viewTetris = $("view-game-tetris");
    const canvas = $("tetrisCanvas");
    const ctx = canvas ? canvas.getContext("2d") : null;

    // Buttons (outside overlay)
    const btnStart = $("btnStartTetris");
    const btnBack = $("btnBackFromTetris");

    // HUD
    const scoreEl = $("tetrisScore");
    const linesEl = $("tetrisLines");
    const levelEl = $("tetrisLevel");
    const statusEl = $("tetrisStatus");

    // Overlay (Tetris-only)
    const ov = $("tetrisOverlay");
    const ovTitle = $("tetrisOverlayTitle");
    const ovText = $("tetrisOverlayText");
    const btnRestart = $("btnTetrisRestart");
    const btnHome = $("btnTetrisHome");

    // ---------- Config ----------
    const GAME_KEY = "tetris";

    const State = { Idle: "idle", Playing: "playing", Paused: "paused", GameOver: "gameover" };
    let state = State.Idle;

    let rafId = null;
    let lastTs = 0;

    const T = { cols: 10, rows: 20 };

    const tetrominoes = {
      I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      O: [
        [1, 1],
        [1, 1],
      ],
      T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
      ],
      S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0],
      ],
      Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0],
      ],
      J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
      ],
      L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0],
      ],
    };

    const colors = {
      I: "#6aa7ff",
      O: "#ffd86a",
      T: "#c78cff",
      S: "#78ffb4",
      Z: "#ff6a6a",
      J: "#6a7cff",
      L: "#ff9c6a",
    };

    const cfg = {
      baseDropMs: 800,
      softDropMs: 60,
      minDropMs: 120,
    };

    // ---------- Game ----------
    let game = null;

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    function isActive() {
      return !!(viewTetris && viewTetris.classList.contains("active"));
    }

    function msg(t) {
      if (statusEl) statusEl.textContent = t || "";
    }

    function showOverlay(show, title = "", html = "", restartLabel = "Restart") {
      if (!ov) return;
      ov.style.display = show ? "flex" : "none";
      if (ovTitle) ovTitle.textContent = title || "";
      if (ovText) ovText.innerHTML = html || "";
      if (btnRestart) btnRestart.textContent = restartLabel;
    }

    function syncHUD() {
      if (!game) return;
      if (scoreEl) scoreEl.textContent = String(game.score);
      if (linesEl) linesEl.textContent = String(game.lines);
      if (levelEl) levelEl.textContent = String(game.level);
    }

    function newBoard() {
      return Array.from({ length: T.rows }, () => Array(T.cols).fill(null));
    }

    function cloneMat(m) {
      return m.map((r) => r.slice());
    }

    function rotateCW(mat) {
      const h = mat.length;
      const w = mat[0].length;
      const out = Array.from({ length: w }, () => Array(h).fill(0));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out[x][h - 1 - y] = mat[y][x];
        }
      }
      return out;
    }

    function refillBag() {
      const bag = Object.keys(tetrominoes);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      game.bag.push(...bag);
    }

    function nextType() {
      if (game.bag.length < 3) refillBag();
      return game.bag.shift();
    }

    function collides(p, ox = 0, oy = 0, testMat = null) {
      const mat = testMat || p.mat;
      for (let y = 0; y < mat.length; y++) {
        for (let x = 0; x < mat[y].length; x++) {
          if (!mat[y][x]) continue;
          const bx = p.x + x + ox;
          const by = p.y + y + oy;

          if (bx < 0 || bx >= T.cols || by >= T.rows) return true;
          if (by < 0) continue; // above visible board allowed
          if (game.board[by][bx]) return true;
        }
      }
      return false;
    }

    function merge(p) {
      const mat = p.mat;
      for (let y = 0; y < mat.length; y++) {
        for (let x = 0; x < mat[y].length; x++) {
          if (!mat[y][x]) continue;
          const bx = p.x + x;
          const by = p.y + y;
          if (by >= 0 && by < T.rows && bx >= 0 && bx < T.cols) {
            game.board[by][bx] = p.type;
          }
        }
      }
    }

    function clearLines() {
      let cleared = 0;
      for (let y = T.rows - 1; y >= 0; y--) {
        if (game.board[y].every((c) => c)) {
          game.board.splice(y, 1);
          game.board.unshift(Array(T.cols).fill(null));
          cleared++;
          y++;
        }
      }
      return cleared;
    }

    function scoreForLines(lines, level) {
      const base = [0, 100, 300, 500, 800][lines] || 0;
      return base * level;
    }

    function dropInterval(level) {
      const ms = cfg.baseDropMs - (level - 1) * 60;
      return clamp(ms, cfg.minDropMs, cfg.baseDropMs);
    }

    function spawn() {
      const type = nextType();
      const mat = cloneMat(tetrominoes[type]);
      const w = mat[0].length;
      const p = { type, mat, x: Math.floor((T.cols - w) / 2), y: -2 };
      game.piece = p;

      // Spawn collision => game over
      if (collides(p, 0, 0)) {
        gameOver();
      }
    }

    function reset() {
      game = {
        board: newBoard(),
        piece: null,
        score: 0,
        lines: 0,
        level: 1,
        dropMs: dropInterval(1),
        dropAcc: 0,
        soft: false,
        bag: [],
        submitted: false,
      };
      refillBag();
      spawn();
      syncHUD();
    }

    // ---------- Loop control ----------
    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      lastTs = 0;
    }

    function stopGame() {
      stopLoop();
      state = State.Idle;
      game = null;
    }

    // ---------- Actions ----------
    function startGame() {
      if (!canvas || !ctx) return;

      if (!hub().getLocalName()) {
        hub().showView("home");
        return;
      }

      msg("");
      reset();
      state = State.Playing;
      showOverlay(false);

      stopLoop();
      rafId = requestAnimationFrame(loop);
    }

    function togglePause() {
      if (state === State.Playing) {
        state = State.Paused;
        msg("Paused (P to resume)");
      } else if (state === State.Paused) {
        state = State.Playing;
        msg("");
      }
    }

    function move(dx) {
      if (!game || !game.piece) return;
      if (!collides(game.piece, dx, 0)) game.piece.x += dx;
    }

    function rotate() {
      if (!game || !game.piece) return;
      const p = game.piece;
      const r = rotateCW(p.mat);

      const kicks = [0, -1, 1, -2, 2];
      for (const k of kicks) {
        if (!collides(p, k, 0, r)) {
          p.mat = r;
          p.x += k;
          return;
        }
      }
    }

    function softDrop(on) {
      if (!game) return;
      game.soft = !!on;
    }

    function stepDown() {
      const p = game?.piece;
      if (!p) return;

      if (!collides(p, 0, 1)) {
        p.y += 1;
        if (game.soft) game.score += 1;
        return;
      }
      lockPiece();
    }

    function hardDrop() {
      const p = game?.piece;
      if (!p) return;

      let d = 0;
      while (!collides(p, 0, 1)) {
        p.y += 1;
        d++;
      }
      game.score += d * 2;
      lockPiece();
    }

    function lockPiece() {
      const p = game?.piece;
      if (!p) return;

      // TOP-OUT rule (real game over)
      for (let y = 0; y < p.mat.length; y++) {
        for (let x = 0; x < p.mat[y].length; x++) {
          if (!p.mat[y][x]) continue;
          const by = p.y + y;
          if (by < 0) {
            gameOver();
            return;
          }
        }
      }

      merge(p);

      const cleared = clearLines();
      if (cleared) {
        game.lines += cleared;
        game.score += scoreForLines(cleared, game.level);

        const newLevel = Math.floor(game.lines / 10) + 1;
        if (newLevel !== game.level) {
          game.level = newLevel;
          game.dropMs = dropInterval(game.level);
        }
      }

      spawn();
      syncHUD();
    }

    function coinsFrom(score, lines) {
      const coins = Math.floor(score / 120) + lines * 2;
      return clamp(coins, 0, 5000);
    }

    async function gameOver() {
      if (!game) return;

      state = State.GameOver;
      stopLoop();

      const coins = coinsFrom(game.score, game.lines);

      // Show modal immediately (like Inbox)
      showOverlay(
        true,
        "Game Over",
        `Score: <b>${game.score}</b><br/>Reward: <b>+${coins} coins</b><br/><span class="muted">Submitting…</span>`,
        "Restart"
      );

      if (game.submitted) return;
      game.submitted = true;

      const res = await hub().submitCoins({
        gameKey: GAME_KEY,
        coins,
        reason: "game_over",
        statusEl,
      });

      if (res.ok) {
        showOverlay(
          true,
          "Submitted!",
          `Score: <b>${game.score}</b><br/>+${coins} coins<br/>Total: <b>${res.total}</b>`,
          "Restart"
        );
      } else {
        showOverlay(
          true,
          "Submit Failed",
          `Score: <b>${game.score}</b><br/>+${coins} coins<br/><span class="muted">${res.msg}</span>`,
          "Restart"
        );
      }
    }

    // ---------- Render (board + right panel) ----------
    function draw() {
      if (!ctx || !canvas || !game) return;

      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      // background
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, W, H);

      const panelW = Math.floor(W * 0.35);
      const boardW = W - panelW;

      const cell = Math.floor(Math.min(boardW / T.cols, H / T.rows));
      const gridW = cell * T.cols;
      const gridH = cell * T.rows;

      const offX = Math.floor((boardW - gridW) / 2);
      const offY = Math.floor((H - gridH) / 2);

      // grid lines
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "#2a3a58";
      for (let x = 0; x <= T.cols; x++) {
        ctx.beginPath();
        ctx.moveTo(offX + x * cell, offY);
        ctx.lineTo(offX + x * cell, offY + gridH);
        ctx.stroke();
      }
      for (let y = 0; y <= T.rows; y++) {
        ctx.beginPath();
        ctx.moveTo(offX, offY + y * cell);
        ctx.lineTo(offX + gridW, offY + y * cell);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // board
      for (let y = 0; y < T.rows; y++) {
        for (let x = 0; x < T.cols; x++) {
          const type = game.board[y][x];
          if (!type) continue;
          ctx.fillStyle = colors[type] || "#fff";
          ctx.fillRect(offX + x * cell + 1, offY + y * cell + 1, cell - 2, cell - 2);
        }
      }

      // piece
      const p = game.piece;
      if (p) {
        ctx.fillStyle = colors[p.type] || "#fff";
        for (let y = 0; y < p.mat.length; y++) {
          for (let x = 0; x < p.mat[y].length; x++) {
            if (!p.mat[y][x]) continue;
            const bx = p.x + x;
            const by = p.y + y;
            if (by < 0) continue;
            ctx.fillRect(offX + bx * cell + 1, offY + by * cell + 1, cell - 2, cell - 2);
          }
        }
      }

      // panel
      const px = boardW;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#000";
      ctx.fillRect(px, 0, panelW, H);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px system-ui";
      ctx.fillText("TETRIS", px + 20, 40);

      ctx.font = "16px system-ui";
      ctx.fillStyle = "#e7eefc";
      ctx.fillText(`Score: ${game.score}`, px + 20, 80);
      ctx.fillText(`Lines: ${game.lines}`, px + 20, 105);
      ctx.fillText(`Level: ${game.level}`, px + 20, 130);

      ctx.fillStyle = "#9ab0d0";
      ctx.fillText("Controls:", px + 20, 180);
      ctx.fillText("← → move", px + 20, 205);
      ctx.fillText("↑ rotate", px + 20, 230);
      ctx.fillText("↓ soft drop", px + 20, 255);
      ctx.fillText("Space hard drop", px + 20, 280);
      ctx.fillText("P pause", px + 20, 305);

      // pause dim
      if (state === State.Paused) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Update loop ----------
    function update(dtMs) {
      if (!game || state !== State.Playing) return;

      const dropMs = game.soft ? cfg.softDropMs : game.dropMs;
      game.dropAcc += dtMs;

      while (game.dropAcc >= dropMs) {
        game.dropAcc -= dropMs;
        if (state !== State.Playing) return;
        stepDown();
        syncHUD();
      }
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      if (!isActive()) {
        stopGame();
        return;
      }

      update(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    // ---------- Controls ----------
    window.addEventListener("keydown", (e) => {
      if (!isActive()) return;

      if (e.key === "p" || e.key === "P") {
        if (state === State.Playing || state === State.Paused) togglePause();
        return;
      }

      if (state !== State.Playing) return;

      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowDown") softDrop(true);
      else if (e.key === "ArrowUp") rotate();
      else if (e.key === " ") {
        e.preventDefault();
        hardDrop();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (!isActive()) return;
      if (state !== State.Playing) return;
      if (e.key === "ArrowDown") softDrop(false);
    });

    // ---------- Buttons ----------
    btnStart && btnStart.addEventListener("click", startGame);
    btnBack && btnBack.addEventListener("click", () => hub().showView("home"));

    // Overlay buttons
    btnRestart && btnRestart.addEventListener("click", startGame);
    btnHome && btnHome.addEventListener("click", () => hub().showView("home"));

    // Register game in hub
    hub().registerGame("tetris", {
      stop: stopGame,
      onShow: () => {
        // show ready modal like Inbox
        showOverlay(
          true,
          "Ready?",
          "Controls: ← → move, ↓ soft drop, ↑ rotate, Space hard drop, P pause",
          "Start"
        );
        msg("");
        if (!game && ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      },
    });
  });
})();
