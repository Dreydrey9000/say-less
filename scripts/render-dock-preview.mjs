// Actual dock components, mocked recording events, and a simulated desktop.
// Run Vite on 1420, then: node scripts/render-dock-preview.mjs /abs/output.mp4
import { chromium } from "playwright";
import { mkdtemp, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const output = resolve(
  process.argv[2] ?? "docs/previews/dock-attached-rail.mp4",
);
await mkdir(dirname(output), { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "say-less-dock-preview-"));
const browser = await chromium.launch();
const studio = {
  accent: "#b8ff65",
  floating: true,
  dock_compact: true,
  dock_character: "emblem",
  dock_edge: "free",
  dock_motion: true,
};
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: temporary, size: { width: 1280, height: 720 } },
});
await context.addInitScript((settings) => {
  localStorage.setItem("test-studio", JSON.stringify(settings));
}, studio);
const page = await context.newPage();
const recordingStarted = Date.now();
const stage = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0d1016;color:#f3f5f7;font-family:system-ui,sans-serif}
header{position:absolute;left:64px;right:64px;top:42px;display:flex;align-items:end;justify-content:space-between}
h1{margin:0;font-size:34px;letter-spacing:-1px}header small{color:#a5b1c5;font-size:14px}
.eyebrow{color:#b8ff65;font-size:13px;letter-spacing:2px;margin-bottom:8px}
.screen{position:absolute;left:64px;top:152px;width:1152px;height:440px;border:1px solid #465065;border-radius:20px;overflow:hidden;background:radial-gradient(ellipse at 25% 100%,#3b4359,transparent 65%),linear-gradient(125deg,#1d2535,#101721)}
.screen-label{position:absolute;left:22px;top:18px;color:#8f9aaf;font-size:12px;letter-spacing:1px}
.work{position:absolute;left:380px;top:90px;width:410px;height:258px;border:1px solid #ffffff0c;border-radius:12px;background:#ffffff03}
.work:before{content:'';display:block;margin:34px;width:190px;height:6px;background:#ffffff0a;box-shadow:0 24px #ffffff06,0 48px #ffffff06}
iframe{position:absolute;left:350px;top:270px;width:104px;height:104px;border:0;transform:scale(1.4);transform-origin:top left;background:transparent}
.moving{transition:left 1.5s cubic-bezier(.2,.7,.3,1),top 1.5s cubic-bezier(.2,.7,.3,1)}
footer{position:absolute;left:64px;top:622px;right:64px;display:flex;align-items:start;justify-content:space-between}
#caption{font-size:22px;font-weight:600;letter-spacing:-.4px}#detail{font-size:14px;color:#aab4c5;margin-top:8px}
.step{color:#b8ff65;font-size:13px;letter-spacing:1px;padding-top:5px}
</style></head><body><header><div><div class='eyebrow'>SAY LESS</div><h1>A quieter floating dock.</h1></div><small>Interaction preview · actual dock UI</small></header><div class='screen'><span class='screen-label'>DESKTOP WORK AREA</span><div class='work'></div><iframe title='Say Less floating dock' src='http://127.0.0.1:1420/tests/fixtures/app.html?dock=1&events=1'></iframe></div><footer><div><div id='caption'></div><div id='detail'></div></div><div class='step' id='step'></div></footer></body></html>`;
await page.route("**/__dock_preview__", (route) =>
  route.fulfill({ contentType: "text/html; charset=utf-8", body: stage }),
);
await page.goto("http://127.0.0.1:1420/__dock_preview__");
const frame =
  page.frames().find((candidate) => candidate.url().includes("dock=1")) ??
  (await new Promise((resolveFrame) => {
    page.on("framenavigated", (candidate) => {
      if (candidate.url().includes("dock=1")) resolveFrame(candidate);
    });
  }));
await frame.getByRole("button", { name: "Expand dock" }).waitFor();
const lead = (Date.now() - recordingStarted) / 1000;
const pause = (ms) => page.waitForTimeout(ms);
async function caption(title, detail, number) {
  await page.evaluate(
    ({ title, detail, number }) => {
      document.querySelector("#caption").textContent = title;
      document.querySelector("#detail").textContent = detail;
      document.querySelector("#step").textContent = number;
    },
    { title, detail, number },
  );
}
async function position(x, y, width = 220, animate = false) {
  await page.evaluate(
    ({ x, y, width, animate }) => {
      const dock = document.querySelector("iframe");
      dock.classList.toggle("moving", animate);
      dock.style.left = `${x}px`;
      dock.style.top = `${y}px`;
      dock.style.width = `${width}px`;
    },
    { x, y, width, animate },
  );
}
async function edge(value) {
  await frame.evaluate(async (dock_edge) => {
    const settings = JSON.parse(localStorage.getItem("test-studio"));
    settings.dock_edge = dock_edge;
    localStorage.setItem("test-studio", JSON.stringify(settings));
    await window.testEmit("studio-changed", settings);
  }, value);
}
async function voice(value) {
  await frame.evaluate((state) => window.testEmit("dock-state", state), value);
}
await caption(
  "Only the emblem at rest.",
  "Click to expand. Drag the emblem itself to move it.",
  "01 / REST",
);
await page.mouse.move(20, 20);
await pause(1800);
await position(350, 270);
await frame.getByRole("button", { name: "Expand dock" }).hover();
await page.keyboard.press("Escape");
await caption(
  "One attached action rail.",
  "Screen and Hide share a clean, flat surface. No orbiting buttons.",
  "02 / CONTROLS",
);
await pause(2200);
await caption(
  "Move it toward a corner.",
  "On Mac, snapping happens when you release the drag.",
  "03 / DRAG",
);
await page.mouse.move(20, 20);
await position(994, 12, 104, true);
await pause(1700);
await edge("top_right");
await position(994, 12, 104);
await caption(
  "Snapped to the top-right corner.",
  "The controls open toward your screen, and the emblem stays put.",
  "04 / SNAP",
);
await pause(1100);
await position(832, 12, 220);
await frame.getByRole("button", { name: "Expand dock" }).hover();
await page.keyboard.press("Escape");
await pause(1800);
await voice("recording");
await frame.evaluate(() => window.testEmit("recording-ready", null));
await page.mouse.move(20, 20);
await caption(
  "The emblem becomes Listening.",
  "Stop joins the same surface while dictation is active.",
  "05 / LISTEN",
);
await pause(2200);
await voice("transcribing");
await caption(
  "A compact working state.",
  "The shape follows what Say Less is doing.",
  "06 / WORK",
);
await pause(1500);
await voice("idle");
await frame.getByRole("button", { name: "Expand dock" }).hover();
await frame.getByRole("button", { name: "Record screen", exact: true }).click();
await page.mouse.move(20, 20);
await caption(
  "Screen recording uses the same dock.",
  "One clear stop control stays visible.",
  "07 / RECORD",
);
await pause(1800);
await frame.getByRole("button", { name: "Stop screen recording" }).click();
await page.mouse.move(20, 20);
await caption(
  "Saved, with one useful next action.",
  "The folder button takes you to the finished video.",
  "08 / SAVED",
);
await pause(1700);
// Starting dictation clears Saved; returning to idle restores the emblem.
await voice("recording");
await voice("idle");
await edge("bottom");
await position(504, 282, 104, true);
await caption(
  "Corners or sides — your choice.",
  "Eight snap anchors, plus free placement anywhere else.",
  "09 / PLACE",
);
await pause(2000);
await position(504, 282, 220);
await frame.getByRole("button", { name: "Expand dock" }).hover();
await page.keyboard.press("Escape");
await pause(1000);
await page.mouse.move(20, 20);
await position(504, 282, 104);
await caption(
  "Back to one emblem.",
  "The rail tucks away when you leave it.",
  "10 / REST",
);
await pause(1800);
const video = page.video();
await context.close();
const webm = await video.path();
await browser.close();
execFileSync(
  "/opt/homebrew/bin/ffmpeg",
  [
    "-y",
    "-ss",
    String(lead),
    "-i",
    webm,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ],
  { stdio: "ignore" },
);
console.log(output);
