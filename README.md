# HackPSU

## API

Install and run the API from the repository root:

```bash
python3 -m pip install -r api/requirements.txt
export YOUTUBE_API_KEY="your-youtube-data-api-key"
export GEMINI_API_KEY="your-gemini-api-key"
# Optional Webshare Residential proxy credentials:
export YOUTUBE_PROXY_USERNAME="your-webshare-proxy-username"
export YOUTUBE_PROXY_PASSWORD="your-webshare-proxy-password"
# Optional: export GEMINI_MODEL="gemini-3.1-flash-lite"
python3 -m uvicorn api.main:app --reload
```

The test API routes are available at:

- `POST /api/prices`
- `POST /api/shopping`
- `POST /api/youtube`

The YouTube route searches the YouTube Data API v3 for up to 15 captioned,
relevance-ranked reviews of the submitted product, retrieves an English
transcript for each result when one is available,
aggregates it into normalized timestamp-free text, and adds each video's view
count, like count, like-to-view percentage, and views per like. Its stream sends
lightweight video previews (link, title, channel, and thumbnail), tagged Gemini
generation deltas, and each completed review analysis before the final result so
the extension can replace its score and Video Analysis skeletons progressively.
Results uploaded by a
channel whose name matches, contains, or shares a distinctive leading root with
the product brand are excluded before transcript collection and analysis. It
checks transcript candidates in relevance-ordered batches until it finds three
usable independent reviews or exhausts the search results. It requires
`YOUTUBE_API_KEY` and `GEMINI_API_KEY` in the API process environment. Cloud
Gemini analyzes each transcript concurrently for product-specific overall and
aspect sentiment and verifies aspect evidence against the transcript. The API
returns those existing review analyses to the extension; it does not make a
second cloud-model call for the cross-video summary. Set `GEMINI_MODEL` to
override the default `gemini-3.1-flash-lite` model. The final response omits
YouTube's video IDs, thumbnails, transcripts, and ETags because the earlier
preview event already contains the display data the client needs.

If YouTube blocks the API host's IP, set both `YOUTUBE_PROXY_USERNAME` and
`YOUTUBE_PROXY_PASSWORD` to credentials from a Webshare **Residential** proxy
plan. Transcript requests will then use Webshare's rotating US residential IPs.
The backend uses a direct connection when neither variable is present and
returns a configuration error if only one is set. Keep these credentials in the
backend environment; never add them to the Chrome extension or commit them.

The shopping route fetches product rating and review information through
SerpApi and streams that data immediately as a `shopping-information` NDJSON
event. Shopping candidates are ranked against the requested brand, model, and
title. Product details use the exact offer token first, fall back to the product
ID, and try up to three candidates when Google returns an empty product page.
The route then sends the complete collected payload to Gemini in one request,
streams the schema-validated analysis, and finishes with a `result` event.
Specific aspect evidence is retained only when it is an exact excerpt from the
supplied review text. It requires `SERPAPI_KEY` and `GEMINI_API_KEY`. The price
route remains a basic lookup. Requests from `http://localhost:3000` are allowed
by the CORS configuration.

## Chrome extension

Load the `client` directory as an unpacked Manifest V3 extension. The extension
service worker has host permission for the local API on port 8000 and performs
the POST requests on behalf of the content script. Content-script code can wait
for a response with, for example:

```js
const result = await globalThis.api.prices({ query: "headphones" });
```

The extension only runs on Amazon pages. It parses the default product once
when the page loads and opens an on-page analysis card. The card progressively
shows the YouTube reviews being analyzed. It averages the scores already
returned for those reviews, then uses Chrome's on-device Gemini Nano Prompt API
to write a cross-review summary without creating or changing any score. The
result card immediately shows the deterministic score on the `-1` to `+1` scale
and the existing combined findings under **Video Analysis**. The extension
checks whether Gemini Nano is already available. If it is, Nano automatically
streams a separate cross-video **Full Summary** while the video analysis and
score remain unchanged. If the model is not already available, only Video
Analysis remains visible and the extension does not start a model download. No additional
manifest permission or Gemini API key is needed for the on-device summary. The
The on-page card requests shopping and YouTube concurrently. Shopping ratings
and up to three review excerpts appear as soon as the first shopping stream
event arrives, without waiting for Gemini's shopping analysis. When that
analysis arrives, the card displays its sentiment in the same score-card format
as video sentiment and places its summary plus review excerpts in one collapsed
Reviews Summary. Gemini Nano receives both the shopping analysis and the video
analyses when it writes the final Full Summary; it cannot replace their existing
scores. The price API remains available to callers but is not requested by the
card:

```js
console.log(globalThis.product);
const youtubeResult = await globalThis.api.youtube(globalThis.product);
```

Call `globalThis.api.researchProduct(...)` when a consumer needs all sources.
Each combined endpoint outcome has an `ok` flag and either `data` or `error`, so
one failed source does not hide responses from the other sources.

The parser returns a canonical ASIN URL, title, brand, model, selected variant,
structured variant values, numeric price, ISO currency code, and HTTPS image
URL. Fields Amazon does not publish are returned as `null` instead of guessed.

The `localhost:3000` CORS rule is for a separate local web frontend. Extension
requests use the service worker and the API host permissions in
`client/manifest.json` instead.
