<p align="left">
  <img src="client/assets/icons/prvsa-128.png" width="128" height="128" alt="P.R.V.S.A. prism logo">
</p>

<h1 align="left">P.R.V.S.A.</h1>

<p align="left">
  <strong>Price Review Video Sentiment Aggregator</strong><br>
  A clearer answer to the question behind every product page: <em>is this actually worth buying?</em>
</p>

P.R.V.S.A. is a Chrome extension that researches an Amazon product while you
shop. It compares prices, reads product reviews, analyzes independent YouTube
reviews, and brings the evidence together in one on-page report.

## Why we built it

Most shopping assistants solve only one part of the decision. Coupon tools find
discounts, price trackers show historical changes, and review aggregators count
stars. Those signals are useful, but they rarely explain *why* a product is good
or bad—and they usually ignore the detailed, hands-on opinions found in video
reviews.

P.R.V.S.A. was built to provide context instead of another isolated metric. It
looks beyond the store currently selling the product, combines different kinds
of evidence, and filters out brand-owned videos to reduce sponsorship and
platform bias. The result is a faster, more informed purchasing decision.

## Features

### One report, directly on Amazon

Open an Amazon product page and P.R.V.S.A. adds a compact analysis panel without
sending you through a collection of tabs. Results stream into the panel as each
source finishes, so useful information appears without waiting for the entire
research process.

### Independent video-review analysis

P.R.V.S.A. searches YouTube for relevant, captioned product reviews and excludes
channels associated with the product's brand. Gemini then analyzes the available
transcripts for overall and aspect-level sentiment, with evidence tied back to
the transcript.

### Written-review context

Ratings alone do not explain recurring complaints or strengths. P.R.V.S.A.
collects ratings, review counts, and review excerpts from Google Products, then
summarizes the product-specific themes behind them. Evidence is retained only
when it can be verified against the supplied review text.

### Comparable-price research

The extension searches Google Shopping for comparable offers and evaluates the
current Amazon price in context. It shows the offers immediately, followed by a
price-value score and explanation once analysis is complete.

### Transparent combined score

Each source keeps its own score on a `-1` to `+1` scale. The final score uses
fixed weights:

| Signal | Weight |
| --- | ---: |
| YouTube video reviews | 45% |
| Google Products reviews | 35% |
| Price value | 20% |

Neutral or unavailable sources are excluded and the remaining weights are
rebalanced. If every available source is neutral, the final result remains
neutral—the extension does not invent a stronger opinion.

### Interactive evidence graph

The research icon in the analysis header opens a centered D3 evidence graph.
The Consensus sits between the Amazon listing and the research branches, tracing
the result back to transcript-backed YouTube
reviews, Google Products feedback, and individual Google Shopping offers.
Every source leaf links to the original record when available, or to a focused
research query as a fallback. The grid canvas
supports node dragging and zooming as the evidence set grows. Each research
branch displays its aggregate sentiment and score; hovering over the Consensus
node animates an RGB flow around that box using the logo's colors.

### Optional on-device summary

When Chrome's built-in Gemini Nano Prompt API is already available, P.R.V.S.A.
uses it to stream a short cross-source summary. This step runs on-device, does
not require another API key, and cannot change the source scores. P.R.V.S.A.
does not trigger a model download when Nano is unavailable.

## Quickstart

### 1. Start the API

