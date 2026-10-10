// Milestone 3 keyboard walkthrough receipt generator.
// Drives the real page over Playwright: picks a task up with the keyboard,
// moves it within and across columns, commits a drop, then cancels a second
// drag and asserts the board returns exactly to its pre-drag state.
// Records every key press, board change, and screen-reader announcement.
//
// Usage: BASE_URL=http://localhost:3000 node scripts/keyboard-walkthrough.mjs
// Exit code 0 = all assertions passed; receipt written to
// docs/receipts/m3-keyboard-walkthrough.md

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../docs/receipts/m3-keyboard-walkthrough.md", import.meta.url)
  .pathname;
const CARD = "Build contact us page";

const lines = [];
function log(...parts) {
  lines.push(parts.join(" "));
  console.log(...parts);
}

async function columnOrder(page, title) {
  return page.evaluate((title) => {
    const spans = Array.from(document.querySelectorAll("span"));
    const header = spans.find(
      (s) => s.textContent?.trim() === title && s.className.includes("ml-auto")
    );
    const col = header?.closest("div.rounded-lg");
    if (!col) return null;
    return Array.from(col.querySelectorAll("span.grow")).map((el) =>
      el.textContent?.trim()
    );
  }, title);
}

async function boardSnapshot(page) {
  const titles = ["Todo", "In progress", "Done"];
  const board = {};
  for (const t of titles) board[t] = await columnOrder(page, t);
  return board;
}

async function announcement(page) {
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const regions = Array.from(
      document.querySelectorAll('[aria-live="assertive"]')
    );
    const text = regions.map((r) => r.textContent?.trim()).find(Boolean);
    return text ?? "(no announcement)";
  });
}

function boardEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForSelector("span.grow");
  log(`# Milestone 3 keyboard walkthrough receipt`);
  log("");
  log(`- Date: ${new Date().toISOString()}`);
  log(`- Page: ${BASE_URL}`);
  log(`- Viewport: 1440x900, Chromium headless`);
  log(`- Dragged card: "${CARD}"`);
  log("");

  // Focus the dragged card's move handle.
  const grips = page.getByRole("button", { name: "Move task" });
  const gripCount = await grips.count();
  let handle = null;
  for (let i = 0; i < gripCount; i++) {
    const g = grips.nth(i);
    const cardText =
      (await g.evaluate((el) => el.closest("div.rounded-lg")?.textContent)) ?? "";
    if (cardText.includes(CARD)) {
      handle = g;
      break;
    }
  }
  if (!handle) throw new Error(`move handle for "${CARD}" not found`);

  await handle.focus();
  const before = await boardSnapshot(page);
  log(`## Step 0 — initial board`);
  log("```json");
  log(JSON.stringify(before, null, 2));
  log("```");

  // Step 1: pick up.
  await page.keyboard.press("Space");
  log("");
  log(`## Step 1 — press Space (pick up)`);
  log(`- Announced: "${await announcement(page)}"`);

  // Step 2: move within the column.
  await page.keyboard.press("ArrowDown");
  log("");
  log(`## Step 2 — press ArrowDown (move within Todo)`);
  log(`- Announced: "${await announcement(page)}"`);
  log(`- Board after: ${JSON.stringify((await boardSnapshot(page)).Todo)}`);

  // Step 3: move across to the next column (working copy during drag).
  await page.keyboard.press("ArrowRight");
  log("");
  log(`## Step 3 — press ArrowRight (move over the In progress column)`);
  log(`- Announced: "${await announcement(page)}"`);
  log(`- Board after: ${JSON.stringify(await boardSnapshot(page))}`);

  // Step 4: drop (commit).
  await page.keyboard.press("Space");
  log("");
  log(`## Step 4 — press Space (drop: commit the move)`);
  log(`- Announced: "${await announcement(page)}"`);
  const afterDrop = await boardSnapshot(page);
  log(`- Board after: ${JSON.stringify(afterDrop)}`);
  if (boardEquals(afterDrop, before)) {
    throw new Error("drop did not move the task");
  }
  log(`- Check: committed state differs from pre-drag state ✓`);

  // Step 5: pick up again, move over another column, then cancel.
  log("");
  log(`## Step 5 — press Space, ArrowRight (over Done), Escape (cancel)`);
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const midDrag = await boardSnapshot(page);
  log(`- Board mid-drag (working copy): ${JSON.stringify(midDrag)}`);
  if (boardEquals(midDrag, afterDrop)) {
    throw new Error(
      "no intermediate movement during drag; cancel scenario not exercised"
    );
  }
  log(`- Check: drag produced intermediate movement to discard ✓`);
  await page.keyboard.press("Escape");
  const cancelAnnouncement = await announcement(page);
  log(`- Announced: "${cancelAnnouncement}"`);
  const afterCancel = await boardSnapshot(page);
  log(`- Board after cancel: ${JSON.stringify(afterCancel)}`);

  const restored = boardEquals(afterCancel, afterDrop);
  if (!restored) {
    log(`- Check: board restored to pre-drag state ✗ (MISMATCH)`);
    throw new Error(
      `cancelled drag did not restore pre-drag state\nexpected: ${JSON.stringify(
        afterDrop
      )}\nactual:   ${JSON.stringify(afterCancel)}`
    );
  }
  log(`- Check: board restored to the exact pre-drag state ✓`);

  log("");
  log(`## Result`);
  log("");
  log(
    `PASS — keyboard pickup, within-column move, cross-column move, drop-commit, and cancel-restore all behaved as recorded above. The cancelled drag restored the exact pre-drag board state and was announced as "${cancelAnnouncement}".`
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`\nReceipt written to ${OUT}`);
} finally {
  await browser.close();
}
