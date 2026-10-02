import { chromium } from "@playwright/test";
import { readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";

const label = process.argv[2];
const output = process.argv[3];
if (!label || !output) throw new Error("Usage: probe <label> <output.json>");
const origin = process.argv[4] ?? "http://127.0.0.1:4190";
const count = Number(process.argv[5] ?? 20);
const samples = [];
const browser = await chromium.launch();
for (let i = 0; i < count; i++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    const studio = {
      accent: "#b8ff65",
      floating: true,
      actions_enabled: false,
      actions: [],
      default_style: "original",
      app_styles: [],
      cleanup_on_dictation: false,
      dock_animation: "orbit",
      dock_motion: true,
      dock_cycle: false,
      dock_edge: "free",
      dock_compact: true,
      dock_character: "emblem",
      learn_corrections: false,
      corrections: [],
      overlay_visual: "bars",
      voice_recording: true,
      avatar: {
        kind: "person",
        body: "#e2b48f",
        accent: "#8796ab",
        background: "#22262e",
        accessory: "none",
      },
    };
    localStorage.setItem("test-studio", JSON.stringify(studio));
    const check = () => {
      if (document.querySelector(".compact-companion:not([disabled])")) {
        (window as unknown as { dockReadyAt: number }).dockReadyAt =
          performance.now();
      } else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  await page.goto(`${origin}/tests/fixtures/app.html?dock=1`, {
    waitUntil: "load",
  });
  await page.waitForFunction(() =>
    Boolean((window as unknown as { dockReadyAt?: number }).dockReadyAt),
  );
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const paint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    return {
      readyMs: (window as unknown as { dockReadyAt: number }).dockReadyAt,
      fcpMs: paint?.startTime ?? null,
      dclMs: navigation.domContentLoadedEventEnd,
    };
  });
  samples.push(metrics);
  await context.close();
}
await browser.close();
const files = (await readdir("dist/assets")).filter((name) =>
  name.endsWith(".js"),
);
const assets = await Promise.all(
  files.map(async (name) => {
    const path = join("dist/assets", name);
    const bytes = (await stat(path)).size;
    return { name, bytes, gzipBytes: gzipSync(await readFile(path)).length };
  }),
);
const values = samples.map((sample) => sample.readyMs).sort((a, b) => a - b);
const report = {
  app: "Say Less compact dock",
  label,
  n: samples.length,
  readyMedianMs: values[Math.floor(values.length / 2)],
  readyP95Ms: values[Math.floor(values.length * 0.95)],
  samples,
  assets,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      label,
      n: report.n,
      readyMedianMs: report.readyMedianMs,
      readyP95Ms: report.readyP95Ms,
      biggestAssets: assets
        .sort((a, b) => b.gzipBytes - a.gzipBytes)
        .slice(0, 3),
    },
    null,
    2,
  ),
);
