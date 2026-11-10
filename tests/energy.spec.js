// @ts-check
const { test, expect } = require("@playwright/test");

const KEY = "energy-map:v1";
const NOW = new Date("2026-10-18T09:00:00+07:00"); // a Sunday

// Seed a few days of history on the first load only, so reload tests see what the app saved.
async function open(page, entries, meta) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(({ KEY, entries, meta }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    if (meta) localStorage.setItem(KEY + ":meta", JSON.stringify(meta));
    if (entries) {
      const acts = [{ id: "x", emoji: "🚶", name: "เดิน", fx: 2 }];
      localStorage.setItem(KEY, JSON.stringify({ entries, acts }));
    }
  }, { KEY, entries, meta });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/index.html");
  return errors;
}
const at = (iso, name, emoji, fx, min = 30) => ({ id: name + iso, ts: new Date(iso).getTime(), name, emoji, fx, min, note: "" });

test("logging a booster and a drainer updates today's total", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: /เดิน\/ออกกำลังกาย/ }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("#entries")).toContainText("เดิน/ออกกำลังกาย");
  await expect(page.locator("#today .big")).toHaveText("+2");

  await page.getByRole("button", { name: /ประชุมยาว/ }).click();
  await page.locator("#score").fill("-4"); // the user sets the score by hand
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("#today .big")).toHaveText("−2");
  expect(errors).toEqual([]);
});

test("the user can override the effect of a preset for one entry", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /ประชุมยาว/ }).click();
  await page.locator("#score").fill("1");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("#today .big")).toHaveText("+1");
});

test("entries persist across reload and can be deleted", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /ฟังเพลง/ }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await page.reload();
  await expect(page.locator("#entries")).toContainText("ฟังเพลง");
  await page.getByRole("button", { name: "ลบ ฟังเพลง" }).click();
  await expect(page.locator("#entries")).toContainText("ยังไม่มี");
  await page.reload();
  await expect(page.locator("#entries")).toContainText("ยังไม่มี");
});

test("insights: day, week and month views total the right entries", async ({ page }) => {
  const errors = await open(page, [
    at("2026-10-18T07:00:00+07:00", "เดิน", "🚶", 2),            // today  +2
    at("2026-10-18T08:00:00+07:00", "ประชุมยาว", "📅", -2, 60),  // today  -4
    at("2026-10-14T10:00:00+07:00", "เดิน", "🚶", 2),            // this week (Wed) +2
    at("2026-10-02T10:00:00+07:00", "นอนดึก", "🌙", -2),          // this month, earlier week -2
    at("2026-09-20T10:00:00+07:00", "เดิน", "🚶", 2),            // last month
  ]);
  await page.getByRole("navigation").getByRole("button", { name: /สรุป/ }).click();

  const net = page.locator("#stats > div").nth(2).locator("b");
  await expect(net).toHaveText("−2");                              // day: +2 -4
  await expect(page.locator("#drainers")).toContainText("ประชุมยาว");
  await expect(page.locator("#boosters")).toContainText("เดิน");

  await page.getByRole("button", { name: "รายสัปดาห์" }).click();
  await expect(net).toHaveText("0");                              // +2 -4 +2, Mon 12 – Sun 18

  await page.getByRole("button", { name: "รายเดือน" }).click();
  await expect(net).toHaveText("−2");                              // +2 -4 +2 -2
  await expect(page.locator("#tips li").first()).toBeVisible();

  await page.getByRole("button", { name: "ช่วงก่อนหน้า" }).click(); // September
  await expect(net).toHaveText("+2");
  await expect(page.locator("#next")).toBeEnabled();
  await page.getByRole("button", { name: "ช่วงถัดไป" }).click();
  await expect(page.locator("#next")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("empty insights invite the first entry instead of showing numbers", async ({ page }) => {
  await open(page);
  await page.getByRole("navigation").getByRole("button", { name: /สรุป/ }).click();
  await expect(page.locator("#tips")).toContainText("ยังไม่มีข้อมูล");
});

test("a custom activity can be added, used and removed", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /กิจกรรมใหม่/ }).click();
  await page.locator("#act-name").fill("เล่นกับแมว");
  await page.locator("#act-emoji").fill("🐱");
  await page.locator("#act-fx").getByRole("button", { name: /เติมพลังมาก/ }).click();
  await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await page.getByRole("button", { name: /เล่นกับแมว/ }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("#today .big")).toHaveText("+2");

  await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
  await page.getByRole("button", { name: "ลบกิจกรรม เล่นกับแมว" }).click();
  await expect(page.locator("#actlist")).not.toContainText("เล่นกับแมว");
});

