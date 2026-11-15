/* 峡谷のキバ — 1画面の恐竜アクション。絵と音はこのファイルの中で作る。 */
(() => {
  const VW = 320;
  const VH = 180;
  const GROUND = 158;
  const PLATS = [
    { x: 8, y: 98, w: 74, h: 6 },
    { x: 238, y: 98, w: 74, h: 6 },
    { x: 116, y: 88, w: 88, h: 6 },
  ];
  const WAVES = [
    ["pebble", "pebble", "pebble", "pebble"],
    ["pebble", "flyer", "pebble", "flyer", "pebble"],
    ["shell", "flyer", "shell", "flyer", "shell", "flyer"],
  ];
  const ATTACKS = ["slamWind", "chargeWind", "spit", "chargeWind"];
  const STEP = 1000 / 60;
  const COMBO_WINDOW = 90;
  const TIME_MAX = 180;

  const view = document.getElementById("view");
  const ctx = view.getContext("2d");
  const hud = document.getElementById("hud");
  const hpEl = document.getElementById("hp");
  const timerEl = document.getElementById("timer");
  const waveEl = document.getElementById("wave");
  const comboEl = document.getElementById("combo");
  const chain = document.getElementById("chain");
  const chainFill = document.getElementById("chainfill");
  const bossbar = document.getElementById("bossbar");
  const bossFill = document.getElementById("bossfill");
  const banner = document.getElementById("banner");
  const bannerMainEl = document.getElementById("banner-main");
  const bannerSubEl = document.getElementById("banner-sub");
  const overlay = document.getElementById("overlay");
  const panel = document.getElementById("panel");
  const btnSound = document.getElementById("btn-sound");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");
  const btnJump = document.getElementById("btn-jump");
  const btnBite = document.getElementById("btn-bite");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DEBUG = new URLSearchParams(location.search).has("debug");

  const keys = new Set();
  const pad = { left: false, right: false, jump: false, bite: false };
  const intent = {
    left: false,
    right: false,
    jump: false,
    jumpEdge: false,
    bite: false,
  };
  let jumpPrev = false;

  let mode = "title";
  let phase = "announce";
  let frame = 0;
  let anim = 0;
  let wave = 1;
  let timeLeft = TIME_MAX;
  let combo = 0;
  let maxCombo = 0;
  let lastHit = -999;
  let kills = 0;
  let shake = 0;
  let hitstop = 0;
  let overReason = "";
  let announceT = 0;
  let gapT = 0;
  let introT = 0;
  let dieT = 0;
  let bannerMain = "";
  let bannerSub = "";
  let spawnFlip = 0;
  let soundOn = true;
  let paused = false;
  let god = false;
  let lastStartFrame = -999;
  let acc = 0;
  let lastTs = 0;

  let player = null;
  let enemies = [];
  let queue = [];
  let hazards = [];
  let particles = [];
  let floats = [];
  let boss = null;

  let actx = null;
  let drone = null;

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function fmt(t) {
    const s = Math.max(0, Math.ceil(t - 1e-6));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function makePlayer() {
    return {
      x: 24,
      y: GROUND - 24,
      w: 20,
      h: 24,
      vx: 0,
      vy: 0,
      face: 1,
      onGround: true,
      coyote: 0,
      jumpBuf: 0,
      hp: 5,
      inv: 0,
      biteCd: 0,
      biteActive: 0,
      hitSet: new Set(),
      walk: 0,
      knock: 0,
    };
  }

  function bonus(c) {
    if (c >= 12) return 2;
    if (c >= 6) return 1;
    return 0;
  }

  function registerCombo() {
    if (frame - lastHit > COMBO_WINDOW) combo = 1;
    else combo += 1;
    if (combo > 99) combo = 99;
    lastHit = frame;
    if (combo > maxCombo) maxCombo = combo;
    sfx.combo(combo);
    return combo;
  }

  function ac() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    return actx;
  }

  function tone(freq, dur, type, gain, slide) {
    if (!soundOn) return;
    const a = ac();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, gain, freq) {
    if (!soundOn) return;
    const a = ac();
    if (!a) return;
    const n = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, n, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(a.destination);
    src.start();
  }

  const sfx = {
    jump() { tone(300, 0.09, "sine", 0.08, 540); },
    bite() { tone(140, 0.06, "square", 0.05, 70); noise(0.05, 0.04, 900); },
    hit() { tone(520, 0.07, "triangle", 0.07, 320); },
    crystal() { tone(740, 0.08, "sine", 0.07, 980); tone(980, 0.1, "triangle", 0.05, 1400); },
    hurt() { tone(210, 0.18, "sawtooth", 0.06, 70); },
    combo(c) { tone(380 + Math.min(c, 16) * 28, 0.05, "square", 0.035); },
    pop() { tone(180, 0.08, "sine", 0.05, 60); },
    wave() {
      tone(523, 0.1, "square", 0.05);
      setTimeout(() => tone(659, 0.1, "square", 0.05), 90);
      setTimeout(() => tone(784, 0.14, "square", 0.05), 180);
    },
    boss() { tone(82, 0.4, "sawtooth", 0.06, 50); noise(0.2, 0.05, 200); },
    slam() { noise(0.12, 0.08, 180); tone(60, 0.16, "sine", 0.07); },
    charge() { tone(110, 0.12, "square", 0.05, 180); },
    spit() { noise(0.08, 0.05, 600); },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => tone(f, 0.16, "square", 0.06), i * 120);
      });
    },
    lose() {
      [311, 233, 174].forEach((f, i) => {
        setTimeout(() => tone(f, 0.18, "triangle", 0.06), i * 140);
      });
    },
  };

  function startDrone() {
    if (!soundOn || drone) return;
    const a = ac();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = 58;
    g.gain.value = 0.018;
    o.connect(g);
    g.connect(a.destination);
    o.start();
    drone = { o, g };
  }

  function stopDrone() {
    if (!drone) return;
    try { drone.o.stop(); } catch (err) { /* already stopped */ }
    drone = null;
  }

  function unlockAudio() {
    const a = ac();
    if (a && a.state === "suspended") a.resume();
    if (soundOn && mode === "play") startDrone();
  }

  function setBanner(main, sub) {
    bannerMain = main || "";
    bannerSub = sub || "";
  }

  function spawnBurst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * (0.7 + (i % 3) * 0.2),
        vy: Math.sin(a) * 0.7 - 0.5,
        life: 14 + (i % 5),
        color: color,
        s: 2 + (i % 2),
      });
    }
    if (particles.length > 120) particles.splice(0, particles.length - 120);
  }

  function spawnDust(x, y) {
    particles.push({ x: x + 4, y: y, vx: -0.4, vy: -0.35, life: 10, color: "#6b5344", s: 2 });
    particles.push({ x: x + 12, y: y, vx: 0.45, vy: -0.25, life: 10, color: "#8a6a52", s: 2 });
  }

  function floatNum(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color, life: 30, vy: -0.4 });
  }

  function updateParticles() {
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life--;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function updateFloats() {
    for (const f of floats) {
      f.y += f.vy;
      f.life--;
    }
    floats = floats.filter((f) => f.life > 0);
  }

  function spawnEnemy(kind, index) {
    spawnFlip ^= 1;
    const fromLeft = spawnFlip === 1;
    let w = 16;
    let h = 16;
    let hp = 1;
    let speed = 0.52;
    let color = "#d4766a";
    if (kind === "flyer") {
      w = 16;
      h = 12;
      speed = 0.7;
      color = "#f0d078";
    } else if (kind === "shell") {
      w = 22;
      h = 18;
      hp = 3;
      speed = 0.36;
      color = "#7f9aa6";
    }
    speed += (index % 3) * 0.04;
    const e = {
      kind: kind,
      w: w,
      h: h,
      hp: hp,
      maxHp: hp,
      speed: speed,
      color: color,
      x: fromLeft ? -w - 10 : VW + 10,
      y: GROUND - h,
      vx: 0,
      vy: 0,
      face: fromLeft ? 1 : -1,
      t: index * 13,
      hurt: 0,
      alive: true,
      onGround: true,
      base: 104 + (index % 4) * 8,
      amp: 12,
    };
    if (kind === "flyer") e.y = e.base;
    enemies.push(e);
  }

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    e.hurt = Math.max(e.hurt, 12);
    kills += 1;
    spawnBurst(e.x + e.w / 2, e.y + e.h / 2, "#fff6d0");
    sfx.pop();
  }

  function makeBoss() {
    const w = 86;
    const h = 50;
    return {
      x: VW - 36,
      y: GROUND - h,
      w: w,
      h: h,
      hp: 24,
      maxHp: 24,
      face: -1,
      state: "intro",
      timer: 0,
      t: 0,
      hurt: 0,
      alive: true,
      off: 0,
      pattern: 0,
    };
  }

  function beginWave(n) {
    wave = n;
    phase = "announce";
    announceT = 70;
    queue = WAVES[n - 1].map((kind, i) => ({ kind: kind, in: 36 + i * 46, index: i }));
    setBanner("ウェーブ " + n + "/3", n === 1 ? "近づいて、かみつけ" : "つぎの波が来る");
  }

  function beginBoss() {
    phase = "bossintro";
    introT = 120;
    boss = makeBoss();
    hazards = [];
    setBanner("ボス 黒岩の王", "光る結晶をねらえ");
    sfx.boss();
  }

  function bodyRect() {
    return { x: boss.x, y: boss.y + boss.off, w: boss.w, h: boss.h };
  }

  function crystalBox() {
    const b = bodyRect();
    let ly = 12;
    if (boss.state === "slamWind") ly = 2;
    else if (boss.state === "slam") ly = 30;
    else if (boss.state === "charge" || boss.state === "chargeWind") ly = 14;
    const cw = 16;
    const ch = 16;
    const inset = 8;
    const x = boss.face >= 0 ? b.x + b.w - inset - cw : b.x + inset;
    return { x: x, y: b.y + ly, w: cw, h: ch };
  }

  function contactRect() {
    if (!boss || phase !== "boss" || !boss.alive) return null;
    const b = bodyRect();
    if (boss.state === "charge") {
      return { x: b.x + 4, y: b.y + b.h - 36, w: b.w - 8, h: 36 };
    }
    return { x: b.x + 12, y: b.y + 18, w: b.w - 22, h: b.h - 18 };
  }

  function playerHurtBox() {
    return { x: player.x + 3, y: player.y + 4, w: player.w - 6, h: player.h - 4 };
  }

  function biteBox() {
    const reach = 18;
    const y = player.y + 6;
    const h = 12;
    if (player.face === 1) return { x: player.x + player.w - 2, y: y, w: reach, h: h };
    return { x: player.x + 2 - reach, y: y, w: reach, h: h };
  }

  function tryBite() {
    if (player.biteCd > 0 || player.biteActive > 0) return;
    player.biteCd = 18;
    player.biteActive = 6;
    player.hitSet = new Set();
    sfx.bite();
  }

  function strikeBoss(box) {
    if (!boss || !boss.alive || phase !== "boss" || player.hitSet.has(boss)) return;
    const gem = crystalBox();
    const weak = overlap(box, gem);
    const body = overlap(box, bodyRect());
    if (!weak && !body) return;
    player.hitSet.add(boss);
    const c = registerCombo();
    const dmg = (weak ? 4 : 1) + bonus(c);
    boss.hp -= dmg;
    boss.hurt = 10;
    hitstop = weak ? 3 : 2;
    shake = Math.max(shake, weak ? 5 : 3);
    const col = weak ? "#b8ffcf" : "#fff6d0";
    spawnBurst(gem.x + 8, gem.y + 8, col);
    floatNum(gem.x + 8, gem.y, String(dmg), col);
    if (weak) sfx.crystal();
    else sfx.hit();
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.alive = false;
      boss.hurt = 999;
      phase = "bossdie";
      dieT = 70;
      hazards = [];
      setBanner("結晶が割れた", "");
      shake = 8;
      sfx.crystal();
    }
  }

  function hurtPlayer(fromX) {
    if (god || player.inv > 0 || mode !== "play") return;
    player.hp -= 1;
    player.inv = 70;
    player.knock = 8;
    player.vy = -2.6;
    player.vx = player.x + player.w / 2 < fromX ? -2.3 : 2.3;
    combo = 0;
    lastHit = -999;
    shake = 6;
    sfx.hurt();
    if (player.hp <= 0) {
      player.hp = 0;
      lose("hp");
    }
  }

  function spawnShock() {
    const b = bodyRect();
    hazards.push({ kind: "shock", x: b.x - 6, y: GROUND - 28, w: 26, h: 28, vx: -2.4, life: 28, hit: false });
    hazards.push({ kind: "shock", x: b.x + b.w - 10, y: GROUND - 28, w: 26, h: 28, vx: 2.4, life: 28, hit: false });
  }

  function spawnRock() {
    const b = bodyRect();
    const dir = boss.face;
    hazards.push({
      kind: "rock",
      x: b.x + (dir > 0 ? b.w - 8 : -4),
      y: b.y + 24,
      w: 8,
      h: 8,
      vx: dir * 1.85,
      vy: -2.6,
      life: 190,
      hit: false,
    });
    sfx.spit();
  }

  function readIntent() {
    intent.left = keys.has("ArrowLeft") || keys.has("KeyA") || pad.left;
    intent.right = keys.has("ArrowRight") || keys.has("KeyD") || pad.right;
    intent.jump = keys.has("ArrowUp") || keys.has("Space") || keys.has("KeyW") || pad.jump;
    intent.bite = keys.has("KeyZ") || keys.has("KeyX") || keys.has("KeyJ") || keys.has("KeyK") || pad.bite;
    intent.jumpEdge = intent.jump && !jumpPrev;
    jumpPrev = intent.jump;
  }

  function updatePlayer() {
    const left = intent.left;
    const right = intent.right;
    if (player.biteActive <= 0) {
      if (left && !right) player.face = -1;
      else if (right && !left) player.face = 1;
    }
    if (player.knock > 0) {
      player.knock -= 1;
      player.vx *= 0.9;
    } else if (left !== right) {
      player.vx = (right ? 1 : -1) * 1.65;
      if (player.onGround) player.walk += 1;
    } else {
      player.vx *= 0.4;
      if (Math.abs(player.vx) < 0.08) player.vx = 0;
    }

    if (intent.jumpEdge) player.jumpBuf = 8;
    if (player.jumpBuf > 0) player.jumpBuf -= 1;
    if (player.onGround) player.coyote = 7;
    else if (player.coyote > 0) player.coyote -= 1;

    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = -5.45;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      sfx.jump();
    }
    if (!intent.jump && player.vy < -1.8) player.vy = -1.8;

    player.vy += 0.2;
    if (player.vy > 4.8) player.vy = 4.8;
    player.x += player.vx;
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > VW) player.x = VW - player.w;

    const prevFeet = player.y + player.h;
    const fallSpeed = player.vy;
    player.y += player.vy;
    let landed = false;
    if (player.vy >= 0) {
      for (const p of PLATS) {
        if (
          prevFeet <= p.y + 0.1 &&
          player.y + player.h >= p.y &&
          player.x + player.w > p.x + 4 &&
          player.x < p.x + p.w - 4
        ) {
          player.y = p.y - player.h;
          player.vy = 0;
          landed = true;
          break;
        }
      }
      if (!landed && prevFeet <= GROUND + 0.1 && player.y + player.h >= GROUND) {
        player.y = GROUND - player.h;
        player.vy = 0;
        landed = true;
      }
    }
    if (landed && fallSpeed > 3.2) spawnDust(player.x, player.y + player.h);
    player.onGround = landed;
    if (player.inv > 0) player.inv -= 1;
  }

  function updateBite() {
    if (intent.bite) tryBite();
    if (player.biteCd > 0) player.biteCd -= 1;
    if (player.biteActive <= 0) return;
    const box = biteBox();
    for (const e of enemies) {
      if (!e.alive || player.hitSet.has(e)) continue;
      if (!overlap(box, e)) continue;
      player.hitSet.add(e);
      const c = registerCombo();
      const dmg = 1 + bonus(c);
      e.hp -= dmg;
      e.hurt = 20;
      e.vy = -1.1;
      e.x += player.face * 5;
      hitstop = 2;
      shake = Math.max(shake, 2);
      spawnBurst(e.x + e.w / 2, e.y + 4, e.color);
      floatNum(e.x + e.w / 2, e.y, String(dmg), "#fff6d0");
      sfx.hit();
      if (e.hp <= 0) killEnemy(e);
    }
    strikeBoss(box);
    player.biteActive -= 1;
  }

  function updateEnemies() {
    for (const e of enemies) {
      if (e.hurt > 0 && e.alive) e.hurt -= 1;
      if (!e.alive) {
        if (e.hurt > 0) e.hurt -= 1;
        continue;
      }
      e.t += 1;
      const dir = Math.sign(player.x + player.w / 2 - (e.x + e.w / 2)) || e.face;
      e.face = dir;
      if (e.kind === "flyer") {
        e.x += dir * e.speed;
        if (e.x < 2) e.x = 2;
        if (e.x + e.w > VW - 2) e.x = VW - 2 - e.w;
        e.y = e.base + Math.sin(e.t * 0.07 + e.base) * e.amp;
        continue;
      }
      e.vx = dir * e.speed;
      if (e.onGround && player.y + 10 < e.y && e.t % 95 === 0) e.vy = -3.35;
      e.vy += 0.2;
      if (e.vy > 4.8) e.vy = 4.8;
      e.x += e.vx;
      if (e.x < -40) e.x = -40;
      if (e.x > VW + 20) e.x = VW + 20;
      const prevFeet = e.y + e.h;
      e.y += e.vy;
      let landed = false;
      if (e.vy >= 0) {
        for (const p of PLATS) {
          if (
            prevFeet <= p.y + 0.1 &&
            e.y + e.h >= p.y &&
            e.x + e.w > p.x + 2 &&
            e.x < p.x + p.w - 2
          ) {
            e.y = p.y - e.h;
            e.vy = 0;
            landed = true;
            break;
          }
        }
        if (!landed && prevFeet <= GROUND + 0.1 && e.y + e.h >= GROUND) {
          e.y = GROUND - e.h;
          e.vy = 0;
          landed = true;
        }
      }
      e.onGround = landed;
    }
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (!a.alive || a.kind === "flyer") continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (!b.alive || b.kind === "flyer") continue;
        if (!overlap(a, b)) continue;
        const push = a.x <= b.x ? -0.45 : 0.45;
        a.x += push;
        b.x -= push;
      }
    }
    enemies = enemies.filter((e) => e.alive || e.hurt > 0);
  }

  function updateBoss() {
    if (!boss || !boss.alive) return;
    boss.t += 1;
    if (boss.hurt > 0 && boss.hurt < 900) boss.hurt -= 1;
    const px = player.x + player.w / 2;
    const bx = boss.x + boss.w / 2;
    if (boss.state !== "charge") boss.face = px < bx ? -1 : 1;

    if (boss.state === "intro") {
      if (boss.x > 210) boss.x -= 0.75;
    } else if (boss.state === "walk") {
      boss.x += boss.face * 0.36;
      boss.timer += 1;
      if (boss.timer > 120) {
        boss.timer = 0;
        boss.state = ATTACKS[boss.pattern % ATTACKS.length];
        boss.pattern += 1;
      }
    } else if (boss.state === "slamWind") {
      boss.timer += 1;
      if (boss.timer > 42) {
        boss.state = "slam";
        boss.timer = 0;
        spawnShock();
        shake = 7;
        sfx.slam();
      }
    } else if (boss.state === "slam") {
      boss.timer += 1;
      if (boss.timer > 28) {
        boss.state = "walk";
        boss.timer = 0;
      }
    } else if (boss.state === "chargeWind") {
      boss.timer += 1;
      if (boss.timer > 30) {
        boss.state = "charge";
        boss.timer = 0;
        sfx.charge();
      }
    } else if (boss.state === "charge") {
      boss.x += boss.face * 2.25;
      boss.timer += 1;
      if (boss.timer > 38) {
        boss.state = "walk";
        boss.timer = 0;
      }
    } else if (boss.state === "spit") {
      boss.timer += 1;
      if (boss.timer === 18) spawnRock();
      if (boss.timer > 36) {
        boss.state = "walk";
        boss.timer = 0;
      }
    }

    if (boss.x < 0) boss.x = 0;
    if (boss.x + boss.w > VW) boss.x = VW - boss.w;
    if (boss.state === "slamWind") boss.off = -12;
    else if (boss.state === "slam") boss.off = 4;
    else boss.off = 0;
  }

  function updateHazards() {
    for (const h of hazards) {
      h.life -= 1;
      if (h.kind === "shock") {
        h.x += h.vx;
        h.w += 1.5;
      } else {
        h.vy += 0.16;
        h.x += h.vx;
        h.y += h.vy;
        if (h.y + h.h > GROUND) {
          h.y = GROUND - h.h;
          h.vy *= -0.45;
          if (Math.abs(h.vy) < 0.55) h.life = 0;
        }
        if (h.x < -16 || h.x > VW + 16) h.life = 0;
      }
    }
    hazards = hazards.filter((h) => h.life > 0);
  }

  function updateContacts() {
    if (phase === "bossdie" || player.inv > 0 || mode !== "play") return;
    const box = playerHurtBox();
    for (const e of enemies) {
      if (!e.alive || e.hurt > 0) continue;
      if (overlap(box, e)) {
        hurtPlayer(e.x + e.w / 2);
        return;
      }
    }
    const touch = contactRect();
    if (touch && overlap(box, touch)) {
      hurtPlayer(boss.x + boss.w / 2);
      return;
    }
    for (const h of hazards) {
      if (h.hit || h.life <= 0) continue;
      if (overlap(box, h)) {
        if (h.kind === "shock") {
          h.hit = true;
          hurtPlayer(h.x + h.w / 2);
          return;
        }
        h.hit = true;
        h.life = 0;
        hurtPlayer(h.x);
        return;
      }
    }
  }

  function updatePhase() {
    if (phase === "announce") {
      announceT -= 1;
      if (announceT <= 0) {
        phase = "fight";
        setBanner("", "");
      }
      return;
    }
    if (phase === "fight") {
      const ready = [];
      const rest = [];
      for (const q of queue) {
        q.in -= 1;
        if (q.in <= 0) ready.push(q);
        else rest.push(q);
      }
      queue = rest;
      for (const q of ready) spawnEnemy(q.kind, q.index);
      const alive = enemies.some((e) => e.alive);
      if (queue.length === 0 && !alive) {
        if (wave < 3) {
          phase = "gap";
          gapT = 80;
          setBanner("ウェーブ " + wave + " クリア", "つぎにそなえろ");
          sfx.wave();
        } else {
          beginBoss();
        }
      }
      return;
    }
    if (phase === "gap") {
      gapT -= 1;
      if (gapT <= 0) beginWave(wave + 1);
      return;
    }
    if (phase === "bossintro") {
      introT -= 1;
      if (introT <= 0) {
        phase = "boss";
        if (boss) {
          boss.state = "walk";
          boss.timer = 0;
        }
        setBanner("", "");
      }
      return;
    }
    if (phase === "bossdie") {
      dieT -= 1;
      if (boss) boss.y += 0.7;
      if (dieT <= 0) win();
    }
  }

  function updateTimer() {
    if (phase !== "fight" && phase !== "boss") return;
    timeLeft -= 1 / 60;
    if (timeLeft <= 0) {
      timeLeft = 0;
      lose("time");
    }
  }

  function update() {
    frame += 1;
    readIntent();
    if (shake > 0) {
      shake *= 0.82;
      if (shake < 0.35) shake = 0;
    }
    if (mode !== "play") {
      updateParticles();
      updateFloats();
      return;
    }
    if (combo > 0 && frame - lastHit > COMBO_WINDOW) combo = 0;
    if (hitstop > 0) {
      hitstop -= 1;
      updateParticles();
      updateFloats();
      return;
    }
    updatePlayer();
    updateBite();
    updateEnemies();
    updateBoss();
    updateHazards();
    updateContacts();
    updateParticles();
    updateFloats();
    if (mode !== "play") return;
    updatePhase();
    if (mode !== "play") return;
    updateTimer();
  }

  function win() {
    if (mode !== "play") return;
    mode = "clear";
    kills += 1;
    setBanner("", "");
    stopDrone();
    sfx.clear();
    showEnd();
  }

  function lose(reason) {
    if (mode !== "play") return;
    mode = "over";
    overReason = reason;
    setBanner("", "");
    stopDrone();
    sfx.lose();
    showEnd();
  }

  function startGame() {
    if (lastStartFrame === frame && mode === "play") return;
    lastStartFrame = frame;
    stopDrone();
    player = makePlayer();
    enemies = [];
    queue = [];
    hazards = [];
    particles = [];
    floats = [];
    boss = null;
    combo = 0;
    maxCombo = 0;
    lastHit = -999;
    kills = 0;
    shake = 0;
    hitstop = 0;
    timeLeft = TIME_MAX;
    overReason = "";
    spawnFlip = 0;
    mode = "play";
    overlay.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    jumpPrev = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || pad.jump;
    beginWave(1);
    unlockAudio();
    syncHud();
  }

  function showTitle() {
    overlay.hidden = false;
    panel.innerHTML =
      "<h1>峡谷のキバ</h1>" +
      "<p class=\"lead\">横から見た 1 画面で、恐竜を動かして敵を倒す。</p>" +
      "<ul>" +
      "<li>← → または A D で移動</li>" +
      "<li>スペース / ↑ / W でジャンプ</li>" +
      "<li>Z / X / J でかみつき</li>" +
      "<li>当て続けるとコンボが増える</li>" +
      "<li>敵の波を 3 つ耐えるとボス。光る結晶が弱点</li>" +
      "</ul>" +
      "<button type=\"button\" class=\"primary\" id=\"btn-start\">はじめる</button>";
  }

  function showEnd() {
    overlay.hidden = false;
    const title = mode === "clear" ? "守りきった" : overReason === "time" ? "時間ぎれ" : "やられた";
    const lead = mode === "clear"
      ? "黒岩の王をたおした。"
      : overReason === "time"
        ? "残り時間がなくなった。"
        : "体力が尽きた。";
    panel.innerHTML =
      "<h1>" + title + "</h1>" +
      "<p class=\"lead\">" + lead + "</p>" +
      "<p class=\"stats\">倒した敵 " + kills + "<br>最大コンボ " + maxCombo + "<br>残り時間 " + fmt(timeLeft) + "</p>" +
      "<button type=\"button\" class=\"primary\" id=\"btn-retry\">もう一度</button>";
  }

  function syncHud() {
    hud.hidden = mode === "title";
    const hp = player ? player.hp : 5;
    hpEl.replaceChildren(document.createTextNode("体力"));
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement("span");
      pip.className = "pip" + (i < hp ? "" : " off");
      hpEl.appendChild(pip);
    }
    hpEl.setAttribute("aria-label", "体力 " + hp);
    timerEl.textContent = "残り " + fmt(timeLeft);
    timerEl.classList.toggle("warn", timeLeft <= 30 && mode === "play");
    if (phase === "boss" || phase === "bossintro" || phase === "bossdie") waveEl.textContent = "ボス";
    else waveEl.textContent = "ウェーブ " + wave + "/3";
    comboEl.textContent = "コンボ " + combo;
    comboEl.classList.toggle("hot", combo >= 2);
    if (combo > 0 && mode === "play") {
      chain.hidden = false;
      const left = Math.max(0, COMBO_WINDOW - (frame - lastHit));
      chainFill.style.width = (left / COMBO_WINDOW) * 100 + "%";
    } else {
      chain.hidden = true;
    }
    const showBoss = !!(boss && (phase === "boss" || phase === "bossintro" || phase === "bossdie"));
    bossbar.hidden = !showBoss;
    if (showBoss) bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + "%";
    banner.hidden = !bannerMain;
    bannerMainEl.textContent = bannerMain;
    bannerSubEl.textContent = bannerSub;
    btnLeft.classList.toggle("held", !!(intent.left));
    btnRight.classList.toggle("held", !!(intent.right));
    btnJump.classList.toggle("held", !!(intent.jump));
    btnBite.classList.toggle("held", !!(intent.bite));
  }

  function drawWorld() {
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, "#241447");
    sky.addColorStop(0.42, "#6a2e4e");
    sky.addColorStop(0.72, "#e07a3d");
    sky.addColorStop(1, "#ffc27a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);

    ctx.fillStyle = "#ffd27a";
    ctx.beginPath();
    ctx.arc(248, 40, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 210, 122, 0.28)";
    ctx.beginPath();
    ctx.arc(248, 40, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3a2344";
    ctx.beginPath();
    ctx.moveTo(0, 122);
    ctx.lineTo(0, 92);
    ctx.lineTo(34, 68);
    ctx.lineTo(72, 100);
    ctx.lineTo(112, 62);
    ctx.lineTo(156, 104);
    ctx.lineTo(156, 126);
    ctx.fill();

    ctx.fillStyle = "#4a2a38";
    ctx.beginPath();
    ctx.moveTo(150, 132);
    ctx.lineTo(188, 84);
    ctx.lineTo(228, 114);
    ctx.lineTo(266, 56);
    ctx.lineTo(312, 102);
    ctx.lineTo(320, 102);
    ctx.lineTo(320, 142);
    ctx.fill();

    ctx.fillStyle = "#5a3050";
    ctx.beginPath();
    ctx.moveTo(274, 128);
    ctx.lineTo(304, 78);
    ctx.lineTo(334, 128);
    ctx.fill();
    ctx.fillStyle = flickColor();
    ctx.beginPath();
    ctx.moveTo(298, 86);
    ctx.lineTo(304, 76);
    ctx.lineTo(310, 86);
    ctx.fill();

    const cx = (anim * 0.18) % 380 - 40;
    ctx.fillStyle = "rgba(255, 220, 190, 0.35)";
    ctx.fillRect(cx, 30, 30, 6);
    ctx.fillRect(cx + 8, 26, 16, 6);

    ctx.fillStyle = "#2a211c";
    ctx.fillRect(0, GROUND, VW, VH - GROUND);
    ctx.fillStyle = "#3f6b4a";
    ctx.fillRect(0, GROUND, VW, 3);
    ctx.fillStyle = "#3a3128";
    ctx.fillRect(10, GROUND + 8, 7, 3);
    ctx.fillRect(74, GROUND + 12, 11, 3);
    ctx.fillRect(168, GROUND + 7, 6, 3);
    ctx.fillRect(276, GROUND + 11, 9, 3);

    ctx.fillStyle = flickColor();
    ctx.fillRect(36, GROUND + 6, 16, 2);
    ctx.fillRect(48, GROUND + 8, 2, 4);
    ctx.fillRect(132, GROUND + 10, 24, 2);
    ctx.fillRect(232, GROUND + 7, 14, 2);

    ctx.fillStyle = "#2f6a45";
    ctx.fillRect(58, GROUND - 8, 2, 8);
    ctx.fillRect(56, GROUND - 6, 2, 2);
    ctx.fillRect(60, GROUND - 7, 2, 2);
    ctx.fillRect(196, GROUND - 11, 2, 11);
    ctx.fillRect(194, GROUND - 8, 2, 2);
    ctx.fillRect(198, GROUND - 6, 2, 2);

    for (const p of PLATS) {
      ctx.fillStyle = "#5c4638";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#c4a27a";
      ctx.fillRect(p.x, p.y, p.w, 2);
      ctx.fillStyle = "#3f6b4a";
      ctx.fillRect(p.x + 4, p.y - 2, 8, 2);
      ctx.fillRect(p.x + p.w - 18, p.y - 2, 7, 2);
    }
  }

  function flickColor() {
    return Math.floor(anim / 8) % 2 === 0 ? "#ff6b2c" : "#ffb15a";
  }

  function drawRaptor(x, y, face, walk, biting, blink, grounded) {
    if (blink) return;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (face < 0) {
      ctx.translate(20, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(2, 23, 16, 2);
    ctx.fillStyle = "#14584f";
    ctx.fillRect(-7, 12, 11, 4);
    ctx.fillStyle = "#2bb8a8";
    ctx.fillRect(-6, 13, 8, 2);
    ctx.fillStyle = "#14584f";
    ctx.fillRect(-8, 10, 3, 3);
    ctx.fillStyle = "#14584f";
    if (!grounded) {
      ctx.fillRect(4, 16, 3, 5);
      ctx.fillRect(11, 16, 3, 5);
    } else {
      const step = Math.floor(walk / 5) % 2;
      ctx.fillRect(3, 16, 4, step ? 8 : 5);
      ctx.fillRect(11, 16, 4, step ? 5 : 8);
    }
    ctx.fillStyle = "#14584f";
    ctx.fillRect(3, 7, 13, 12);
    ctx.fillStyle = "#3ecfb2";
    ctx.fillRect(4, 8, 11, 10);
    ctx.fillStyle = "#f3e2b8";
    ctx.fillRect(6, 12, 7, 5);
    ctx.fillStyle = "#14584f";
    ctx.fillRect(11, 1, 10, 9);
    ctx.fillStyle = "#3ecfb2";
    ctx.fillRect(12, 2, 8, 7);
    ctx.fillStyle = "#10211e";
    ctx.fillRect(17, 3, 2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(18, 3, 1, 1);
    ctx.fillStyle = "#f3e2b8";
    if (biting) {
      ctx.fillRect(18, 7, 7, 3);
      ctx.fillStyle = "#fffef8";
      ctx.fillRect(20, 7, 1, 1);
      ctx.fillRect(22, 7, 1, 1);
      ctx.fillRect(21, 9, 1, 1);
    } else {
      ctx.fillRect(18, 7, 3, 2);
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const blink = e.hurt > 0 && Math.floor(anim / 2) % 2 === 0;
    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(e.y));
    if (e.face < 0) {
      ctx.translate(e.w, 0);
      ctx.scale(-1, 1);
    }
    if (e.kind === "pebble") {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(2, e.h - 1, 12, 2);
      ctx.fillStyle = blink ? "#fff" : "#8a3e36";
      ctx.fillRect(1, 3, 14, 12);
      ctx.fillStyle = blink ? "#fff" : "#d4766a";
      ctx.fillRect(2, 4, 12, 10);
      ctx.fillStyle = blink ? "#fff" : "#f0b2a4";
      ctx.fillRect(4, 9, 7, 4);
      ctx.fillStyle = "#1a1210";
      ctx.fillRect(10, 6, 2, 2);
      ctx.fillStyle = "#14584f";
      ctx.fillRect(3, 14, 3, 2);
      ctx.fillRect(9, 14, 3, 2);
    } else if (e.kind === "flyer") {
      const flap = Math.floor(e.t / 4) % 2;
      ctx.fillStyle = blink ? "#fff" : "#c9a24a";
      ctx.fillRect(0, flap ? 0 : 3, 6, 3);
      ctx.fillRect(10, flap ? 0 : 3, 6, 3);
      ctx.fillStyle = blink ? "#fff" : "#f0d078";
      ctx.fillRect(4, 3, 8, 7);
      ctx.fillStyle = "#1a1210";
      ctx.fillRect(9, 5, 2, 2);
      ctx.fillStyle = blink ? "#fff" : "#fff0c2";
      ctx.fillRect(5, 7, 4, 2);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(2, e.h - 1, 18, 2);
      ctx.fillStyle = blink ? "#fff" : "#3e5560";
      ctx.fillRect(1, 3, 20, 14);
      ctx.fillStyle = blink ? "#fff" : "#7f9aa6";
      ctx.fillRect(2, 4, 18, 10);
      ctx.fillStyle = blink ? "#fff" : "#d5e4ea";
      ctx.fillRect(4, 5, 14, 3);
      ctx.fillStyle = "#1a1210";
      ctx.fillRect(14, 8, 2, 2);
      ctx.fillStyle = "#3e5560";
      ctx.fillRect(4, 14, 4, 3);
      ctx.fillRect(12, 14, 4, 3);
      for (let i = 0; i < (e.maxHp || 3); i++) {
        ctx.fillStyle = i < e.hp ? "#ffd27a" : "#24343c";
        ctx.fillRect(4 + i * 5, 1, 4, 2);
      }
    }
    ctx.restore();
  }

  function drawBoss() {
    const b = bodyRect();
    const blink = boss.hurt > 0 && boss.hurt < 900 && Math.floor(anim / 2) % 2 === 0;
    ctx.save();
    ctx.translate(Math.round(b.x), Math.round(b.y));
    if (boss.face < 0) {
      ctx.translate(b.w, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = "#2a262e";
    ctx.fillRect(0, 22, 20, 8);
    ctx.fillStyle = "#3a353f";
    ctx.fillRect(2, 24, 16, 4);
    ctx.fillStyle = "#2a262e";
    ctx.fillRect(18, 32, 12, 14);
    ctx.fillRect(14, 44, 16, 6);
    const step = boss.state === "walk" && Math.floor(boss.t / 8) % 2 ? 4 : 0;
    ctx.fillRect(48 + step, 32, 12, 14);
    ctx.fillRect(44 + step, 44, 18, 6);
    ctx.fillStyle = "#2a262e";
    ctx.fillRect(16, 12, 56, 28);
    ctx.fillStyle = "#3a353f";
    ctx.fillRect(18, 14, 52, 24);
    ctx.fillStyle = "#6b5348";
    ctx.fillRect(30, 24, 26, 12);
    ctx.fillStyle = "#2a262e";
    ctx.fillRect(54, 20, 12, 5);
    ctx.fillStyle = "#2a262e";
    ctx.fillRect(52, 0, 34, 20);
    ctx.fillStyle = "#3a353f";
    ctx.fillRect(54, 2, 30, 16);
    const wind = boss.state === "slamWind" || boss.state === "chargeWind";
    ctx.fillStyle = wind ? "#fff6d0" : "#ffd166";
    ctx.fillRect(74, 5, 6, 5);
    ctx.fillStyle = "#1a1210";
    ctx.fillRect(77, 7, 2, 2);
    ctx.fillStyle = "#6b5348";
    ctx.fillRect(66, 13, 20, 6);
    ctx.fillStyle = "#fff8ea";
    ctx.fillRect(76, 13, 2, 2);
    ctx.fillRect(80, 13, 2, 2);
    ctx.fillRect(78, 16, 2, 2);
    if (wind) {
      ctx.fillStyle = "rgba(255, 80, 60, 0.28)";
      ctx.fillRect(18, 14, 52, 24);
    }
    if (blink) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(0, 0, b.w, b.h);
    }
    ctx.restore();

    const g = crystalBox();
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(anim * 0.18));
    ctx.fillStyle = "#10281f";
    ctx.fillRect(g.x - 2, g.y - 2, g.w + 4, g.h + 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "#eafff3";
    ctx.fillRect(g.x - 1, g.y - 1, g.w + 2, g.h + 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#7dffa8";
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = "#f4fff8";
    ctx.fillRect(g.x + 3, g.y + 3, 4, 4);
  }

  function drawHazard(h) {
    if (h.kind === "shock") {
      ctx.fillStyle = "rgba(255, 170, 70, 0.9)";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = "#fff1c2";
      ctx.fillRect(h.x, h.y, h.w, 2);
    } else {
      ctx.fillStyle = "#6b5344";
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = "#ead7b8";
      ctx.fillRect(h.x + 1, h.y + 1, 3, 2);
    }
  }

  function drawTitleLife() {
    const bob = Math.sin(anim * 0.06) * 2;
    const chomp = Math.floor(anim / 36) % 6 === 0;
    drawRaptor(64, GROUND - 24 + bob, 1, anim, chomp, false, true);
    drawEnemy({
      kind: "pebble",
      x: 196 + Math.sin(anim * 0.025) * 28,
      y: GROUND - 16,
      w: 16,
      h: 16,
      face: Math.cos(anim * 0.025) > 0 ? -1 : 1,
      t: anim,
      hurt: 0,
      alive: true,
    });
    drawEnemy({
      kind: "flyer",
      x: 140 + Math.sin(anim * 0.04) * 16,
      y: 96 + Math.sin(anim * 0.05) * 6,
      w: 16,
      h: 12,
      face: 1,
      t: anim,
      hurt: 0,
      alive: true,
    });
  }

  function draw() {
    anim += 1;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    if (shake > 0 && !reduceMotion) {
      const sx = (anim % 2 === 0 ? 1 : -1) * shake * 0.45;
      const sy = (anim % 3 === 0 ? 1 : -1) * shake * 0.3;
      ctx.translate(sx, sy);
    }
    drawWorld();
    for (const h of hazards) drawHazard(h);
    for (const e of enemies) drawEnemy(e);
    if (boss) drawBoss();
    if (mode === "title") drawTitleLife();
    else if (player) {
      const blink = player.inv > 0 && Math.floor(frame / 4) % 2 === 0;
      drawRaptor(player.x, player.y, player.face, player.walk, player.biteActive > 0, blink, player.onGround);
      if (player.biteActive > 0) {
        const b = biteBox();
        ctx.fillStyle = "rgba(255, 236, 180, 0.45)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    }
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 16);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (const f of floats) {
      ctx.globalAlpha = Math.max(0, f.life / 30);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    syncHud();
  }

  function fit() {
    const stage = document.getElementById("stage");
    const scale = Math.min(stage.clientWidth / VW, stage.clientHeight / VH);
    view.style.width = Math.max(1, Math.floor(VW * scale)) + "px";
    view.style.height = Math.max(1, Math.floor(VH * scale)) + "px";
  }

  function loop(ts) {
    const dt = Math.min(34, lastTs ? ts - lastTs : 16);
    lastTs = ts;
    if (!paused) {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard < 5) {
        update();
        acc -= STEP;
        guard += 1;
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function bindHold(btn, name) {
    const down = (e) => {
      e.preventDefault();
      pad[name] = true;
      unlockAudio();
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    };
    const up = () => {
      pad[name] = false;
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }

  panel.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (id === "btn-start" || id === "btn-retry") startGame();
  });

  btnSound.addEventListener("click", (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    btnSound.textContent = soundOn ? "音オン" : "音オフ";
    btnSound.setAttribute("aria-pressed", soundOn ? "true" : "false");
    if (!soundOn) stopDrone();
    else unlockAudio();
  });

  window.addEventListener("keydown", (e) => {
    const block = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyZ", "KeyX", "KeyJ", "KeyK", "Enter", "KeyR"];
    if (block.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    unlockAudio();
    if (mode !== "play") {
      if (e.code === "Enter" || e.code === "Space" || e.code === "KeyZ") startGame();
      else if (e.code === "KeyR" && mode !== "title") startGame();
      return;
    }
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    pad.left = false;
    pad.right = false;
    pad.jump = false;
    pad.bite = false;
  });
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  bindHold(btnLeft, "left");
  bindHold(btnRight, "right");
  bindHold(btnJump, "jump");
  bindHold(btnBite, "bite");

  function snapshot() {
    return {
      mode: mode,
      phase: phase,
      wave: wave,
      hp: player ? player.hp : 0,
      time: timeLeft,
      combo: combo,
      maxCombo: maxCombo,
      kills: kills,
      x: player ? player.x : 0,
      y: player ? player.y : 0,
      face: player ? player.face : 1,
      onGround: player ? !!player.onGround : false,
      enemies: enemies.filter((e) => e.alive).map((e) => ({
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        hp: e.hp,
      })),
      boss: boss
        ? {
          hp: boss.hp,
          x: boss.x,
          y: boss.y,
          w: boss.w,
          h: boss.h,
          state: boss.state,
          alive: boss.alive,
          face: boss.face,
        }
        : null,
      crystal: boss ? crystalBox() : null,
      overReason: overReason,
    };
  }

  window.__KIBA = { getState: snapshot };
  if (DEBUG) {
    Object.assign(window.__KIBA, {
      freeze() { paused = true; },
      unfreeze() { paused = false; },
      setHold(h) {
        pad.left = !!(h && h.left);
        pad.right = !!(h && h.right);
        pad.jump = !!(h && h.jump);
        pad.bite = !!(h && h.bite);
      },
      step(n) {
        for (let i = 0; i < n; i++) update();
        draw();
      },
      start() { startGame(); },
      setPlayer(x, y, face) {
        player.x = x;
        player.y = y;
        player.vx = 0;
        player.vy = 0;
        if (face) player.face = face;
      },
      gotoBoss() {
        if (mode !== "play") startGame();
        enemies = [];
        queue = [];
        hazards = [];
        beginBoss();
        boss.x = 200;
        boss.state = "walk";
        boss.timer = 0;
        phase = "boss";
        setBanner("", "");
        draw();
      },
      slay() {
        for (const e of enemies) {
          if (e.alive) {
            e.hp = 0;
            killEnemy(e);
          }
        }
        queue = [];
      },
      god(on) { god = on !== false; if (god) player.hp = 5; },
      setTime(s) { timeLeft = s; },
      hurt(n) {
        for (let i = 0; i < n; i++) {
          player.inv = 0;
          hurtPlayer(player.x + 80);
        }
        draw();
      },
    });
  }

  player = makePlayer();
  showTitle();
  fit();
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.getElementById("stage"));
  else window.addEventListener("resize", fit);
  requestAnimationFrame(loop);
})();
