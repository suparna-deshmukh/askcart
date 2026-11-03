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

  // 1. home + onboarding (3-question persona v2)
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(1500);
  await shot("mvp_home_onboarding");

  // 2. finish onboarding: Working professional / Good quality at a fair price / Myself
  for (const idx of [1, 1, 0]) {
    const opts = await page.$$(".ob-opts button");
    if (!opts.length) break;
    await opts[idx].click();
    await sleep(450);
  }
  await sleep(1000);
  await shot("mvp_home_preview");

  // 3. add first trending card to cart
  const adds = await page.$$(".cardbtns .add");
  if (adds.length) { await adds[0].click(); await sleep(700); }

  // 4. shaadi deep link (guided search)
  await page.goto("http://localhost:3000/?q=shaadi+gift+under+2k&noob=1", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(3000);
  const tAdds = await page.$$(".grid .cardbtns .add");
  if (tAdds.length) { await tAdds[0].click(); await sleep(700); }
  await shot("mvp_search_shaadi_gift");

  // 4b. mid-search filter: price band ₹1k–3k
  const filtered = await clickByText(".filters .fchip", "₹1k–3k");
  if (filtered) await sleep(700);
  await shot("mvp_search_filtered");

  // 5. cart
  const cartbtn = await page.$(".cartbtn");
  if (cartbtn) { await cartbtn.click(); await sleep(800); }
  await shot("mvp_cart");
  const closeX = await page.$(".drawer .x");
  if (closeX) { await closeX.click(); await sleep(400); }

  // 6. headphones (expect optional refinement question on top)
  await page.goto("http://localhost:3000/?q=headphones&noob=1", { waitUntil: "networkidle0", timeout: 90000 });
  await sleep(2000);
  let chips = [];
  for (let w = 0; w < 15; w++) {
    chips = await page.$$(".qcard .chips button");
    if (chips.length) break;
    await sleep(1000);
  }
  if (chips.length > 1) { await chips[1].click(); }
  for (let w = 0; w < 15; w++) {
    if ((await page.$$(".grid .cardbtns .add")).length) break;
    await sleep(1000);
  }
  const hpAdds = await page.$$(".grid .cardbtns .add");
  if (hpAdds.length) { await hpAdds[0].click(); await sleep(600); }
  await shot("mvp_search_headphones_guided");

  // 7. buy now on a result
  const buy = await page.$$(".grid .cardbtns .buy");
  if (buy.length) { await buy[0].click(); await sleep(900); }
  await shot("mvp_checkout_buy_now");

  // 8. place order
  const place = await page.$(".modal .drawer-foot .primary");
  if (place) { await place.click(); await sleep(1200); }
  await shot("mvp_order_placed");

  // 9. analytics tabs
  for (const [view, name] of [
    ["overview", "mvp_analytics_overview"],
    ["search", "mvp_analytics_search_guide"],
    ["catalog", "mvp_analytics_catalog"],
    ["journeys", "mvp_analytics_journeys"],
    ["validation", "mvp_analytics_validation"],
  ]) {
    await page.goto(`http://localhost:3000/?tab=analytics&anview=${view}`, { waitUntil: "networkidle0", timeout: 90000 });
    await sleep(4000); // let a couple of 2.5s polls land
    await shot(name);
  }

  await browser.close();
  console.log("tour complete");
})().catch((e) => { console.error(e); process.exit(1); });
