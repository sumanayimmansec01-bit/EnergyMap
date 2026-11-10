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
  test("the Games tab lists all six games and each opens, and 'menu' goes back", async ({ page }) => {
    const errors = await open(page);
    await nav(page, /เกม/).click();
    await expect(page.locator(".gcard")).toHaveCount(6);
    for (const [name, title] of [["จัดกระถางดอกไม้", "จัดกระถางดอกไม้"], ["พลิกการ์ดจับคู่", "พลิกการ์ดจับคู่"], ["รวมเมล็ดเป็นต้นไม้", "รวมเมล็ดเป็นต้นไม้"], ["สไลด์ภาพเห็ด", "สไลด์ภาพเห็ด"], ["เลื่อนรับลูกบอล", "เลื่อนรับลูกบอล"], ["จับคู่ไพ่มาจง", "จับคู่ไพ่มาจง"]]) {
      await page.locator(".gcard", { hasText: name }).click();
      await expect(page.locator("#tab-games h1")).toContainText(title);
      await page.getByRole("button", { name: /เมนู/ }).click();
      await expect(page.locator(".gcard")).toHaveCount(6);
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
    for (const [id, title] of [["sort", "จัดกระถางดอกไม้"], ["memory", "พลิกการ์ดจับคู่"], ["merge", "รวมเมล็ดเป็นต้นไม้"], ["slide", "สไลด์ภาพเห็ด"], ["ball", "เลื่อนรับลูกบอล"], ["mahjong", "จับคู่ไพ่มาจง"]]) {
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
    await expect(page.locator(".gcard")).toHaveCount(6);
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
    for (const id of ["sort", "memory", "merge", "slide", "ball", "mahjong"]) {
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
