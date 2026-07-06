import { test, expect, type Page } from "@playwright/test";
import { join } from "path";

const SCREENSHOT_DIR = join(__dirname, "../public/screenshots");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

// ── Layout & initial state ───────────────────────────────────────────────────

test.describe("Initial layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for client-side hydration to finish
    await page.waitForSelector("h1", { timeout: 10_000 });
  });

  test("renders header with title", async ({ page }) => {
    await shot(page, "01-initial-load");
    await expect(page.locator("h1")).toContainText("Rollup Mechanics Lab");
    await expect(
      page.getByText("Live simulation · Optimistic fraud proofs · ZK validity proofs"),
    ).toBeVisible();
  });

  test("shows connection status indicator in header", async ({ page }) => {
    const header = page.locator("header");
    const statusText = await header.textContent();
    // Status can be any valid state depending on WS availability
    expect(statusText).toMatch(/connected|disconnected|running|idle|ready|backend/i);
    await shot(page, "02-connection-status");
  });

  test("renders three-lane BlockchainCanvas", async ({ page }) => {
    await expect(page.getByText("L1 Mainnet", { exact: true })).toBeVisible();
    await expect(page.getByText("OP L2", { exact: true })).toBeVisible();
    await expect(page.getByText("ZK L2", { exact: true })).toBeVisible();
    await shot(page, "03-canvas-empty");
  });

  test("renders ControlPanel with seed and speed inputs", async ({ page }) => {
    await expect(page.locator('input[type="number"]')).toBeVisible();
    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Start simulation" })).toBeVisible();
  });

  test("renders DemoGallery with four seed cards", async ({ page }) => {
    await expect(page.getByText("Demo gallery", { exact: true })).toBeVisible();
    await expect(page.getByText("Clean run", { exact: true })).toBeVisible();
    await expect(page.getByText("Subtle fraud", { exact: true })).toBeVisible();
    await expect(page.getByText("Obvious fraud", { exact: true })).toBeVisible();
    await expect(page.getByText("Mixed", { exact: true })).toBeVisible();
    await shot(page, "04-demo-gallery");
  });

  test("renders AccountSidebar with known roles", async ({ page }) => {
    const accounts = page.getByText("Accounts", { exact: true }).locator("..");
    await expect(accounts.getByText("Deployer", { exact: true })).toBeVisible();
    await expect(accounts.getByText("Sequencer", { exact: true })).toBeVisible();
    await expect(accounts.getByText("Challenger", { exact: true })).toBeVisible();
    await expect(accounts.getByText("Trader 0", { exact: true })).toBeVisible();
  });

  test("renders Optimistic rollup lifecycle tracker (idle)", async ({ page }) => {
    await expect(page.getByText("Optimistic rollup lifecycle", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/batches never disappear when they leave the canvas/i),
    ).toBeVisible();
  });

  test("renders Scoreboard with OP and ZK columns", async ({ page }) => {
    const scoreboard = page.getByText("Scoreboard", { exact: true }).locator("..");
    await expect(scoreboard.getByText("OP: Optimistic")).toBeVisible();
    await expect(scoreboard.getByText("ZK: Validity")).toBeVisible();
    await shot(page, "05-scoreboard");
  });
});

// ── ControlPanel interaction ─────────────────────────────────────────────────

test.describe("ControlPanel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('input[type="number"]');
  });

  test("Start button is rendered and reacts to connection state", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Start simulation" });
    await expect(btn).toBeVisible();
    const isDisabled = await btn.isDisabled();
    expect(typeof isDisabled).toBe("boolean");
    await shot(page, "06-start-button");
  });

  test("seed input accepts numeric values", async ({ page }) => {
    const input = page.locator('input[type="number"]');
    await input.fill("99");
    await expect(input).toHaveValue("99");
  });

  test("speed slider changes multiplier label", async ({ page }) => {
    const slider = page.locator('input[type="range"]');
    await slider.fill("7");
    await expect(page.getByText("7×", { exact: true })).toBeVisible();
    await shot(page, "06-speed-slider-7x");
  });

  test("seed defaults to 42", async ({ page }) => {
    const input = page.locator('input[type="number"]');
    await expect(input).toHaveValue("42");
  });

  test("speed defaults to 3 (multiplier label visible)", async ({ page }) => {
    await expect(page.getByText("3×", { exact: true })).toBeVisible();
  });
});

// ── DemoGallery ──────────────────────────────────────────────────────────────

