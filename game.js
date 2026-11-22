/* =========================================================================
   SUIKA — game.js
   Suika-style merge game built on Matter.js.
   ========================================================================= */

(function () {
  "use strict";

  /* ----------------------------- THEMES -------------------------------- */

  const THEMES = {
    ocean: {
      key: "ocean",
      label: "Ocean",
      emoji: "🐋",
      bg: "assets/backgrounds/ocean.jpg",
      dir: "assets/ocean",
      accent: "#0ea5e9",
      names: {
        1: "Starfish", 2: "Sea Urchin", 3: "Clownfish", 4: "Tropical Fish",
        5: "Pufferfish", 6: "Jellyfish", 7: "Octopus", 8: "Sea Turtle", 9: "Whale"
      },
      music: { scale: [261.63, 293.66, 329.63, 392.0, 440.0, 329.63], wave: "sine", tempo: 620, filter: "lowpass", filterFreq: 900 }
    },
    forest: {
      key: "forest",
      label: "Forest",
      emoji: "🐼",
      bg: "assets/backgrounds/forest.jpg",
      dir: "assets/forest",
      accent: "#65a30d",
      names: {
        1: "Ladybug", 2: "Chick", 3: "Bunny", 4: "Hedgehog",
        5: "Kitty", 6: "Puppy", 7: "Sloth", 8: "Penguin", 9: "Panda"
      },
      music: { scale: [196.0, 220.0, 246.94, 293.66, 329.63, 246.94], wave: "triangle", tempo: 460, filter: "lowpass", filterFreq: 2200 }
    },
    arctic: {
      key: "arctic",
      label: "Arctic",
      emoji: "🐻‍❄️",
      bg: "assets/backgrounds/arctic.jpg",
      dir: "assets/arctic",
      accent: "#38bdf8",
      names: {
        1: "Seal Pup", 2: "Puffin", 3: "Snowy Owl", 4: "Arctic Fox",
        5: "Reindeer", 6: "Walrus", 7: "Orca", 8: "Blue Whale", 9: "Polar Bear"
      },
      music: { scale: [440.0, 493.88, 587.33, 659.25, 739.99, 587.33], wave: "sine", tempo: 700, filter: "highpass", filterFreq: 300, bell: true }
    }
  };

  const MAX_TIER = 9;
  const RADII = { 1: 16, 2: 20, 3: 25, 4: 31, 5: 38, 6: 46, 7: 55, 8: 65, 9: 76 };
  const SPAWN_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5]; // weighted toward smaller tiers

  const WORLD_W = 520;
  const WORLD_H = 760;
  const WALL_THICK = 60;
  const INNER_L = 26;
  const INNER_R = WORLD_W - 26;
  const INNER_B = WORLD_H - 22;
  const DANGER_Y = 148;
  const SPAWN_Y = 92;
  const DANGER_TIME_MS = 1400;
  const DROP_COOLDOWN_MS = 420;
  const COMBO_WINDOW_MS = 850;

  /* ----------------------------- STATE ---------------------------------- */

  const state = {
    theme: null,
    engine: null,
    render: null,
    runner: null,
    world: null,
    activeBody: null,
    currentTier: null,
    nextTier: null,
    pointerX: WORLD_W / 2,
    canDrop: true,
    paused: false,
    over: false,
    score: 0,
    best: 0,
    pendingMerges: [],
    comboCount: 0,
    comboTimer: null,
    lastMergeAt: 0,
    started: false
  };

  const sound = createSoundEngine();

  /* ----------------------------- DOM refs -------------------------------- */

  const el = (id) => document.getElementById(id);
  const screenMenu = el("screen-menu");
  const screenGame = el("screen-game");
  const themeGrid = el("theme-grid");
  const btnHowto = el("btn-howto");
  const howtoPanel = el("howto-panel");
  const btnHowtoClose = el("btn-howto-close");

  const canvas = el("world");
  const bgLayer = el("bg-layer");
  const dangerLine = el("danger-line");
  const particlesLayer = el("particles-layer");
  const floatersLayer = el("floaters-layer");
  const nextImg = el("next-img");
  const scoreEl = el("score");
  const bestEl = el("best");

  const btnHome = el("btn-home");
  const btnMusic = el("btn-music");
  const btnSfx = el("btn-sfx");
  const btnPause = el("btn-pause");

  const pauseOverlay = el("pause-overlay");
  const btnResume = el("btn-resume");
  const btnRestartPaused = el("btn-restart-paused");
  const btnHomePaused = el("btn-home-paused");

  const gameoverOverlay = el("gameover-overlay");
  const gameoverRecord = el("gameover-record");
  const finalScore = el("final-score");
  const finalBest = el("final-best");
  const btnRestart = el("btn-restart");
  const btnHomeOver = el("btn-home-over");

  const canvasContainer = el("canvas-container");

  /* ----------------------------- localStorage helpers -------------------- */

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
  }

  function bestKey(themeKey) { return `suika_best_${themeKey}`; }
  function musicKey(themeKey) { return `suika_music_${themeKey}`; }
  function sfxKey(themeKey) { return `suika_sfx_${themeKey}`; }

  /* ----------------------------- Menu build ------------------------------ */

  function buildMenu() {
    themeGrid.innerHTML = "";
    Object.values(THEMES).forEach((t) => {
      const card = document.createElement("button");
      card.className = "theme-card";
      card.style.backgroundImage = `url("${t.bg}")`;
      card.setAttribute("aria-label", `Play the ${t.label} world`);
      const best = lsGet(bestKey(t.key), 0);
      card.innerHTML = `
        <span class="card-emoji">${t.emoji}</span>
        <div class="scrim">
          <h3>${t.label}</h3>
          <div class="card-best">Best: ${best}</div>
        </div>`;
      card.addEventListener("click", () => startTheme(t.key));
      themeGrid.appendChild(card);
    });
  }

  btnHowto.addEventListener("click", () => howtoPanel.classList.remove("hidden"));
  btnHowtoClose.addEventListener("click", () => howtoPanel.classList.add("hidden"));
  howtoPanel.addEventListener("click", (e) => { if (e.target === howtoPanel) howtoPanel.classList.add("hidden"); });

  /* ----------------------------- Screen switching ------------------------ */

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    el(id).classList.add("active");
  }

  function goHome() {
    stopGame();
    buildMenu();
    showScreen("screen-menu");
  }

  /* ----------------------------- Start / Setup ---------------------------- */

  function startTheme(themeKey) {
    state.theme = THEMES[themeKey];
    state.best = lsGet(bestKey(themeKey), 0);
    showScreen("screen-game");
    sound.init(); // must happen on user gesture
    sound.setThemeConfig(state.theme.music);
    sound.setMusicEnabled(lsGet(musicKey(themeKey), true));
    sound.setSfxEnabled(lsGet(sfxKey(themeKey), true));
    updateToggleButtons();
    bgLayer.style.backgroundImage = `url("${state.theme.bg}")`;
    canvasContainer.style.setProperty("--accent", state.theme.accent);
    dangerLine.style.top = (DANGER_Y / WORLD_H * 100) + "%";
    resetGameState();
    buildPhysics();
    sound.startMusic();
    requestAnimationFrame(layoutCanvas);
  }

  function resetGameState() {
    state.score = 0;
    state.paused = false;
    state.over = false;
    state.pendingMerges = [];
    state.comboCount = 0;
    state.canDrop = true;
    scoreEl.textContent = "0";
    bestEl.textContent = String(state.best);
    pauseOverlay.classList.add("hidden");
    gameoverOverlay.classList.add("hidden");
    particlesLayer.innerHTML = "";
    floatersLayer.innerHTML = "";
    dangerLine.classList.remove("warn");
  }

  function stopGame() {
    if (state.runner) Matter.Runner.stop(state.runner);
    if (state.render) Matter.Render.stop(state.render);
    if (state.engine) {
      Matter.World.clear(state.engine.world);
      Matter.Engine.clear(state.engine);
    }
    sound.stopMusic();
    state.activeBody = null;
    state.started = false;
    window.removeEventListener("resize", layoutCanvas);
  }

  /* ----------------------------- Physics setup ---------------------------- */

  function tierImgPath(tier) {
    return `${state.theme.dir}/tier${tier}.png`;
  }

  function spriteFor(tier) {
    const r = RADII[tier];
    return {
      texture: tierImgPath(tier),
      xScale: (r * 2) / 320,
      yScale: (r * 2) / 320
    };
  }

  function randomSpawnTier() {
    return SPAWN_POOL[Math.floor(Math.random() * SPAWN_POOL.length)];
  }

  function buildPhysics() {
    const Engine = Matter.Engine, World = Matter.World, Bodies = Matter.Bodies,
      Render = Matter.Render, Runner = Matter.Runner, Events = Matter.Events, Body = Matter.Body;

    const engine = Engine.create();
    engine.gravity.y = 1.05;
    state.engine = engine;
    state.world = engine.world;

    const render = Render.create({
      canvas: canvas,
      engine: engine,
      options: {
        width: WORLD_W,
        height: WORLD_H,
        wireframes: false,
        background: "transparent",
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
      }
    });
    state.render = render;

    const wallOpts = { isStatic: true, friction: 0.02, restitution: 0.15, render: { visible: false } };
    const leftWall = Bodies.rectangle(INNER_L - WALL_THICK / 2, WORLD_H / 2, WALL_THICK, WORLD_H + 200, wallOpts);
    const rightWall = Bodies.rectangle(INNER_R + WALL_THICK / 2, WORLD_H / 2, WALL_THICK, WORLD_H + 200, wallOpts);
    const floor = Bodies.rectangle(WORLD_W / 2, INNER_B + WALL_THICK / 2, WORLD_W + 200, WALL_THICK, wallOpts);
    World.add(engine.world, [leftWall, rightWall, floor]);

    const runner = Runner.create();
    state.runner = runner;
    Runner.run(runner, engine);
    Render.run(render);

    Events.on(engine, "collisionStart", onCollisionStart);
    Events.on(engine, "afterUpdate", onAfterUpdate);

    state.currentTier = randomSpawnTier();
    state.nextTier = randomSpawnTier();
    spawnHoverPiece();
    updateNextPreview();

    state.started = true;

    if (!inputBound) { setupInput(); inputBound = true; }
    window.addEventListener("resize", layoutCanvas);
  }
  let inputBound = false;

  function spawnHoverPiece() {
    const Bodies = Matter.Bodies, World = Matter.World;
    const r = RADII[state.currentTier];
    const x = clamp(state.pointerX, INNER_L + r, INNER_R - r);
    const body = Bodies.circle(x, SPAWN_Y, r, {
      isStatic: true,
      isSensor: true,
      friction: 0.4,
      frictionStatic: 0.7,
      restitution: 0.1,
      density: 0.0016,
      render: { sprite: spriteFor(state.currentTier) }
    });
    body.tier = state.currentTier;
    body.isHover = true;
    World.add(state.world, body);
    state.activeBody = body;
    state.canDrop = true;
  }

  function updateNextPreview() {
    nextImg.src = tierImgPath(state.nextTier);
    nextImg.alt = state.theme.names[state.nextTier] || "";
  }

  /* ----------------------------- Input ------------------------------------ */

  function setupInput() {
    canvasContainer.addEventListener("mousemove", onPointerMove);
    canvasContainer.addEventListener("touchmove", onTouchMove, { passive: true });
    canvasContainer.addEventListener("mousedown", onPointerDown);
    canvasContainer.addEventListener("touchstart", onTouchMove, { passive: true });
    canvasContainer.addEventListener("touchend", onDropRequest, { passive: true });
    document.addEventListener("keydown", onKeyDown);
  }

  function screenXToWorld(clientX) {
    const rect = canvas.getBoundingClientRect();
    const relative = (clientX - rect.left) / rect.width;
    return clamp(relative * WORLD_W, 0, WORLD_W);
  }

  function onPointerMove(e) {
    if (!state.started || state.paused || state.over) return;
    state.pointerX = screenXToWorld(e.clientX);
    moveHoverPiece();
  }
  function onTouchMove(e) {
    if (!state.started || state.paused || state.over) return;
    if (!e.touches || !e.touches[0]) return;
    state.pointerX = screenXToWorld(e.touches[0].clientX);
    moveHoverPiece();
  }
  function onPointerDown() {
    onDropRequest();
  }
  function onKeyDown(e) {
    if (!state.started) return;
    if (e.code === "ArrowLeft") { state.pointerX = clamp(state.pointerX - 18, 0, WORLD_W); moveHoverPiece(); }
    else if (e.code === "ArrowRight") { state.pointerX = clamp(state.pointerX + 18, 0, WORLD_W); moveHoverPiece(); }
    else if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); onDropRequest(); }
    else if (e.code === "KeyP") { togglePause(); }
  }

  function moveHoverPiece() {
    if (!state.activeBody || state.paused || state.over) return;
    const r = state.activeBody.circleRadius;
    const x = clamp(state.pointerX, INNER_L + r, INNER_R - r);
    Matter.Body.setPosition(state.activeBody, { x, y: SPAWN_Y });
  }

  function onDropRequest() {
    if (!state.started || state.paused || state.over) return;
    if (!state.canDrop || !state.activeBody) return;
    dropActivePiece();
  }

  function dropActivePiece() {
    const Body = Matter.Body;
    const body = state.activeBody;
    if (!body) return;
    state.canDrop = false;
    body.isHover = false;
    Body.setStatic(body, false);
    body.isSensor = false;
    Body.setVelocity(body, { x: 0, y: 0 });
    state.activeBody = null;
    sound.playDrop();

    state.currentTier = state.nextTier;
    state.nextTier = randomSpawnTier();
    updateNextPreview();

    setTimeout(() => {
      if (state.over || state.paused) return;
      spawnHoverPiece();
    }, DROP_COOLDOWN_MS);
  }

  /* ----------------------------- Merge logic ------------------------------- */

  function onCollisionStart(evt) {
    if (state.over) return;
    evt.pairs.forEach((pair) => {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.isSensor || b.isSensor) return;
      if (!a.tier || !b.tier) return;
      if (a.tier !== b.tier) return;
      if (a.merging || b.merging) return;

      if (a.tier < MAX_TIER) {
        a.merging = true; b.merging = true;
        state.pendingMerges.push({
          tier: a.tier,
          x: (a.position.x + b.position.x) / 2,
          y: (a.position.y + b.position.y) / 2,
          a, b
        });
      } else if (!a.maxFx) {
        a.maxFx = true; b.maxFx = true;
        const mx = (a.position.x + b.position.x) / 2, my = (a.position.y + b.position.y) / 2;
        triggerMaxTierFx(mx, my);
        spawnParticles(mx, my, "#ffe066", 14);
        addScore(30);
        setTimeout(() => { a.maxFx = false; b.maxFx = false; }, 900);
      }
    });
  }

  function onAfterUpdate() {
    if (state.pendingMerges.length) {
      const merges = state.pendingMerges;
      state.pendingMerges = [];
      merges.forEach(processMerge);
    }
    if (!state.over) checkGameOver();
  }

  function processMerge(m) {
    const World = Matter.World, Bodies = Matter.Bodies;
    World.remove(state.world, [m.a, m.b]);
    const newTier = m.tier + 1;
    const r = RADII[newTier];
    const nb = Bodies.circle(m.x, m.y, r, {
      restitution: 0.12,
      friction: 0.4,
      frictionStatic: 0.7,
      density: 0.0016,
      render: { sprite: spriteFor(newTier) }
    });
    nb.tier = newTier;
    World.add(state.world, nb);

    spawnParticles(m.x, m.y, state.theme.accent, 16);
    handleCombo(m.x, m.y);
    addScore(newTier * newTier * 2);
    sound.playPop(newTier);

    if (newTier === MAX_TIER) {
      spawnFloater(m.x, m.y, `${state.theme.emoji} ${state.theme.names[MAX_TIER]}!`);
    }
  }

  function handleCombo(x, y) {
    const now = performance.now();
    if (now - state.lastMergeAt < COMBO_WINDOW_MS) {
      state.comboCount++;
    } else {
      state.comboCount = 1;
    }
    state.lastMergeAt = now;
    if (state.comboCount >= 2) {
      spawnFloater(x, y - 30, `Combo x${state.comboCount}!`);
      addScore(state.comboCount * 4);
    }
  }

  function triggerMaxTierFx(x, y) {
    spawnFloater(x, y, "✨ Bonus! ✨");
  }

  /* ----------------------------- Score ------------------------------------- */

  function addScore(n) {
    state.score += n;
    scoreEl.textContent = String(state.score);
    if (state.score > state.best) {
      state.best = state.score;
      bestEl.textContent = String(state.best);
      lsSet(bestKey(state.theme.key), state.best);
    }
  }

  /* ----------------------------- Game over ---------------------------------- */

  function checkGameOver() {
    const bodies = Matter.Composite.allBodies(state.world);
    const dt = state.engine.timing.lastDelta || 16.7;
    let dangerActive = false;

    for (const b of bodies) {
      if (b.isStatic || b.isSensor || !b.tier) continue;
      const top = b.position.y - b.circleRadius;
      if (top < DANGER_Y) {
        dangerActive = true;
        const speed = Math.hypot(b.velocity.x, b.velocity.y);
        if (speed < 0.6) {
          b.dangerTimer = (b.dangerTimer || 0) + dt;
          if (b.dangerTimer > DANGER_TIME_MS) {
            triggerGameOver();
            return;
          }
        } else {
          b.dangerTimer = 0;
        }
      } else {
        b.dangerTimer = 0;
      }
    }
    dangerLine.classList.toggle("warn", dangerActive);
  }

  function triggerGameOver() {
    if (state.over) return;
    state.over = true;
    sound.playGameOver();
    sound.stopMusic();
    const isRecord = state.score >= state.best && state.score > 0;
    finalScore.textContent = String(state.score);
    finalBest.textContent = String(state.best);
    gameoverRecord.classList.toggle("hidden", !isRecord);
    gameoverOverlay.classList.remove("hidden");
  }

  /* ----------------------------- Particles / floaters ------------------------ */

  function worldToPct(x, y) {
    return { left: (x / WORLD_W) * 100 + "%", top: (y / WORLD_H) * 100 + "%" };
  }

  function spawnParticles(x, y, color, count) {
    const pos = worldToPct(x, y);
    for (let i = 0; i < (count || 10); i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const size = 4 + Math.random() * 7;
      const angle = Math.random() * Math.PI * 2;
      const dist = 28 + Math.random() * 46;
      p.style.left = pos.left;
      p.style.top = pos.top;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.background = color || "#fff";
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      particlesLayer.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  }

  function spawnFloater(x, y, text) {
    const pos = worldToPct(x, y);
    const f = document.createElement("div");
    f.className = "floater";
    f.style.left = pos.left;
    f.style.top = pos.top;
    f.style.fontSize = "1rem";
    f.textContent = text;
    floatersLayer.appendChild(f);
    setTimeout(() => f.remove(), 1050);
  }

  /* ----------------------------- Pause / Restart / Home ------------------------ */

  function togglePause() {
    if (!state.started || state.over) return;
    state.paused = !state.paused;
    if (state.paused) {
      Matter.Runner.stop(state.runner);
      sound.pauseMusic();
      pauseOverlay.classList.remove("hidden");
    } else {
      Matter.Runner.start(state.runner, state.engine);
      sound.resumeMusic();
      pauseOverlay.classList.add("hidden");
    }
  }

  function restartSameTheme() {
    const themeKey = state.theme.key;
    stopGame();
    startTheme(themeKey);
  }

  btnHome.addEventListener("click", goHome);
  btnHomePaused.addEventListener("click", goHome);
  btnHomeOver.addEventListener("click", goHome);
  btnPause.addEventListener("click", togglePause);
  btnResume.addEventListener("click", togglePause);
  btnRestartPaused.addEventListener("click", restartSameTheme);
  btnRestart.addEventListener("click", restartSameTheme);

  btnMusic.addEventListener("click", () => {
    const on = sound.toggleMusic();
    lsSet(musicKey(state.theme.key), on);
    updateToggleButtons();
  });
  btnSfx.addEventListener("click", () => {
    const on = sound.toggleSfx();
    lsSet(sfxKey(state.theme.key), on);
    updateToggleButtons();
  });

  function updateToggleButtons() {
    btnMusic.textContent = sound.musicEnabled ? "🎵" : "🔇";
    btnMusic.classList.toggle("muted", !sound.musicEnabled);
    btnSfx.textContent = sound.sfxEnabled ? "🔊" : "🔈";
    btnSfx.classList.toggle("muted", !sound.sfxEnabled);
  }

  /* ----------------------------- Canvas layout -------------------------------- */

  // Keep the board at the exact world proportions (520 x 760) on every screen.
  // Without this the canvas gets stretched on narrow phones and every animal turns into an oval.
  function fitBoard() {
    const c = canvasContainer;
    c.style.flex = ""; c.style.width = ""; c.style.height = ""; c.style.alignSelf = ""; c.style.margin = "";
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min(r.width / WORLD_W, r.height / WORLD_H);
    c.style.flex = "none";
    c.style.alignSelf = "center";
    c.style.margin = "auto 0";
    c.style.width = Math.floor(WORLD_W * s) + "px";
    c.style.height = Math.floor(WORLD_H * s) + "px";
  }

  function layoutCanvas() {
    // The canvas keeps an internal WORLD_W x WORLD_H resolution; fitBoard() scales its box
    // without distortion, and we re-affirm the pixel ratio on resize for crispness.
    fitBoard();
    if (!state.render) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (state.render.options.pixelRatio !== ratio) {
      state.render.options.pixelRatio = ratio;
      Matter.Render.setPixelRatio(state.render, ratio);
    }
  }

  /* ----------------------------- Utils ------------------------------------------ */

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ----------------------------- Sound engine ------------------------------------ */

  function createSoundEngine() {
    let ctx = null;
    let master = null, musicGain = null, sfxGain = null, musicFilter = null;
    let musicEnabled = true, sfxEnabled = true;
    let themeConfig = null;
    let musicTimer = null;
    let noteIndex = 0;
    let running = false;

    function init() {
      if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      musicFilter = ctx.createBiquadFilter();
      musicFilter.connect(master);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.22;
      musicGain.connect(musicFilter);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
    }

    function setThemeConfig(cfg) {
      themeConfig = cfg;
      if (musicFilter) {
        musicFilter.type = cfg.filter || "lowpass";
        musicFilter.frequency.value = cfg.filterFreq || 4000;
      }
    }

    function setMusicEnabled(v) { musicEnabled = v; if (musicGain) musicGain.gain.value = v ? 0.22 : 0; }
    function setSfxEnabled(v) { sfxEnabled = v; }

    function toggleMusic() { setMusicEnabled(!musicEnabled); return musicEnabled; }
    function toggleSfx() { setSfxEnabled(!sfxEnabled); return sfxEnabled; }

    function tone(freq, dur, opts) {
      if (!ctx) return;
      opts = opts || {};
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = opts.wave || "sine";
      o.frequency.value = freq;
      const now = ctx.currentTime;
      const peak = opts.peak != null ? opts.peak : 0.5;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g);
      g.connect(opts.bus || sfxGain);
      o.start(now);
      o.stop(now + dur + 0.05);
    }

    function playPop(tier) {
      if (!sfxEnabled || !ctx) return;
      const base = 520 - tier * 22;
      tone(Math.max(base, 140), 0.18, { wave: "triangle", peak: 0.35, attack: 0.005 });
      tone(Math.max(base, 140) * 1.5, 0.12, { wave: "sine", peak: 0.18, attack: 0.005 });
    }

    function playDrop() {
      if (!sfxEnabled || !ctx) return;
      tone(180, 0.12, { wave: "sine", peak: 0.25 });
    }

    function playGameOver() {
      if (!sfxEnabled || !ctx) return;
      [392, 330, 262, 196].forEach((f, i) => {
        setTimeout(() => tone(f, 0.35, { wave: "sawtooth", peak: 0.22 }), i * 140);
      });
    }

    function scheduleNextNote() {
      if (!running || !themeConfig) return;
      const scale = themeConfig.scale;
      const freq = scale[noteIndex % scale.length];
      noteIndex++;
      if (musicEnabled && ctx) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = themeConfig.wave || "sine";
        o.frequency.value = freq;
        const now = ctx.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + (themeConfig.bell ? 1.1 : 0.5));
        o.connect(g);
        g.connect(musicGain);
        o.start(now);
        o.stop(now + (themeConfig.bell ? 1.2 : 0.55));

        if (themeConfig.bell) {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = "sine";
          o2.frequency.value = freq * 2.01;
          g2.gain.setValueAtTime(0, now);
          g2.gain.linearRampToValueAtTime(0.15, now + 0.03);
          g2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
          o2.connect(g2); g2.connect(musicGain);
          o2.start(now); o2.stop(now + 0.85);
        }
      }
      musicTimer = setTimeout(scheduleNextNote, themeConfig.tempo || 500);
    }

    function startMusic() {
      if (!ctx || !themeConfig) return;
      running = true;
      noteIndex = 0;
      clearTimeout(musicTimer);
      scheduleNextNote();
    }
    function stopMusic() {
      running = false;
      clearTimeout(musicTimer);
    }
    function pauseMusic() { running = false; clearTimeout(musicTimer); }
    function resumeMusic() { if (!running) { running = true; scheduleNextNote(); } }

    return {
      init, setThemeConfig, setMusicEnabled, setSfxEnabled, toggleMusic, toggleSfx,
      playPop, playDrop, playGameOver, startMusic, stopMusic, pauseMusic, resumeMusic,
      get musicEnabled() { return musicEnabled; },
      get sfxEnabled() { return sfxEnabled; }
    };
  }

  /* ----------------------------- Boot --------------------------------------------- */

  buildMenu();

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // a new version took over: reload once so the player gets it
      if (hadController && !reloaded && !state.started) { reloaded = true; window.location.reload(); }
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* ignore */ });
    });
  }

})();
