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

/**
 * Streaming requests use a long-lived port so the API can push several
 * messages (e.g. found videos first, Gemini results later) for one request.
 *
 * Messages posted back to the content script:
 *   { type: "event", event }                 one per NDJSON line
 *   { type: "error", status, error }         request failed
 *   { type: "end" }                          stream finished
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "api-stream") {
    return;
  }

  const controller = new AbortController();
  let disconnected = false;
  port.onDisconnect.addListener(() => {
    disconnected = true;
    controller.abort();
  });

  const post = (message) => {
    if (!disconnected) {
      port.postMessage(message);
    }
  };

  port.onMessage.addListener((message) => {
    if (message?.type !== "api-request") {
      return;
    }

    void streamFromApi(message.endpoint, message.payload, controller.signal, post)
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        post({
          type: "error",
          status: 0,
          error: error instanceof Error ? error.message : "API request failed.",
        });
      })
      .finally(() => {
        post({ type: "end" });
        if (!disconnected) {
          port.disconnect();
        }
      });
  });
});

async function streamFromApi(endpoint, payload, signal, post) {
  if (!API_ENDPOINTS.has(endpoint)) {
    post({ type: "error", status: 400, error: `Unknown API endpoint: ${endpoint}` });
    return;
  }

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson, application/json",
    },
    body: JSON.stringify(payload ?? {}),
    signal,
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || !contentType.includes("application/x-ndjson") || !response.body) {
    // Non-streaming response: forward it as a single event.
    const data = await readResponseBody(response);
    if (!response.ok) {
      post({
        type: "error",
        status: response.status,
        error: data?.detail ?? `API request failed with status ${response.status}.`,
      });
      return;
    }
    post({ type: "event", event: { type: "result", data } });
    return;
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  const flushLine = (line) => {
    if (line.trim()) {
      post({ type: "event", event: JSON.parse(line) });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += value;

    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      flushLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  flushLine(buffer);
}
