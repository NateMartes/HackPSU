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

globalThis.api = Object.freeze({
  prices: (payload) => requestApi("prices", payload),
  shopping: (payload) => requestApi("shopping", payload),
  youtube: (payload) => requestApi("youtube", payload),
});

setTimeout(() => {
  globalThis.product = globalThis.parser.parseProduct(document, location);
}, 1000);
