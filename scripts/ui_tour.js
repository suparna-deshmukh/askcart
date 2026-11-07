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

  // 1. Section 3: full-screen first-visit onboarding (behind /?onboard=1)
  //    name -> context -> interests -> spendStyle -> ageBand -> start
  await page.goto("http://localhost:3000/?onboard=1", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(1800);
  must(await page.$(".ob3"), "full-screen onboarding shown");
  await shot("mvp_onboarding_panel");
  const obBtn = async (sel) => { const el = await page.$(sel); must(!!el, sel); await el.click(); };
  await obBtn(".ob3-name-cta .ob3-linkbtn");   // name: continue as guest
  await sleep(550);
  let ob3opts = await page.$$(".ob3-opts button");   // context
  must(ob3opts.length >= 4, "context options"); await ob3opts[1].click(); await sleep(550);
  ob3opts = await page.$$(".ob3-opts button");        // interests
  must(ob3opts.length >= 7, "interest options"); await ob3opts[1].click(); await sleep(300);
  await obBtn(".ob3-name-cta .ob3-primary");          // interests: continue
  await sleep(550);
  ob3opts = await page.$$(".ob3-opts button");        // spendStyle
  must(ob3opts.length >= 4, "spendStyle options"); await ob3opts[0].click(); await sleep(550);
  ob3opts = await page.$$(".ob3-opts button");        // ageBand
  must(ob3opts.length >= 3, "ageBand options"); await ob3opts[1].click(); await sleep(800);
  must(await page.$(".ob3-done-wrap"), "completion screen");
  await shot("mvp_onboarding_done");
  await obBtn(".ob3-done-btns .ob3-primary");         // start shopping
  await sleep(1200);
  await shot("mvp_onboarding_toast");
  must(await page.$(".hero2"), "home after onboarding");

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
    must(await poll(async () => (await page.$$(".cv2-row")).length >= 1, 5000), "cart drawer rows");
  }
  await shot("mvp_cart");
  const closeX = await page.$(".cv2-x");
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
  if (must(pdpBuy, "PDP buy now")) { await pdpBuy.click(); await sleep(1200); }
  must(await poll(async () => page.$(".co-stepper"), 8000), "checkout page opens");
  await shot("mvp_checkout_address");

  // 8. checkout: address -> delivery -> payment -> review -> place
  await page.type('[data-field="name"]', "Demo Shopper");
  await page.type('[data-field="mobile"]', "9876543210");
  const pinVal = await page.$eval('[data-field="pin"]', (e) => e.value).catch(() => "");
  if (!pinVal) await page.type('[data-field="pin"]', "110001");
  await page.type('[data-field="street"]', "1 Demo Street");
  await page.type('[data-field="city"]', "Delhi");
  await page.select('[data-field="state"]', "Delhi");
  await sleep(300);
  const addrBtn = await page.$('[data-step="address"]');
  if (must(addrBtn, "deliver here")) { await addrBtn.click(); await sleep(800); }
  const delivBtn = await page.$('[data-step="delivery"]');
  if (must(delivBtn, "delivery continue")) { await delivBtn.click(); await sleep(800); }
  const payBtn = await page.$('[data-step="payment"]');
  if (must(payBtn, "payment continue")) { await payBtn.click(); await sleep(800); }
  await shot("mvp_checkout_review");
  const place = await page.$('[data-step="place"]');
  if (must(place, "place order button")) { await place.click(); }
  must(await poll(async () => page.$(".cf-check"), 12000), "confirmation page");
  await sleep(1000);
  await shot("mvp_order_placed");

  // 8b. orders tab: the new (simulated) order is listed
  await page.goto("http://localhost:3000/?tab=orders&noob=1", { waitUntil: "networkidle0", timeout: 90000 });
  must(await poll(async () => (await page.$$(".o2-card")).length >= 1, 10000), "orders list");
  await shot("mvp_orders");

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