test("no horizontal scroll on a phone", async ({ page }) => {
  await open(page);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});

const DAY = 864e5, ago = (d) => NOW.getTime() - d * DAY;
const one = [at("2026-10-18T07:00:00+07:00", "เดิน", "🚶", 2)];

test("backup reminder: appears after 7 days without a backup, counted from first use", async ({ page }) => {
  await open(page, one, { first: ago(8) });
  await expect(page.locator("#backup-banner")).toBeVisible();
  await expect(page.locator("#backup-text")).toContainText("8 วัน");
  await expect(page.locator("#backup-text")).toContainText("ยังไม่เคยสำรอง");
});

test("backup reminder: stays hidden when new, recently backed up, or there is no data", async ({ page }) => {
  await open(page, one, { first: ago(3) });
  await expect(page.locator("#backup-banner")).toBeHidden();
  await page.goto("about:blank");
  const p2 = await page.context().newPage();
  await p2.clock.install({ time: NOW });
  await p2.addInitScript(({ KEY, m }) => { localStorage.setItem(KEY + ":meta", JSON.stringify(m)); }, { KEY, m: { first: ago(30), backup: ago(2) } });
  await p2.goto("/index.html");
  await expect(p2.locator("#backup-banner")).toBeHidden();
  const p3 = await page.context().newPage();
  await p3.clock.install({ time: NOW });
  await p3.addInitScript(({ KEY, m }) => {
    localStorage.setItem(KEY, JSON.stringify({ entries: [], acts: [] })); // the shared context still holds the earlier page's data
    localStorage.setItem(KEY + ":meta", JSON.stringify(m));
  }, { KEY, m: { first: ago(30) } });
  await p3.goto("/index.html");
  await expect(p3.locator("#backup-banner")).toBeHidden(); // nothing to lose yet
});

test("backup reminder: 'later' snoozes it and survives a reload", async ({ page }) => {
  await open(page, one, { first: ago(8) });
  await page.getByRole("button", { name: "ไว้ทีหลัง" }).click();
  await expect(page.locator("#backup-banner")).toBeHidden();
  await page.reload();
  await expect(page.locator("#backup-banner")).toBeHidden();
});

test("backup reminder: backing up downloads the file and clears the reminder", async ({ page }) => {
  await open(page, one, { first: ago(8) });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /สำรองตอนนี้/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^energy-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator("#backup-banner")).toBeHidden();
  await page.reload();
  await expect(page.locator("#backup-banner")).toBeHidden();
  await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
  await expect(page.locator("#lastbk")).toContainText("สำรองล่าสุด");
});

test("persistent storage is requested and its status is shown", async ({ page }) => {
  await page.addInitScript(() => {
    window.__persistAsked = 0;
    StorageManager.prototype.persisted = async () => false;
    StorageManager.prototype.persist = async () => { window.__persistAsked++; return true; };
  });
  await open(page);
  await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
  await expect(page.locator("#persist")).toContainText("รับปากเก็บข้อมูลไว้ถาวร");
  expect(await page.evaluate(() => window.__persistAsked)).toBe(1);
});

