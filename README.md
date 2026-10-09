# Checklist

A simple, minimal checklist app for day-to-day tasks, in the same style as App Drawer.
Make as many lists as you like (shopping, chores, packing), add items, tick them off, and clear
the done ones. Every phone that opens it shares the same lists, and they stay in sync.

- **Installable:** on Android/Chrome it offers an "Install" button; on iPhone it shows how to use
  Share → Add to Home Screen. Once installed it opens full screen from its own home-screen icon.
- **Works offline:** the app opens without a connection, and changes made offline are saved on the
  phone and sent to the server when it's back.
- **Tap** an item to tick it. **Press and hold** an item (or tap its pencil) to edit or delete it.
- **Press and hold a list** to select it, then tap more lists to select those too. The bar at the
  bottom deletes or pins them all at once, or edits one. Back or Cancel stops selecting.
- **Colours and pins:** in a list, tap `⋯` to rename it, pick its colour or pin it. Pinned lists
  show first as big tiles with their next few items. Pins belong to each device, like App Drawer's.
- Deletes can be undone from the message at the bottom.
- **To-do and Shopping:** swipe sideways (or tap the switch) on the Lists screen. A new list gets the
  type of the view you're in.
- **Shopping lists** split items under aisle headings (Fruit & veg, Dairy & eggs, …) guessed from the
  name; change one from the item's pencil and it's remembered. Type a quantity with the item ("2 milk",
  "eggs x12", "500g pasta") and it shows underneath. Suggestions appear as you type, with your usual
  quantity and group, and a **Buy again** row shows when the box is empty. Re-adding something already
  ticked on the list just unticks it.
- **Jason and Wah:** each phone asks "Who's this?" once, and tap *Switch* at the bottom of the Lists
  screen to change it. A phone only gets its own lists plus shared ones. Switch on **Share with…** in
  a list's `⋯` menu to put it under **Together** on both phones, where each card shows the latest
  change ("Wah added Oat milk"). On shared lists each item shows who added it.
  This keeps lists apart, but it isn't a lock: there are no sign-ins, so either phone could pick the
  other name.

## Run it locally

Needs Node 24 or newer. There are no packages to install.

```bash
node server.js
```

Then open http://localhost:4175. Lists are stored in `data/checklist.db` (SQLite).

If you start it with Windows Node on this WSL folder (for example from PowerShell), SQLite can't
lock files over the `\\wsl.localhost` share, so the lists are kept in
`%LOCALAPPDATA%\checklist` instead. Running it from the WSL terminal uses `data/` as normal.

Settings, all optional:

| Variable       | Default   | What it does                                        |
| -------------- | --------- | --------------------------------------------------- |
| `PORT`         | `4175`    | Port to listen on                                   |
| `DATA_DIR`     | `./data`  | Folder for `checklist.db`                           |
| `APP_PASSWORD` | _(empty)_ | If set, each device asks for this password once     |

## Server deployment

`compose.server.yml` runs it on the same `jrapp-remote-access_default` Cloudflare Tunnel network as
App Drawer, without publishing a host port. Lists live in the `checklist-data` Docker volume.

```bash
CHECKLIST_PASSWORD='choose-something' docker compose -f compose.server.yml up -d --build
```

Then point a Cloudflare public hostname at `http://checklist:80`.

The site is reachable from the internet, so either set a password or put it behind Cloudflare
Access. Installing as an app needs HTTPS, which the Cloudflare hostname provides
(`localhost` also works for testing).

## Backups

Everything is in one SQLite database in `/data`. To copy it out of the container:

```bash
docker cp checklist:/data ./checklist-backup
```