P.R.V.S.A. requires Python 3.10 or newer and API keys for
[Gemini](https://ai.google.dev/gemini-api/docs/api-key),
[YouTube Data API v3](https://developers.google.com/youtube/v3/getting-started),
and [SerpApi](https://serpapi.com/).

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r api/requirements.txt

export GEMINI_API_KEY="your-gemini-api-key"
export YOUTUBE_API_KEY="your-youtube-data-api-key"
export SERPAPI_KEY="your-serpapi-key"

python3 -m uvicorn api.main:app --reload
```

The backend is now available at `http://127.0.0.1:8000`. Keep this terminal
running while using the extension.

### 2. Load the Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `client` directory.

### 3. Analyze a product

Open an Amazon product page. P.R.V.S.A. reads the product details, opens its
analysis panel, and requests price, written-review, and video-review research in
parallel.

## How it works

```text
Amazon product page
        │
        ▼
Chrome extension ── parses product, variant, image, and current price
        │
        ├── Google Shopping ── comparable offers and price-value analysis
        ├── Google Products ── ratings, excerpts, and written-review sentiment
        └── YouTube ── independent videos, transcripts, and sentiment
        │
        ▼
Weighted result + optional on-device summary
```

The Manifest V3 service worker sends requests to the local FastAPI backend.
All three research requests run concurrently, and NDJSON events progressively
update the interface. API credentials remain in the backend environment and are
never placed in the extension.

## Optional Vultr GPU worker

The Terraform stack in [`infra/vultr-gpu`](infra/vultr-gpu) provisions an
ephemeral Vultr Cloud GPU, builds this FastAPI application, and runs private
Hugging Face Text Embeddings Inference services for embeddings and optional
classification. The extension still connects to `127.0.0.1:8000` through an
SSH tunnel, so neither FastAPI nor the model servers are exposed publicly.

## Configuration

| Variable | Required | Purpose |
| --- | :---: | --- |
| `GEMINI_API_KEY` | Yes | Analyzes price, written-review, and video-review sentiment |
| `YOUTUBE_API_KEY` | Yes | Searches YouTube and retrieves video metadata |
| `SERPAPI_KEY` | Yes | Retrieves Google Shopping offers and Google Products reviews |
| `GEMINI_MODEL` | No | Overrides the default `gemini-3.1-flash-lite` model |
| `YOUTUBE_PROXY_USERNAME` | No | Webshare Residential username for transcript requests |
| `YOUTUBE_PROXY_PASSWORD` | No | Webshare Residential password for transcript requests |
| `YOUTUBE_TEST_DATA` | No | Uses local fixture data and makes no YouTube, transcript, or video-analysis requests |
| `EMBEDDING_BASE_URL` | No | Private TEI embedding-service URL |
| `EMBEDDING_MODEL_ID` | No | Reports which embedding model produced vectors |
| `CLASSIFICATION_ENABLED` | No | Enables the optional TEI classification route |
| `CLASSIFICATION_BASE_URL` | No | Private TEI sequence-classification URL |
| `CLASSIFICATION_MODEL_ID` | No | Reports which classification model produced predictions |

If YouTube blocks transcript requests from the API host, set both proxy
variables. The backend uses a direct connection when neither is set and reports
a configuration error when only one is provided. Keep all credentials out of
the repository and the Chrome extension.

When the YouTube Data API reports an exhausted search quota, the YouTube route
returns clearly labeled local fixture data rather than consuming another search
API. Set `YOUTUBE_TEST_DATA=true` to force this mode without making an initial
YouTube request. Test responses include `testData: true` and identify their
provider as `local-test-fixture`; they must not be treated as research evidence.

## API

The backend exposes three streaming `POST` endpoints:

| Endpoint | Returns |
| --- | --- |
| `/api/prices` | Comparable offers followed by price-value sentiment; the final result retains the offers |
| `/api/shopping` | Rating and review excerpts followed by written-review sentiment |
| `/api/youtube` | Video previews and per-review analysis followed by the enriched source records, transcripts, statistics, and sentiment |
| `/api/embeddings` | GPU-generated vectors for batches of text |
| `/api/classify` | Concurrent GPU text classifications when the optional model is enabled |
| `/api/models/health` | Readiness of the private model services |

Each endpoint accepts the product object parsed by the extension:

```json
{
  "asin": "B000000000",
  "url": "https://www.amazon.com/dp/B000000000",
  "title": "Example product",
  "brand": "Example",
  "model": "Model 1",
  "variant": "Black",
  "price": 99.99,
  "currency": "USD",
  "image": "https://example.com/product.jpg"
}
```

Responses use newline-delimited JSON so the UI can render source data and model
output as they arrive. Final events retain the gathered source data in addition
to the analysis fields already consumed by the extension. Price and shopping
responses expose complete provider records under `sourceData`; YouTube items
retain their source snippet, timed transcript segments, raw and derived
statistics, and sentiment analysis. The API also allows requests from
`http://localhost:3000` for a separate local web frontend.

## Project structure

```text
.
├── api/
│   ├── main.py              # FastAPI application
│   ├── sentiment.py         # Gemini analysis and evidence validation
│   └── sources/             # Price, shopping, and YouTube routes
├── infra/
│   └── vultr-gpu/           # Ephemeral GPU embedding worker (Terraform)
└── client/
    ├── manifest.json        # Chrome Manifest V3 configuration
    ├── assets/              # P.R.V.S.A. artwork and extension icons
    ├── vendor/              # Locally bundled browser dependencies (D3)
    └── src/
        ├── background.js    # API proxy and streaming transport
        ├── parser.js        # Amazon product parser
        ├── nano.js          # Optional on-device final summary
        ├── ui.js            # On-page analysis panel
        └── content.js       # Research orchestration
```

## Current scope

- The extension runs on Amazon.com product pages.
- The local API must be running on port `8000`.
- YouTube analysis requires an English transcript to be available.
- A failure from one source does not discard successful results from the others.
