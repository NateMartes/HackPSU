const API_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);

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

/**
 * Request every product research source concurrently and wait for all of them.
 * A failed source is returned alongside successful sources instead of preventing
 * the remaining responses from being reported.
 *
 * @param {Record<string, unknown>} product
 * @param {(endpoint: string, result: {ok: true, data: unknown} | {ok: false, error: string}) => void} [onResult]
 * @returns {Promise<Record<string, {ok: true, data: unknown} | {ok: false, error: string}>>}
 */
async function requestProductResearch(product, onResult = () => {}) {
  const requests = [...API_ENDPOINTS].map(async (endpoint) => {
    let result;

    try {
      const data = await requestApi(endpoint, product);
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
  youtube: (payload) => requestApi("youtube", payload),
  researchProduct: requestProductResearch,
});

setTimeout(async () => {
  const product = globalThis.parser.parseProduct(document, location);
  globalThis.product = product;

  if (!product) {
    console.warn("We could not parse an Amazon product from this page.");
    return;
  }

  await requestProductResearch(product, (endpoint, result) => {
    console.log(`${endpoint} API result:`, result);
  });
}, 1000);
