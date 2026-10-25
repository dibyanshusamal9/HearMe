# Contributing

Keep provider-specific code in `apps/hub/src/online`, shared domain rules in `packages/shared`, and UI/device behavior inside its client. Do not import provider configuration into browser or Expo code. Prefer injected fetch/provider implementations in tests, with no paid external calls in CI.

New languages require a `LangCode`, registry entry, provider mapping and accurate coverage notes. Declare UI fallbacks instead of presenting missing strings as translated. Safety and clinical wording require appropriate human review.

Before submitting changes:

```powershell
npm run typecheck
npm test
npm run build
```

Verify consent denial/revocation, missing credentials, provider errors, keyboard access and narrow-screen layout when touching the online UI. Do not commit `.env`, `.local-backups`, node modules, generated certificates, recordings or build output. Add API changes to `docs/API.md` and data-flow changes to `docs/PRIVACY.md`.

Preserve the original interface and offline AiEngine. Route Online mode per request and language, require explicit cloud opt-in, and retain local processing for other Asian languages. Test pause detection, automatic speech submission, refusals, duplicate suppression, mode switching, cloud playback cancellation and announcement replay. Do not restore wake recognition or chat flows. See docs/MODES.md.
