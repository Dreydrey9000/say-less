/* Say Less Studio: five views over the local bridge API, in the Higgsfield-class
   studio layout. Vanilla JS, no build step. Text from the network is only ever
   set with textContent, never innerHTML. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2), v);
      else if (k === "html")
        el.innerHTML = v; // static icon markup only
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const ICONS = {
    image:
      '<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
    create:
      '<path d="M10.5 4.5 12.4 10l5.5 1.9-5.5 1.9-1.9 5.5-1.9-5.5L3.1 11.9 8.6 10z"/><path d="M18.5 3.5v4M16.5 5.5h4"/>',
    title: '<path d="M4 6h16v12H4z"/><path d="M9 10h6M12 10v5"/>',
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
    screen:
      '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><circle cx="12" cy="12" r="3"/>',
    library:
      '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
    folder:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    folderplus:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v5M9.5 12.5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    cloud:
      '<path d="M7 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1-.5 8.5z"/>',
    refresh:
      '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    wide: '<rect x="3" y="7" width="18" height="10" rx="2"/>',
    tall: '<rect x="7" y="3" width="10" height="18" rx="2"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
  };
  function icon(name) {
    return h("span", {
      style: "display:inline-flex",
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`,
    });
  }
  const svgOf = (name) => icon(name).firstChild;

  function store(key, value) {
    try {
      if (value === undefined)
        return JSON.parse(localStorage.getItem("sl." + key) || "null");
      localStorage.setItem("sl." + key, JSON.stringify(value));
    } catch (e) {
      /* storage can be blocked; the app still works */
    }
    return null;
  }

  async function api(path, opts, jobView) {
    const res = await fetch(path, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* non-JSON error body */
    }
    // A job that failed is still a good answer: its view carries the reason in `error`.
    if (jobView && res.ok && data.status) return data;
    if (!res.ok || data.error)
      throw new Error(data.error || `The bridge answered ${res.status}.`);
    return data;
  }
  const post = (path, body) =>
    api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  const upload = (path, file) =>
    api(path, {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Filename": encodeURIComponent(file.name || "drop.png"),
      },
    });

  // ----------------------------------------------------- native shell bridge
  const native = (() => {
    const pending = new Map();
    let n = 0;
    const has = !!(
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.sayless
    );
    window.__saylessNative = (id, res) => {
      const p = pending.get(id);
      if (p) {
        pending.delete(id);
        p(res);
      }
    };
    function call(action, params) {
      return new Promise((resolve) => {
        if (!has) return resolve({ ok: false, error: "not-in-app" });
        const id = String(++n);
        pending.set(id, resolve);
        window.webkit.messageHandlers.sayless.postMessage({
          id,
          action,
          ...(params || {}),
        });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve({ ok: false, error: "The app did not answer." });
          }
        }, 30000);
      });
    }
    return { has, call };
  })();

  let toastTimer = 0;
  function toast(message, kind, onClick) {
    const t = h(
      "div",
      {
        class: "toast" + (kind === "bad" ? " bad" : ""),
        style: onClick ? "pointer-events:auto;cursor:pointer" : "",
        onclick: onClick
          ? () => {
              t.remove();
              onClick();
            }
          : null,
      },
      kind === "bad" ? icon("alert") : icon("check"),
      message,
    );
    $("#toasts").replaceChildren(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => t.remove(),
      onClick ? 9000 : kind === "bad" ? 5200 : 1900,
    );
  }

  async function copyText(text, okMessage) {
    let ok = false;
    if (native.has) ok = (await native.call("copy", { text })).ok;
    if (!ok) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        const ta = h("textarea", { style: "position:fixed;opacity:0" });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        try {
          ok = document.execCommand("copy");
        } catch (e2) {
          ok = false;
        }
        ta.remove();
      }
    }
    toast(
      ok
        ? okMessage || "Copied"
        : "Could not copy. Select the text and press Command C.",
      ok ? "ok" : "bad",
    );
    return ok;
  }
  async function copyImage(path) {
    try {
      const r = await post("/api/copy-image", { path });
      toast(
        r.ok
          ? "Image copied. Paste it anywhere."
          : "Could not copy that image.",
        r.ok ? "ok" : "bad",
      );
    } catch (e) {
      toast(e.message, "bad");
    }
  }
  async function reveal(path) {
    if (native.has) {
      const r = await native.call("reveal", { path });
      if (!r.ok) toast(r.error || "Could not open Finder.", "bad");
      return;
    }
    try {
      await post("/api/reveal", { path });
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  const mediaUrl = (p) => "/media?path=" + encodeURIComponent(p);
  const thumbUrl = (p, w, v) =>
    "/thumb?w=" +
    (w || 480) +
    "&path=" +
    encodeURIComponent(p) +
    (v ? "&v=" + v : "");
  function fmtBytes(n) {
    if (!n) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0,
      v = n;
    while (v >= 1024 && i < 3) {
      v /= 1024;
      i++;
    }
    return (i > 1 ? v.toFixed(1) : Math.round(v)) + " " + u[i];
  }
  function fmtDur(s) {
    if (!s && s !== 0) return "";
    const m = Math.floor(s / 60),
      sec = Math.round(s % 60);
    return m >= 60
      ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    return isNaN(d)
      ? ""
      : d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
  }
  function prettyName(n) {
    const m = /(\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})\.(\d{2})/.exec(n);
    if (!m) return n.replace(/^Say Less /, "").replace(/\.mp4$/i, "");
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function pollJob(id, onUpdate) {
    let stopped = false;
    (async function tick() {
      if (stopped) return;
      try {
        const job = await api("/api/jobs/" + id, undefined, true);
        onUpdate(job);
        if (job.status === "running") setTimeout(tick, 1200);
      } catch (e) {
        onUpdate({ status: "error", error: e.message, elapsed: 0 });
      }
    })();
    return () => {
      stopped = true;
    };
  }

  // ------------------------------------------------- instant paint, then refresh
  // Show what we already know from last time, fetch the truth, repaint only if it changed.
  function swr(key, url, paint) {
    const cached = store("swr." + key);
    if (cached) paint(cached);
    return api(url)
      .then((fresh) => {
        if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
          store("swr." + key, fresh);
          paint(fresh);
        }
        return fresh;
      })
      .catch((e) => {
        if (!cached) throw e;
        return cached;
      });
  }

  // ------------------------------------------- background jobs that outlive a view
  // A painting or a title run keeps going when you switch tabs. The pill shows it;
  // a toast tells you when it lands, with a way back.
  const viewHooks = {};
  const tracker = { jobs: new Map(), timer: 0 };
  // Seconds a running job has been going, from OUR clock: the number keeps ticking even
  // while the bridge is too busy to answer a poll.
  function secs(job) {
    if (job && job.status === "running" && job._t0) return Math.max(0, (Date.now() - job._t0) / 1000);
    return (job && job.elapsed) || 0;
  }
  // The seconds counter belongs to the screen, not to the network: one timer rewrites every
  // running counter from the local clock, so it moves even when the bridge is too busy to answer.
  setInterval(() => {
    for (const el of document.querySelectorAll(".time[data-t0]")) {
      const t0 = Number(el.dataset.t0);
      if (t0) el.textContent = `${Math.max(0, Math.round((Date.now() - t0) / 1000))} s`;
    }
  }, 500);
  function trackJob(job, view, apply) {
    job._t0 = Date.now() - (job.elapsed || 0) * 1000;
    tracker.jobs.set(job.id, { job, view, apply, fails: 0, last: 0 });
    paintPill();
    if (!tracker.timer) tracker.timer = setInterval(tickJobs, 1000);
  }
  // One poll in flight at a time. A slow bridge must never be answered with a pile of requests.
  async function tickJobs() {
    if (tracker.busy) {
      paintPill();
      return;
    }
    tracker.busy = true;
    try {
      for (const [id, t] of [...tracker.jobs]) {
        if (Date.now() - t.last < 2000) {
          t.apply(t.job); // keep the clock moving between polls
          continue;
        }
        t.last = Date.now();
        try {
          const job = await api("/api/jobs/" + id);
          job._t0 = t.job._t0;
          t.job = job;
          t.fails = 0;
          t.apply(job);
          if (job.status !== "running") {
            tracker.jobs.delete(id);
            if (current !== t.view)
              toast(
                job.status === "done"
                  ? (t.view === "image"
                      ? "Your image is ready"
                      : t.view === "titles"
                        ? "Your titles are ready"
                        : "Done") + ". Click to open."
                  : "That did not finish. Click to see why.",
                job.status === "done" ? "ok" : "bad",
                () => {
                  location.hash = "#/" + t.view;
                },
              );
          }
        } catch (e) {
          // A slow answer is not a failed job. Give up only after a long run of misses.
          if (++t.fails >= 40) {
            t.apply({ id, status: "error", error: "The bridge stopped answering. " + e.message });
            tracker.jobs.delete(id);
          }
        }
        if (current === t.view && viewHooks[t.view]) viewHooks[t.view]();
      }
    } finally {
      tracker.busy = false;
    }
    paintPill();
    if (!tracker.jobs.size) {
      clearInterval(tracker.timer);
      tracker.timer = 0;
    }
  }
  function paintPill() {
    const pill = $("#pill");
    if (!pill) return;
    const away = [...tracker.jobs.values()].filter((t) => t.view !== current);
    pill.replaceChildren(
      ...away.map((t) =>
        h(
          "button",
          {
            class: "pill-item",
            onclick: () => {
              location.hash = "#/" + t.view;
            },
          },
          h("span", { class: "pulse" }),
          t.view === "image"
            ? "Painting"
            : t.view === "titles"
              ? "Reading screen"
              : "Working",
          " · ",
          `${Math.round(secs(t.job))} s`,
        ),
      ),
    );
  }

  // --------------------------------------------------------------- overlays
  function closeOverlay() {
    $("#overlay").replaceChildren();
    document.removeEventListener("keydown", escClose);
  }
  function escClose(e) {
    if (e.key === "Escape") closeOverlay();
  }
  function openOverlay(node) {
    const scrim = h(
      "div",
      {
        class: "scrim",
        onclick: (e) => {
          if (e.target === scrim) closeOverlay();
        },
      },
      node,
    );
    $("#overlay").replaceChildren(
      scrim,
      h(
        "button",
        { class: "btn close", onclick: closeOverlay, "aria-label": "Close" },
        icon("x"),
        "Close",
      ),
    );
    document.addEventListener("keydown", escClose);
  }

  // popover menus (painter, shape, +, mentions)
  let popClose = null;
  function closePop() {
    if (popClose) {
      popClose();
      popClose = null;
    }
  }
  function openPop(host, anchor, items, opts) {
    closePop();
    const pop = h("div", { class: "pop", role: "menu" });
    const btns = [];
    for (const it of items) {
      if (it.head) {
        pop.append(h("div", { class: "head" }, it.head));
        continue;
      }
      const b = h(
        "button",
        {
          role: "menuitem",
          "aria-selected": "false",
          onclick: (e) => {
            e.stopPropagation();
            closePop();
            it.onSelect();
          },
        },
        it.img
          ? h("img", { src: it.img, alt: "" })
          : it.icon
            ? icon(it.icon)
            : null,
        it.label,
        it.checked && h("span", { class: "check" }, icon("check")),
      );
      btns.push(b);
      pop.append(b);
    }
    host.append(pop);
    const hr = host.getBoundingClientRect(),
      ar = anchor.getBoundingClientRect();
    pop.style.left =
      Math.max(0, Math.min(ar.left - hr.left, hr.width - 240)) + "px";
    if (opts && opts.up) pop.style.bottom = hr.bottom - ar.top + 8 + "px";
    else pop.style.top = ar.bottom - hr.top + 8 + "px";
    const outside = (e) => {
      if (!pop.contains(e.target)) closePop();
    };
    setTimeout(() => document.addEventListener("click", outside), 0);
    const keys = (e) => {
      if (e.key === "Escape") closePop();
    };
    document.addEventListener("keydown", keys);
    popClose = () => {
      pop.remove();
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", keys);
    };
    return { pop, btns };
  }

  function lightbox(item) {
    openOverlay(
      h(
        "div",
        { class: "sheet" },
        h(
          "div",
          { class: "big-pic" },
          h("img", {
            src: mediaUrl(item.path),
            alt: item.title || item.prompt || item.name || "Image",
          }),
        ),
        h(
          "aside",
          {},
          h("div", { class: "label" }, fmtWhen(item.ts) || "Image"),
          item.title && h("h2", { class: "selectable", style: "margin:4px 0 8px" }, item.title),
          item.summary && h("p", { class: "selectable" }, item.summary),
          item.tags && item.tags.length
            ? h("div", { class: "row", style: "gap:6px;flex-wrap:wrap" }, item.tags.map((t) => h("span", { class: "chip" }, t)))
            : null,
          item.prompt
            ? h("div", { class: "label", style: "margin-top:14px" }, "What you asked for")
            : null,
          item.prompt
            ? h("p", { class: "selectable" }, item.prompt)
            : h("p", { class: "dim" }, "No prompt saved for this one."),
          h(
            "div",
            { class: "row" },
            item.cloud &&
              h("span", { class: "chip ok" }, icon("check"), "In the cloud"),
            item.w &&
              h("span", { class: "chip mono" }, `${item.w} × ${item.h}`),
          ),
          item.prompt &&
            h(
              "button",
              {
                class: "btn lime",
                onclick: () => {
                  closeOverlay();
                  recreate(item.prompt);
                },
              },
              icon("refresh"),
              "Recreate",
            ),
          h(
            "button",
            { class: "btn", onclick: () => copyImage(item.path) },
            icon("copy"),
            "Copy image",
          ),
          item.prompt &&
            h(
              "button",
              {
                class: "btn",
                onclick: () => copyText(item.prompt, "Prompt copied"),
              },
              icon("copy"),
              "Copy prompt",
            ),
          h(
            "button",
            {
              class: "btn",
              onclick: () => {
                closeOverlay();
                addToTray(item.path);
                location.hash = "#/image";
                render();
              },
            },
            icon("plus"),
            "Use as reference",
          ),
          h(
            "button",
            { class: "btn", onclick: () => reveal(item.path) },
            icon("folder"),
            "Show in Finder",
          ),
          item.url &&
            h(
              "button",
              {
                class: "btn",
                onclick: () => copyText(item.url, "Link copied"),
              },
              icon("link"),
              "Copy cloud link",
            ),
        ),
      ),
    );
  }

  // -------------------------------------------------------------- routing
  const VIEWS = [
    { id: "image", label: "Create", icon: "create", key: "1" },
    { id: "titles", label: "Titles", icon: "title", key: "2" },
    { id: "recordings", label: "Videos", icon: "film", key: "3" },
    { id: "screens", label: "Screens", icon: "screen", key: "4" },
    { id: "library", label: "Library", icon: "library", key: "5" },
  ];
  let current = "image";
  const stops = [];
  function routeFromHash() {
    const id = (location.hash.replace(/^#\/?/, "") || "image").split("?")[0];
    return VIEWS.some((v) => v.id === id) ? id : "image";
  }
  function renderNav() {
    $("#nav").replaceChildren(
      ...VIEWS.map((v) =>
        h(
          "button",
          {
            class: "nav",
            title: `${v.label} (⌘${v.key})`,
            "aria-label": v.label,
            "aria-current": v.id === current ? "page" : null,
            onclick: () => {
              location.hash = "#/" + v.id;
            },
          },
          icon(v.icon),
          h("span", { class: "l" }, v.label),
        ),
      ),
    );
  }
  async function render() {
    closePop();
    stops.splice(0).forEach((f) => f());
    current = routeFromHash();
    renderNav();
    const scroller = $("#main");
    const loading = h(
      "div",
      { class: "page" },
      h("p", { class: "hint", style: "padding-top:40px" }, "Loading…"),
    );
    const host = h("div");
    scroller.replaceChildren(loading, host);
    scroller.scrollTop = 0;
    new MutationObserver((_, ob) => {
      if (host.childNodes.length) {
        loading.remove();
        ob.disconnect();
      }
    }).observe(host, { childList: true });
    document.title =
      "Say Less Studio · " + VIEWS.find((v) => v.id === current).label;
    await {
      image: viewImage,
      titles: viewTitles,
      recordings: viewRecordings,
      screens: viewScreens,
      library: viewLibrary,
    }[current](host);
    loading.remove();
  }
  window.addEventListener("hashchange", render);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
      e.preventDefault();
      location.hash = "#/" + VIEWS[Number(e.key) - 1].id;
    }
  });

  function pageHead(title, sub, ...actions) {
    return h(
      "div",
      {
        class: "row between",
        style: "padding:26px 0 4px;align-items:flex-end;gap:18px",
      },
      h("div", {}, h("h1", {}, title), sub && h("p", { class: "sub" }, sub)),
      h("div", { class: "row" }, ...actions),
    );
  }
  const errBox = (msg) =>
    h("div", { class: "err", role: "alert" }, icon("alert"), h("div", {}, msg));
  const emptyBox = (title, text) =>
    h("div", { class: "empty" }, h("h3", {}, title), h("p", {}, text));

  // ------------------------------------------------------------ Create
  const imgState = {
    prompt: store("prompt") || "",
    painter: store("painter") || "antigravity",
    size: store("size") || "square",
    useSets: store("useSets") || {},
    tray: [],
    job: null,
    results: null,
    error: null,
    copy: true,
  };
  const PAINTERS = [
    ["antigravity", "Nano Banana (fastest)"],
    ["chatgpt", "ChatGPT"],
    ["grok", "Grok"],
    ["auto", "Auto"],
    ["council", "Compare all"],
  ];
  const SHAPES = [
    ["square", "Square", "square"],
    ["wide", "Wide", "wide"],
    ["tall", "Tall", "tall"],
  ];
  let shelfCache = [];
  let composeFocus = false;

  function addToTray(path) {
    if (!imgState.tray.some((t) => t.path === path))
      imgState.tray.push({ path, name: path.split("/").pop() });
  }
  function recreate(prompt) {
    imgState.prompt = prompt || "";
    store("prompt", imgState.prompt);
    composeFocus = true;
    if (routeFromHash() === "image") render();
    else location.hash = "#/image";
  }

  const PRESETS = [
    {
      title: "Me as the thumbnail",
      cat: "me",
      icon: "user",
      tags: ["Thumbnails", "Me"],
      shelf: "luis",
      text: "Make a thumbnail with your face: big close-up, shocked look, bold yellow arrow, dark background.",
      prompt:
        "YouTube thumbnail: tight close-up of me with a shocked expression, bold yellow arrow pointing at a glowing object, dark high-contrast background, sharp, photoreal",
    },
    {
      title: "Me at my desk",
      cat: "me",
      icon: "user",
      tags: ["Me", "Photoreal"],
      shelf: "luis",
      text: "A clean studio shot of you with the setup you film in.",
      prompt:
        "Photoreal portrait of me at a standing desk with a mic and a green screen behind, soft key light, shallow depth of field, editorial look",
    },
    {
      title: "Card on marble",
      cat: "products",
      icon: "bag",
      tags: ["Products"],
      shelf: "",
      text: "Drop a photo of the card first, then put it on any surface you like.",
      prompt:
        "Product shot of the card from my reference on a white marble table, soft window light, shallow depth of field, premium magazine look",
    },
    {
      title: "Square ad",
      cat: "ads",
      icon: "tag",
      tags: ["Ads", "Products"],
      shelf: "",
      text: "Your product centred with room above for a headline.",
      prompt:
        "Square ad creative: the product from my reference centred on a clean bold-colour background, space at the top for a short headline, crisp studio lighting",
    },
    {
      title: "Podcast cover",
      cat: "thumbs",
      icon: "image",
      tags: ["Thumbnails"],
      shelf: "luis",
      text: "Cover art with your face and one big idea.",
      prompt:
        "Podcast cover art: me on the right, large bold title space on the left, deep blue and acid green accents, cinematic lighting",
    },
    {
      title: "Carousel background",
      cat: "ads",
      icon: "grid",
      tags: ["Ads"],
      shelf: "",
      text: "A calm textured background that headlines sit on.",
      prompt:
        "Abstract dark charcoal background with soft film grain and a faint acid-lime glow in one corner, empty centre for text, minimal",
    },
  ];
  const PRESET_CATS = [
    ["all", "All presets", "grid"],
    ["me", "Me", "user"],
    ["products", "Products", "bag"],
    ["thumbs", "Thumbnails", "image"],
    ["ads", "Ads", "tag"],
  ];

  function applyImage(job) {
    if (imgState.job && imgState.job.id && imgState.job.id !== job.id) return; // an older job landed after a newer one started
    imgState.job = job;
    if (job.outputs && job.outputs.length) imgState.results = job.outputs;
    if (job.status === "error") imgState.error = job.error;
  }

  async function viewImage(main) {
    const snap = store("boot") || {
      refs: [],
      recent: [],
      recordings: [],
      recording_count: 0,
      history: [],
    };
    shelfCache = snap.refs || [];
    const page = h("div", { class: "page" });
    main.append(page);

    // ---- composer
    const ta = h("textarea", {
      id: "prompt",
      rows: 2,
      placeholder: "Describe what you want to create, @ for your pictures",
      "aria-label": "Describe the image",
    });
    ta.value = imgState.prompt;
    const attached = h("div", { class: "attached" });
    const composer = h("div", { class: "composer", id: "composer" });
    const painterBtn = h("button", {
      class: "tool",
      type: "button",
      "aria-haspopup": "menu",
    });
    const shapeBtn = h("button", {
      class: "tool",
      type: "button",
      "aria-haspopup": "menu",
    });
    const plusBtn = h(
      "button",
      {
        class: "tool round",
        type: "button",
        "aria-label": "Add pictures or shelves",
        "aria-haspopup": "menu",
      },
      icon("plus"),
    );
    const sendBtn = h(
      "button",
      { class: "send", type: "button", "aria-label": "Create", id: "send" },
      icon("up"),
    );
    const fileInput = h("input", {
      type: "file",
      multiple: true,
      accept: "image/*",
      class: "sr-only",
      tabindex: "-1",
    });

    function paintTools() {
      painterBtn.replaceChildren(
        icon("create"),
        (PAINTERS.find((p) => p[0] === imgState.painter) || PAINTERS[0])[1],
        icon("down"),
      );
      const sh = SHAPES.find((s) => s[0] === imgState.size) || SHAPES[0];
      shapeBtn.replaceChildren(icon(sh[2]), sh[1], icon("down"));
    }
    function paintAttached() {
      const chips = [];
      for (const s of shelfCache) {
        if (!imgState.useSets[s.name]) continue;
        chips.push(
          h(
            "span",
            { class: "att" },
            s.items[0]
              ? h("img", { src: thumbUrl(s.items[0].path, 80), alt: "" })
              : h("span", { class: "ph" }, icon("user")),
            "@" + s.name,
            h(
              "button",
              {
                type: "button",
                "aria-label": "Stop using " + s.name,
                onclick: () => {
                  imgState.useSets[s.name] = false;
                  store("useSets", imgState.useSets);
                  paintAttached();
                  paintShelves();
                },
              },
              icon("x"),
            ),
          ),
        );
      }
      imgState.tray.forEach((t, i) =>
        chips.push(
          h(
            "span",
            { class: "att" },
            h("img", { src: thumbUrl(t.path, 80), alt: "" }),
            "Picture " + (i + 1),
            h(
              "button",
              {
                type: "button",
                "aria-label": "Keep on a shelf",
                title: "Keep on a shelf",
                onclick: (e) => keepMenu(t.path, e.currentTarget),
              },
              icon("bookmark"),
            ),
            h(
              "button",
              {
                type: "button",
                "aria-label": "Remove",
                onclick: () => {
                  imgState.tray.splice(i, 1);
                  paintAttached();
                },
              },
              icon("x"),
            ),
          ),
        ),
      );
      attached.replaceChildren(...chips);
    }
    function keepMenu(path, anchor) {
      openPop(composer, anchor, [
        { head: "Keep this picture on a shelf" },
        ...shelfCache.map((s) => ({
          label: s.name,
          icon: "folder",
          onSelect: () => keepOn(path, s.name),
        })),
        {
          label: "New shelf…",
          icon: "folderplus",
          onSelect: async () => {
            const n = await newShelf();
            if (n) keepOn(path, n);
          },
        },
      ]);
    }
    async function keepOn(path, set) {
      try {
        await post("/api/refs-keep", { path, set });
        shelfCache = (await api("/api/refs")).sets;
        toast(`Kept on the “${set}” shelf`);
        paintShelves();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    async function newShelf() {
      const name = (
        window.prompt("Name the shelf, like me, cards or products") || ""
      )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      if (!name) return null;
      try {
        await post("/api/refs-new", { name });
        shelfCache = (await api("/api/refs")).sets;
        paintShelves();
        return name;
      } catch (e) {
        toast(e.message, "bad");
        return null;
      }
    }
    async function takeFiles(files, set) {
      const list = [...files].filter(
        (f) =>
          /^image\//.test(f.type) || /\.(png|jpe?g|webp|heic)$/i.test(f.name),
      );
      if (!list.length) {
        toast("Drop pictures here (png, jpg, webp or heic).", "bad");
        return;
      }
      for (const f of list) {
        try {
          if (set) {
            await upload("/api/refs/" + encodeURIComponent(set), f);
            imgState.useSets[set] = true;
            store("useSets", imgState.useSets);
          } else {
            const r = await upload("/api/upload", f);
            addToTray(r.path);
          }
        } catch (e) {
          toast(e.message, "bad");
        }
      }
      if (set) {
        shelfCache = (await api("/api/refs")).sets;
        toast(`Added to the “${set}” shelf`);
        paintShelves();
      }
      paintAttached();
    }
    fileInput.addEventListener("change", (e) => {
      takeFiles(e.target.files);
      e.target.value = "";
    });

    function plusMenu() {
      openPop(
        composer,
        plusBtn,
        [
          {
            label: "Add pictures from this Mac",
            icon: "image",
            onSelect: () => fileInput.click(),
          },
          {
            label: "Pick from my library",
            icon: "library",
            onSelect: pickFromLibrary,
          },
          shelfCache.length && { head: "Use a shelf" },
          ...shelfCache.map((s) => ({
            label: s.name,
            icon: "folder",
            checked: !!imgState.useSets[s.name],
            onSelect: () => {
              imgState.useSets[s.name] = !imgState.useSets[s.name];
              store("useSets", imgState.useSets);
              paintAttached();
              paintShelves();
            },
          })),
        ].filter(Boolean),
        { up: true },
      );
    }
    async function pickFromLibrary() {
      let items = [];
      try {
        items = (await api("/api/library?scope=all&limit=80")).items;
      } catch (e) {
        toast(e.message, "bad");
        return;
      }
      openOverlay(
        h(
          "div",
          { class: "picker" },
          h("h2", { class: "section" }, "Pick pictures to use as references"),
          h(
            "div",
            { class: "tiles5" },
            items.map((it) =>
              h(
                "button",
                {
                  class: "tile",
                  "aria-label": it.prompt || it.name,
                  onclick: () => {
                    addToTray(it.path);
                    paintAttached();
                    toast("Added as a reference");
                    closeOverlay();
                  },
                },
                h("img", {
                  src: thumbUrl(it.path, 260),
                  alt: "",
                  loading: "lazy",
                }),
              ),
            ),
          ),
        ),
      );
    }

    // @ mentions
    function mentionState() {
      const pos = ta.selectionStart,
        before = ta.value.slice(0, pos),
        m = /(^|\s)@([\w-]*)$/.exec(before);
      return m
        ? { query: m[2].toLowerCase(), start: pos - m[2].length - 1, end: pos }
        : null;
    }
    let mention = null;
    function updateMention() {
      const st = mentionState();
      if (!st) {
        if (mention) {
          closePop();
          mention = null;
        }
        return;
      }
      const list = shelfCache.filter((s) => s.name.includes(st.query));
      if (!list.length) {
        closePop();
        mention = null;
        return;
      }
      const { btns } = openPop(
        composer,
        ta,
        list.map((s) => ({
          label: "@" + s.name,
          img: s.items[0] ? thumbUrl(s.items[0].path, 60) : null,
          icon: "folder",
          onSelect: () => choose(s.name, st),
        })),
        { up: false },
      );
      ta.style.minHeight = "56px";
      mention = { btns, list, st, idx: 0 };
      btns[0] && btns[0].setAttribute("aria-selected", "true");
    }
    function choose(name, st) {
      ta.value = ta.value.slice(0, st.start) + ta.value.slice(st.end);
      imgState.prompt = ta.value;
      store("prompt", ta.value);
      imgState.useSets[name] = true;
      store("useSets", imgState.useSets);
      mention = null;
      paintAttached();
      paintShelves();
      ta.focus();
    }
    ta.addEventListener("input", () => {
      imgState.prompt = ta.value;
      store("prompt", ta.value);
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
      updateMention();
    });
    ta.addEventListener("keydown", (e) => {
      if (mention && ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          mention.btns[mention.idx].setAttribute("aria-selected", "false");
          mention.idx =
            (mention.idx +
              (e.key === "ArrowDown" ? 1 : -1) +
              mention.btns.length) %
            mention.btns.length;
          mention.btns[mention.idx].setAttribute("aria-selected", "true");
        } else {
          const pick = mention.list[mention.idx];
          closePop();
          choose(pick.name, mention.st);
        }
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        generate();
      }
    });

    plusBtn.addEventListener("click", plusMenu);
    painterBtn.addEventListener("click", () =>
      openPop(
        composer,
        painterBtn,
        PAINTERS.map(([v, l]) => ({
          label: l,
          checked: imgState.painter === v,
          onSelect: () => {
            imgState.painter = v;
            store("painter", v);
            paintTools();
          },
        })),
        { up: true },
      ),
    );
    shapeBtn.addEventListener("click", () =>
      openPop(
        composer,
        shapeBtn,
        SHAPES.map(([v, l, ic]) => ({
          label: l,
          icon: ic,
          checked: imgState.size === v,
          onSelect: () => {
            imgState.size = v;
            store("size", v);
            paintTools();
          },
        })),
        { up: true },
      ),
    );
    sendBtn.addEventListener("click", generate);

    composer.append(
      attached,
      ta,
      h("div", { class: "bar" }, plusBtn, painterBtn, shapeBtn, sendBtn),
      fileInput,
    );

    const stage = h("div");
    async function generate() {
      const text = imgState.prompt.trim();
      if (!text) {
        toast("Describe the image first.", "bad");
        ta.focus();
        return;
      }
      closePop();
      imgState.error = null;
      imgState.results = null;
      imgState.job = { status: "running", stage: "Starting", elapsed: 0, _t0: Date.now() }; // the card is on screen before the bridge even answers
      paintStage();
      try {
        const sets = Object.keys(imgState.useSets).filter(
          (k) => imgState.useSets[k] && shelfCache.some((s) => s.name === k),
        );
        const r = await post("/api/image", {
          prompt: text,
          painter: imgState.painter,
          size: imgState.size,
          ref_sets: sets,
          ref_paths: imgState.tray.map((t) => t.path),
          copy: imgState.copy,
        });
        imgState.job = r.job;
        paintStage();
        trackJob(r.job, "image", applyImage);
      } catch (e) {
        imgState.job = null;
        imgState.error = e.message;
        paintStage();
      }
    }
    function paintStage() {
      const job = imgState.job,
        parts = [];
      if (job && job.status === "running") {
        parts.push(
          h(
            "div",
            { class: "working" },
            h("div", { class: "label" }, "Painting"),
            h("div", { class: "big" }, job.stage || "Painting"),
            h("div", { class: "time", "data-t0": job.status === "running" ? String(job._t0 || "") : "" }, `${Math.round(secs(job))} s`),
            job.note && h("div", { class: "hint" }, job.note),
            h("div", { class: "hint selectable" }, imgState.prompt),
          ),
        );
      }
      if (imgState.error) parts.push(errBox(imgState.error));
      if (imgState.results)
        parts.push(
          h(
            "div",
            { class: "results" },
            imgState.results.map((o) => {
              const item = {
                path: o.path,
                name: o.name,
                prompt: imgState.prompt,
                ts: new Date().toISOString(),
              };
              return h(
                "div",
                { class: "result" },
                h(
                  "button",
                  {
                    class: "pic",
                    onclick: () => lightbox(item),
                    "aria-label": "Open image",
                  },
                  h("img", {
                    src: mediaUrl(o.path),
                    alt: imgState.prompt,
                    decoding: "async",
                  }),
                ),
                h(
                  "div",
                  { class: "bar" },
                  h(
                    "button",
                    {
                      class: "btn small lime",
                      onclick: () => copyImage(o.path),
                    },
                    icon("copy"),
                    "Copy",
                  ),
                  h(
                    "button",
                    {
                      class: "btn small",
                      onclick: () => {
                        addToTray(o.path);
                        paintAttached();
                        toast("Added to your references");
                        $("#main").scrollTop = 0;
                      },
                    },
                    icon("plus"),
                    "Use as reference",
                  ),
                  h(
                    "button",
                    { class: "btn small", onclick: () => reveal(o.path) },
                    icon("folder"),
                    "Finder",
                  ),
                ),
              );
            }),
          ),
        );
      stage.replaceChildren(...parts);
    }
    viewHooks.image = paintStage;

    // ---- hero
    page.append(
      h(
        "div",
        { class: "hero" },
        h("div", { class: "mark" }, svgOf("create")),
        h("h1", {}, "What image would you like to create?"),
        composer,
        h(
          "div",
          { class: "suggest" },
          [
            "Me at a standing desk with a green screen and a mic",
            "Product shot of this card on a marble table",
            "Thumbnail with a shocked face and a yellow arrow",
          ].map((t) =>
            h(
              "button",
              {
                class: "chip",
                type: "button",
                onclick: () => {
                  ta.value = t;
                  imgState.prompt = t;
                  store("prompt", t);
                  ta.focus();
                },
              },
              icon("create"),
              t,
            ),
          ),
        ),
      ),
      stage,
    );

    paintTools();
    paintAttached();
    paintStage();
    bindDrop((files) => takeFiles(files), composer);
    if (composeFocus) {
      composeFocus = false;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    ta.style.height = "auto";
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 56), 240) + "px";
    // The composer is on screen now. Everything below paints from the last snapshot at once, then refreshes.
    const lower = h("div", { class: "lower" });
    page.append(lower);

    // ---- shelves (the "projects" row)
    const shelvesBox = h("div", { class: "projects" });
    function openShelf(set) {
      const s = shelfCache.find((x) => x.name === set);
      if (!s) return;
      const sel = h("input", {
        type: "file",
        multiple: true,
        accept: "image/*",
        class: "sr-only",
        tabindex: "-1",
        onchange: async (e) => {
          await takeFiles(e.target.files, set);
          closeOverlay();
          openShelf(set);
          e.target.value = "";
        },
      });
      openOverlay(
        h(
          "div",
          { class: "picker" },
          h(
            "div",
            { class: "row between" },
            h(
              "div",
              {},
              h("h2", { class: "section" }, set),
              h(
                "p",
                { class: "hint", style: "margin:4px 0 0" },
                "These stay on this Mac. Drop more pictures on the tile any time.",
              ),
            ),
            h(
              "div",
              { class: "row" },
              h(
                "button",
                {
                  class: "btn lime",
                  onclick: () => {
                    imgState.useSets[set] = true;
                    store("useSets", imgState.useSets);
                    closeOverlay();
                    paintAttached();
                    paintShelves();
                    $("#main").scrollTop = 0;
                    ta.focus();
                  },
                },
                icon("create"),
                "Use for my next image",
              ),
              h(
                "button",
                { class: "btn", onclick: () => sel.click() },
                icon("plus"),
                "Add pictures",
              ),
              sel,
            ),
          ),
          s.items.length
            ? h(
                "div",
                { class: "tiles5" },
                s.items.map((it) =>
                  h(
                    "div",
                    { class: "wrap" },
                    h(
                      "div",
                      { class: "tile", style: "cursor:default" },
                      h("img", {
                        src: thumbUrl(it.path, 260, it.v),
                        alt: "",
                        decoding: "async",
                      }),
                      h(
                        "div",
                        { class: "corner" },
                        h(
                          "button",
                          {
                            "aria-label": "Remove " + it.name,
                            onclick: async () => {
                              if (
                                !confirm(
                                  `Remove ${it.name} from the ${set} shelf?`,
                                )
                              )
                                return;
                              try {
                                await api(
                                  `/api/refs/${encodeURIComponent(set)}/${encodeURIComponent(it.name)}`,
                                  { method: "DELETE" },
                                );
                                await refreshBoot();
                                closeOverlay();
                                openShelf(set);
                              } catch (e) {
                                toast(e.message, "bad");
                              }
                            },
                          },
                          svgOf("x"),
                        ),
                      ),
                    ),
                  ),
                ),
              )
            : emptyBox(
                "Nothing here yet",
                "Add pictures of you, a card or a product. They become references you can use in any image.",
              ),
          !s.items.length &&
            h(
              "div",
              { class: "row" },
              h(
                "button",
                {
                  class: "btn",
                  onclick: async () => {
                    try {
                      await api("/api/refs/" + encodeURIComponent(set), {
                        method: "DELETE",
                      });
                      await refreshBoot();
                      closeOverlay();
                    } catch (e) {
                      toast(e.message, "bad");
                    }
                  },
                },
                "Delete empty shelf",
              ),
            ),
        ),
      );
    }
    function paintShelves() {
      shelvesBox.replaceChildren(
        h(
          "button",
          {
            class: "project new",
            onclick: async () => {
              const n = await newShelf();
              if (n) openShelf(n);
            },
          },
          h(
            "div",
            { class: "collage" },
            h("span", { class: "plus" }, icon("folderplus")),
          ),
          h("div", { class: "name" }, "New shelf"),
        ),
        ...shelfCache.map((s) => {
          const pics = s.items.slice(0, 3);
          const tile = h(
            "button",
            {
              class: "project",
              "aria-pressed": String(!!imgState.useSets[s.name]),
              onclick: () => openShelf(s.name),
            },
            imgState.useSets[s.name] && h("span", { class: "on" }, "In use"),
            h(
              "div",
              {
                class:
                  "collage" +
                  (pics.length === 1 ? " one" : "") +
                  (!pics.length ? " empty" : ""),
              },
              pics.length
                ? pics.map((p) =>
                    h("img", {
                      src: thumbUrl(p.path, 260, p.v),
                      alt: "",
                      loading: "lazy",
                      decoding: "async",
                    }),
                  )
                : icon("image"),
            ),
            h(
              "div",
              { class: "name" },
              s.name,
              h(
                "small",
                {},
                `${s.items.length} picture${s.items.length === 1 ? "" : "s"}`,
              ),
            ),
          );
          tile.addEventListener("dragover", (e) => {
            if ([...(e.dataTransfer?.types || [])].includes("Files")) {
              e.preventDefault();
              tile.classList.add("dropping");
            }
          });
          tile.addEventListener("dragleave", () =>
            tile.classList.remove("dropping"),
          );
          tile.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            tile.classList.remove("dropping");
            document.body.classList.remove("dragging");
            takeFiles(e.dataTransfer.files, s.name);
          });
          return tile;
        }),
      );
    }
    const shelvesSection = [
      h(
        "div",
        { class: "section-head" },
        h(
          "div",
          {},
          h("h2", { class: "section" }, "Your shelves"),
          h(
            "p",
            { class: "hint", style: "margin:4px 0 0" },
            "Pictures of you, your cards, your products. Drop them on a shelf and use them in any image.",
          ),
        ),
        h(
          "button",
          {
            class: "btn seeall",
            onclick: async () => {
              const n = await newShelf();
              if (n) openShelf(n);
            },
          },
          icon("folderplus"),
          "New shelf",
        ),
      ),
      shelvesBox,
    ];

    // ---- discover (static, built once)
    let cat = "all";
    const presetsBox = h("div", { class: "presets" });
    const side = h("div", { class: "side" });
    function paintDiscover() {
      side.replaceChildren(
        ...PRESET_CATS.map(([id, label, ic]) =>
          h(
            "button",
            {
              "aria-current": String(cat === id),
              onclick: () => {
                cat = id;
                paintDiscover();
              },
            },
            icon(ic),
            label,
          ),
        ),
      );
      presetsBox.replaceChildren(
        ...PRESETS.filter((p) => cat === "all" || p.cat === cat).map((p) =>
          h(
            "div",
            { class: "preset" },
            h(
              "div",
              { class: "vis" },
              h("div", { class: "big-glyph" }, icon(p.icon)),
            ),
            h(
              "div",
              {},
              h("h3", {}, p.title),
              h("p", {}, p.text),
              h(
                "div",
                { class: "row" },
                p.tags.map((t) => h("span", { class: "chip" }, t)),
              ),
              h(
                "button",
                {
                  class: "btn lime big",
                  onclick: () => {
                    if (p.shelf && shelfCache.some((s) => s.name === p.shelf)) {
                      imgState.useSets[p.shelf] = true;
                      store("useSets", imgState.useSets);
                    }
                    recreate(p.prompt);
                  },
                },
                icon("create"),
                "Try this",
              ),
            ),
          ),
        ),
      );
    }
    const discoverSection = [
      h(
        "div",
        { class: "section-head" },
        h("h2", { class: "section" }, "Discover what you can create"),
      ),
      h("div", { class: "discover" }, side, presetsBox),
    ];
    paintDiscover();

    function paintLower(d) {
      shelfCache = d.refs || [];
      const recent = d.recent || [],
        recs = d.recordings || [],
        hist = d.history || [];
      const lib2 = recent.slice(0, 2),
        firstRec = recs.find((r) => r.local);
      const nodes = [
        h(
          "div",
          { class: "section-head" },
          h("h2", { class: "section" }, "Getting started"),
        ),
        h(
          "div",
          { class: "cards4" },
          h(
            "button",
            {
              class: "start",
              onclick: () => {
                location.hash = "#/library";
              },
            },
            h(
              "div",
              { class: "t" },
              h("b", {}, "All creations"),
              h("span", {}, "Everything you made"),
            ),
            h(
              "div",
              { class: "pics" },
              lib2[1] &&
                h("img", {
                  class: "p1",
                  src: thumbUrl(lib2[1].path, 260, lib2[1].v),
                  alt: "",
                  decoding: "async",
                }),
              lib2[0]
                ? h("img", {
                    class: "p2",
                    src: thumbUrl(lib2[0].path, 260, lib2[0].v),
                    alt: "",
                    decoding: "async",
                  })
                : h("div", { class: "glyph" }, icon("library")),
            ),
          ),
          h(
            "button",
            {
              class: "start",
              onclick: () => {
                location.hash = "#/titles";
              },
            },
            h(
              "div",
              { class: "t" },
              h("b", {}, "Title ideas"),
              h(
                "span",
                {},
                hist[0]
                  ? "Click a title to copy it"
                  : "Grab a frame, get titles",
              ),
            ),
            h(
              "div",
              { class: "pics" },
              h("div", { class: "glyph" }, icon("title")),
            ),
          ),
          h(
            "button",
            {
              class: "start",
              onclick: () => {
                location.hash = "#/recordings";
              },
            },
            h(
              "div",
              { class: "t" },
              h("b", {}, "Screen videos"),
              h("span", {}, `${d.recording_count || recs.length} in the cloud`),
            ),
            h(
              "div",
              { class: "pics" },
              firstRec
                ? h("img", {
                    class: "only",
                    src: thumbUrl(firstRec.path, 440),
                    alt: "",
                    decoding: "async",
                  })
                : h("div", { class: "glyph" }, icon("film")),
            ),
          ),
          h(
            "button",
            {
              class: "start",
              onclick: () => {
                location.hash = "#/screens";
              },
            },
            h(
              "div",
              { class: "t" },
              h("b", {}, "Read screens"),
              h("span", {}, "What your screenshots say"),
            ),
            h(
              "div",
              { class: "pics" },
              h("div", { class: "glyph" }, icon("screen")),
            ),
          ),
        ),
        ...shelvesSection,
        recent.length &&
          h(
            "div",
            { class: "section-head" },
            h("h2", { class: "section" }, "Recent creations"),
            h(
              "button",
              {
                class: "btn seeall",
                onclick: () => {
                  location.hash = "#/library";
                },
              },
              "See all ›",
            ),
          ),
        recent.length &&
          h("div", { class: "tiles5" }, recent.slice(0, 10).map(tileFor)),
        ...discoverSection,
      ].filter(Boolean);
      lower.replaceChildren(...nodes);
      paintShelves();
      paintAttached();
    }
    async function refreshBoot() {
      const fresh = await api("/api/boot");
      store("boot", fresh);
      if (current === "image") paintLower(fresh);
    }
    paintLower(snap); // instant, from the last visit
    // The page came with its boot data already inside it: no request, no wait.
    const injected = window.__BOOT__;
    window.__BOOT__ = null;
    (injected ? Promise.resolve(injected) : api("/api/boot"))
      .then((fresh) => {
        // then the truth
        if (JSON.stringify(fresh) !== JSON.stringify(snap)) {
          store("boot", fresh);
          if (current === "image") paintLower(fresh);
        }
      })
      .catch(() => {});
    warmViews();
  }

  // Quietly learn what the other tabs will need, so switching to them is instant.
  let warmed = false;
  function warmViews() {
    if (warmed) return;
    warmed = true;
    const go = () => {
      for (const [key, url] of [
        ["library", "/api/library?scope=mine&limit=160&q="],
        ["recordings", "/api/recordings"],
        ["clients", "/api/clients"],
        ["screens", "/api/screens"],
      ]) {
        api(url)
          .then((d) => store("swr." + key, d))
          .catch(() => {});
      }
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(go);
  }

  function tileFor(it) {
    return h(
      "div",
      { class: "wrap" },
      h(
        "div",
        {
          class: "tile",
          role: "button",
          tabindex: "0",
          "aria-label": it.title || it.prompt || it.name,
          onclick: () => lightbox(it),
          onkeydown: (e) => {
            if (e.key === "Enter") lightbox(it);
          },
        },
        h("img", {
          src: thumbUrl(it.path, 440, it.v),
          alt: it.title || "",
          loading: "lazy",
          decoding: "async",
        }),
        it.title && h("div", { class: "cap" }, h("span", {}, it.title)),
        h(
          "div",
          { class: "corner" },
          h(
            "button",
            {
              "aria-label": "Copy image",
              onclick: (e) => {
                e.stopPropagation();
                copyImage(it.path);
              },
            },
            svgOf("copy"),
          ),
        ),
        it.prompt &&
          h(
            "button",
            {
              class: "recreate",
              onclick: (e) => {
                e.stopPropagation();
                recreate(it.prompt);
              },
            },
            "Recreate",
          ),
      ),
    );
  }

  function bindDrop(onFiles, zone) {
    let depth = 0;
    const hasFiles = (e) =>
      [...(e.dataTransfer?.types || [])].includes("Files");
    const over = (e) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const enter = (e) => {
      if (hasFiles(e)) {
        depth++;
        document.body.classList.add("dragging");
        zone && zone.classList.add("over");
      }
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) {
        document.body.classList.remove("dragging");
        zone && zone.classList.remove("over");
      }
    };
    const drop = (e) => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dragging");
      zone && zone.classList.remove("over");
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    stops.push(() => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      document.body.classList.remove("dragging");
    });
  }

  // ----------------------------------------------------------------- Titles
  const tState = {
    shot: null,
    client: store("client") || "",
    count: 10,
    extra: "",
    job: null,
    titles: null,
    error: null,
    copiedIdx: -1,
    provider: "",
  };
  function applyTitles(job) {
    tState.job = job;
    if (job.status === "done") {
      tState.titles = job.titles;
      tState.provider = job.provider || "";
    }
    if (job.status === "error") tState.error = job.error;
  }
  async function viewTitles(main) {
    const clientInfo =
      store("swr.clients") ||
      (await api("/api/clients").catch(() => ({ default: "", clients: [] })));
    if (!tState.client) tState.client = clientInfo.default;
    const history = (
      await api("/api/titles/history").catch(() => ({ history: [] }))
    ).history;

    const shotBox = h("div", { class: "shot" });
    function paintShot() {
      shotBox.replaceChildren(
        tState.shot
          ? h("img", { src: thumbUrl(tState.shot, 900), alt: "Screen to read" })
          : h(
              "div",
              { class: "placeholder" },
              icon("screen"),
              h(
                "span",
                {},
                "Capture your editor, or drop or paste a screenshot",
              ),
            ),
      );
    }
    async function setShotFromFile(file) {
      try {
        const r = await upload("/api/upload", file);
        tState.shot = r.path;
        paintShot();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    async function capture(mode) {
      const r = await native.call("capture", { mode });
      if (r.ok) {
        tState.shot = r.path;
        paintShot();
      } else if (r.error === "not-in-app")
        toast(
          "Open this in the Title Ideas app to capture, or drop a screenshot.",
          "bad",
        );
      else if (r.error !== "cancelled")
        toast(r.error || "Could not capture the screen.", "bad");
    }
    const fileInput = h("input", {
      type: "file",
      accept: "image/*",
      class: "sr-only",
      tabindex: "-1",
      onchange: (e) => {
        if (e.target.files[0]) setShotFromFile(e.target.files[0]);
        e.target.value = "";
      },
    });
    const clientSel = h(
      "select",
      {
        id: "client",
        "aria-label": "Client",
        onchange: (e) => {
          tState.client = e.target.value;
          store("client", tState.client);
        },
      },
      clientInfo.clients.length
        ? clientInfo.clients.map((c) => h("option", { value: c.slug }, c.name))
        : [h("option", { value: tState.client }, tState.client)],
    );
    clientSel.value = tState.client;
    const out = h("div");
    async function generate() {
      if (!tState.shot) {
        toast("Capture the screen or drop a screenshot first.", "bad");
        return;
      }
      tState.error = null;
      tState.titles = null;
      tState.copiedIdx = -1;
      tState.job = {
        status: "running",
        stage: "Reading the screen",
        elapsed: 0,
        _t0: Date.now(),
      };
      paintOut();
      try {
        const r = await post("/api/titles", {
          image_path: tState.shot,
          client: tState.client,
          count: tState.count,
          extra: tState.extra,
        });
        tState.job = r.job;
        paintOut();
        trackJob(r.job, "titles", applyTitles);
      } catch (e) {
        tState.job = null;
        tState.error = e.message;
        paintOut();
      }
    }
    function paintOut() {
      const job = tState.job,
        g = $("#go");
      if (g) g.disabled = !!(job && job.status === "running");
      if (job && job.status === "running") {
        out.replaceChildren(
          h(
            "div",
            { class: "working", style: "margin-top:0" },
            h("div", { class: "label" }, "Reading your screen"),
            h("div", { class: "big" }, job.stage),
            h("div", { class: "time", "data-t0": job.status === "running" ? String(job._t0 || "") : "" }, `${Math.round(secs(job))} s`),
            h(
              "div",
              { class: "hint" },
              "You can leave this tab. I will tell you the moment the titles are ready.",
            ),
          ),
        );
        return;
      }
      if (tState.error) {
        out.replaceChildren(errBox(tState.error));
        return;
      }
      if (!tState.titles) {
        out.replaceChildren(
          emptyBox(
            "Titles show up here",
            "Capture the frame you are editing. You get options in six styles. Click any one to copy it.",
          ),
        );
        return;
      }
      out.replaceChildren(
        h(
          "div",
          { class: "row between", style: "margin-bottom:14px" },
          h(
            "div",
            {},
            h("span", { class: "label" }, `${tState.titles.length} titles`),
            tState.provider &&
              h(
                "span",
                { class: "hint" },
                `  ${tState.provider.split(":")[0]}`,
              ),
          ),
          h(
            "div",
            { class: "row" },
            h(
              "button",
              {
                class: "btn small lime",
                onclick: () =>
                  copyText(
                    tState.titles.map((t) => t.text).join("\n"),
                    "All titles copied",
                  ),
              },
              icon("copy"),
              "Copy all",
            ),
            h(
              "button",
              { class: "btn small", onclick: generate },
              icon("refresh"),
              "Again",
            ),
          ),
        ),
        h(
          "div",
          { class: "titles" },
          tState.titles.map((t, i) =>
            h(
              "button",
              {
                class: "title-card" + (tState.copiedIdx === i ? " copied" : ""),
                onclick: async () => {
                  if (await copyText(t.text, "Title copied")) {
                    tState.copiedIdx = i;
                    paintOut();
                  }
                },
              },
              h(
                "div",
                {},
                h("div", { class: "s" }, t.style || "Option"),
                h("div", { class: "t selectable" }, t.text),
              ),
              h(
                "span",
                { class: "go" },
                tState.copiedIdx === i ? icon("check") : icon("copy"),
                tState.copiedIdx === i ? "Copied" : "Click to copy",
              ),
            ),
          ),
        ),
      );
    }
    viewHooks.titles = paintOut;
    main.append(
      h(
        "div",
        { class: "page narrow" },
        pageHead(
          "Title ideas",
          "Grab your editor, get title box options, and click one to copy it.",
        ),
        h(
          "div",
          { class: "split" },
          h(
            "div",
            { class: "stack" },
            h(
              "div",
              { class: "panel" },
              h(
                "div",
                { class: "field" },
                h("span", { class: "label" }, "Screen to read"),
                shotBox,
                h(
                  "div",
                  { class: "row" },
                  h(
                    "button",
                    {
                      class: "btn small lime",
                      onclick: () => capture("screen"),
                    },
                    icon("screen"),
                    "Capture screen",
                  ),
                  h(
                    "button",
                    { class: "btn small", onclick: () => capture("region") },
                    "Pick a region",
                  ),
                  h(
                    "button",
                    { class: "btn small", onclick: () => fileInput.click() },
                    icon("plus"),
                    "Choose file",
                  ),
                  fileInput,
                ),
                h(
                  "span",
                  { class: "hint" },
                  "You can also drop or paste a screenshot anywhere in this window.",
                ),
              ),
              h(
                "div",
                { class: "field" },
                h("label", { class: "label", for: "client" }, "Client"),
                clientSel,
              ),
              h(
                "div",
                { class: "field" },
                h("label", { class: "label" }, "How many"),
                h("input", {
                  type: "number",
                  min: "3",
                  max: "20",
                  value: String(tState.count),
                  "aria-label": "How many titles",
                  oninput: (e) => {
                    tState.count = Number(e.target.value) || 10;
                  },
                }),
              ),
              h(
                "div",
                { class: "field" },
                h("label", { class: "label" }, "Context"),
                h("input", {
                  type: "text",
                  placeholder: "Optional: 45 second podcast clip about AI",
                  value: tState.extra,
                  oninput: (e) => {
                    tState.extra = e.target.value;
                  },
                }),
              ),
              h(
                "button",
                { class: "btn lime big", id: "go", onclick: generate },
                icon("create"),
                "Get title ideas",
              ),
            ),
            history.length &&
              h(
                "div",
                { class: "panel" },
                h("span", { class: "label" }, "Earlier runs"),
                h(
                  "div",
                  { class: "history" },
                  history.slice(0, 6).map((run) =>
                    h(
                      "button",
                      {
                        onclick: () => {
                          tState.titles = run.titles;
                          tState.job = null;
                          tState.error = null;
                          tState.copiedIdx = -1;
                          tState.provider = run.provider || "";
                          if (run.image) tState.shot = run.image;
                          paintShot();
                          paintOut();
                        },
                      },
                      h("img", {
                        src: thumbUrl(run.image, 160),
                        alt: "",
                        loading: "lazy",
                        onerror: (e) => e.target.remove(),
                      }),
                      h(
                        "div",
                        {},
                        h("div", { class: "hint" }, fmtWhen(run.at)),
                        h(
                          "div",
                          { class: "muted" },
                          (run.titles[0] || {}).text || "",
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ),
          out,
        ),
      ),
    );
    paintShot();
    paintOut();
    bindDrop((files) => {
      if (files[0]) setShotFromFile(files[0]);
    });
    const paste = (e) => {
      const f = [...(e.clipboardData?.files || [])].find((x) =>
        /^image\//.test(x.type),
      );
      if (f) {
        e.preventDefault();
        setShotFromFile(f);
      }
    };
    document.addEventListener("paste", paste);
    stops.push(() => document.removeEventListener("paste", paste));
  }

  // ------------------------------------------------------------- Recordings
  async function viewRecordings(main) {
    let data = store("swr.recordings");
    if (!data) {
      try {
        data = await api("/api/recordings");
        store("swr.recordings", data);
      } catch (e) {
        main.append(
          h(
            "div",
            { class: "page" },
            pageHead("Screen videos"),
            errBox(e.message),
          ),
        );
        return;
      }
    }
    const driveCmd =
      ((data.drive && data.drive.error) || "").split("Run: ")[1] ||
      "rclone config reconnect gdrive:";
    const search = h("input", {
      type: "search",
      placeholder: "Search videos",
      "aria-label": "Search videos",
      style: "width:260px",
    });
    const grid = h("div", { class: "grid3" });
    function play(r) {
      const src = r.local ? mediaUrl(r.path) : r.url;
      if (!src) {
        toast("No playable copy yet. It is still uploading.", "bad");
        return;
      }
      openOverlay(
        h(
          "div",
          { class: "sheet single" },
          h(
            "div",
            { class: "big-pic" },
            h("video", {
              src,
              controls: true,
              autoplay: true,
              style: "max-width:100%;max-height:calc(100vh - 130px)",
            }),
          ),
        ),
      );
    }
    function paint() {
      const q = search.value.toLowerCase().trim();
      const rows = data.recordings.filter(
        (r) => !q || `${r.name} ${r.title || ""} ${r.summary || ""} ${(r.tags || []).join(" ")}`.toLowerCase().includes(q),
      );
      grid.replaceChildren(
        ...(rows.length
          ? rows.map((r) =>
              h(
                "div",
                { class: "card" },
                h(
                  "button",
                  {
                    class: "media",
                    onclick: () => play(r),
                    "aria-label": "Play " + (r.title || prettyName(r.name)),
                  },
                  h("img", {
                    src: r.local
                      ? thumbUrl(r.path, 560)
                      : "/rec-thumb?name=" + encodeURIComponent(r.name),
                    alt: "",
                    loading: "lazy",
                    onerror: (e) => {
                      e.target.replaceWith(
                        h(
                          "div",
                          { class: "placeholder" },
                          icon(r.local ? "film" : "cloud"),
                        ),
                      );
                    },
                  }),
                  h("span", { class: "play" }, icon("play")),
                  r.duration && h("span", { class: "dur" }, fmtDur(r.duration)),
                ),
                h(
                  "div",
                  { class: "body" },
                  h(
                    "div",
                    {},
                    h("h3", {}, r.title || prettyName(r.name)),
                    r.summary && h("div", { class: "hint selectable", style: "margin:2px 0 6px" }, r.summary),
                    h(
                      "div",
                      { class: "hint mono" },
                      [fmtWhen(r.when), fmtBytes(r.size)]
                        .filter(Boolean)
                        .join("  ·  "),
                    ),
                  ),
                  h(
                    "div",
                    { class: "row", style: "gap:6px" },
                    r.status === "waiting"
                      ? h("span", { class: "chip warn" }, "Waiting to upload")
                      : h(
                          "span",
                          { class: "chip ok" },
                          icon("check"),
                          "In the cloud",
                        ),
                    r.drive_link &&
                      h("span", { class: "chip ok" }, icon("check"), "Drive"),
                    r.status === "uploaded" &&
                      !r.drive_link &&
                      h(
                        "span",
                        {
                          class: data.drive.ok === false ? "chip warn" : "chip",
                        },
                        "No Drive copy",
                      ),
                    !r.local && h("span", { class: "chip" }, "Not on this Mac"),
                  ),
                  h(
                    "div",
                    { class: "acts" },
                    h(
                      "button",
                      { class: "btn small lime", onclick: () => play(r) },
                      icon("play"),
                      "Play",
                    ),
                    r.url &&
                      h(
                        "button",
                        {
                          class: "btn small",
                          onclick: () => copyText(r.url, "Link copied"),
                        },
                        icon("link"),
                        "Copy link",
                      ),
                    r.local &&
                      h(
                        "button",
                        { class: "btn small", onclick: () => reveal(r.path) },
                        icon("folder"),
                        "Finder",
                      ),
                  ),
                ),
              ),
            )
          : [
              h(
                "div",
                { style: "grid-column:1/-1" },
                emptyBox(
                  q ? "No match" : "No videos yet",
                  "Press Control Option R in Say Less to record your screen. It uploads on its own and shows up here.",
                ),
              ),
            ]),
      );
    }
    search.addEventListener("input", paint);
    let recPolls = 0;
    function refreshRecordings() {
      api("/api/recordings")
        .then((fresh) => {
          if (JSON.stringify(fresh) !== JSON.stringify(data)) {
            data = fresh;
            store("swr.recordings", fresh);
            if (current === "recordings") paint();
          }
          // titles are written in the background; look again until they have all landed
          const waiting = (fresh.items || fresh.recordings || []).some((r) => r.title_src && r.title_src !== "vision");
          if (waiting && current === "recordings" && ++recPolls < 12) setTimeout(refreshRecordings, 20000);
        })
        .catch(() => {});
    }
    refreshRecordings();
    main.append(
      h(
        "div",
        { class: "page" },
        pageHead(
          "Screen videos",
          `${data.recordings.length} recording${data.recordings.length === 1 ? "" : "s"}, uploaded and ready to share.`,
          search,
          h(
            "button",
            { class: "btn", onclick: () => reveal(data.folder) },
            icon("folder"),
            "Open folder",
          ),
        ),
        h("div", { style: "height:22px" }),
        data.drive &&
          data.drive.ok === false &&
          h(
            "div",
            { class: "notice", role: "alert" },
            h(
              "div",
              {},
              h("strong", {}, "Google Drive needs you to sign in again. "),
              "Cloud links still work.",
            ),
            h(
              "div",
              { class: "row" },
              h("code", {}, driveCmd),
              h(
                "button",
                {
                  class: "btn small",
                  onclick: () => copyText(driveCmd, "Command copied"),
                },
                icon("copy"),
                "Copy command",
              ),
            ),
          ),
        grid,
      ),
    );
    paint();
  }

  // ---------------------------------------------------------------- Screens
  const sState = { picked: new Set(), job: null, error: null };
  function applyScreens(job) {
    sState.job = job;
    if (job.status === "error") sState.error = job.error;
  }
  async function viewScreens(main) {
    let data = store("swr.screens");
    if (!data) {
      try {
        data = await api("/api/screens");
        store("swr.screens", data);
      } catch (e) {
        main.append(
          h(
            "div",
            { class: "page" },
            pageHead("Read screens"),
            errBox(e.message),
          ),
        );
        return;
      }
    }
    if (!sState.picked.size)
      data.screens.slice(0, 6).forEach((s) => sState.picked.add(s.path));
    const grid = h("div", { class: "shots" });
    const out = h("div", { class: "stack" });
    const readBtn = h("button", { class: "btn lime", onclick: read });
    function paintBtn() {
      readBtn.replaceChildren(
        icon("screen"),
        `Read ${sState.picked.size} screen${sState.picked.size === 1 ? "" : "s"}`,
      );
      readBtn.disabled = !sState.picked.size;
    }
    function paintGrid() {
      grid.replaceChildren(
        ...data.screens.map((s) =>
          h(
            "button",
            {
              class: "shot-pick",
              "aria-pressed": String(sState.picked.has(s.path)),
              "aria-label": s.name,
              onclick: (e) => {
                if (sState.picked.has(s.path)) sState.picked.delete(s.path);
                else if (sState.picked.size < 12) sState.picked.add(s.path);
                else toast("Twelve at a time is the limit.", "bad");
                e.currentTarget.setAttribute(
                  "aria-pressed",
                  String(sState.picked.has(s.path)),
                );
                paintBtn();
              },
            },
            h("img", { src: thumbUrl(s.path, 340), alt: "", loading: "lazy" }),
            h("span", { class: "tick" }, icon("check")),
          ),
        ),
      );
      if (!data.screens.length)
        grid.replaceChildren(
          h(
            "div",
            { style: "grid-column:1/-1" },
            emptyBox(
              "No screenshots found",
              "Take screenshots as usual, then gather them here and I read what each one shows.",
            ),
          ),
        );
    }
    function paintOut(job) {
      const parts = [];
      if (sState.error) parts.push(errBox(sState.error));
      if (job && job.status === "running")
        parts.push(
          h(
            "div",
            { class: "working", style: "margin-top:0" },
            h("div", { class: "label" }, "Reading"),
            h("div", { class: "big" }, job.stage),
            h("div", { class: "time", "data-t0": job.status === "running" ? String(job._t0 || "") : "" }, `${Math.round(secs(job))} s`),
          ),
        );
      if (job && job.partial && job.partial.length)
        parts.push(
          ...job.partial.map((p) =>
            h(
              "div",
              { class: "read" },
              h("img", { src: thumbUrl(p.path, 340), alt: "" }),
              h(
                "div",
                {},
                h(
                  "div",
                  { class: "row between" },
                  h("strong", {}, p.name),
                  h(
                    "button",
                    {
                      class: "btn small",
                      onclick: () => copyText(p.text, "Copied"),
                    },
                    icon("copy"),
                    "Copy",
                  ),
                ),
                h("pre", { class: "selectable" }, p.text),
              ),
            ),
          ),
        );
      if (job && job.status === "done")
        parts.push(
          h(
            "div",
            { class: "row" },
            h("span", { class: "chip ok" }, icon("check"), "Done"),
            h(
              "button",
              {
                class: "btn small lime",
                onclick: () =>
                  copyText(
                    job.partial
                      .map((p) => `## ${p.name}\n${p.text}`)
                      .join("\n\n"),
                    "Report copied",
                  ),
              },
              icon("copy"),
              "Copy report",
            ),
            h(
              "button",
              { class: "btn small", onclick: () => reveal(job.report) },
              icon("folder"),
              "Show report file",
            ),
          ),
        );
      out.replaceChildren(...parts);
    }
    async function read() {
      sState.error = null;
      readBtn.disabled = true;
      sState.job = {
        status: "running",
        stage: "Starting",
        elapsed: 0,
        _t0: Date.now(),
        partial: [],
      };
      paintOut(sState.job);
      try {
        const r = await post("/api/screens/read", {
          paths: [...sState.picked],
        });
        sState.job = r.job;
        paintOut(r.job);
        trackJob(r.job, "screens", applyScreens);
      } catch (e) {
        sState.job = null;
        sState.error = e.message;
        paintBtn();
        paintOut();
      }
    }
    async function gather() {
      try {
        const r = await post("/api/screens/gather", {});
        toast(
          r.moved
            ? `Moved ${r.moved} screenshot${r.moved === 1 ? "" : "s"} into today's folder`
            : "Nothing new to gather",
        );
        if (r.moved) await render();
      } catch (e) {
        toast(e.message, "bad");
      }
    }
    main.append(
      h(
        "div",
        { class: "page" },
        pageHead(
          "Read screens",
          "Pick screenshots and get what each one shows, any formulas or steps, and why you took it.",
          data.loose > 0 &&
            h(
              "button",
              { class: "btn", onclick: gather },
              icon("folder"),
              `Gather ${data.loose} from Desktop and Downloads`,
            ),
          readBtn,
        ),
        h("div", { style: "height:22px" }),
        h("div", { class: "stack" }, grid, out),
      ),
    );
    paintBtn();
    paintGrid();
    paintOut(sState.job);
    viewHooks.screens = () => {
      paintOut(sState.job);
      if (!sState.job || sState.job.status !== "running") paintBtn();
    };
  }

  // ---------------------------------------------------------------- Library
  const lState = { q: "", scope: store("scope") || "mine" };
  async function viewLibrary(main) {
    const search = h("input", {
      type: "search",
      placeholder: "Search by what you asked for",
      "aria-label": "Search the library",
      value: lState.q,
      style: "width:300px",
    });
    const holder = h("div");
    const scopeSeg = h(
      "div",
      { class: "row", role: "group", "aria-label": "Which images" },
      [
        ["mine", "Made here"],
        ["all", "Everything I have made"],
      ].map(([val, label]) =>
        h(
          "button",
          {
            type: "button",
            class: "chip",
            "aria-pressed": String(lState.scope === val),
            style:
              lState.scope === val
                ? "background:var(--lime);color:var(--on-lime);box-shadow:none;font-weight:700"
                : "",
            onclick: () => {
              lState.scope = val;
              store("scope", val);
              render();
            },
          },
          label,
        ),
      ),
    );
    let timer = 0,
      libPolls = 0;
    async function load() {
      try {
        const url = `/api/library?scope=${lState.scope}&limit=160&q=${encodeURIComponent(lState.q)}`;
        const first =
          !lState.q && lState.scope === "mine" ? store("swr.library") : null;
        if (first) paintGrid(first);
        const d = await api(url);
        if (!lState.q && lState.scope === "mine") store("swr.library", d);
        paintGrid(d);
        if (d.items.some((i) => i.title_src && i.title_src !== "vision") && current === "library" && ++libPolls < 12)
          setTimeout(load, 20000);
      } catch (e) {
        holder.replaceChildren(errBox(e.message));
      }
    }
    function paintGrid(d) {
      try {
        lState.folder = d.folder;
        holder.replaceChildren(
          h(
            "p",
            { class: "hint", style: "margin:0 0 16px" },
            `${d.total} image${d.total === 1 ? "" : "s"}${d.total > d.items.length ? `, showing the newest ${d.items.length}` : ""}`,
          ),
          d.items.length
            ? h("div", { class: "tiles5" }, d.items.map(tileFor))
            : emptyBox(
                lState.q ? "Nothing matches" : "Nothing here yet",
                "Images you create land here with the prompt that made them.",
              ),
        );
      } catch (e) {
        holder.replaceChildren(errBox(e.message));
      }
    }
    search.addEventListener("input", () => {
      lState.q = search.value;
      clearTimeout(timer);
      timer = setTimeout(load, 220);
    });
    main.append(
      h(
        "div",
        { class: "page" },
        pageHead(
          "Library",
          "Search, open, copy or recreate anything you made. It keeps the prompt and a cloud link.",
          search,
          h(
            "button",
            { class: "btn", onclick: () => reveal(lState.folder || "") },
            icon("folder"),
            "Open folder",
          ),
        ),
        h("div", { class: "row", style: "margin:20px 0 18px" }, scopeSeg),
        holder,
      ),
    );
    await load();
  }

  // ------------------------------------------------------------ status rail
  let firstStatus = window.__BOOT__ && window.__BOOT__.drive ? window.__BOOT__.drive : null;
  async function pollStatus() {
    try {
      const s = firstStatus ? { drive: firstStatus } : await api("/api/state");
      firstStatus = null;
      $("#bridge-dot").className = "dot ok";
      $("#bridge-dot").title = "Bridge running";
      const d = s.drive || {};
      $("#drive-dot").className =
        "dot " + (d.ok === false ? "warn" : d.ok ? "ok" : "");
      $("#drive-dot").title =
        d.ok === false
          ? "Google Drive needs sign-in"
          : d.ok
            ? "Google Drive connected"
            : "Google Drive not used yet";
    } catch (e) {
      $("#bridge-dot").className = "dot bad";
      $("#bridge-dot").title = "Bridge not reachable";
    }
  }
  pollStatus();
  setInterval(pollStatus, 15000);
  render();
})();
