# ISBN Bookshelf

[English](README.md) | [中文](README.zh-CN.md)

[![Core checks](https://github.com/JosieZhou00/isbn-bookshelf/actions/workflows/pages.yml/badge.svg)](https://github.com/JosieZhou00/isbn-bookshelf/actions/workflows/pages.yml)
[![Live app](https://img.shields.io/badge/GitHub%20Pages-Live-23483e)](https://josiezhou00.github.io/isbn-bookshelf/)
[![License: MIT](https://img.shields.io/badge/License-MIT-c8754f.svg)](LICENSE)

A mobile-friendly, open-source ISBN bookshelf. Scan the ISBN barcode on a book or enter the number manually, retrieve matching book details, and manage your reading progress on a Want to Read → Reading → Read board.

> [Open your personal bookshelf](https://josiezhou00.github.io/isbn-bookshelf/) · [View the two-book demo](https://josiezhou00.github.io/isbn-bookshelf/?demo=1#shelf)

The interface opens in English by default. Use the `中文` button in the header to switch to Chinese; the browser remembers your choice.

Demo mode contains two books authorized by the project owner for public display. It includes only public bibliographic data and reading status, with no private notes. Demo changes stay in memory for the current page session and never modify a visitor's personal shelf.

## Demo content

| Status | Title | Author | ISBN |
| --- | --- | --- | --- |
| Want to Read | 四开01：工作，就要不拘一格：向会工作的人请教，不拘一格的工作术 | 王牧之 主编 | 9787574002067 |
| Want to Read | 看见她们：ADHD女性的困境 | 洛塔·博里·斯科格隆 | 9787522208183 |

The demo supports sorting, status changes, the reading board, editing, and CSV export. Select **Exit demo** in the upper-right corner to return to your local bookshelf.

## Features

- Scan EAN-13 ISBN barcodes with a phone camera. If `BarcodeDetector` is unavailable, the app loads a pinned ZXing version.
- Enter and validate ISBN-10 or ISBN-13 manually.
- Query NeoDB's Chinese catalog, Google Books, and Open Library in sequence, accepting only exact ISBN matches.
- Keep the ISBN and open the manual form when no exact result is available instead of substituting a similar ISBN.
- Use a local bookshelf without registration; data stays in the current browser.
- Optionally sign in with an email verification code through Supabase to sync across devices.
- Add tags, filter by tag, and sort by added date or title.
- Manage reading progress on a Want to Read → Reading → Read board.
- Export UTF-8 BOM CSV files that open in Excel, Numbers, and other spreadsheet apps.
- Install the HTTPS version on a phone as a PWA.
- Switch between English and Chinese without changing stored book titles, authors, notes, or tags.

## Data modes

| Mode | Sign-in | Storage | Intended use |
| --- | --- | --- | --- |
| Local shelf | No | Browser `localStorage` | Default personal use |
| Demo shelf | No | Current page memory | Public demonstration without touching personal data |
| Cloud shelf | Email code | Your own Supabase project | Cross-device sync |

The three modes do not migrate data automatically. Export a CSV backup regularly when using the local shelf, because clearing site data also removes locally stored books.

## Run locally

```bash
git clone https://github.com/JosieZhou00/isbn-bookshelf.git
cd isbn-bookshelf
npm run start
```

Open <http://localhost:5174>. Without Supabase configuration, the app automatically uses the account-free local mode.

Run the core checks:

```bash
npm run check
```

Build the same static output used by GitHub Pages:

```bash
npm run build
```

The output is written to `dist/`. Its public configuration contains no secrets.

## GitHub Pages deployment

The [`.github/workflows/pages.yml`](.github/workflows/pages.yml) workflow publishes automatically:

1. A push to `main` runs syntax checks and tests.
2. `npm run build` creates the static `dist/` directory.
3. Only `dist/` is uploaded; `.env`, local configuration, and Supabase temporary files are excluded.
4. GitHub Pages is updated after the checks pass.

For a first deployment, set the repository's **Settings → Pages → Source** to **GitHub Actions** if Pages has not already been enabled.

## Optional email sync and aggregated lookup backend

1. Create a Supabase project.
2. Apply the migration with `supabase db push`.
3. Enable email sign-in and configure the email template to show `{{ .Token }}`.
4. For better Chinese-book coverage, deploy the `isbn-bookshelf-lookup` Edge Function and configure a domestic ISBN API on the server.
5. Add the public values to `.env`, then run `npm run build:config`.

See the [Chinese deployment guide](docs/部署说明.md) for the full setup. Third-party API keys belong in Edge Function secrets and must not be committed or exposed in frontend code.

## Project structure

```text
assets/
  app.js                 Coordinates page interactions
  i18n.js                English and Chinese interface text
  book-lookup.js         ISBN lookup and manual fallback
  local-store.js         Account-free browser storage
  demo-store.js          In-memory two-book demo
  supabase-store.js      Email sign-in and cloud storage
  scanner.js             Mobile barcode scanning
  ui.js                  Shelf and reading-board rendering
  csv-export.js          CSV export
scripts/
  build-static.mjs       Creates the GitHub Pages output
supabase/
  migrations/            Books table and row-level security
  functions/             Aggregated ISBN lookup function
tests/                   Core logic tests
```

## Privacy and security

- Local mode does not upload a bookshelf to the project owner or a project database.
- ISBN lookup sends the ISBN to the selected catalog services, but not local books, tags, or notes.
- Demo data contains no private notes and does not read a visitor's personal shelf.
- The cloud table is restricted to the `authenticated` role and enforces `auth.uid() = user_id`.
- `.env`, `assets/config.js`, `dist/`, and Supabase temporary directories are excluded from the repository.

See the [Chinese privacy notice](docs/隐私说明.md) for more detail.

## Known limitations

- Free book APIs have incomplete coverage of Chinese publications, so some exact ISBNs require manual entry.
- iPhone and most mobile browsers allow camera access only on HTTPS pages.
- Local mode depends on browser site data; export before changing browsers or clearing data.
- Books move between board columns through the status selector; touch drag-and-drop is not currently included.

## License

[MIT](LICENSE)
