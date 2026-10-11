// Records the demo on the hosted Monad testnet build. One take, no captions:
// captions and narration go on per language in mux.mjs, so KO and EN share the
// same on-chain run. Scene length = the longer of the two narrations + 0.8s.
import { chromium } from "playwright-core";
import { Wallet, JsonRpcProvider, Network } from "ethers";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE || "https://mandate-e4kb.onrender.com/";
const RPC = process.env.RPC || "https://testnet-rpc.monad.xyz";
// The browser-wallet key pays gas for Launch. It lives outside the repo.
const KEY_FILE = process.env.KEY_FILE;
const SCENES = 8;
const LABEL = process.env.LABEL || "Monad testnet";
const len = (dir, i) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${dir}/s${i}.aiff`]).toString());
const dur = [...Array(SCENES).keys()].map((i) => Math.max(len("audio-ko", i), len("audio-en", i)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CHAIN_ID=31337 for a local chain. A fixed network keeps ethers from re-probing the RPC.
const net = Network.from(Number(process.env.CHAIN_ID || 10143));
const rpc = new JsonRpcProvider(RPC, net, { staticNetwork: net });
// ONLY=1,7 re-records just those scenes; mux takes each scene from its own take.
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null;
async function retry(f, n = 4) {
  for (let k = 1; ; k++) {
    try { return await f(); } catch (e) {
      if (k >= n || e.code === "CALL_EXCEPTION") throw e;
      log("rpc retry", k, e.shortMessage ?? e.message);
      await sleep(1500 * k);
    }
  }
}
// Either a list of {private_key} or one {privateKey} object.
const keyJson = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
const wallet = new Wallet(Array.isArray(keyJson) ? keyJson[0].private_key : keyJson.privateKey, rpc);
const chainHex = "0x" + (await rpc.getNetwork()).chainId.toString(16);
const sent = [];

const OVERLAY = () => {
  if (document.getElementById("__cur")) return;
  const css = document.createElement("style");
  css.textContent = `
  #__cur{position:fixed;z-index:2147483647;width:22px;height:22px;pointer-events:none;transition:left .7s cubic-bezier(.22,1,.36,1),top .7s cubic-bezier(.22,1,.36,1);left:640px;top:360px}
  #__cur svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));transform-origin:3px 2px;transition:transform .12s ease-out}
  #__cur.__down svg{transform:scale(.82)}
  .__ring{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #ffd23f;border-radius:10px;box-shadow:0 0 0 4px rgba(255,210,63,.25),0 0 24px rgba(255,210,63,.55);opacity:0;transform:scale(1.06);transition:opacity .35s ease-out,transform .45s cubic-bezier(.22,1,.36,1)}
  .__ring.__on{opacity:1;transform:none}
  .__ripple{position:fixed;z-index:2147483646;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #ffd23f;animation:__rp .8s cubic-bezier(.22,1,.36,1) forwards}
  .__ripple.__late{animation-delay:.12s;opacity:0}
  @keyframes __rp{from{transform:scale(.6);opacity:.95}to{transform:scale(4.2);opacity:0}}
  #__act{position:fixed;z-index:2147483647;right:18px;top:74px;padding:7px 12px;border-radius:7px;background:#ffd23f;color:#111;font:600 14px/1.2 ui-monospace,Menlo,monospace;pointer-events:none;opacity:0;transform:translateY(-6px);transition:opacity .3s ease-out,transform .4s cubic-bezier(.22,1,.36,1)}
  #__act.__on{opacity:1;transform:none}
  #__role{position:fixed;z-index:2147483647;left:18px;top:74px;padding:6px 11px;border-radius:7px;background:rgba(6,9,16,.86);color:#f4f6fb;border:1px solid rgba(255,210,63,.7);font:600 13px/1.2 ui-monospace,Menlo,monospace;pointer-events:none;opacity:0;transition:opacity .3s ease-out}
  #__role.__on{opacity:1}
  .toast{bottom:auto!important;top:90px}`;
  document.head.appendChild(css);
  const cur = document.createElement("div");
  cur.id = "__cur";
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8-6.5 1.8L8.6 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const act = Object.assign(document.createElement("div"), { id: "__act" });
  // Who is acting right now, so a role change is on screen and not only in the narration.
  const role = Object.assign(document.createElement("div"), { id: "__role" });
  document.body.append(cur, act, role);
  window.__setRole = (t) => {
    role.textContent = t ? "Acting as: " + t : "";
    role.classList.toggle("__on", Boolean(t));
  };
  // The badge fades out with its old text, then fades in with the new one.
  let actTimer;
  window.__action = (t) => {
    clearTimeout(actTimer);
    if (!t) { act.classList.remove("__on"); return; }
    if (!act.classList.contains("__on")) { act.textContent = t; act.classList.add("__on"); return; }
    act.classList.remove("__on");
    actTimer = setTimeout(() => { act.textContent = t; act.classList.add("__on"); }, 220);
  };
  window.__point = (el) => {
    const r = el.getBoundingClientRect();
    cur.style.left = r.left + r.width / 2 + "px";
    cur.style.top = r.top + r.height / 2 + "px";
    const ring = Object.assign(document.createElement("div"), { className: "__ring" });
    Object.assign(ring.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" });
    document.body.appendChild(ring);
    requestAnimationFrame(() => requestAnimationFrame(() => ring.classList.add("__on")));
    return ring;
  };
  // Fade the ring out rather than dropping it from one frame to the next.
  window.__unpoint = (ring) => {
    if (!ring) return;
    ring.classList.remove("__on");
    setTimeout(() => ring.remove(), 450);
  };
  window.__ripple = (el) => {
    const r = el.getBoundingClientRect();
    cur.classList.add("__down");
    setTimeout(() => cur.classList.remove("__down"), 160);
    for (const late of [false, true]) {
      const d = Object.assign(document.createElement("div"), { className: late ? "__ripple __late" : "__ripple" });
      Object.assign(d.style, { left: r.left + r.width / 2 + "px", top: r.top + r.height / 2 + "px" });
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1000);
    }
  };
};

// A minimal EIP-1193 wallet: the page asks, Node signs with the recording key.
const PROVIDER = () => {
  const listeners = {};
  window.ethereum = {
    request: ({ method, params }) => window.__eth(method, params ?? []).then((r) => {
      if (r && r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r.result;
    }),
    on: (e, f) => ((listeners[e] ??= []).push(f)),
    removeListener() {}
  };
};

// Headful: the explorer's bot check turns away headless Chrome.
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args: ["--window-size=1280,800"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "raw", size: { width: 1280, height: 720 } } });
await context.exposeFunction("__eth", async (method, params) => {
  try {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return { result: [wallet.address] };
    if (method === "eth_chainId") return { result: chainHex };
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return { result: null };
    if (method === "eth_sendTransaction") {
      const t = params[0];
      const tx = await retry(() => wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ?? 0, gasLimit: t.gas ?? t.gasLimit }));
      sent.push(tx.hash);
      log("sent", tx.hash);
      return { result: tx.hash };
    }
    return { result: await retry(() => rpc.send(method, params)) };
  } catch (e) {
    return { error: { message: e.shortMessage ?? e.message, code: e.code === "ACTION_REJECTED" ? 4001 : -32000 } };
  }
});
await context.addInitScript(PROVIDER);
const page = await context.newPage();
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const segs = [];
const log = (...a) => console.log(now().toFixed(1), ...a);

// The role badge outlives a navigation: setup puts it back.
let currentRole = "";
const setup = async () => {
  await page.evaluate(OVERLAY);
  await page.evaluate((r) => window.__setRole(r), currentRole);
};
const role = (t) => { currentRole = t; return page.evaluate((r) => window.__setRole(r), t); };
async function click(sel, label, { hold = 700, after = 500 } = {}) {
  const loc = typeof sel === "string" ? page.locator(sel).first() : sel;
  await loc.scrollIntoViewIfNeeded();
  await sleep(250);
  const h = await loc.elementHandle();
  await page.evaluate(([el, l]) => { window.__action(l); window.__ring = window.__point(el); }, [h, label]);
  await sleep(hold);
  await page.evaluate((el) => window.__ripple(el), h);
  await loc.click();
  await sleep(after);
  await page.evaluate(() => { window.__unpoint(window.__ring); window.__action(""); });
}
async function point(sel, label, ms = 2500) {
  const loc = page.locator(sel).first();
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  await sleep(700);
  const h = await loc.elementHandle();
  await page.evaluate(([el, l]) => { window.__action(l); window.__ring = window.__point(el); }, [h, label]);
  await sleep(ms);
  await page.evaluate(() => { window.__unpoint(window.__ring); window.__action(""); });
}
const bodyHas = (text, timeout = 60000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout }).then(() => true, () => false);
const count = (text) => page.evaluate((t) => document.querySelector("#eventFeed")?.innerText.split(t).length - 1, text);
const nav = (route, label) => click(`.nav [data-route="${route}"]`, label ?? route);
async function smoothScroll(px, steps = 20, ms = 60) {
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await sleep(ms); }
}
// Orders and poke need a mark younger than Tight Mandate's 10s limit. Send
// right after the oracle's next mark rather than late in its cycle. The Live
// Risk age tile follows the selected vault and re-renders on every refresh,
// hidden or not, so it is read whatever screen is showing. A small age may
// never show; the age read the moment the tile changes is the true one. A
// small age that holds for 1.5 s also counts: a chain that marks every block
// (the local one) shows the same "0s" on every refresh.
async function freshMark(maxAge = 3, timeout = 60000) {
  const limit = Math.max(maxAge, 4);
  await page.evaluate(() => { window.__lastAge = undefined; window.__ageSince = Date.now(); });
  const ok = await page.waitForFunction((m) => {
    const t = document.querySelector("#tileAge")?.textContent ?? "";
    const changed = window.__lastAge !== undefined && t !== window.__lastAge;
    if (t !== window.__lastAge) window.__ageSince = Date.now();
    const steady = Date.now() - window.__ageSince > 1500;
    window.__lastAge = t;
    const age = parseInt(t, 10);
    return (changed || steady) && Number.isFinite(age) && age <= m;
  }, limit, { timeout, polling: 100 }).then(() => true, () => false);
  if (!ok) log("no fresh mark within", timeout / 1000, "s");
}
const TIGHT = '.fund-card[aria-label="Open Tight Mandate"]';
async function scene(i, fn) {
  if (ONLY && !ONLY.includes(i)) return;
  const start = now();
  log("scene", i, "start");
  await fn();
  const need = dur[i] + 0.8;
  const spent = now() - start;
  if (spent < need) await sleep((need - spent) * 1000);
  segs.push({ i, start, end: now() });
  log("scene", i, "end", (now() - start).toFixed(1), "need", need.toFixed(1));
}

await page.goto(BASE);
await bodyHas(LABEL, 120000);
await sleep(4000);
await setup();
await page.mouse.move(640, 360);

// One vault's life, as in ../demo-video-plan.md: market, launch, allocate,
// agent orders, freeze and unwind, withdraw, mark age and explorer, Perpl.
await scene(0, async () => {
  await sleep(1200);
  await point("#leaderboard", "Vaults, each traded by an agent", 7000);
  await point("#chainLabel", "Monad testnet · 10143", 4000);
  await point(TIGHT, "Tight Mandate", 3000);
  await point(`${TIGHT} .fund-card-stats`, "Limits locked in the contract", 7000);
  await point(`${TIGHT} [data-cell="ring"]`, "Drawdown limit left", 6000);
  await point(`${TIGHT} [data-cell="state"]`, "May the agent trade?", 5000);
});

let launched = null;
await scene(1, async () => {
  await role("vault operator (browser wallet)");
  await click("#walletButton", "Connect");
  await click("#walletInjected", "Browser wallet");
  await bodyHas("connected from your wallet", 30000);
  await nav("launch", "Launch");
  await click('[data-preset="balanced"]', "Balanced preset");
  await smoothScroll(700, 25, 90);
  await sleep(600);
  await click("#launchButton", "createMandate()", { after: 300 });
  const ok = await bodyHas("is live with terms", 90000);
  launched = sent.at(-1);
  log("launch ok", ok, launched);
});

await scene(2, async () => {
  await role("allocator (demo account)");
  await click("#walletButton", "Switch account");
  await click("#walletDemo", "Demo allocator");
  await nav("market", "Market");
  await click(TIGHT, "Tight Mandate");
  await nav("allocate", "Allocate");
  await click('[data-amount="1000"]', "1,000 USDC");
  await click("#allocateButton", "Review allocation");
  await freshMark(2);
  await click("#signIntent", "approve() + allocate()");
  const ok = await bodyHas("Allocated", 60000);
  log("allocate ok", ok);
});

await scene(3, async () => {
  await role("agent (demo key)");
  await nav("risk", "Live Risk");
  const before = await count("REVERTED");
  await freshMark();
  await click("#compliantOrder", "Send order inside mandate");
  await page.waitForFunction(() => !document.querySelector("#compliantOrder")?.disabled, null, { timeout: 30000 }).catch(() => {});
  await sleep(1200);
  await freshMark();
  await click("#runViolation", "Send over-limit order");
  await page.waitForFunction((b) => (document.querySelector("#eventFeed")?.innerText.split("REVERTED").length - 1) > b, before, { timeout: 30000 }).catch(() => log("no revert seen"));
  await point("#eventFeed .feed-item", "Refused by the guard", 2200).catch(() => sleep(2200));
});

await scene(4, async () => {
  await role("anyone");
  await click('[data-shock="-200"]', "−2% shock");
  const over = await page.waitForFunction((sel) => document.querySelector(`${sel} [data-cell="state"]`)?.textContent.includes("OVER LIMIT"), TIGHT, { timeout: 45000, polling: 250 }).then(() => true, () => false);
  log("over", over);
  await sleep(600);
  await freshMark();
  await click("#pokeButton", "poke()");
  const frozen = await bodyHas("FROZEN", 60000);
  log("frozen", frozen);
  await sleep(1000);
  await role("agent (demo key)");
  await click("#compliantOrder", "Send order inside mandate");
  await bodyHas("AgentNotActive", 30000);
  await role("anyone");
  await freshMark();
  await click("#unwindButton", "unwind()");
  await page.waitForFunction(() => !document.querySelector("#unwindButton")?.disabled, null, { timeout: 30000 }).catch(() => {});
});

await scene(5, async () => {
  await role("allocator (demo account)");
  await nav("allocate", "Allocate");
  await freshMark(2);
  await click("#withdrawButton", "Withdraw all shares");
  await sleep(4000);
});

// The age tile first, then the poke's transaction on monadscan in the same tab
// so the recording stays one file.
await scene(6, async () => {
  await role("");
  await nav("risk", "Live Risk");
  await point("#tileAge", "Mark age vs 10 s limit", 3500);
  const link = page.locator("#eventFeed .feed-item", { hasText: /poke|frozen/i }).locator("time a").first();
  const any = page.locator("#eventFeed time a").first();
  const target = (await link.count()) ? link : (await any.count()) ? any : null;
  if (!target) return log("no explorer link: local chain");
  const href = await target.getAttribute("href");
  await click(target, "View on monadscan", { after: 0 }).catch(() => {});
  for (const p of context.pages()) if (p !== page) await p.close();
  if (!href) return log("no explorer link: local chain");
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await bodyHas("Success", 30000);
  await setup();
  await hideBanner();
  await point("text=Success", "Status: Success", 3500).catch(() => sleep(3500));
});
async function hideBanner() {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll("button, a")) {
      if (/^got it!?$/i.test(b.textContent.trim())) {
        let n = b;
        while (n.parentElement && getComputedStyle(n).position !== "fixed") n = n.parentElement;
        (n.parentElement ? n : b).style.display = "none";
      }
    }
  });
}

// The Perpl panel sits on Market. It reads the recorded runs; nothing is sent.
await scene(7, async () => {
  await page.goto(BASE);
  await bodyHas(LABEL, 60000);
  await setup();
  await nav("market", "Market");
  await page.locator("#perplPanel").evaluate((el) => el.scrollIntoView({ block: "start", behavior: "smooth" }));
  await sleep(1500);
  await point("#perplBody", "Perpl testnet: 20 filled, 9 refused", 4000).catch(() => sleep(4000));
});

const video = page.video();
await context.close();
await browser.close();
const out = `raw/take-${Date.now()}.webm`;
fs.renameSync(await video.path(), out);
fs.writeFileSync(process.env.SEGS || "segs.json", JSON.stringify({ video: out, segs, sent, launched }, null, 1));
log("saved", out);
