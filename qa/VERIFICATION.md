# JAL theme verification

- Production mobile web export and IFE build: passed.
- TypeScript checks in all four workspaces: passed.
- Shared tests: 79 passed; IFE tests: 6 passed.
- Hub tests with localhost access: 43 passed, 2 failed at the time. Certificate test assumes Unix private-key mode bits; static-serving test returned 403 instead of 200 on Windows. No hub code changed in this redesign.
- Windows follow-up: all 47 hub tests pass on Windows 11. Static files were refused because the path check expected '/' separators (now `path.relative`, with '\' traversal tests). The key-permission check runs only where POSIX mode bits exist. `npm run demo` failed with `spawn EINVAL` (Node needs a shell to run `npm.cmd`), and QR codes pointed at the VirtualBox adapter instead of Wi-Fi (Wi-Fi is now preferred). `npm run demo -- --no-ai` serves the stage, phone app (HTTP and HTTPS), seat cards and trust page.
- No mobile lint script or ESLint configuration is present; optional workspace lint command had no checks to run.
- Browser inspection: IFE welcome, language selection, home, water request review/submission; crew tablet empty state and seat map; mobile onboarding in phone frame. Screenshots are saved alongside this file.
- Native iOS/Android execution and actual airline hardware were not tested.
- Design detector: two warnings for the straight 3px header separators; these are intentional header rules, not borders on rounded cards.

Preview: run `npm run dev`, then open the printed URL. Routes: `#/ife`, `#/crew`, `#/mobile`. Mobile preview needs `npm run build:mobile-web` first. The exported phone preview explicitly uses `mobile/index.html` so Vite does not substitute the launcher.

Official logo origin: https://www.jal.com/commonY16/img/logo_jal.png. Local copies are bundled for offline use. Existing cabin photos came from the supplied ZIP. Browser Noto fonts were already dependencies; no proprietary JAL font was supplied.
