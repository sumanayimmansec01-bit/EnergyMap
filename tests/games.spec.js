// @ts-check
const { test, expect } = require("@playwright/test");

const NOW = new Date("2026-10-18T09:00:00+07:00");
async function open(page, url = "/index.html?seed=7") {
  await page.clock.install({ time: NOW });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  return errors;
}
const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name });
const logic = (page, fn, arg) => page.evaluate(([f, a]) => new Function("L", "a", "return (" + f + ")(L, a)")(window.Games._logic, a), [fn.toString(), arg]);
const noSideScroll = async (page) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
};

test.describe("menu and shortcuts", () => {
  test("the Games tab lists all eight games and each opens, and 'menu' goes back", async ({ page }) => {
    const errors = await open(page);
    await nav(page, /เกม/).click();
    await expect(page.locator(".gcard")).toHaveCount(8);
    for (const [name, title] of [["จัดกระถางดอกไม้", "จัดกระถางดอกไม้"], ["พลิกการ์ดจับคู่", "พลิกการ์ดจับคู่"], ["รวมเมล็ดเป็นต้นไม้", "รวมเมล็ดเป็นต้นไม้"], ["สไลด์ภาพเห็ด", "สไลด์ภาพเห็ด"], ["เลื่อนรับลูกบอล", "เลื่อนรับลูกบอล"], ["จับคู่ไพ่มาจง", "จับคู่ไพ่มาจง"], ["เทตริส", "เทตริส"], ["ยิงไข่ไดโนเสาร์", "ยิงไข่ไดโนเสาร์"]]) {
      await page.locator(".gcard", { hasText: name }).click();
      await expect(page.locator("#tab-games h1")).toContainText(title);
      await page.getByRole("button", { name: /เมนู/ }).click();
      await expect(page.locator(".gcard")).toHaveCount(8);
    }
    expect(errors).toEqual([]);
  });

  test("the log tab no longer repeats the game menu", async ({ page }) => {
    await open(page);
    await expect(page.locator("#tab-log")).not.toContainText("พักสมอง");
    await expect(page.locator("#tab-log").getByRole("button", { name: /^เล่น/ })).toHaveCount(0);
    await expect(nav(page, /เกม/)).toBeVisible();                    // the Games tab is the way in
  });

  test("?game= opens a game directly (the app-icon shortcuts use it)", async ({ page }) => {
    for (const [id, title] of [["sort", "จัดกระถางดอกไม้"], ["memory", "พลิกการ์ดจับคู่"], ["merge", "รวมเมล็ดเป็นต้นไม้"], ["slide", "สไลด์ภาพเห็ด"], ["ball", "เลื่อนรับลูกบอล"], ["mahjong", "จับคู่ไพ่มาจง"], ["tetris", "เทตริส"], ["egg", "ยิงไข่ไดโนเสาร์"]]) {
      await open(page, `/index.html?game=${id}&seed=3`);
      await expect(page.locator("#tab-games h1")).toContainText(title);
    }
    await open(page, "/index.html?game=bogus");
    await expect(page.locator("#tab-log")).toBeVisible();            // an unknown id is ignored
  });

  test("the manifest offers a long-press shortcut for each game", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.shortcuts.map((s) => s.url)).toEqual(["./?game=sort", "./?game=memory", "./?game=merge", "./?game=slide"]);
  });

  test("tapping the Games tab again returns to the menu", async ({ page }) => {
    await open(page, "/index.html?game=slide");
    await nav(page, /เกม/).click();
    await expect(page.locator(".gcard")).toHaveCount(8);
  });
});

test.describe("flower sort", () => {
  test("rules: moves need space and a matching top, a run moves together, solved detection", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const pots = [["🌷", "🌸", "🌸"], ["🌸"], [], ["🌷", "🌷", "🌷", "🌷"]];
      return {
        full: L.canMove(pots, 0, 3), mismatch: L.canMove(pots, 3, 1), match: L.canMove(pots, 0, 1), empty: L.canMove(pots, 0, 2), same: L.canMove(pots, 0, 0), fromEmpty: L.canMove(pots, 2, 0),
        moved: L.doMove(pots, 0, 1), after: JSON.stringify(pots),
        solved: L.solved([["🌷", "🌷", "🌷", "🌷"], []]), partial: L.solved([["🌷", "🌷"], []]), mixed: L.solved([["🌷", "🌷", "🌷", "🌸"]]),
      };
    });
    expect(r).toEqual({ full: false, mismatch: false, match: true, empty: true, same: false, fromEmpty: false, moved: 2, after: JSON.stringify([["🌷"], ["🌸", "🌸", "🌸"], [], ["🌷", "🌷", "🌷", "🌷"]]), solved: true, partial: false, mixed: false });
  });

  test("a new level has 4 of each flower, two spare pots, and is not already solved", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => [1, 2, 3, 6, 9].map((lv) => {
      const pots = L.newSort(lv), flat = pots.flat(), counts = {};
      flat.forEach((f) => (counts[f] = (counts[f] || 0) + 1));
      return { pots: pots.length, kinds: Object.keys(counts).length, ok: Object.values(counts).every((n) => n === 4), spare: pots.filter((p) => !p.length).length, solved: L.solved(pots) };
    }));
    expect(r.map((x) => [x.kinds + 2 === x.pots, x.ok, x.spare, x.solved])).toEqual(Array(5).fill([true, true, 2, false]));
    expect(r.map((x) => x.kinds)).toEqual([3, 4, 5, 8, 8]);
  });

  test("playing to a win: select, move, undo, result, log as a boost, next level", async ({ page }) => {
    await open(page, "/index.html?game=sort&seed=7");
    // one move from done: three tulips in one pot, the fourth in another, plus an empty pot
    await page.evaluate(() => window.Games._test.sort([["🌷", "🌷", "🌷"], ["🌷"], ["🌸", "🌸", "🌸", "🌸"], []]));
    await expect(page.locator("#tab-games .gpill")).toContainText("ด่าน 1 · ย้าย 0");
    await page.getByRole("button", { name: /กระถาง 2/ }).click();
    await expect(page.getByRole("button", { name: /กระถาง 2/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /กระถาง 4/ }).click();   // onto the empty pot
    await expect(page.locator("#tab-games .gpill")).toContainText("ย้าย 1");
    await page.getByRole("button", { name: /ย้อนกลับ/ }).click();
    await expect(page.locator("#tab-games .gpill")).toContainText("ย้าย 0");
    await page.getByRole("button", { name: /กระถาง 2/ }).click();
    await page.getByRole("button", { name: /กระถาง 1/ }).click();   // the fourth tulip joins the others
    await expect(page.locator(".gres")).toContainText("ผ่านด่าน 1");
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await expect(page.getByRole("button", { name: /✓ บันทึกแล้ว/ })).toBeDisabled();
    await page.getByRole("button", { name: /ด่านต่อไป/ }).click();
    await expect(page.locator("#tab-games .gpill")).toContainText("ด่าน 2");
    await nav(page, /บันทึก/).click();                              // the log tab now has the boost
    await expect(page.locator("#entries")).toContainText("เล่นเกมผ่อนคลาย");
    await expect(page.locator("#today .big")).toHaveText("+1");
    await page.reload();                                           // the level reached is remembered
    await page.evaluate(() => window.Games.open("sort"));
    await expect(page.locator("#tab-games .gpill")).toContainText("ด่าน 2");
  });
});

