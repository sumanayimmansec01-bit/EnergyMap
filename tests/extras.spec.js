// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");

const KEY = "energy-map:v1";
const NOW = new Date("2026-10-18T14:00:00+07:00");        // a Sunday afternoon
const at = (iso, name, emoji, fx) => ({ id: name + iso, ts: new Date(iso).getTime(), name, emoji, fx, exact: true, min: 0, note: "" });

async function open(page, entries, { share } = {}) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(({ KEY, entries, share }) => {
    if (share === "yes") { navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { n: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text }; }; }
    if (share === "no") { navigator.canShare = undefined; navigator.share = undefined; }
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    if (entries) localStorage.setItem(KEY, JSON.stringify({ entries, acts: [{ id: "x", emoji: "🚶", name: "เดิน", fx: 2 }] }));
  }, { KEY, entries, share });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/index.html");
  return errors;
}
const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name });
const ex = (page, fn, arg) => page.evaluate(([f, a]) => new Function("E", "a", "return (" + f + ")(E, a)")(window.Extras, a), [fn.toString(), arg]);
const pts = (e) => e.fx;

test.describe("mascot", () => {
  test("mood follows today's energy, with a greeting when nothing is logged", async ({ page }) => {
    await open(page);
    const r = await ex(page, (E) => ({
      none: E.mood(0, 0, 8, null), great: E.mood(5, 3, 14, null).mood, happy: E.mood(2, 2, 14, null).mood, calm: E.mood(0, 2, 14, null).mood,
      tiredEdge: E.mood(-1, 2, 14, null).mood, tired: E.mood(-3, 2, 14, null).mood, sleepy: E.mood(-4, 4, 14, null).mood,
      cheerUp: E.mood(0, 1, 14, 2).mood, comfort: E.mood(0, 1, 14, -2).mood, calmCheer: E.mood(0, 1, 14, 0).mood,
      night: E.mood(0, 0, 2, null).msg, morning: E.mood(0, 0, 8, null).msg,
    }));
    expect(r.none.mood).toBe("waiting");
    expect(r).toMatchObject({ great: "great", happy: "happy", calm: "calm", tiredEdge: "tired", tired: "tired", sleepy: "sleepy", cheerUp: "cheer", comfort: "comfort", calmCheer: "calm" });
    expect(r.morning).toContain("อรุณสวัสดิ์");
    expect(r.night).toContain("ดึกแล้วนะ");
  });

  test("every mood draws a mascot with a readable name, and messages never carry a signed number", async ({ page }) => {
    await open(page);
    const r = await ex(page, (E) => {
      const out = {};
      for (const m of ["waiting", "great", "happy", "calm", "tired", "sleepy", "cheer", "comfort"]) {
        const d = document.createElement("div"); d.innerHTML = E.mascotSvg(m, 80); const svg = d.firstElementChild;
        out[m] = { label: svg.getAttribute("aria-label"), mood: svg.dataset.mood, shapes: svg.querySelectorAll("path,ellipse,circle,text").length };
      }
      const msgs = [];
      for (const net of [-6, -2, 0, 2, 6]) for (const h of [3, 8, 12, 15, 19, 23]) for (const c of [0, 1, 4]) msgs.push(E.mood(net, c, h, null).msg);
      return { out, signed: msgs.filter((x) => /[+−-]\d/.test(x)).length, empty: msgs.filter((x) => !x.trim()).length };
    });
    for (const m of Object.keys(r.out)) { expect(r.out[m].mood).toBe(m); expect(r.out[m].label).toMatch(/^เห็ดน้อย/); expect(r.out[m].shapes).toBeGreaterThan(8); }
    expect(r.signed).toBe(0);
    expect(r.empty).toBe(0);
  });

  test("on the log page it waits, cheers right after a log for a few seconds, then settles by the day's total", async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "waiting");
    await expect(page.locator("#pet-msg")).toContainText("สวัสดียามบ่าย");
    await page.getByRole("button", { name: /เดิน\/ออกกำลังกาย/ }).click();
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "cheer");
    await expect(page.locator("#pet-msg")).toContainText(/เก่งมาก|ดีจังเลย/);
    await page.clock.fastForward(4500);
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "happy");   // +2 for the day
    await page.getByRole("button", { name: /ประชุมยาว/ }).click();
    await page.locator("#score").fill("-5");
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "comfort");
    await page.clock.fastForward(4500);
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "tired");   // 2 - 5 = -3
    await expect(page.locator("#today .big")).toHaveText("−3");
    expect(errors).toEqual([]);
  });

  test("finishing a game and logging it makes the mascot cheer too, and the mascot is in every theme", async ({ page }) => {
    await open(page);
    for (const skin of ["classic", "mario", "arcade"]) {
      await page.evaluate((k) => { localStorage.setItem("energy-map:v1:skin", k); document.documentElement.dataset.skin = k; }, skin);
      await expect(page.locator("#pet .pet-svg")).toBeVisible();
      await expect(page.locator("#pet-msg")).toBeVisible();
    }
    await page.evaluate(() => window.Games.open("tetris"));
    await page.evaluate(() => window.Games._test.tetris({ over: true, running: false, score: 10, lines: 0 }));
    await page.getByRole("button", { name: /บันทึกเป็นกิจกรรมเติมพลัง/ }).click();
    await nav(page, /บันทึก/).click();
    await expect(page.locator("#pet .pet-svg")).toHaveAttribute("data-mood", "cheer");
  });
});

