# PinBoard

Save ideas. Find cool photos, rooms, cars, movies and items — free, in your browser, and as an Android app.

**Live site:** https://emanueltonda188-byte.github.io/PinBoard/

**Android app:** [Download PinBoard.apk](https://raw.githubusercontent.com/emanueltonda188-byte/PinBoard/main/PinBoard.apk) — sideload it on your phone (allow installs from unknown sources once).

## What is in this repo

- `index.html`, `style.css`, `app.js` — the PinBoard web app (newest version): feed with 9:16 and 16:9 rows, search and filters, Plus menu with Create Pin / Create Board / Create Collage, editor, pin view with likes/saves/share, Boards, dark mode. Open `index.html` or visit the live site.
- `PinBoard.apk` — the minimal Android wrapper (v1.1) that loads the live site.
- `classic/` — the first VS Code version of the app, kept as it was: `index.html` + `app.js` + `style.css` (feed) and `create.html` + `create.js` (add-pin page).

## Honest limits

- Pins are stored in your own browser only (localStorage). A friend opening the live site sees the app, not your pins — a shared database is the next slice.
- No example pin is bundled. The feed starts empty on purpose.
- The APK is a thin wrapper around the live site: it needs data to load, and it shows the site, not a separate native app.

## History

This repo replaces two old ones (`PinBoard`, which held only the APK, and `pinboard-vscode`, whose Pages site never went live). Everything from both is in here — the APK, the first app under `classic/`, and the newest app at the root.