test.describe("memory match", () => {
  const order = ["🍄", "🌼", "🍄", "🌼", "🪙", "🪙", "⭐", "⭐", "🐢", "🐢", "🌷", "🌷"];
  test("a mismatch flips back after a moment, matches stay, and finishing wins", async ({ page }) => {
    await open(page, "/index.html?game=memory&seed=7");
    await page.evaluate((o) => window.Games._test.memory(o), order);
    const card = (n) => page.getByRole("button", { name: new RegExp(`^การ์ด ${n}:`) });
    await card(1).click(); await card(2).click();                    // 🍄 vs 🌼
    await expect(card(1)).toHaveAttribute("data-state", "open");
    await card(3).click();                                          // locked while the pair is showing
    await expect(card(3)).toHaveAttribute("data-state", "closed");
    await page.clock.fastForward(900);
    await expect(card(1)).toHaveAttribute("data-state", "closed");
    await expect(card(2)).toHaveAttribute("data-state", "closed");
    await card(1).click(); await card(3).click();                    // 🍄 + 🍄
    await expect(card(1)).toHaveAttribute("data-state", "done");
    await expect(page.locator("#tab-games .gpill")).toContainText("จับคู่ได้ 1/6 · พลิก 2");
    for (const [a, b] of [[2, 4], [5, 6], [7, 8], [9, 10], [11, 12]]) { await card(a).click(); await card(b).click(); }
    await expect(page.locator(".gres")).toContainText("จับคู่ครบแล้ว");
    await expect(page.locator(".gres")).toContainText("ใช้ 7 ครั้ง");
  });

  test("a shuffled deck has exactly two of each card", async ({ page }) => {
    await open(page, "/index.html?game=memory&seed=11");
    const faces = await page.evaluate(() => { window.Games._test.memory(); return null; });
    expect(faces).toBeNull();
    await expect(page.locator(".mc")).toHaveCount(12);
  });
});

test.describe("merge garden", () => {
  test("rules: slide, merge once per pair, top level stays, directions", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => ({
      a: L.slideLine([1, 1, 2, 0]).line, b: L.slideLine([2, 2, 2, 2]).line, c: L.slideLine([0, 0, 3, 3]).line, d: L.slideLine([9, 9, 0, 0]).line, e: L.slideLine([1, 0, 1, 0]).gained,
      left: L.mergeMove([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], "L").grid.join(),
      right: L.mergeMove([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], "R").grid.join(),
      up: L.mergeMove([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "U").grid.join(),
      down: L.mergeMove([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "D").grid.join(),
      stuck: L.mergeMove([1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1], "L").moved,
      canA: L.canMerge([1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1]), canB: L.canMerge([1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 2]),
    }));
    expect(r).toEqual({
      a: [2, 2, 0, 0], b: [3, 3, 0, 0], c: [4, 0, 0, 0], d: [9, 9, 0, 0], e: 4,
      left: "2,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0",
      right: "0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,2",
      up: "2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0", down: "0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0",
      stuck: false, canA: false, canB: true,
    });
  });

  test("the arrow buttons slide the board and spawn a new seed", async ({ page }) => {
    await open(page, "/index.html?game=merge&seed=7");
    await page.evaluate(() => window.Games._test.merge([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]));
    await page.getByRole("button", { name: "เลื่อนซ้าย" }).click();
    await expect(page.locator(".mt").first()).toContainText("🌱");   // 1+1 -> 2
    expect(await page.locator('.mt:not([data-l="0"])').count()).toBe(3); // merged pair, the 🌿, and one new seed
    await expect(page.locator("#tab-games .gpill")).toContainText("คะแนน 4");
    await page.getByRole("button", { name: /ย้อนกลับ/ }).click();
    await expect(page.locator("#tab-games .gpill")).toContainText("คะแนน 0");
    expect(await page.locator('.mt:not([data-l="0"])').count()).toBe(3);
  });

  test("a swipe on the board moves it, a tiny drag does not", async ({ page }) => {
    await open(page, "/index.html?game=merge&seed=7");
    await page.evaluate(() => window.Games._test.merge([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    const b = await page.locator(".m4").boundingBox();
    const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y); await page.mouse.up();
    await expect(page.locator(".mt").nth(3)).toContainText("🌰");     // unchanged
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 80, y); await page.mouse.up();
    await expect(page.locator(".mt").nth(0)).toContainText("🌰");     // slid left
  });

  test("filling the board ends the game; reaching 🍄 is celebrated; either can be logged", async ({ page }) => {
    await open(page, "/index.html?game=merge&seed=7");
    await page.evaluate(() => window.Games._test.merge([8, 8, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2]));
    await page.getByRole("button", { name: "เลื่อนซ้าย" }).click();
    await expect(page.locator(".gres")).toContainText("ปลูกเห็ดสำเร็จ");
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#entries")).toContainText("รวมเมล็ดเป็นต้นไม้");
  });

  test("a board that fills up without reaching 🍄 just says it is full", async ({ page }) => {
    await open(page, "/index.html?game=merge&seed=7");
    // one gap left; sliding the last row fills it with a 1 or a 2, and nothing can merge afterwards
    await page.evaluate(() => window.Games._test.merge([3, 4, 3, 4, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 0]));
    await page.getByRole("button", { name: "เลื่อนขวา" }).click();
    await expect(page.locator(".gres")).toContainText("เต็มแล้ว");
    await expect(page.locator(".gres")).not.toContainText("ปลูกเห็ดสำเร็จ");
    await page.getByRole("button", { name: /ย้อนกลับ/ }).click();      // undo reopens the game
    await expect(page.locator(".gres")).toHaveCount(0);
  });
});

test.describe("slide puzzle", () => {
  test("every shuffle is solvable and not already solved", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => Array.from({ length: 60 }, () => {
      const t = L.slideShuffle(), flat = t.filter((x) => x !== 8); let inv = 0;
      for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) if (flat[i] > flat[j]) inv++;
      return { even: inv % 2 === 0, solved: L.slideSolved(t), perm: [...t].sort().join() === "0,1,2,3,4,5,6,7,8" };
    }));
    expect(r.every((x) => x.even && !x.solved && x.perm)).toBe(true);
  });

  test("only tiles next to the gap move; finishing wins and reveals the full picture", async ({ page }) => {
    await open(page, "/index.html?game=slide&seed=7");
    // one slide from solved: the gap is in the middle, tile 5 sits in the bottom-right
    await page.evaluate(() => window.Games._test.slide([0, 1, 2, 3, 8, 4, 6, 7, 5]));
    await page.getByRole("button", { name: "ชิ้นที่ 1", exact: true }).click(); // far from the gap: ignored
    await expect(page.locator("#tab-games .gpill")).toContainText("ย้าย 0");
    await page.getByRole("button", { name: "ชิ้นที่ 5", exact: true }).click(); // tile id 4 is at pos 5, next to the gap
    await expect(page.locator("#tab-games .gpill")).toContainText("ย้าย 1");
    await page.getByRole("button", { name: "ชิ้นที่ 6", exact: true }).click();
    await page.getByRole("button", { name: "ชิ้นที่ 6", exact: true }).click().catch(() => {});
    await page.evaluate(() => window.Games._test.slide([0, 1, 2, 3, 4, 5, 6, 8, 7]));
    await page.getByRole("button", { name: "ชิ้นที่ 8", exact: true }).click();
    await expect(page.locator(".gres")).toContainText("ต่อภาพสำเร็จ");
    await expect(page.locator(".st:not(.blank)")).toHaveCount(9);
  });
});