test("score: set by hand from -5 to +5, nudged with the buttons, and never scaled by duration", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /ประชุมยาว/ }).click();
  await expect(page.locator("#score-val")).toHaveText("−2");        // starts at the activity's usual effect
  await page.getByRole("button", { name: "เพิ่มคะแนน" }).click();
  await expect(page.locator("#score-val")).toHaveText("−1");
  await page.locator("#score").fill("5");
  await page.getByRole("button", { name: "เพิ่มคะแนน" }).click();   // capped at +5
  await expect(page.locator("#score-val")).toHaveText("+5");
  await expect(page.locator("#score-hint")).toContainText("เติมพลัง");
  await page.locator("#score").fill("-3");
  await page.getByRole("button", { name: /^2 ชม\./ }).click();      // 2 hours must not multiply the score
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator("#today .big")).toHaveText("−3");
  await expect(page.locator("#entries")).toContainText("120 นาที");
});

test("score: the same activity can be rushed (negative) or relaxed (positive), and 0 is allowed", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /กิจกรรมใหม่/ }).click();
  await page.locator("#act-name").fill("อาบน้ำ");
  await page.locator("#act-emoji").fill("🚿");
  await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  for (const [score, note] of [["-3", "รีบมาก"], ["4", "ไม่มีเวลากดดัน"], ["0", "เฉย ๆ"]]) {
    await page.getByRole("button", { name: /อาบน้ำ/ }).first().click();
    await page.locator("#score").fill(score);
    await page.locator("#note").fill(note);
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  }
  await expect(page.locator("#entries .chip.d")).toHaveText("−3");
  await expect(page.locator("#entries .chip.b")).toHaveText("+4");
  await expect(page.locator("#entries .chip.n")).toHaveText("0");
  await expect(page.locator("#today .big")).toHaveText("+1");
  await page.reload();                                              // persisted with their scores
  await expect(page.locator("#entries")).toContainText("ไม่มีเวลากดดัน");
  await expect(page.locator("#today .big")).toHaveText("+1");
});

test("themes: Mario is the default, and the choice persists, recolours the browser bar and swaps the logo", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-skin", "mario");
  await expect(page.locator("#logo img")).toHaveAttribute("src", "icon.svg");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#e52521");

  await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
  await page.getByRole("button", { name: /อาร์เคด/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "arcade");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0a23");
  await expect(page.getByRole("button", { name: /อาร์เคด/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /คลาสสิก/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classic");
  await page.reload();                                              // survives a reload, with no flash of the default
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classic");
  await expect(page.locator("#logo")).toHaveText("⚡");
  expect(errors).toEqual([]);
});

test("themes: an unknown saved theme falls back to Mario, and every theme keeps the app usable", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("energy-map:v1:skin", "bogus"));
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-skin", "mario");
  for (const name of ["คลาสสิก", "มาริโอ", "อาร์เคด"]) {
    await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("navigation").getByRole("button", { name: /บันทึก/ }).click();
    await page.locator("#grid [data-act]", { hasText: "ฟังเพลง" }).click();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator("#entries")).toContainText("ฟังเพลง");
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(w[0]).toBeLessThanOrEqual(w[1]);
  }
});

test("garden: shown with the Mario theme only, never blocks taps or causes sideways scroll", async ({ page }) => {
  await open(page);
  await expect(page.locator("#garden")).toBeVisible();
  await expect(page.locator("#today")).toHaveCSS("position", "relative");
  expect(await page.evaluate(() => getComputedStyle(document.getElementById("garden")).pointerEvents)).toBe("none");
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
  await page.getByRole("navigation").getByRole("button", { name: /จัดการ/ }).click();
  await page.getByRole("button", { name: /คลาสสิก/ }).click();
  await expect(page.locator("#garden")).toBeHidden();
  await page.getByRole("button", { name: /มาริโอ/ }).click();
  await expect(page.locator("#garden")).toBeVisible();
});

test("zero totals read as plain 0, not +0 or −0", async ({ page }) => {
  await open(page);
  await expect(page.locator("#today")).not.toContainText("−0");
  await expect(page.locator("#today")).not.toContainText("+0");
  await expect(page.locator("#today")).toContainText("เติม 0");
  await expect(page.locator("#today")).toContainText("เสีย 0");
  await page.getByRole("navigation").getByRole("button", { name: /สรุป/ }).click();
  await expect(page.locator("#stats")).not.toContainText("−0");
  await expect(page.locator("#stats")).not.toContainText("+0");
});
