(function initializeProductAnalysisUI(root) {
  "use strict";

  const HOST_ID = "prvsa-analysis";
  const ICON_URL = chrome.runtime.getURL("assets/prvsa-icon.png");

  const template = `
    <style>
      :host { all: initial; color-scheme: light; }
      *, *::before, *::after { box-sizing: border-box; }
      .panel {
        --ink: #17212b; --muted: #697783; --line: #d9e0e5; --paper: #fff;
        --wash: #f5f7f8; --accent: #ff9900; --accent-deep: #c45500;
        position: fixed; z-index: 2147483647; top: 22px; left: 22px;
        display: flex; width: min(500px, calc(100vw - 28px));
        height: min(860px, calc(100vh - 44px)); flex-direction: column;
        overflow: hidden; border: 1px solid #c9d1d8; border-radius: 14px;
        background: var(--paper); box-shadow: 0 14px 38px rgba(15,31,45,.2), 0 2px 8px rgba(15,31,45,.09);
        color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.4;
        animation: arrive 220ms ease-out both;
      }
      @keyframes arrive { from { opacity: 0; transform: translateY(10px) scale(.985); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shimmer { to { transform: translateX(220%); } }
      .header {
        display: flex; flex: 0 0 auto; align-items: center; gap: 10px; padding: 14px 14px 12px;
        border-bottom: 1px solid var(--line); background: linear-gradient(180deg, #fff, #fbfcfc);
      }
      .mark {
        display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center;
        overflow: hidden; border-radius: 9px; background: transparent;
      }
      .mark img { width: 100%; height: 100%; object-fit: cover; }
      .heading { min-width: 0; flex: 1; }
      .app-title { color: var(--ink); font-size: 14px; font-weight: 800; letter-spacing: .06em; }
      h2 { overflow: hidden; margin: 2px 0 0; color: var(--ink); font: 600 13px/1.35 Arial, Helvetica, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
      button { appearance: none; border: 0; background: none; color: inherit; font: inherit; }
      .window-controls { display: flex; align-items: center; gap: 2px; }
      .window-control { display: grid; width: 30px; height: 30px; cursor: pointer; place-items: center; border-radius: 50%; color: #596773; font-size: 22px; line-height: 1; }
      .window-control:hover { background: #edf0f2; color: #17212b; }
      .window-control:focus-visible, .evidence-close:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid rgba(255,153,0,.42); outline-offset: 2px; }
      .evidence-button { position: relative; }
      .evidence-button svg { width: 18px; height: 18px; }
      .evidence-button:hover { background: linear-gradient(135deg, rgba(255,42,32,.11), rgba(40,86,255,.11)); }
      .minimize { font-size: 20px; padding-bottom: 7px; }
      .panel.minimized { width: min(500px, calc(100vw - 28px)); height: auto; }
      .panel.minimized .body { display: none; }
      .panel.minimized .header { border-bottom: 0; }
      .panel.minimized .minimize { padding-bottom: 0; font-size: 18px; }
      .body { min-height: 0; flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; padding: 15px; }
      .status { display: flex; align-items: center; gap: 9px; min-height: 24px; color: #46545f; font-size: 13px; }
      .spinner { width: 16px; height: 16px; flex: 0 0 16px; border: 2px solid; border-color: #ff2a20 #ffe600 #20c763 #2856ff; border-radius: 50%; animation: spin .75s linear infinite; }
      .status.done .spinner { display: none; }
      .status.done::before { content: "✓"; display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; background: #157347; color: #fff; font-size: 11px; font-weight: 700; }
      .status.failed .spinner { display: none; }
      .status.failed::before { content: "!"; display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; background: #b42318; color: #fff; font-size: 11px; font-weight: 700; }
      .progress { position: relative; height: 3px; margin: 11px 0 3px; overflow: hidden; border-radius: 99px; background: #e9ecef; }
      .progress::after { content: ""; position: absolute; inset: 0; width: 58%; border-radius: inherit; background: linear-gradient(90deg, #ff2a20 0%, #ff8a00 16%, #ffe600 31%, #20c763 47%, #00b8f5 63%, #2856ff 79%, #8d2cff 100%); animation: shimmer 1.25s ease-in-out infinite; transform: translateX(-110%); }
      .final-result { margin-top: 12px; border-color: #efb44f; background: #fff8e9; }
      .final-result .verdict-label { color: #713b00; font-weight: 700; }
      .full-summary { margin-top: 12px; border-color: #a9cce8; background: #f3f8ff; }
      .full-summary summary { color: #17466f; }
      .sources { margin-top: 15px; }
      .section-label { margin-bottom: 8px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .045em; text-transform: uppercase; }
      .videos { display: flex; gap: 8px; }
      .video { position: relative; display: block; width: 70px; height: 42px; flex: 0 0 70px; overflow: hidden; border: 1px solid #d4d9dd; border-radius: 7px; background: #26313a; text-decoration: none; transition: transform 120ms ease, border-color 120ms ease; }
      .video img { width: 100%; height: 100%; object-fit: cover; }
      .video::after { content: "▶"; position: absolute; top: 50%; left: 50%; display: grid; width: 20px; height: 16px; place-items: center; border-radius: 5px; background: rgba(0,0,0,.76); color: #fff; font-size: 8px; transform: translate(-50%, -50%); }
      .video-placeholder { border-color: #dfe4e7; background: #e7ebee; pointer-events: none; }
      .video-placeholder::after { content: ""; position: absolute; inset: 0; display: block; width: 45%; height: auto; border-radius: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), transparent); animation: shimmer 1.25s ease-in-out infinite; transform: translateX(-120%); }
      .video:hover { border-color: var(--accent-deep); transform: translateY(-1px); }
      .video-placeholder:hover { border-color: #dfe4e7; transform: none; }
      .video-fallback { display: grid; width: 100%; height: 100%; place-items: center; color: #fff; font-size: 9px; font-weight: 700; }
      .prices { margin-top: 15px; }
      .price-overview { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: 10px; background: #f3f8ff; }
      .current-price { color: #17466f; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .price-count { color: var(--muted); font-size: 12px; }
      .price-sentiment { margin-top: 7px; }
      .price-details { margin-top: 7px; }
      .price-details summary { padding: 9px 10px; font-size: 12px; }
      .price-analysis-copy { padding-bottom: 9px; }
      .price-offer-heading { padding: 0 12px 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .price-offers { display: grid; gap: 7px; padding: 0 7px 7px; }
      .price-offer { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--wash); }
      .price-offer-title { overflow: hidden; color: #34434f; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .price-offer-value { color: #17466f; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .price-offer-meta { grid-column: 1 / -1; color: var(--muted); font-size: 10px; }
      .shopping { margin-top: 15px; }
      .shopping-overview { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 12px; border: 1px solid #a9cce8; border-radius: 10px; background: #f3f8ff; }
      .shopping-score { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .shopping-stars { --rating-fill: 0%; position: relative; display: inline-block; color: #d5dadd; font-size: 17px; letter-spacing: 1px; line-height: 1; white-space: nowrap; }
      .shopping-stars::before { content: "★★★★★"; position: absolute; inset: 0 auto 0 0; width: var(--rating-fill); overflow: hidden; color: var(--accent); white-space: nowrap; }
      .shopping-rating { color: #713b00; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .shopping-count { color: var(--muted); font-size: 12px; }
      .shopping-sentiment { margin-top: 7px; }
      .shopping-reviews { display: grid; gap: 7px; padding: 0 7px 7px; }
      .shopping-review { padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--wash); }
      .shopping-review-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 10px; font-weight: 700; }
      .shopping-review-copy { display: -webkit-box; overflow: hidden; margin: 5px 0 0; color: #3e4b55; font-size: 12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
      .shopping-analysis { margin-top: 7px; }
      .shopping-analysis summary { padding: 9px 10px; font-size: 12px; }
      .shopping-review-heading { padding: 0 12px 7px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .result { margin-top: 15px; }
      .score-card { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--wash); }
      .verdict-label { color: var(--muted); font-size: 11px; }
      .verdict { margin-top: 2px; font-size: 19px; font-weight: 700; text-transform: capitalize; }
      .score { display: grid; min-width: 64px; height: 50px; padding: 0 9px; place-items: center; border-radius: 9px; background: #fff; box-shadow: inset 0 0 0 1px #d6dce0; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .positive { color: #067647; } .negative { color: #b42318; } .neutral { color: #6b5d20; }
      .skeleton { position: relative; overflow: hidden; background: #e7ebee; color: transparent; }
      .skeleton::after { content: ""; position: absolute; inset: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: shimmer 1.25s ease-in-out infinite; transform: translateX(-120%); }
      .verdict.skeleton { width: 112px; height: 23px; margin-top: 4px; border-radius: 6px; }
      .score.skeleton { box-shadow: none; }
      .shopping-stars.skeleton { width: 96px; height: 17px; border-radius: 5px; }
      .shopping-stars.skeleton::before { content: none; }
      .shopping-rating.skeleton { display: inline-block; width: 28px; height: 16px; border-radius: 5px; }
      .shopping-count.skeleton, .price-count.skeleton { display: inline-block; width: 72px; height: 14px; border-radius: 5px; }
      .current-price.skeleton { display: inline-block; width: 112px; height: 22px; border-radius: 5px; }
      .analysis-placeholder { height: 43px; margin-top: 10px; padding: 13px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
      .analysis-placeholder .skeleton { width: 118px; height: 15px; border-radius: 5px; }
      details { margin-top: 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
      summary { padding: 11px 12px; cursor: pointer; color: #263746; font-weight: 700; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      summary::after { content: "+"; float: right; color: var(--accent-deep); font-size: 18px; }
      details[open] summary::after { content: "−"; }
      .summary-copy { margin: 0; padding: 0 12px 13px; color: #4b5964; font-size: 13px; line-height: 1.55; }
      .error { margin-top: 12px; padding: 11px 12px; border: 1px solid #f0c8c5; border-radius: 9px; background: #fff4f3; color: #8d2119; font-size: 13px; }
      .evidence-layer {
        position: fixed; z-index: 2147483647; inset: 0; display: grid; padding: 24px;
        place-items: center; background: rgba(10, 16, 25, .62); backdrop-filter: blur(4px);
        font-family: Arial, Helvetica, sans-serif; animation: evidence-fade 180ms ease-out both;
      }
      .evidence-dialog {
        display: flex; width: min(1060px, calc(100vw - 32px)); max-height: min(760px, calc(100vh - 32px));
        flex-direction: column; overflow: hidden; border: 1px solid rgba(111, 122, 135, .36);
        border-radius: 20px; background: #fff; box-shadow: 0 28px 90px rgba(4, 12, 22, .34);
        color: #17212b; animation: evidence-arrive 220ms cubic-bezier(.2,.8,.2,1) both;
      }
      .evidence-header {
        display: flex; align-items: center; gap: 18px; padding: 14px 18px 14px 22px;
        border-bottom: 1px solid #dfe4e8; background: linear-gradient(110deg, #fff 52%, #f5f8ff);
      }
      .evidence-heading { min-width: 0; flex: 1; }
      .evidence-title { margin: 0; color: #17212b; font: 800 20px/1.2 Arial, Helvetica, sans-serif; }
      .evidence-close {
        display: grid; width: 34px; height: 34px; flex: 0 0 34px; cursor: pointer; place-items: center;
        border: 1px solid #d8dee3; border-radius: 50%; background: #fff; color: #53616d; font-size: 22px; line-height: 1;
      }
      .evidence-close:hover { border-color: #bcc6ce; background: #f3f5f6; color: #17212b; }
      .evidence-viewport {
        overflow: auto; background-color: #fbfaf7;
        background-image: linear-gradient(#dfe4e8 1px, transparent 1px), linear-gradient(90deg, #dfe4e8 1px, transparent 1px);
        background-size: 24px 24px; scrollbar-color: #aeb9c2 transparent;
      }
      .evidence-canvas { position: relative; width: 100%; min-width: 760px; height: 570px; }
      .evidence-canvas svg { display: block; width: 100%; height: 100%; cursor: grab; }
      .evidence-canvas svg:active { cursor: grabbing; }
      .graph-link { fill: none; stroke-linecap: round; opacity: .62; }
      .graph-node { color: #17212b; text-decoration: none; cursor: grab; }
      .graph-node[href] { cursor: pointer; }
      .graph-node:active { cursor: grabbing; }
      .graph-node rect { fill: rgba(255,255,255,.97); stroke: #d5dde3; stroke-width: 1.2; filter: url(#node-shadow); }
      .graph-node:hover rect, .graph-node:focus-visible rect { stroke: var(--node-color, #637381); stroke-width: 2; }
      .graph-node:focus-visible { outline: none; }
      .graph-node .node-accent { fill: var(--node-color, #637381); stroke: none; filter: none; }
      .graph-node .node-rgb-halo { fill: none; stroke: url(#prvsa-node-gradient); stroke-width: 8; stroke-linecap: round; stroke-dasharray: 16 8; opacity: 0; filter: none; pointer-events: none; transition: opacity 160ms ease; }
      .graph-node .node-dot { fill: var(--node-color, #637381); }
      .graph-node text { pointer-events: none; font-family: Arial, Helvetica, sans-serif; }
      .graph-node .node-kicker { fill: #7b8791; font-size: 8px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
      .graph-node .node-label { fill: #1b2731; font-size: 11px; font-weight: 800; }
      .graph-node .node-detail { fill: #697680; font-size: 9px; }
      .graph-node .node-meta { fill: #89939b; font-size: 8px; }
      .graph-node .sentiment-positive { fill: #07824f; font-weight: 800; }
      .graph-node .sentiment-negative { fill: #c0352b; font-weight: 800; }
      .graph-node .sentiment-neutral { fill: #7a6824; font-weight: 800; }
      .graph-node--leaf .node-label { font-size: 9px; font-weight: 700; }
      .graph-node--leaf .node-external { fill: #78858f; font-size: 9px; }
      .graph-empty { fill: #74818b; font-size: 12px; font-style: italic; text-anchor: middle; }
      .graph-node--hub:hover .node-card, .graph-node--hub:focus-visible .node-card {
        stroke: url(#prvsa-node-gradient); stroke-width: 3;
      }
      .graph-node--hub:hover .node-rgb-halo, .graph-node--hub:focus-visible .node-rgb-halo {
        opacity: .9; filter: drop-shadow(0 0 5px rgba(255,42,32,.52)) drop-shadow(0 0 8px rgba(40,86,255,.46));
        animation: consensus-halo-flow 720ms linear infinite;
      }
      .evidence-footer {
        display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 10px 22px;
        border-top: 1px solid #dfe4e8; background: #fff; color: #6e7a84; font-size: 10px;
      }
      .evidence-key { display: flex; flex-wrap: wrap; gap: 11px; }
      .evidence-key span::before { content: ""; display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--key-color); }
      @keyframes evidence-fade { from { opacity: 0; } }
      @keyframes evidence-arrive { from { opacity: 0; transform: translateY(12px) scale(.98); } }
      @keyframes consensus-halo-flow { to { stroke-dashoffset: -48; } }
      [hidden] { display: none !important; }
      @media (max-width: 520px) { .panel { top: 14px; left: 14px; } }
      @media (max-width: 720px) { .evidence-layer { padding: 10px; } .evidence-dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); } .evidence-header { padding: 13px 14px 13px 16px; } .evidence-title { font-size: 18px; } .evidence-footer { align-items: flex-start; flex-direction: column; padding: 10px 16px; } }
      @media (prefers-reduced-motion: reduce) { .panel, .evidence-layer, .evidence-dialog { animation: none; } .spinner { animation-duration: 1.5s; } .progress::after { animation-duration: 2.5s; } .graph-node--hub:hover .node-rgb-halo, .graph-node--hub:focus-visible .node-rgb-halo { animation: none; } }
    </style>
    <aside class="panel" role="dialog" aria-labelledby="analysis-title" aria-live="polite">
      <header class="header">
        <div class="mark" aria-hidden="true"><img src="${ICON_URL}" alt=""></div>
        <div class="heading"><div class="app-title">P.R.V.S.A.</div><h2 id="analysis-title"></h2></div>
        <div class="window-controls">
          <button class="evidence-button window-control" type="button" aria-label="Open evidence graph" aria-haspopup="dialog" title="View evidence graph">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <defs><linearGradient id="evidence-gradient" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse"><stop stop-color="#ff2a20"/><stop offset=".26" stop-color="#ffb800"/><stop offset=".52" stop-color="#20c763"/><stop offset=".76" stop-color="#2856ff"/><stop offset="1" stop-color="#8d2cff"/></linearGradient></defs>
              <path d="M10.5 17a6.5 6.5 0 1 1 4.6-1.9L21 21" fill="none" stroke="url(#evidence-gradient)" stroke-width="2" stroke-linecap="round"/>
              <path d="M7.5 12.5 10 10l2 2 2.5-3" fill="none" stroke="url(#evidence-gradient)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="7.5" cy="12.5" r="1" fill="#ff4b22"/><circle cx="10" cy="10" r="1" fill="#20c763"/><circle cx="12" cy="12" r="1" fill="#2856ff"/><circle cx="14.5" cy="9" r="1" fill="#8d2cff"/>
            </svg>
          </button>
          <button class="minimize window-control" type="button" aria-label="Minimize analysis" aria-expanded="true" title="Minimize">−</button>
          <button class="close window-control" type="button" aria-label="Close analysis" title="Close">×</button>
        </div>
      </header>
      <div class="body">
        <div class="status"><span class="spinner" aria-hidden="true"></span><span class="status-copy">Finding product reviews…</span></div>
        <div class="progress" role="progressbar" aria-label="Analysis in progress"></div>
        <section class="final-result score-card" aria-busy="true">
          <div><div class="verdict-label">Final weighted score</div><div class="final-verdict verdict skeleton" aria-hidden="true"></div></div>
          <div class="final-score score skeleton" aria-hidden="true"></div>
        </section>
        <details class="full-summary" hidden><summary>Full Summary</summary><p class="full-summary-copy summary-copy"></p></details>
        <section class="sources">
          <div class="section-label">Video reviews</div>
          <div class="videos" aria-busy="true" aria-label="Loading video reviews">
            <span class="video video-placeholder" aria-hidden="true"></span>
            <span class="video video-placeholder" aria-hidden="true"></span>
            <span class="video video-placeholder" aria-hidden="true"></span>
          </div>
        </section>
        <section class="result" aria-busy="true">
          <div class="score-card"><div><div class="verdict-label">Overall video sentiment</div><div class="video-verdict verdict skeleton" aria-hidden="true"></div></div><div class="video-score score skeleton" aria-hidden="true"></div></div>
          <div class="analysis-placeholder" aria-hidden="true"><div class="skeleton"></div></div>
          <details class="video-analysis" hidden><summary>Video Analysis</summary><p class="video-analysis-copy summary-copy"></p></details>
        </section>
        <section class="shopping" aria-busy="true">
          <div class="section-label">Reviews from Google Products</div>
          <div class="shopping-overview">
            <div class="shopping-score"><span class="shopping-stars skeleton" aria-hidden="true">★★★★★</span><span class="shopping-rating skeleton" aria-hidden="true"></span></div>
            <span class="shopping-count skeleton" aria-hidden="true"></span>
          </div>
          <div class="shopping-sentiment score-card">
            <div><div class="verdict-label">Overall shopping sentiment</div><div class="shopping-verdict verdict skeleton" aria-hidden="true"></div></div>
            <div class="shopping-sentiment-score score skeleton" aria-hidden="true"></div>
          </div>
          <div class="shopping-analysis-placeholder analysis-placeholder" aria-hidden="true"><div class="skeleton"></div></div>
          <details class="shopping-analysis" hidden>
            <summary>Reviews Summary</summary>
            <p class="shopping-analysis-copy summary-copy"></p>
            <div class="shopping-review-heading" hidden></div>
            <div class="shopping-reviews"></div>
          </details>
        </section>
        <section class="prices" aria-busy="true">
          <div class="section-label">Price comparison</div>
          <div class="price-overview">
            <span class="current-price skeleton" aria-hidden="true"></span>
            <span class="price-count skeleton" aria-hidden="true"></span>
          </div>
          <div class="price-sentiment score-card">
            <div><div class="verdict-label">Price value</div><div class="price-verdict verdict skeleton" aria-hidden="true"></div></div>
            <div class="price-sentiment-score score skeleton" aria-hidden="true"></div>
          </div>
          <div class="price-analysis-placeholder analysis-placeholder" aria-hidden="true"><div class="skeleton"></div></div>
          <details class="price-details" hidden>
            <summary>Price Analysis</summary>
            <p class="price-analysis-copy summary-copy"></p>
            <div class="price-offer-heading" hidden></div>
            <div class="price-offers"></div>
          </details>
        </section>
        <div class="error" role="alert" hidden></div>
      </div>
    </aside>
    <div class="evidence-layer" hidden>
      <section class="evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
        <header class="evidence-header">
          <div class="evidence-heading">
            <h3 class="evidence-title" id="evidence-title">Evidence graph</h3>
          </div>
          <button class="evidence-close" type="button" aria-label="Close evidence graph" title="Close">×</button>
        </header>
        <div class="evidence-viewport">
          <div class="evidence-canvas" role="region" aria-label="Interactive evidence graph showing the product, PRVSA analysis, and research sources"></div>
        </div>
        <footer class="evidence-footer">
          <div class="evidence-key"><span style="--key-color:#ff4a22">Video</span><span style="--key-color:#20c763">Reviews</span><span style="--key-color:#315cf0">Prices</span><span>Hover Consensus for its RGB halo · drag nodes · scroll to zoom</span></div>
          <div class="evidence-status" aria-live="polite">Research sources are loading.</div>
        </footer>
      </section>
    </div>`;

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

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch (_error) { return null; }
  }

  function firstEvidenceUrl(value) {
    if (!value || typeof value !== "object") return null;
    for (const key of ["link", "product_link", "url"]) {
      const url = safeHttpUrl(value[key]);
      if (!url) continue;
      const hostname = new URL(url).hostname;
      if (hostname === "serpapi.com" || hostname.endsWith(".serpapi.com")) continue;
      return url;
    }
    return null;
  }

  function scoreText(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return "—";
    const normalized = Math.max(-1, Math.min(1, value));
    return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}`;
  }

  function moneyText(value, currency) {
    if (value == null || value === "") return "Price unavailable";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "Price unavailable";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: typeof currency === "string" && currency ? currency : "USD",
      }).format(numeric);
    } catch (_error) {
      return `${numeric.toFixed(2)} ${currency || ""}`.trim();
    }
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
    const pricesSection = shadow.querySelector(".prices");
    const currentPrice = shadow.querySelector(".current-price");
    const priceCount = shadow.querySelector(".price-count");
    const priceSentiment = shadow.querySelector(".price-sentiment");
    const priceVerdict = shadow.querySelector(".price-verdict");
    const priceSentimentScore = shadow.querySelector(".price-sentiment-score");
    const priceDetails = shadow.querySelector(".price-details");
    const priceAnalysisPlaceholder = shadow.querySelector(".price-analysis-placeholder");
    const priceAnalysisCopy = shadow.querySelector(".price-analysis-copy");
    const priceOfferHeading = shadow.querySelector(".price-offer-heading");
    const priceOffers = shadow.querySelector(".price-offers");
    const shoppingSection = shadow.querySelector(".shopping");
    const shoppingStars = shadow.querySelector(".shopping-stars");
    const shoppingRating = shadow.querySelector(".shopping-rating");
    const shoppingCount = shadow.querySelector(".shopping-count");
    const shoppingSentiment = shadow.querySelector(".shopping-sentiment");
    const shoppingVerdict = shadow.querySelector(".shopping-verdict");
    const shoppingSentimentScore = shadow.querySelector(".shopping-sentiment-score");
    const shoppingReviewHeading = shadow.querySelector(".shopping-review-heading");
    const shoppingReviews = shadow.querySelector(".shopping-reviews");
    const shoppingAnalysis = shadow.querySelector(".shopping-analysis");
    const shoppingAnalysisPlaceholder = shadow.querySelector(".shopping-analysis-placeholder");
    const shoppingAnalysisCopy = shadow.querySelector(".shopping-analysis-copy");
    const resultSection = shadow.querySelector(".result");
    const verdict = shadow.querySelector(".video-verdict");
    const score = shadow.querySelector(".video-score");
    const analysisPlaceholder = shadow.querySelector(".analysis-placeholder");
    const videoAnalysis = shadow.querySelector(".video-analysis");
    const videoAnalysisCopy = shadow.querySelector(".video-analysis-copy");
    const fullSummary = shadow.querySelector(".full-summary");
    const fullSummaryCopy = shadow.querySelector(".full-summary-copy");
    const finalResult = shadow.querySelector(".final-result");
    const finalVerdict = shadow.querySelector(".final-verdict");
    const finalScore = shadow.querySelector(".final-score");
    const errorBox = shadow.querySelector(".error");
    const evidenceButton = shadow.querySelector(".evidence-button");
    const evidenceLayer = shadow.querySelector(".evidence-layer");
    const evidenceClose = shadow.querySelector(".evidence-close");
    const evidenceCanvas = shadow.querySelector(".evidence-canvas");
    const evidenceStatus = shadow.querySelector(".evidence-status");
    const streamedAnalyses = new Map();
    const evidence = {
      videos: [],
      shopping: null,
      prices: null,
      result: null,
      sentiments: { video: null, reviews: null, prices: null },
    };
    let evidenceReturnFocus = null;

    title.textContent = product?.title || "Product analysis";
    panel.setAttribute("aria-label", `Review analysis for ${product?.title || "this product"}`);

    function countLabel(count, singular, plural = `${singular}s`) {
      return `${count} ${count === 1 ? singular : plural}`;
    }

    function shortened(value, maximum = 28) {
      const text = String(value || "").trim();
      return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
    }

    function sentimentText(sentiment, fallback = "Analysis in progress") {
      if (!sentiment || typeof sentiment !== "object") return fallback;
      const label = ["positive", "neutral", "negative"].includes(sentiment.label)
        ? sentiment.label
        : "neutral";
      return `${label[0].toUpperCase() + label.slice(1)} ${scoreText(sentiment.score)}`;
    }

    function renderEvidenceGraph() {
      if (!root.d3) {
        evidenceCanvas.textContent = "The evidence graph could not load.";
        return;
      }

      const amazonUrl = safeHttpUrl(product?.url) || safeHttpUrl(globalThis.location?.href);
      const videoItems = evidence.videos.flatMap((video) => {
        const url = safeVideoUrl(video?.url);
        if (!url) return [];
        return [{
          label: [video?.title || "YouTube review", video?.channelTitle].filter(Boolean).join(" — "),
          url,
          group: "video",
        }];
      });

      const shoppingData = evidence.shopping;
      const selectedShoppingResult = shoppingData?.sourceData?.selectedShoppingResult;
      const shoppingUrl = firstEvidenceUrl(selectedShoppingResult)
        || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(product?.title || "")}`;
      const reviewItems = shoppingData ? [{
        label: Number.isFinite(Number(shoppingData.rating))
          ? `Google Products · ${Number(shoppingData.rating).toFixed(1)} stars · ${shoppingData.reviews ?? "review data"}`
          : "Google Products review record",
        url: shoppingUrl,
        group: "reviews",
      }] : [];
      const reviewSources = new Map();
      for (const review of Array.isArray(shoppingData?.review_details) ? shoppingData.review_details : []) {
        const sourceName = typeof review?.source === "string" && review.source.trim()
          ? review.source.trim()
          : "Shopper review";
        const sourceUrl = firstEvidenceUrl(review);
        if (!reviewSources.has(sourceName) || (!reviewSources.get(sourceName) && sourceUrl)) {
          reviewSources.set(sourceName, sourceUrl);
        }
      }
      for (const [sourceName, sourceUrl] of reviewSources) {
        reviewItems.push({
          label: sourceName,
          url: sourceUrl
            || `https://www.google.com/search?q=${encodeURIComponent(`${product?.title || "product"} ${sourceName} reviews`)}`,
          group: "reviews",
        });
      }

      const offers = Array.isArray(evidence.prices?.offers) ? evidence.prices.offers : [];
      const rawOffers = Array.isArray(evidence.prices?.sourceData?.shoppingResults)
        ? evidence.prices.sourceData.shoppingResults
        : [];
      const priceItems = offers.map((offer, index) => {
        const matchingRawOffer = rawOffers.find((candidate) => (
          candidate?.title === offer?.title
          && candidate?.source === offer?.source
          && candidate?.price === offer?.price
        )) || rawOffers[index];
        return {
          label: [offer?.source || offer?.title || "Market offer", offer?.price].filter(Boolean).join(" · "),
          url: firstEvidenceUrl(offer)
            || firstEvidenceUrl(matchingRawOffer)
            || `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${product?.title || "product"} ${offer?.source || offer?.title || "offer"}`)}`,
          group: "prices",
        };
      });

      const productDetail = [product?.brand, product?.model, product?.variant]
        .filter(Boolean)
        .join(" · ") || "Current Amazon product page";
      const resultDetail = sentimentText(evidence.result, "Consensus is being calculated");
      const treeData = {
        id: "prvsa",
        label: "Consensus",
        kicker: "P.R.V.S.A. aggregate",
        detail: resultDetail,
        meta: evidence.result?.complete ? "Final weighted sentiment" : "Live weighted sentiment",
        tone: evidence.result?.label,
        kind: "hub",
        group: "hub",
        children: [
          {
            id: "product",
            label: product?.title || "Amazon product",
            kicker: "Starting point",
            detail: productDetail,
            meta: product?.price != null ? `Amazon price · ${moneyText(product.price, product.currency)}` : "Amazon listing",
            kind: "main",
            group: "product",
            url: amazonUrl,
          },
          {
            id: "video",
            label: "YouTube transcripts",
            kicker: "Independent reviews",
            detail: sentimentText(evidence.sentiments.video),
            meta: `${countLabel(videoItems.length, "source")} · 45% weight`,
            tone: evidence.sentiments.video?.label,
            kind: "main",
            group: "video",
            children: videoItems.map((item, index) => ({ ...item, id: `video-${index}`, kind: "leaf" })),
          },
          {
            id: "reviews",
            label: "Google Products",
            kicker: "Shopper feedback",
            detail: sentimentText(evidence.sentiments.reviews),
            meta: `${countLabel(reviewItems.length, "source")} · 35% weight`,
            tone: evidence.sentiments.reviews?.label,
            kind: "main",
            group: "reviews",
            children: reviewItems.map((item, index) => ({ ...item, id: `review-${index}`, kind: "leaf" })),
          },
          {
            id: "prices",
            label: "Google Shopping",
            kicker: "Market context",
            detail: sentimentText(evidence.sentiments.prices),
            meta: `${countLabel(priceItems.length, "offer")} · 20% weight`,
            tone: evidence.sentiments.prices?.label,
            kind: "main",
            group: "prices",
            children: priceItems.map((item, index) => ({ ...item, id: `price-${index}`, kind: "leaf" })),
          },
        ],
      };

      const d3 = root.d3;
      const hierarchy = d3.hierarchy(treeData);
      hierarchy.each((node) => {
        if (node.data.kind === "leaf" && !safeHttpUrl(node.data.url)) {
          node.data.url = `https://www.google.com/search?q=${encodeURIComponent(`${product?.title || "product"} ${node.data.label}`)}`;
        }
      });
      const leafCount = hierarchy.leaves().length;
      const graphWidth = 1200;
      const graphHeight = Math.max(570, (leafCount * 60) + 190);
      d3.tree().size([graphHeight - 110, 1]).separation((left, right) => (
        left.parent === right.parent ? 1 : 1.25
      ))(hierarchy);
      hierarchy.each((node) => {
        node.x += 55;
        if (node.data.id === "prvsa") {
          node.x = graphHeight / 2;
          node.y = 500;
        } else if (node.data.id === "product") {
          node.x = graphHeight / 2;
          node.y = 160;
        } else {
          node.y = node.depth === 1 ? 780 : 1050;
        }
      });

      evidenceCanvas.replaceChildren();
      evidenceCanvas.style.height = `${graphHeight}px`;
      const svg = d3.select(evidenceCanvas)
        .append("svg")
        .attr("viewBox", `0 0 ${graphWidth} ${graphHeight}`)
        .attr("role", "group")
        .attr("aria-label", "D3 evidence network");
      const defs = svg.append("defs");
      const gradient = defs.append("linearGradient")
        .attr("id", "prvsa-node-gradient")
        .attr("gradientUnits", "userSpaceOnUse")
        .attr("x1", -100)
        .attr("x2", 100);
      gradient.append("stop").attr("offset", "0%").attr("stop-color", "#ff2a20");
      gradient.append("stop").attr("offset", "28%").attr("stop-color", "#ffe600");
      gradient.append("stop").attr("offset", "52%").attr("stop-color", "#20c763");
      gradient.append("stop").attr("offset", "76%").attr("stop-color", "#2856ff");
      gradient.append("stop").attr("offset", "100%").attr("stop-color", "#8d2cff");
      const filter = defs.append("filter").attr("id", "node-shadow").attr("x", "-30%").attr("y", "-40%").attr("width", "160%").attr("height", "180%");
      filter.append("feDropShadow").attr("dx", 0).attr("dy", 4).attr("stdDeviation", 5).attr("flood-color", "#17212b").attr("flood-opacity", .12);

      const scene = svg.append("g");
      const groupColor = {
        hub: "url(#prvsa-node-gradient)",
        product: "#ff8a00",
        video: "#ff4a22",
        reviews: "#20b887",
        prices: "#4263eb",
      };
      const linkShape = d3.linkHorizontal().x((point) => point.y).y((point) => point.x);
      const links = scene.append("g")
        .selectAll("path")
        .data(hierarchy.links())
        .join("path")
        .attr("class", "graph-link")
        .attr("stroke", (link) => groupColor[link.target.data.group] || "#9aa5ae")
        .attr("stroke-width", (link) => link.target.depth === 1 ? 3 : 1.6)
        .attr("stroke-dasharray", (link) => link.target.depth === 1 ? "7 7" : "4 5")
        .attr("d", linkShape);
      const nodes = scene.append("g")
        .selectAll("a")
        .data(hierarchy.descendants())
        .join("a")
        .attr("class", (node) => `graph-node graph-node--${node.data.kind}`)
        .attr("href", (node) => safeHttpUrl(node.data.url) || null)
        .attr("xlink:href", (node) => safeHttpUrl(node.data.url) || null)
        .attr("target", (node) => node.data.url ? "_blank" : null)
        .attr("rel", (node) => node.data.url ? "noopener noreferrer" : null)
        .attr("aria-label", (node) => {
          const description = [node.data.label, node.data.detail, node.data.meta].filter(Boolean).join(". ");
          return node.data.url ? `Open source: ${description}` : description;
        })
        .attr("tabindex", (node) => node.data.url || node.data.kind === "hub" ? 0 : -1)
        .style("--node-color", (node) => groupColor[node.data.group] || "#7b8791")
        .attr("transform", (node) => `translate(${node.y},${node.x})`);

      nodes.append("title").text((node) => (
        node.data.kind === "hub"
          ? "Consensus — hover for the RGB border flow"
          : `${node.data.label}${node.data.url ? " — open source" : ""}`
      ));
      nodes.filter((node) => node.data.kind === "hub")
        .append("rect")
        .attr("class", "node-rgb-halo")
        .attr("x", -99)
        .attr("y", -48)
        .attr("width", 198)
        .attr("height", 96)
        .attr("rx", 19);
      nodes.append("rect")
        .attr("class", "node-card")
        .attr("x", (node) => node.data.kind === "leaf" ? -86 : -94)
        .attr("y", (node) => node.data.kind === "leaf" ? -17 : -43)
        .attr("width", (node) => node.data.kind === "leaf" ? 172 : 188)
        .attr("height", (node) => node.data.kind === "leaf" ? 34 : 86)
        .attr("rx", (node) => node.data.kind === "leaf" ? 9 : 14);
      nodes.filter((node) => node.data.kind !== "leaf")
        .append("rect")
        .attr("class", "node-accent")
        .attr("x", -94)
        .attr("y", -43)
        .attr("width", 188)
        .attr("height", 4)
        .attr("rx", 2);
      nodes.filter((node) => node.data.kind === "leaf")
        .append("circle")
        .attr("class", "node-dot")
        .attr("cx", -72)
        .attr("cy", 0)
        .attr("r", 4);
      nodes.filter((node) => node.data.kind !== "leaf")
        .append("text")
        .attr("class", "node-kicker")
        .attr("x", -80)
        .attr("y", -18)
        .text((node) => node.data.kicker);
      nodes.append("text")
        .attr("class", "node-label")
        .attr("x", (node) => node.data.kind === "leaf" ? -61 : -80)
        .attr("y", (node) => node.data.kind === "leaf" ? 3 : 0)
        .text((node) => shortened(node.data.label, node.data.kind === "leaf" ? 25 : 26));
      nodes.filter((node) => node.data.kind !== "leaf")
        .append("text")
        .attr("class", (node) => `node-detail${node.data.tone ? ` sentiment-${node.data.tone}` : ""}`)
        .attr("x", -80)
        .attr("y", 18)
        .text((node) => shortened(node.data.detail, 31));
      nodes.filter((node) => node.data.kind !== "leaf" && node.data.meta)
        .append("text")
        .attr("class", "node-meta")
        .attr("x", -80)
        .attr("y", 33)
        .text((node) => shortened(node.data.meta, 35));
      nodes.filter((node) => node.data.kind === "leaf" && node.data.url)
        .append("text")
        .attr("class", "node-external")
        .attr("x", 72)
        .attr("y", 3)
        .text("↗");

      const updatePositions = () => {
        nodes.attr("transform", (node) => `translate(${node.y},${node.x})`);
        links.attr("d", linkShape);
      };
      nodes.filter((node) => !node.data.url).call(d3.drag()
        .on("start", (event) => event.sourceEvent?.stopPropagation())
        .on("drag", (event, node) => {
          node.y += event.dx;
          node.x += event.dy;
          updatePositions();
        }));
      svg.call(d3.zoom()
        .scaleExtent([.55, 2.2])
        .on("zoom", (event) => scene.attr("transform", event.transform)));

      const totalPoints = 1 + videoItems.length + reviewItems.length + priceItems.length;
      evidenceStatus.textContent = `${countLabel(totalPoints, "evidence point")} mapped with D3. Every source leaf opens its source or a focused research search.`;
    }

    function closeEvidenceGraph() {
      if (evidenceLayer.hidden) return;
      evidenceLayer.hidden = true;
      panel.removeAttribute("aria-hidden");
      evidenceButton.setAttribute("aria-expanded", "false");
      evidenceReturnFocus?.focus();
      evidenceReturnFocus = null;
    }

    function openEvidenceGraph() {
      evidenceReturnFocus = shadow.activeElement || evidenceButton;
      renderEvidenceGraph();
      evidenceLayer.hidden = false;
      panel.setAttribute("aria-hidden", "true");
      evidenceButton.setAttribute("aria-expanded", "true");
      evidenceClose.focus();
    }

    evidenceButton.setAttribute("aria-expanded", "false");
    evidenceButton.addEventListener("click", openEvidenceGraph);
    evidenceClose.addEventListener("click", closeEvidenceGraph);
    evidenceLayer.addEventListener("click", (event) => {
      if (event.target === evidenceLayer) closeEvidenceGraph();
    });
    evidenceLayer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEvidenceGraph();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...evidenceLayer.querySelectorAll("button, a[href]")]
        .filter((element) => !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    shadow.querySelector(".close").addEventListener("click", () => host.remove());
    const minimizeButton = shadow.querySelector(".minimize");
    minimizeButton.addEventListener("click", () => {
      const minimized = panel.classList.toggle("minimized");
      minimizeButton.textContent = minimized ? "□" : "−";
      minimizeButton.setAttribute("aria-label", minimized ? "Restore analysis" : "Minimize analysis");
      minimizeButton.setAttribute("aria-expanded", String(!minimized));
      minimizeButton.title = minimized ? "Restore" : "Minimize";
    });
    renderEvidenceGraph();

    function showPriceInformation(data) {
      const offers = Array.isArray(data?.offers)
        ? data.offers.filter((offer) => offer && typeof offer === "object")
        : [];
      const hasCurrentPrice = data?.current_price != null
        && data.current_price !== ""
        && Number.isFinite(Number(data.current_price));
      if (!hasCurrentPrice && !offers.length) return;
      evidence.prices = data;
      renderEvidenceGraph();

      currentPrice.textContent = hasCurrentPrice
        ? `Amazon ${moneyText(data.current_price, data.currency)}`
        : "Amazon price unavailable";
      priceCount.textContent = `${offers.length} offer${offers.length === 1 ? "" : "s"} found`;
      currentPrice.classList.remove("skeleton");
      currentPrice.removeAttribute("aria-hidden");
      priceCount.classList.remove("skeleton");
      priceCount.removeAttribute("aria-hidden");
      priceOffers.replaceChildren();

      const visibleOffers = offers.slice(0, 5);
      priceOfferHeading.textContent = `${visibleOffers.length} market offer${visibleOffers.length === 1 ? "" : "s"}`;
      priceOfferHeading.hidden = !visibleOffers.length;

      for (const offer of visibleOffers) {
        const card = document.createElement("article");
        card.className = "price-offer";
        const offerTitle = document.createElement("div");
        offerTitle.className = "price-offer-title";
        offerTitle.textContent = offer.title || "Comparable offer";
        offerTitle.title = offer.title || "Comparable offer";
        const offerPrice = document.createElement("div");
        offerPrice.className = "price-offer-value";
        offerPrice.textContent = offer.price || moneyText(offer.extracted_price, data.currency);
        const meta = document.createElement("div");
        meta.className = "price-offer-meta";
        meta.textContent = [offer.source, offer.condition, offer.delivery].filter(Boolean).join(" · ");
        card.append(offerTitle, offerPrice, meta);
        priceOffers.append(card);
      }

      priceAnalysisCopy.textContent = "Analyzing price competitiveness…";
      priceAnalysisPlaceholder.hidden = true;
      priceDetails.hidden = false;
      priceDetails.open = false;
      pricesSection.hidden = false;
    }

    function showPriceAnalysis(analysis) {
      if (!analysis || typeof analysis !== "object") return;
      const label = ["positive", "neutral", "negative"].includes(analysis.label)
        ? analysis.label
        : "neutral";
      const formattedScore = scoreText(analysis.score);
      evidence.sentiments.prices = { label, score: analysis.score };
      renderEvidenceGraph();
      priceVerdict.textContent = label[0].toUpperCase() + label.slice(1);
      priceVerdict.className = `price-verdict verdict ${label}`;
      priceVerdict.removeAttribute("aria-hidden");
      priceSentimentScore.textContent = formattedScore;
      priceSentimentScore.className = `price-sentiment-score score ${label}`;
      priceSentimentScore.removeAttribute("aria-hidden");
      priceSentimentScore.setAttribute(
        "aria-label",
        `Price value score ${formattedScore} on a scale from negative one to positive one`,
      );
      priceAnalysisCopy.textContent = analysis.summary || "No price analysis was returned.";
      priceAnalysisPlaceholder.hidden = true;
      priceSentiment.hidden = false;
      priceDetails.hidden = false;
      pricesSection.hidden = false;
      pricesSection.setAttribute("aria-busy", "false");
    }

    function showShoppingInformation(data) {
      const numericRating = Number(data?.rating);
      const hasRating = data?.rating != null && data.rating !== "" && Number.isFinite(numericRating);
      const reviewCount = data?.reviews;
      const reviews = Array.isArray(data?.review_details)
        ? data.review_details.filter((review) => typeof review?.text === "string" && review.text.trim())
        : [];

      if (!hasRating && reviewCount == null && !reviews.length) return;
      evidence.shopping = data;
      renderEvidenceGraph();

      const boundedRating = hasRating ? Math.max(0, Math.min(5, numericRating)) : 0;
      shoppingStars.hidden = !hasRating;
      shoppingStars.classList.remove("skeleton");
      shoppingStars.style.setProperty("--rating-fill", `${(boundedRating / 5) * 100}%`);
      shoppingRating.textContent = hasRating ? numericRating.toFixed(1) : "Not rated";
      shoppingRating.classList.remove("skeleton");
      shoppingRating.removeAttribute("aria-hidden");
      shoppingRating.setAttribute(
        "aria-label",
        hasRating ? `${numericRating.toFixed(1)} out of 5 stars` : "No aggregate rating",
      );
      shoppingCount.textContent = reviewCount == null
        ? `${reviews.length} review excerpt${reviews.length === 1 ? "" : "s"}`
        : `${reviewCount} reviews`;
      shoppingCount.classList.remove("skeleton");
      shoppingCount.removeAttribute("aria-hidden");
      shoppingReviews.replaceChildren();
      const visibleReviewCount = Math.min(reviews.length, 3);
      shoppingReviewHeading.textContent = `${visibleReviewCount} review excerpt${visibleReviewCount === 1 ? "" : "s"}`;
      shoppingReviewHeading.hidden = !visibleReviewCount;

      for (const review of reviews.slice(0, 3)) {
        const card = document.createElement("article");
        card.className = "shopping-review";
        const meta = document.createElement("div");
        meta.className = "shopping-review-meta";
        const source = document.createElement("span");
        source.textContent = review.source || "Shopper review";
        const rating = document.createElement("span");
        const numericReviewRating = Number(review.rating);
        rating.textContent = review.rating != null && review.rating !== "" && Number.isFinite(numericReviewRating)
          ? `★ ${numericReviewRating.toFixed(1)}`
          : "";
        const copy = document.createElement("p");
        copy.className = "shopping-review-copy";
        copy.textContent = review.text.trim();
        meta.append(source, rating);
        card.append(meta, copy);
        shoppingReviews.append(card);
      }

      if (reviews.length) {
        shoppingAnalysisCopy.textContent = "Analyzing Google Products reviews…";
        shoppingAnalysisPlaceholder.hidden = true;
        shoppingAnalysis.hidden = false;
      }
      shoppingSection.hidden = false;
    }

    function showShoppingAnalysis(analysis) {
      if (!analysis || typeof analysis !== "object") return;
      const label = ["positive", "neutral", "negative"].includes(analysis.label)
        ? analysis.label
        : "neutral";
      const formattedScore = scoreText(analysis.score);
      evidence.sentiments.reviews = { label, score: analysis.score };
      renderEvidenceGraph();
      const displayLabel = label[0].toUpperCase() + label.slice(1);
      shoppingVerdict.textContent = displayLabel;
      shoppingVerdict.className = `shopping-verdict verdict ${label}`;
      shoppingVerdict.removeAttribute("aria-hidden");
      shoppingSentimentScore.textContent = formattedScore;
      shoppingSentimentScore.className = `shopping-sentiment-score score ${label}`;
      shoppingSentimentScore.removeAttribute("aria-hidden");
      shoppingSentimentScore.setAttribute(
        "aria-label",
        `Shopping sentiment score ${formattedScore} on a scale from negative one to positive one`,
      );
      shoppingAnalysisCopy.textContent = analysis.summary || "No shopping review summary was returned.";
      shoppingAnalysisPlaceholder.hidden = true;
      shoppingSentiment.hidden = false;
      shoppingAnalysis.hidden = false;
      shoppingSection.hidden = false;
      shoppingSection.setAttribute("aria-busy", "false");
    }

    function showVideos(videos) {
      evidence.videos = Array.isArray(videos) ? videos : [];
      renderEvidenceGraph();
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
      videosContainer.setAttribute("aria-busy", "false");
      videosContainer.setAttribute("aria-label", "Video reviews being analyzed");
      if (videosContainer.childElementCount) {
        sources.hidden = false;
        const count = videosContainer.childElementCount;
        statusCopy.textContent = `Analyzing ${count} video review${count === 1 ? "" : "s"}…`;
      } else {
        sources.hidden = true;
        statusCopy.textContent = "Analyzing available review transcripts…";
      }
    }

    function showProcessing(message) {
      status.classList.remove("done", "failed");
      statusCopy.textContent = message;
      progress.hidden = false;
      errorBox.hidden = true;
    }

    function showResult(data, completionMessage = "Analysis complete", complete = true) {
      const summary = data?.sentimentSummary;
      if (!summary || typeof summary !== "object") {
        showError(data?.sentimentSummaryError || "No usable video review transcripts were found.");
        return;
      }
      const label = ["positive", "neutral", "negative"].includes(summary.label) ? summary.label : "neutral";
      const videoSummary = data?.videoSentimentSummary ?? summary;
      const videoLabel = ["positive", "neutral", "negative"].includes(videoSummary.label)
        ? videoSummary.label
        : "neutral";
      evidence.result = { label, score: summary.score, complete };
      evidence.sentiments.video = { label: videoLabel, score: videoSummary.score };
      renderEvidenceGraph();
      verdict.textContent = videoLabel;
      verdict.className = `video-verdict verdict ${videoLabel}`;
      verdict.removeAttribute("aria-hidden");
      score.textContent = scoreText(videoSummary.score);
      score.className = `video-score score ${videoLabel}`;
      score.removeAttribute("aria-hidden");
      score.setAttribute("aria-label", `Video sentiment score ${score.textContent} on a scale from negative one to positive one`);
      if (complete) {
        const formattedFinalScore = scoreText(summary.score);
        finalVerdict.textContent = label;
        finalVerdict.className = `final-verdict verdict ${label}`;
        finalVerdict.removeAttribute("aria-hidden");
        finalScore.textContent = formattedFinalScore;
        finalScore.className = `final-score score ${label}`;
        finalScore.removeAttribute("aria-hidden");
        finalScore.setAttribute(
          "aria-label",
          `Final weighted score ${formattedFinalScore} on a scale from negative one to positive one`,
        );
        finalResult.hidden = false;
        finalResult.setAttribute("aria-busy", "false");
      }
      analysisPlaceholder.hidden = true;
      videoAnalysis.hidden = false;
      videoAnalysisCopy.textContent = data?.videoSummary
        || (!data?.summarizedLocally ? summary.summary : "")
        || "No video analysis was returned.";
      fullSummary.hidden = !data?.summarizedLocally;
      fullSummaryCopy.textContent = data?.summarizedLocally
        ? (summary.summary || "No full summary was returned.")
        : "";
      status.classList.remove("failed");
      status.classList.toggle("done", complete);
      statusCopy.textContent = completionMessage;
      progress.hidden = complete;
      errorBox.hidden = true;
      resultSection.hidden = false;
      resultSection.setAttribute("aria-busy", String(!complete));
    }

    function handleAnalysisEvent(event) {
      const reviewCount = Number(event?.reviewCount) || 0;
      if (event?.type === "gpu-analysis") {
        const prepared = Math.min(Number(event.reviewIndex) + 1 || 1, reviewCount || 1);
        showProcessing(
          reviewCount > 1
            ? `Preparing review evidence… ${prepared} of ${reviewCount}`
            : "Preparing review evidence…",
        );
        return;
      }

      if (event?.type === "analysis-result" && event.sentiment) {
        streamedAnalyses.set(event.reviewIndex, {
          videoTitle: event.videoTitle,
          sentiment: event.sentiment,
        });
        try {
          const partial = root.nanoAggregator?.combineWithoutNano({
            reviewAnalyses: [...streamedAnalyses.values()],
          });
          if (partial) {
            showResult(
              partial,
              `Analyzed ${streamedAnalyses.size} of ${reviewCount} reviews…`,
              false,
            );
          }
        } catch (_error) {
          // Keep the skeletons until at least one valid review result arrives.
        }
        return;
      }

      if (event?.type === "analysis-started" || event?.type === "analysis-delta") {
        const completed = streamedAnalyses.size;
        showProcessing(
          completed
            ? `Analyzing reviews… ${completed} of ${reviewCount} complete`
            : `Analyzing ${reviewCount} video review${reviewCount === 1 ? "" : "s"}…`,
        );
      }
    }

    function showFullSummaryStream(summary) {
      fullSummary.hidden = false;
      fullSummaryCopy.textContent = summary;
    }

    function showError(message) {
      status.classList.add("failed");
      statusCopy.textContent = "Analysis unavailable";
      progress.hidden = true;
      finalResult.hidden = true;
      resultSection.hidden = true;
      errorBox.textContent = message || "We could not finish this analysis.";
      errorBox.hidden = false;
    }

    return {
      openEvidenceGraph,
      handleEvent(event) {
        if (event?.type === "videos") showVideos(event.videos);
        else handleAnalysisEvent(event);
      },
      showPriceAnalysis,
      showPriceInformation,
      showShoppingAnalysis,
      showShoppingInformation,
      showError,
      showFullSummaryStream,
      showProcessing,
      showResult,
    };
  }

  root.productAnalysisUI = Object.freeze({ mount });
})(globalThis);
