// Drives the real UI end-to-end in headless Chrome: onboarding, search,
// guided chip, mid-search filter, cart, checkout, order, analytics tabs.
// Every interaction is a real event in the public analytics store.
const puppeteer = require("/Users/apple/askcart/app/node_modules/puppeteer-core");
const fs = require("fs");

const OUT = "/Users/apple/askcart/docs/evidence/screenshots";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1280, height: 1500 },
  });
  const page = await browser.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log("shot:", name);
  };
  const clickByText = async (selector, text) => {
    const els = await page.$$(selector);
    for (const el of els) {
      const t = await page.evaluate((e) => e.textContent, el);
      if (t.trim() === text) { await el.click(); return true; }
    }
    return false;
  };

  // Failing steps must be loud, not silently skipped (tour 2026-11-06:
  // a transient 0-result search used to skip every downstream step).
  let failures = 0;
  const must = (cond, label) => { if (!cond) { failures++; console.error("MISSING:", label); } return !!cond; };
  const poll = async (fn, ms, step = 500) => {
    const t0 = Date.now();
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); }
  };
  const cartBadge = () => page.evaluate(() => {
    const b = document.querySelector('[aria-label="Cart"] .badge, [aria-label="Cart"] [class*=badge]');
    return b ? b.textContent.trim() : "";
  });

  // 1. O5: onboarding panel (behind /?onboard=1) - 3 answers + payoff toast
  await page.goto("http://localhost:3000/?onboard=1", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(1500);
  await shot("mvp_onboarding_panel");
  for (const idx of [1, 1, 0]) {
    const opts = await page.$$(".ob-opts button");
    if (!opts.length) break;
    await opts[idx].click();
    await sleep(450);
  }
  await sleep(1000);
  await shot("mvp_onboarding_toast");

  // 2. O1/O2: hero-first home with the non-blocking persona strip
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(1500);
  await shot("mvp_home_hero");
  const stripLine = await page.$(".strip-line");
  if (stripLine) {
    await stripLine.click();
    await sleep(500);
    const hinglishSeg = await clickByText(".seg", "Hinglish");
    if (hinglishSeg) await sleep(300);
    const pinIn = await page.$(".pin-in");
    if (pinIn) { await pinIn.type("110001"); await sleep(300); }
    const useBtn = await page.$(".strip-use");
    if (useBtn) { await useBtn.click(); await sleep(600); }
    await shot("mvp_strip_set");
  }
  const adds0 = await poll(async () => { const a = await page.$$(".card-add"); return a.length ? a : null; }, 8000);
  if (must(adds0 && adds0.length, "home rail add button")) {
    await adds0[0].click();
    must(await poll(async () => (await cartBadge()) === "1", 5000), "home add -> cart badge 1");
    await sleep(500);
  }
  await shot("mvp_home_preview");

  // 3. shaadi deep link (guided search)
  await page.goto("http://localhost:3000/?q=shaadi+gift+under+2k&noob=1", { waitUntil: "networkidle0", timeout: 90000 });
  const shaadiSettled = await poll(async () => (await page.$(".grid .card")) || (await page.$(".qcard2")), 20000);
  if (must(shaadiSettled, "shaadi search settled")) {
    const tAdds = await page.$$(".grid .card-add");
    must(tAdds.length >= 10, "shaadi results grid (>=10 add buttons)");
    if (tAdds.length) {
      const before = await cartBadge();
      await tAdds[0].click();
      must(await poll(async () => (await cartBadge()) !== "0" && (await cartBadge()) !== before, 5000), "shaadi add -> cart badge");
      await sleep(400);
    }
  }
  await shot("mvp_search_shaadi_gift");

  // 4b. mid-search filter: price band ₹1k–3k
  const filtered = await clickByText(".fside-chips .fchip", "₹1k–2k"); // adaptive bands: capped at the query budget (2k)
  if (filtered) await sleep(700);
  await shot("mvp_search_filtered");

  // 5. cart
  const cartbtn = await page.$('[aria-label="Cart"]');
  if (must(cartbtn, "header cart button")) {
    await cartbtn.click();
    must(await poll(async () => (await page.$$(".drawer .cart-row")).length >= 1, 5000), "cart drawer rows");
  }
  await shot("mvp_cart");
  const closeX = await page.$(".drawer .x");
  if (closeX) { await closeX.click(); await sleep(400); }

  // 6. headphones (expect optional refinement question on top)
  await page.goto("http://localhost:3000/?q=headphones&noob=1", { waitUntil: "networkidle0", timeout: 90000 });
  const hpSettled = await poll(async () => (await page.$(".grid .card")) || (await page.$(".qcard2")), 20000);
  if (must(hpSettled, "headphones search settled")) {
    let chips = [];
    for (let w = 0; w < 15; w++) {
      chips = await page.$$(".qcard2 .qchip2, .qstrip2 .qchip2");
      if (chips.length) break;
      await sleep(1000);
    }
    must(chips.length >= 2, "headphones guided question chips");
    if (chips.length > 1) { await chips[1].click(); }
    for (let w = 0; w < 15; w++) {
      if ((await page.$$(".grid .card-add")).length) break;
      await sleep(1000);
    }
    const hpAdds = await page.$$(".grid .card-add");
    if (must(hpAdds.length, "headphones results grid")) {
      await hpAdds[0].click(); await sleep(600);
    }
  }
  await shot("mvp_search_headphones_guided");

  // 7. open PDP from a result card, then buy now from the PDP
  const firstCard = await page.$(".grid .card");
  if (must(firstCard, "result card to open PDP")) {
    await firstCard.click();
    must(await poll(async () => page.$("#pdp-view"), 5000), "full-page PDP opens");
  }
  await shot("mvp_pdp");
  const pdpBuy = await page.$(".pdp-buy");
  if (must(pdpBuy, "PDP buy now")) { await pdpBuy.click(); await sleep(900); }
  must(!!(await page.$(".modal .drawer-foot .primary")), "checkout modal opens");
  await shot("mvp_checkout_buy_now");

  // 8. place order
  const place = await page.$(".modal .drawer-foot .primary");
  if (must(place, "place order button")) { await place.click(); await sleep(1500); }
  const placed = await page.evaluate(() => /order/i.test(document.body.textContent) && !document.querySelector(".modal .drawer-foot"));
  must(placed, "order placed state");
  await shot("mvp_order_placed");

  // 9. analytics tabs
  for (const [view, name] of [
    ["overview", "mvp_analytics_overview"],
    ["search", "mvp_analytics_search_guide"],
    ["catalog", "mvp_analytics_catalog"],
    ["journeys", "mvp_analytics_journeys"],
    ["validation", "mvp_analytics_validation"],
    ["backend", "mvp_analytics_backend"],
  ]) {
    await page.goto(`http://localhost:3000/?tab=analytics&anview=${view}`, { waitUntil: "networkidle0", timeout: 90000 });
    await sleep(4000); // let a couple of 2.5s polls land
    await shot(name);
  }

  await browser.close();
  if (failures) { console.error("tour FAILED with " + failures + " missing step(s)"); process.exitCode = 1; }
  else console.log("tour complete: all steps verified");
})().catch((e) => { console.error(e); process.exit(1); });
