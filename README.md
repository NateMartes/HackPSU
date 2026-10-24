# HackPSU

## API

Install and run the API from the repository root:

```bash
python3 -m pip install -r api/requirements.txt
python3 -m uvicorn api.main:app --reload
```

The placeholder API routes are available at:

- `POST /api/prices`
- `POST /api/shopping`
- `POST /api/youtube`

They currently return `501 Not Implemented`. Requests from
`http://localhost:3000` are allowed by the CORS configuration.

## Chrome extension

Load the `client` directory as an unpacked Manifest V3 extension. The extension
service worker has host permission for the local API on port 8000 and performs
the POST requests on behalf of the content script. Content-script code can wait
for a response with, for example:

```js
const result = await globalThis.hackPsuApi.prices({ query: "headphones" });
```

The `localhost:3000` CORS rule is for a separate local web frontend. Extension
requests use the service worker and the API host permissions in
`client/manifest.json` instead.
