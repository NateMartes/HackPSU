const API_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);
// Endpoints that respond with NDJSON progress events before their final result.
const STREAMING_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);

/**
 * POST a request through the extension service worker and wait for the API.
 *
 * @param {"prices" | "shopping" | "youtube"} endpoint
 * @param {unknown} payload
 * @returns {Promise<unknown>}
 */
async function requestApi(endpoint, payload = {}) {
  if (!API_ENDPOINTS.has(endpoint)) {
    throw new Error(`Unknown API endpoint: ${endpoint}`);
  }

  const response = await chrome.runtime.sendMessage({
    type: "api-request",
    endpoint,
    payload,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? "API request failed.");
  }

  return response.data;
}

let nextStreamRequestId = 1;

/**
 * POST a streaming request through the service worker. Intermediate events
 * (e.g. `{type: "videos", videos}`) are passed to `onEvent` as they arrive; the
 * promise resolves with the data from the final `{type: "result"}` event.
 *
 * @param {"prices" | "shopping" | "youtube"} endpoint
 * @param {unknown} payload
 * @param {(event: {type: string, [key: string]: unknown}) => void} [onEvent]
 * @returns {Promise<unknown>}
 */
async function requestApiStream(endpoint, payload = {}, onEvent = () => {}) {
  if (!API_ENDPOINTS.has(endpoint)) {
    throw new Error(`Unknown API endpoint: ${endpoint}`);
  }

  const requestId = `stream-${nextStreamRequestId++}`;
  const listener = (message) => {
    if (message?.type === "api-stream-event" && message.requestId === requestId) {
      onEvent(message.event);
    }
  };

  chrome.runtime.onMessage.addListener(listener);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "api-request",
      stream: true,
      requestId,
      endpoint,
      payload,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "API request failed.");
    }

    return response.data;
  } finally {
    chrome.runtime.onMessage.removeListener(listener);
  }
}

/**
 * Request every product research source concurrently and wait for all of them.
 * A failed source is returned alongside successful sources instead of preventing
 * the remaining responses from being reported.
 *
 * @param {Record<string, unknown>} product
 * @param {(endpoint: string, result: {ok: true, data: unknown} | {ok: false, error: string}) => void} [onResult]
 * @param {(endpoint: string, event: {type: string, [key: string]: unknown}) => void} [onProgress]
 *   Called with partial updates from streaming sources (e.g. YouTube videos
 *   found before Gemini analysis has finished).
 * @returns {Promise<Record<string, {ok: true, data: unknown} | {ok: false, error: string}>>}
 */
async function requestProductResearch(product, onResult = () => {}, onProgress = () => {}) {
  const requests = [...API_ENDPOINTS].map(async (endpoint) => {
    let result;

    try {
      const data = STREAMING_ENDPOINTS.has(endpoint)
        ? await requestApiStream(endpoint, product, (event) => onProgress(endpoint, event))
        : await requestApi(endpoint, product);
      result = { ok: true, data };
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : "API request failed.",
      };
    }

    onResult(endpoint, result);
    return [endpoint, result];
  });

  return Object.fromEntries(await Promise.all(requests));
}

globalThis.api = Object.freeze({
  prices: (payload, onEvent) => requestApiStream("prices", payload, onEvent),
  shopping: (payload, onEvent) => requestApiStream("shopping", payload, onEvent),
  youtube: (payload, onEvent) => requestApiStream("youtube", payload, onEvent),
  researchProduct: requestProductResearch,
});

async function summarizeExistingReviews(product, result, analysisUI) {
  const aggregator = globalThis.nanoAggregator;
  if (!aggregator) {
    analysisUI?.showError("The local review aggregator did not load.");
    return;
  }

  let fallback;
  try {
    fallback = aggregator.combineWithoutNano(result);
  } catch (error) {
    analysisUI?.showError(
      result?.sentimentSummaryError
        || (error instanceof Error ? error.message : "No review scores were returned."),
    );
    return;
  }

  analysisUI?.showResult(
    fallback,
    `Showing ${fallback.reviewCount} existing review result${fallback.reviewCount === 1 ? "" : "s"}`,
  );

  const runNano = async () => {
    analysisUI?.showProcessing("Summarizing review results");
    try {
      const summary = await aggregator.summarize(product, result, (partialSummary) => {
        analysisUI?.showFullSummaryStream(partialSummary);
      });
      analysisUI?.showResult(
        summary,
        "Summarized Findings",
      );
    } catch (error) {
      console.warn("Gemini Nano summarization failed; using existing review text.", error);
      analysisUI?.showResult(
        fallback,
        `Showing ${fallback.reviewCount} existing review result${fallback.reviewCount === 1 ? "" : "s"}`,
      );
    }
  };

  try {
    const availability = await aggregator.availability();
    if (availability === "available") {
      await runNano();
    }
  } catch (error) {
    console.warn("Could not check Gemini Nano availability.", error);
  }
}

setTimeout(async () => {
  const product = globalThis.parser.parseProduct(document, location);
  globalThis.product = product;

  if (!product) {
    console.warn("We could not parse an Amazon product from this page.");
    return;
  }

  const analysisUI = globalThis.productAnalysisUI?.mount(product);
  let priceInformation = null;
  let shoppingInformation = null;

  const priceRequest = globalThis.api.prices(product, (event) => {
    if (event?.type === "price-information") {
      console.log("price API update:", event);
      priceInformation = event.data;
      analysisUI?.showPriceInformation(event.data);
    } else if (event?.type === "analysis") {
      console.log("price analysis update:", event);
      analysisUI?.showPriceAnalysis(event.analysis);
    }
  }).then((result) => {
    console.log("price API result:", result);
    analysisUI?.showPriceAnalysis(result?.analysis);
    return result;
  }).catch((error) => {
    console.error("price API failed:", error);
    return null;
  });

  const shoppingRequest = globalThis.api.shopping(product, (event) => {
    if (event?.type === "shopping-information") {
      console.log("shopping API update:", event);
      shoppingInformation = event.data;
      analysisUI?.showShoppingInformation(event.data);
    } else if (event?.type === "analysis") {
      console.log("shopping analysis update:", event);
      analysisUI?.showShoppingAnalysis(event.analysis);
    }
  }).then((result) => {
    console.log("shopping API result:", result);
    analysisUI?.showShoppingInformation(result);
    analysisUI?.showShoppingAnalysis(result?.analysis);
    return result;
  }).catch((error) => {
    console.error("shopping API failed:", error);
    return null;
  });

  try {
    const result = await globalThis.api.youtube(product, (event) => {
      if (event.type !== "analysis-delta") {
        console.log(`youtube API update (${event.type}):`, event);
      }
      analysisUI?.handleEvent(event);
    });

    console.log("youtube API result:", result);
    const [shoppingResult, priceResult] = await Promise.all([
      shoppingRequest,
      priceRequest,
    ]);
    await summarizeExistingReviews(
      product,
      {
        ...result,
        shoppingAnalysis: shoppingResult?.analysis ?? null,
        shoppingInformation: shoppingInformation ?? shoppingResult,
        priceAnalysis: priceResult?.analysis ?? null,
        priceInformation,
      },
      analysisUI,
    );
  } catch (error) {
    console.error("youtube API failed:", error);
    analysisUI?.showError(
      error instanceof Error ? error.message : "We could not finish this analysis.",
    );
  }

}, 1000);