test.describe("weekly garden", () => {
  const week = [                                                         // Mon 12 – Sun 18 Oct 2026
    at("2026-10-12T09:00:00+07:00", "เดิน", "🚶", 1),                      // Mon  +1   sprout
    at("2026-10-13T09:00:00+07:00", "เดิน", "🚶", 2), at("2026-10-13T10:00:00+07:00", "ฟังเพลง", "🎵", 1),   // Tue +3   bud
    at("2026-10-14T09:00:00+07:00", "เดิน", "🚶", 4),                      // Wed +4   one flower
    at("2026-10-15T09:00:00+07:00", "ธรรมชาติ", "🌳", 5), at("2026-10-15T11:00:00+07:00", "เดิน", "🚶", 3),   // Thu +8   two flowers
    at("2026-10-16T09:00:00+07:00", "ประชุม", "📅", -3), at("2026-10-16T11:00:00+07:00", "รถติด", "🚗", -4), // Fri -7   bare, two clouds
    at("2026-10-18T07:00:00+07:00", "เดิน", "🚶", 10),                     // Sun +10  three flowers
  ];
  const plot = (page, i) => page.locator(`#wgarden g[data-plot="${i}"]`);

  test("growth stages and rain: the model", async ({ page }) => {
    await open(page);
    const r = await ex(page, (E, week) => {
      const w = E.weekModel(week, new Date("2026-10-12T00:00:00+07:00").getTime(), (e) => e.fx), m = E.gardenModel(w, 6);
      return { totals: [w.b, w.d, w.net, w.count, w.active], plots: m.plots.map((p) => [p.stage, p.flowers, p.cloud]), flowers: m.flowers, buds: m.buds, caption: m.caption, today: m.plots.map((p) => p.today),
        boost: w.boost[0].name, drain: w.drain[0].name, empty: E.gardenModel(E.weekModel([], new Date("2026-10-12T00:00:00+07:00").getTime(), (e) => e.fx), null).caption };
    }, week);
    expect(r.plots).toEqual([[1, 0, 0], [2, 0, 0], [3, 1, 0], [3, 2, 0], [0, 0, 2], [0, 0, 0], [3, 3, 0]]);
    expect(r.totals).toEqual([26, 7, 19, 9, 6]);
    expect([r.flowers, r.buds]).toEqual([6, 1]);
    expect(r.caption).toContain("สวนกำลังสวย");
    expect(r.today).toEqual([false, false, false, false, false, false, true]);
    expect([r.boost, r.drain]).toEqual(["เดิน", "รถติด"]);   // -4 beats -3
    expect(r.empty).toContain("เงียบ");
  });

  test("the garden card shows on the summary page for a day or a week, follows the week, and hides for a month", async ({ page }) => {
    const errors = await open(page, week);
    await nav(page, /สรุป/).click();
    await expect(page.locator("#garden-card")).toBeVisible();                // the day view shows the week it belongs to
    await expect(plot(page, 0)).toHaveAttribute("data-stage", "1");
    await expect(plot(page, 6)).toHaveAttribute("data-flowers", "3");
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await expect(page.locator("#wgarden svg")).toHaveAttribute("aria-label", "สวนสัปดาห์นี้ มีดอกไม้ 6 ดอก");
    await expect(plot(page, 4)).toHaveAttribute("data-cloud", "2");
    await expect(plot(page, 5)).toHaveAttribute("data-stage", "0");
    await expect(page.locator("#garden-cap")).toContainText("สวนกำลังสวย");
    await expect(page.locator('#wgarden text:has-text("อา")')).toBeVisible();
    await page.getByRole("button", { name: "ช่วงก่อนหน้า" }).click();       // the week before: nothing was logged
    await expect(page.locator("#garden-cap")).toContainText("เงียบ");
    await expect(plot(page, 6)).toHaveAttribute("data-stage", "0");
    await page.getByRole("button", { name: "รายเดือน" }).click();
    await expect(page.locator("#garden-card")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("days that have not come yet are drawn faded, and the garden fits the screen", async ({ page }) => {
    await open(page, week.slice(0, 3));                                      // pretend it is Wednesday morning
    await page.clock.setSystemTime(new Date("2026-10-14T08:00:00+07:00"));
    await nav(page, /สรุป/).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await page.getByRole("button", { name: "รายวัน" }).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await expect(plot(page, 2)).not.toHaveAttribute("opacity", /.+/);
    await expect(plot(page, 3)).toHaveAttribute("opacity", ".45");
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(w[0]).toBeLessThanOrEqual(w[1]);
  });
});

test.describe("weekly card", () => {
  const entries = [at("2026-10-14T09:00:00+07:00", "เดิน", "🚶", 4), at("2026-10-15T09:00:00+07:00", "ประชุม", "📅", -2), at("2026-10-16T09:00:00+07:00", "ฟังเพลง", "🎵", 3)];

  test("the text summary and the model are right", async ({ page }) => {
    await open(page);
    const r = await ex(page, (E, es) => {
      const w = E.weekModel(es, new Date("2026-10-12T00:00:00+07:00").getTime(), (e) => e.fx);
      return { text: E.weekText(w), net: w.net, range: E.rangeLabel(w.start), empty: E.weekText(E.weekModel([], w.start, (e) => e.fx)) };
    }, entries);
    expect(r.net).toBe(5);
    expect(r.text).toContain("พลังสุทธิ +5");
    expect(r.text).toContain("เติม +7 เสีย −2");
    expect(r.text).toContain("บันทึก 3 ครั้ง ใน 3 วัน");
    expect(r.text).toContain("🚶 เดิน");
    expect(r.text).toContain("📅 ประชุม");
    expect(r.empty).toContain("ยังไม่มี");
  });

  test("opens a preview that is really drawn, with the same words as text underneath", async ({ page }) => {
    const errors = await open(page, entries);
    await nav(page, /สรุป/).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await page.getByRole("button", { name: /สร้างการ์ดสรุปสัปดาห์/ }).click();
    await expect(page.locator("#card-dlg")).toBeVisible();
    await expect(page.locator("#wtext")).toContainText("พลังสุทธิ +5");
    await expect(page.locator("#wcanvas")).toHaveAttribute("aria-label", /พลังสุทธิ \+5/);
    await expect.poll(() => page.evaluate(() => window.__drawn = document.getElementById("wcanvas").width)).toBe(900);
    const stats = await page.evaluate(() => {
      const c = document.getElementById("wcanvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] >> 5) + "," + (d[i + 1] >> 5) + "," + (d[i + 2] >> 5));
      return { w: c.width, h: c.height, colours: seen.size };
    });
    const red = await page.evaluate(() => {                                 // the mascot's red cap must be on the card, not just empty sky
      const c = document.getElementById("wcanvas"), d = c.getContext("2d").getImageData(300, 250, 300, 260).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] < 70) n++;
      return n;
    });
    expect(red).toBeGreaterThan(2000);
    expect(stats.h).toBe(1300);
    expect(stats.colours).toBeGreaterThan(8);                                // not a blank or single-colour picture
    await page.getByRole("button", { name: "ปิด" }).click();
    await expect(page.locator("#card-dlg")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("saving gives a real PNG named after the week", async ({ page }) => {
    await open(page, entries);
    await nav(page, /สรุป/).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await page.getByRole("button", { name: /สร้างการ์ดสรุปสัปดาห์/ }).click();
    await expect.poll(() => page.evaluate(() => document.getElementById("wcanvas").height)).toBe(1300);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /บันทึกรูป/ }).click()]);
    expect(dl.suggestedFilename()).toBe("energy-week-2026-10-12.png");
    const buf = fs.readFileSync(await dl.path());
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(buf.length).toBeGreaterThan(20000);
    await expect(page.locator("#wmsg")).toContainText("บันทึกรูปแล้ว");
  });

  test("sharing sends the picture and the text when the phone can, and explains when it cannot", async ({ page }) => {
    await open(page, entries, { share: "yes" });
    await nav(page, /สรุป/).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await page.getByRole("button", { name: /สร้างการ์ดสรุปสัปดาห์/ }).click();
    await expect.poll(() => page.evaluate(() => document.getElementById("wcanvas").height)).toBe(1300);
    await page.getByRole("button", { name: /แชร์/ }).click();
    await expect(page.locator("#wmsg")).toContainText("แชร์แล้ว");
    const shared = await page.evaluate(() => window.__shared);
    expect(shared.n).toBe("energy-week-2026-10-12.png");
    expect(shared.type).toBe("image/png");
    expect(shared.size).toBeGreaterThan(20000);
    expect(shared.text).toContain("พลังสุทธิ +5");

    const p2 = await page.context().newPage();
    await open(p2, entries, { share: "no" });
    await nav(p2, /สรุป/).click();
    await p2.getByRole("button", { name: "รายสัปดาห์" }).click();
    await p2.getByRole("button", { name: /สร้างการ์ดสรุปสัปดาห์/ }).click();
    await expect.poll(() => p2.evaluate(() => document.getElementById("wcanvas").height)).toBe(1300);
    await p2.getByRole("button", { name: /แชร์/ }).click();
    await expect(p2.locator("#wmsg")).toContainText("แชร์รูปตรง ๆ ไม่ได้");
  });

  test("an empty week still makes a friendly card", async ({ page }) => {
    await open(page);
    await nav(page, /สรุป/).click();
    await page.getByRole("button", { name: "รายสัปดาห์" }).click();
    await page.getByRole("button", { name: /สร้างการ์ดสรุปสัปดาห์/ }).click();
    await expect.poll(() => page.evaluate(() => document.getElementById("wcanvas").height)).toBe(1300);
    await expect(page.locator("#wtext")).toContainText("ยังไม่มี");
  });
});

test("the game menu is a compact grid of three, with the details kept for screen readers and tooltips", async ({ page }) => {
  await open(page);
  await nav(page, /เกม/).click();
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector(".gmenu")).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(3);
  await expect(page.locator(".gcard")).toHaveCount(8);
  const box = await page.locator(".gcard").first().boundingBox();
  expect(box.height).toBeLessThan(135);                                   // it used to be 160+
  const first = page.locator(".gcard").first();
  await expect(first).toHaveAttribute("title", /.+/);
  await expect(first).toHaveAttribute("aria-label", /จัดกระถางดอกไม้ — .+\(.+นาที\)/);
  const overflow = await page.evaluate(() => [...document.querySelectorAll(".gcard")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(overflow).toEqual([]);
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});
