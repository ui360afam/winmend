# WinMend: Windows error decoder

Blue screen stop codes, Windows Update, Win32, Store, activation and driver errors, explained with ranked causes and safe, ordered fixes.

## Run it on your computer (port 8093)

Install Node.js 18+ (nodejs.org, LTS), then:

- Windows: double-click `start-windows.bat`
- macOS: double-click `start-mac.command`
- Linux: `./start-mac-linux.sh`

Open http://localhost:8093. The admin panel is at http://localhost:8093/admin.

## Add error codes

- One at a time: Admin > Add an error > type the code > Auto-fill content > Save
- Many at once: Admin > Bulk import (plain list, CSV or JSON), or `node scripts/import.js file.csv`
- From reference pages: Admin > Scraper, or `node scripts/scrape.js --preset bugchecks`

Full instructions: `docs/USER_MANUAL.md` (also served at /manual).
