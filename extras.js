"use strict";
// The cute extras: the mascot (its mood follows today's energy), the weekly garden, and the shareable weekly card.
// Everything here is pure or draws only what it is given, so it can be tested without the page.
(function () {
  const DAY = 864e5, NAVY = "#10285c";
  const PALETTE = ["#e52521", "#ffd400", "#ff7eb6", "#ffffff", "#a78bfa", "#fb923c", "#60a5fa"];
  const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
  const r1 = (n) => Math.round(n * 10) / 10;
  const sgn = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(r1(n));
  const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
  const pick = (a, i) => a[Math.abs(i) % a.length];

  /* ---------- mascot ---------- */
  const hello = (h) => (h < 5 ? "ดึกแล้วนะ" : h < 11 ? "อรุณสวัสดิ์" : h < 13 ? "สวัสดีตอนเที่ยง" : h < 17 ? "สวัสดียามบ่าย" : h < 21 ? "สวัสดีตอนเย็น" : "ใกล้เวลานอนแล้วนะ");
  const SAY = {
    great: ["วันนี้พลังล้นเลย! 🌟", "ดีใจจัง พลังเต็มปรี่เลยนะ"],
    happy: ["วันนี้ไปได้สวยนะ", "พลังกำลังดี ทำต่อไปเลย"],
    calm: ["วันนี้พลังสมดุลดี", "เรื่อย ๆ สบาย ๆ ก็ดีนะ"],
    tired: ["เหนื่อยหน่อยนะ พักสักนิดไหม", "ลองหายใจลึก ๆ หรือเดินเล่นสัก 5 นาทีนะ"],
    sleepy: ["พลังเหลือน้อยแล้ว ไปชาร์จกันเถอะ", "วันนี้หนักมากเลย พักผ่อนให้พอนะ"],
    cheer: ["เก่งมาก! พลังเพิ่มแล้ว", "ดีจังเลย เติมพลังได้อีกแล้ว"],
    comfort: ["ไม่เป็นไรนะ ค่อย ๆ ไป", "เหนื่อยแล้วก็พักได้นะ ฉันอยู่ตรงนี้"],
  };
  const LABEL = { waiting: "เห็ดน้อยกำลังรอฟังเรื่องของวันนี้", great: "เห็ดน้อยดีใจมาก", happy: "เห็ดน้อยกำลังยิ้ม", calm: "เห็ดน้อยสบายใจ", tired: "เห็ดน้อยเหนื่อยนิดหน่อย", sleepy: "เห็ดน้อยง่วงนอน", cheer: "เห็ดน้อยกำลังเชียร์", comfort: "เห็ดน้อยกำลังปลอบใจ" };
  // net = today's total, count = entries today, hour = 0-23, cheer = points of the entry just logged (or null)
  function mood(net, count, hour, cheer) {
    let m;
    if (cheer != null) m = cheer > 0 ? "cheer" : cheer < 0 ? "comfort" : "calm";
    else if (!count) m = "waiting";
    else m = net >= 4 ? "great" : net >= 1 ? "happy" : net > -1 ? "calm" : net > -4 ? "tired" : "sleepy";
    const msg = m === "waiting" ? pick([`${hello(hour)} วันนี้เป็นไงบ้าง เล่าให้ฟังหน่อยนะ`, `${hello(hour)} แตะกิจกรรมที่เพิ่งทำได้เลย`], hour) : pick(SAY[m], count + hour);
    return { mood: m, msg, label: LABEL[m] };
  }
  function mascotSvg(m, size) {
    const eyeO = `<ellipse cx="48" cy="92" rx="3.6" ry="6" fill="${NAVY}"/><ellipse cx="72" cy="92" rx="3.6" ry="6" fill="${NAVY}"/><circle cx="49.5" cy="89.5" r="1.6" fill="#fff"/><circle cx="73.5" cy="89.5" r="1.6" fill="#fff"/>`;
    const eyeHappy = `<path d="M42 94q6-8 12 0M66 94q6-8 12 0" fill="none" stroke="${NAVY}" stroke-width="3.2" stroke-linecap="round"/>`;
    const eyeSleep = `<path d="M42 91q6 7 12 0M66 91q6 7 12 0" fill="none" stroke="${NAVY}" stroke-width="3.2" stroke-linecap="round"/>`;
    const eyeTired = `<ellipse cx="48" cy="93" rx="3.4" ry="4.4" fill="${NAVY}"/><ellipse cx="72" cy="93" rx="3.4" ry="4.4" fill="${NAVY}"/><path d="M41 86l13 3M79 86l-13 3" stroke="${NAVY}" stroke-width="2.4" stroke-linecap="round"/>`;
    const smile = `<path d="M52 101q8 7 16 0" fill="none" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>`;
    const open = `<path d="M50 99q10 14 20 0z" fill="#c2410c" stroke="${NAVY}" stroke-width="2.5" stroke-linejoin="round"/>`;
    const flat = `<path d="M54 103h12" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>`;
    const wavy = `<path d="M52 104q4-4 8 0t8 0" fill="none" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>`;
    const small = `<ellipse cx="60" cy="103" rx="3.5" ry="4" fill="${NAVY}"/>`;
    const cheeks = `<circle cx="37" cy="100" r="5" fill="#ff9aa2" opacity=".85"/><circle cx="83" cy="100" r="5" fill="#ff9aa2" opacity=".85"/>`;
    const star = (x, y, r) => `<path d="M${x} ${y - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}z" fill="#ffd400" stroke="${NAVY}" stroke-width="1.2" stroke-linejoin="round"/>`;
    const heart = (x, y) => `<path d="M${x} ${y + 6}c-9-6-9-14-3-14 2 0 3 1 3 3 0-2 1-3 3-3 6 0 6 8-3 14z" fill="#ff7eb6" stroke="${NAVY}" stroke-width="1.2" stroke-linejoin="round"/>`;
    const F = {
      waiting: eyeO + smile, happy: eyeO + smile + cheeks, calm: eyeO + flat + cheeks,
      great: eyeHappy + open + cheeks + star(14, 22, 9) + star(108, 14, 7),
      tired: eyeTired + wavy + `<path d="M100 26q-7 10 0 14 7-4 0-14z" fill="#60a5fa" stroke="${NAVY}" stroke-width="1.5"/>`,
      sleepy: eyeSleep + small + `<text x="92" y="28" font-size="17" font-weight="700" fill="#4a5f8a" font-family="sans-serif">z</text><text x="104" y="14" font-size="12" font-weight="700" fill="#4a5f8a" font-family="sans-serif">z</text>`,
      cheer: eyeHappy + open + cheeks + heart(98, 14) + heart(14, 26),
      comfort: eyeO + smile + cheeks + heart(100, 18),
    }[m] || eyeO + smile;
    return `<svg class="pet-svg" xmlns="http://www.w3.org/2000/svg" data-mood="${m}" viewBox="0 0 120 120" width="${size || 96}" height="${size || 96}" role="img" aria-label="${LABEL[m] || ""}">
      <defs><clipPath id="petcap${m}"><path d="M12 66C12 34 34 16 60 16S108 34 108 66C108 70 105 73 101 73H19C15 73 12 70 12 66Z"/></clipPath></defs>
      <ellipse cx="60" cy="114" rx="34" ry="5" fill="#10285c" opacity=".14"/>
      <path d="M30 70H90V92C90 105 76 111 60 111S30 105 30 92Z" fill="#f0cf9f" stroke="${NAVY}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M12 66C12 34 34 16 60 16S108 34 108 66C108 70 105 73 101 73H19C15 73 12 70 12 66Z" fill="#e52521"/>
      <g clip-path="url(#petcap${m})" fill="#fff"><ellipse cx="60" cy="36" rx="16" ry="12"/><ellipse cx="22" cy="56" rx="11" ry="14"/><ellipse cx="98" cy="56" rx="11" ry="14"/></g>
      <path d="M12 66C12 34 34 16 60 16S108 34 108 66C108 70 105 73 101 73H19C15 73 12 70 12 66Z" fill="none" stroke="${NAVY}" stroke-width="4.5" stroke-linejoin="round"/>
      ${F}</svg>`;
  }

  /* ---------- week and garden ---------- */
  const monday = (t) => { const d = sod(t), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d; };
  // entries are {ts, name, emoji, ...}; pts(e) gives the points of one entry
  function weekModel(entries, weekStart, pts) {
    const start = sod(weekStart).getTime(), days = Array.from({ length: 7 }, () => ({ b: 0, d: 0, n: 0, count: 0 })), acts = new Map();
    let b = 0, d = 0, count = 0;
    for (const e of entries) {
      const i = Math.round((sod(e.ts).getTime() - start) / DAY);
      if (i < 0 || i > 6) continue;
      const p = pts(e), day = days[i];
      if (p > 0) { day.b += p; b += p; } else { day.d += -p; d += -p; }
      day.n = day.b - day.d; day.count++; count++;
      const a = acts.get(e.name) || { name: e.name, emoji: e.emoji, sum: 0, n: 0 }; a.sum += p; a.n++; acts.set(e.name, a);
    }
    const all = [...acts.values()], active = days.filter((x) => x.count).length;
    return {
      start, days, b, d, net: b - d, count, active,
      boost: all.filter((a) => a.sum > 0).sort((x, y) => y.sum - x.sum), drain: all.filter((a) => a.sum < 0).sort((x, y) => x.sum - y.sum),
    };
  }
  // growth stages: 0 bare soil, 1 sprout, 2 bud, 3 flowers (1-3 of them); rain clouds for the tiring days
  function plantOf(day) {
    const stage = day.b <= 0 ? 0 : day.b < 1.5 ? 1 : day.b < 3.5 ? 2 : 3;
    return { stage, flowers: stage === 3 ? Math.min(3, 1 + Math.floor((day.b - 3.5) / 3)) : 0, cloud: day.d >= 6 ? 2 : day.d >= 2 ? 1 : 0 };
  }
  function gardenModel(week, todayIdx) {
    const plots = week.days.map((day, i) => ({ i, label: DOW[i], ...plantOf(day), future: todayIdx != null && i > todayIdx, today: i === todayIdx }));
    const flowers = plots.reduce((n, p) => n + p.flowers, 0), buds = plots.filter((p) => p.stage === 2).length;
    const caption = !week.count ? "สวนยังเงียบอยู่ รอวันแรกของสัปดาห์นี้นะ" : flowers >= 10 ? "สวนบานสะพรั่งเลย 🌸" : flowers >= 5 ? "สวนกำลังสวยเลย 🌷" : flowers >= 1 ? "เริ่มมีดอกไม้บานแล้ว 🌼" : buds ? "ตุ้มดอกกำลังจะบานแล้ว 🌱" : "ต้นอ่อนกำลังงอก 🌱";
    return { plots, flowers, buds, caption };
  }
  function gardenSvg(model, opts) {
    const ink = (opts && opts.ink) || "currentColor", W = 336, H = 172;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="สวนสัปดาห์นี้ มีดอกไม้ ${model.flowers} ดอก">`;
    s += `<rect x="4" y="116" width="${W - 8}" height="34" rx="14" fill="#7ad06a"/><rect x="4" y="128" width="${W - 8}" height="22" rx="11" fill="#2e9e3f"/>`;
    for (const p of model.plots) {
      const cx = 24 + p.i * 48, col = PALETTE[p.i], fade = p.future ? ' opacity=".45"' : "";
      s += `<g data-plot="${p.i}" data-stage="${p.stage}" data-flowers="${p.flowers}" data-cloud="${p.cloud}"${fade}>`;
      s += `<ellipse cx="${cx}" cy="131" rx="19" ry="7" fill="#8b5a2b"/>`;
      if (p.stage === 1) s += `<path d="M${cx} 128v-8" stroke="#2e9e3f" stroke-width="3" stroke-linecap="round"/><path d="M${cx} 121q-9-1-10-9 8 0 10 9zM${cx} 121q9-1 10-9-8 0-10 9z" fill="#59c24a"/>`;
      if (p.stage === 2) s += `<path d="M${cx} 128V98" stroke="#2e9e3f" stroke-width="3" stroke-linecap="round"/><path d="M${cx} 112q-10 0-11-9 9 0 11 9zM${cx} 106q10 0 11-9-9 0-11 9z" fill="#59c24a"/><ellipse cx="${cx}" cy="94" rx="6" ry="8" fill="${col}" stroke="${NAVY}" stroke-width="1.5"/>`;
      if (p.stage === 3) {
        const xs = p.flowers === 1 ? [0] : p.flowers === 2 ? [-9, 9] : [-12, 12, 0], hs = p.flowers === 3 ? [78, 84, 62] : [74, 82, 0];
        xs.forEach((dx, k) => {
          const x = cx + dx, y = hs[k];
          s += `<path d="M${x} 128V${y + 8}" stroke="#2e9e3f" stroke-width="3" stroke-linecap="round"/><path d="M${x} 112q-9 0-10-8 8 0 10 8z" fill="#59c24a"/>`;
          for (let a = 0; a < 5; a++) { const r = (a * 2 * Math.PI) / 5 - Math.PI / 2; s += `<circle cx="${(x + 7 * Math.cos(r)).toFixed(1)}" cy="${(y + 7 * Math.sin(r)).toFixed(1)}" r="5.6" fill="${col}" stroke="${NAVY}" stroke-width="1"/>`; }
          s += `<circle cx="${x}" cy="${y}" r="4.4" fill="${col === "#ffd400" ? "#e52521" : "#ffd400"}" stroke="${NAVY}" stroke-width="1"/>`;
        });
      }
      for (let c = 0; c < p.cloud; c++) {
        const ox = cx - 6 + c * 12, oy = 16 + c * 3;
        s += `<g fill="#cbd5e1" stroke="${NAVY}" stroke-width="1"><circle cx="${ox - 6}" cy="${oy + 4}" r="6"/><circle cx="${ox + 2}" cy="${oy}" r="8"/><circle cx="${ox + 10}" cy="${oy + 4}" r="6"/></g><path d="M${ox - 4} ${oy + 14}v6M${ox + 4} ${oy + 14}v8M${ox + 11} ${oy + 14}v6" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/>`;
      }
      if (p.today) s += `<rect x="${cx - 13}" y="154" width="26" height="17" rx="8.5" fill="${NAVY}"/>`;
      s += `<text x="${cx}" y="166" text-anchor="middle" font-size="12" font-weight="${p.today ? 800 : 600}" fill="${p.today ? "#fff" : ink}" font-family="sans-serif">${p.label}</text></g>`;
    }
    return s + "</svg>";
  }

  /* ---------- the weekly card (a picture to keep or share) ---------- */
  const rangeLabel = (start) => {
    const a = new Date(start), b = new Date(start); b.setDate(b.getDate() + 6);
    const f = (d) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
    return `${f(a)} – ${f(b)}`;
  };
  function weekText(week) {
    const top = (list) => (list[0] ? `${list[0].emoji} ${list[0].name}` : "ยังไม่มี");
    return `สัปดาห์ ${rangeLabel(week.start)}: พลังสุทธิ ${sgn(week.net)} (เติม ${sgn(week.b)} เสีย ${sgn(-week.d)}) จากบันทึก ${week.count} ครั้ง ใน ${week.active} วัน · ตัวชาร์จคู่ใจ ${top(week.boost)} · ตัวดูดพลังอันดับ 1 ${top(week.drain)}`;
  }
  const loadSvg = (svg) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function fit(ctx, text, maxW) { if (ctx.measureText(text).width <= maxW) return text; let t = text; while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1); return t + "…"; }
  async function drawWeekCard(cv, week, todayIdx) {
    const W = 900, H = 1300, ctx = cv.getContext("2d");
    cv.width = W; cv.height = H;
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#5aa5f2"); sky.addColorStop(0.6, "#a9d3fb"); sky.addColorStop(1, "#e3f2ff");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    for (const [x, y, r] of [[120, 120, 46], [190, 100, 60], [260, 128, 44], [720, 210, 40], [780, 190, 54], [840, 215, 38]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#7ad06a"; ctx.beginPath(); ctx.ellipse(150, 1310, 460, 170, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2e9e3f"; ctx.beginPath(); ctx.ellipse(760, 1340, 560, 190, 0, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round";
    ctx.font = "800 84px sans-serif"; ctx.lineWidth = 14; ctx.strokeStyle = NAVY; ctx.strokeText("สัปดาห์ของฉัน", W / 2, 150); ctx.fillStyle = "#fff"; ctx.fillText("สัปดาห์ของฉัน", W / 2, 150);
    ctx.font = "700 40px sans-serif"; const lab = rangeLabel(week.start), lw = ctx.measureText(lab).width + 60;
    ctx.fillStyle = NAVY; rr(ctx, W / 2 - lw / 2, 178, lw, 66, 33); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(lab, W / 2, 224);
    const avg = week.active ? week.net / week.active : 0, m = mood(avg, week.count, 12, null).mood;
    try { const img = await loadSvg(mascotSvg(m === "waiting" ? "happy" : m, 300)); ctx.drawImage(img, W / 2 - 130, 250, 260, 260); } catch (e) { /* the card is still complete without the picture */ }
    ctx.fillStyle = "#fff"; rr(ctx, 70, 520, 760, 410, 36); ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.fillStyle = "#4a5f8a"; ctx.font = "600 34px sans-serif"; ctx.fillText("พลังสุทธิสัปดาห์นี้", W / 2, 580);
    ctx.fillStyle = week.net >= 0 ? "#137a2a" : "#c8201f"; ctx.font = "800 120px sans-serif"; ctx.fillText(week.count ? sgn(week.net) : "–", W / 2, 690);
    ctx.font = "700 36px sans-serif"; ctx.fillStyle = "#137a2a"; ctx.fillText(`▲ เติมพลัง ${sgn(week.b)}`, 250, 750); ctx.fillStyle = "#c8201f"; ctx.fillText(`▼ เสียพลัง ${sgn(-week.d)}`, 650, 750);
    ctx.fillStyle = "#4a5f8a"; ctx.font = "600 30px sans-serif"; ctx.fillText(`บันทึก ${week.count} ครั้ง · ใช้งาน ${week.active} วัน`, W / 2, 800);
    ctx.textAlign = "left"; ctx.font = "600 32px sans-serif"; ctx.fillStyle = NAVY;
    const top = (l) => (l[0] ? `${l[0].emoji} ${l[0].name}` : "ยังไม่มี");
    ctx.fillText(fit(ctx, `🔋 ตัวชาร์จคู่ใจ  ${top(week.boost)}`, 680), 100, 856);
    ctx.fillText(fit(ctx, `🪫 ตัวดูดพลัง  ${top(week.drain)}`, 680), 100, 906);
    ctx.textAlign = "center";
    try { const g = await loadSvg(gardenSvg(gardenModel(week, todayIdx), { ink: "#10285c" })); ctx.drawImage(g, 150, 945, 600, 307); } catch (e) { /* ditto */ }
    ctx.fillStyle = NAVY; ctx.font = "800 30px sans-serif"; ctx.fillText("🍄 แผนที่พลังงาน", W / 2, 1288);
    return cv;
  }

  window.Extras = { mood, mascotSvg, weekModel, gardenModel, gardenSvg, weekText, rangeLabel, drawWeekCard, monday, plantOf, sgn, LABEL };
})();
