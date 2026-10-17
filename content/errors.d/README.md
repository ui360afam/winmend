# Drop-in error files

Any `*.json` file in this folder is loaded at startup and merged into the
knowledge base. A file may hold one entry (an object) or many (an array).
Entries here override built-in entries with the same `slug`.

Create files here with `npm run import -- my-list.csv --to-repo` or
`npm run scrape -- --preset bugchecks --to-repo`, or by hand (see
docs/USER_MANUAL.md for the entry format). Commit them and they are live on
the next deploy.
