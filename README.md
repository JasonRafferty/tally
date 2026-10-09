# Checklist

A small checklist app for me and Wah. We use it for shopping and for day-to-day to-dos. It looks like
my App Drawer, works as an installable app on your phone, and runs on my own server.

## What it does

- **To-do and Shopping.** Swipe sideways to switch between them.
- **Mine, Wah's and ours.** Each phone picks Jason or Wah once. You only see your own lists and the ones
  you've shared. Shared lists show up under "Together" with the latest change ("Wah added oat milk").
- **Shopping lists sort themselves.** Items go under aisles (fruit & veg, dairy, and so on). Type
  "2 milk" or "eggs x12" and the quantity is picked out. It suggests things you've bought before.
- **Instant.** A change on one phone shows up on the other straight away.
- **Works offline.** Changes made without signal are sent when you're back online.
- **Installable.** Android offers an Install button. On iPhone, use Share, then Add to Home Screen.

Tap an item to tick it. Hold a list to select it, then tap more to pin or delete them together.
Deletes can be undone.

## Run it

You need Node 24 or newer. There's nothing to install.

```bash
node server.js
```

Then open http://localhost:4175. Lists are saved in `data/checklist.db`.

You can set these if you want:

| Setting        | Default  | What it does                            |
| -------------- | -------- | --------------------------------------- |
| `PORT`         | `4175`   | Which port to use                       |
| `DATA_DIR`     | `./data` | Where the database is kept              |
| `APP_PASSWORD` | none     | Asks for a password once on each phone  |

If you start it with Windows Node on the WSL folder, the database goes in `%LOCALAPPDATA%\checklist`
instead, because SQLite can't lock files over that share.

## On my server

It runs as a small container next to App Drawer, on the same Cloudflare Tunnel network.

```bash
CHECKLIST_PASSWORD='something' docker compose -f compose.server.yml up -d --build
```

Then point a Cloudflare hostname at `http://checklist:80`. Phones only offer to install it over HTTPS, and
Cloudflare handles that. The lists live in the `checklist-data` volume. To back them up:

```bash
docker cp checklist:/data ./checklist-backup
```

## Good to know

There are no accounts. "Who's this?" keeps lists tidy, but it isn't a lock. Either phone could pick
the other name, so don't keep anything secret in here.