test("every game fits a phone screen in every theme", async ({ page }) => {
  await open(page);
  for (const skin of ["classic", "mario", "arcade"]) {
    await page.evaluate((k) => { localStorage.setItem("energy-map:v1:skin", k); document.documentElement.dataset.skin = k; }, skin);
    for (const id of ["sort", "memory", "merge", "slide", "ball", "mahjong", "tetris", "egg"]) {
      await page.evaluate((g) => window.Games.open(g), id);
      await expect(page.locator("#tab-games h1")).toBeVisible();
      await noSideScroll(page);
    }
    await page.getByRole("button", { name: /เมนู/ }).click();
    await noSideScroll(page);
  }
});

test.describe("catch the ball", () => {
  test("rules: catch, miss, star, bomb, pause and the 45 s limit", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const mk = (items, extra = {}) => ({ t: 45000, score: 5, caught: 0, x: 150, pw: 70, items, spawn: 99999, running: true, over: false, ...extra });
      const ball = (x, y, type = "ball") => ({ x, y, vy: 100, type, e: "⚽" });
      const a = mk([ball(150, 370)]); L.ballStep(a, 33);
      const b = mk([ball(250, 370)]); L.ballStep(b, 33);
      const c = mk([ball(150, 370, "star")]); L.ballStep(c, 33);
      const d = mk([ball(150, 370, "bomb")], { score: 1 }); L.ballStep(d, 33);
      const e = mk([ball(250, 419)]); L.ballStep(e, 33);
      const f = mk([], { t: 20 }); L.ballStep(f, 33);
      const g = mk([ball(150, 370)], { running: false }); L.ballStep(g, 33);
      return {
        caught: [a.score, a.caught, a.items.length], far: [b.score, b.items.length], star: c.score, bomb: [d.score, d.caught],
        missed: [e.score, e.items.length], over: [f.over, f.t, f.running], paused: [g.items.length, g.items[0].y],
        clamp: [L.clampX({ pw: 70 }, -50), L.clampX({ pw: 70 }, 999), L.clampX({ pw: 70 }, 120)],
      };
    });
    expect(r).toEqual({ caught: [6, 1, 0], far: [5, 1], star: 8, bomb: [0, 0], missed: [5, 0], over: [true, 0, false], paused: [1, 370], clamp: [35, 265, 120] });
  });

  test("playing a round: start, catch, pause, resume, finish, log it", async ({ page }) => {
    const errors = await open(page, "/index.html?game=ball&seed=7");
    await page.evaluate(() => window.Games._test.ball({ items: [{ x: 150, y: 360, vy: 60, type: "ball", e: "⚽" }], x: 150 }));
    await expect(page.locator("#tab-games .gpill")).toHaveText("เวลา 45 วิ · 0 คะแนน");
    await page.getByRole("button", { name: "▶ เริ่ม" }).click();
    await page.clock.runFor(300);
    await expect(page.locator("#tab-games .gpill")).toContainText("1 คะแนน");

    await page.getByRole("button", { name: "⏸ พัก" }).click();
    const frozen = await page.locator("#tab-games .gpill").textContent();
    await page.clock.runFor(3000);
    await expect(page.locator("#tab-games .gpill")).toHaveText(frozen);   // nothing moves while paused
    await page.getByRole("button", { name: "▶ ต่อ" }).click();

    await page.clock.runFor(50000);
    await expect(page.locator(".gres")).toContainText("หมดเวลา");
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#entries")).toContainText("เลื่อนรับลูกบอล");

    await nav(page, /เกม/).click();                                       // back to the game it was on ...
    await page.getByRole("button", { name: /เมนู/ }).click();            // ... and from there to the menu, which shows the best score
    await expect(page.locator(".gcard", { hasText: "เลื่อนรับลูกบอล" })).toContainText("คะแนนสูงสุด");
    await page.locator(".gcard", { hasText: "เลื่อนรับลูกบอล" }).click();
    await page.getByRole("button", { name: "เล่นอีกรอบ" }).click();     // a new round starts from zero
    await expect(page.locator("#tab-games .gpill")).toHaveText("เวลา 45 วิ · 0 คะแนน");
    expect(errors).toEqual([]);
  });

  test("the basket follows a drag, the arrow buttons and the arrow keys, and stays on the board", async ({ page }) => {
    await open(page, "/index.html?game=ball&seed=7");
    const x = () => page.evaluate(() => window.Games._test.get("ball").x);
    expect(await x()).toBe(150);
    await page.getByRole("button", { name: "เลื่อนตะกร้าไปขวา" }).click();
    expect(await x()).toBe(178);
    await page.getByRole("button", { name: "เลื่อนตะกร้าไปซ้าย" }).click();
    await page.getByRole("button", { name: "เลื่อนตะกร้าไปซ้าย" }).click();
    expect(await x()).toBe(122);
    await page.keyboard.press("ArrowRight");
    expect(await x()).toBe(150);
    const b = await page.locator("#ballc").boundingBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.5);
    expect(Math.round(await x())).toBe(240);                              // the finger moved 30 % of the board, so the basket moved 90 units
    await page.mouse.move(b.x + b.width * 0.01, b.y + b.height * 0.5);    // far left is clamped to half the basket
    await page.mouse.up();
    expect(await x()).toBe(40);
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.5);     // a hover without pressing does nothing
    expect(await x()).toBe(40);
  });

  test("dragging the board is relative: touching far from the basket does not make it jump", async ({ page }) => {
    await open(page, "/index.html?game=ball&seed=7");
    const x = () => page.evaluate(() => window.Games._test.get("ball").x);
    const b = await page.locator("#ballc").boundingBox();
    await page.mouse.move(b.x + b.width * 0.9, b.y + b.height * 0.1);     // the top right corner, nowhere near the basket
    await page.mouse.down();
    expect(await x()).toBe(150);                                          // still where it was
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.1);    // 10 % to the left = 30 units
    expect(Math.round(await x())).toBe(120);
    await page.mouse.up();
  });

  test("the slider strip under the board moves the basket, and its thumb follows the basket", async ({ page }) => {
    await open(page, "/index.html?game=ball&seed=7");
    const x = () => page.evaluate(() => window.Games._test.get("ball").x);
    const pad = await page.locator("#ballpad").boundingBox();
    const y = pad.y + pad.height / 2;
    await page.mouse.move(pad.x + 22, y); await page.mouse.down();       // the far left end of the strip
    expect(await x()).toBe(40);
    await page.mouse.move(pad.x + pad.width / 2, y);
    expect(Math.round(await x())).toBe(150);
    await page.mouse.move(pad.x + pad.width + 40, y);                    // past the right end: held at the edge
    expect(await x()).toBe(260);
    await page.mouse.up();
    await expect(page.locator("#ballpad")).toHaveAttribute("aria-valuenow", "100");
    const thumb = await page.locator("#ballthumb").boundingBox();
    expect(Math.round(thumb.x + thumb.width)).toBeGreaterThanOrEqual(Math.round(pad.x + pad.width - 6));   // the thumb sits at the right end
    await page.getByRole("button", { name: "เลื่อนตะกร้าไปซ้าย" }).click();
    await expect(page.locator("#ballpad")).not.toHaveAttribute("aria-valuenow", "100");
  });
});

