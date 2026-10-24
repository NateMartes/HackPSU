(function initializeProductAnalysisUI(root) {
  "use strict";

  const HOST_ID = "review-lens-analysis";

  const template = `
    <style>
      :host { all: initial; color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      .panel {
        --ink: #17212b; --muted: #697783; --line: #d9e0e5; --paper: #fff;
        --wash: #f5f7f8; --accent: #ff9900; --accent-deep: #c45500;
        position: fixed; z-index: 2147483647; right: 22px; bottom: 22px;
        width: min(368px, calc(100vw - 28px)); max-height: min(610px, calc(100vh - 44px));
        overflow: hidden auto; border: 1px solid #c9d1d8; border-radius: 14px;
        background: var(--paper); box-shadow: 0 14px 38px rgba(15,31,45,.2), 0 2px 8px rgba(15,31,45,.09);
        color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4;
        animation: arrive 220ms ease-out both;
      }
      @keyframes arrive { from { opacity: 0; transform: translateY(10px) scale(.985); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shimmer { to { transform: translateX(220%); } }
      .header {
        display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px;
        border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #fff, #fbfcfc);
      }
      .mark {
        display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center;
        border-radius: 9px; background: #17212b; color: var(--accent); font-size: 16px; font-weight: 800;
      }
      .heading { min-width: 0; flex: 1; }
      .eyebrow { color: var(--accent-deep); font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
      h2 { overflow: hidden; margin: 1px 0 0; color: var(--ink); font: 700 14px/1.3 Arial, Helvetica, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
      button { appearance: none; border: 0; background: none; color: inherit; font: inherit; }
      .close { width: 30px; height: 30px; cursor: pointer; border-radius: 50%; color: #596773; font-size: 22px; line-height: 30px; }
      .close:hover { background: #edf0f2; color: #17212b; }
      .close:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid rgba(255,153,0,.42); outline-offset: 2px; }
      .body { padding: 15px; }
      .status { display: flex; align-items: center; gap: 9px; min-height: 24px; color: #46545f; font-size: 13px; }
      .spinner { width: 16px; height: 16px; flex: 0 0 16px; border: 2px solid #d8dde1; border-top-color: var(--accent-deep); border-radius: 50%; animation: spin .75s linear infinite; }
      .status.done .spinner { display: none; }
      .status.done::before { content: "✓"; display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; background: #157347; color: #fff; font-size: 11px; font-weight: 700; }
      .status.failed .spinner { display: none; }
      .status.failed::before { content: "!"; display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; background: #b42318; color: #fff; font-size: 11px; font-weight: 700; }
      .progress { position: relative; height: 3px; margin: 11px 0 3px; overflow: hidden; border-radius: 99px; background: #e9ecef; }
      .progress::after { content: ""; position: absolute; inset: 0; width: 48%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), #ffbd5b); animation: shimmer 1.25s ease-in-out infinite; transform: translateX(-110%); }
      .sources { margin-top: 15px; }
      .section-label { margin-bottom: 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .045em; text-transform: uppercase; }
      .videos { display: flex; gap: 8px; }
      .video { position: relative; display: block; width: 70px; height: 42px; flex: 0 0 70px; overflow: hidden; border: 1px solid #d4d9dd; border-radius: 7px; background: #26313a; text-decoration: none; transition: transform 120ms ease, border-color 120ms ease; }
      .video img { width: 100%; height: 100%; object-fit: cover; }
      .video::after { content: "▶"; position: absolute; top: 50%; left: 50%; display: grid; width: 20px; height: 16px; place-items: center; border-radius: 5px; background: rgba(0,0,0,.76); color: #fff; font-size: 8px; transform: translate(-50%, -50%); }
      .video:hover { border-color: var(--accent-deep); transform: translateY(-1px); }
      .video-fallback { display: grid; width: 100%; height: 100%; place-items: center; color: #fff; font-size: 9px; font-weight: 700; }
      .result { margin-top: 15px; }
      .score-card { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); }
      .verdict-label { color: var(--muted); font-size: 11px; }
      .verdict { margin-top: 2px; font-size: 19px; font-weight: 700; text-transform: capitalize; }
      .score { display: grid; min-width: 64px; height: 50px; padding: 0 9px; place-items: center; border-radius: 9px; background: #fff; box-shadow: inset 0 0 0 1px #d6dce0; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .positive { color: #067647; } .negative { color: #b42318; } .neutral { color: #6b5d20; }
      details { margin-top: 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
      summary { padding: 11px 12px; cursor: pointer; color: #263746; font-weight: 700; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      summary::after { content: "+"; float: right; color: var(--accent-deep); font-size: 18px; }
      details[open] summary::after { content: "−"; }
      .summary-copy { margin: 0; padding: 0 12px 13px; color: #4b5964; font-size: 13px; line-height: 1.55; }
      .error { margin-top: 12px; padding: 11px 12px; border: 1px solid #f0c8c5; border-radius: 9px; background: #fff4f3; color: #8d2119; font-size: 13px; }
      [hidden] { display: none !important; }
      @media (max-width: 520px) { .panel { right: 14px; bottom: 14px; } }
      @media (prefers-reduced-motion: reduce) { .panel { animation: none; } .spinner { animation-duration: 1.5s; } .progress::after { animation-duration: 2.5s; } }
    </style>
    <aside class="panel" role="dialog" aria-labelledby="analysis-title" aria-live="polite">
      <header class="header">
        <div class="mark" aria-hidden="true">R</div>
        <div class="heading"><div class="eyebrow">Review lens</div><h2 id="analysis-title"></h2></div>
        <button class="close" type="button" aria-label="Close analysis">×</button>
      </header>
      <div class="body">
        <div class="status"><span class="spinner" aria-hidden="true"></span><span class="status-copy">Finding product reviews…</span></div>
        <div class="progress" role="progressbar" aria-label="Analysis in progress"></div>
        <section class="sources" hidden><div class="section-label">Reviews being analyzed</div><div class="videos"></div></section>
        <section class="result" hidden>
          <div class="score-card"><div><div class="verdict-label">Overall video sentiment</div><div class="verdict"></div></div><div class="score" aria-label="Sentiment score"></div></div>
          <details><summary>Full summary</summary><p class="summary-copy"></p></details>
        </section>
        <div class="error" role="alert" hidden></div>
      </div>
    </aside>`;

  function safeVideoUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["youtube.com", "www.youtube.com"].includes(url.hostname) ? url.href : null;
    } catch (_error) { return null; }
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "ytimg.com" || url.hostname.endsWith(".ytimg.com")) ? url.href : null;
    } catch (_error) { return null; }
  }

  function scoreText(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return "—";
    const normalized = Math.max(-1, Math.min(1, value));
    return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}`;
  }

  function mount(product) {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = template;
    document.documentElement.append(host);

    const panel = shadow.querySelector(".panel");
    const title = shadow.querySelector("h2");
    const status = shadow.querySelector(".status");
    const statusCopy = shadow.querySelector(".status-copy");
    const progress = shadow.querySelector(".progress");
    const sources = shadow.querySelector(".sources");
    const videosContainer = shadow.querySelector(".videos");
    const resultSection = shadow.querySelector(".result");
    const verdict = shadow.querySelector(".verdict");
    const score = shadow.querySelector(".score");
    const summaryCopy = shadow.querySelector(".summary-copy");
    const errorBox = shadow.querySelector(".error");

    title.textContent = product?.title || "Product analysis";
    panel.setAttribute("aria-label", `Review analysis for ${product?.title || "this product"}`);
    shadow.querySelector(".close").addEventListener("click", () => host.remove());

    function showVideos(videos) {
      videosContainer.replaceChildren();
      for (const video of Array.isArray(videos) ? videos.slice(0, 3) : []) {
        const href = safeVideoUrl(video?.url);
        if (!href) continue;
        const link = document.createElement("a");
        link.className = "video";
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = [video?.title, video?.channelTitle].filter(Boolean).join(" — ");
        link.setAttribute("aria-label", `Open YouTube review: ${video?.title || "video review"}`);
        const thumbnail = safeImageUrl(video?.thumbnail);
        if (thumbnail) {
          const image = document.createElement("img");
          image.src = thumbnail;
          image.alt = "";
          image.referrerPolicy = "no-referrer";
          link.append(image);
        } else {
          const fallback = document.createElement("span");
          fallback.className = "video-fallback";
          fallback.textContent = "VIDEO";
          link.append(fallback);
        }
        videosContainer.append(link);
      }
      if (videosContainer.childElementCount) {
        sources.hidden = false;
        const count = videosContainer.childElementCount;
        statusCopy.textContent = `Analyzing ${count} video review${count === 1 ? "" : "s"}…`;
      } else {
        statusCopy.textContent = "Analyzing available review transcripts…";
      }
    }

    function showResult(data) {
      const summary = data?.sentimentSummary;
      if (!summary || typeof summary !== "object") {
        showError(data?.sentimentSummaryError || "No usable video review transcripts were found.");
        return;
      }
      const label = ["positive", "neutral", "negative"].includes(summary.label) ? summary.label : "neutral";
      verdict.textContent = label;
      verdict.className = `verdict ${label}`;
      score.textContent = scoreText(summary.score);
      score.className = `score ${label}`;
      score.setAttribute("aria-label", `Sentiment score ${score.textContent} on a scale from negative one to positive one`);
      summaryCopy.textContent = summary.summary || "No written summary was returned.";
      status.classList.add("done");
      statusCopy.textContent = "Analysis complete";
      progress.hidden = true;
      errorBox.hidden = true;
      resultSection.hidden = false;
    }

    function showError(message) {
      status.classList.add("failed");
      statusCopy.textContent = "Analysis unavailable";
      progress.hidden = true;
      resultSection.hidden = true;
      errorBox.textContent = message || "We could not finish this analysis.";
      errorBox.hidden = false;
    }

    return { handleEvent(event) { if (event?.type === "videos") showVideos(event.videos); }, showResult, showError };
  }

  root.productAnalysisUI = Object.freeze({ mount });
})(globalThis);
