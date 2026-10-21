const { chromium } = require("C:/Users/16697/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto("http://localhost:8888/#/map", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(15000);

  const geo = await p.evaluate(() => {
    const sels = [".theme-switch", ".cfg-toggle", ".palette-toggle", ".weather_panel"];
    const out = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) { out[s] = null; continue; }
      const r = el.getBoundingClientRect();
      out[s] = { x: Math.round(r.x), w: Math.round(r.width), cy: Math.round(r.y + r.height / 2) };
    }
    const cfg = document.querySelector(".cfg-toggle");
    const r = cfg.getBoundingClientRect();
    const stack = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      .slice(0, 2)
      .map((e) => (typeof e.className === "string" && e.className ? e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase()));
    return { out, stack };
  });
  console.log("geo:", JSON.stringify(geo, null, 2));

  await p.click(".cfg-toggle");
  await p.waitForTimeout(1200);
  const panel = await p.evaluate(() => {
    const el = document.querySelector(".cfg-panel");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), w: Math.round(r.width) };
  });
  console.log("cfg-panel:", JSON.stringify(panel));

  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  const drawer = await p.evaluate(async () => {
    document.querySelector(".palette-toggle").click();
    await new Promise((r) => setTimeout(r, 1200));
    const d = document.querySelector(".el-drawer");
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log("palette drawer:", JSON.stringify(drawer));

  await b.close();
})();
