# HackPSU

## API

Install and run the API from the repository root:

```bash
python3 -m pip install -r api/requirements.txt
export YOUTUBE_API_KEY="your-youtube-data-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
# Optional: export GEMINI_MODEL="gemini-3.8-flash"
python3 -m uvicorn api.main:app --reload
```

The test API routes are available at:

- `POST /api/prices`
- `POST /api/shopping`
- `POST /api/youtube`

The YouTube route searches the YouTube Data API v3 for the submitted product's
`title`, retrieves an English transcript for each result when one is available,
aggregates it into normalized timestamp-free text, and adds each video's view
count, like count, like-to-view percentage, and views per like. It requires
`YOUTUBE_API_KEY` and `GEMINI_API_KEY` in the API process environment. Gemini
analyzes each transcript concurrently for product-specific overall and aspect
sentiment, verifies aspect evidence against the transcript, and produces a
cross-video consensus summary. Set `GEMINI_MODEL` to override the default
`gemini-3.8-flash` model. The response omits YouTube's video IDs, thumbnails,
and ETags because downstream analysis does not use them.

The price and shopping routes are still placeholders and return `501 Not
Implemented`. Requests from `http://localhost:3000` are allowed by the CORS
configuration.

## Chrome extension

Load the `client` directory as an unpacked Manifest V3 extension. The extension
service worker has host permission for the local API on port 8000 and performs
the POST requests on behalf of the content script. Content-script code can wait
for a response with, for example:

```js
const result = await globalThis.api.prices({ query: "headphones" });
```

The extension only runs on Amazon pages. It parses the default product once
when the page loads, sends that product to all three API endpoints concurrently,
and logs each outcome as soon as that individual request finishes:

```js
console.log(globalThis.product);
const allResults = await globalThis.api.researchProduct(globalThis.product);
```

Each endpoint outcome has an `ok` flag and either `data` or `error`, so one
failed source does not hide responses from the other sources. The returned
promise still provides the combined outcomes if a caller needs to wait for all
sources.

The parser returns a canonical ASIN URL, title, brand, model, selected variant,
structured variant values, numeric price, ISO currency code, and HTTPS image
URL. Fields Amazon does not publish are returned as `null` instead of guessed.

The `localhost:3000` CORS rule is for a separate local web frontend. Extension
requests use the service worker and the API host permissions in
`client/manifest.json` instead.
