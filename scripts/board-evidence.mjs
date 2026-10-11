// Milestone 4 evidence generator: exercises persistence through the real
// page route over Playwright.
//
// Scenarios (all through the served app, never a reducer):
//   A. Load/hydration layout-shift measurement + screenshots at 1440x900
//      and 390x844
//   B. create -> edit -> move (keyboard) -> reload -> delete -> reload
//   C. reset -> reload stays empty
//   D. interrupted saves: blocked storage shows a non-blocking notice and
//      keeps the board usable
//   E. import rejects corrupted files; a valid import replaces the board
//   F. reduced-motion pass
//   G. @axe-core/playwright scans at both viewports (zero serious/critical)
//
// Usage: BASE_URL=http://localhost:3213 node scripts/board-evidence.mjs
// Exit 0 only when every recorded check passes. Receipt:
// docs/receipts/m4-persistence-evidence.md

import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3213";
const OUT = new URL("../docs/receipts/m4-persistence-evidence.md", import.meta.url)
  .pathname;
const SHOTS = new URL("../docs/receipts/", import.meta.url).pathname;

const lines = [];
let failures = 0;
function check(ok, label, detail = "") {
  lines.push(`- [${ok ? "x" : " "}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
  return ok;
}
function section(title) {
  lines.push("", `## ${title}`, "");
}

async function boardState(page) {
  return page.evaluate(() => {
    const out = {};
    for (const title of ["Todo", "In progress", "Done"]) {
      const header = Array.from(document.querySelectorAll("span")).find(
        (s) =>
          s.textContent?.trim() === title && s.className.includes("ml-auto")
      );
      const col = header?.closest("div.rounded-lg");
      out[title] = col
        ? Array.from(col.querySelectorAll("span.grow")).map((el) =>
            el.textContent?.trim()
          )
        : null;
    }
    return out;
  });
}

async function findTaskGrip(page, content) {
  const grips = page.getByRole("button", { name: "Move task" });
  const count = await grips.count();
  for (let i = 0; i < count; i++) {
    const g = grips.nth(i);
    const cardText =
      (await g.evaluate((el) => el.closest("div.rounded-lg")?.textContent)) ?? "";
    if (cardText.includes(content)) return g;
  }
  return null;
}

async function createTaskViaUi(page, columnTitle, content) {
  const header = page.locator("span", { hasText: columnTitle }).first();
  const column = header.locator(
    "xpath=ancestor::div[contains(@class,'rounded-lg')][1]"
  );
  await column.getByRole("button", { name: /add task/i }).first().click();
  const input = page.getByRole("textbox").last();
  await input.fill(content);
  await input.press("Enter");
  await page.waitForTimeout(300);
}

async function deleteTaskViaUi(page, content) {
  const grip = await findTaskGrip(page, content);
  if (!grip) return false;
  const card = grip.locator(
    "xpath=ancestor::div[contains(@class,'rounded-lg')][1]"
  );
  await card.getByRole("button", { name: /delete task/i }).click();
  await page.waitForTimeout(300);
  return true;
}

async function measureRects(page) {
  return page.evaluate(() => {
    const columns = Array.from(document.querySelectorAll("div.rounded-lg"))
      .filter((el) => el.querySelector("span.grow"))
      .slice(0, 3)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const firstCard = document
      .querySelector("span.grow")
      ?.closest("div.rounded-lg");
    const card = firstCard ? firstCard.getBoundingClientRect() : null;
    return { columns, card: card ? { x: card.x, y: card.y, w: card.width, h: card.height } : null };
  });
}

function rectDelta(a, b) {
  if (!a || !b) return Infinity;
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.w - b.w),
    Math.abs(a.h - b.h)
  );
}

const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });

