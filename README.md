# Facelift for Outlook

A Firefox and Zen Browser extension that gives Outlook on the web a clean, dark, keyboard-first interface. It hides Copilot, ribbon and toolbar clutter, flattens the reading pane, themes the notifications panel, and adds Superhuman-style shortcuts with a `Ctrl+K` command palette.

Everything runs locally in your browser. Facelift sends no data anywhere and needs no Entra ID app registration or IT approval, because it only restyles the Outlook page you are already signed in to.

Works on `outlook.office.com`, `outlook.office365.com`, `outlook.cloud.microsoft` and `outlook.live.com`.

*Not affiliated with or endorsed by Microsoft.*

## Install

### From a signed `.xpi` (permanent)

1. Download the signed `facelift_for_outlook-<version>.xpi`.
2. Drag it into a Zen or Firefox window, or open `about:addons` → gear icon → **Install Add-on From File…**.
3. Approve the access prompt for the Outlook sites.

### Temporary, for development

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.

Temporary add-ons are removed when the browser restarts.

## Usage

Click the **Facelift** toolbar icon to turn the redesign on or off, pick **Auto / Dark / Light**, and toggle each cleanup (reading pane, message list, folder sidebar, focus mode, Copilot, app rail, minimal toolbar, shortcuts).

| Key | Action |
| --- | --- |
| `J` / `K` | Move down / up in the message list |
| `Enter` | Open the selected email |
| `C` | Compose new mail |
| `R` | Reply |
| `Shift+R` | Reply all |
| `F` | Forward |
| `E` | Archive |
| `U` | Toggle read / unread |
| `#` or `Delete` | Move to Deleted Items |
| `/` | Focus Outlook search |
| `B` | Focus mode (hide the folder sidebar) |
| `Ctrl+K` / `Cmd+K` | Open the command palette |
| `?` | Show keyboard shortcuts |
| `Esc` | Close the palette / leave search |

## Development

Requires Node.js 18+.

```bash
npm install
npm run lint    # Mozilla's add-on linter (same checks AMO runs)
npm run build   # creates web-ext-artifacts/facelift_for_outlook-<version>.zip
npm start       # launches Firefox with the extension loaded
```

The build excludes dev files (`package.json`, `README.md`, `web-ext-config.mjs`); see [web-ext-config.mjs](./web-ext-config.mjs).

## Publishing to addons.mozilla.org

1. Bump `version` in [manifest.json](./manifest.json) (and [package.json](./package.json)) for every new upload.
2. Run `npm run lint` and `npm run build`.
3. Go to the [Developer Hub](https://addons.mozilla.org/developers/addon/submit/distribution) and choose:
   - **On this site** to list it publicly on AMO (reviewed by Mozilla), or
   - **On your own** for an unlisted, signed `.xpi` only you distribute (signed automatically, usually within minutes).
4. Upload the `.zip` from `web-ext-artifacts/`.
5. When asked whether the add-on uses minified or generated code, answer **No**. The source is uploaded as-is.

### Privacy

Facelift collects and transmits no data (`data_collection_permissions: none`). Its only permission is `storage`, used to save your popup preferences locally.
