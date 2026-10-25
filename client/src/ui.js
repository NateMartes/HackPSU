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
        position: fixed; z-index: 2147483647; left: 22px; bottom: 22px;
        display: flex; width: min(368px, calc(100vw - 28px));
        height: min(610px, calc(100vh - 44px)); flex-direction: column;
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
        border-radius: 9px; background: #17212b; color: var(--accent); font-size: 16px; font-weight: 800;
      }
      .heading { min-width: 0; flex: 1; }
      .eyebrow { color: var(--accent-deep); font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
      h2 { overflow: hidden; margin: 1px 0 0; color: var(--ink); font: 700 14px/1.3 Arial, Helvetica, sans-serif; text-overflow: ellipsis; white-space: nowrap; }
      button { appearance: none; border: 0; background: none; color: inherit; font: inherit; }
      .close { width: 30px; height: 30px; cursor: pointer; border-radius: 50%; color: #596773; font-size: 22px; line-height: 30px; }
      .close:hover { background: #edf0f2; color: #17212b; }
      .close:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid rgba(255,153,0,.42); outline-offset: 2px; }
      .body { min-height: 0; flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; padding: 15px; }
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
      .video-placeholder { border-color: #dfe4e7; background: #e7ebee; pointer-events: none; }
      .video-placeholder::after { content: ""; position: absolute; inset: 0; display: block; width: 45%; height: auto; border-radius: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.78), transparent); animation: shimmer 1.25s ease-in-out infinite; transform: translateX(-120%); }
      .video:hover { border-color: var(--accent-deep); transform: translateY(-1px); }
      .video-placeholder:hover { border-color: #dfe4e7; transform: none; }
      .video-fallback { display: grid; width: 100%; height: 100%; place-items: center; color: #fff; font-size: 9px; font-weight: 700; }
      .shopping { margin-top: 15px; }
      .shopping-overview { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fffaf2; }
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
      @media (max-width: 520px) { .panel { left: 14px; bottom: 14px; } }
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
        <section class="sources">
          <div class="section-label">Reviews being analyzed</div>
          <div class="videos" aria-busy="true" aria-label="Loading video reviews">
            <span class="video video-placeholder" aria-hidden="true"></span>
            <span class="video video-placeholder" aria-hidden="true"></span>
            <span class="video video-placeholder" aria-hidden="true"></span>
          </div>
        </section>
        <section class="shopping" hidden>
          <div class="section-label">Ratings from Google Products</div>
          <div class="shopping-overview">
            <div class="shopping-score"><span class="shopping-stars" aria-hidden="true">★★★★★</span><span class="shopping-rating"></span></div>
            <span class="shopping-count"></span>
          </div>
          <div class="shopping-sentiment score-card" hidden>
            <div><div class="verdict-label">Overall shopping sentiment</div><div class="shopping-verdict verdict"></div></div>
            <div class="shopping-sentiment-score score"></div>
          </div>
          <details class="shopping-analysis" hidden>
            <summary>Reviews Summary</summary>
            <p class="shopping-analysis-copy summary-copy"></p>
            <div class="shopping-review-heading" hidden></div>
            <div class="shopping-reviews"></div>
          </details>
        </section>
        <section class="result" aria-busy="true">
          <div class="score-card"><div><div class="verdict-label">Overall video sentiment</div><div class="video-verdict verdict skeleton" aria-hidden="true"></div></div><div class="video-score score skeleton" aria-hidden="true"></div></div>
          <div class="analysis-placeholder" aria-hidden="true"><div class="skeleton"></div></div>
          <details class="video-analysis" hidden><summary>Video Analysis</summary><p class="video-analysis-copy summary-copy"></p></details>
          <details class="full-summary" hidden><summary>Full Summary</summary><p class="full-summary-copy summary-copy"></p></details>
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
    const shoppingAnalysisCopy = shadow.querySelector(".shopping-analysis-copy");
    const resultSection = shadow.querySelector(".result");
    const verdict = shadow.querySelector(".video-verdict");
    const score = shadow.querySelector(".video-score");
    const analysisPlaceholder = shadow.querySelector(".analysis-placeholder");
    const videoAnalysis = shadow.querySelector(".video-analysis");
    const videoAnalysisCopy = shadow.querySelector(".video-analysis-copy");
    const fullSummary = shadow.querySelector(".full-summary");
    const fullSummaryCopy = shadow.querySelector(".full-summary-copy");
    const errorBox = shadow.querySelector(".error");
    const streamedAnalyses = new Map();

    title.textContent = product?.title || "Product analysis";
    panel.setAttribute("aria-label", `Review analysis for ${product?.title || "this product"}`);
    shadow.querySelector(".close").addEventListener("click", () => host.remove());

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
      shoppingStars.style.setProperty("--rating-fill", `${(boundedRating / 5) * 100}%`);
      shoppingRating.textContent = hasRating ? numericRating.toFixed(1) : "Not rated";
      shoppingRating.setAttribute(
        "aria-label",
        hasRating ? `${numericRating.toFixed(1)} out of 5 stars` : "No aggregate rating",
      );
      shoppingCount.textContent = reviewCount == null
        ? `${reviews.length} review excerpt${reviews.length === 1 ? "" : "s"}`
        : `${reviewCount} reviews`;
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
      shoppingSentimentScore.textContent = formattedScore;
      shoppingSentimentScore.className = `shopping-sentiment-score score ${label}`;
      shoppingSentimentScore.setAttribute(
        "aria-label",
        `Shopping sentiment score ${formattedScore} on a scale from negative one to positive one`,
      );
      shoppingAnalysisCopy.textContent = analysis.summary || "No shopping review summary was returned.";
      shoppingSentiment.hidden = false;
      shoppingAnalysis.hidden = false;
      shoppingSection.hidden = false;
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
      verdict.textContent = label;
      verdict.className = `video-verdict verdict ${label}`;
      verdict.removeAttribute("aria-hidden");
      score.textContent = scoreText(summary.score);
      score.className = `video-score score ${label}`;
      score.removeAttribute("aria-hidden");
      score.setAttribute("aria-label", `Sentiment score ${score.textContent} on a scale from negative one to positive one`);
      analysisPlaceholder.hidden = true;
      videoAnalysis.hidden = false;
      videoAnalysisCopy.textContent = data?.videoSummary
        || (!data?.summarizedLocally ? summary.summary : "")
        || "No video analysis was returned.";
      fullSummary.hidden = !data?.summarizedLocally;
      fullSummary.open = Boolean(data?.summarizedLocally);
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
      fullSummary.open = true;
      fullSummaryCopy.textContent = summary;
    }

    function showError(message) {
      status.classList.add("failed");
      statusCopy.textContent = "Analysis unavailable";
      progress.hidden = true;
      resultSection.hidden = true;
      errorBox.textContent = message || "We could not finish this analysis.";
      errorBox.hidden = false;
    }

    return {
      handleEvent(event) {
        if (event?.type === "videos") showVideos(event.videos);
        else handleAnalysisEvent(event);
      },
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
