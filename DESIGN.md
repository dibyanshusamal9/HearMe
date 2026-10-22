# JAL-inspired HearMe

The user's chosen visual reference is Japan Airlines inflight entertainment. Preserve HearMe's passenger requests, multilingual support, medical assistance, captioning, and crew response workflows.

## Identity

- Crimson primary: `#C8102E`; charcoal: `#242424`; ground: `#F7F7F5`; surface: `#FFFFFF`; muted text: `#626262`; separators: `#D8D8D5`.
- Official airline lockup sourced from https://www.jal.com/commonY16/img/logo_jal.png and bundled locally in both clients. Preserve its aspect ratio and white backing. JAL's custom wordmark stays in the image; it is not recreated with text.
- Browser typography uses existing locally bundled Noto Sans with Japanese, Devanagari, and Thai fallbacks. Native text retains platform fonts and dynamic type. No proprietary JAL font files were supplied.
- Touch targets: mobile at least 56dp for primary controls; IFE large tiles; crew replies at least 56px. Keyboard focus remains visibly blue and distinct from red selection.
- Corners: 8–12px for most browser controls; shared/native radius tokens are 8, 14, 20, and 999dp for small, medium, large, and pill shapes. Use red for selected navigation and primary actions, semantic green/amber for response state. High-contrast black/yellow mode remains intact.

## Surfaces

IFE: white brand header, charcoal navigation rail, red active destination, pale content surface. Welcome screen uses the existing cabin photo with a dark scrim, airline logo, and prominent start action. Portrait stacks the navigation and content instead of shrinking text indefinitely.

Crew: light tablet console with seat map, request queue, reply detail, and announcements. A full red outline marks selection; urgent medical requests retain labels and semantic treatment. At tablet widths announcements follow the main workspace; narrow screens stack all panels.

Mobile: shared crimson/white tokens, bundled logo on onboarding and home, native interactions and accessibility behavior preserved. This is a themed prototype, not an airline-system integration.

Demo stage: the same white header and crimson rule as IFE and crew, on the pale ground. Devices sit in charcoal bezels. Crimson marks primary and selected controls. Timeline rules are semantic: crimson to crew, green to passenger, blue for the hub, amber while working, red when urgent. Captions and the read-aloud bubble are translucent charcoal.

Voice lab: airline lockup with a crimson header rule; crimson for selected chips; outcome colours use the semantic tokens.

## Web styles

One stylesheet, `apps/ife/src/styles.css`. Colours come only from the shared palette (`packages/shared/src/theme/tokens.ts`) as `--c-*` variables, set on the document at startup and overridden on the seatback for high contrast and text size. Mixes use `color-mix()` on those variables. The only fixed colour is the white backing behind the airline logo and QR codes. Palette additions for the web: `primaryStrong` (crimson text on soft crimson), `info` and `infoSoft`.
