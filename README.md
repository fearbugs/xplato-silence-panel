# xPlato Silence Panel

Public static frontend for submitting authorized silence batches.

The page contains no account credentials, Worker secrets, Plato session data, or protocol implementation. Configure `assets/config.js` with the Cloudflare Worker API base when the API is not routed through the same origin.

For production, use a custom domain and route `/api/*` plus `/health` to the Worker so the protected admin session remains same-origin.

The administration dialog opens after five quick clicks on the xPlato mark. This is only a concealed UI entry point; every admin API request is authenticated by the Worker.
