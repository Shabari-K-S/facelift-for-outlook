# Facelift for Outlook (Zen Browser & Firefox Extension)

A 100% local, privacy-first browser extension that redesigns `outlook.office.com` (and `outlook.cloud.microsoft` / `outlook.office365.com` / `outlook.live.com`) with a clean, high-contrast Superhuman/Linear UI and keyboard-first shortcuts—**zero Entra ID registration, zero IT approval, zero external servers, zero AI clutter**.

## Install in Zen Browser (Takes 30 seconds)

### Instant load (for testing right now)
1. Open a new tab in **Zen Browser** and go to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click **Load Temporary Add-on…**
3. Navigate to `zen-outlook-extension/` and select `manifest.json`.
4. Open `https://outlook.office.com` — the redesign and shortcuts activate immediately.
5. Click the **Facelift** icon in your Zen toolbar to toggle the redesign, switch between **Dark / Light / Auto**, or show/hide the ribbon and left app rail.

### Keep it permanently across Zen Browser restarts
Firefox/Zen removes temporary add-ons on restart unless installed as a signed `.xpi`:
1. Zip the contents of `zen-outlook-extension/` (making sure `manifest.json` is at the root of the zip).
2. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) (free Mozilla account) → **Submit a New Add-on** → choose **On your own** (private/unlisted).
3. Mozilla automatically signs it in ~1 minute and gives you a `.xpi` file.
4. Drag and drop that `.xpi` file into Zen Browser to install it permanently.

*(Because it is strictly local and never leaves your browser, signing it as "On your own" keeps it completely private.)*

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `J` / `K` | Move down / up in message list |
| `Enter` | Open selected email |
| `C` | Compose new mail |
| `R` | Reply |
| `Shift+R` | Reply all |
| `F` | Forward |
| `E` | Archive |
| `U` | Toggle Read / Unread |
| `#` or `Delete` | Move to Trash |
| `/` | Focus Outlook search bar |
| `Ctrl+K` / `Cmd+K` | Open the Facelift command palette |
| `?` | Show keyboard shortcuts |
| `Esc` | Close palette / blur search |
