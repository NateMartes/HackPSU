const API_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);
// Endpoints that respond with NDJSON progress events before their final result.
const STREAMING_ENDPOINTS = new Set(["youtube"]);

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
  prices: (payload) => requestApi("prices", payload),
  shopping: (payload) => requestApi("shopping", payload),
  youtube: (payload, onEvent) => requestApiStream("youtube", payload, onEvent),
  researchProduct: requestProductResearch,
});

setTimeout(async () => {
  const product = globalThis.parser.parseProduct(document, location);
  globalThis.product = product;

  if (!product) {
    console.warn("We could not parse an Amazon product from this page.");
    return;
  }

  const analysisUI = globalThis.productAnalysisUI?.mount(product);

  try {
    const result = await globalThis.api.youtube(product, (event) => {
      console.log(`youtube API update (${event.type}):`, event);
      analysisUI?.handleEvent(event);
    });

    console.log("youtube API result:", result);
    analysisUI?.showResult(result);
  } catch (error) {
    console.error("youtube API failed:", error);
    analysisUI?.showError(
      error instanceof Error ? error.message : "We could not finish this analysis.",
    );
  }
}, 1000);
