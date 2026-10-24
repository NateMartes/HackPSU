const API_BASE_URL = "http://127.0.0.1:8000/api";
const API_ENDPOINTS = new Set(["prices", "shopping", "youtube"]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "api-request") {
    return false;
  }

  if (message.stream) {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    const postEvent = (event) => {
      if (tabId == null) {
        return;
      }
      void chrome.tabs
        .sendMessage(
          tabId,
          {
            type: "api-stream-event",
            requestId: message.requestId,
            endpoint: message.endpoint,
            event,
          },
          frameId != null ? { frameId } : undefined,
        )
        .catch(() => {});
    };

    void streamFromApi(message.endpoint, message.payload, postEvent)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          status: 0,
          error: error instanceof Error ? error.message : "API request failed.",
        });
      });

    return true;
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

async function streamFromApi(endpoint, payload, onEvent) {
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
      Accept: "application/x-ndjson, application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || !contentType.includes("application/x-ndjson") || !response.body) {
    const data = await readResponseBody(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data?.detail ?? `API request failed with status ${response.status}.`,
      };
    }
    return { ok: true, status: response.status, data };
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finalResult = null;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const event = JSON.parse(trimmed);
    if (event?.type === "result") {
      finalResult = { ok: true, status: response.status, data: event.data };
    } else if (event?.type === "error") {
      finalResult = {
        ok: false,
        status: event.status ?? 500,
        error: event.error ?? "API request failed.",
      };
    } else {
      onEvent(event);
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
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  handleLine(buffer);

  return (
    finalResult ?? {
      ok: false,
      status: 502,
      error: "API stream ended without a result.",
    }
  );
}