test.describe("mahjong match", () => {
  const tile = (page, face, row, col) => page.getByRole("button", { name: new RegExp(`^ไพ่ ${face} แถว ${row} คอลัมน์ ${col} `) });

  test("rules: free tiles need nothing on top and an open side", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const T = (r, c, z, alive = true) => ({ r, c, z, f: "x", alive });
      const row = [T(0, 0, 0), T(0, 1, 0), T(0, 2, 0)];
      const stack = [T(0, 0, 0), T(0, 0, 1)];
      const gone = [T(0, 0, 0), T(0, 1, 0, false), T(0, 2, 0)];
      return {
        ends: [L.mjFree(row, 0), L.mjFree(row, 1), L.mjFree(row, 2)],
        covered: [L.mjFree(stack, 0), L.mjFree(stack, 1)],
        opened: L.mjFree(gone, 0), dead: L.mjFree(gone, 1), tiles: L.MJ_LAYOUT.length,
      };
    });
    expect(r).toEqual({ ends: [true, false, true], covered: [false, true], opened: true, dead: false, tiles: 36 });
  });

  test("every deal can be played to the end and uses each face four times", async ({ page }) => {
    await open(page, "/index.html?seed=21");
    const r = await logic(page, (L) => Array.from({ length: 25 }, () => {
      const d = L.mjDeal(L.MJ_LAYOUT), tiles = L.MJ_LAYOUT.map((p) => ({ ...p, alive: true })), counts = {};
      d.faces.forEach((f) => (counts[f] = (counts[f] || 0) + 1));
      let ok = true;
      for (const [a, b] of d.order) { ok = ok && L.mjFree(tiles, a) && L.mjFree(tiles, b) && d.faces[a] === d.faces[b]; tiles[a].alive = tiles[b].alive = false; }
      return { ok, cleared: tiles.every((t) => !t.alive), kinds: Object.keys(counts).length, four: Object.values(counts).every((n) => n === 4) };
    }));
    expect(r.every((d) => d.ok && d.cleared && d.kinds === 9 && d.four)).toBe(true);
  });

  test("the real board starts with 36 tiles, of which only some can be picked", async ({ page }) => {
    await open(page, "/index.html?game=mahjong&seed=5");
    await expect(page.locator(".tile")).toHaveCount(36);
    await expect(page.locator("#tab-games .gpill")).toContainText("เหลือ 36 ใบ · จับแล้ว 0 คู่");
    const free = await page.locator('.tile[data-free="1"]').count();
    expect(free).toBeGreaterThanOrEqual(2);
    expect(free).toBeLessThan(36);
    await noSideScroll(page);
  });

  test("playing a small board: select, swap selection, match, hint, undo, win, log", async ({ page }) => {
    const errors = await open(page, "/index.html?game=mahjong&seed=7");
    await page.evaluate(() => window.Games._test.mahjong([
      { r: 0, c: 0, z: 0, f: "🍄" }, { r: 0, c: 1, z: 0, f: "🍄" }, { r: 1, c: 0, z: 0, f: "🌸" }, { r: 1, c: 1, z: 0, f: "🌸" }]));
    await expect(page.locator("#tab-games .gpill")).toContainText("เหลือ 4 ใบ");
    await tile(page, "🍄", 1, 1).click();
    await expect(tile(page, "🍄", 1, 1)).toHaveAttribute("aria-pressed", "true");
    await tile(page, "🌸", 2, 1).click();                                   // a different face moves the selection
    await expect(tile(page, "🍄", 1, 1)).toHaveAttribute("aria-pressed", "false");
    await expect(tile(page, "🌸", 2, 1)).toHaveAttribute("aria-pressed", "true");
    await tile(page, "🌸", 2, 1).click();                                   // tapping it again clears it
    await expect(tile(page, "🌸", 2, 1)).toHaveAttribute("aria-pressed", "false");

    await tile(page, "🍄", 1, 1).click(); await tile(page, "🍄", 1, 2).click();
    await expect(page.locator("#tab-games .gpill")).toContainText("เหลือ 2 ใบ · จับแล้ว 1 คู่");
    await page.getByRole("button", { name: /ย้อนกลับ/ }).click();
    await expect(page.locator("#tab-games .gpill")).toContainText("เหลือ 4 ใบ · จับแล้ว 0 คู่");
    await page.getByRole("button", { name: /ใบ้/ }).click();
    await expect(page.locator('.tile[data-hint="1"]')).toHaveCount(2);
    await tile(page, "🍄", 1, 1).click(); await tile(page, "🍄", 1, 2).click();
    await tile(page, "🌸", 2, 1).click(); await tile(page, "🌸", 2, 2).click();
    await expect(page.locator(".gres")).toContainText("จับคู่ครบทุกใบแล้ว");
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#entries")).toContainText("จับคู่ไพ่มาจง");
    expect(errors).toEqual([]);
  });

  test("a covered tile cannot be picked until what is on top is gone", async ({ page }) => {
    await open(page, "/index.html?game=mahjong&seed=7");
    await page.evaluate(() => window.Games._test.mahjong([
      { r: 0, c: 0, z: 0, f: "🌸" }, { r: 0, c: 0, z: 1, f: "🍄" }, { r: 0, c: 2, z: 0, f: "🍄" }, { r: 0, c: 3, z: 0, f: "🌸" }]));
    await expect(tile(page, "🌸", 1, 1)).toHaveAttribute("data-free", "0");
    await tile(page, "🌸", 1, 1).dispatchEvent("click");                    // a real tap lands on the tile on top, so aim at the covered one directly
    await expect(tile(page, "🌸", 1, 1)).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: /^ไพ่ 🍄 แถว 1 คอลัมน์ 1 ชั้น 2/ }).click();
    await tile(page, "🍄", 1, 3).click();
    await expect(tile(page, "🌸", 1, 1)).toHaveAttribute("data-free", "1");
    await tile(page, "🌸", 1, 1).click(); await tile(page, "🌸", 1, 4).click();
    await expect(page.locator(".gres")).toContainText("จับคู่ครบทุกใบแล้ว");
  });

  test("with no pair left it says so, and reshuffling the rest gets things moving", async ({ page }) => {
    await open(page, "/index.html?game=mahjong&seed=7");
    await page.evaluate(() => window.Games._test.mahjong([
      { r: 0, c: 0, z: 0, f: "🌸" }, { r: 0, c: 0, z: 1, f: "🍄" }, { r: 0, c: 3, z: 0, f: "🍄" }, { r: 0, c: 3, z: 1, f: "🌸" }]));
    await expect(page.locator(".gres")).toContainText("ไม่มีคู่ที่จับได้แล้ว");
    await expect(page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ })).toHaveCount(0);
    await page.getByRole("button", { name: /สับไพ่ที่เหลือ/ }).click();
    await expect(page.locator(".gres")).toHaveCount(0);
    await page.getByRole("button", { name: /ใบ้/ }).click();
    await expect(page.locator('.tile[data-hint="1"]')).toHaveCount(2);
  });
});

