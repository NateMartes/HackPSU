const API_BASE_URL = "http://127.0.0.1:8000/api";
const API_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "api-request") {
    return false;
  }

  void postToApi(message.endpoint, message.payload)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "API request failed.",
      });
    });

  // Keep the message channel open until the POST request completes.
  return true;
});

async function postToApi(endpoint, payload) {
  if (!API_ENDPOINTS.has(endpoint)) {
    return {
      ok: false,
      status: 400,
      error: `Unknown API endpoint: ${endpoint}`,
    };
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

  const data = await readResponseBody(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.detail ?? `API request failed with status ${response.status}.`,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { value: text } : null;
}
