'use strict';

(() => {
  const LAPS = 3;
  const ROAD_HALF = 158;
  const WALL = ROAD_HALF - 20;
  const KART_R = 20;
  const ITEM_NAMES = {
    meat: 'にく',
    bite: 'かみつき',
    tail: 'しっぽ',
    bone: 'ほねよろい',
  };

  const view = document.getElementById('view');
  const ctx = view.getContext('2d');
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  const result = document.getElementById('result');
  const countdownEl = document.getElementById('countdown');
  const pads = document.querySelectorAll('.pad');
  const hint = document.getElementById('hint');

  const ui = {
    rank: document.getElementById('rank-num'),
    totalKarts: document.getElementById('rank-total'),
    lap: document.getElementById('lap'),
    order: document.getElementById('order'),
    time: document.getElementById('time'),
    total: document.getElementById('total'),
    best: document.getElementById('best'),
    item: document.getElementById('item'),
    drift: document.getElementById('drift'),
    driftFill: document.getElementById('drift-fill'),
    toast: document.getElementById('toast'),
    mute: document.getElementById('mute'),
  };

  const keys = new Set();
  const held = { left: false, right: false, accel: false, drift: false, item: false };
  let itemWasDown = false;
  let muted = false;
  let bestLap = null;
  let toastTimer = 0;
  let hintTimer = 6;
  let shake = 0;
  let raceClock = 0;
  let countLeft = 0;
  let countShown = '';
  let resultTimer = 0;
  let state = 'title';
  let camX = 0;
  let camY = 0;
  let dpr = 1;
  let scripted = null;

  const track = buildTrack();
  let karts = [];
  let boxes = [];
  let bites = [];
  let tails = [];
  let sparks = [];
  let skids = [];
  const map = renderMap(track);

  const sfx = createSfx();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function normAng(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function fmt(t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t % 1) * 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }

  function buildTrack() {
    const controls = [];
    const count = 32;
    const rx = 1500;
    const ry = 980;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const ct = Math.cos(t);
      const st = Math.sin(t);
      const p = 2.15;
      let x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p) * rx;
      let y = Math.sign(st) * Math.pow(Math.abs(st), 2 / p) * ry;
      const wobble = Math.sin(t * 3) * 120;
      x += Math.cos(t) * wobble;
      y += Math.sin(t) * wobble;
      controls.push({ x, y });
    }
    const per = 14;
    const samples = [];
    const n = controls.length;
    for (let i = 0; i < n; i++) {
      const p0 = controls[(i - 1 + n) % n];
      const p1 = controls[i];
      const p2 = controls[(i + 1) % n];
      const p3 = controls[(i + 2) % n];
      for (let s = 0; s < per; s++) {
        const t = s / per;
        const t2 = t * t;
        const t3 = t2 * t;
        samples.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    const N = samples.length;
    const tangents = [];
    const normals = [];
    const arc = [];
    arc[0] = 0;
    for (let i = 0; i < N; i++) {
      const prev = samples[(i - 1 + N) % N];
      const next = samples[(i + 1) % N];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tangents.push({ x: tx / len, y: ty / len });
      normals.push({ x: -ty / len, y: tx / len });
      if (i > 0) {
        arc[i] = arc[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
      }
    }
    const closing = Math.hypot(samples[0].x - samples[N - 1].x, samples[0].y - samples[N - 1].y);
    const length = arc[N - 1] + closing;
    const curv = samples.map((_, i) => Math.abs(normAng(Math.atan2(tangents[(i + 6) % N].y, tangents[(i + 6) % N].x) - Math.atan2(tangents[i].y, tangents[i].x))));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of samples) {
      minX = Math.min(minX, p.x - ROAD_HALF - 80);
      maxX = Math.max(maxX, p.x + ROAD_HALF + 80);
      minY = Math.min(minY, p.y - ROAD_HALF - 80);
      maxY = Math.max(maxY, p.y + ROAD_HALF + 80);
    }
    return { samples, tangents, normals, arc, length, curv, N, minX, minY, maxX, maxY };
  }

  function sampleIndexAt(dist) {
    const { arc, N, length } = track;
    let d = ((dist % length) + length) % length;
    let lo = 0;
    let hi = N - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (arc[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function poseAt(index, side) {
    const i = ((index % track.N) + track.N) % track.N;
    const p = track.samples[i];
    const nr = track.normals[i];
    const tg = track.tangents[i];
    return {
      x: p.x + nr.x * side,
      y: p.y + nr.y * side,
      heading: Math.atan2(tg.y, tg.x),
      along: track.arc[i],
      sample: i,
    };
  }

  function locate(x, y, hint) {
    const { samples, arc, N, length } = track;
    let bestD = Infinity;
    let bestI = hint || 0;
    let bestT = 0;
    const full = hint == null;
    const span = full ? N : 48;
    const start = full ? 0 : hint - 24;
    for (let k = 0; k < span; k++) {
      const i = ((start + k) % N + N) % N;
      const j = (i + 1) % N;
      const ax = samples[i].x;
      const ay = samples[i].y;
      const abx = samples[j].x - ax;
      const aby = samples[j].y - ay;
      const ab2 = abx * abx + aby * aby || 1;
      let t = ((x - ax) * abx + (y - ay) * aby) / ab2;
      t = clamp(t, 0, 1);
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 < bestD) {
        bestD = d2;
        bestI = i;
        bestT = t;
      }
    }
    if (!full && bestD > 220 * 220) return locate(x, y, null);
    const j = (bestI + 1) % N;
    const seg = Math.hypot(samples[j].x - samples[bestI].x, samples[j].y - samples[bestI].y);
    let along = arc[bestI] + bestT * seg;
    if (along >= length) along -= length;
    const cx = samples[bestI].x + (samples[j].x - samples[bestI].x) * bestT;
    const cy = samples[bestI].y + (samples[j].y - samples[bestI].y) * bestT;
    return { index: bestI, along, dist: Math.sqrt(bestD), cx, cy };
  }

  function renderMap(tr) {
    const pad = 70;
    const w = Math.ceil(tr.maxX - tr.minX + pad * 2);
    const h = Math.ceil(tr.maxY - tr.minY + pad * 2);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const ox = -tr.minX + pad;
    const oy = -tr.minY + pad;
    const X = (p) => p.x + ox;
    const Y = (p) => p.y + oy;

    g.fillStyle = '#4f9a3c';
    g.fillRect(0, 0, w, h);
    const rnd = mulberry32(20261115);
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      g.fillStyle = rnd() > 0.5 ? '#63b24a' : '#3e8730';
      g.fillRect(x, y, 3 + rnd() * 5, 2 + rnd() * 3);
    }

    const pondFar = tr.samples.reduce((m, p) => Math.min(m, Math.hypot(p.x, p.y)), Infinity);
    if (pondFar > ROAD_HALF + 160) {
      g.fillStyle = '#8fd0e0';
      g.beginPath();
      g.ellipse(ox, oy, 150, 100, 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.ellipse(ox - 30, oy - 20, 40, 16, -0.4, 0, Math.PI * 2);
      g.fill();
    }

    function strokeRoad(width, color) {
      g.beginPath();
      const left = [];
      const right = [];
      for (let i = 0; i < tr.N; i++) {
        const p = tr.samples[i];
        const nr = tr.normals[i];
        left.push({ x: p.x + nr.x * width, y: p.y + nr.y * width });
        right.push({ x: p.x - nr.x * width, y: p.y - nr.y * width });
      }
      g.moveTo(X(left[0]), Y(left[0]));
      for (let i = 1; i < left.length; i++) g.lineTo(X(left[i]), Y(left[i]));
      for (let i = right.length - 1; i >= 0; i--) g.lineTo(X(right[i]), Y(right[i]));
      g.closePath();
      g.fillStyle = color;
      g.fill();
    }
    strokeRoad(ROAD_HALF + 28, '#c6a36a');
    strokeRoad(ROAD_HALF, '#5e6672');
    strokeRoad(ROAD_HALF - 18, '#6b7380');

    g.lineCap = 'butt';
    for (let i = 0; i < tr.N; i += 2) {
      if (tr.curv[i] < 0.22) continue;
      const p = tr.samples[i];
      const nr = tr.normals[i];
      const tg = tr.tangents[i];
      for (const side of [1, -1]) {
        const cx = p.x + nr.x * side * (ROAD_HALF - 10);
        const cy = p.y + nr.y * side * (ROAD_HALF - 10);
        g.fillStyle = ((i / 2) % 2 === 0) ? '#f03e3e' : '#fff';
        g.save();
        g.translate(cx + ox, cy + oy);
        g.rotate(Math.atan2(tg.y, tg.x));
        g.fillRect(-8, -7, 16, 14);
        g.restore();
      }
    }

    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i < tr.N; i++) {
      const p = tr.samples[i];
      const nr = tr.normals[i];
      const a = { x: p.x + nr.x * (ROAD_HALF - 8), y: p.y + nr.y * (ROAD_HALF - 8) };
      const b = { x: p.x - nr.x * (ROAD_HALF - 8), y: p.y - nr.y * (ROAD_HALF - 8) };
      if (i === 0) {
        g.moveTo(X(a), Y(a));
      }
      g.lineTo(X(a), Y(a));
      if (i === tr.N - 1) g.lineTo(X({ x: tr.samples[0].x + tr.normals[0].x * (ROAD_HALF - 8), y: tr.samples[0].y + tr.normals[0].y * (ROAD_HALF - 8) }), Y({ x: tr.samples[0].x + tr.normals[0].x * (ROAD_HALF - 8), y: tr.samples[0].y + tr.normals[0].y * (ROAD_HALF - 8) }));
    }
    g.stroke();
    g.beginPath();
    for (let i = 0; i < tr.N; i++) {
      const p = tr.samples[i];
      const nr = tr.normals[i];
      const b = { x: p.x - nr.x * (ROAD_HALF - 8), y: p.y - nr.y * (ROAD_HALF - 8) };
      if (i === 0) g.moveTo(X(b), Y(b));
      g.lineTo(X(b), Y(b));
    }
    g.closePath();
    g.stroke();

    g.strokeStyle = '#f2c14e';
    g.lineWidth = 4;
    g.setLineDash([18, 16]);
    g.beginPath();
    tr.samples.forEach((p, i) => {
      if (i === 0) g.moveTo(X(p), Y(p));
      else g.lineTo(X(p), Y(p));
    });
    g.closePath();
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < tr.N; i += 28) {
      const p = tr.samples[i];
      const tg = tr.tangents[i];
      g.save();
      g.translate(p.x + ox, p.y + oy);
      g.rotate(Math.atan2(tg.y, tg.x));
      g.beginPath();
      g.moveTo(16, 0);
      g.lineTo(-8, 8);
      g.lineTo(-8, -8);
      g.closePath();
      g.fill();
      g.restore();
    }

    const p0 = tr.samples[0];
    const n0 = tr.normals[0];
    g.strokeStyle = '#fff';
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(p0.x + n0.x * ROAD_HALF + ox, p0.y + n0.y * ROAD_HALF + oy);
    g.lineTo(p0.x - n0.x * ROAD_HALF + ox, p0.y - n0.y * ROAD_HALF + oy);
    g.stroke();
    g.strokeStyle = '#161616';
    g.setLineDash([16, 16]);
    g.stroke();
    g.setLineDash([]);

    g.fillStyle = '#fff8ee';
    g.font = '700 28px "Yu Gothic", Meiryo, sans-serif';
    g.textAlign = 'center';
    g.save();
    g.translate(p0.x + tr.tangents[0].x * 46 + ox, p0.y + tr.tangents[0].y * 46 + oy);
    g.rotate(Math.atan2(tr.tangents[0].y, tr.tangents[0].x));
    g.fillText('スタート', 0, 8);
    g.restore();

    for (let i = 0; i < tr.N; i += 18) {
      const p = tr.samples[i];
      const nr = tr.normals[i];
      const side = i % 36 === 0 ? 1 : -1;
      const dist = ROAD_HALF + 48 + (i % 5) * 8;
      const x = p.x + nr.x * side * dist + ox;
      const y = p.y + nr.y * side * dist + oy;
      g.fillStyle = '#2b6b28';
      g.beginPath();
      g.arc(x, y, 16 + (i % 3) * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6d4c41';
      g.fillRect(x - 2, y + 6, 4, 10);
    }

    return { canvas: c, ox, oy };
  }

  function makeKarts() {
    const specs = [
      { isPlayer: true, name: 'ティラノ', kind: 'rex', color: '#e03131', belly: '#ffd3d3', kart: '#a51111', accent: '#ffd43b', maxSpeed: 336, accelPower: 255, handling: 2.6, index: 26, side: -52 },
      { isPlayer: false, name: 'トリケラ', kind: 'trike', color: '#2f9e44', belly: '#d8f5d0', kart: '#237032', accent: '#d8f5a2', maxSpeed: 318, accelPower: 228, handling: 2.32, index: 26, side: 52 },
      { isPlayer: false, name: 'ステゴ', kind: 'stego', color: '#f08c00', belly: '#fff3bf', kart: '#d9480f', accent: '#ffe066', maxSpeed: 324, accelPower: 206, handling: 2.18, index: 8, side: -52 },
      { isPlayer: false, name: 'ラプトル', kind: 'raptor', color: '#4263eb', belly: '#dbe4ff', kart: '#364fc7', accent: '#bac8ff', maxSpeed: 330, accelPower: 214, handling: 2.58, index: 8, side: 52 },
    ];
    return specs.map((s) => {
      const pose = poseAt(s.index, s.side);
      return {
        ...s,
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        speed: 0,
        slip: 0,
        along: pose.along,
        prevAlong: pose.along,
        sampleHint: pose.sample,
        roadDist: 0,
        lap: 0,
        lapStart: 0,
        laps: [],
        finished: false,
        finishTime: 0,
        driftCharge: 0,
        driftHeld: false,
        drifting: false,
        boost: 0,
        item: null,
        shield: false,
        stun: 0,
        spin: 0,
        invuln: 0,
        itemWait: 0.8 + Math.random(),
        bob: Math.random() * Math.PI * 2,
        input: { accel: false, brake: false, steer: 0, drift: false, use: false },
      };
    });
  }

  function layoutBoxes() {
    const fracs = [0.16, 0.31, 0.46, 0.6, 0.73, 0.86];
    return fracs.map((f, n) => {
      const i = sampleIndexAt(f * track.length);
      const side = (n % 2 === 0 ? 1 : -1) * 64;
      const p = track.samples[i];
      const nr = track.normals[i];
      return {
        x: p.x + nr.x * side,
        y: p.y + nr.y * side,
        alive: true,
        respawn: 0,
      };
    });
  }

  function resetRace() {
    karts = makeKarts();
    boxes = layoutBoxes();
    bites = [];
    tails = [];
    sparks = [];
    skids = [];
    raceClock = 0;
    const player = karts[0];
    camX = player.x;
    camY = player.y;
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('on');
    toastTimer = 0.9;
  }

  function progressOf(k) {
    return k.finished ? 100 + (100000 - k.finishTime) : k.lap * track.length + k.along;
  }

  function compareKart(a, b) {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return (b.lap * track.length + b.along) - (a.lap * track.length + a.along);
  }

  function readPlayerInput() {
    if (scripted) return { ...scripted, use: !!scripted.use };
    const left = keys.has('arrowleft') || keys.has('a') || held.left;
    const right = keys.has('arrowright') || keys.has('d') || held.right;
    const accel = keys.has('arrowup') || keys.has('w') || held.accel;
    const brake = keys.has('arrowdown') || keys.has('s');
    const drift = keys.has(' ') || keys.has('shift') || held.drift;
    const itemDown = keys.has('z') || keys.has('e') || held.item;
    const use = itemDown && !itemWasDown;
    itemWasDown = itemDown;
    let steer = 0;
    if (left && !right) steer = -1;
    else if (right && !left) steer = 1;
    return { accel, brake, steer, drift, use };
  }

  function someoneAhead(kart, range) {
    let best = null;
    let bestGap = range;
    const mine = kart.lap * track.length + kart.along;
    for (const other of karts) {
      if (other === kart || other.finished) continue;
      let gap = (other.lap * track.length + other.along) - mine;
      if (gap < 0) gap += LAPS * track.length;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = other;
      }
    }
    return best;
  }

  function driveAi(kart, dt) {
    const hint = kart.sampleHint || 0;
    const look = track.samples[(hint + 10) % track.N];
    const far = track.samples[(hint + 22) % track.N];
    const desired = Math.atan2(look.y - kart.y, look.x - kart.x);
    const farAng = Math.atan2(far.y - kart.y, far.x - kart.x);
    const diff = normAng(desired - kart.heading);
    const sharp = Math.abs(normAng(farAng - kart.heading));
    let steer = clamp(diff / 0.42, -1, 1);
    const mid = track.samples[hint];
    const nr = track.normals[hint];
    const side = (kart.x - mid.x) * nr.x + (kart.y - mid.y) * nr.y;
    if (Math.abs(side) > 46) steer = clamp(steer - clamp(side / 80, -1, 1), -1, 1);
    const wantDrift = sharp > 0.98 && Math.abs(side) < 64 && kart.speed > 200 && Math.abs(steer) > 0.34 && kart.boost <= 0;
    const drift = kart.driftCharge > 0.72 ? false : wantDrift;
    let use = false;
    kart.itemWait -= dt;
    if (kart.item && kart.itemWait <= 0 && kart.stun <= 0) {
      const ahead = someoneAhead(kart, 700);
      const holdBite = kart.item === 'bite' && !ahead && kart.itemWait > -1.4;
      if (!holdBite) {
        use = true;
        kart.itemWait = 2.2 + Math.random() * 1.6;
      }
    }
    kart.input = {
      accel: sharp > 1.3 && kart.speed > 250 ? false : true,
      brake: false,
      steer,
      drift,
      use,
    };
  }

  function smack(kart) {
    if (kart.shield) {
      kart.shield = false;
      showToast(kart.isPlayer ? 'ガード' : '');
      sfx.guard();
      return;
    }
    if (kart.invuln > 0) return;
    kart.speed *= 0.32;
    kart.stun = 0.55;
    kart.spin = (Math.random() < 0.5 ? -1 : 1) * 8;
    kart.invuln = 0.85;
    kart.driftCharge = 0;
    kart.driftHeld = false;
    if (kart.isPlayer) {
      shake = 7;
      showToast('いたっ');
    }
    sfx.hit();
  }

  function useItem(kart) {
    if (!kart.item || kart.stun > 0) return;
    const kind = kart.item;
    kart.item = null;
    if (kind === 'meat') {
      kart.boost = Math.max(kart.boost, 0.85);
      kart.speed = Math.max(kart.speed, kart.maxSpeed * 0.9);
      if (kart.isPlayer) showToast('ブースト!');
      sfx.boost();
    } else if (kind === 'bite') {
      const target = someoneAhead(kart, 5000);
      bites.push({
        x: kart.x + Math.cos(kart.heading) * 28,
        y: kart.y + Math.sin(kart.heading) * 28,
        ang: kart.heading,
        life: 2.3,
        owner: kart,
        target,
      });
      sfx.shoot();
    } else if (kind === 'tail') {
      const side = Math.random() < 0.5 ? 32 : -32;
      const px = -Math.sin(kart.heading);
      const py = Math.cos(kart.heading);
      tails.push({
        x: kart.x - Math.cos(kart.heading) * 40 + px * side,
        y: kart.y - Math.sin(kart.heading) * 40 + py * side,
        life: 8,
        owner: kart,
        grace: 0.45,
      });
      sfx.drop();
    } else if (kind === 'bone') {
      kart.shield = true;
      if (kart.isPlayer) showToast('よろい');
      sfx.guard();
    }
  }

  function giveBoost(kart) {
    const c = kart.driftCharge;
    const dur = c >= 1.25 ? 0.95 : c >= 0.85 ? 0.62 : 0.4;
    kart.boost = Math.max(kart.boost, dur);
    kart.speed = Math.min(kart.maxSpeed * 1.34, Math.max(kart.speed, kart.speed + 70));
    if (kart.isPlayer) showToast('ブースト!');
    sfx.boost();
    for (let i = 0; i < 10; i++) {
      sparks.push({
        x: kart.x,
        y: kart.y,
        vx: -Math.cos(kart.heading) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 40,
        vy: -Math.sin(kart.heading) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 40,
        life: 0.35,
        color: '#ffe066',
        size: 3 + Math.random() * 3,
      });
    }
  }

  function moveKart(kart, dt) {
    const inp = kart.input;
    if (kart.stun > 0) {
      kart.stun -= dt;
      kart.heading += kart.spin * dt;
      kart.spin *= Math.pow(0.08, dt);
    }
    const canDrift = inp.drift && kart.speed > 95 && Math.abs(inp.steer) > 0.12 && kart.stun <= 0;
    kart.drifting = canDrift;

    let cap = kart.maxSpeed;
    if (kart.boost > 0) {
      kart.boost -= dt;
      cap = kart.maxSpeed * 1.32;
    }
    if (inp.accel && kart.stun <= 0) {
      const power = kart.boost > 0 ? kart.accelPower * 1.35 : kart.accelPower;
      kart.speed = Math.min(cap, kart.speed + power * dt);
    } else {
      kart.speed = Math.max(0, kart.speed - 150 * dt);
    }
    if (inp.brake && kart.stun <= 0) kart.speed = Math.max(0, kart.speed - 280 * dt);
    if (canDrift) kart.speed = Math.max(0, kart.speed - 36 * dt);
    if (kart.speed > cap) kart.speed = Math.max(cap, kart.speed - 380 * dt);

    const speedFactor = clamp(kart.speed / 150, 0.3, 1);
    const turn = kart.handling * (canDrift ? 1.5 : 1) * inp.steer * speedFactor * (kart.stun > 0 ? 0.35 : 1);
    kart.heading += turn * dt;
    const slipTarget = canDrift ? -inp.steer * 0.62 : 0;
    const slipK = 1 - Math.exp(-(canDrift ? 7 : 11) * dt);
    kart.slip += (slipTarget - kart.slip) * slipK;

    if (canDrift) {
      kart.driftCharge = Math.min(1.5, kart.driftCharge + dt);
      kart.driftHeld = true;
    } else if (kart.driftHeld) {
      if (kart.driftCharge >= 0.55) giveBoost(kart);
      kart.driftCharge = 0;
      kart.driftHeld = false;
    }

    const move = kart.heading + kart.slip;
    kart.x += Math.cos(move) * kart.speed * dt;
    kart.y += Math.sin(move) * kart.speed * dt;

    if (canDrift && kart.speed > 80) {
      const wx = Math.cos(kart.heading + Math.PI / 2);
      const wy = Math.sin(kart.heading + Math.PI / 2);
      for (const side of [-12, 12]) {
        skids.push({
          x: kart.x + wx * side,
          y: kart.y + wy * side,
          life: 1.3,
        });
      }
      if (skids.length > 360) skids.splice(0, skids.length - 360);
      if (Math.random() < 0.7) {
        const hue = kart.driftCharge > 1.2 ? '#ff922b' : kart.driftCharge > 0.8 ? '#ffd43b' : '#d0ebff';
        sparks.push({
          x: kart.x - Math.cos(kart.heading) * 16,
          y: kart.y - Math.sin(kart.heading) * 16,
          vx: -Math.cos(kart.heading) * 30 + (Math.random() - 0.5) * 50,
          vy: -Math.sin(kart.heading) * 30 + (Math.random() - 0.5) * 50,
          life: 0.28,
          color: hue,
          size: 2 + Math.random() * 2,
        });
      }
    }
    if (kart.boost > 0 && Math.random() < 0.8) {
      sparks.push({
        x: kart.x - Math.cos(kart.heading) * 18,
        y: kart.y - Math.sin(kart.heading) * 18,
        vx: -Math.cos(kart.heading) * 90,
        vy: -Math.sin(kart.heading) * 90,
        life: 0.2,
        color: '#fff3bf',
        size: 3,
      });
    }
  }

  function keepOnRoad(kart, dt) {
    const loc = locate(kart.x, kart.y, kart.sampleHint);
    kart.sampleHint = loc.index;
    kart.roadDist = loc.dist;
    if (loc.dist > WALL) {
      const dx = kart.x - loc.cx;
      const dy = kart.y - loc.cy;
      const d = loc.dist || 1;
      kart.x = loc.cx + (dx / d) * WALL;
      kart.y = loc.cy + (dy / d) * WALL;
      kart.speed *= Math.pow(0.45, dt);
      kart.sampleHint = loc.index;
    }
    return locate(kart.x, kart.y, kart.sampleHint);
  }

  function applyProgress(kart, loc) {
    if (kart.finished) return;
    const prev = kart.along;
    let delta = loc.along - prev;
    if (delta > track.length / 2) delta -= track.length;
    if (delta < -track.length / 2) delta += track.length;
    kart.prevAlong = prev;
    kart.along = loc.along;
    const forwardCross = prev > track.length * 0.72 && loc.along < track.length * 0.28 && delta > 0;
    const backCross = prev < track.length * 0.28 && loc.along > track.length * 0.72 && delta < 0;
    if (forwardCross) {
      const lapTime = raceClock - kart.lapStart;
      kart.lap += 1;
      kart.lapStart = raceClock;
      if (kart.isPlayer && kart.lap <= LAPS) {
        kart.laps.push(lapTime);
        if (bestLap == null || lapTime < bestLap) bestLap = lapTime;
        sfx.lap();
      }
      if (kart.lap >= LAPS) {
        kart.finished = true;
        kart.finishTime = raceClock;
        kart.speed = Math.min(kart.speed, 80);
        if (kart.isPlayer) {
          showToast('ゴール!');
          resultTimer = 1.15;
          sfx.finish();
        }
      } else if (kart.isPlayer) {
        showToast(kart.lap + '周 終了');
      }
    } else if (backCross && kart.lap > 0 && !kart.finished) {
      kart.lap -= 1;
      if (kart.isPlayer && kart.laps.length) kart.laps.pop();
    }
  }

  function pickup(kart) {
    if (kart.item || kart.finished) return;
    for (const box of boxes) {
      if (!box.alive) continue;
      const d = Math.hypot(box.x - kart.x, box.y - kart.y);
      if (d < 36) {
        const kinds = ['meat', 'bite', 'tail', 'bone'];
        kart.item = kinds[(Math.random() * kinds.length) | 0];
        kart.itemWait = 1.1;
        box.alive = false;
        box.respawn = 7;
        if (kart.isPlayer) {
          showToast(ITEM_NAMES[kart.item]);
          sfx.pickup();
        }
        break;
      }
    }
  }

  function separate() {
    const min = KART_R * 2;
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i];
        const b = karts[j];
        if (a.finished || b.finished) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d === 0) { dx = 1; dy = 0; d = 1; }
        if (d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          if (a.speed > b.speed + 30) { a.speed -= 18; b.speed += 8; }
          else if (b.speed > a.speed + 30) { b.speed -= 18; a.speed += 8; }
        }
      }
    }
  }

  function updateWorld(dt) {
    for (const box of boxes) {
      if (!box.alive) {
        box.respawn -= dt;
        if (box.respawn <= 0) box.alive = true;
      }
    }
    for (const bite of bites) {
      bite.life -= dt;
      const target = bite.target && !bite.target.finished ? bite.target : null;
      if (target) {
        const desired = Math.atan2(target.y - bite.y, target.x - bite.x);
        const turn = clamp(normAng(desired - bite.ang), -7 * dt, 7 * dt);
        bite.ang += turn;
      }
      bite.x += Math.cos(bite.ang) * 520 * dt;
      bite.y += Math.sin(bite.ang) * 520 * dt;
      for (const kart of karts) {
        if (kart === bite.owner || kart.finished) continue;
        if (Math.hypot(kart.x - bite.x, kart.y - bite.y) < 28) {
          smack(kart);
          bite.life = 0;
          break;
        }
      }
    }
    bites = bites.filter((b) => b.life > 0);
    for (const tail of tails) {
      tail.life -= dt;
      tail.grace -= dt;
      for (const kart of karts) {
        if (kart.finished) continue;
        if (kart === tail.owner && tail.grace > 0) continue;
        if (Math.hypot(kart.x - tail.x, kart.y - tail.y) < 22) {
          smack(kart);
          tail.life = 0;
          break;
        }
      }
    }
    tails = tails.filter((t) => t.life > 0);
    for (const s of sparks) s.life -= dt;
    sparks = sparks.filter((s) => s.life > 0);
    if (sparks.length > 240) sparks.splice(0, sparks.length - 240);
    for (const s of skids) s.life -= dt;
    skids = skids.filter((s) => s.life > 0);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove('on');
    }
    shake *= Math.pow(0.04, dt);
  }

  function stepRace(dt) {
    if (state === 'countdown') {
      countLeft -= dt;
      const label = countLeft > 0 ? String(Math.ceil(countLeft)) : 'スタート!';
      if (label !== countShown) {
        countShown = label;
        countdownEl.textContent = label;
        if (label === 'スタート!') sfx.go();
        else sfx.beep();
      }
      if (countLeft <= -0.7) {
        state = 'racing';
        countdownEl.hidden = true;
        raceClock = 0;
        for (const kart of karts) kart.lapStart = 0;
      }
      return;
    }
    if (state !== 'racing') return;
    raceClock += dt;
    hintTimer -= dt;
    const player = karts[0];
    if (!player.finished) player.input = readPlayerInput();
    else player.input = { accel: false, brake: false, steer: 0, drift: false, use: false };

    for (const kart of karts) {
      if (kart.invuln > 0) kart.invuln -= dt;
      if (kart.finished) {
        kart.speed = Math.max(0, kart.speed - 220 * dt);
        kart.x += Math.cos(kart.heading) * kart.speed * dt;
        kart.y += Math.sin(kart.heading) * kart.speed * dt;
        continue;
      }
      if (!kart.isPlayer) driveAi(kart, dt);
      if (kart.input.use) useItem(kart);
      kart.input.use = false;
      moveKart(kart, dt);
    }
    separate();
    for (const kart of karts) {
      if (kart.finished) continue;
      const loc = keepOnRoad(kart, dt);
      applyProgress(kart, loc);
      pickup(kart);
    }
    updateWorld(dt);
    if (player.finished && resultTimer > 0) {
      resultTimer -= dt;
      if (resultTimer <= 0) showResult();
    }
  }

  function drawKart(kart) {
    ctx.save();
    ctx.translate(kart.x, kart.y);
    ctx.rotate(kart.heading);
    ctx.globalAlpha = kart.finished ? 0.75 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#222';
    for (const [wx, wy] of [[12, -13], [12, 13], [-12, -13], [-12, 13]]) {
      roundRect(ctx, wx - 5, wy - 4, 11, 8, 2);
      ctx.fill();
    }
    ctx.fillStyle = kart.kart;
    roundRect(ctx, -16, -11, 34, 22, 6);
    ctx.fill();
    if (kart.isPlayer) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = kart.color;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-26, -10, -30, 0);
    ctx.quadraticCurveTo(-26, 10, -8, 0);
    ctx.fill();

    if (kart.kind === 'stego') {
      ctx.fillStyle = kart.accent;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-8 + i * 6, -6);
        ctx.lineTo(-4 + i * 6, -16);
        ctx.lineTo(-1 + i * 6, -6);
        ctx.fill();
      }
    }

    ctx.fillStyle = kart.color;
    ctx.beginPath();
    ctx.ellipse(2, 0, kart.kind === 'raptor' ? 14 : 16, kart.kind === 'raptor' ? 9 : 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kart.belly;
    ctx.beginPath();
    ctx.ellipse(4, 3, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = kart.color;
    ctx.beginPath();
    ctx.ellipse(16, -1, kart.kind === 'rex' ? 11 : 9, kart.kind === 'rex' ? 9 : 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (kart.kind === 'trike') {
      ctx.fillStyle = kart.accent;
      ctx.beginPath();
      ctx.ellipse(12, -1, 8, 10, 0, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fill();
      ctx.fillStyle = '#f8f9fa';
      ctx.beginPath();
      ctx.moveTo(24, -1);
      ctx.lineTo(18, -3);
      ctx.lineTo(18, 1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(16, -8);
      ctx.lineTo(12, -4);
      ctx.lineTo(15, -3);
      ctx.fill();
    }
    if (kart.kind === 'rex') {
      ctx.fillStyle = kart.belly;
      ctx.fillRect(8, 6, 5, 3);
      ctx.fillRect(8, -8, 5, 3);
    }
    if (kart.kind === 'raptor') {
      ctx.strokeStyle = kart.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 8);
      ctx.lineTo(12, 13);
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(19, -3, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(20.1, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    if (kart.shield) {
      ctx.strokeStyle = 'rgba(255, 236, 153, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(4, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (kart.isPlayer) {
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(kart.x, kart.y - 34);
      ctx.lineTo(kart.x - 6, kart.y - 46);
      ctx.lineTo(kart.x + 6, kart.y - 46);
      ctx.fill();
    }
  }

  function drawWorld(w, h, dt) {
    const player = karts[0];
    const aimX = player.x + Math.cos(player.heading) * 36;
    const aimY = player.y + Math.sin(player.heading) * 20;
    const follow = 1 - Math.exp(-8 * Math.max(0.001, dt || 0.016));
    if (state === 'title') {
      camX = player.x;
      camY = player.y;
    } else {
      camX += (aimX - camX) * follow;
      camY += (aimY - camY) * follow;
    }
    let sx = 0;
    let sy = 0;
    if (shake > 0.4) {
      sx = (Math.random() - 0.5) * shake;
      sy = (Math.random() - 0.5) * shake;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + sx, h * 0.42 + sy);
    ctx.translate(-camX, -camY);
    ctx.drawImage(map.canvas, -map.ox, -map.oy);

    ctx.fillStyle = 'rgba(30,30,30,0.45)';
    for (const s of skids) {
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    const bob = Math.sin(raceClock * 4);
    for (const box of boxes) {
      ctx.save();
      ctx.translate(box.x, box.y + (box.alive ? bob * 3 : 0));
      ctx.rotate(raceClock * (box.alive ? 1.4 : 0));
      ctx.fillStyle = box.alive ? '#ffd43b' : 'rgba(255,255,255,0.18)';
      ctx.strokeStyle = '#5c3b00';
      ctx.lineWidth = 3;
      roundRect(ctx, -13, -13, 26, 26, 4);
      ctx.fill();
      if (box.alive) ctx.stroke();
      if (box.alive) {
        ctx.fillStyle = '#5c3b00';
        ctx.font = '700 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.rotate(-raceClock * 1.4);
        ctx.fillText('?', 0, 5);
      }
      ctx.restore();
    }

    for (const tail of tails) {
      ctx.save();
      ctx.translate(tail.x, tail.y);
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d8f5a2';
      ctx.beginPath();
      ctx.arc(6, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const bite of bites) {
      ctx.save();
      ctx.translate(bite.x, bite.y);
      ctx.rotate(bite.ang);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, 7);
      ctx.lineTo(-8, -7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e03131';
      ctx.fillRect(-4, -4, 6, 8);
      ctx.restore();
    }

    const drawOrder = karts.slice().sort((a, b) => a.y - b.y);
    for (const kart of drawOrder) drawKart(kart);

    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life * 3);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = '700 14px "Yu Gothic", Meiryo, sans-serif';
    ctx.textAlign = 'center';
    const labels = karts.map((kart) => ({ kart, x: kart.x, y: kart.y - 30 }));
    labels.sort((a, b) => Number(a.kart.isPlayer) - Number(b.kart.isPlayer));
    const placed = [];
    for (const label of labels) {
      let y = label.y;
      for (const prev of placed) {
        if (Math.abs(prev.x - label.x) < 54 && Math.abs(prev.y - y) < 16) y = prev.y - 16;
      }
      placed.push({ x: label.x, y });
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(label.kart.name, label.x, y);
      ctx.fillStyle = label.kart.isPlayer ? '#ffe066' : '#fff';
      ctx.fillText(label.kart.name, label.x, y);
    }
    ctx.restore();

    if (w >= 860) drawMinimap(w);
  }

  function drawMinimap(w) {
    const mw = 150;
    const mh = 100;
    const x0 = 16;
    const y0 = 196;
    const spanX = track.maxX - track.minX || 1;
    const spanY = track.maxY - track.minY || 1;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 28, 12, 0.72)';
    roundRect(ctx, x0, y0, mw, mh, 12);
    ctx.fill();
    ctx.beginPath();
    track.samples.forEach((p, i) => {
      const x = x0 + 10 + ((p.x - track.minX) / spanX) * (mw - 20);
      const y = y0 + 10 + ((p.y - track.minY) / spanY) * (mh - 20);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 4;
    ctx.stroke();
    for (const kart of karts) {
      const x = x0 + 10 + ((kart.x - track.minX) / spanX) * (mw - 20);
      const y = y0 + 10 + ((kart.y - track.minY) / spanY) * (mh - 20);
      ctx.fillStyle = kart.color;
      ctx.beginPath();
      ctx.arc(x, y, kart.isPlayer ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updateHud() {
    const player = karts[0];
    const sorted = karts.slice().sort(compareKart);
    const rank = sorted.findIndex((k) => k.isPlayer) + 1;
    ui.rank.textContent = rank + '位';
    ui.totalKarts.textContent = '/ ' + karts.length + '台';
    const showLap = Math.min(LAPS, player.lap + (player.finished ? 0 : 1));
    ui.lap.textContent = showLap + ' / ' + LAPS + ' 周';
    const lapTime = player.finished
      ? player.laps[player.laps.length - 1]
      : raceClock - player.lapStart;
    ui.time.textContent = fmt(state === 'racing' || state === 'result' ? lapTime : 0);
    ui.total.textContent = '合計 ' + fmt(player.finished ? player.finishTime : (state === 'racing' ? raceClock : 0));
    ui.best.textContent = 'ベスト ' + fmt(bestLap);
    const itemLabel = player.item ? ITEM_NAMES[player.item] : 'なし';
    ui.item.textContent = 'アイテム ' + itemLabel + (player.shield ? '（よろい）' : '');
    ui.order.innerHTML = sorted.map((k) => '<li class="' + (k.isPlayer ? 'me' : '') + '">' + k.name + '</li>').join('');
    const showDrift = player.drifting || player.driftCharge > 0;
    ui.drift.hidden = !showDrift;
    ui.driftFill.style.width = Math.min(100, (player.driftCharge / 1.5) * 100) + '%';
    hint.hidden = hintTimer <= 0 || state !== 'racing';
  }

  function showResult() {
    state = 'result';
    const sorted = karts.slice().sort(compareKart);
    const player = karts[0];
    const rows = sorted.map((k, i) => {
      const time = k.finished ? fmt(k.finishTime) : (Math.min(LAPS, k.lap + 1) + '周目');
      return '<div class="row ' + (k.isPlayer ? 'me' : '') + '"><span>' + (i + 1) + '位 ' + k.name + '</span><span>' + time + '</span></div>';
    }).join('');
    const laps = player.laps.map((t, i) => '<li>' + (i + 1) + '周 ' + fmt(t) + '</li>').join('');
    result.innerHTML = '<div class="card"><h2>けっか</h2>' + rows +
      '<ul class="laps">' + laps + '</ul>' +
      '<button id="retry" type="button">もういちど</button>' +
      '<button id="back" type="button">はじめに戻る</button></div>';
    result.hidden = false;
    for (const pad of pads) pad.hidden = true;
    document.getElementById('retry').addEventListener('click', () => begin(true));
    document.getElementById('back').addEventListener('click', () => {
      result.hidden = true;
      overlay.hidden = false;
      hud.hidden = true;
      state = 'title';
      resetRace();
    });
  }

  function begin() {
    sfx.ensure();
    resetRace();
    state = 'countdown';
    countLeft = 3;
    countShown = '';
    resultTimer = 0;
    hintTimer = 6;
    overlay.hidden = true;
    result.hidden = true;
    hud.hidden = false;
    countdownEl.hidden = false;
    countdownEl.textContent = '3';
    for (const pad of pads) pad.hidden = false;
    itemWasDown = true;
  }

  function frame(dt, draw) {
    const safe = Math.max(0, Math.min(0.033, dt || 0));
    if (state === 'countdown' || state === 'racing') stepRace(safe);
    else if (state === 'result') updateWorld(safe);
    if (draw === false) return;
    const w = view.width / dpr;
    const h = view.height / dpr;
    if (karts.length) {
      drawWorld(w, h, safe);
      if (!hud.hidden) updateHud();
    }
    sfx.engine(karts[0], state === 'racing' || state === 'countdown');
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    view.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    view.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  }

  let armed = true;
  let last = 0;
  function loop(now) {
    if (!armed) return;
    if (!last) last = now;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  }

  document.getElementById('start').addEventListener('click', begin);
  ui.mute.addEventListener('click', () => {
    muted = !muted;
    ui.mute.textContent = muted ? '音オフ' : '音オン';
    sfx.setMuted(muted);
  });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k) || ['w', 'a', 's', 'd', 'z', 'e', 'm'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
    if (e.key.toLowerCase() === 'm' && !e.repeat) {
      muted = !muted;
      ui.mute.textContent = muted ? '音オフ' : '音オン';
      sfx.setMuted(muted);
    }
    if (e.repeat) {
      keys.add(e.key.toLowerCase());
      return;
    }
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  for (const btn of document.querySelectorAll('.pad .btn')) {
    const act = btn.dataset.act;
    const down = (e) => {
      e.preventDefault();
      held[act] = true;
      btn.classList.add('held');
      if (btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      }
    };
    const up = (e) => {
      held[act] = false;
      btn.classList.remove('held');
      if (e && e.pointerId != null && btn.releasePointerCapture) {
        try { btn.releasePointerCapture(e.pointerId); } catch (err) { /* 無視 */ }
      }
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', () => {
      held[act] = false;
      btn.classList.remove('held');
    });
  }

  window.addEventListener('error', (e) => {
    const fatal = document.getElementById('fatal');
    fatal.hidden = false;
    fatal.textContent = 'エラー: ' + (e.message || '不明');
  });

  function createSfx() {
    let actx = null;
    let engine = null;
    let noiseGain = null;
    let isMuted = false;
    function ensure() {
      if (isMuted) return;
      try {
        if (!actx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          actx = new AC();
          const osc = actx.createOscillator();
          const filter = actx.createBiquadFilter();
          const gain = actx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.value = 50;
          filter.type = 'lowpass';
          filter.frequency.value = 200;
          gain.gain.value = 0;
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(actx.destination);
          osc.start();
          const len = actx.sampleRate * 2;
          const buf = actx.createBuffer(1, len, actx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
          const src = actx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          const bp = actx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 900;
          noiseGain = actx.createGain();
          noiseGain.gain.value = 0;
          src.connect(bp);
          bp.connect(noiseGain);
          noiseGain.connect(actx.destination);
          src.start();
          engine = { osc, filter, gain };
        }
        if (actx.state === 'suspended') actx.resume();
      } catch (err) {
        actx = null;
      }
    }
    function tone(freq, dur, type, vol, slide) {
      if (!actx || isMuted) return;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), actx.currentTime + dur);
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur + 0.02);
    }
    function burst(dur, vol) {
      if (!actx || isMuted) return;
      const n = Math.max(1, Math.floor(actx.sampleRate * dur));
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = actx.createBufferSource();
      s.buffer = buf;
      const filter = actx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const g = actx.createGain();
      g.gain.value = vol;
      s.connect(filter);
      filter.connect(g);
      g.connect(actx.destination);
      s.start();
    }
    return {
      ensure,
      setMuted(v) {
        isMuted = v;
        if (engine && actx) engine.gain.gain.setTargetAtTime(0, actx.currentTime, 0.03);
        if (noiseGain && actx) noiseGain.gain.setTargetAtTime(0, actx.currentTime, 0.03);
      },
      engine(kart, active) {
        if (!engine || !actx) return;
        const now = actx.currentTime;
        if (isMuted || !active) {
          engine.gain.gain.setTargetAtTime(0, now, 0.05);
          noiseGain.gain.setTargetAtTime(0, now, 0.05);
          return;
        }
        const speed = kart ? kart.speed : 0;
        engine.osc.frequency.setTargetAtTime(46 + speed * 0.2, now, 0.08);
        engine.filter.frequency.setTargetAtTime(140 + speed * 0.7, now, 0.08);
        engine.gain.gain.setTargetAtTime(0.012 + Math.min(0.02, speed / 22000), now, 0.08);
        noiseGain.gain.setTargetAtTime(kart && kart.drifting ? 0.025 : 0, now, 0.05);
      },
      beep() { ensure(); tone(520, 0.12, 'square', 0.05); },
      go() { ensure(); tone(780, 0.22, 'square', 0.06); },
      pickup() { ensure(); tone(660, 0.08, 'triangle', 0.06); tone(880, 0.12, 'triangle', 0.05); },
      boost() { ensure(); tone(220, 0.28, 'sawtooth', 0.04, 640); },
      shoot() { ensure(); tone(180, 0.12, 'square', 0.04, 90); },
      drop() { ensure(); tone(140, 0.1, 'triangle', 0.05); },
      guard() { ensure(); tone(600, 0.1, 'triangle', 0.05, 900); },
      hit() { ensure(); burst(0.12, 0.08); },
      lap() { ensure(); tone(523, 0.1, 'triangle', 0.05); tone(784, 0.16, 'triangle', 0.05); },
      finish() {
        ensure();
        [523, 659, 784, 1046].forEach((f, i) => {
          setTimeout(() => tone(f, 0.18, 'triangle', 0.06), i * 120);
        });
      },
    };
  }

  window.addEventListener('resize', () => {
    resize();
    frame(0);
  });
  resize();
  resetRace();
  frame(0);
  requestAnimationFrame(loop);

  if (new URLSearchParams(location.search).has('test')) {
    window.RACE = {
      get state() { return state; },
      get length() { return track.length; },
      get samples() { return track.samples; },
      karts: () => karts,
      player: () => karts[0],
      boxes: () => boxes,
      bites: () => bites,
      tails: () => tails,
      begin,
      step(dt, draw) { frame(dt, draw); },
      stop() { armed = false; },
      script(input) { scripted = input; },
      clearScript() { scripted = null; },
      roadHalf: ROAD_HALF,
    };
  }
})();
