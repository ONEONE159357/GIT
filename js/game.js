/* ============================================================
 * 坦克大战 · Tank Battle
 * 一个致敬 FC《Battle City》的网页坦克游戏。
 * 纯原生 JavaScript + Canvas 2D，没有任何第三方依赖。
 *
 * 玩法：守住底部的基地（老鹰），消灭关卡内全部敌军。
 *      砖墙可被打穿，钢墙只有满级火力才能击穿，水域阻挡坦克但子弹可飞过。
 * ============================================================ */
(() => {
  'use strict';

  /* =========================================================
   * 1. 世界参数
   * ======================================================= */
  const TILE = 32;                 // 每格像素
  const COLS = 20;                 // 横向格数
  const ROWS = 15;                 // 纵向格数
  const W = COLS * TILE;           // 640
  const H = ROWS * TILE;           // 480

  const TANK = 28;                 // 坦克边长
  const TOFF = (TILE - TANK) / 2;  // 坦克贴格偏移 = 2
  const BULLET = 6;                // 子弹边长

  // 地形
  const EMPTY = 0, BRICK = 1, STEEL = 2, WATER = 3, TREE = 4, BASE = 5;
  const CHAR_TILE = { '.': EMPTY, '#': BRICK, '=': STEEL, '~': WATER, '*': TREE, 'E': BASE };

  // 方向
  const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  /* =========================================================
   * 2. 关卡数据
   *    # 砖墙  = 钢墙  ~ 水域  * 树林  E 基地  . 空地
   * ======================================================= */
  const LEVELS = [
    {
      title: '钢铁防线',
      player: [5, 14],
      spawns: [[1, 0], [9, 0], [18, 0]],
      wave: ['basic', 'basic', 'basic', 'fast', 'basic', 'power', 'basic', 'fast', 'basic', 'power'],
      maxAlive: 4,
      map: [
        '....................',
        '..#..#..#..#..#..#..',
        '..#..#..#..#..#..#..',
        '....................',
        '..#..#..#..#..#..#..',
        '..#..#..#..#..#..#..',
        '....................',
        '==..==..==..==..==..',
        '....................',
        '..#..#..#..#..#..#..',
        '..#..#..#..#..#..#..',
        '....................',
        '........####........',
        '........#EE#........',
        '........#EE#........'
      ]
    },
    {
      title: '沼泽伏击',
      player: [3, 14],
      spawns: [[1, 0], [10, 0], [18, 0]],
      wave: ['basic', 'fast', 'basic', 'power', 'fast', 'basic', 'armor', 'power', 'fast', 'basic', 'armor', 'power'],
      maxAlive: 4,
      map: [
        '....................',
        '..==....##....==....',
        '..==....##....==....',
        '....................',
        '~~..####..####..~~..',
        '~~..####..####..~~..',
        '....................',
        '.##..####..####..##.',
        '....................',
        '*..~~..****..~~..*..',
        '*..~~..****..~~..*..',
        '....................',
        '..##....####....##..',
        '..##....#EE#....##..',
        '........#EE#........'
      ]
    },
    {
      title: '迷宫终局',
      player: [4, 14],
      spawns: [[1, 0], [9, 0], [17, 0]],
      wave: ['fast', 'basic', 'power', 'armor', 'fast', 'power', 'basic', 'armor', 'fast', 'power', 'armor', 'basic', 'power', 'armor'],
      maxAlive: 5,
      map: [
        '....................',
        '..##..======..##....',
        '..##..==..==..##....',
        '......==..==........',
        '####..==..==..####..',
        '......==..==........',
        '..~~~~....~~~~......',
        '..~~~~....~~~~......',
        '......####..####....',
        '..##..####..####....',
        '..##................',
        '......####..####....',
        '..##..####..####..##',
        '..##.....#EE#....##.',
        '.........#EE#.......'
      ]
    }
  ];

  /* =========================================================
   * 3. 坦克属性
   * ======================================================= */
  const ENEMIES = {
    basic: { speed: 52, hp: 1, reload: 1.7, bulletSpeed: 250, score: 100, body: '#c3d1e0', dark: '#5b6b7d', trim: '#eef4fb', label: '普通' },
    fast:  { speed: 100, hp: 1, reload: 2.0, bulletSpeed: 300, score: 200, body: '#8fe36a', dark: '#3a7d33', trim: '#d8ffcb', label: '快速' },
    power: { speed: 64, hp: 1, reload: 0.95, bulletSpeed: 400, score: 300, body: '#ffd166', dark: '#946b12', trim: '#fff3cf', label: '火力' },
    armor: { speed: 44, hp: 3, reload: 1.3, bulletSpeed: 270, score: 400, body: '#ff8a8a', dark: '#8a2e2e', trim: '#ffd9d9', label: '装甲' }
  };

  const PLAYER_LEVELS = [
    null, // 0 占位
    { reload: 0.55, maxBullets: 1, bulletSpeed: 310, power: 1 },
    { reload: 0.40, maxBullets: 1, bulletSpeed: 350, power: 1 },
    { reload: 0.40, maxBullets: 2, bulletSpeed: 350, power: 1 },
    { reload: 0.30, maxBullets: 2, bulletSpeed: 390, power: 2 }
  ];

  const PLAYER_BASE_SPEED = 108;

  /* =========================================================
   * 4. DOM / 画布
   * ======================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const touchBar = document.getElementById('touch');
  const hud = {
    score: document.getElementById('hud-score'),
    lives: document.getElementById('hud-lives'),
    level: document.getElementById('hud-level'),
    enemies: document.getElementById('hud-enemies')
  };

  ctx.imageSmoothingEnabled = false;

  /* =========================================================
   * 5. 音效（WebAudio，零素材）
   * ======================================================= */
  const Sound = {
    ac: null,
    muted: false,
    noiseBuf: null,

    unlock() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      const len = Math.floor(this.ac.sampleRate * 0.4);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noiseBuf = buf;
    },

    tone(freq, dur, type = 'square', vol = 0.05, slideTo = null, at = 0) {
      if (this.muted || !this.ac) return;
      const t0 = this.ac.currentTime + at;
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    noise(dur, vol = 0.09, freq = 1400, at = 0) {
      if (this.muted || !this.ac || !this.noiseBuf) return;
      const t0 = this.ac.currentTime + at;
      const src = this.ac.createBufferSource();
      src.buffer = this.noiseBuf;
      const filter = this.ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq, t0);
      filter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
      const gain = this.ac.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(this.ac.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },

    shoot() { this.tone(680, 0.06, 'square', 0.035, 240); this.noise(0.05, 0.03, 2400); },
    hitWall() { this.noise(0.06, 0.05, 900); },
    explosion() { this.noise(0.32, 0.11, 780); this.tone(120, 0.28, 'sawtooth', 0.05, 40); },
    powerup() { this.tone(660, 0.08, 'square', 0.05); this.tone(880, 0.09, 'square', 0.05, null, 0.09); this.tone(1180, 0.12, 'square', 0.05, null, 0.18); },
    gameOver() { this.tone(420, 0.3, 'sawtooth', 0.06, 160); this.tone(180, 0.55, 'sawtooth', 0.06, 60, 0.28); },
    levelClear() { this.tone(523, 0.11, 'square', 0.05); this.tone(659, 0.11, 'square', 0.05, null, 0.12); this.tone(784, 0.11, 'square', 0.05, null, 0.24); this.tone(1046, 0.2, 'square', 0.05, null, 0.36); }
  };

  /* =========================================================
   * 6. 全局状态
   * ======================================================= */
  const G = {
    screen: 'menu',        // menu | playing | paused | levelclear | gameover | victory
    score: 0,
    best: Number(localStorage.getItem('tank-best') || 0) || 0,
    lives: 3,
    levelIndex: 0,
    playerLevel: 1,
    kills: 0,

    grid: null,
    base: null,
    player: null,
    tanks: [],
    bullets: [],
    particles: [],
    powerups: [],
    spawnQueue: [],
    spawnTimer: 0,
    spawnPoint: 0,
    maxAlive: 4,
    respawnTimer: 0,
    clearTimer: 0,
    freeze: 0,
    shake: 0,
    time: 0,
    preview: null
  };

  const keys = { up: false, down: false, left: false, right: false, fire: false };

  /* =========================================================
   * 7. 工具函数
   * ======================================================= */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const snapToTile = (v) => Math.round((v - TOFF) / TILE) * TILE + TOFF;
  const centerX = (t) => t.x + TANK / 2;
  const centerY = (t) => t.y + TANK / 2;

  /* =========================================================
   * 8. 关卡装载
   * ======================================================= */
  function parseLevel(def) {
    if (!def || !Array.isArray(def.map) || def.map.length !== ROWS) {
      throw new Error('关卡地图行数错误');
    }
    const grid = [];
    let bc0 = Infinity, bc1 = -1, br0 = Infinity, br1 = -1;

    for (let r = 0; r < ROWS; r++) {
      const row = def.map[r];
      if (typeof row !== 'string' || row.length !== COLS) {
        throw new Error('第 ' + (r + 1) + ' 行地图宽度应为 ' + COLS + '，实际 ' + (row ? row.length : 0));
      }
      const line = new Array(COLS);
      for (let c = 0; c < COLS; c++) {
        const v = CHAR_TILE[row[c]];
        if (v === undefined) throw new Error('未知地图字符：' + row[c]);
        line[c] = v;
        if (v === BASE) {
          bc0 = Math.min(bc0, c); bc1 = Math.max(bc1, c);
          br0 = Math.min(br0, r); br1 = Math.max(br1, r);
        }
      }
      grid.push(line);
    }

    if (bc1 < 0) throw new Error('关卡缺少基地（E）');

    return {
      grid,
      base: {
        x: bc0 * TILE,
        y: br0 * TILE,
        w: (bc1 - bc0 + 1) * TILE,
        h: (br1 - br0 + 1) * TILE,
        cx: (bc0 + (bc1 - bc0 + 1) / 2) * TILE,
        cy: (br0 + (br1 - br0 + 1) / 2) * TILE,
        alive: true
      }
    };
  }

  function loadLevel(index) {
    const def = LEVELS[index];
    if (!def) return;

    const parsed = parseLevel(def);
    G.levelIndex = index;
    G.grid = parsed.grid;
    G.base = parsed.base;
    G.tanks = [];
    G.bullets = [];
    G.particles = [];
    G.powerups = [];
    G.player = null;
    G.respawnTimer = 0;
    G.clearTimer = 0;
    G.freeze = 0;
    G.spawnTimer = 1.2;
    G.spawnPoint = 0;
    G.maxAlive = def.maxAlive || 4;
    G.spawnQueue = def.wave.slice();
    G.playerLevel = 1;

    spawnPlayer();
    syncHud();
  }

  function spawnPlayer() {
    const def = LEVELS[G.levelIndex];
    const [col, row] = def.player;
    const p = makeTank({
      team: 'player',
      x: col * TILE + TOFF,
      y: row * TILE + TOFF,
      dir: UP,
      speed: PLAYER_BASE_SPEED,
      hp: 1,
      reloadTime: PLAYER_LEVELS[G.playerLevel].reload,
      bulletSpeed: PLAYER_LEVELS[G.playerLevel].bulletSpeed,
      body: '#f4c95d',
      dark: '#9a6f12',
      trim: '#fff0bf'
    });
    p.shield = 3;
    p.spawn = 0;
    G.player = p;
    G.tanks.push(p);
  }

  function makeTank(o) {
    return {
      team: o.team,
      x: o.x,
      y: o.y,
      dir: o.dir,
      speed: o.speed,
      hp: o.hp,
      maxHp: o.hp,
      reload: 0,
      reloadTime: o.reloadTime,
      bulletSpeed: o.bulletSpeed,
      body: o.body,
      dark: o.dark,
      trim: o.trim,
      type: o.type || 'player',
      label: o.label || '',
      score: o.score || 0,
      alive: true,
      spawn: o.spawn || 0,
      shield: 0,
      think: 0,
      stuck: 0,
      bonus: false,
      flash: 0
    };
  }

  /* =========================================================
   * 9. 碰撞
   * ======================================================= */
  function tankHitsWorld(tank, nx, ny) {
    if (nx < 0 || ny < 0 || nx + TANK > W || ny + TANK > H) return true;

    const c0 = Math.floor(nx / TILE);
    const c1 = Math.floor((nx + TANK - 0.01) / TILE);
    const r0 = Math.floor(ny / TILE);
    const r1 = Math.floor((ny + TANK - 0.01) / TILE);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const v = G.grid[r][c];
        if (v === BRICK || v === STEEL || v === WATER || v === BASE) return true;
      }
    }

    for (let i = 0; i < G.tanks.length; i++) {
      const o = G.tanks[i];
      if (o === tank || !o.alive || o.spawn > 0) continue;
      if (nx < o.x + TANK && nx + TANK > o.x && ny < o.y + TANK && ny + TANK > o.y) return true;
    }
    return false;
  }

  function setDir(tank, dir) {
    if (tank.dir === dir) return;
    const ox = tank.x, oy = tank.y;
    tank.dir = dir;
    // 转向时轻微吸附到格心，避免卡在狭窄路口
    if (dir === UP || dir === DOWN) tank.x = snapToTile(tank.x);
    else tank.y = snapToTile(tank.y);
    if (tankHitsWorld(tank, tank.x, tank.y)) {
      tank.x = ox;
      tank.y = oy;
    }
  }

  function tryMove(tank, dir, dist) {
    let done = 0;
    while (done < dist) {
      const step = Math.min(2, dist - done);
      const nx = tank.x + DX[dir] * step;
      const ny = tank.y + DY[dir] * step;
      if (tankHitsWorld(tank, nx, ny)) break;
      tank.x = nx;
      tank.y = ny;
      done += step;
    }
    return done;
  }

  /* =========================================================
   * 10. 射击 / 子弹
   * ======================================================= */
  function tryShoot(tank) {
    if (!tank.alive || tank.spawn > 0 || tank.reload > 0) return false;

    const lvl = tank.team === 'player' ? PLAYER_LEVELS[G.playerLevel] : null;
    const maxBullets = lvl ? lvl.maxBullets : 1;
    let mine = 0;
    for (let i = 0; i < G.bullets.length; i++) if (G.bullets[i].owner === tank) mine++;
    if (mine >= maxBullets) return false;

    const speed = tank.bulletSpeed;
    const cx = centerX(tank) + DX[tank.dir] * (TANK / 2 + 2);
    const cy = centerY(tank) + DY[tank.dir] * (TANK / 2 + 2);

    G.bullets.push({
      x: cx - BULLET / 2,
      y: cy - BULLET / 2,
      dir: tank.dir,
      speed,
      team: tank.team,
      owner: tank,
      power: lvl ? lvl.power : 1,
      dead: false
    });

    tank.reload = tank.reloadTime;
    tank.flash = 0.07;
    Sound.shoot();
    return true;
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      let remain = b.speed * dt;

      while (remain > 0 && !b.dead) {
        const step = Math.min(4, remain);
        remain -= step;
        b.x += DX[b.dir] * step;
        b.y += DY[b.dir] * step;
        resolveBullet(b);
      }

      if (!b.dead && (b.x < -16 || b.y < -16 || b.x > W + 16 || b.y > H + 16)) b.dead = true;
      if (b.dead) {
        if (b.deadFx) b.deadFx();
        G.bullets.splice(i, 1);
      }
    }
  }

  function resolveBullet(b) {
    // —— 打坦克 ——
    for (let i = 0; i < G.tanks.length; i++) {
      const t = G.tanks[i];
      if (!t.alive || t.spawn > 0 || t.team === b.team) continue;
      if (b.x < t.x + TANK && b.x + BULLET > t.x && b.y < t.y + TANK && b.y + BULLET > t.y) {
        b.dead = true;
        hitTank(t, b);
        return;
      }
    }

    // —— 打地形 ——
    const cx = b.x + BULLET / 2;
    const cy = b.y + BULLET / 2;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) { b.dead = true; return; }

    const col = Math.floor(cx / TILE);
    const row = Math.floor(cy / TILE);
    const v = G.grid[row][col];

    if (v === BRICK) {
      G.grid[row][col] = EMPTY;
      b.dead = true;
      debris(col * TILE + TILE / 2, row * TILE + TILE / 2);
      Sound.hitWall();
      return;
    }
    if (v === STEEL) {
      b.dead = true;
      if (b.power >= 2) {
        G.grid[row][col] = EMPTY;
        debris(col * TILE + TILE / 2, row * TILE + TILE / 2, '#c9d8e8');
        Sound.hitWall();
      } else {
        spark(cx, cy);
        Sound.hitWall();
      }
      return;
    }
    if (v === BASE) {
      b.dead = true;
      if (G.base.alive) destroyBase();
      return;
    }

    // —— 子弹对撞 ——
    for (let i = 0; i < G.bullets.length; i++) {
      const o = G.bullets[i];
      if (o === b || o.dead || o.team === b.team) continue;
      if (b.x < o.x + BULLET && b.x + BULLET > o.x && b.y < o.y + BULLET && b.y + BULLET > o.y) {
        o.dead = true;
        b.dead = true;
        spark(cx, cy);
        return;
      }
    }
  }

  function hitTank(t, bullet) {
    if (t.shield > 0) {
      spark(bullet.x, bullet.y);
      return;
    }
    t.hp -= 1;
    t.flash = 0.1;
    if (t.hp > 0) {
      spark(bullet.x, bullet.y);
      Sound.hitWall();
      return;
    }
    killTank(t);
  }

  function killTank(t) {
    t.alive = false;
    t.hp = 0;
    explode(t.x + TANK / 2, t.y + TANK / 2, t.team === 'player' ? 1.6 : 1.2);

    if (t.team === 'player') {
      G.lives -= 1;
      G.player = null;
      syncHud();
      if (G.lives <= 0) endGame(false);
      else G.respawnTimer = 1.3;
      return;
    }

    G.score += t.score;
    G.kills += 1;
    syncHud();

    if (t.bonus) dropPowerup(t.x + TANK / 2, t.y + TANK / 2);
  }

  /* =========================================================
   * 11. 玩家
   * ======================================================= */
  function updatePlayer(dt) {
    const p = G.player;
    if (!p || !p.alive) return;

    p.reload = Math.max(0, p.reload - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.flash = Math.max(0, p.flash - dt);

    const lvl = PLAYER_LEVELS[G.playerLevel];
    p.reloadTime = lvl.reload;
    p.bulletSpeed = lvl.bulletSpeed;

    let dir = -1;
    if (keys.up) dir = UP;
    else if (keys.down) dir = DOWN;
    else if (keys.left) dir = LEFT;
    else if (keys.right) dir = RIGHT;

    if (dir >= 0) {
      setDir(p, dir);
      tryMove(p, dir, p.speed * dt);
    }

    if (keys.fire) tryShoot(p);
  }

  /* =========================================================
   * 12. 敌人 AI
   * ======================================================= */
  function updateEnemies(dt) {
    for (let i = 0; i < G.tanks.length; i++) {
      const e = G.tanks[i];
      if (!e.alive || e.team !== 'enemy') continue;

      e.flash = Math.max(0, e.flash - dt);

      if (e.spawn > 0) {
        e.spawn -= dt;
        continue;
      }
      if (G.freeze > 0) continue;

      e.reload = Math.max(0, e.reload - dt);
      e.think -= dt;

      if (e.think <= 0) {
        e.think = rand(0.45, 1.1);
        chooseDir(e);
      }

      const want = e.speed * dt;
      const moved = tryMove(e, e.dir, want);
      if (moved < want * 0.6) {
        e.stuck += dt;
        if (e.stuck > 0.1) {
          e.stuck = 0;
          chooseDir(e);
          e.think = rand(0.35, 0.8);
        }
      } else {
        e.stuck = 0;
      }

      if (e.reload <= 0 && (lineOfSight(e) || Math.random() < 0.004)) {
        tryShoot(e);
        e.reload = e.reloadTime * rand(0.85, 1.5);
      }
    }
  }

  function chooseDir(e) {
    if (G.base.alive && Math.random() < 0.55) {
      // 冲基地
      return steerTo(e, G.base.cx, G.base.cy);
    }
    if (G.player && G.player.alive && Math.random() < 0.7) {
      return steerTo(e, centerX(G.player), centerY(G.player));
    }
    return steerTo(e, G.base.cx, G.base.cy);
  }

  function steerTo(e, tx, ty) {
    const dx = tx - centerX(e);
    const dy = ty - centerY(e);
    const prefer = [];
    if (Math.abs(dx) > Math.abs(dy)) {
      prefer.push(dx > 0 ? RIGHT : LEFT, dy > 0 ? DOWN : UP);
    } else {
      prefer.push(dy > 0 ? DOWN : UP, dx > 0 ? RIGHT : LEFT);
    }

    for (let i = 0; i < prefer.length; i++) {
      const d = prefer[i];
      if (d === (e.dir + 2) % 4) continue;
      if (canStep(e, d)) { setDir(e, d); return; }
    }
    // 随机找一个能走的方向
    const dirs = [UP, RIGHT, DOWN, LEFT];
    const free = dirs.filter((d) => d !== (e.dir + 2) % 4 && canStep(e, d));
    if (free.length) setDir(e, free[Math.floor(Math.random() * free.length)]);
    else if (canStep(e, (e.dir + 2) % 4)) setDir(e, (e.dir + 2) % 4);
  }

  function canStep(t, dir) {
    return !tankHitsWorld(t, t.x + DX[dir] * 6, t.y + DY[dir] * 6);
  }

  function lineOfSight(e) {
    const targets = [];
    if (G.player && G.player.alive) targets.push({ x: centerX(G.player), y: centerY(G.player) });
    if (G.base.alive) targets.push({ x: G.base.cx, y: G.base.cy });

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const dx = t.x - centerX(e);
      const dy = t.y - centerY(e);
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > 340) continue;
      if (e.dir === UP && Math.abs(dx) < TANK * 0.75 && dy < 0) return true;
      if (e.dir === DOWN && Math.abs(dx) < TANK * 0.75 && dy > 0) return true;
      if (e.dir === LEFT && Math.abs(dy) < TANK * 0.75 && dx < 0) return true;
      if (e.dir === RIGHT && Math.abs(dy) < TANK * 0.75 && dx > 0) return true;
    }
    return false;
  }

  function updateSpawner(dt) {
    if (!G.spawnQueue.length) return;

    let alive = 0;
    for (let i = 0; i < G.tanks.length; i++) {
      if (G.tanks[i].alive && G.tanks[i].team === 'enemy') alive++;
    }
    if (alive >= G.maxAlive) return;

    G.spawnTimer -= dt;
    if (G.spawnTimer > 0) return;
    G.spawnTimer = 2.0;
    spawnEnemy();
  }

  function spawnEnemy() {
    const def = LEVELS[G.levelIndex];
    const type = G.spawnQueue.shift();
    if (!type) return;

    const spot = def.spawns[G.spawnPoint % def.spawns.length];
    G.spawnPoint++;

    const x = spot[0] * TILE + TOFF;
    const y = spot[1] * TILE + TOFF;

    // 出生点被占用就等下一轮
    for (let i = 0; i < G.tanks.length; i++) {
      const t = G.tanks[i];
      if (t.alive && t.spawn <= 0 && Math.abs(t.x - x) < TILE && Math.abs(t.y - y) < TILE) {
        G.spawnQueue.unshift(type);
        G.spawnTimer = 0.5;
        return;
      }
    }

    const cfg = ENEMIES[type];
    const e = makeTank({
      team: 'enemy',
      x,
      y,
      dir: DOWN,
      speed: cfg.speed,
      hp: cfg.hp,
      reloadTime: cfg.reload,
      bulletSpeed: cfg.bulletSpeed,
      body: cfg.body,
      dark: cfg.dark,
      trim: cfg.trim,
      type,
      label: cfg.label,
      score: cfg.score,
      spawn: 1
    });
    e.bonus = G.kills > 0 && (G.kills + 1) % 4 === 0;
    G.tanks.push(e);
  }

  /* =========================================================
   * 13. 基地 / 结束
   * ======================================================= */
  function destroyBase() {
    if (!G.base.alive) return;
    G.base.alive = false;
    explode(G.base.cx, G.base.cy, 2.2);
    G.shake = 14;
    Sound.explosion();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (G.grid[r][c] === BASE) G.grid[r][c] = EMPTY;
      }
    }
    endGame(false);
  }

  function endGame(win) {
    G.screen = win ? 'victory' : 'gameover';
    if (G.score > G.best) {
      G.best = G.score;
      try { localStorage.setItem('tank-best', String(G.best)); } catch (err) { /* ignore */ }
    }
    if (win) Sound.levelClear(); else Sound.gameOver();
    showOverlay(win ? overlayVictory() : overlayGameOver());
  }

  function nextLevel() {
    if (G.levelIndex + 1 >= LEVELS.length) {
      endGame(true);
      return;
    }
    G.screen = 'playing';
    loadLevel(G.levelIndex + 1);
    hideOverlay();
  }

  function levelClear() {
    G.screen = 'levelclear';
    G.clearTimer = 1.9;
    Sound.levelClear();
    const isLast = G.levelIndex + 1 >= LEVELS.length;
    showOverlay(`
      <h1 class="overlay__title overlay__title--win">${isLast ? '全部通关！' : '第 ' + (G.levelIndex + 1) + ' 关 完成'}</h1>
      <p class="overlay__sub">${isLast ? '你守住了所有阵地。' : '准备进入下一关……'}</p>
      <div class="overlay__stats"><div><span>得分</span><br><b>${G.score}</b></div><div><span>击毁</span><br><b>${G.kills}</b></div></div>
    `);
  }

  /* =========================================================
   * 14. 道具
   * ======================================================= */
  const POWERUP_TYPES = ['shield', 'star', 'life', 'bomb', 'freeze'];

  function dropPowerup(x, y) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    G.powerups.push({ x: x - 14, y: y - 14, w: 28, h: 28, type, t: 0, life: 14 });
  }

  function updatePowerups(dt) {
    for (let i = G.powerups.length - 1; i >= 0; i--) {
      const p = G.powerups[i];
      p.t += dt;
      p.life -= dt;

      if (G.player && G.player.alive && G.player.spawn <= 0 &&
          G.player.x < p.x + p.w && G.player.x + TANK > p.x &&
          G.player.y < p.y + p.h && G.player.y + TANK > p.y) {
        applyPowerup(p.type);
        G.powerups.splice(i, 1);
        continue;
      }
      if (p.life <= 0) G.powerups.splice(i, 1);
    }
  }

  function applyPowerup(type) {
    Sound.powerup();
    const p = G.player;
    if (type === 'shield') {
      if (p) { p.shield = 8; }
    } else if (type === 'star') {
      G.playerLevel = Math.min(4, G.playerLevel + 1);
      G.score += 200;
    } else if (type === 'life') {
      G.lives += 1;
      G.score += 100;
    } else if (type === 'bomb') {
      for (let i = 0; i < G.tanks.length; i++) {
        const t = G.tanks[i];
        if (t.alive && t.team === 'enemy') {
          t.hp = 0;
          killTank(t);
        }
      }
      G.shake = 12;
    } else if (type === 'freeze') {
      G.freeze = 7;
    }
    syncHud();
  }

  /* =========================================================
   * 15. 粒子 / 特效
   * ======================================================= */
  function addParticle(x, y, vx, vy, life, size, color) {
    if (G.particles.length > 520) return;
    G.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  function explode(x, y, scale) {
    const n = Math.floor(18 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(30, 190) * scale;
      const color = ['#fff6cf', '#ffd166', '#ff9f43', '#ff5d5d'][Math.floor(Math.random() * 4)];
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.6), rand(2, 5) * scale, color);
    }
    G.shake = Math.max(G.shake, 7 * scale);
    Sound.explosion();
  }

  function debris(x, y, color) {
    const c = color || '#c98a5b';
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(20, 90);
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.2, 0.45), rand(2, 4), c);
    }
  }

  function spark(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(20, 70);
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.25), rand(1, 3), '#ffe9a8');
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }

  /* =========================================================
   * 16. 主循环
   * ======================================================= */
  function update(dt) {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 34);
    updateParticles(dt);

    if (G.screen === 'levelclear') {
      G.clearTimer -= dt;
      if (G.clearTimer <= 0) nextLevel();
      return;
    }
    if (G.screen !== 'playing') return;

    if (G.freeze > 0) G.freeze = Math.max(0, G.freeze - dt);

    if (!G.player && G.respawnTimer > 0) {
      G.respawnTimer -= dt;
      if (G.respawnTimer <= 0 && G.lives > 0) spawnPlayer();
    }

    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerups(dt);
    updateSpawner(dt);

    // 清理死亡坦克
    for (let i = G.tanks.length - 1; i >= 0; i--) {
      if (!G.tanks[i].alive) G.tanks.splice(i, 1);
    }

    // 过关判定
    let enemies = 0;
    for (let i = 0; i < G.tanks.length; i++) if (G.tanks[i].team === 'enemy') enemies++;
    if (!G.spawnQueue.length && enemies === 0 && G.screen === 'playing') {
      if (G.clearTimer <= 0) { G.clearTimer = 0.6; }
      else {
        G.clearTimer -= dt;
        if (G.clearTimer <= 0) levelClear();
      }
    }
    syncHud();
  }

  let lastTs = 0;
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* =========================================================
   * 17. 渲染
   * ======================================================= */
  function render() {
    ctx.save();
    if (G.shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    }

    drawGround();

    const grid = G.grid || (G.preview && G.preview.grid);
    if (grid) {
      drawTiles(grid, false);
      if (G.base) drawBase();
      drawPowerups();
      for (let i = 0; i < G.tanks.length; i++) drawTank(G.tanks[i]);
      for (let i = 0; i < G.bullets.length; i++) drawBullet(G.bullets[i]);
      drawTiles(grid, true);
      drawParticles();
    }

    ctx.restore();
    drawVignette();
  }

  function drawGround() {
    ctx.fillStyle = '#0c1117';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c * TILE + 0.5, 0);
      ctx.lineTo(c * TILE + 0.5, H);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r * TILE + 0.5);
      ctx.lineTo(W, r * TILE + 0.5);
    }
    ctx.stroke();
  }

  function drawTiles(grid, trees) {
    for (let r = 0; r < ROWS; r++) {
      const row = grid[r];
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (v === EMPTY || v === BASE) continue;
        const isTree = v === TREE;
        if (isTree !== trees) continue;
        const x = c * TILE;
        const y = r * TILE;
        if (v === BRICK) drawBrick(x, y);
        else if (v === STEEL) drawSteel(x, y);
        else if (v === WATER) drawWater(x, y, c, r);
        else if (v === TREE) drawTree(x, y);
      }
    }
  }

  function drawBrick(x, y) {
    ctx.fillStyle = '#3a1a0c';
    ctx.fillRect(x, y, TILE, TILE);

    ctx.fillStyle = '#a44f26';
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) * 8;
      for (let c = -1; c < 3; c++) {
        const bx = x + off + c * 16;
        const by = y + r * 8;
        const left = Math.max(bx, x);
        const right = Math.min(bx + 15, x + TILE);
        if (right <= left) continue;
        ctx.fillRect(left, by + 1, right - left, 6);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, TILE, 1);
  }

  function drawSteel(x, y) {
    ctx.fillStyle = '#2a3746';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#93a7bd';
    ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#c8d7e6';
    ctx.fillRect(x + 2, y + 2, TILE - 4, 3);
    ctx.fillRect(x + 2, y + 2, 3, TILE - 4);
    ctx.fillStyle = '#5d7089';
    ctx.fillRect(x + 2, y + TILE - 5, TILE - 4, 3);
    ctx.fillRect(x + TILE - 5, y + 2, 3, TILE - 4);
    ctx.fillStyle = '#6c8099';
    const d = 7;
    ctx.fillRect(x + d, y + d, 3, 3);
    ctx.fillRect(x + TILE - d - 3, y + d, 3, 3);
    ctx.fillRect(x + d, y + TILE - d - 3, 3, 3);
    ctx.fillRect(x + TILE - d - 3, y + TILE - d - 3, 3, 3);
  }

  function drawWater(x, y, c, r) {
    const t = G.time * 2.2 + c * 0.7 + r * 1.3;
    ctx.fillStyle = '#0d2b47';
    ctx.fillRect(x, y, TILE, TILE);

    ctx.fillStyle = '#1b5c8f';
    for (let i = 0; i < 3; i++) {
      const yy = y + 6 + i * 10;
      const off = Math.sin(t + i * 1.7) * 5;
      ctx.fillRect(x + 3 + off, yy, 12, 3);
      ctx.fillRect(x + 19 - off, yy + 4, 9, 3);
    }
    ctx.fillStyle = 'rgba(120, 200, 255, 0.16)';
    ctx.fillRect(x, y + 1, TILE, 2);
  }

  function drawTree(x, y) {
    ctx.fillStyle = 'rgba(20, 70, 36, 0.92)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#2f8f47';
    const blobs = [[8, 9, 9], [22, 11, 8], [13, 22, 10], [25, 23, 7]];
    for (let i = 0; i < blobs.length; i++) {
      ctx.beginPath();
      ctx.arc(x + blobs[i][0], y + blobs[i][1], blobs[i][2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(126, 219, 140, 0.55)';
    ctx.beginPath();
    ctx.arc(x + 10, y + 9, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBase() {
    const b = G.base;
    if (!b) return;

    if (b.alive) {
      ctx.fillStyle = '#1a2634';
      ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      ctx.fillStyle = '#c9d8e8';
      ctx.fillRect(b.x + 6, b.y + b.h - 14, b.w - 12, 8);
      // 鹰徽
      ctx.fillStyle = '#e8f1fa';
      ctx.beginPath();
      ctx.moveTo(b.cx, b.y + 10);
      ctx.lineTo(b.x + b.w - 10, b.y + 26);
      ctx.lineTo(b.cx + 6, b.y + b.h - 16);
      ctx.lineTo(b.cx - 6, b.y + b.h - 16);
      ctx.lineTo(b.x + 10, b.y + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(b.cx, b.y + b.h / 2 - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(242,193,78,0.22)';
      ctx.fillRect(b.x, b.y, b.w, 2);
    } else {
      ctx.fillStyle = '#20140f';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#4a2a1c';
      ctx.fillRect(b.x + 6, b.y + b.h - 18, 18, 12);
      ctx.fillRect(b.x + b.w - 26, b.y + b.h - 24, 14, 10);
      ctx.fillStyle = 'rgba(255, 110, 60, 0.35)';
      ctx.beginPath();
      ctx.arc(b.cx, b.cy, 10 + Math.sin(G.time * 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTank(t) {
    if (!t.alive) return;

    if (t.spawn > 0) {
      drawSpawnStar(t);
      return;
    }

    const cx = centerX(t);
    const cy = centerY(t);
    let body = t.body;

    if (t.flash > 0) body = '#ffffff';
    if (t.team === 'enemy' && t.bonus && Math.floor(G.time * 6) % 2 === 0) body = '#ff6b6b';
    if (t.team === 'enemy' && t.type === 'armor') {
      // 装甲随血量变暗
      const k = t.hp / t.maxHp;
      body = k > 0.66 ? '#ff8a8a' : k > 0.33 ? '#d96b6b' : '#b04a4a';
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t.dir * Math.PI / 2);

    // 履带
    ctx.fillStyle = t.dark;
    ctx.fillRect(-14, -13, 6, 26);
    ctx.fillRect(8, -13, 6, 26);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = -12; i < 13; i += 5) {
      ctx.fillRect(-14, i, 6, 2);
      ctx.fillRect(8, i, 6, 2);
    }

    // 车身
    ctx.fillStyle = body;
    ctx.fillRect(-9, -11, 18, 22);
    ctx.fillStyle = t.trim;
    ctx.fillRect(-9, -11, 18, 2);
    ctx.fillRect(-9, -11, 2, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(7, -9, 2, 20);
    ctx.fillRect(-9, 9, 18, 2);

    // 炮塔 + 炮管
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.dark;
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.fillRect(-2.5, -17, 5, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-2.5, -17, 1.6, 12);

    ctx.restore();

    // 护盾
    if (t.shield > 0) {
      const a = 0.35 + Math.sin(G.time * 14) * 0.25;
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 220, 255, ' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 18 + Math.sin(G.time * 8) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 玩家等级标记
    if (t.team === 'player' && G.playerLevel > 1) {
      ctx.fillStyle = '#f2c14e';
      for (let i = 0; i < G.playerLevel - 1; i++) {
        ctx.fillRect(t.x + 2 + i * 4, t.y - 4, 3, 3);
      }
    }
  }

  function drawSpawnStar(t) {
    const cx = centerX(t);
    const cy = centerY(t);
    const k = 1 - t.spawn / 1;
    const r = 6 + Math.sin(G.time * 25) * 2 + k * 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(G.time * 8);
    ctx.strokeStyle = '#9fe6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    const cx = b.x + BULLET / 2;
    const cy = b.y + BULLET / 2;
    ctx.save();
    ctx.fillStyle = b.team === 'player' ? '#fff3b0' : '#ffb3b3';
    ctx.shadowColor = b.team === 'player' ? 'rgba(255, 220, 120, 0.9)' : 'rgba(255, 120, 120, 0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, BULLET / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPowerups() {
    for (let i = 0; i < G.powerups.length; i++) {
      const p = G.powerups[i];
      const blink = p.life < 4 && Math.floor(p.life * 6) % 2 === 0;
      if (blink) continue;

      ctx.save();
      ctx.fillStyle = 'rgba(10, 20, 26, 0.85)';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);

      const pulse = 0.7 + Math.sin(p.t * 6) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 14px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(powerupIcon(p.type), p.x + p.w / 2, p.y + p.h / 2 + 1);
      ctx.restore();
    }
  }

  function powerupIcon(type) {
    if (type === 'shield') return 'S';
    if (type === 'star') return '★';
    if (type === 'life') return '♥';
    if (type === 'bomb') return 'B';
    return 'F';
  }

  function drawParticles() {
    for (let i = 0; i < G.particles.length; i++) {
      const p = G.particles[i];
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawVignette() {
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }

  /* =========================================================
   * 18. 界面
   * ======================================================= */
  const hudCache = { score: '', lives: '', level: '', enemies: '' };

  function setText(key, value) {
    const text = String(value);
    if (hudCache[key] === text) return;
    hudCache[key] = text;
    hud[key].textContent = text;
  }

  function syncHud() {
    let left = G.spawnQueue.length;
    for (let i = 0; i < G.tanks.length; i++) if (G.tanks[i].team === 'enemy' && G.tanks[i].alive) left++;

    setText('score', G.score);
    setText('lives', Math.max(0, G.lives));
    setText('level', G.levelIndex + 1);
    setText('enemies', left);
  }

  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.add('is-visible');
  }

  function hideOverlay() {
    overlay.classList.remove('is-visible');
    overlay.innerHTML = '';
  }

  function overlayMenu() {
    return `
      <h1 class="overlay__title">坦克大战</h1>
      <p class="overlay__sub">守住基地，消灭全部敌军。砖墙可击穿，钢墙需要满级火力，河流阻挡坦克但挡不住炮弹。</p>
      <div class="overlay__legend">
        <span><i style="background:#a44f26"></i>砖墙</span>
        <span><i style="background:#93a7bd"></i>钢墙</span>
        <span><i style="background:#1b5c8f"></i>河流</span>
        <span><i style="background:#2f8f47"></i>树林</span>
        <span><i style="background:#f2c14e"></i>基地</span>
      </div>
      <button class="btn" data-action="start">开始游戏</button>
      <p class="overlay__sub" style="font-size:12px">最高分 <b style="color:#f2c14e">${G.best}</b> · 3 关 · 共 ${LEVELS.length} 张地图</p>
    `;
  }

  function overlayPause() {
    return `
      <h1 class="overlay__title">已暂停</h1>
      <p class="overlay__sub">按 P 或点击下方按钮继续</p>
      <button class="btn" data-action="resume">继续游戏</button>
    `;
  }

  function overlayGameOver() {
    return `
      <h1 class="overlay__title overlay__title--danger">游戏结束</h1>
      <p class="overlay__sub">${G.base && !G.base.alive ? '基地被摧毁了……' : '最后一辆坦克被击毁。'}</p>
      <div class="overlay__stats">
        <div><span>得分</span><br><b>${G.score}</b></div>
        <div><span>击毁</span><br><b>${G.kills}</b></div>
        <div><span>最高分</span><br><b>${G.best}</b></div>
      </div>
      <button class="btn" data-action="restart">再来一局</button>
    `;
  }

  function overlayVictory() {
    return `
      <h1 class="overlay__title overlay__title--win">胜利！</h1>
      <p class="overlay__sub">三关全部通过，基地安然无恙。</p>
      <div class="overlay__stats">
        <div><span>得分</span><br><b>${G.score}</b></div>
        <div><span>击毁</span><br><b>${G.kills}</b></div>
        <div><span>最高分</span><br><b>${G.best}</b></div>
      </div>
      <button class="btn" data-action="restart">再玩一次</button>
    `;
  }

  /* =========================================================
   * 19. 流程控制
   * ======================================================= */
  function startGame() {
    Sound.unlock();
    G.score = 0;
    G.lives = 3;
    G.kills = 0;
    G.screen = 'playing';
    loadLevel(0);
    hideOverlay();
  }

  function togglePause() {
    if (G.screen === 'playing') {
      G.screen = 'paused';
      showOverlay(overlayPause());
    } else if (G.screen === 'paused') {
      G.screen = 'playing';
      hideOverlay();
    }
  }

  /* =========================================================
   * 20. 输入
   * ======================================================= */
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'fire', KeyJ: 'fire', KeyK: 'fire'
  };

  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = true;
      e.preventDefault();
      Sound.unlock();
    }
    if (e.code === 'KeyP') { e.preventDefault(); togglePause(); }
    if (e.code === 'KeyM') {
      Sound.muted = !Sound.muted;
      if (!Sound.muted) Sound.unlock();
    }
    if (e.code === 'KeyR' && (G.screen === 'gameover' || G.screen === 'victory')) {
      startGame();
    }
    if (e.code === 'Enter' && (G.screen === 'menu' || G.screen === 'gameover' || G.screen === 'victory')) {
      startGame();
    }
  }, { passive: false });

  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      keys[k] = false;
      e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('blur', () => {
    keys.up = keys.down = keys.left = keys.right = keys.fire = false;
    if (G.screen === 'playing') togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'playing') togglePause();
  });

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'start' || action === 'restart') startGame();
    else if (action === 'resume') togglePause();
  });

  // 触屏虚拟按键
  function bindTouch() {
    const buttons = touchBar.querySelectorAll('[data-key]');
    buttons.forEach((btn) => {
      const key = btn.getAttribute('data-key');
      const on = (ev) => {
        ev.preventDefault();
        Sound.unlock();
        keys[key] = true;
      };
      const off = (ev) => {
        ev.preventDefault();
        keys[key] = false;
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  /* =========================================================
   * 21. 启动
   * ======================================================= */
  function boot() {
    // 菜单背景：先解析第一关地形，只画地形
    G.preview = parseLevel(LEVELS[0]);
    G.grid = G.preview.grid;
    G.base = G.preview.base;

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && touchBar) {
      touchBar.hidden = false;
      bindTouch();
    }

    G.spawnQueue = LEVELS[0].wave.slice();
    showOverlay(overlayMenu());
    syncHud();

    // 开发 / 演示便利：?play 直接开局，?level=2 指定关卡，?sim=秒数 快进模拟（便于自动化截图）
    const sim = /[?&]sim=(\d+(?:\.\d+)?)/.exec(location.search);
    const lvl = /[?&]level=(\d+)/.exec(location.search);
    if (sim || lvl || /[?&]play\b/.test(location.search)) {
      startGame();
      if (lvl) loadLevel(clamp(parseInt(lvl[1], 10) - 1, 0, LEVELS.length - 1));
      if (sim) {
        const steps = Math.min(60 * 120, Math.round(parseFloat(sim[1]) * 60));
        for (let i = 0; i < steps; i++) update(1 / 60);
        render();
      }
    }

    requestAnimationFrame(frame);
    document.documentElement.dataset.ready = 'true';
  }

  // 出错时把信息暴露到 DOM，便于排查（也方便自动化检测）
  window.addEventListener('error', (e) => {
    document.documentElement.dataset.error = String(e.message || e.error || 'unknown');
    console.error('[tank] error:', e.error || e.message);
  });

  // 调试 / 自动化接口（不影响正常游戏，也方便二次开发）
  window.TankBattle = { state: G, keys, update, render, startGame, loadLevel, LEVELS };

  boot();
})();