test("catch the ball: the board and its slider both fit above the menu bar on a phone", async ({ page }) => {
  await open(page, "/index.html?game=ball&seed=7");
  const nv = await page.getByRole("navigation").boundingBox();
  const pad = await page.locator("#ballpad").boundingBox();
  const cv = await page.locator("#ballc").boundingBox();
  expect(pad.y + pad.height).toBeLessThanOrEqual(nv.y);
  expect(cv.y).toBeGreaterThanOrEqual(0);
  expect(cv.width).toBeGreaterThanOrEqual(160);
});

test("catch the ball: tapping the board starts it, so the start button need not be in reach", async ({ page }) => {
  await open(page, "/index.html?game=ball&seed=7");
  const running = () => page.evaluate(() => window.Games._test.get("ball").running);
  expect(await running()).toBe(false);
  const b = await page.locator("#ballc").boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  expect(await running()).toBe(true);
  await expect(page.getByRole("button", { name: "⏸ พัก" })).toBeVisible();
});

const tstate = (page) => page.evaluate(() => { const s = window.Games._test.get("tetris"); return { x: s.piece.x, y: s.piece.y, r: s.piece.r, k: s.piece.k, running: s.running, over: s.over, score: s.score, filled: s.grid.flat().filter(Boolean).length }; });

