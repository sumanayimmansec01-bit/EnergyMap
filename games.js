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
  const DEF = () => ({ sort: { level: 1, wins: 0 }, memory: { wins: 0, best: 0 }, merge: { wins: 0, best: 0 }, slide: { wins: 0, best: 0 } });
  let stats = (() => {
    try { const s = JSON.parse(localStorage.getItem(SKEY)); const d = DEF(); for (const k in d) d[k] = { ...d[k], ...(s && s[k]) }; return d; } catch { return DEF(); }
  })();
  const saveStats = () => { try { localStorage.setItem(SKEY, JSON.stringify(stats)); } catch {} };

  /* ---------- rules ---------- */
  const FLOWERS = ["🌷", "🌸", "🌼", "🌺", "🌻", "🪻", "🌹", "💐"];
  const MEM = ["🍄", "🌼", "🪙", "⭐", "🐢", "🌷"];
  const TILES = ["", "🌰", "🌱", "🌿", "🍀", "🌼", "🌷", "🌻", "🌳", "🍄"]; // level 1..9
  const MAXLV = 9;
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

  /* ---------- state ---------- */
  const GAMES = [
    { id: "sort", emoji: "🌷", name: "จัดกระถางดอกไม้", short: "จัดกระถาง", desc: "เรียงดอกไม้ให้แต่ละกระถางมีชนิดเดียว", time: "2–4 นาที" },
    { id: "memory", emoji: "🍄", name: "พลิกการ์ดจับคู่", short: "จับคู่", desc: "พลิกการ์ดหาคู่ที่เหมือนกัน", time: "1–3 นาที" },
    { id: "merge", emoji: "🌱", name: "รวมเมล็ดเป็นต้นไม้", short: "ปลูกต้นไม้", desc: "ปัดให้ของเหมือนกันรวมกันจนเป็นเห็ด", time: "3–5 นาที" },
    { id: "slide", emoji: "🧩", name: "สไลด์ภาพเห็ด", short: "สไลด์", desc: "เลื่อนชิ้นภาพให้กลับเป็นรูปเห็ด", time: "2–4 นาที" },
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
  };

  /* ---------- render ---------- */
  function statText(id) {
    const t = stats[id];
    if (id === "sort") return `ผ่านแล้ว ${t.wins} ด่าน`;
    if (id === "merge") return t.best ? `คะแนนสูงสุด ${t.best}` : "ยังไม่เคยเล่น";
    return t.wins ? `ชนะ ${t.wins} ครั้ง · ดีที่สุด ${t.best} ครั้ง` : "ยังไม่เคยชนะ";
  }
  function menuHtml() {
    return `<h1>🎮 พักสมอง</h1>
      <div class="card sprout"><div>เกมสั้น ๆ 2–5 นาที ไม่มีเวลาไล่หลัง เล่นเพื่อผ่อนคลาย แพ้ไม่มี เริ่มใหม่ได้เสมอ</div></div>
      <div class="gmenu">${GAMES.map((g) => `<button class="gcard" data-g="open" data-id="${g.id}"><span class="em" aria-hidden="true">${g.emoji}</span><b>${esc(g.name)}</b><span class="muted">${esc(g.desc)}</span><span class="muted">⏱ ${esc(g.time)}</span><span class="gst">${esc(statText(g.id))}</span></button>`).join("")}</div>`;
  }
  function gameHtml(id) {
    const g = byId(id), v = G[id].view(), s = S[id];
    const res = v.result ? `<div class="card gres" role="status"><b>${esc(v.result.msg)}</b><div class="row wrap" style="margin-top:10px">${v.result.extra}<button class="btn" data-g="log"${s.logged ? " disabled" : ""}>${s.logged ? "✓ บันทึกแล้ว" : "🌼 บันทึกเป็นกิจกรรมเติมพลัง"}</button></div></div>` : "";
    return `<h1>${g.emoji} ${esc(g.name)}</h1>
      <div class="gbar"><button class="btn" data-g="menu" aria-label="กลับเมนูเกม">‹ เมนู</button><span class="gpill" role="status">${esc(v.status)}</span></div>
      <div class="card gboard">${v.body}<p class="muted ghint">${esc(v.hint)}</p></div>
      ${res}
      <div class="row wrap">${v.tools}</div>`;
  }
  function render() {
    const el = root(); if (!el) return;
    el.innerHTML = view ? gameHtml(view) : menuHtml();
  }
  function open(id) {
    if (!G[id]) return;
    if (!S[id]) G[id].start();
    view = id;
    if (api.show) api.show("games"); else render();
  }
  function home() { clearMem(); view = null; render(); }

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
    const d = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R" }[e.key];
    const r = root();
    if (!d || view !== "merge" || !r || r.hidden || document.querySelector("dialog[open]")) return;
    e.preventDefault(); G.merge.move(d); render();
  }

  const api = {
    render, open, home, has: (id) => !!G[id], show: null, onLog: null, _logic: L,
    _test: {
      sort: (pots) => { if (!S.sort) G.sort.start(); Object.assign(S.sort, { pots, sel: -1, hist: [], moves: 0, won: false }); render(); },
      memory: (order) => { G.memory.start(order); render(); },
      merge: (grid) => { G.merge.start(grid); render(); },
      slide: (tiles) => { G.slide.start(tiles); render(); },
    },
  };
  window.Games = api;
  document.addEventListener("DOMContentLoaded", () => {
    const r = root();
    r.addEventListener("click", onClick);
    r.addEventListener("pointerdown", onDown);
    r.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey);
  });
})();
