"use strict";
// Mini puzzles for a short, calm break: flower sort, memory match, merge garden, slide puzzle.
// Pure rules live in `L` (exposed as Games._logic) so they can be tested without the UI.
(function () {
  const SKEY = "energy-map:v1:games";
  const root = () => document.getElementById("tab-games");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ?seed=123 makes every shuffle repeatable (used by the tests)
  const seedParam = new URLSearchParams(location.search).get("seed");
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = seedParam ? mulberry32(parseInt(seedParam, 10) || 1) : Math.random;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- stats (kept on this device only) ---------- */
  const DEF = () => ({ sort: { level: 1, wins: 0 }, memory: { wins: 0, best: 0 }, merge: { wins: 0, best: 0 }, slide: { wins: 0, best: 0 }, ball: { best: 0, plays: 0 }, mahjong: { wins: 0, best: 0 }, tetris: { best: 0, plays: 0 }, egg: { wins: 0, best: 0 } });
  let stats = (() => {
    try { const s = JSON.parse(localStorage.getItem(SKEY)); const d = DEF(); for (const k in d) d[k] = { ...d[k], ...(s && s[k]) }; return d; } catch { return DEF(); }
  })();
  const saveStats = () => { try { localStorage.setItem(SKEY, JSON.stringify(stats)); } catch {} };

  /* ---------- rules ---------- */
  const FLOWERS = ["🌷", "🌸", "🌼", "🌺", "🌻", "🪻", "🌹", "💐"];
  const MEM = ["🍄", "🌼", "🪙", "⭐", "🐢", "🌷"];
  const TILES = ["", "🌰", "🌱", "🌿", "🍀", "🌼", "🌷", "🌻", "🌳", "🍄"]; // level 1..9
  const MAXLV = 9;
  const BALLS = ["⚽", "🏀", "🎾", "🏐"];
  const MJ_FACES = ["🌸", "🍄", "🪙", "⭐", "🐢", "🌷", "🌳", "🦋", "🍎"];
  // three layers, stacked exactly: 24 + 8 + 4 = 36 tiles (18 pairs)
  const MJ_LAYOUT = (() => {
    const p = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) p.push({ r, c, z: 0 });
    for (let r = 1; r < 3; r++) for (let c = 1; c < 5; c++) p.push({ r, c, z: 1 });
    for (let r = 1; r < 3; r++) for (let c = 2; c < 4; c++) p.push({ r, c, z: 2 });
    return p;
  })();
  const L = {
    CAP: 4,
    topRun(p) { let n = 0; for (let i = p.length - 1; i >= 0 && p[i] === p[p.length - 1]; i--) n++; return n; },
    canMove(pots, a, b) {
      if (a === b || !pots[a].length || pots[b].length >= L.CAP) return false;
      return !pots[b].length || pots[b][pots[b].length - 1] === pots[a][pots[a].length - 1];
    },
    doMove(pots, a, b) {
      const n = Math.min(L.topRun(pots[a]), L.CAP - pots[b].length);
      for (let k = 0; k < n; k++) pots[b].push(pots[a].pop());
      return n;
    },
    solved: (pots) => pots.every((p) => !p.length || (p.length === L.CAP && p.every((x) => x === p[0]))),
    newSort(level) {
      const colors = Math.min(2 + level, FLOWERS.length);
      let pots;
      do {
        const all = shuffle(FLOWERS.slice(0, colors).flatMap((f) => Array(L.CAP).fill(f)));
        pots = Array.from({ length: colors }, (_, i) => all.slice(i * L.CAP, (i + 1) * L.CAP));
        pots.push([], []); // two spare pots keep every deal solvable in practice
      } while (L.solved(pots));
      return pots;
    },
    // one row/column slides toward its start; equal neighbours merge once; the top level never merges
    slideLine(line) {
      const v = line.filter(Boolean), out = []; let gained = 0;
      for (let i = 0; i < v.length; i++) {
        if (v[i] === v[i + 1] && v[i] < MAXLV) { out.push(v[i] + 1); gained += 2 ** (v[i] + 1); i++; } else out.push(v[i]);
      }
      while (out.length < line.length) out.push(0);
      return { line: out, gained };
    },
    mergeMove(grid, dir) {
      const vertical = dir === "U" || dir === "D", g = grid.slice(); let gained = 0;
      for (let a = 0; a < 4; a++) {
        const idx = [0, 1, 2, 3].map((b) => (vertical ? b * 4 + a : a * 4 + b));
        if (dir === "R" || dir === "D") idx.reverse();
        const res = L.slideLine(idx.map((i) => g[i]));
        idx.forEach((i, k) => (g[i] = res.line[k])); gained += res.gained;
      }
      return { grid: g, gained, moved: g.some((v, i) => v !== grid[i]) };
    },
    canMerge(grid) {
      if (grid.includes(0)) return true;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const v = grid[r * 4 + c];
        if (v < MAXLV && ((c < 3 && grid[r * 4 + c + 1] === v) || (r < 3 && grid[(r + 1) * 4 + c] === v))) return true;
      }
      return false;
    },
    near(pos) { const r = Math.floor(pos / 3), c = pos % 3, o = []; if (r > 0) o.push(pos - 3); if (r < 2) o.push(pos + 3); if (c > 0) o.push(pos - 1); if (c < 2) o.push(pos + 1); return o; },
    slideSolved: (t) => t.every((x, i) => x === i),
    // shuffle by walking the blank around from the solved board, so every deal is solvable
    slideShuffle() {
      const t = [0, 1, 2, 3, 4, 5, 6, 7, 8]; let b = 8, prev = -1;
      for (let n = 0; n < 90 || L.slideSolved(t); n++) {
        const opts = L.near(b).filter((x) => x !== prev), x = opts[Math.floor(rnd() * opts.length)];
        [t[b], t[x]] = [t[x], t[b]]; prev = b; b = x;
      }
      return t;
    },
  };

  Object.assign(L, {
    BW: 300, BH: 400, PY: 372, PH: 14, BALL_MS: 45000, MJ_LAYOUT,
    ballNew: () => ({ t: L.BALL_MS, score: 0, caught: 0, x: 150, pw: 80, items: [], spawn: 400, running: false, over: false, started: false, counted: false, logged: false }),
    // one fixed 33 ms step: balls fall, the basket catches them, stars +3, bombs -2, the round ends at 45 s
    ballStep(s, dt) {
      if (!s.running || s.over) return;
      s.t -= dt;
      const prog = 1 - Math.max(0, s.t) / L.BALL_MS;
      s.spawn -= dt;
      if (s.spawn <= 0) {
        const r = rnd(), type = r < 0.08 ? "star" : r < 0.18 ? "bomb" : "ball";
        s.items.push({ x: 20 + rnd() * 260, y: -10, vy: (90 + rnd() * 50) * (1 + prog * 0.8), type, e: type === "star" ? "⭐" : type === "bomb" ? "💣" : BALLS[Math.floor(rnd() * BALLS.length)] });
        s.spawn = (650 - prog * 300) * (0.7 + rnd() * 0.6);
      }
      const half = s.pw / 2;
      for (const it of s.items) it.y += (it.vy * dt) / 1000;
      s.items = s.items.filter((it) => {
        if (it.y >= L.PY - 6 && it.y <= L.PY + L.PH + 10 && Math.abs(it.x - s.x) <= half + 8) {
          if (it.type === "bomb") s.score = Math.max(0, s.score - 2); else { s.score += it.type === "star" ? 3 : 1; s.caught++; }
          return false;
        }
        return it.y < L.BH + 20;
      });
      if (s.t <= 0) { s.t = 0; s.over = true; s.running = false; }
    },
    clampX: (s, x) => Math.max(s.pw / 2, Math.min(L.BW - s.pw / 2, x)),
    // a tile is free when nothing lies on top and its left or right side is open
    mjFree(tiles, i) {
      const t = tiles[i]; if (!t.alive) return false;
      let left = false, right = false;
      for (const u of tiles) {
        if (!u.alive || u === t) continue;
        if (u.r === t.r && u.c === t.c && u.z === t.z + 1) return false;
        if (u.z === t.z && u.r === t.r) { if (u.c === t.c - 1) left = true; if (u.c === t.c + 1) right = true; }
      }
      return !(left && right);
    },
    // deal by playing the game backwards: remove random free pairs and give each pair one face, so the deal is always solvable
    mjDeal(positions) {
      for (let attempt = 0; attempt < 300; attempt++) {
        const tiles = positions.map((p) => ({ ...p, alive: true })), order = []; let ok = true;
        for (let n = tiles.length / 2; n > 0; n--) {
          const free = tiles.map((_, i) => i).filter((i) => L.mjFree(tiles, i));
          if (free.length < 2) { ok = false; break; }
          const a = free.splice(Math.floor(rnd() * free.length), 1)[0], b = free.splice(Math.floor(rnd() * free.length), 1)[0];
          tiles[a].alive = tiles[b].alive = false; order.push([a, b]);
        }
        if (!ok) continue;
        const kinds = shuffle(MJ_FACES.slice()), faces = Array(positions.length);
        order.forEach(([a, b], k) => { faces[a] = faces[b] = kinds[k % kinds.length]; });
        return { faces, order };
      }
      return null;
    },
  });

  /* ---------- tetris and egg-shooter rules ---------- */
  const T_KINDS = ["I", "O", "T", "S", "Z", "J", "L"];
  const T_BASE = {
    I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] }, O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] }, T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] }, Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] }, L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  const T_COLORS = { I: "#38bdf8", O: "#fde047", T: "#c084fc", S: "#4ade80", Z: "#f87171", J: "#60a5fa", L: "#fb923c" };
  const EGG = { R: 15, W: 270, H: 400, ROWH: 26, ROWS: 13, LOSS: 11, SX: 135, SY: 372, SPEED: 520, COLORS: 5, MAXANG: 1.3 };
  Object.assign(L, {
    TW: 10, TH: 20, T_KINDS, EGG,
    tCells(k, rot) {
      const { n, c } = T_BASE[k]; let cells = c.map(([x, y]) => [x, y]);
      for (let i = 0; i < ((rot % 4) + 4) % 4; i++) cells = cells.map(([x, y]) => [n - 1 - y, x]);
      return cells;
    },
    tFits: (grid, k, rot, x, y) => L.tCells(k, rot).every(([dx, dy]) => { const cx = x + dx, cy = y + dy; return cx >= 0 && cx < L.TW && cy >= 0 && cy < L.TH && !grid[cy][cx]; }),
    tInterval: (level) => Math.max(120, 720 - (level - 1) * 60),
    tBag(s) { if (!s.bag.length) s.bag = shuffle(T_KINDS.slice()); return s.bag.pop(); },   // 7-bag: every kind once per seven pieces
    tNew() {
      const s = { grid: Array.from({ length: L.TH }, () => Array(L.TW).fill(0)), bag: [], piece: null, next: null, score: 0, lines: 0, level: 1, acc: 0, running: false, started: false, over: false, counted: false, logged: false };
      s.next = L.tBag(s); L.tSpawn(s); return s;
    },
    tSpawn(s) {
      const k = s.next; s.next = L.tBag(s);
      const y = -Math.min(...L.tCells(k, 0).map((c) => c[1])), p = { k, r: 0, x: Math.floor((L.TW - T_BASE[k].n) / 2), y };
      s.piece = p;
      if (!L.tFits(s.grid, k, 0, p.x, p.y)) { s.over = true; s.running = false; }
    },
    tMove(s, dx) { const p = s.piece; if (!p || s.over || !L.tFits(s.grid, p.k, p.r, p.x + dx, p.y)) return false; p.x += dx; return true; },
    tRot(s, dir) {
      const p = s.piece; if (!p || s.over) return false;
      const r = (p.r + dir + 4) % 4;
      for (const kx of [0, -1, 1, -2, 2]) if (L.tFits(s.grid, p.k, r, p.x + kx, p.y)) { p.r = r; p.x += kx; return true; }   // nudge away from a wall if needed
      return false;
    },
    tLock(s) {
      const p = s.piece;
      L.tCells(p.k, p.r).forEach(([dx, dy]) => { s.grid[p.y + dy][p.x + dx] = p.k; });
      const keep = s.grid.filter((row) => row.some((v) => !v)), n = L.TH - keep.length;
      while (keep.length < L.TH) keep.unshift(Array(L.TW).fill(0));
      s.grid = keep;
      if (n) { s.score += [0, 100, 300, 500, 800][n] * s.level; s.lines += n; s.level = 1 + Math.floor(s.lines / 10); }
      L.tSpawn(s); return n;
    },
    tDown(s, soft) {
      const p = s.piece; if (!p || s.over) return false;
      if (L.tFits(s.grid, p.k, p.r, p.x, p.y + 1)) { p.y++; if (soft) s.score += 1; return true; }
      L.tLock(s); return false;
    },
    tGhostY(s) { const p = s.piece; let y = p.y; while (L.tFits(s.grid, p.k, p.r, p.x, y + 1)) y++; return y; },
    tHard(s) { const p = s.piece; if (!p || s.over) return; const y = L.tGhostY(s); s.score += (y - p.y) * 2; p.y = y; L.tLock(s); },
    tStep(s, dt) {
      if (!s.running || s.over) return;
      s.acc += dt;
      const iv = L.tInterval(s.level);
      while (s.acc >= iv && !s.over) { s.acc -= iv; L.tDown(s, false); }
    },

    // egg shooter: a honeycomb of eggs (even rows 9 wide, odd rows 8 wide, shifted half an egg)
    eggCols: (r) => (r % 2 ? 8 : 9),
    eggPos: (r, c) => ({ x: EGG.R + c * 2 * EGG.R + (r % 2 ? EGG.R : 0), y: EGG.R + r * EGG.ROWH }),
    eggEmpty: () => Array.from({ length: EGG.ROWS }, (_, r) => Array(L.eggCols(r)).fill(0)),
    eggNeighbors(r, c) {
      const odd = r % 2;
      return [[r, c - 1], [r, c + 1], [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c], [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c]]
        .filter(([rr, cc]) => rr >= 0 && rr < EGG.ROWS && cc >= 0 && cc < L.eggCols(rr));
    },
    eggLeft: (g) => g.reduce((n, row) => n + row.filter(Boolean).length, 0),
    eggColors: (g) => [...new Set(g.flat().filter(Boolean))],
    eggPick(g) { const c = L.eggColors(g); return c.length ? c[Math.floor(rnd() * c.length)] : 1; },
    eggClamp: (a) => Math.max(-EGG.MAXANG, Math.min(EGG.MAXANG, a)),
    eggAim: (x, y) => L.eggClamp(Math.atan2(x - EGG.SX, Math.max(12, EGG.SY - y))),
    eggNew() {
      const grid = L.eggEmpty();
      for (let r = 0; r < 5; r++) for (let c = 0; c < grid[r].length; c++) grid[r][c] = 1 + Math.floor(rnd() * EGG.COLORS);
      return { grid, cur: L.eggPick(grid), next: L.eggPick(grid), ang: 0, shot: null, score: 0, shots: 0, over: false, won: false, counted: false, logged: false };
    },
    eggFire(s) {
      if (s.shot || s.over || s.won) return false;
      s.shot = { x: EGG.SX, y: EGG.SY, vx: Math.sin(s.ang) * EGG.SPEED, vy: -Math.cos(s.ang) * EGG.SPEED, c: s.cur };
      s.cur = s.next; s.next = L.eggPick(s.grid); s.shots++; return true;
    },
    eggHit(g, x, y) {
      const rc = Math.round((y - EGG.R) / EGG.ROWH);
      for (let r = Math.max(0, rc - 2); r <= Math.min(EGG.ROWS - 1, rc + 2); r++) for (let c = 0; c < g[r].length; c++) {
        if (!g[r][c]) continue;
        const p = L.eggPos(r, c); if ((p.x - x) ** 2 + (p.y - y) ** 2 < (2 * EGG.R * 0.92) ** 2) return true;
      }
      return false;
    },
    // the nearest empty cell to where the egg stopped that is at the top or touches another egg
    eggSnap(g, x, y) {
      const rc = Math.round((y - EGG.R) / EGG.ROWH); let best = null, bd = Infinity;
      for (let r = Math.max(0, rc - 1); r <= Math.min(EGG.ROWS - 1, rc + 1); r++) for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] || !(r === 0 || L.eggNeighbors(r, c).some(([rr, cc]) => g[rr][cc]))) continue;
        const p = L.eggPos(r, c), d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = { r, c }; }
      }
      return best || { r: Math.min(EGG.ROWS - 1, Math.max(0, rc)), c: 0 };
    },
    // 3+ of the same colour touching pop; whatever is then cut off from the top row falls
    eggResolve(g, r, c) {
      const k = g[r][c], seen = new Set([r * 20 + c]), group = [[r, c]];
      for (let i = 0; i < group.length; i++) for (const [rr, cc] of L.eggNeighbors(group[i][0], group[i][1])) {
        if (g[rr][cc] === k && !seen.has(rr * 20 + cc)) { seen.add(rr * 20 + cc); group.push([rr, cc]); }
      }
      if (group.length < 3) return { popped: [], fallen: [] };
      group.forEach(([rr, cc]) => (g[rr][cc] = 0));
      const live = new Set(), q = [];
      g[0].forEach((v, cc) => { if (v) { live.add(cc); q.push([0, cc]); } });
      for (let i = 0; i < q.length; i++) for (const [rr, cc] of L.eggNeighbors(q[i][0], q[i][1])) {
        if (g[rr][cc] && !live.has(rr * 20 + cc)) { live.add(rr * 20 + cc); q.push([rr, cc]); }
      }
      const fallen = [];
      g.forEach((row, rr) => row.forEach((v, cc) => { if (v && !live.has(rr === 0 ? cc : rr * 20 + cc)) { fallen.push([rr, cc]); } }));
      fallen.forEach(([rr, cc]) => (g[rr][cc] = 0));
      return { popped: group, fallen };
    },
    eggLand(s) {
      const sh = s.shot, { r, c } = L.eggSnap(s.grid, sh.x, sh.y);
      s.grid[r][c] = sh.c; s.shot = null;
      const res = L.eggResolve(s.grid, r, c);
      s.score += res.popped.length * 10 + res.fallen.length * 20;
      if (!L.eggLeft(s.grid)) { s.won = true; return; }
      if (s.grid.slice(EGG.LOSS).some((row) => row.some(Boolean))) { s.over = true; return; }
      const cols = L.eggColors(s.grid);                       // never hand out a colour that is no longer on the board
      if (!cols.includes(s.cur)) s.cur = L.eggPick(s.grid);
      if (!cols.includes(s.next)) s.next = L.eggPick(s.grid);
    },
    eggStep(s, dt) {
      if (!s.shot || s.over || s.won) return;
      const sh = s.shot, n = Math.max(1, Math.ceil((EGG.SPEED * dt) / 1000 / 6));
      let dx = (sh.vx * dt) / 1000 / n; const dy = (sh.vy * dt) / 1000 / n;
      for (let i = 0; i < n; i++) {
        sh.x += dx; sh.y += dy;
        if (sh.x < EGG.R) { sh.x = EGG.R; sh.vx = -sh.vx; dx = -dx; }
        else if (sh.x > EGG.W - EGG.R) { sh.x = EGG.W - EGG.R; sh.vx = -sh.vx; dx = -dx; }
        if (sh.y <= EGG.R || L.eggHit(s.grid, sh.x, sh.y)) { L.eggLand(s); return; }
      }
    },
    // the dotted aiming guide: the path the next egg would take, bouncing off the side walls
    eggPath(s) {
      const pts = [[EGG.SX, EGG.SY]]; let x = EGG.SX, y = EGG.SY, vx = Math.sin(s.ang) * 6, vy = -Math.cos(s.ang) * 6;
      for (let i = 0; i < 400; i++) {
        x += vx; y += vy;
        if (x < EGG.R) { x = EGG.R; vx = -vx; pts.push([x, y]); } else if (x > EGG.W - EGG.R) { x = EGG.W - EGG.R; vx = -vx; pts.push([x, y]); }
        if (y <= EGG.R || L.eggHit(s.grid, x, y)) break;
      }
      pts.push([x, y]); return pts;
    },
  });

  /* ---------- state ---------- */
  const GAMES = [
    { id: "sort", emoji: "🌷", name: "จัดกระถางดอกไม้", short: "จัดกระถาง", desc: "เรียงดอกไม้ให้แต่ละกระถางมีชนิดเดียว", time: "2–4 นาที" },
    { id: "memory", emoji: "🍄", name: "พลิกการ์ดจับคู่", short: "จับคู่", desc: "พลิกการ์ดหาคู่ที่เหมือนกัน", time: "1–3 นาที" },
    { id: "merge", emoji: "🌱", name: "รวมเมล็ดเป็นต้นไม้", short: "ปลูกต้นไม้", desc: "ปัดให้ของเหมือนกันรวมกันจนเป็นเห็ด", time: "3–5 นาที" },
    { id: "slide", emoji: "🧩", name: "สไลด์ภาพเห็ด", short: "สไลด์", desc: "เลื่อนชิ้นภาพให้กลับเป็นรูปเห็ด", time: "2–4 นาที" },
    { id: "ball", emoji: "🧺", name: "เลื่อนรับลูกบอล", short: "รับบอล", desc: "ลากตะกร้ารับลูกบอลที่ตกลงมา รอบละ 45 วินาที", time: "1 นาที" },
    { id: "mahjong", emoji: "🀄", name: "จับคู่ไพ่มาจง", short: "มาจง", desc: "จับคู่ไพ่ที่เหมือนกันและไม่ถูกบัง ให้หมดกระดาน", time: "3–5 นาที" },
    { id: "tetris", emoji: "🧱", name: "เทตริส", short: "เทตริส", desc: "เรียงบล็อกให้เต็มแถวแล้วแถวจะหายไป เริ่มช้า ๆ ผ่อนคลาย", time: "3–5 นาที" },
    { id: "egg", emoji: "🥚", name: "ยิงไข่ไดโนเสาร์", short: "ยิงไข่", desc: "ยิงไข่ให้สีเดียวกันครบ 3 ฟองเพื่อให้แตก", time: "3–5 นาที" },
  ];
  const byId = (id) => GAMES.find((g) => g.id === id);
  let view = null; // null = the menu
  const S = {};
  let memTimer = 0;
  const clearMem = () => clearTimeout(memTimer);

  function spawn(g) {
    const empty = g.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    if (empty.length) g[empty[Math.floor(rnd() * empty.length)]] = rnd() < 0.9 ? 1 : 2;
  }

  const G = {
    sort: {
      start(level) {
        const lv = level || stats.sort.level;
        S.sort = { level: lv, pots: L.newSort(lv), sel: -1, hist: [], moves: 0, won: false, logged: false };
      },
      view() {
        const s = S.sort;
        const pots = s.pots.map((p, i) => `<button class="pot" data-g="pot" data-i="${i}" aria-pressed="${s.sel === i}" aria-label="กระถาง ${i + 1}: ${p.length ? p.join(" ") : "ว่าง"}">${p.map((f) => `<span>${f}</span>`).join("")}</button>`).join("");
        return {
          status: `ด่าน ${s.level} · ย้าย ${s.moves} ครั้ง`,
          hint: "แตะกระถางที่จะยก แล้วแตะกระถางที่จะวาง",
          body: `<div class="pots">${pots}</div>`,
          tools: s.won ? "" : `<button class="btn" data-g="undo"${s.hist.length ? "" : " disabled"}>↶ ย้อนกลับ</button><button class="btn" data-g="new">⟳ เริ่มด่านใหม่</button>`,
          result: s.won ? { msg: `🌸 ผ่านด่าน ${s.level} แล้ว! ใช้ ${s.moves} ครั้ง`, extra: `<button class="btn primary" data-g="next">ด่านต่อไป ▶</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.sort;
        if (a === "new") return G.sort.start(s.level);
        if (a === "next") return G.sort.start(stats.sort.level);
        if (s.won) return;
        if (a === "undo") { if (s.hist.length) { s.pots = s.hist.pop(); s.moves--; s.sel = -1; } return; }
        if (a !== "pot") return;
        const i = +el.dataset.i;
        if (s.sel < 0) { if (s.pots[i].length) s.sel = i; return; }
        if (s.sel === i) { s.sel = -1; return; }
        if (L.canMove(s.pots, s.sel, i)) {
          s.hist.push(JSON.parse(JSON.stringify(s.pots)));
          L.doMove(s.pots, s.sel, i); s.moves++; s.sel = -1;
          if (L.solved(s.pots)) { s.won = true; stats.sort.level = s.level + 1; stats.sort.wins++; saveStats(); }
        } else s.sel = s.pots[i].length ? i : -1;
      },
    },

    memory: {
      start(order) {
        clearMem();
        const e = order || shuffle([...MEM, ...MEM]);
        S.memory = { cards: e.map((x) => ({ e: x, open: false, done: false })), first: -1, lock: false, moves: 0, won: false, logged: false };
      },
      view() {
        const s = S.memory, pairs = s.cards.filter((c) => c.done).length / 2;
        const cards = s.cards.map((c, i) => `<button class="mc" data-g="card" data-i="${i}" data-state="${c.done ? "done" : c.open ? "open" : "closed"}" aria-label="การ์ด ${i + 1}: ${c.open || c.done ? c.e : "ปิดอยู่"}">${c.open || c.done ? c.e : "🌿"}</button>`).join("");
        return {
          status: `จับคู่ได้ ${pairs}/${s.cards.length / 2} · พลิก ${s.moves} ครั้ง`,
          hint: "พลิกการ์ดทีละ 2 ใบ ถ้าเหมือนกันจะอยู่เปิดค้างไว้",
          body: `<div class="mem">${cards}</div>`,
          tools: `<button class="btn" data-g="new">⟳ สับใหม่</button>`,
          result: s.won ? { msg: `🍄 จับคู่ครบแล้ว! ใช้ ${s.moves} ครั้ง`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.memory;
        if (a === "new") return G.memory.start();
        if (a !== "card" || s.lock || s.won) return;
        const i = +el.dataset.i, c = s.cards[i];
        if (c.open || c.done) return;
        c.open = true;
        if (s.first < 0) { s.first = i; return; }
        const f = s.first; s.moves++;
        if (s.cards[f].e === c.e) {
          s.cards[f].done = c.done = true; s.first = -1;
          if (s.cards.every((x) => x.done)) {
            s.won = true; stats.memory.wins++;
            stats.memory.best = stats.memory.best ? Math.min(stats.memory.best, s.moves) : s.moves; saveStats();
          }
        } else {
          s.lock = true;
          memTimer = setTimeout(() => {
            if (S.memory !== s) return;
            s.cards[f].open = false; c.open = false; s.first = -1; s.lock = false;
            if (view === "memory") render();
          }, 800);
        }
      },
    },

    merge: {
      start(grid) {
        const g = grid || Array(16).fill(0);
        if (!grid) { spawn(g); spawn(g); }
        S.merge = { grid: g, score: 0, prev: null, over: false, reached: g.includes(MAXLV), logged: false };
      },
      view() {
        const s = S.merge;
        const cells = s.grid.map((v) => `<div class="mt" data-l="${v}">${v ? `${TILES[v]}<i>${v}</i>` : ""}</div>`).join("");
        const arrows = [["U", "↑", "ขึ้น"], ["L", "←", "ซ้าย"], ["D", "↓", "ลง"], ["R", "→", "ขวา"]].map(([d, t, n]) => `<button class="btn" data-g="mv" data-d="${d}" aria-label="เลื่อน${n}">${t}</button>`).join("");
        const result = s.over ? { msg: s.reached ? `🍄 ปลูกเห็ดสำเร็จ และกระดานเต็มพอดี! คะแนน ${s.score}` : `🌳 เต็มแล้ว! คะแนน ${s.score}`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` }
          : s.reached ? { msg: `🍄 ปลูกเห็ดสำเร็จ! คะแนน ${s.score} (เล่นต่อได้)`, extra: "" } : null;
        return {
          status: `คะแนน ${s.score} · สูงสุด ${Math.max(stats.merge.best, s.score)}`,
          hint: "ปัดนิ้วบนกระดาน (หรือใช้ปุ่มลูกศร) ให้ของเหมือนกันชนกันแล้วรวมร่าง",
          body: `<div class="m4" role="group" aria-label="กระดาน 4×4">${cells}</div><div class="arrows">${arrows}</div>`,
          tools: `<button class="btn" data-g="undo"${s.prev ? "" : " disabled"}>↶ ย้อนกลับ</button><button class="btn" data-g="new">⟳ เริ่มใหม่</button>`,
          result,
        };
      },
      move(d) {
        const s = S.merge; if (s.over) return;
        const r = L.mergeMove(s.grid, d); if (!r.moved) return;
        s.prev = { grid: s.grid, score: s.score };
        s.grid = r.grid; s.score += r.gained; spawn(s.grid);
        if (!s.reached && s.grid.includes(MAXLV)) { s.reached = true; stats.merge.wins++; }
        if (!L.canMerge(s.grid)) s.over = true;
        stats.merge.best = Math.max(stats.merge.best, s.score); saveStats();
      },
      act(a, el) {
        const s = S.merge;
        if (a === "new") return G.merge.start();
        if (a === "undo") { if (s.prev) { s.grid = s.prev.grid; s.score = s.prev.score; s.prev = null; s.over = false; } return; }
        if (a === "mv") G.merge.move(el.dataset.d);
      },
    },

    slide: {
      start(tiles) { S.slide = { tiles: tiles || L.slideShuffle(), moves: 0, won: false, logged: false }; },
      view() {
        const s = S.slide;
        const cells = s.tiles.map((id, pos) => {
          if (id === 8 && !s.won) return `<button class="st blank" disabled aria-label="ช่องว่าง"></button>`;
          const bg = `${(id % 3) * 50}% ${Math.floor(id / 3) * 50}%`;
          return `<button class="st" data-g="tile" data-i="${pos}" style="background-position:${bg}" aria-label="ชิ้นที่ ${id + 1}"><i>${id + 1}</i></button>`;
        }).join("");
        return {
          status: `ย้าย ${s.moves} ครั้ง`,
          hint: "แตะชิ้นที่อยู่ติดช่องว่างเพื่อเลื่อน ให้เรียงเลข 1–8 และได้รูปเห็ด",
          body: `<div class="slidewrap"><img class="slideprev" src="icon.svg" alt="ภาพตัวอย่าง" width="64" height="64"><div class="s3">${cells}</div></div>`,
          tools: `<button class="btn" data-g="new">⟳ สับใหม่</button>`,
          result: s.won ? { msg: `🍄 ต่อภาพสำเร็จ! ใช้ ${s.moves} ครั้ง`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.slide;
        if (a === "new") return G.slide.start();
        if (a !== "tile" || s.won) return;
        const pos = +el.dataset.i, b = s.tiles.indexOf(8);
        if (!L.near(b).includes(pos)) return;
        [s.tiles[b], s.tiles[pos]] = [s.tiles[pos], s.tiles[b]]; s.moves++;
        if (L.slideSolved(s.tiles)) {
          s.won = true; stats.slide.wins++;
          stats.slide.best = stats.slide.best ? Math.min(stats.slide.best, s.moves) : s.moves; saveStats();
        }
      },
    },

    ball: {
      start() { S.ball = L.ballNew(); },
      view() {
        const s = S.ball;
        return {
          status: ballStatus(s),
          hint: "ลากนิ้วบนแถบด้านล่างเพื่อเลื่อนตะกร้า (หรือลากตรงไหนก็ได้บนกระดาน) · ⭐ +3 · 💣 −2",
          body: `<canvas id="ballc" class="ballc" width="600" height="800" role="img" aria-label="กระดานรับลูกบอล"></canvas><div class="ballctl"><button class="btn" data-g="bm" data-d="-1" aria-label="เลื่อนตะกร้าไปซ้าย">◀</button><div id="ballpad" class="ballpad" role="slider" aria-label="แถบเลื่อนตะกร้า" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span id="ballthumb" class="thumb"></span></div><button class="btn" data-g="bm" data-d="1" aria-label="เลื่อนตะกร้าไปขวา">▶</button></div>`,
          tools: s.over ? "" : `<button class="btn primary" data-g="toggle">${s.running ? "⏸ พัก" : s.started ? "▶ ต่อ" : "▶ เริ่ม"}</button>`,
          result: s.over ? { msg: `⏱ หมดเวลา! ได้ ${s.score} คะแนน (รับ ${s.caught} ลูก)`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.ball;
        if (a === "new") return G.ball.start();
        if (a === "toggle") { if (!s.over) { s.running = !s.running; s.started = true; } return; }
        if (a === "bm") s.x = L.clampX(s, s.x + +el.dataset.d * 28);
      },
    },

    mahjong: {
      start(spec) {
        let tiles;
        if (spec) tiles = spec.map((t) => ({ ...t, alive: true }));
        else { const d = L.mjDeal(MJ_LAYOUT); tiles = MJ_LAYOUT.map((p, i) => ({ ...p, f: d.faces[i], alive: true })); }
        S.mahjong = { tiles, sel: -1, moves: 0, hist: [], hint: null, stuck: false, won: false, logged: false };
        G.mahjong.check();
      },
      freeIdx() { const t = S.mahjong.tiles; return t.map((_, i) => i).filter((i) => L.mjFree(t, i)); },
      findPair() {
        const t = S.mahjong.tiles, f = G.mahjong.freeIdx();
        for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) if (t[f[i]].f === t[f[j]].f) return [f[i], f[j]];
        return null;
      },
      check() { const s = S.mahjong; s.won = s.tiles.every((t) => !t.alive); s.stuck = !s.won && !G.mahjong.findPair(); },
      view() {
        const s = S.mahjong, free = new Set(G.mahjong.freeIdx()), left = s.tiles.filter((t) => t.alive).length;
        const order = s.tiles.map((_, i) => i).filter((i) => s.tiles[i].alive).sort((a, b) => s.tiles[a].z - s.tiles[b].z || s.tiles[a].r - s.tiles[b].r || s.tiles[a].c - s.tiles[b].c);
        const tiles = order.map((i) => {
          const t = s.tiles[i], isFree = free.has(i);
          return `<button class="tile" data-g="tile" data-i="${i}" data-free="${isFree ? 1 : 0}"${s.hint && s.hint.includes(i) ? ' data-hint="1"' : ""} aria-pressed="${s.sel === i}" aria-label="ไพ่ ${t.f} แถว ${t.r + 1} คอลัมน์ ${t.c + 1}${t.z ? " ชั้น " + (t.z + 1) : ""} ${isFree ? "เลือกได้" : "ถูกบังอยู่"}" style="left:${(t.c * 100) / 6}%;top:${t.r * 25}%;transform:translate(${-t.z * 3}px,${-t.z * 4}px);z-index:${t.z + 1}">${t.f}</button>`;
        }).join("");
        return {
          status: `เหลือ ${left} ใบ · จับแล้ว ${s.moves} คู่`,
          hint: "แตะไพ่ 2 ใบที่เหมือนกัน ไพ่ที่จับได้ต้องไม่มีอะไรทับ และด้านซ้ายหรือขวาต้องว่าง",
          body: `<div class="mjb">${tiles}</div>`,
          tools: `<button class="btn" data-g="hint">💡 ใบ้</button><button class="btn" data-g="undo"${s.hist.length ? "" : " disabled"}>↶ ย้อนกลับ</button><button class="btn" data-g="new">⟳ สับใหม่</button>`,
          result: s.won ? { msg: `🀄 จับคู่ครบทุกใบแล้ว! ใช้ ${s.moves} คู่`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` }
            : s.stuck ? { msg: "ไม่มีคู่ที่จับได้แล้ว", nolog: true, extra: `<button class="btn primary" data-g="reshuffle">🔀 สับไพ่ที่เหลือ</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.mahjong, M = G.mahjong;
        if (a === "new") return M.start();
        if (a === "hint") { s.hint = M.findPair(); return; }
        s.hint = null;
        if (a === "undo") {
          const last = s.hist.pop(); if (!last) return;
          last.forEach((i) => (s.tiles[i].alive = true)); s.moves--; s.sel = -1; return M.check();
        }
        if (a === "reshuffle") {
          const idx = s.tiles.map((_, i) => i).filter((i) => s.tiles[i].alive), d = L.mjDeal(idx.map((i) => s.tiles[i]));
          if (d) { idx.forEach((i, k) => (s.tiles[i].f = d.faces[k])); s.hist = []; s.sel = -1; M.check(); }
          return;
        }
        if (a !== "tile" || s.won) return;
        const i = +el.dataset.i, t = s.tiles[i];
        if (!L.mjFree(s.tiles, i)) { s.sel = -1; return; }
        if (s.sel === i) { s.sel = -1; return; }
        if (s.sel < 0) { s.sel = i; return; }
        const o = s.tiles[s.sel];
        if (o.f !== t.f) { s.sel = i; return; }
        s.hist.push([s.sel, i]); o.alive = t.alive = false; s.moves++; s.sel = -1; M.check();
        if (s.won) { stats.mahjong.wins++; saveStats(); }
      },
    },

    tetris: {
      start() { S.tetris = L.tNew(); },
      view() {
        const s = S.tetris;
        return {
          status: tetStatus(s),
          hint: "แตะกระดานเพื่อเริ่ม/หมุน · ลากซ้าย-ขวาเพื่อเลื่อน · หรือใช้ปุ่มด้านล่าง (เริ่มช้า ๆ ค่อย ๆ เร็วขึ้นทุก 10 แถว)",
          body: `<canvas id="tetc" class="tetc" width="420" height="600" role="img" aria-label="กระดานเทตริส"></canvas><div class="tctl"><button class="btn" data-g="tl" aria-label="เลื่อนซ้าย">◀</button><button class="btn" data-g="trot" aria-label="หมุนบล็อก">⟳</button><button class="btn" data-g="tsoft" aria-label="ลงทีละช่อง">▼</button><button class="btn" data-g="tr" aria-label="เลื่อนขวา">▶</button><button class="btn wide" data-g="thard">⏬ ตกลงเลย</button></div>`,
          tools: s.over ? "" : `<button class="btn primary" data-g="toggle">${s.running ? "⏸ พัก" : s.started ? "▶ ต่อ" : "▶ เริ่ม"}</button>`,
          result: s.over ? { msg: `🧱 จบเกม! ได้ ${s.score} คะแนน (${s.lines} แถว)`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` } : null,
        };
      },
      act(a) {
        const s = S.tetris;
        if (a === "new") return G.tetris.start();
        if (a === "toggle") { if (!s.over) { s.running = !s.running; s.started = true; } return; }
        if (!s.running || s.over) return;
        if (a === "tl") L.tMove(s, -1);
        else if (a === "tr") L.tMove(s, 1);
        else if (a === "trot") L.tRot(s, 1);
        else if (a === "tsoft") { L.tDown(s, true); s.acc = 0; }
        else if (a === "thard") L.tHard(s);
      },
    },

    egg: {
      start() { S.egg = L.eggNew(); },
      view() {
        const s = S.egg;
        return {
          status: eggStatus(s),
          hint: "ลากนิ้วบนกระดานเพื่อเล็ง แล้วปล่อยนิ้วเพื่อยิง (หรือกดปุ่ม) · ไข่สี/ลายเดียวกัน 3 ฟองขึ้นไปจะแตก ไข่ที่ไม่มีที่ยึดจะหล่น",
          body: `<canvas id="eggc" class="eggc" width="540" height="800" role="img" aria-label="กระดานยิงไข่"></canvas><div class="ectl"><button class="btn" data-g="ea" data-d="-1" aria-label="เล็งไปทางซ้าย">◀</button><button class="btn primary" data-g="efire">🥚 ยิง!</button><button class="btn" data-g="ea" data-d="1" aria-label="เล็งไปทางขวา">▶</button></div>`,
          tools: `<button class="btn" data-g="new">⟳ เริ่มใหม่</button>`,
          result: s.won ? { msg: `🦖 ฟักครบทุกฟองแล้ว! ยิง ${s.shots} ครั้ง ได้ ${s.score} คะแนน`, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` }
            : s.over ? { msg: "🥚 ไข่ลงมาถึงเส้นแล้ว ลองใหม่อีกรอบนะ", nolog: true, extra: `<button class="btn primary" data-g="new">เล่นอีกรอบ</button>` } : null,
        };
      },
      act(a, el) {
        const s = S.egg;
        if (a === "new") return G.egg.start();
        if (a === "efire") return void L.eggFire(s);
        if (a === "ea") s.ang = L.eggClamp(s.ang + +el.dataset.d * 0.06);
      },
    },
  };

  /* ---------- animated games: one shared 33 ms tick, so every phone plays them at the same pace ---------- */
  let loopId = 0;
  const ensureLoop = () => { if (!loopId) loopId = setInterval(loop, 33); };
  const stopLoop = () => { clearInterval(loopId); loopId = 0; };
  const ballStatus = (s) => `เวลา ${Math.ceil(s.t / 1000)} วิ · ${s.score} คะแนน`;
  const tetStatus = (s) => `คะแนน ${s.score} · แถว ${s.lines} · เลเวล ${s.level}`;
  const eggStatus = (s) => `คะแนน ${s.score} · ยิง ${s.shots} · เหลือ ${L.eggLeft(s.grid)} ฟอง`;
  const cssVar = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
  function banner(ctx, w, h, text) {
    ctx.fillStyle = "rgba(15,26,58,.72)"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 20px sans-serif"; ctx.fillText(text, w / 2, h / 2); ctx.textBaseline = "alphabetic";
  }
  function drawBall() {
    const cv = document.getElementById("ballc"), s = S.ball; if (!cv || !s) return;
    const ctx = cv.getContext("2d"), accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1f5fd0";
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, L.BW, L.BH);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(s.x - s.pw / 2, 0, s.pw, L.PY);     // the catch lane: what falls in here is caught
    ctx.strokeStyle = "rgba(16,40,92,.28)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(s.x - s.pw / 2, 0); ctx.lineTo(s.x - s.pw / 2, L.PY); ctx.moveTo(s.x + s.pw / 2, 0); ctx.lineTo(s.x + s.pw / 2, L.PY); ctx.stroke(); ctx.setLineDash([]);
    const f = (s.x - s.pw / 2) / (L.BW - s.pw), th = document.getElementById("ballthumb"), pad = document.getElementById("ballpad");
    if (th) th.style.left = `calc((100% - 44px) * ${f})`;
    if (pad) pad.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    ctx.fillStyle = "#2e9e3f"; ctx.fillRect(0, L.BH - 12, L.BW, 12);
    ctx.fillStyle = "#7ad06a"; ctx.fillRect(0, L.BH - 12, L.BW, 4);
    ctx.textAlign = "center"; ctx.font = "26px serif";
    for (const it of s.items) ctx.fillText(it.e, it.x, it.y + 9);
    ctx.fillStyle = accent;                                    // the basket
    ctx.beginPath(); ctx.moveTo(s.x - s.pw / 2, L.PY); ctx.lineTo(s.x + s.pw / 2, L.PY); ctx.lineTo(s.x + s.pw / 2 - 8, L.PY + L.PH + 6); ctx.lineTo(s.x - s.pw / 2 + 8, L.PY + L.PH + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillRect(s.x - s.pw / 2 + 6, L.PY + 3, s.pw - 12, 3);
  }
  function drawBallAll() {
    drawBall();
    const cv = document.getElementById("ballc"), s = S.ball;
    if (cv && s && !s.running && !s.over) { const ctx = cv.getContext("2d"); ctx.setTransform(2, 0, 0, 2, 0, 0); banner(ctx, L.BW, L.BH, s.started ? "พักอยู่ · แตะเพื่อเล่นต่อ" : "แตะกระดานเพื่อเริ่ม"); }
  }
  const tCell = (ctx, x, y, z, col) => {
    ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, z - 2, z - 2);
    ctx.fillStyle = "rgba(255,255,255,.32)"; ctx.fillRect(x + 1, y + 1, z - 2, 4);
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x + 1, y + z - 5, z - 2, 4);
  };
  function drawTetris() {
    const cv = document.getElementById("tetc"), s = S.tetris; if (!cv || !s) return;
    const ctx = cv.getContext("2d"), C = 30;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 420, 600);
    ctx.fillStyle = "#0f1a3a"; ctx.fillRect(0, 0, 300, 600);
    ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < 10; x++) { ctx.moveTo(x * C, 0); ctx.lineTo(x * C, 600); }
    for (let y = 1; y < 20; y++) { ctx.moveTo(0, y * C); ctx.lineTo(300, y * C); }
    ctx.stroke();
    s.grid.forEach((row, y) => row.forEach((k, x) => { if (k) tCell(ctx, x * C, y * C, C, T_COLORS[k]); }));
    const p = s.piece;
    if (p && !s.over) {
      const gy = L.tGhostY(s);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2;
      L.tCells(p.k, p.r).forEach(([dx, dy]) => ctx.strokeRect((p.x + dx) * C + 3, (gy + dy) * C + 3, C - 6, C - 6));   // where it will land
      L.tCells(p.k, p.r).forEach(([dx, dy]) => tCell(ctx, (p.x + dx) * C, (p.y + dy) * C, C, T_COLORS[p.k]));
    }
    ctx.fillStyle = "#16224a"; ctx.fillRect(300, 0, 120, 600);
    ctx.fillStyle = "#cbd5ff"; ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif"; ctx.fillText("ต่อไป", 360, 30);
    const nb = T_BASE[s.next], cells = L.tCells(s.next, 0), z = 22;
    cells.forEach(([dx, dy]) => tCell(ctx, 360 - (nb.n * z) / 2 + dx * z, 48 + dy * z, z, T_COLORS[s.next]));
    ctx.fillStyle = "#cbd5ff"; ctx.font = "15px sans-serif"; ctx.fillText(`เลเวล ${s.level}`, 360, 200); ctx.fillText(`แถว ${s.lines}`, 360, 228);
    if (s.over) banner(ctx, 300, 600, "จบเกม");
    else if (!s.running) banner(ctx, 300, 600, s.started ? "พักอยู่ · แตะเพื่อเล่นต่อ" : "แตะกระดานเพื่อเริ่ม");
  }
  const EGG_COL = ["", "#f87171", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa"], EGG_SYM = ["", "●", "▲", "■", "★", "♥"];
  function paintEgg(ctx, x, y, k, sc = 1) {
    const rx = (EGG.R - 1) * sc, ry = (EGG.R + 1) * sc;
    ctx.fillStyle = EGG_COL[k]; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(16,40,92,.55)"; ctx.stroke();
    ctx.fillStyle = "rgba(16,40,92,.2)";                      // speckles, so it reads as a dinosaur egg
    for (const [ox, oy, r] of [[-0.45, 0.35, 0.16], [0.5, 0.05, 0.12], [0.15, 0.62, 0.11], [-0.1, -0.55, 0.1]]) { ctx.beginPath(); ctx.arc(x + ox * rx, y + oy * ry, r * rx, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(x - rx * 0.35, y - ry * 0.4, rx * 0.28, ry * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.font = `bold ${Math.round(12 * sc)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(EGG_SYM[k], x, y + 1); ctx.textBaseline = "alphabetic";
  }
  function drawEggBoard() {
    const cv = document.getElementById("eggc"), s = S.egg; if (!cv || !s) return;
    const ctx = cv.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, EGG.W, EGG.H);
    const bg = ctx.createLinearGradient(0, 0, 0, EGG.H); bg.addColorStop(0, "#fdf6e3"); bg.addColorStop(1, "#d9f0ff");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, EGG.W, EGG.H);
    const ly = EGG.R + EGG.LOSS * EGG.ROWH - EGG.ROWH / 2;
    ctx.strokeStyle = "rgba(200,32,31,.55)"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(EGG.W, ly); ctx.stroke(); ctx.setLineDash([]);
    s.grid.forEach((row, r) => row.forEach((k, c) => { if (k) { const q = L.eggPos(r, c); paintEgg(ctx, q.x, q.y, k); } }));
    if (!s.shot && !s.over && !s.won) {
      ctx.strokeStyle = "rgba(16,40,92,.55)"; ctx.lineWidth = 2; ctx.setLineDash([2, 7]); ctx.lineCap = "round"; ctx.beginPath();
      L.eggPath(s).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = "34px serif"; ctx.textAlign = "center"; ctx.fillText("🦖", 222, 392);
    paintEgg(ctx, 52, 372, s.next, 0.8);
    ctx.fillStyle = "rgba(16,40,92,.75)"; ctx.font = "11px sans-serif"; ctx.fillText("ต่อไป", 52, 344);
    if (!s.shot) paintEgg(ctx, EGG.SX, EGG.SY, s.cur);
    if (s.shot) paintEgg(ctx, s.shot.x, s.shot.y, s.shot.c);
  }
  const ANIM = {
    ball: { draw: drawBallAll, step: (s) => L.ballStep(s, 33), status: ballStatus, done: (s) => s.over && !s.counted,
      finish: (s) => { s.counted = true; stats.ball.plays++; stats.ball.best = Math.max(stats.ball.best, s.score); saveStats(); } },
    tetris: { draw: drawTetris, step: (s) => L.tStep(s, 33), status: tetStatus, done: (s) => s.over && !s.counted,
      finish: (s) => { s.counted = true; stats.tetris.plays++; stats.tetris.best = Math.max(stats.tetris.best, s.score); saveStats(); } },
    egg: { draw: drawEggBoard, step: (s) => L.eggStep(s, 33), status: eggStatus, done: (s) => (s.won || s.over) && !s.counted,
      finish: (s) => { s.counted = true; if (s.won) { stats.egg.wins++; stats.egg.best = stats.egg.best ? Math.min(stats.egg.best, s.shots) : s.shots; saveStats(); } } },
  };
  function loop() {
    const r = root(), a = ANIM[view], s = S[view];
    if (!a || !s || !r || r.hidden) return stopLoop();
    if (!document.hidden) a.step(s);
    a.draw();
    const pill = r.querySelector(".gpill"); if (pill) pill.textContent = a.status(s);
    if (a.done(s)) { a.finish(s); stopLoop(); render(); }
  }

  /* ---------- render ---------- */
  function statText(id) {
    const t = stats[id];
    if (id === "sort") return `ผ่านแล้ว ${t.wins} ด่าน`;
    if (id === "merge" || id === "ball" || id === "tetris") return t.best ? `คะแนนสูงสุด ${t.best}` : "ยังไม่เคยเล่น";
    if (id === "mahjong") return t.wins ? `เคลียร์แล้ว ${t.wins} ครั้ง` : "ยังไม่เคยเคลียร์";
    return t.wins ? `ชนะ ${t.wins} ครั้ง · ดีที่สุด ${t.best} ครั้ง` : "ยังไม่เคยชนะ";
  }
  function menuHtml() {
    return `<h1>🎮 พักสมอง</h1>
      <div class="card sprout"><div>เกมสั้น ๆ 2–5 นาที ไม่มีเวลาไล่หลัง เล่นเพื่อผ่อนคลาย แพ้ไม่มี เริ่มใหม่ได้เสมอ</div></div>
      <div class="gmenu">${GAMES.map((g) => `<button class="gcard" data-g="open" data-id="${g.id}"><span class="em" aria-hidden="true">${g.emoji}</span><b>${esc(g.name)}</b><span class="muted">${esc(g.desc)}</span><span class="muted">⏱ ${esc(g.time)}</span><span class="gst">${esc(statText(g.id))}</span></button>`).join("")}</div>`;
  }
  function gameHtml(id) {
    const g = byId(id), v = G[id].view(), s = S[id];
    const res = v.result ? `<div class="card gres" role="status"><b>${esc(v.result.msg)}</b><div class="row wrap" style="margin-top:10px">${v.result.extra}${v.result.nolog ? "" : `<button class="btn" data-g="log"${s.logged ? " disabled" : ""}>${s.logged ? "✓ บันทึกแล้ว" : "🌼 บันทึกเป็นกิจกรรมเติมพลัง"}</button>`}</div></div>` : "";
    return `<h1>${g.emoji} ${esc(g.name)}</h1>
      <div class="gbar"><button class="btn" data-g="menu" aria-label="กลับเมนูเกม">‹ เมนู</button><span class="gpill" role="status">${esc(v.status)}</span></div>
      <div class="card gboard">${v.body}<p class="muted ghint">${esc(v.hint)}</p></div>
      ${res}
      <div class="row wrap">${v.tools}</div>`;
  }
  function render() {
    const el = root(); if (!el) return;
    el.innerHTML = view ? gameHtml(view) : menuHtml();
    if (ANIM[view]) { ensureLoop(); ANIM[view].draw(); } else stopLoop();
  }
  function open(id) {
    if (!G[id]) return;
    if (!S[id]) G[id].start();
    view = id;
    if (api.show) api.show("games"); else render();
  }
  function home() { clearMem(); stopLoop(); view = null; render(); }

  /* ---------- input ---------- */
  function onClick(e) {
    const el = e.target.closest("[data-g]"); if (!el || el.disabled) return;
    const a = el.dataset.g;
    if (a === "menu") return home();
    if (a === "open") return open(el.dataset.id);
    if (a === "log") {
      const s = S[view];
      if (s && !s.logged) { s.logged = true; if (api.onLog) api.onLog(byId(view).name); }
      return render();
    }
    if (view) { G[view].act(a, el); render(); }
  }
  let down = null;
  function onDown(e) { const b = e.target.closest(".m4"); down = b ? { x: e.clientX, y: e.clientY } : null; }
  function onUp(e) {
    if (!down || view !== "merge") { down = null; return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    G.merge.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U")); render();
  }
  function onKey(e) {
    const r = root();
    if (!r || r.hidden || document.querySelector("dialog[open]")) return;
    const d = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" }[e.key];
    const typing = /^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test((document.activeElement && document.activeElement.tagName) || "");
    if (view === "merge" && d) { e.preventDefault(); G.merge.move(d); render(); }
    else if (view === "ball" && (d === "L" || d === "R")) { e.preventDefault(); S.ball.x = L.clampX(S.ball, S.ball.x + (d === "L" ? -28 : 28)); drawBall(); }
    else if (view === "tetris") {
      const s = S.tetris; if (!s.running || s.over) return;
      let did = true;
      if (e.key === "ArrowLeft") L.tMove(s, -1);
      else if (e.key === "ArrowRight") L.tMove(s, 1);
      else if (e.key === "ArrowUp") L.tRot(s, 1);
      else if (e.key === "ArrowDown") { L.tDown(s, true); s.acc = 0; }
      else if (e.key === " " && !typing) L.tHard(s);
      else did = false;
      if (did) { e.preventDefault(); drawTetris(); if (s.over) render(); }
    } else if (view === "egg") {
      const s = S.egg;
      if (d === "L" || d === "R") { e.preventDefault(); s.ang = L.eggClamp(s.ang + (d === "L" ? -0.06 : 0.06)); drawEggBoard(); }
      else if (e.key === " " && !typing) { e.preventDefault(); L.eggFire(s); }
    }
  }
  // The board is dragged relatively (the basket moves by the distance the finger moves, so touch anywhere, away from the basket);
  // the strip under the board is a slider that maps the finger's position onto the basket. Either way the finger stays off the catch lane.
  let drag = null;
  function onBallPointer(e) {
    if (e.type === "pointerup" || e.type === "pointercancel") { drag = null; return; }
    const s = S.ball, t = e.target;
    if (!s || !t || !t.closest) return;
    const cv = t.closest("#ballc"), pad = t.closest("#ballpad");
    if (!cv && !pad) return;
    if (e.type === "pointerdown") { try { (cv || pad).setPointerCapture(e.pointerId); } catch {} drag = cv ? { px: e.clientX, x0: s.x } : null; if (cv) tapStart(s); }
    else if (!(e.buttons & 1)) return;
    if (pad) {
      const b = pad.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - b.left - 22) / (b.width - 44)));
      s.x = s.pw / 2 + f * (L.BW - s.pw);
    } else if (drag) {
      const b = cv.getBoundingClientRect();
      s.x = L.clampX(s, drag.x0 + ((e.clientX - drag.px) / b.width) * L.BW);
    }
    drawBall();
  }

  // tapping a board that is not running starts it (or resumes it), so the start button need not be in reach
  function tapStart(s) {
    if (s.running || s.over) return false;
    s.running = true; s.started = true;
    const b = document.querySelector('#tab-games [data-g="toggle"]'); if (b) b.textContent = "⏸ พัก";
    return true;
  }
  // tetris: tap rotates, a sideways drag slides the piece one cell per cell-width; egg shooter: drag to aim, release to fire
  let tet = null, aiming = false;
  function onBoardPointer(e) {
    if (e.type === "pointerup" || e.type === "pointercancel") {
      if (e.type === "pointerup") {
        if (tet && !tet.moved && !tet.started && S.tetris && S.tetris.running && !S.tetris.over) { L.tRot(S.tetris, 1); drawTetris(); }
        if (aiming && S.egg && L.eggFire(S.egg)) drawEggBoard();
      }
      tet = null; aiming = false; return;
    }
    const t = e.target; if (!t || !t.closest) return;
    const tc = t.closest("#tetc"), ec = t.closest("#eggc");
    if (tc && S.tetris) {
      const s = S.tetris, b = tc.getBoundingClientRect();
      if (e.type === "pointerdown") { try { tc.setPointerCapture(e.pointerId); } catch {} tet = { x: e.clientX, applied: 0, moved: false, started: tapStart(s) }; drawTetris(); return; }
      if (!tet || !(e.buttons & 1) || !s.running || s.over) return;
      const px = b.width / 14, steps = Math.trunc((e.clientX - tet.x) / px);
      if (Math.abs(e.clientX - tet.x) > px * 0.4) tet.moved = true;
      while (tet.applied < steps) { L.tMove(s, 1); tet.applied++; }
      while (tet.applied > steps) { L.tMove(s, -1); tet.applied--; }
      drawTetris();
    } else if (ec && S.egg) {
      const s = S.egg, b = ec.getBoundingClientRect();
      if (e.type === "pointerdown") { try { ec.setPointerCapture(e.pointerId); } catch {} aiming = true; }
      else if (!(e.buttons & 1) || !aiming) return;
      s.ang = L.eggAim(((e.clientX - b.left) / b.width) * EGG.W, ((e.clientY - b.top) / b.height) * EGG.H);
      drawEggBoard();
    }
  }

  const api = {
    render, open, home, has: (id) => !!G[id], show: null, onLog: null, _logic: L,
    _test: {
      sort: (pots) => { if (!S.sort) G.sort.start(); Object.assign(S.sort, { pots, sel: -1, hist: [], moves: 0, won: false }); render(); },
      memory: (order) => { G.memory.start(order); render(); },
      merge: (grid) => { G.merge.start(grid); render(); },
      slide: (tiles) => { G.slide.start(tiles); render(); },
      ball: (patch) => { if (!S.ball) G.ball.start(); Object.assign(S.ball, patch); render(); },
      mahjong: (spec) => { G.mahjong.start(spec); render(); },
      tetris: (patch) => { if (!S.tetris) G.tetris.start(); Object.assign(S.tetris, patch); render(); },
      egg: (patch) => { if (!S.egg) G.egg.start(); Object.assign(S.egg, patch); render(); },
      get: (id) => S[id],
    },
  };
  window.Games = api;
  document.addEventListener("DOMContentLoaded", () => {
    const r = root();
    r.addEventListener("click", onClick);
    r.addEventListener("pointerdown", onDown);
    r.addEventListener("pointerup", onUp);
    r.addEventListener("pointerdown", onBallPointer);
    r.addEventListener("pointermove", onBallPointer);
    r.addEventListener("pointerup", onBallPointer);
    r.addEventListener("pointercancel", onBallPointer);
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) r.addEventListener(t, onBoardPointer);
    document.addEventListener("keydown", onKey);
  });
})();