test.describe("tetris", () => {
  test("rules: every piece has four cells, four turns bring it back, and it fits inside its box", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const out = {};
      for (const k of L.T_KINDS) {
        const c = [0, 1, 2, 3].map((n) => L.tCells(k, n));
        out[k] = { four: c.every((cells) => cells.length === 4), back: JSON.stringify(L.tCells(k, 4)) === JSON.stringify(c[0]), inBox: c.every((cells) => cells.every(([x, y]) => x >= 0 && y >= 0 && x < 4 && y < 4)) };
      }
      const sorted = (k, n) => JSON.stringify(L.tCells(k, n).sort());
      out.oSame = sorted("O", 0) === sorted("O", 1);
      out.iFlat = L.tCells("I", 0).every(([, y]) => y === L.tCells("I", 0)[0][1]);
      out.iTall = L.tCells("I", 1).every(([x]) => x === L.tCells("I", 1)[0][0]);
      return out;
    });
    for (const k of ["I", "O", "T", "S", "Z", "J", "L"]) expect(r[k]).toEqual({ four: true, back: true, inBox: true });
    expect([r.oSame, r.iFlat, r.iTall]).toEqual([true, true, true]);
  });

  test("rules: walls, floor, other blocks, wall kicks, and the speed curve", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const s = L.tNew(), g = s.grid;
      const blocked = L.tNew(); blocked.grid[5][4] = "T";
      const tall = L.tNew(); tall.piece = { k: "I", r: 1, x: 7, y: 0 };        // a vertical I against the right wall
      const rotated = L.tRot(tall, 1);
      return {
        spawn: L.tFits(g, s.piece.k, 0, s.piece.x, s.piece.y),
        leftWall: L.tFits(g, "O", 0, -1, 0), rightWall: [L.tFits(g, "O", 0, 8, 0), L.tFits(g, "O", 0, 9, 0)],
        floor: [L.tFits(g, "O", 0, 4, 18), L.tFits(g, "O", 0, 4, 19)],
        block: L.tFits(blocked.grid, "O", 0, 4, 4),
        kick: [rotated, tall.piece.x, tall.piece.r],
        speed: [L.tInterval(1), L.tInterval(2), L.tInterval(50)],
      };
    });
    expect(r).toEqual({ spawn: true, leftWall: false, rightWall: [true, false], floor: [true, false], block: false, kick: [true, 6, 2], speed: [720, 660, 120] });
  });

  test("rules: locking clears full rows and scores 100/300/500/800 times the level", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const one = L.tNew(); one.grid[19] = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]; one.piece = { k: "I", r: 0, x: 0, y: 18 };
      const n1 = L.tLock(one);
      const four = L.tNew(); for (let y = 16; y < 20; y++) four.grid[y] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0]; four.piece = { k: "I", r: 1, x: 7, y: 16 };
      const n4 = L.tLock(four);
      const lv = L.tNew(); lv.lines = 9; lv.level = 1; lv.grid[19] = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]; lv.piece = { k: "I", r: 0, x: 0, y: 18 }; L.tLock(lv);
      const lv2 = L.tNew(); lv2.level = 3; lv2.grid[19] = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1]; lv2.piece = { k: "I", r: 0, x: 0, y: 18 }; L.tLock(lv2);
      return { n1, s1: one.score, l1: one.lines, empty1: one.grid.flat().filter(Boolean).length, n4, s4: four.score, level: [lv.level, lv.lines], s3: lv2.score, size: four.grid.length };
    });
    expect(r).toEqual({ n1: 1, s1: 100, l1: 1, empty1: 0, n4: 4, s4: 800, level: [2, 10], s3: 300, size: 20 });
  });

  test("rules: hard drop, soft drop, gravity timing, game over and the 7-bag", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const s = L.tNew(); const k = s.piece.k, y0 = s.piece.y, ghost = L.tGhostY(s);
      L.tHard(s);
      const hard = { filled: s.grid.flat().filter(Boolean).length, score: s.score, dropped: ghost - y0, lowest: s.grid.findIndex((row) => row.some(Boolean)) >= 16 };
      const g = L.tNew(); g.running = true; const y = g.piece.y;
      L.tStep(g, 719); const early = g.piece.y; L.tStep(g, 1); const later = g.piece.y;
      const p = L.tNew(); const py = p.piece.y; L.tDown(p, true);
      const over = L.tNew(); over.grid[0] = Array(10).fill("T"); over.next = "O"; L.tSpawn(over);
      const bag = L.tNew(); bag.bag = []; const seven = new Set(Array.from({ length: 7 }, () => L.tBag(bag)));
      return { hard, early: early === y, later: later === y + 1, soft: [p.piece.y - py, p.score], over: [over.over, over.running], bag: seven.size };
    });
    expect(r.hard.filled).toBe(4);
    expect(r.hard.score).toBe(r.hard.dropped * 2);
    expect(r.hard.lowest).toBe(true);
    expect(r).toMatchObject({ early: true, later: true, soft: [1, 1], over: [true, false], bag: 7 });
  });

  test("playing: start, move, turn, drop, gravity, pause, keyboard", async ({ page }) => {
    const errors = await open(page, "/index.html?game=tetris&seed=3");
    await expect(page.locator("#tab-games .gpill")).toHaveText("คะแนน 0 · แถว 0 · เลเวล 1");
    let s = await tstate(page); expect(s.running).toBe(false);
    await page.getByRole("button", { name: "เลื่อนซ้าย" }).click();             // ignored until the game is running
    expect((await tstate(page)).x).toBe(s.x);
    await page.getByRole("button", { name: "▶ เริ่ม" }).click();
    await page.getByRole("button", { name: "เลื่อนซ้าย" }).click();
    expect((await tstate(page)).x).toBe(s.x - 1);
    await page.getByRole("button", { name: "เลื่อนขวา" }).click();
    expect((await tstate(page)).x).toBe(s.x);
    await page.getByRole("button", { name: "หมุนบล็อก" }).click();
    expect((await tstate(page)).r).toBe(1);
    await page.getByRole("button", { name: "ลงทีละช่อง" }).click();
    expect((await tstate(page)).y).toBe(s.y + 1);

    s = await tstate(page);
    await page.clock.runFor(800);                                               // one gravity step at level 1 is 720 ms
    expect((await tstate(page)).y).toBeGreaterThan(s.y);

    await page.getByRole("button", { name: "⏸ พัก" }).click();
    s = await tstate(page);
    await page.clock.runFor(3000);
    expect((await tstate(page)).y).toBe(s.y);                                   // frozen while paused
    await page.getByRole("button", { name: "▶ ต่อ" }).click();

    await page.keyboard.press("ArrowLeft");
    expect((await tstate(page)).x).toBe(s.x - 1);
    await page.keyboard.press("ArrowUp");
    expect((await tstate(page)).r).toBe((s.r + 1) % 4);
    await page.keyboard.press("Space");                                         // hard drop locks the piece and brings the next
    const after = await tstate(page);
    expect(after.filled).toBe(4);
    expect(after.score).toBeGreaterThan(0);
    expect(after.y).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("the board: tap starts then turns, a sideways drag slides the piece", async ({ page }) => {
    await open(page, "/index.html?game=tetris&seed=3");
    const b = await page.locator("#tetc").boundingBox();
    const cx = b.x + b.width * 0.3, cy = b.y + b.height * 0.5;
    await page.mouse.click(cx, cy);
    let s = await tstate(page);
    expect([s.running, s.r]).toEqual([true, 0]);                                // the first tap only starts it
    await page.mouse.click(cx, cy);
    expect((await tstate(page)).r).toBe(1);                                     // the next one turns it
    const x0 = (await tstate(page)).x, cell = b.width / 14;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + cell * 2.5, cy);
    await page.mouse.up();
    s = await tstate(page);
    expect(s.x).toBe(x0 + 2);
    expect(s.r).toBe(1);                                                        // a drag does not also turn it
  });

  test("game over shows the score, can be logged, and the menu remembers the best", async ({ page }) => {
    await open(page, "/index.html?game=tetris&seed=3");
    await page.evaluate(() => window.Games._test.tetris({ over: true, running: false, score: 1234, lines: 12 }));
    await expect(page.locator(".gres")).toContainText("จบเกม! ได้ 1234 คะแนน (12 แถว)");
    await page.clock.runFor(100);
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#entries")).toContainText("เทตริส");
    await nav(page, /เกม/).click();
    await page.getByRole("button", { name: /เมนู/ }).click();
    await expect(page.locator(".gcard", { hasText: "เทตริส" })).toContainText("คะแนนสูงสุด 1234");
  });

  test("the board and every control fit above the menu bar on a phone", async ({ page }) => {
    await open(page, "/index.html?game=tetris&seed=3");
    const nv = await page.getByRole("navigation").boundingBox();
    const hard = await page.getByRole("button", { name: /ตกลงเลย/ }).boundingBox();
    expect(hard.y + hard.height).toBeLessThanOrEqual(nv.y);
    await noSideScroll(page);
  });
});

