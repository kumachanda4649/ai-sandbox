/* きょうりゅうバトル
   図形で描く恐竜と、WebAudioの合成音だけを使うATB戦闘。
   外部の絵・音・ライブラリは使わない。 */
'use strict';

(function () {
  const FONT = '"WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';
  const TYPE = {
    bite: { name: 'かみ', move: 'かみつく', beats: 'scratch', color: '#e85d04' },
    scratch: { name: 'ひっかき', move: 'ひっかく', beats: 'tackle', color: '#0f766e' },
    tackle: { name: 'たいあたり', move: 'たいあたり', beats: 'bite', color: '#b45309' },
  };

  const BASIC = [
    { id: 'bite', name: 'かみつく', type: 'bite', power: 20, kind: 'attack' },
    { id: 'scratch', name: 'ひっかく', type: 'scratch', power: 19, kind: 'attack' },
    { id: 'tackle', name: 'たいあたり', type: 'tackle', power: 22, kind: 'attack' },
  ];
  const CHARGE = { id: 'charge', name: 'ためる', type: null, power: 0, kind: 'charge' };

  const SPECIALS = {
    oago: { name: 'おおあご', power: 46 },
    tsurugi: { name: 'つるぎづめ', power: 44 },
    press: { name: 'ふんばりプレス', power: 48 },
    miniBite: { name: 'ちびかみ', power: 30 },
    miniScratch: { name: 'ひっかきまわし', power: 30 },
    miniTackle: { name: 'ミニドスン', power: 32 },
    breath: { name: 'ほのおのいき', power: 34 },
  };

  const TRIANGLE = '相性: かみつく＞ひっかき＞たいあたり＞かみつく（つよいと1.5倍、よわいと0.7倍）';

  const CAMPAIGN = [
    {
      title: '第1戦',
      place: 'くさむら',
      intro: [
        'くさむらが ざわざわしている。',
        'コガブが とびだした！',
        TRIANGLE,
        '「ためる」と、次の行動で 必殺技が 1回出せる。',
      ],
      enemies: [
        { id: 'kogabu', name: 'コガブ', type: 'bite', look: 'kogabu', scale: 4, level: 2, maxHp: 70, atk: 10, spd: 10, exp: 24, special: 'miniBite' },
      ],
    },
    {
      title: '第2戦',
      place: 'いわば',
      intro: [
        'いわが ころがり、2ひき 出てきた！',
        'ハリツメは ひっかき、カブコは たいあたり。',
      ],
      enemies: [
        { id: 'hari', name: 'ハリツメ', type: 'scratch', look: 'hari', scale: 4, level: 3, maxHp: 74, atk: 12, spd: 13, exp: 22, special: 'miniScratch' },
        { id: 'kabuko', name: 'カブコ', type: 'tackle', look: 'kabuko', scale: 5, level: 3, maxHp: 86, atk: 12, spd: 8, exp: 22, special: 'miniTackle' },
      ],
    },
    {
      title: '第3戦',
      place: 'みずべ',
      intro: [
        'みずべに 3ひき ならんでいる。',
        'タイプを見て、つよい わざを 選ぼう。',
      ],
      enemies: [
        { id: 'gaburi', name: 'ガブリ', type: 'bite', look: 'gaburi', scale: 5, level: 4, maxHp: 82, atk: 14, spd: 11, exp: 26, special: 'miniBite' },
        { id: 'tsume', name: 'ツメリー', type: 'scratch', look: 'tsume', scale: 4, level: 4, maxHp: 76, atk: 13, spd: 14, exp: 26, special: 'miniScratch' },
        { id: 'yoroi', name: 'ヨロイン', type: 'tackle', look: 'yoroi', scale: 5, level: 4, maxHp: 98, atk: 14, spd: 8, exp: 26, special: 'miniTackle' },
      ],
    },
    {
      title: 'ボス戦',
      place: 'かざん',
      boss: true,
      intro: [
        'かざんが うなった！',
        'マグマオウが あらわれた！',
        'いまのタイプは「かみ」。たいあたりが つうようする。',
        'HPが減ると タイプが かわる。',
      ],
      enemies: [
        { id: 'boss', name: 'マグマオウ', type: 'bite', look: 'boss', scale: 6, level: 8, maxHp: 300, atk: 17, spd: 12, exp: 100, special: 'breath', boss: true },
      ],
    },
  ];

  const FRAMES = {
    bite: {
      w: 24, h: 20,
      parts: [
        [0, 12, 3, 2, 'dark'], [2, 11, 5, 3, 'body'],
        [6, 15, 3, 3, 'dark'], [5, 18, 4, 2, 'body'],
        [5, 8, 10, 8, 'body'], [7, 12, 6, 3, 'belly'],
        [11, 15, 3, 3, 'body'], [11, 18, 4, 2, 'dark'],
        [12, 11, 2, 2, 'dark'], [14, 6, 4, 4, 'body'],
        [16, 3, 5, 6, 'body'], [20, 5, 4, 4, 'body'],
        [22, 6, 1, 1, 'dark'], [15, 2, 4, 2, 'dark'],
        [17, 4, 2, 2, 'eye'], [17, 4, 1, 1, 'shine'],
        [18, 9, 6, 2, 'dark'],
        [19, 8, 1, 2, 'tooth'], [21, 8, 1, 2, 'tooth'], [23, 8, 1, 2, 'tooth'],
      ],
    },
    scratch: {
      w: 24, h: 20,
      parts: [
        [0, 13, 2, 1, 'dark'], [1, 12, 6, 2, 'body'],
        [6, 15, 2, 3, 'body'], [5, 18, 3, 2, 'dark'],
        [10, 14, 2, 4, 'body'], [9, 18, 3, 2, 'dark'],
        [12, 16, 2, 1, 'claw'],
        [6, 9, 8, 6, 'body'], [8, 12, 5, 2, 'belly'],
        [13, 6, 3, 4, 'body'], [15, 4, 5, 4, 'body'],
        [19, 5, 4, 3, 'body'], [22, 6, 1, 1, 'dark'],
        [16, 5, 2, 2, 'eye'], [16, 5, 1, 1, 'shine'],
        [15, 2, 2, 3, 'dark'], [17, 3, 2, 2, 'body'],
        [11, 10, 5, 2, 'body'], [15, 8, 2, 3, 'claw'], [17, 7, 2, 2, 'claw'],
      ],
    },
    tackle: {
      w: 24, h: 20,
      parts: [
        [0, 13, 3, 3, 'dark'], [1, 14, 1, 1, 'spike'], [3, 14, 4, 2, 'body'],
        [6, 16, 4, 2, 'body'], [5, 18, 5, 2, 'dark'],
        [6, 9, 12, 8, 'body'], [8, 13, 8, 3, 'belly'],
        [7, 6, 3, 4, 'plate'], [11, 5, 3, 5, 'plate'], [15, 6, 3, 4, 'plate'],
        [14, 16, 4, 2, 'dark'], [14, 18, 5, 2, 'body'],
        [16, 10, 6, 5, 'body'], [20, 12, 3, 3, 'dark'],
        [18, 11, 2, 2, 'eye'], [18, 11, 1, 1, 'shine'],
        [23, 13, 1, 2, 'spike'],
      ],
    },
    dragon: {
      w: 32, h: 24,
      parts: [
        [0, 7, 10, 2, 'wing'], [1, 9, 8, 2, 'wing'], [2, 11, 5, 2, 'dark'],
        [18, 1, 12, 3, 'wing'], [20, 4, 10, 2, 'wing'], [22, 6, 6, 2, 'dark'],
        [0, 16, 4, 3, 'dark'], [3, 15, 6, 3, 'body'],
        [8, 19, 4, 4, 'body'], [15, 19, 4, 4, 'dark'],
        [7, 12, 13, 8, 'body'], [9, 16, 9, 3, 'belly'],
        [10, 14, 4, 1, 'crack'], [12, 15, 1, 3, 'crack'], [14, 16, 3, 1, 'crack'],
        [18, 8, 4, 6, 'body'], [21, 5, 8, 7, 'body'], [26, 7, 5, 4, 'dark'],
        [22, 0, 2, 6, 'horn'], [25, 0, 2, 6, 'horn'],
        [26, 11, 5, 2, 'dark'], [27, 10, 1, 2, 'tooth'], [29, 10, 1, 2, 'tooth'], [31, 10, 1, 2, 'tooth'],
        [23, 6, 2, 2, 'eye'], [23, 6, 1, 1, 'shine'],
      ],
    },
  };

  function palette(body, dark, belly, accent) {
    return {
      body: body,
      dark: dark,
      belly: belly,
      plate: accent,
      spike: accent,
      claw: accent,
      wing: body,
      horn: accent,
      crack: accent,
      tooth: '#fffaf0',
      eye: '#1c1917',
      shine: '#ffffff',
    };
  }

  const LOOKS = {
    bakuo: { shape: 'bite', colors: palette('#ea580c', '#9a3412', '#ffedd5', '#fde047'), extra: [[16, 0, 2, 3, 'horn']] },
    surike: { shape: 'scratch', colors: palette('#0f766e', '#134e4a', '#99f6e4', '#ecfccb'), extra: [] },
    gonzo: { shape: 'tackle', colors: palette('#78716c', '#44403c', '#fde68a', '#e7e5e4'), extra: [] },
    kogabu: { shape: 'bite', colors: palette('#fb923c', '#c2410c', '#ffedd5', '#fdba74'), extra: [] },
    hari: { shape: 'scratch', colors: palette('#15803d', '#14532d', '#d9f99d', '#fef08a'), extra: [] },
    kabuko: { shape: 'tackle', colors: palette('#a16207', '#713f12', '#fef3c7', '#fde68a'), extra: [] },
    gaburi: { shape: 'bite', colors: palette('#b91c1c', '#7f1d1d', '#fecaca', '#fda4af'), extra: [] },
    tsume: { shape: 'scratch', colors: palette('#0369a1', '#0c4a6e', '#e0f2fe', '#bae6fd'), extra: [] },
    yoroi: { shape: 'tackle', colors: palette('#44403c', '#1c1917', '#d6d3d1', '#a8a29e'), extra: [] },
    boss: {
      shape: 'dragon',
      colors: {
        body: '#9f1239',
        dark: '#4c0519',
        belly: '#fecdd3',
        plate: '#fb7185',
        spike: '#fbbf24',
        claw: '#fecdd3',
        wing: '#be123c',
        horn: '#fbbf24',
        crack: '#ff6d00',
        tooth: '#fff7ed',
        eye: '#fef08a',
        shine: '#ffffff',
      },
      extra: [],
    },
  };

  const AudioKit = (function () {
    let ctx = null;
    let master = null;
    let muted = false;
    let timer = null;
    let step = 0;
    const scale = [262, 294, 330, 392, 440, 392, 330, 294];

    function ac() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!ctx) {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.22;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (err) {
        return null;
      }
    }

    function env(duration, peak) {
      const c = ac();
      if (!c || muted) return null;
      const g = c.createGain();
      g.connect(master);
      const t = c.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, duration));
      return { c: c, g: g };
    }

    function tone(freq, dur, type, peak) {
      const e = env(dur, peak);
      if (!e) return;
      const o = e.c.createOscillator();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, e.c.currentTime);
      o.connect(e.g);
      o.start();
      o.stop(e.c.currentTime + dur + 0.03);
    }

    function sweep(f1, f2, dur, type, peak) {
      const e = env(dur, peak);
      if (!e) return;
      const o = e.c.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(Math.max(40, f1), e.c.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f2), e.c.currentTime + dur);
      o.connect(e.g);
      o.start();
      o.stop(e.c.currentTime + dur + 0.03);
    }

    function noise(dur, peak, freq) {
      const e = env(dur, peak);
      if (!e) return;
      const len = Math.max(1, Math.floor(e.c.sampleRate * dur));
      const buf = e.c.createBuffer(1, len, e.c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = e.c.createBufferSource();
      src.buffer = buf;
      const f = e.c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.7;
      src.connect(f);
      f.connect(e.g);
      src.start();
    }

    function startBgm() {
      if (timer || muted) return;
      if (!ac()) return;
      timer = setInterval(function () {
        if (muted) return;
        const f = scale[step % scale.length];
        tone(f, 0.16, 'triangle', 0.035);
        if (step % 4 === 0) tone(f / 2, 0.14, 'sine', 0.028);
        step += 1;
      }, 520);
    }

    function stopBgm() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    return {
      unlock: function () { ac(); if (!muted) startBgm(); },
      toggle: function () {
        muted = !muted;
        if (muted) stopBgm();
        else { ac(); startBgm(); }
        return muted;
      },
      isMuted: function () { return muted; },
      confirm: function () { tone(680, 0.05, 'square', 0.05); },
      cursor: function () { tone(480, 0.035, 'square', 0.035); },
      swing: function (move) {
        if (!move || move.kind === 'charge') return;
        if (move.kind === 'special') {
          noise(0.18, 0.18, 640);
          tone(330, 0.1, 'square', 0.07);
          setTimeout(function () { tone(494, 0.12, 'square', 0.07); }, 80);
          setTimeout(function () { tone(660, 0.16, 'square', 0.06); }, 150);
          return;
        }
        if (move.type === 'bite') { noise(0.1, 0.2, 280); tone(110, 0.12, 'square', 0.06); }
        else if (move.type === 'scratch') { noise(0.07, 0.16, 1500); setTimeout(function () { noise(0.05, 0.1, 1900); }, 50); }
        else sweep(190, 55, 0.16, 'sine', 0.11);
      },
      charge: function () { sweep(220, 740, 0.28, 'triangle', 0.07); },
      hit: function () { noise(0.07, 0.16, 480); },
      faint: function () { sweep(320, 80, 0.24, 'triangle', 0.06); },
      level: function () {
        [523, 659, 784, 1046].forEach(function (f, i) {
          setTimeout(function () { tone(f, 0.11, 'square', 0.055); }, i * 90);
        });
      },
      fanfare: function () {
        [392, 494, 587, 784].forEach(function (f, i) {
          setTimeout(function () { tone(f, 0.16, 'triangle', 0.06); }, i * 120);
        });
      },
      lose: function () { sweep(220, 70, 0.4, 'sawtooth', 0.055); },
    };
  })();

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const logEl = document.getElementById('log');
  const panelEl = document.getElementById('panel');
  const rosterEl = document.getElementById('roster');
  const hintEl = document.getElementById('hint');
  const subtitleEl = document.getElementById('subtitle');
  const muteBtn = document.getElementById('mute');

  let viewScale = 1;
  let debugSpeed = 1;
  let screen = 'title';
  let phase = 'title';
  let battleIndex = 0;
  let party = [];
  let enemies = [];
  let snapshot = [];
  let ready = [];
  let actor = null;
  let pendingMove = null;
  let anim = null;
  let windup = 0;
  let shown = [];
  let queue = [];
  let history = [];
  let hold = 0;
  let cursor = 0;
  let panelKey = '';
  let logKey = '';
  let rosterKey = '';
  let lastGain = 0;
  let leveledOnce = false;
  let shake = 0;
  let floaters = [];
  let particles = [];
  let leaves = [];
  let lastTs = 0;

  function makeAlly(spec) {
    return {
      uid: spec.name,
      name: spec.name,
      side: 'ally',
      type: spec.type,
      look: spec.look,
      scale: spec.scale,
      level: 1,
      exp: 0,
      maxHp: spec.maxHp,
      hp: spec.maxHp,
      atk: spec.atk,
      spd: spec.spd,
      atb: 0,
      charged: false,
      special: spec.special,
      boss: false,
      faintT: 0,
      expReward: 0,
    };
  }

  function makeParty() {
    return [
      makeAlly({ name: 'バクオ', type: 'bite', look: 'bakuo', scale: 5, maxHp: 58, atk: 15, spd: 11, special: 'oago' }),
      makeAlly({ name: 'スリケ', type: 'scratch', look: 'surike', scale: 5, maxHp: 50, atk: 14, spd: 14, special: 'tsurugi' }),
      makeAlly({ name: 'ゴンゾ', type: 'tackle', look: 'gonzo', scale: 5, maxHp: 68, atk: 14, spd: 8, special: 'press' }),
    ];
  }

  function makeEnemy(t) {
    return {
      uid: t.id,
      name: t.name,
      side: 'enemy',
      type: t.type,
      look: t.look,
      scale: t.scale,
      level: t.level,
      exp: 0,
      maxHp: t.maxHp,
      hp: t.maxHp,
      atk: t.atk,
      spd: t.spd,
      atb: 0,
      charged: false,
      special: t.special,
      boss: !!t.boss,
      faintT: 0,
      expReward: t.exp,
    };
  }

  function cloneUnit(u) {
    return {
      uid: u.uid, name: u.name, side: u.side, type: u.type, look: u.look, scale: u.scale,
      level: u.level, exp: u.exp, maxHp: u.maxHp, hp: u.hp, atk: u.atk, spd: u.spd,
      atb: u.atb, charged: u.charged, special: u.special, boss: u.boss, faintT: 0, expReward: u.expReward,
    };
  }

  function living(list) {
    return list.filter(function (u) { return u.hp > 0; });
  }

  function expNeed(level) {
    return 18 + (level - 1) * 16;
  }

  function affinity(moveType, defType) {
    if (!moveType || !defType) return 1;
    if (TYPE[moveType].beats === defType) return 1.5;
    if (TYPE[defType].beats === moveType) return 0.7;
    return 1;
  }

  function affText(moveType, defType) {
    const a = affinity(moveType, defType);
    if (a > 1) return { text: 'ばつぐん', tone: 'good' };
    if (a < 1) return { text: 'いまひとつ', tone: 'bad' };
    return { text: 'ふつう', tone: '' };
  }

  function counterMoveName(defType) {
    const keys = ['bite', 'scratch', 'tackle'];
    for (let i = 0; i < keys.length; i++) {
      if (TYPE[keys[i]].beats === defType) return TYPE[keys[i]].move;
    }
    return '';
  }

  function getSpecial(unit) {
    const spec = SPECIALS[unit.special];
    return {
      id: 'special',
      name: spec.name,
      type: unit.type,
      power: spec.power,
      kind: 'special',
      useOwnType: true,
    };
  }

  function moveById(unit, id) {
    if (id === 'charge') return CHARGE;
    if (id === 'special') return getSpecial(unit);
    for (let i = 0; i < BASIC.length; i++) if (BASIC[i].id === id) return BASIC[i];
    return null;
  }

  function titleLines() {
    return [
      'みかたの恐竜3たいで、敵と ATB でたたかう。',
      TRIANGLE,
      'わざは かみつく・ひっかく・たいあたり。必殺は「ためる」のあと。',
      '敵戦を3回、そのあとボス。勝つと経験値でレベルアップ。',
    ];
  }

  function remember(text) {
    history.push(text);
    if (history.length > 240) history.shift();
  }

  function say(text) {
    remember(text);
    shown.push(text);
    while (shown.length > 4) shown.shift();
    renderLog();
  }

  function sayQueued(text) {
    remember(text);
    queue.push(text);
  }

  function messagesIdle() {
    return queue.length === 0 && hold <= 0;
  }

  function skipMessages() {
    if (!queue.length && hold <= 0) return;
    while (queue.length) shown.push(queue.shift());
    while (shown.length > 4) shown.shift();
    hold = 0;
    renderLog();
  }

  function updateMessages(dt) {
    if (hold > 0) {
      hold -= dt;
      return;
    }
    if (!queue.length) return;
    shown.push(queue.shift());
    while (shown.length > 4) shown.shift();
    hold = 0.85;
    renderLog();
  }

  function bestTarget(moveType, list) {
    let best = list[0];
    let score = -999;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const s = affinity(moveType, t.type) * 10 + (1 - t.hp / t.maxHp) * 3;
      if (s > score) { score = s; best = t; }
    }
    return best;
  }

  function chooseEnemyAction(enemy) {
    const allies = living(party);
    if (enemy.charged) {
      return { move: getSpecial(enemy), target: bestTarget(enemy.type, allies) };
    }
    const canPunish = allies.some(function (a) { return affinity(enemy.type, a.type) > 1; });
    const chance = enemy.boss ? 0.45 : 0.34;
    if (canPunish && Math.random() < chance) return { move: CHARGE, target: null };
    let best = null;
    for (let i = 0; i < BASIC.length; i++) {
      for (let j = 0; j < allies.length; j++) {
        const score = affinity(BASIC[i].type, allies[j].type) * 10 + (1 - allies[j].hp / allies[j].maxHp) * 2 + Math.random() * 0.25;
        if (!best || score > best.score) best = { score: score, move: BASIC[i], target: allies[j] };
      }
    }
    return { move: best.move, target: best.target };
  }

  function bossTypeFor(boss) {
    const r = boss.hp / boss.maxHp;
    if (r > 0.66) return 'bite';
    if (r > 0.33) return 'scratch';
    return 'tackle';
  }

  function strike(attacker, move, defender) {
    const type = move.useOwnType ? attacker.type : move.type;
    const aff = affinity(type, defender.type);
    const vary = 0.92 + Math.random() * 0.1;
    const dmg = Math.max(1, Math.floor((attacker.atk * move.power) / 16 * aff * vary));
    defender.hp = Math.max(0, defender.hp - dmg);
    return { dmg: dmg, aff: aff, type: type };
  }

  function unitAnchor(u) {
    const pos = layoutOf(u);
    const frame = FRAMES[LOOKS[u.look].shape];
    return { x: pos.x, y: pos.y - frame.h * u.scale * 0.55 };
  }

  function burst(x, y, color) {
    for (let i = 0; i < 7; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 220,
        vy: (Math.random() - 0.85) * 180,
        t: 0,
        life: 0.45,
        color: color,
        s: 4 + Math.random() * 5,
      });
    }
  }

  function applyAnim() {
    const a = anim.actor;
    const move = anim.move;
    const target = anim.target;
    if (move.kind === 'charge') {
      a.charged = true;
      sayQueued(a.name + 'は ちからを ためた！');
      AudioKit.charge();
      shake = Math.max(shake, 0.08);
      return;
    }
    const result = strike(a, move, target);
    sayQueued(a.name + 'の ' + move.name + '！ ' + target.name + 'に ' + result.dmg + ' ダメージ！');
    if (result.aff > 1) sayQueued('こうかは ばつぐんだ！');
    else if (result.aff < 1) sayQueued('こうかは いまひとつ…');
    const anchor = unitAnchor(target);
    floaters.push({
      x: anchor.x, y: anchor.y, text: String(result.dmg),
      color: result.aff > 1 ? '#ffd166' : '#fffaf0', t: 0, life: 0.9,
    });
    burst(anchor.x, anchor.y, result.aff > 1 ? '#ffd166' : '#fffaf0');
    shake = Math.max(shake, move.kind === 'special' ? 0.32 : move.type === 'tackle' ? 0.2 : 0.1);
    AudioKit.hit();
    if (target.hp <= 0) {
      sayQueued(target.name + 'は たおれた！');
      AudioKit.faint();
    } else if (target.boss) {
      const next = bossTypeFor(target);
      if (next !== target.type) {
        target.type = next;
        sayQueued(target.name + 'は「' + TYPE[next].name + '」タイプに かわった！ ' + counterMoveName(next) + 'が つうようする！');
      }
    }
  }

  function beginResolve(unit, move, target) {
    actor = unit;
    pendingMove = move;
    phase = 'resolve';
    anim = { actor: unit, target: target, move: move, t: 0, done: false, applied: false };
    AudioKit.swing(move);
  }

  function finishResolve() {
    const finished = actor;
    const move = pendingMove;
    anim = null;
    if (finished) {
      finished.atb = 0;
      if (move && move.kind === 'special') finished.charged = false;
    }
    pendingMove = null;
    actor = null;
    if (living(enemies).length === 0) {
      phase = 'victory';
      grantVictory();
    } else if (living(party).length === 0) {
      phase = 'defeat';
      sayQueued('みかたは ぜんめつした…');
    } else {
      phase = 'tick';
    }
  }

  function grantVictory() {
    const gain = enemies.reduce(function (sum, e) { return sum + (e.expReward || 0); }, 0);
    lastGain = gain;
    sayQueued('勝利！ 経験値を ' + gain + ' もらった！');
    let any = false;
    party.forEach(function (u) {
      u.exp += gain;
      let guard = 0;
      while (u.exp >= expNeed(u.level) && guard < 12) {
        u.exp -= expNeed(u.level);
        u.level += 1;
        u.maxHp += 8;
        u.atk += 2;
        u.spd += 1;
        any = true;
        sayQueued(u.name + 'は レベル' + u.level + 'に あがった！');
        guard += 1;
      }
      u.hp = u.maxHp;
      u.atb = 0;
      u.charged = false;
      u.faintT = 0;
    });
    if (any) {
      leveledOnce = true;
      AudioKit.level();
    }
  }

  function showResult() {
    screen = 'result';
    phase = 'result';
    leaves = [];
    AudioKit.fanfare();
  }

  function showLose() {
    screen = 'gameover';
    phase = 'gameover';
    AudioKit.lose();
  }

  function startTurn(u) {
    if (!u || u.hp <= 0) return;
    actor = u;
    if (u.side === 'ally') {
      phase = 'command';
      cursor = 0;
      pendingMove = null;
      say(u.name + 'の こうどう！（' + TYPE[u.type].name + 'タイプ）');
      return;
    }
    const action = chooseEnemyAction(u);
    pendingMove = action.move;
    phase = 'windup';
    windup = 0.28;
    say(u.name + 'の こうどう！');
    actor._target = action.target;
  }

  function updateAtb(dt) {
    if (phase !== 'tick') return;
    if (ready.length) {
      const next = ready.shift();
      if (next && next.hp > 0) startTurn(next);
      return;
    }
    const step = 0.04;
    let left = dt;
    while (left > 0 && phase === 'tick') {
      const d = Math.min(step, left);
      left -= d;
      const units = living(party).concat(living(enemies));
      const crossed = [];
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (ready.indexOf(u) >= 0) continue;
        if (u.atb >= 100) { crossed.push(u); continue; }
        u.atb += u.spd * d * 11;
        if (u.atb >= 100) crossed.push(u);
      }
      if (!crossed.length) continue;
      crossed.sort(function (a, b) { return b.atb - a.atb; });
      const first = crossed[0];
      first.atb = 100;
      for (let i = 1; i < crossed.length; i++) {
        crossed[i].atb = 100;
        if (ready.indexOf(crossed[i]) < 0) ready.push(crossed[i]);
      }
      startTurn(first);
      return;
    }
  }

  function startBattle(index) {
    battleIndex = index;
    const battle = CAMPAIGN[index];
    party.forEach(function (u) {
      u.hp = u.maxHp;
      u.atb = 0;
      u.charged = false;
      u.faintT = 0;
    });
    snapshot = party.map(cloneUnit);
    enemies = battle.enemies.map(makeEnemy);
    ready = [];
    actor = null;
    pendingMove = null;
    anim = null;
    windup = 0;
    shown = [];
    queue = battle.intro.slice();
    hold = 0.15;
    floaters = [];
    particles = [];
    leaves = [];
    shake = 0;
    screen = 'battle';
    phase = 'intro';
    logKey = '';
    renderLog();
  }

  function retryBattle() {
    party = snapshot.map(cloneUnit);
    startBattle(battleIndex);
  }

  function goNext() {
    if (battleIndex >= CAMPAIGN.length - 1) {
      screen = 'ending';
      phase = 'ending';
      leaves = [];
      floaters = [];
      particles = [];
      shown = [
        'マグマオウは おおきく ないて、かざんのおくへ かえった。',
        'バクオ、スリケ、ゴンゾは ひなたで ならんだ。',
        '3すくみを つかいこなして、ぼうけんは おわり！',
      ];
      queue = [];
      hold = 0;
      renderLog();
      return;
    }
    startBattle(battleIndex + 1);
  }

  function resetGame() {
    party = makeParty();
    enemies = [];
    battleIndex = 0;
    screen = 'title';
    phase = 'title';
    actor = null;
    ready = [];
    shown = titleLines();
    queue = [];
    hold = 0;
    leaves = [];
    lastGain = 0;
    renderLog();
  }

  function nextLabel() {
    if (battleIndex >= CAMPAIGN.length - 1) return 'おわりを みる';
    if (CAMPAIGN[battleIndex + 1].boss) return 'ボスに いどむ';
    return 'つぎのたたかい';
  }

  function commandChoices() {
    const list = BASIC.map(function (m) {
      return { id: m.id, label: m.name, sub: TYPE[m.type].name + 'タイプ', disabled: false };
    });
    const spec = getSpecial(actor);
    list.push({
      id: 'special',
      label: actor.charged ? spec.name : '必殺',
      sub: actor.charged ? '必殺・' + TYPE[actor.type].name : 'ためるが 必要',
      disabled: !actor.charged,
      ready: !!actor.charged,
    });
    list.push({
      id: 'charge',
      label: 'ためる',
      sub: actor.charged ? 'もう たまっている' : '次に 必殺が出せる',
      disabled: !!actor.charged,
      wide: true,
    });
    return list;
  }

  function targetChoices() {
    const move = pendingMove;
    const type = move.useOwnType ? actor.type : move.type;
    const list = [];
    enemies.forEach(function (e, i) {
      if (e.hp <= 0) return;
      const aff = affText(type, e.type);
      list.push({
        id: 'target:' + i,
        label: e.name,
        sub: TYPE[e.type].name + '・' + aff.text,
        tone: aff.tone,
        disabled: false,
      });
    });
    list.push({ id: 'back', label: 'もどる', sub: 'わざを えらびなおす', wide: true, disabled: false });
    return list;
  }

  function currentChoices() {
    if (screen === 'title') {
      return [{ id: 'start', label: 'ぼうけんに でる', sub: '第1戦から ボスまで', wide: true }];
    }
    if (screen === 'result') {
      return [{ id: 'next', label: nextLabel(), sub: 'HPは すべて かいふく', wide: true }];
    }
    if (screen === 'ending') {
      return [{ id: 'restart', label: 'もういちど あそぶ', sub: 'レベルは 最初から', wide: true }];
    }
    if (screen === 'gameover') {
      return [{ id: 'retry', label: 'このたたかいを やりなおす', sub: 'レベルは のこる', wide: true }];
    }
    if (phase === 'command' && actor) return commandChoices();
    if (phase === 'target' && actor && pendingMove) return targetChoices();
    if (phase === 'intro' || phase === 'resolve' || phase === 'windup' || phase === 'victory' || phase === 'defeat') {
      return [{ id: 'skip', label: 'おくり', sub: 'メッセージを すすめる', wide: true }];
    }
    return [];
  }

  function enabledChoices() {
    return currentChoices().filter(function (c) { return !c.disabled; });
  }

  function activate(id) {
    if (id === 'skip') {
      skipMessages();
      if (phase === 'windup') windup = 0;
      return;
    }
    AudioKit.confirm();
    if (id === 'start' && screen === 'title') { startBattle(0); return; }
    if (id === 'next' && screen === 'result') { goNext(); return; }
    if (id === 'retry' && screen === 'gameover') { retryBattle(); return; }
    if (id === 'restart' && screen === 'ending') { resetGame(); return; }
    if (id === 'back' && phase === 'target') {
      phase = 'command';
      cursor = 0;
      pendingMove = null;
      return;
    }
    if (phase === 'command' && actor) {
      const move = moveById(actor, id);
      if (!move) return;
      if (id === 'special' && !actor.charged) return;
      if (id === 'charge' && actor.charged) return;
      pendingMove = move;
      const foes = living(enemies);
      if (move.kind === 'charge' || foes.length <= 1) {
        beginResolve(actor, move, move.kind === 'charge' ? null : foes[0]);
      } else {
        phase = 'target';
        cursor = 0;
      }
      return;
    }
    if (phase === 'target' && id.indexOf('target:') === 0) {
      const index = Number(id.slice(7));
      const target = enemies[index];
      if (!target || target.hp <= 0 || !pendingMove) return;
      beginResolve(actor, pendingMove, target);
    }
  }

  function renderLog() {
    const key = shown.join('\n');
    if (key === logKey) return;
    logKey = key;
    logEl.textContent = '';
    if (!shown.length) {
      const p = document.createElement('p');
      p.textContent = '　';
      logEl.appendChild(p);
      return;
    }
    shown.forEach(function (line, i) {
      const p = document.createElement('p');
      if (i === shown.length - 1) p.className = 'now';
      p.textContent = line;
      logEl.appendChild(p);
    });
  }

  function renderRoster() {
    const units = (screen === 'title' || screen === 'ending') ? party : party.concat(enemies);
    const key = screen + '|' + units.map(function (u) {
      return [u.uid, u.hp, u.maxHp, Math.floor(u.atb), u.level, u.type, u.charged ? 1 : 0, actor === u ? 1 : 0].join(',');
    }).join(';');
    if (key === rosterKey) return;
    rosterKey = key;
    rosterEl.textContent = '';
    units.forEach(function (u) {
      const card = document.createElement('div');
      card.className = 'card' + (u.side === 'enemy' ? ' enemy' : '') + (actor === u ? ' active' : '') + (u.hp <= 0 ? ' faint' : '');
      card.dataset.type = u.type;
      const ratio = u.maxHp ? Math.max(0, u.hp / u.maxHp) : 0;
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.textContent = u.side === 'ally' ? u.name + ' Lv' + u.level : u.name;
      const hp = document.createElement('span');
      hp.textContent = u.hp + '/' + u.maxHp;
      row.appendChild(name);
      row.appendChild(hp);
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = TYPE[u.type].name + 'タイプ' + (u.charged ? '・ため' : '') + (u.hp <= 0 ? '・たおれた' : '');
      const hpBar = document.createElement('div');
      hpBar.className = 'meter hp' + (ratio <= 0.3 ? ' low' : ratio <= 0.6 ? ' mid' : '');
      const hpFill = document.createElement('span');
      hpFill.style.width = (ratio * 100) + '%';
      hpBar.appendChild(hpFill);
      card.appendChild(row);
      card.appendChild(sub);
      card.appendChild(hpBar);
      if (screen === 'battle' || screen === 'gameover') {
        const atb = document.createElement('div');
        atb.className = 'meter atb';
        const atbFill = document.createElement('span');
        atbFill.style.width = Math.max(0, Math.min(100, u.atb)) + '%';
        atb.appendChild(atbFill);
        card.appendChild(atb);
      }
      rosterEl.appendChild(card);
    });
  }

  function renderPanel() {
    const choices = currentChoices();
    const stat = screen === 'result' ? party.map(function (u) { return u.level + ':' + u.exp + ':' + u.maxHp + ':' + u.atk; }).join(',') : '';
    const key = [screen, phase, actor ? actor.uid : '', lastGain, stat, choices.map(function (c) {
      return c.id + (c.disabled ? 'x' : '') + (c.sub || '');
    }).join(',')].join('|');
    if (key !== panelKey) {
      panelKey = key;
      cursor = 0;
      panelEl.textContent = '';
      panelEl.className = (screen === 'result' || choices.length <= 1) ? 'stack' : 'grid';
      if (screen === 'result') {
        const stats = document.createElement('div');
        stats.className = 'stats';
        const head = document.createElement('p');
        head.textContent = '経験値 +' + lastGain + '　HPは 全快した';
        stats.appendChild(head);
        party.forEach(function (u) {
          const p = document.createElement('p');
          p.textContent = u.name + '  Lv' + u.level + '  HP' + u.maxHp + '  こうげき' + u.atk + '  すばやさ' + u.spd + '  つぎまで' + (expNeed(u.level) - u.exp);
          stats.appendChild(p);
        });
        panelEl.appendChild(stats);
      }
      if (!choices.length && screen === 'battle' && phase === 'tick') {
        const wait = document.createElement('p');
        wait.className = 'wait';
        wait.textContent = 'ATBゲージが いっぱいになると こうどうできる';
        panelEl.appendChild(wait);
      }
      choices.forEach(function (choice) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice' + (choice.wide ? ' wide' : '') + (choice.ready ? ' ready' : '');
        b.disabled = !!choice.disabled;
        b.dataset.cmd = choice.id;
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = choice.label;
        const sub = document.createElement('span');
        sub.className = 'sub';
        sub.textContent = choice.sub || '';
        if (choice.tone) sub.dataset.tone = choice.tone;
        b.appendChild(nm);
        b.appendChild(sub);
        b.addEventListener('click', function () { activate(choice.id); });
        panelEl.appendChild(b);
      });
    }
    const buttons = Array.prototype.slice.call(panelEl.querySelectorAll('button.choice'));
    const enabled = buttons.filter(function (b) { return !b.disabled; });
    if (cursor >= enabled.length) cursor = 0;
    buttons.forEach(function (b) { b.classList.remove('selected'); });
    if (enabled[cursor]) enabled[cursor].classList.add('selected');
  }

  function hintText() {
    if (screen === 'title') return '操作: タップ、または ↑↓ と Enter。M で おと。数字キーでも選べる。';
    if (screen === 'battle' && phase === 'command') return (actor ? actor.name + 'の こうどう。' : '') + ' ↑↓でえらぶ Enterでけってい。';
    if (screen === 'battle' && phase === 'target') return 'こうげきする あいてを えらぶ。Esc でもどる。';
    if (phase === 'intro' || phase === 'resolve' || phase === 'windup' || phase === 'victory' || phase === 'defeat') return 'Enter・タップ・おくり で メッセージをすすめる。';
    if (screen === 'battle' && phase === 'tick') return 'すばやい 恐竜から ゲージが たまる。';
    if (screen === 'result') return 'レベルが上がると HP・こうげき・すばやさが 増える。';
    if (screen === 'gameover') return 'やりなおしても、あがったレベルは のこる。';
    if (screen === 'ending') return 'クリア。もういちど あそべる。';
    return '';
  }

  function subtitleText() {
    if (screen === 'title') return '3たいの きょうりゅうで たたかう';
    if (screen === 'ending') return 'ぼうけん クリア';
    if (screen === 'gameover') return 'まけてしまった';
    if (screen === 'result') return '勝利！ 経験値 +' + lastGain;
    const b = CAMPAIGN[battleIndex];
    if (!b) return '';
    return b.title + '　' + b.place + '　（' + (battleIndex + 1) + '/4）';
  }

  function columnSpots(units, x) {
    const gap = 28;
    if (!units.length) return [];
    const heights = units.map(function (u) {
      return FRAMES[LOOKS[u.look].shape].h * u.scale;
    });
    const total = heights.reduce(function (sum, h) { return sum + h; }, 0) + gap * (heights.length - 1);
    let cursor = Math.max(118, (500 - total) / 2);
    return heights.map(function (h) {
      const feet = cursor + h;
      cursor += h + gap;
      return { x: x, y: feet };
    });
  }

  function spots() {
    if (screen === 'title' || screen === 'ending') {
      return {
        allies: [{ x: 190, y: 450 }, { x: 480, y: 470 }, { x: 770, y: 450 }],
        enemies: [],
      };
    }
    return {
      allies: columnSpots(party, 210),
      enemies: columnSpots(enemies, 750),
    };
  }

  function layoutOf(u) {
    const s = spots();
    const list = u.side === 'ally' ? party : enemies;
    const pos = u.side === 'ally' ? s.allies : s.enemies;
    const i = list.indexOf(u);
    if (i < 0 || !pos[i]) return { x: 480, y: 360 };
    return pos[i];
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    const aspect = 16 / 9;
    let w = rect.width;
    let h = w / aspect;
    if (h > rect.height) {
      h = rect.height;
      w = h * aspect;
    }
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(480, Math.round(w * dpr));
    const bh = Math.round(bw * 9 / 16);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    viewScale = canvas.width / 960;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function drawOutlinedText(text, x, y, fill, size) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1f1a17';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawBackground(now) {
    const battle = CAMPAIGN[battleIndex];
    const volcanic = screen !== 'title' && screen !== 'ending' && battle && battle.boss;
    const g = ctx.createLinearGradient(0, 0, 0, 540);
    if (screen === 'ending') {
      g.addColorStop(0, '#f4a261');
      g.addColorStop(0.45, '#f6d28b');
      g.addColorStop(1, '#7f9a56');
    } else if (volcanic) {
      g.addColorStop(0, '#3d1f2b');
      g.addColorStop(0.5, '#8c3a3a');
      g.addColorStop(1, '#4a2c1a');
    } else if (screen === 'gameover') {
      g.addColorStop(0, '#4b5563');
      g.addColorStop(0.5, '#6b7280');
      g.addColorStop(1, '#3f6212');
    } else {
      g.addColorStop(0, '#7eb6d6');
      g.addColorStop(0.42, '#f3d7a1');
      g.addColorStop(1, '#5f8f45');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 540);

    if (!volcanic) {
      ctx.fillStyle = screen === 'ending' ? '#ffd166' : '#ffe8a3';
      ctx.beginPath();
      ctx.arc(screen === 'ending' ? 700 : 790, screen === 'ending' ? 150 : 100, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      for (let i = 0; i < 3; i++) {
        const cx = ((now * 0.02 + i * 320) % 1100) - 80;
        const cy = 70 + i * 28;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 36, cy + 6, 32, 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#5c3a3a';
      ctx.beginPath();
      ctx.moveTo(40, 280);
      ctx.lineTo(210, 90);
      ctx.lineTo(390, 280);
      ctx.fill();
      ctx.fillStyle = '#ff6d00';
      ctx.beginPath();
      ctx.moveTo(180, 150);
      ctx.lineTo(210, 96);
      ctx.lineTo(250, 156);
      ctx.fill();
      ctx.fillStyle = 'rgba(80, 80, 80, 0.35)';
      ctx.beginPath();
      ctx.ellipse(230, 80, 28, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = volcanic ? '#3f2a22' : '#466b38';
    ctx.beginPath();
    ctx.moveTo(0, 300);
    ctx.quadraticCurveTo(240, 250, 480, 300);
    ctx.quadraticCurveTo(720, 350, 960, 270);
    ctx.lineTo(960, 540);
    ctx.lineTo(0, 540);
    ctx.fill();
    ctx.fillStyle = volcanic ? '#2a1c16' : '#3d5c30';
    ctx.fillRect(0, 430, 960, 110);

    if (volcanic) {
      ctx.fillStyle = '#ff6d00';
      for (let i = 0; i < 5; i++) {
        const x = 80 + i * 180;
        const pulse = 0.5 + Math.sin(now / 200 + i) * 0.5;
        ctx.globalAlpha = 0.35 + pulse * 0.4;
        ctx.fillRect(x, 470, 40, 6);
        ctx.fillRect(x + 16, 476, 8, 18);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = '#2d6a4f';
      for (let i = 0; i < 8; i++) {
        const x = 30 + i * 120;
        const y = 500 + (i % 2) * 16;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y - 28);
        ctx.lineTo(x + 24, y);
        ctx.fill();
      }
    }
  }

  function drawShape(look, destX, destY, scale, flip, flash, alpha) {
    const frame = FRAMES[look.shape];
    const parts = frame.parts.concat(look.extra || []);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (!flash) {
      ctx.fillStyle = '#1f1a17';
      for (let i = 0; i < parts.length; i++) {
        let px = parts[i][0];
        const py = parts[i][1];
        const w = parts[i][2];
        const h = parts[i][3];
        if (flip) px = frame.w - px - w;
        ctx.fillRect(destX + px * scale - 2, destY + py * scale - 2, w * scale + 4, h * scale + 4);
      }
    }
    for (let i = 0; i < parts.length; i++) {
      let px = parts[i][0];
      const py = parts[i][1];
      const w = parts[i][2];
      const h = parts[i][3];
      const key = parts[i][4];
      if (flip) px = frame.w - px - w;
      ctx.fillStyle = flash ? '#fffaf0' : (look.colors[key] || look.colors.body);
      ctx.fillRect(destX + px * scale, destY + py * scale, w * scale, h * scale);
    }
    ctx.restore();
  }

  function drawUnit(u, now) {
    const pos = layoutOf(u);
    const look = LOOKS[u.look];
    const frame = FRAMES[look.shape];
    const bob = reduceMotion || u.hp <= 0 ? 0 : Math.sin(now / 280 + pos.x) * 3;
    const drop = u.faintT * 18;
    const sw = frame.w * u.scale;
    const sh = frame.h * u.scale;
    let ox = 0;
    if (anim && anim.actor === u && anim.move.kind !== 'charge') {
      const p = Math.min(1, anim.t / 0.36);
      const dir = u.side === 'ally' ? 1 : -1;
      ox = Math.sin(p * Math.PI) * 70 * dir;
    }
    const left = pos.x - sw / 2 + ox;
    const top = pos.y - sh + bob + drop;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(pos.x + ox, pos.y + 6, sw * 0.32, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (u.charged && u.hp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(now / 120) * 0.15;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(pos.x + ox, top + sh * 0.45, sw * 0.55, sh * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const flashing = anim && anim.target === u && anim.applied && (anim.t - anim.hitAt) < 0.12 && Math.floor(anim.t * 40) % 2 === 0;
    drawShape(look, left, top, u.scale, u.side === 'enemy', flashing, u.hp > 0 ? 1 : 0.5);
    if (actor === u && (phase === 'command' || phase === 'target' || phase === 'windup' || phase === 'resolve')) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.strokeRect(left - 6, top - 6, sw + 12, sh + 12);
    }
    const ratio = u.maxHp ? u.hp / u.maxHp : 0;
    const barW = Math.max(70, sw * 0.8);
    const barX = pos.x + ox - barW / 2;
    const barY = pos.y + 6;
    ctx.fillStyle = 'rgba(20,16,12,0.55)';
    ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = ratio <= 0.3 ? '#dc2626' : ratio <= 0.6 ? '#d97706' : '#4ade80';
    ctx.fillRect(barX, barY, barW * ratio, 8);
    if (screen === 'battle' && u.hp > 0) {
      ctx.fillStyle = 'rgba(20,16,12,0.45)';
      ctx.fillRect(barX, barY + 10, barW, 5);
      ctx.fillStyle = '#f4c430';
      ctx.fillRect(barX, barY + 10, barW * Math.max(0, Math.min(1, u.atb / 100)), 5);
    }
  }

  function drawFloaters() {
    floaters.forEach(function (f) {
      ctx.globalAlpha = 1 - f.t / f.life;
      drawOutlinedText(f.text, f.x, f.y - f.t * 46, f.color, 36);
      ctx.globalAlpha = 1;
    });
    particles.forEach(function (p) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.s, p.s);
      ctx.globalAlpha = 1;
    });
    if (screen === 'result' || screen === 'ending') {
      leaves.forEach(function (leaf) {
        ctx.fillStyle = leaf.c;
        ctx.fillRect(leaf.x, leaf.y, leaf.s, leaf.s * 0.6);
      });
    }
  }

  function drawScene(now) {
    const word = screen === 'result' ? 'かち！' : screen === 'gameover' ? 'まけ…' : screen === 'ending' ? 'クリア！' : '';
    if (word) drawOutlinedText(word, 480, 86, '#fffaf0', 64);
    if (screen === 'title') drawOutlinedText('かみ・ひっかき・たいあたり', 480, 78, '#fff7e8', 28);

    const list = [];
    party.forEach(function (u) { list.push(u); });
    if (screen !== 'title' && screen !== 'ending') enemies.forEach(function (u) { list.push(u); });
    list.sort(function (a, b) { return layoutOf(a).y - layoutOf(b).y; });
    list.forEach(function (u) { drawUnit(u, now); });
    drawFloaters();
  }

  function draw(now) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    if (shake > 0 && !reduceMotion) {
      const m = shake * 14;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawBackground(now);
    drawScene(now);
  }

  function updateJuice(dt, now) {
    shake = Math.max(0, shake - dt);
    floaters.forEach(function (f) { f.t += dt; });
    floaters = floaters.filter(function (f) { return f.t < f.life; });
    particles.forEach(function (p) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
    });
    particles = particles.filter(function (p) { return p.t < p.life; });
    const units = party.concat(enemies);
    units.forEach(function (u) {
      if (u.hp <= 0) u.faintT = Math.min(1, u.faintT + dt * 2.2);
      else u.faintT = 0;
    });
    if (screen === 'result' || screen === 'ending') {
      if (!leaves.length) {
        for (let i = 0; i < 16; i++) {
          leaves.push({
            x: Math.random() * 960,
            y: Math.random() * 540,
            s: 5 + Math.random() * 6,
            v: 24 + Math.random() * 30,
            c: Math.random() > 0.5 ? '#f4a261' : '#ffe566',
          });
        }
      }
      leaves.forEach(function (leaf) {
        leaf.y += leaf.v * dt;
        leaf.x += Math.sin((now + leaf.y) / 180) * 18 * dt;
        if (leaf.y > 560) leaf.y = -12;
      });
    }
  }

  function updateAnim(dt) {
    if (phase !== 'resolve' || !anim) return;
    const rate = Math.min(debugSpeed, 4);
    anim.t += dt * rate;
    if (!anim.applied && anim.t >= 0.16) {
      anim.applied = true;
      anim.hitAt = anim.t;
      applyAnim();
    }
    if (anim.t >= 0.46) anim.done = true;
  }

  function frame(ts) {
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    const fast = dt * debugSpeed;
    updateJuice(dt, ts);
    updateAnim(dt);
    updateMessages(fast);
    if (phase === 'windup') {
      windup -= fast;
      if (windup <= 0 && actor && pendingMove) beginResolve(actor, pendingMove, actor._target || null);
    }
    if (phase === 'resolve' && anim && anim.done && messagesIdle()) finishResolve();
    if (phase === 'victory' && messagesIdle()) showResult();
    if (phase === 'defeat' && messagesIdle()) showLose();
    if (phase === 'intro' && messagesIdle()) phase = 'tick';
    if (phase === 'tick') updateAtb(fast);
    subtitleEl.textContent = subtitleText();
    hintEl.textContent = hintText();
    renderRoster();
    renderPanel();
    draw(ts);
    requestAnimationFrame(frame);
  }

  function moveCursor(dir) {
    const list = enabledChoices();
    if (!list.length) return;
    cursor = (cursor + dir + list.length) % list.length;
    AudioKit.cursor();
    renderPanel();
  }

  function onKey(e) {
    const key = e.key;
    if (key === 'm' || key === 'M') {
      e.preventDefault();
      toggleMute();
      return;
    }
    const nav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape', 'Backspace', 'x', 'X'];
    if (nav.indexOf(key) >= 0 || /^[1-5]$/.test(key)) e.preventDefault();
    if ((key === 'Enter' || key === ' ') && e.repeat) return;
    if (key === 'ArrowUp' || key === 'ArrowLeft') moveCursor(-1);
    else if (key === 'ArrowDown' || key === 'ArrowRight') moveCursor(1);
    else if (key === 'Escape' || key === 'Backspace' || key === 'x' || key === 'X') {
      if (phase === 'target') activate('back');
    } else if (/^[1-5]$/.test(key)) {
      const list = currentChoices();
      const index = Number(key) - 1;
      if (list[index] && !list[index].disabled) activate(list[index].id);
    } else if (key === 'Enter' || key === ' ') {
      const list = enabledChoices();
      if (!list.length) {
        skipMessages();
        if (phase === 'windup') windup = 0;
      } else activate(list[cursor].id);
    }
  }

  function toggleMute() {
    const muted = AudioKit.toggle();
    muteBtn.textContent = muted ? 'おと オフ' : 'おと オン';
    muteBtn.setAttribute('aria-pressed', muted ? 'false' : 'true');
  }

  muteBtn.addEventListener('click', function () {
    AudioKit.unlock();
    toggleMute();
  });
  logEl.addEventListener('click', function () {
    skipMessages();
    if (phase === 'windup') windup = 0;
  });
  stage.addEventListener('click', function () {
    skipMessages();
    if (phase === 'windup') windup = 0;
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', function () { AudioKit.unlock(); }, { once: false });
  window.addEventListener('resize', resize);

  party = makeParty();
  shown = titleLines();
  renderLog();
  muteBtn.setAttribute('aria-pressed', 'true');
  resize();
  requestAnimationFrame(frame);

  window.__kyouryu = {
    setSpeed: function (n) { debugSpeed = Math.max(1, Number(n) || 1); },
    getState: function () {
      return {
        screen: screen,
        phase: phase,
        battleIndex: battleIndex,
        lastGain: lastGain,
        leveledOnce: leveledOnce,
        actor: actor ? { name: actor.name, side: actor.side, type: actor.type, charged: actor.charged } : null,
        log: shown.slice(),
        history: history.slice(),
        queue: queue.length,
        party: party.map(function (u) {
          return { name: u.name, level: u.level, hp: u.hp, maxHp: u.maxHp, atk: u.atk, spd: u.spd, exp: u.exp, type: u.type, charged: u.charged, atb: Math.floor(u.atb) };
        }),
        enemies: enemies.map(function (u) {
          return { name: u.name, hp: u.hp, maxHp: u.maxHp, type: u.type, charged: u.charged, boss: u.boss, atb: Math.floor(u.atb) };
        }),
        choices: currentChoices().map(function (c) { return c.id; }),
      };
    },
  };
})();
