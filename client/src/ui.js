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
      .window-control:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid rgba(255,153,0,.42); outline-offset: 2px; }
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
      [hidden] { display: none !important; }
      @media (max-width: 520px) { .panel { top: 14px; left: 14px; } }
      @media (prefers-reduced-motion: reduce) { .panel { animation: none; } .spinner { animation-duration: 1.5s; } .progress::after { animation-duration: 2.5s; } }
    </style>
    <aside class="panel" role="dialog" aria-labelledby="analysis-title" aria-live="polite">
      <header class="header">
        <div class="mark" aria-hidden="true"><img src="${ICON_URL}" alt=""></div>
        <div class="heading"><div class="app-title">P.R.V.S.A.</div><h2 id="analysis-title"></h2></div>
        <div class="window-controls">
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
    const streamedAnalyses = new Map();

    title.textContent = product?.title || "Product analysis";
    panel.setAttribute("aria-label", `Review analysis for ${product?.title || "this product"}`);
    shadow.querySelector(".close").addEventListener("click", () => host.remove());
    const minimizeButton = shadow.querySelector(".minimize");
    minimizeButton.addEventListener("click", () => {
      const minimized = panel.classList.toggle("minimized");
      minimizeButton.textContent = minimized ? "□" : "−";
      minimizeButton.setAttribute("aria-label", minimized ? "Restore analysis" : "Minimize analysis");
      minimizeButton.setAttribute("aria-expanded", String(!minimized));
      minimizeButton.title = minimized ? "Restore" : "Minimize";
    });

    function showPriceInformation(data) {
      const offers = Array.isArray(data?.offers)
        ? data.offers.filter((offer) => offer && typeof offer === "object")
        : [];
      const hasCurrentPrice = data?.current_price != null
        && data.current_price !== ""
        && Number.isFinite(Number(data.current_price));
      if (!hasCurrentPrice && !offers.length) return;

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
