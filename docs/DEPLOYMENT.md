# Run and deploy

## Local setup

Use Node.js 22 or newer. From the repository root, run `npm ci` and `npm run demo` for the original application and local models. `npm start` uses the same original setup without opening a browser. Optional Tara setup is described in [ONLINE_ASSISTANT.md](ONLINE_ASSISTANT.md); it alone needs the two server-only keys in `.env`. `npm run check` checks optional keys/build presence without consuming API credits.

During development, run `npm run hub` and `npm run dev` in separate terminals. Vite proxies API/WebSocket calls to port 8080. Set `HEARME_HUB` for another hub. Expo’s original configuration and UI remain unchanged; it does not call the optional cloud extension.

## Configuration

- `SARVAM_API_KEY`: Sarvam server credential.
- `GROQ_API_KEY`: Groq server credential.
- `GROQ_MODEL`: defaults to `openai/gpt-oss-20b`. Must support strict structured output and the adapter’s reasoning settings.
- `SARVAM_STT_MODEL`: defaults to `saaras:v4`; provider account/model availability must be checked on first use.
- `HEARME_API_TIMEOUT_MS`: per-provider deadline, default 12000, clamped to 1000–30000.
- `PORT` / `HTTPS_PORT`: defaults 8080 / 8443.
- `HEARME_HOST`: advertised host for passenger joins.
- `HEARME_TLS_CERT`, `HEARME_TLS_KEY`: trusted certificate/key for direct HTTPS. Keep keys private.

## Hosted operation

Tara needs internet access to `api.sarvam.ai` and `api.groq.com`; original inference remains local. Put hosted deployments behind trusted HTTPS, authentication and appropriate network access controls. Proxy `/api`, `/ws` (with upgrade), `/mobile` and the web app to the same service. The existing demo API/crew console is not an authenticated multi-tenant backend; the consent header is not authorization or billing protection. Do not publish it as an unrestricted public service.

Use `npm ci && npm run build` before startup. Serve the built `apps/ife/dist` through the hub. A publicly trusted certificate is required for microphone use on phones; a generated local certificate only works after the test device trusts it. Browser voice activation requires the page to remain visible; native lock-screen activation would require a separate platform-specific implementation.

The app uses sample seat bookings and an in-memory relay. Restarts do not provide production-grade durable request storage. Preserve the existing prototype labeling and fixed safety content when piloting.