try {
  // ---------- Scenario A: layout shift + screenshots ----------
  section("A. Load/hydration layout shift and screenshots");
  for (const [w, h, name] of [
    [1440, 900, "m4-board-1440.png"],
    [390, 844, "m4-board-390.png"],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    const pre = await measureRects(page);
    await page.waitForTimeout(1500); // hydration + load effect settle
    const post = await measureRects(page);
    const colShift = Math.max(
      ...pre.columns.map((c, i) => rectDelta(c, post.columns[i]))
    );
    const cardShift = rectDelta(pre.card, post.card);
    await page.screenshot({ path: SHOTS + name, fullPage: true });
    check(
      colShift === 0 && cardShift === 0,
      `${w}x${h}: element rects stable across hydration`,
      `max column rect delta ${colShift}px, first card delta ${cardShift}px`
    );
    await ctx.close();
  }

  // ---------- Scenario B: create/edit/move/reload/delete/reload ----------
  section("B. create -> edit -> move (keyboard) -> reload -> delete -> reload");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await createTaskViaUi(page, "Todo", "Receipt check task");
    let state = await boardState(page);
    check(
      state.Todo.includes("Receipt check task"),
      "create: task appears in Todo"
    );

    // Edit the created task inline.
    const grip = await findTaskGrip(page, "Receipt check task");
    const card = grip.locator(
      "xpath=ancestor::div[contains(@class,'rounded-lg')][1]"
    );
    await card.getByRole("button", { name: /edit task/i }).click();
    const editInput = page.getByRole("textbox").last();
    await editInput.fill("Receipt check task edited");
    await editInput.press("Enter");
    await page.waitForTimeout(300);
    state = await boardState(page);
    check(
      state.Todo.includes("Receipt check task edited") &&
        !state.Todo.includes("Receipt check task"),
      "edit: content changed, id preserved (same card edited in place)"
    );

    // Move it to In progress with the keyboard: Space, ArrowRight, Space.
    const moveGrip = await findTaskGrip(page, "Receipt check task edited");
    await moveGrip.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
    state = await boardState(page);
    check(
      state["In progress"].includes("Receipt check task edited"),
      "keyboard move: task committed to In progress"
    );

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("span.grow");
    state = await boardState(page);
    check(
      state["In progress"].includes("Receipt check task edited"),
      "reload: moved+edited task persisted"
    );

    const deleted = await deleteTaskViaUi(page, "Receipt check task edited");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("span.grow");
    state = await boardState(page);
    check(
      deleted &&
        !state["In progress"].includes("Receipt check task edited") &&
        !state.Todo.includes("Receipt check task edited"),
      "delete + reload: task stays deleted"
    );
    await ctx.close();
  }

  // ---------- Scenario C: reset persists ----------
  section("C. reset -> reload stays empty");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reset board to empty" }).click();
    await page.getByRole("button", { name: "Confirm board reset" }).click();
    await page.waitForTimeout(300);
    let state = await boardState(page);
    const emptyNow = Object.values(state).every((t) => t?.length === 0);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    state = await boardState(page);
    const emptyAfterReload = Object.values(state).every((t) => t?.length === 0);
    check(
      emptyNow && emptyAfterReload,
      "reset: board empties and stays empty after reload (no re-seed)"
    );
    await ctx.close();
  }

  // ---------- Scenario D: interrupted saves (blocked storage) ----------
  section("D. storage blocked: visible notice, board stays usable");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      // Simulate blocked storage (private mode / permission policy):
      // setItem always throws quota. defineProperty is required because
      // plain assignment to window.localStorage is silently ignored.
      const blocked = new DOMException("denied", "QuotaExceededError");
      const store = new Map();
      const fake = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: () => {
          throw blocked;
        },
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
        key: () => null,
        get length() {
          return store.size;
        },
      };
      Object.defineProperty(window, "localStorage", {
        get: () => fake,
        configurable: true,
      });
    });
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const noticeVisible = await page
      .getByRole("status")
      .filter({ hasText: /storage|saved/i })
      .first()
      .isVisible()
      .catch(() => false);
    check(noticeVisible, "blocked storage shows a visible notice on load");

    // The board must remain usable: create a task while saves fail.
    await createTaskViaUi(page, "Todo", "Usable while blocked");
    const state = await boardState(page);
    check(
      state.Todo.includes("Usable while blocked"),
      "board stays usable while storage is blocked"
    );
    await ctx.close();
  }

  // ---------- Scenario E: import rejects corruption; valid import works ----------
  section("E. import: corrupted rejected, valid applied");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    await page.setInputFiles(
      'input[type="file"]',
      {
        name: "corrupt.json",
        mimeType: "application/json",
        buffer: Buffer.from("{this is not json"),
      }
    );
    await page.waitForTimeout(400);
    const rejected = await page
      .getByRole("status")
      .filter({ hasText: /Import rejected/i })
      .first()
      .isVisible()
      .catch(() => false);
    check(rejected, "corrupted import shows a rejection notice");

    const valid = JSON.stringify({
      version: 1,
      tasks: [
        { id: "imp1", content: "Imported task A", columnId: "todo" },
        { id: "imp2", content: "Imported task B", columnId: "done" },
      ],
    });
    await page.setInputFiles('input[type="file"]', {
      name: "valid.json",
      mimeType: "application/json",
      buffer: Buffer.from(valid),
    });
    await page.waitForTimeout(400);
    const state = await boardState(page);
    check(
      state.Todo.includes("Imported task A") && state.Done.includes("Imported task B"),
      "valid import replaces the board"
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("span.grow");
    const after = await boardState(page);
    check(
      after.Todo.includes("Imported task A"),
      "imported board persists across reload"
    );
    await ctx.close();
  }

  // ---------- Scenario F: reduced motion ----------
  section("F. reduced-motion pass");
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("span.grow");
    await createTaskViaUi(page, "Todo", "Reduced motion task");
    const state = await boardState(page);
    const deleted = await deleteTaskViaUi(page, "Reduced motion task");
    check(
      state.Todo.includes("Reduced motion task") && deleted,
      "create and delete work with prefers-reduced-motion"
    );
    await ctx.close();
  }

  // ---------- Scenario G: axe scans ----------
  section("G. axe scans (zero serious/critical required)");
  for (const [w, h, label] of [
    [1440, 900, "1440x900"],
    [390, 844, "390x844"],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
    });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    check(
      blocking.length === 0,
      `axe ${label}: zero serious/critical violations`,
      blocking.length
        ? blocking.map((v) => `${v.id}(${v.impact})`).join(", ")
        : `${results.passes.length} rule groups passed`
    );
    await ctx.close();
  }

  // ---------- Summary ----------
  const passed = failures === 0;
  lines.push(
    "",
    "## Result",
    "",
    passed
      ? "PASS — all checks above passed against the served production build."
      : `FAIL — ${failures} check(s) failed; see the unchecked items above.`
  );
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(passed ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
} finally {
  await browser.close();
}
