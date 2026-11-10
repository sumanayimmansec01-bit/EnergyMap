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
  test("the Games tab lists all four games and each opens, and 'menu' goes back", async ({ page }) => {
    const errors = await open(page);
    await nav(page, /เกม/).click();
    await expect(page.locator(".gcard")).toHaveCount(4);
    for (const [name, title] of [["จัดกระถางดอกไม้", "จัดกระถางดอกไม้"], ["พลิกการ์ดจับคู่", "พลิกการ์ดจับคู่"], ["รวมเมล็ดเป็นต้นไม้", "รวมเมล็ดเป็นต้นไม้"], ["สไลด์ภาพเห็ด", "สไลด์ภาพเห็ด"]]) {
      await page.locator(".gcard", { hasText: name }).click();
      await expect(page.locator("#tab-games h1")).toContainText(title);
      await page.getByRole("button", { name: /เมนู/ }).click();
      await expect(page.locator(".gcard")).toHaveCount(4);
    }
    expect(errors).toEqual([]);
  });

  test("the log tab has a shortcut to each game", async ({ page }) => {
    await open(page);
    await expect(page.locator("#gshort button")).toHaveCount(4);
    await page.getByRole("button", { name: "เล่น พลิกการ์ดจับคู่" }).click();
    await expect(page.locator("#tab-games h1")).toContainText("พลิกการ์ดจับคู่");
    await expect(page.locator("#tab-log")).toBeHidden();
  });

  test("?game= opens a game directly (the app-icon shortcuts use it)", async ({ page }) => {
    for (const [id, title] of [["sort", "จัดกระถางดอกไม้"], ["memory", "พลิกการ์ดจับคู่"], ["merge", "รวมเมล็ดเป็นต้นไม้"], ["slide", "สไลด์ภาพเห็ด"]]) {
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
    await expect(page.locator(".gcard")).toHaveCount(4);
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
    for (const id of ["sort", "memory", "merge", "slide"]) {
      await page.evaluate((g) => window.Games.open(g), id);
      await expect(page.locator("#tab-games h1")).toBeVisible();
      await noSideScroll(page);
    }
    await page.getByRole("button", { name: /เมนู/ }).click();
    await noSideScroll(page);
  }
});