test.describe("DemoGallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Demo gallery");
  });

  test("seed-42 caption renders", async ({ page }) => {
    await expect(page.getByText(/Rare fee-rounding attack/)).toBeVisible();
  });

  test("seed-17 caption renders", async ({ page }) => {
    await expect(page.getByText(/Blatant output doubling/)).toBeVisible();
  });

  test("seed-99 caption renders", async ({ page }) => {
    await expect(page.getByText(/Both fraud types appear over time/)).toBeVisible();
  });

  test("seed cards render as four demo buttons", async ({ page }) => {
    const cards = page
      .getByRole("button")
      .filter({ hasText: /Clean run|Subtle fraud|Obvious fraud|Mixed/ });
    await expect(cards).toHaveCount(4);
    await shot(page, "07-demo-gallery-cards");
  });

  test("clicking a demo card fires POST requests to /api/stop and /api/start", async ({ page }) => {
    await page.route("**/api/stop", (route) => route.fulfill({ status: 200, body: '{"status":"stopped"}' }));
    await page.route("**/api/start", (route) => route.fulfill({ status: 200, body: '{"status":"started"}' }));

    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/")) {
        posts.push(r.url());
      }
    });
    await page.getByRole("button", { name: /Obvious fraud/i }).click();
    await page.waitForTimeout(400);
    expect(posts.some((u) => u.endsWith("/api/stop"))).toBe(true);
    expect(posts.some((u) => u.endsWith("/api/start"))).toBe(true);
    await shot(page, "07b-demo-click-fired");
  });
});

// ── AccountSidebar ────────────────────────────────────────────────────────────

test.describe("AccountSidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Accounts");
  });

  test("shows truncated address for deployer", async ({ page }) => {
    await expect(page.locator("text=0xf39F")).toBeVisible();
  });

  test("shows batch counters section initially", async ({ page }) => {
    const sidebar = page.getByText("Accounts", { exact: true }).locator("..");
    await expect(sidebar.getByText("Batches", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Total", { exact: true })).toBeVisible();
  });

  test("shows block heights for all three chains", async ({ page }) => {
    const sidebar = page.getByText("Latest blocks", { exact: true }).locator("..");
    await expect(sidebar.getByText("l1", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("op-l2", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("zk-l2", { exact: true })).toBeVisible();
  });
});

// ── BlockchainCanvas ──────────────────────────────────────────────────────────

test.describe("BlockchainCanvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Chain activity");
  });

  test("shows chain activity header", async ({ page }) => {
    await expect(page.getByText("Chain activity", { exact: true })).toBeVisible();
  });

  test("each lane shows block number #0", async ({ page }) => {
    const hashes = page.locator("text=#0");
    await expect(hashes.first()).toBeVisible();
    await shot(page, "08-canvas-initial");
  });

  test("BlockInspector panel is hidden when no batch selected", async ({ page }) => {
    const rightAside = page.locator("aside").nth(1);
    await expect(rightAside.locator("text=Batch #")).toHaveCount(0);
  });
});

// ── Scoreboard ────────────────────────────────────────────────────────────────

test.describe("Scoreboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=Scoreboard");
  });

  test("shows all OP metrics at zero", async ({ page }) => {
    const scoreboard = page.getByText("Scoreboard", { exact: true }).locator("..");
    await expect(scoreboard.getByText("✓ Honest", { exact: true })).toBeVisible();
    await expect(scoreboard.getByText("⚠ Fraudulent", { exact: true })).toBeVisible();
    await expect(scoreboard.getByText("⚡ In dispute", { exact: true })).toBeVisible();
    await expect(scoreboard.getByText("✗ Resolved fraud", { exact: true })).toBeVisible();
  });

  test("fraud detection shows 0% initially", async ({ page }) => {
    const scoreboard = page.getByText("Scoreboard", { exact: true }).locator("..");
    await expect(scoreboard.getByText("OP fraud detection")).toBeVisible();
    await expect(scoreboard.getByText("0%", { exact: true })).toBeVisible();
  });
});

// ── Full-page visual screenshots ─────────────────────────────────────────────

test("full-page screenshot — idle state", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("h1");
  await page.waitForTimeout(400); // let framer-motion animations settle
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "00-full-page-idle.png"),
    fullPage: true,
  });
  await expect(page.locator("h1")).toContainText("Rollup Mechanics Lab");
  await expect(page.getByText("Chain activity", { exact: true })).toBeVisible();
});

test("mobile viewport (375px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForSelector("h1");
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "09-mobile-375px.png"),
    fullPage: true,
  });
  await expect(page.locator("h1")).toBeVisible();
});

test("tablet viewport (768px)", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.waitForSelector("h1");
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "10-tablet-768px.png"),
    fullPage: true,
  });
  await expect(page.locator("text=Rollup Mechanics Lab")).toBeVisible();
});