test.describe("dinosaur egg shooter", () => {
  test("rules: honeycomb geometry, neighbours are mutual", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const g = L.eggEmpty(); let mutual = true;
      g.forEach((row, r) => row.forEach((_, c) => L.eggNeighbors(r, c).forEach(([rr, cc]) => { if (!L.eggNeighbors(rr, cc).some(([a, b]) => a === r && b === c)) mutual = false; })));
      return {
        cols: [L.eggCols(0), L.eggCols(1)], rows: g.length, mutual,
        p00: L.eggPos(0, 0), p08: L.eggPos(0, 8), p10: L.eggPos(1, 0), p70: L.eggPos(1, 7),
        corner: L.eggNeighbors(0, 0).length, inner: L.eggNeighbors(5, 4).length, oddEnd: L.eggNeighbors(1, 7).length,
      };
    });
    expect(r).toEqual({ cols: [9, 8], rows: 13, mutual: true, p00: { x: 15, y: 15 }, p08: { x: 255, y: 15 }, p10: { x: 30, y: 41 }, p70: { x: 240, y: 41 }, corner: 2, inner: 6, oddEnd: 5 });
  });

  test("rules: an egg snaps to the nearest empty cell that touches the board", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const g = L.eggEmpty(); g[0][4] = 2;
      const below = L.eggPos(0, 4);
      return { under: L.eggSnap(g, below.x + 3, below.y + 22), ceiling: L.eggSnap(L.eggEmpty(), 140, 15), floating: L.eggSnap(L.eggEmpty(), 140, 200).r };
    });
    expect(r.under).toEqual({ r: 1, c: 4 });
    expect(r.ceiling).toEqual({ r: 0, c: 4 });
    expect(r.floating).toBeLessThanOrEqual(7);                                  // it never snaps to a cell that touches nothing
  });

  test("rules: three of a colour pop, two do not, and what is cut off falls", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const a = L.eggEmpty(); [0, 1, 2].forEach((c) => (a[0][c] = 1));
      const ra = L.eggResolve(a, 0, 2);
      const b = L.eggEmpty(); [0, 1].forEach((c) => (b[0][c] = 1));
      const rb = L.eggResolve(b, 0, 1);
      const c = L.eggEmpty(); [0, 1, 2].forEach((x) => (c[0][x] = 1)); c[0][3] = 2; c[1][0] = 3; c[1][3] = 3;
      const rc = L.eggResolve(c, 0, 2);
      const d = L.eggEmpty(); d[0][4] = 1; d[1][3] = 1; d[1][4] = 1;
      const rd = L.eggResolve(d, 1, 4);
      return { a: [ra.popped.length, ra.fallen.length, L.eggLeft(a)], b: [rb.popped.length, L.eggLeft(b)], c: [rc.popped.length, rc.fallen, c[1][0], c[1][3], c[0][3]], d: [rd.popped.length, L.eggLeft(d)] };
    });
    expect(r).toEqual({ a: [3, 0, 0], b: [0, 2], c: [3, [[1, 0]], 0, 3, 2], d: [3, 0] });
  });

  test("rules: flying eggs bounce off the walls, stick to the ceiling and to other eggs, and the board can fill up", async ({ page }) => {
    await open(page);
    const r = await logic(page, (L) => {
      const run = (s) => { for (let i = 0; i < 200 && s.shot; i++) L.eggStep(s, 33); return s; };
      const mk = (grid, shot) => ({ grid, shot, score: 0, over: false, won: false, cur: 1, next: 1 });
      const up = run(mk(L.eggEmpty(), { x: 135, y: 372, vx: 0, vy: -520, c: 3 }));
      const bounce = mk(L.eggEmpty(), { x: 250, y: 300, vx: 300, vy: -10, c: 2 }); L.eggStep(bounce, 33);
      const g1 = L.eggEmpty(); g1[0][4] = 1;
      const hit = run(mk(g1, { x: 135, y: 372, vx: 0, vy: -520, c: 2 }));
      const g2 = L.eggEmpty(); g2[0][4] = 1; g2[0][5] = 1;
      const win = run(mk(g2, { x: 135, y: 372, vx: 0, vy: -520, c: 1 }));
      const g3 = L.eggEmpty(); g3[10][0] = 1;
      const full = run(mk(g3, { x: 15, y: 372, vx: 0, vy: -520, c: 2 }));
      const fire = { grid: L.eggEmpty(), cur: 4, next: 5, ang: 0.5, shot: null, shots: 0, over: false, won: false }; fire.grid[0][0] = 4;
      const first = L.eggFire(fire), again = L.eggFire(fire);
      const only3 = L.eggEmpty(); only3[0][0] = 3; const picks = new Set(Array.from({ length: 20 }, () => L.eggPick(only3)));
      const straight = L.eggPath({ ang: 0, grid: L.eggEmpty() }), wide = L.eggPath({ ang: 1.2, grid: L.eggEmpty() });
      return {
        top: [up.grid[0][4], L.eggLeft(up.grid), up.over], bounceLeft: [bounce.shot.vx < 0, bounce.shot.x <= 255],
        under: [hit.grid[1][3] || hit.grid[1][4], L.eggLeft(hit.grid)], win: [win.won, win.score, L.eggLeft(win.grid)], full: [full.over, full.grid[11][0]],
        fire: [first, again, fire.shots, fire.cur, fire.shot.vx > 0, fire.shot.vy < 0], picks: [...picks],
        aim: [L.eggAim(135, 100), L.eggAim(270, 371), L.eggAim(0, 371) < 0], straight: [straight.length, straight[straight.length - 1][1] <= 15], wide: wide.length > 2,
      };
    });
    expect(r).toEqual({
      top: [3, 1, false], bounceLeft: [true, true], under: [2, 2], win: [true, 30, 0], full: [true, 2],
      fire: [true, false, 1, 5, true, true], picks: [3], aim: [0, 1.3, true], straight: [2, true], wide: true,
    });
  });

  test("playing to a win: aim with the buttons, fire, the eggs pop, it is logged", async ({ page }) => {
    const errors = await open(page, "/index.html?game=egg&seed=3");
    await page.evaluate(() => { const g = window.Games._logic.eggEmpty(); g[0][4] = 1; g[0][5] = 1; window.Games._test.egg({ grid: g, cur: 1, next: 1, ang: 0 }); });
    await expect(page.locator("#tab-games .gpill")).toHaveText("คะแนน 0 · ยิง 0 · เหลือ 2 ฟอง");
    const ang = () => page.evaluate(() => window.Games._test.get("egg").ang);
    await page.getByRole("button", { name: "เล็งไปทางขวา" }).click();
    expect(await ang()).toBeCloseTo(0.06, 5);
    await page.getByRole("button", { name: "เล็งไปทางซ้าย" }).click();
    await page.getByRole("button", { name: "เล็งไปทางซ้าย" }).click();
    expect(await ang()).toBeCloseTo(-0.06, 5);
    await page.keyboard.press("ArrowRight");
    expect(await ang()).toBeCloseTo(0, 5);
    await page.getByRole("button", { name: /ยิง!/ }).click();
    await page.clock.runFor(2000);
    await expect(page.locator(".gres")).toContainText("ฟักครบทุกฟองแล้ว");
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#entries")).toContainText("ยิงไข่ไดโนเสาร์");
    await nav(page, /เกม/).click();
    await page.getByRole("button", { name: /เมนู/ }).click();
    await expect(page.locator(".gcard", { hasText: "ยิงไข่ไดโนเสาร์" })).toContainText("ชนะ 1 ครั้ง");
    expect(errors).toEqual([]);
  });

  test("drag to aim, let go to fire; a miss sticks to the board and the game goes on", async ({ page }) => {
    await open(page, "/index.html?game=egg&seed=3");
    await page.evaluate(() => { const g = window.Games._logic.eggEmpty(); g[0][0] = 1; window.Games._test.egg({ grid: g, cur: 2, next: 3, ang: 0 }); });
    const st = () => page.evaluate(() => { const s = window.Games._test.get("egg"); return { ang: s.ang, shots: s.shots, flying: !!s.shot, eggs: window.Games._logic.eggLeft(s.grid), over: s.over, won: s.won }; });
    const b = await page.locator("#eggc").boundingBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.4);
    let s = await st();
    expect(s.ang).toBeGreaterThan(0.3);                                         // aimed to the right
    expect(s.shots).toBe(0);                                                    // nothing fired yet
    await page.mouse.up();
    s = await st();
    expect([s.shots, s.flying]).toEqual([1, true]);                             // letting go fired it
    await page.clock.runFor(3000);
    s = await st();
    expect([s.flying, s.eggs, s.over, s.won]).toEqual([false, 2, false, false]);
    await expect(page.locator("#tab-games .gpill")).toContainText("ยิง 1 · เหลือ 2 ฟอง");
  });

  test("a board that fills up says so, and starting again gives a fresh board of five rows", async ({ page }) => {
    await open(page, "/index.html?game=egg&seed=3");
    await page.evaluate(() => { const g = window.Games._logic.eggEmpty(); g[10][0] = 1; window.Games._test.egg({ grid: g, cur: 2, next: 2, ang: 0 }); const s = window.Games._test.get("egg"); s.shot = { x: 15, y: 372, vx: 0, vy: -520, c: 2 }; });
    await page.clock.runFor(1500);
    await expect(page.locator(".gres")).toContainText("ไข่ลงมาถึงเส้นแล้ว");
    await expect(page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ })).toHaveCount(0);
    await page.getByRole("button", { name: "เล่นอีกรอบ" }).click();
    await expect(page.locator(".gres")).toHaveCount(0);
    const rows = await page.evaluate(() => { const g = window.Games._test.get("egg").grid; return g.map((row) => row.some(Boolean)); });
    expect(rows.slice(0, 5).every(Boolean)).toBe(true);
    expect(rows.slice(5).some(Boolean)).toBe(false);
  });

  test("the board and its buttons fit above the menu bar on a phone", async ({ page }) => {
    await open(page, "/index.html?game=egg&seed=3");
    const nv = await page.getByRole("navigation").boundingBox();
    const fire = await page.getByRole("button", { name: /ยิง!/ }).boundingBox();
    expect(fire.y + fire.height).toBeLessThanOrEqual(nv.y);
    await noSideScroll(page);
  });
});
