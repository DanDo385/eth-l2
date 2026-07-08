import { test, expect, type Page } from "@playwright/test";
import { join } from "path";

const SCREENSHOT_DIR = join(__dirname, "../public/screenshots");

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

// ── Home chooser ───────────────────────────────────────────────────────────────

test.describe("Home chooser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1", { timeout: 10_000 });
  });

  test("renders lab chooser", async ({ page }) => {
    await shot(page, "01-home-chooser");
    await expect(page.locator("h1")).toContainText("Choose the security model");
    await expect(page.getByRole("link", { name: /Open optimistic lab/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open ZK lab/i })).toBeVisible();
  });
});

// ── Optimistic lab layout ────────────────────────────────────────────────────

test.describe("Optimistic lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/op");
    await page.waitForSelector("h1", { timeout: 10_000 });
  });

  test("renders optimistic header", async ({ page }) => {
    await shot(page, "02-op-lab");
    await expect(page.locator("h1")).toContainText("Optimistic Rollup Lab");
  });

  test("renders L1 and OP lanes", async ({ page }) => {
    await expect(page.getByText("L1 Mainnet", { exact: true })).toBeVisible();
    await expect(page.getByText("OP L2", { exact: true })).toBeVisible();
    await expect(page.getByText("ZK L2", { exact: true })).toHaveCount(0);
    await shot(page, "03-op-canvas-empty");
  });

  test("renders ControlPanel with seed and speed inputs", async ({ page }) => {
    await expect(page.locator('input[type="number"]')).toBeVisible();
    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Start simulation" })).toBeVisible();
  });

  test("renders DemoGallery with four seed cards", async ({ page }) => {
    await expect(page.getByText("Demo gallery", { exact: true })).toBeVisible();
    await expect(page.getByText("Mostly honest", { exact: true })).toBeVisible();
    await expect(page.getByText("Subtle fraud", { exact: true })).toBeVisible();
    await expect(page.getByText("Obvious fraud", { exact: true })).toBeVisible();
    await expect(page.getByText("Mixed", { exact: true })).toBeVisible();
  });

  test("renders Optimistic rollup lifecycle tracker (idle)", async ({ page }) => {
    await expect(page.getByText("Optimistic rollup lifecycle", { exact: true })).toBeVisible();
  });

  test("renders OP scoreboard", async ({ page }) => {
    const scoreboard = page.getByText("Scoreboard", { exact: true }).locator("..");
    await expect(scoreboard.getByText("OP: Optimistic")).toBeVisible();
    await shot(page, "05-op-scoreboard");
  });

  test("shows watcher flagged and fraud resolved metrics", async ({ page }) => {
    const scoreboard = page.getByText("Scoreboard", { exact: true }).locator("..");
    await expect(scoreboard.getByText("Watcher flagged")).toBeVisible();
    await expect(scoreboard.getByText("Fraud resolved on L1")).toBeVisible();
  });
});

// ── ZK lab layout ────────────────────────────────────────────────────────────

test.describe("ZK lab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/zk");
    await page.waitForSelector("h1", { timeout: 10_000 });
  });

  test("renders ZK header and pipeline", async ({ page }) => {
    await shot(page, "06-zk-lab");
    await expect(page.locator("h1")).toContainText("ZK Rollup Lab");
    await expect(page.getByText("Validity, not privacy or DA")).toBeVisible();
    await expect(page.getByText("Claim", { exact: true })).toBeVisible();
  });

  test("renders L1 and ZK lanes", async ({ page }) => {
    await expect(page.getByText("L1 Mainnet", { exact: true })).toBeVisible();
    await expect(page.getByText("ZK L2", { exact: true })).toBeVisible();
    await expect(page.getByText("OP L2", { exact: true })).toHaveCount(0);
  });
});

// ── ControlPanel interaction (OP lab) ────────────────────────────────────────

test.describe("ControlPanel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/op");
    await page.waitForSelector('input[type="number"]');
  });

  test("seed defaults to 42", async ({ page }) => {
    const input = page.locator('input[type="number"]');
    await expect(input).toHaveValue("42");
  });

  test("speed defaults to 3 (multiplier label visible)", async ({ page }) => {
    await expect(page.getByText("3×", { exact: true })).toBeVisible();
  });
});

// ── Responsive screenshots ───────────────────────────────────────────────────

test("mobile viewport — home chooser (375px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.waitForSelector("h1");
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "09-mobile-home-375px.png"),
    fullPage: true,
  });
});

test("mobile viewport — OP lab (375px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/op");
  await page.waitForSelector("h1");
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "10-mobile-op-375px.png"),
    fullPage: true,
  });
});

test("tablet viewport — ZK lab (768px)", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/zk");
  await page.waitForSelector("h1");
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "11-tablet-zk-768px.png"),
    fullPage: true,
  });
});
