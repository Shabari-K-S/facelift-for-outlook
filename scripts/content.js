(() => {
  "use strict";

  const extApi = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true,
    theme: "dark", // "auto" | "dark" | "light"
    hideAi: true,
    hideRail: true,
    hideRibbon: true,
    cleanFolders: true,
    compactList: true,
    cleanReading: true,
    focusMode: false,
    shortcutsEnabled: true,
  };

  let settings = { ...DEFAULT_SETTINGS };
  let shadowRoot = null;
  let paletteOpen = false;
  let shortcutsOpen = false;
  let paletteSelectedIndex = 0;
  let paletteFiltered = [];
  let toastTimer = null;
  let cleanupScheduled = false;

  function resolveTheme(pref) {
    if (pref === "dark" || pref === "light") return pref;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applySettingsToDom() {
    const root = document.documentElement;
    root.setAttribute("data-relay-enabled", String(settings.enabled));
    root.setAttribute("data-relay-theme", resolveTheme(settings.theme));
    root.setAttribute("data-relay-hide-ai", String(settings.hideAi));
    root.setAttribute("data-relay-hide-rail", String(settings.hideRail));
    root.setAttribute("data-relay-hide-ribbon", String(settings.hideRibbon));
    root.setAttribute("data-relay-clean-folders", String(settings.cleanFolders));
    root.setAttribute("data-relay-compact-list", String(settings.compactList));
    root.setAttribute("data-relay-clean-reading", String(settings.cleanReading));
    root.setAttribute("data-relay-focus-mode", String(settings.focusMode));
    updateFloatingPill();
    updateShadowTheme();
    scheduleDomCleanup();
  }

  async function loadSettings() {
    try {
      const stored = await extApi.storage.local.get(DEFAULT_SETTINGS);
      settings = { ...DEFAULT_SETTINGS, ...stored };
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
    applySettingsToDom();
  }

  async function saveSetting(patch) {
    settings = { ...settings, ...patch };
    applySettingsToDom();
    try {
      await extApi.storage.local.set(patch);
    } catch {
      // ignore storage errors
    }
  }

  // Apply defaults immediately at document_start to minimize flash
  applySettingsToDom();
  loadSettings();

  if (extApi?.storage?.onChanged) {
    extApi.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      for (const [k, v] of Object.entries(changes)) {
        if (k in settings) settings[k] = v.newValue;
      }
      applySettingsToDom();
    });
  }

  // ---------- Dynamic Clutter Sweeper (Safe Non-Destructive Tagging) ----------

  const NOISY_TOOLBAR_LABELS = [
    "sweep",
    "quick steps",
    "viva insights",
    "share to teams",
    "teams",
    "categorize",
    "snooze",
    "rules",
    "print",
    "undo",
    "report",
    "my templates",
    "apps",
    "add-ins",
    "flag / unflag",
    "ribbon display options",
  ];

  function sweepDynamicClutter() {
    cleanupScheduled = false;
    if (!document.body) return;

    if (!settings.enabled) {
      document.querySelectorAll("[data-relay-hidden]").forEach((el) => {
        el.removeAttribute("data-relay-hidden");
      });
      document.querySelectorAll("[data-relay-surface]").forEach((el) => {
        el.removeAttribute("data-relay-surface");
      });
      document.querySelectorAll("[data-relay-np]").forEach((el) => {
        el.removeAttribute("data-relay-np");
      });
      document
        .querySelectorAll('[data-relay-empty-state="true"]')
        .forEach((el) => el.removeAttribute("data-relay-empty-state"));
      return;
    }

    // 1. Hide Copilot / AI banners & "Summarize this email" buttons
    if (settings.hideAi) {
      const candidates = document.querySelectorAll(
        'button, [role="button"], [role="region"], [role="status"]'
      );
      for (const el of candidates) {
        if (el.getAttribute("data-relay-hidden") === "ai") continue;
        const label = (
          (el.getAttribute("aria-label") || "") +
          " " +
          (el.getAttribute("title") || "")
        ).toLowerCase();
        const text = (el.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

        if (
          label.includes("copilot") ||
          label.includes("summary by") ||
          label.includes("summarize") ||
          label.includes("draft with") ||
          label.includes("coaching by") ||
          text === "summarize this email" ||
          text === "summarize" ||
          text.startsWith("summary by copilot") ||
          text.startsWith("draft with copilot")
        ) {
          el.setAttribute("data-relay-hidden", "ai");
        }
      }

      // Catch "Summarize this email" even when rendered as a nested span/div pill
      const allLeaves = document.querySelectorAll("span, div");
      for (const node of allLeaves) {
        if (node.children.length > 0) continue;
        const t = (node.textContent || "").trim().toLowerCase();
        if (t === "summarize this email" || t === "summarize by copilot") {
          const pill =
            node.closest('button, [role="button"]') ||
            node.parentElement?.parentElement ||
            node.parentElement;
          if (pill) pill.setAttribute("data-relay-hidden", "ai");
        }
      }
    }

    // 2. Minimal toolbar: hide the "File" ribbon row & noisy command-bar buttons
    if (settings.hideRibbon) {
      // Hide the slim "☰ File" full-width row right below the top header
      const fileNodes = document.querySelectorAll(
        'button, [role="tab"], [role="menuitem"], span'
      );
      for (const el of fileNodes) {
        if ((el.textContent || "").trim() !== "File") continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < 20 || rect.top > 115 || rect.left > 180) continue;
        let curr = el.parentElement;
        while (curr && curr !== document.body) {
          const r = curr.getBoundingClientRect();
          if (r.width > window.innerWidth * 0.5 && r.height > 20 && r.height <= 48) {
            curr.setAttribute("data-relay-hidden", "ribbon");
            break;
          }
          curr = curr.parentElement;
        }
        break;
      }

      // Trim noisy buttons inside the top command bar (y < 160px)
      const topButtons = document.querySelectorAll(
        '[role="toolbar"] button, [role="toolbar"] [role="button"], [role="toolbar"] [role="menuitem"], [role="menubar"] button, [role="menubar"] [role="menuitem"]'
      );
      for (const btn of topButtons) {
        const rect = btn.getBoundingClientRect();
        if (rect.top > 160) continue;
        const text = (btn.textContent || "").trim().toLowerCase();
        const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
        const title = (btn.getAttribute("title") || "").trim().toLowerCase();
        const combined = `${text} ${aria} ${title}`;

        if (
          NOISY_TOOLBAR_LABELS.some(
            (term) => text === term || aria === term || combined.includes(term)
          )
        ) {
          // Hide split-button wrapper if this is inside a small button group
          const parent = btn.parentElement;
          if (
            parent &&
            parent.children.length <= 2 &&
            parent.getBoundingClientRect().width < 180 &&
            parent.getAttribute("role") !== "toolbar" &&
            parent.getAttribute("role") !== "menubar"
          ) {
            parent.setAttribute("data-relay-hidden", "ribbon");
          } else {
            btn.setAttribute("data-relay-hidden", "ribbon");
          }
        }
      }

      // Hide leftover vertical divider/separator bars inside the top command bar
      const toolbars = document.querySelectorAll(
        '[role="toolbar"], [role="menubar"], #innerRibbonContainer'
      );
      for (const bar of toolbars) {
        if (bar.getBoundingClientRect().top > 160) continue;
        const nodes = bar.querySelectorAll("div, span, hr");
        for (const el of nodes) {
          if (el.getAttribute("data-relay-hidden")) continue;
          if (el.querySelector("button, svg, img, input, i")) continue;
          if ((el.textContent || "").trim() !== "") continue;

          const rect = el.getBoundingClientRect();
          if (rect.height < 10 || rect.height > 44) continue;

          const isThinLine = rect.width > 0 && rect.width <= 3;
          const isDividerRole =
            el.getAttribute("role") === "separator" ||
            /divider|separator/i.test(String(el.className || ""));

          if (isThinLine || isDividerRole) {
            // If wrapped in a narrow spacer container (<= 18px wide), hide the wrapper too
            const parent = el.parentElement;
            if (
              parent &&
              parent !== bar &&
              parent.children.length === 1 &&
              parent.getBoundingClientRect().width <= 18 &&
              !parent.querySelector("button, svg, img, input, i")
            ) {
              parent.setAttribute("data-relay-hidden", "ribbon");
            } else {
              el.setAttribute("data-relay-hidden", "ribbon");
            }
          }
        }
      }
    }

    // 3. Clean Folder Sidebar: hide "Go to Groups" and "Discover groups" links
    if (settings.cleanFolders) {
      const navPane =
        document.querySelector('[data-app-section="NavigationPane"]') ||
        document.querySelector('[role="navigation"][aria-label*="Navigation" i]') ||
        document.body;
      const navItems = navPane.querySelectorAll(
        'button, a, [role="treeitem"], [role="button"], span'
      );
      for (const item of navItems) {
        const rect = item.getBoundingClientRect();
        if (rect.left > 280 || rect.width === 0) continue;
        const text = (item.textContent || "").trim().toLowerCase();
        if (
          text === "go to groups" ||
          text === "discover groups" ||
          text === "new group"
        ) {
          const row =
            item.closest('button, a, [role="treeitem"], [role="button"]') ||
            item.parentElement ||
            item;
          row.setAttribute("data-relay-hidden", "folder");
        }
      }
    }

    // 4. Clean Reading Pane: unify patchy card/header surfaces, hide Suggested Replies & style Empty State
    if (settings.cleanReading) {
      const readingPane = document.getElementById("ReadingPaneContainerId");
      if (readingPane) {
        const rootPane = readingPane;

        // Unify Outlook's subject header & thread card backgrounds with Relay's canvas
        const heading = rootPane.querySelector('[role="heading"]');
        if (heading) {
          const headerBox =
            heading.closest('[role="region"]') ||
            heading.parentElement?.parentElement ||
            heading.parentElement;
          if (headerBox && headerBox !== rootPane) {
            headerBox.setAttribute("data-relay-surface", "reading-header");
          }
        }

        const regions = readingPane.querySelectorAll('[role="region"], div');
        for (const el of regions) {
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          if (aria.includes("suggested repl") || aria.includes("quick repl")) {
            el.setAttribute("data-relay-hidden", "reading");
          }
        }

        // Tag Outlook's empty-state container ("Select an item to read")
        const spans = readingPane.querySelectorAll("span, div, p");
        for (const node of spans) {
          if (
            node.children.length === 0 &&
            (node.textContent || "").trim() === "Select an item to read"
          ) {
            const container = node.parentElement?.parentElement || node.parentElement;
            if (container) {
              container.setAttribute("data-relay-empty-state", "true");
            }
            break;
          }
        }
      }
    }

    // 5. Notifications side panel (O365 suite shell): theme it to match Relay
    themeNotificationsPane();
  }

  function parseRgb(color) {
    const m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] !== undefined ? Number(m[4]) : 1,
    };
  }

  function findNotificationsPane() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const candidates = document.querySelectorAll(
      'h1, h2, h3, [role="heading"], span, div'
    );
    for (const node of candidates) {
      if (node.children.length > 0) continue;
      if ((node.textContent || "").trim() !== "Notifications") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.left < vw * 0.55) continue;

      // Climb to the tallest right-side ancestor that still looks like a side panel
      let pane = null;
      let curr = node.parentElement;
      while (curr && curr !== document.body) {
        const r = curr.getBoundingClientRect();
        if (r.width > 560) break;
        if (r.width >= 250 && r.height >= vh * 0.6) pane = curr;
        curr = curr.parentElement;
      }
      if (pane) return pane;
    }
    return null;
  }

  function themeNotificationsPane() {
    const pane = findNotificationsPane();
    if (!pane) return;
    pane.setAttribute("data-relay-np", "pane");

    const paneRect = pane.getBoundingClientRect();
    const isDark = resolveTheme(settings.theme) === "dark";

    // Classify Outlook's grey fills once, while their original colours are still visible.
    // Tagged elements are skipped next time, so Relay's repaint never feeds back in.
    const nodes = pane.querySelectorAll(
      'div, li, section, button, [role="button"], [role="listitem"]'
    );
    for (const el of nodes) {
      if (el.hasAttribute("data-relay-np")) continue;
      if (el.closest('[role="img"], [data-relay-np="icon-btn"]')) continue;
      const r = el.getBoundingClientRect();

      // Small header controls (filter, delete, settings, close) get a flat icon-button style
      if (el.matches('button, [role="button"]') && r.width <= 48 && r.height <= 48) {
        el.setAttribute("data-relay-np", "icon-btn");
        continue;
      }

      const rgb = parseRgb(window.getComputedStyle(el).backgroundColor);
      if (!rgb || rgb.a === 0) continue;
      const neutral = Math.abs(rgb.r - rgb.g) <= 12 && Math.abs(rgb.g - rgb.b) <= 12;
      const greyish = isDark
        ? rgb.r >= 18 && rgb.r <= 75
        : rgb.r >= 225 && rgb.r <= 252;
      if (!neutral || !greyish) continue;

      const isSurface =
        r.width >= paneRect.width * 0.9 && r.height >= paneRect.height * 0.5;
      el.setAttribute("data-relay-np", isSurface ? "surface" : "card");
    }

    // "Last seen" divider: mute its label and brand-blue rule lines
    for (const node of pane.querySelectorAll("span, div")) {
      if (node.children.length > 0) continue;
      if ((node.textContent || "").trim().toLowerCase() !== "last seen") continue;
      const row = node.parentElement;
      if (row && !row.hasAttribute("data-relay-np")) {
        row.setAttribute("data-relay-np", "divider");
        for (const child of row.querySelectorAll("div, span, hr")) {
          if (child.getBoundingClientRect().height <= 2) {
            child.setAttribute("data-relay-np", "divider-line");
          }
        }
      }
      break;
    }

    // Hide the large 3D bell illustration on the "You're all caught up!" state
    for (const art of pane.querySelectorAll("img, svg")) {
      if (art.closest('button, [role="button"]')) continue;
      const r = art.getBoundingClientRect();
      if (r.width >= 64 && r.height >= 64) {
        art.setAttribute("data-relay-hidden", "true");
      }
    }
  }

  function scheduleDomCleanup() {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    requestAnimationFrame(sweepDynamicClutter);
  }

  function startObserver() {
    if (!document.body) return;
    const observer = new MutationObserver(() => {
      if (settings.enabled) scheduleDomCleanup();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleDomCleanup();
  }

  // ---------- Outlook Web DOM Action Helpers (Stable ARIA selectors) ----------

  function isEditable(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    if (el.closest('[contenteditable="true"], [role="textbox"]')) return true;
    return false;
  }

  function getMessageRows() {
    const listbox =
      document.querySelector('[aria-label="Message list"] [role="listbox"]') ||
      document.querySelector('[role="listbox"]');
    if (!listbox) return [];
    return Array.from(listbox.querySelectorAll('[role="option"]')).filter(
      (el) => el.offsetParent !== null
    );
  }

  function moveSelection(delta) {
    const rows = getMessageRows();
    if (rows.length === 0) {
      showToast("No messages found in list");
      return;
    }

    let idx = rows.findIndex(
      (r) =>
        r.classList.contains("relay-kbd-focus") ||
        r.getAttribute("aria-selected") === "true" ||
        r === document.activeElement
    );

    if (idx === -1) {
      idx = delta > 0 ? 0 : rows.length - 1;
    } else {
      idx = Math.max(0, Math.min(rows.length - 1, idx + delta));
    }

    rows.forEach((r) => r.classList.remove("relay-kbd-focus"));
    const target = rows[idx];
    target.classList.add("relay-kbd-focus");
    target.scrollIntoView({ block: "nearest" });
    target.focus({ preventScroll: true });
  }

  function openSelectedMessage() {
    const rows = getMessageRows();
    const target =
      rows.find((r) => r.classList.contains("relay-kbd-focus")) ||
      rows.find((r) => r.getAttribute("aria-selected") === "true") ||
      rows[0];

    if (target) {
      target.click();
    }
  }

  function clickButtonByLabels(labels) {
    const buttons = Array.from(
      document.querySelectorAll('button, [role="button"], [role="menuitem"]')
    ).filter((el) => el.offsetParent !== null);

    for (const pattern of labels) {
      const lower = pattern.toLowerCase();
      const exact = buttons.find((b) => {
        const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
        const title = (b.getAttribute("title") || "").trim().toLowerCase();
        const text = (b.textContent || "").trim().toLowerCase();
        return aria === lower || title === lower || text === lower;
      });
      if (exact) {
        exact.click();
        return true;
      }
    }

    for (const pattern of labels) {
      const lower = pattern.toLowerCase();
      const partial = buttons.find((b) => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        const title = (b.getAttribute("title") || "").toLowerCase();
        return aria.includes(lower) || title.includes(lower);
      });
      if (partial) {
        partial.click();
        return true;
      }
    }
    return false;
  }

  function clickFolder(names) {
    const items = Array.from(document.querySelectorAll('[role="treeitem"]')).filter(
      (el) => el.offsetParent !== null
    );
    for (const name of names) {
      const lower = name.toLowerCase();
      const match = items.find((item) => {
        const aria = (item.getAttribute("aria-label") || "").toLowerCase();
        const title = (item.getAttribute("title") || "").toLowerCase();
        const text = (item.textContent || "").trim().toLowerCase();
        return (
          aria.startsWith(lower) ||
          title.startsWith(lower) ||
          text.startsWith(lower)
        );
      });
      if (match) {
        match.click();
        showToast(`Switched to ${names[0]}`);
        return true;
      }
    }
    showToast(`Folder "${names[0]}" not visible`);
    return false;
  }

  function focusSearch() {
    const input =
      document.querySelector("#topSearchInput") ||
      document.querySelector('[role="search"] input') ||
      document.querySelector('input[aria-label*="Search" i]');
    if (input) {
      input.focus();
      input.select();
      return true;
    }
    showToast("Search box not found");
    return false;
  }

  function actionCompose() {
    if (clickButtonByLabels(["New mail", "New message"])) {
      showToast("Compose");
    } else {
      showToast("Could not find New mail button");
    }
  }

  function actionReply(mode = "reply") {
    const map = {
      reply: ["Reply"],
      replyAll: ["Reply all"],
      forward: ["Forward"],
    };
    if (clickButtonByLabels(map[mode])) {
      showToast(
        mode === "replyAll"
          ? "Reply all"
          : mode === "forward"
            ? "Forward"
            : "Reply"
      );
    } else {
      showToast("Open an email first to reply");
    }
  }

  function actionArchive() {
    if (clickButtonByLabels(["Archive"])) {
      showToast("Archived");
    } else {
      showToast("Archive button not available");
    }
  }

  function actionTrash() {
    if (clickButtonByLabels(["Delete", "Move to Deleted Items"])) {
      showToast("Moved to Trash");
    } else {
      showToast("Delete button not available");
    }
  }

  function actionToggleRead() {
    if (
      clickButtonByLabels([
        "Mark as unread",
        "Mark as read",
        "Read / Unread",
        "Mark unread",
        "Mark read",
      ])
    ) {
      showToast("Toggled read status");
    } else {
      showToast("Read/Unread button not available");
    }
  }

  function actionToggleFocusMode() {
    const next = !settings.focusMode;
    saveSetting({ focusMode: next });
    showToast(next ? "Focus mode on (sidebar hidden)" : "Focus mode off");
  }

  // ---------- Shadow DOM UI (Command Palette, Shortcuts, Toast) ----------

  function getCommands() {
    return [
      { id: "inbox", group: "Folders", label: "Go to Inbox", run: () => clickFolder(["Inbox"]) },
      { id: "sent", group: "Folders", label: "Go to Sent Items", run: () => clickFolder(["Sent Items", "Sent"]) },
      { id: "drafts", group: "Folders", label: "Go to Drafts", run: () => clickFolder(["Drafts"]) },
      { id: "archive-folder", group: "Folders", label: "Go to Archive", run: () => clickFolder(["Archive"]) },
      { id: "trash-folder", group: "Folders", label: "Go to Deleted Items", run: () => clickFolder(["Deleted Items", "Trash"]) },
      { id: "compose", group: "Actions", label: "Compose new email", kbd: "C", run: actionCompose },
      { id: "reply", group: "Actions", label: "Reply to open email", kbd: "R", run: () => actionReply("reply") },
      { id: "reply-all", group: "Actions", label: "Reply all", kbd: "Shift+R", run: () => actionReply("replyAll") },
      { id: "forward", group: "Actions", label: "Forward email", kbd: "F", run: () => actionReply("forward") },
      { id: "archive", group: "Actions", label: "Archive email", kbd: "E", run: actionArchive },
      { id: "toggle-read", group: "Actions", label: "Toggle read / unread", kbd: "U", run: actionToggleRead },
      { id: "trash", group: "Actions", label: "Move to Trash", kbd: "#", run: actionTrash },
      { id: "search", group: "Actions", label: "Search mail", kbd: "/", run: focusSearch },
      {
        id: "focus-mode",
        group: "Appearance",
        label: settings.focusMode ? "Exit Focus mode (show sidebar)" : "Enter Focus mode (hide sidebar)",
        kbd: "B",
        run: actionToggleFocusMode,
      },
      {
        id: "toggle-theme",
        group: "Appearance",
        label: `Switch to ${resolveTheme(settings.theme) === "dark" ? "light" : "dark"} theme`,
        run: () => {
          const next = resolveTheme(settings.theme) === "dark" ? "light" : "dark";
          saveSetting({ theme: next });
          showToast(`Switched to ${next} mode`);
        },
      },
      {
        id: "toggle-skin",
        group: "Appearance",
        label: settings.enabled ? "Turn off Facelift redesign" : "Turn on Facelift redesign",
        run: () => {
          saveSetting({ enabled: !settings.enabled });
          showToast(settings.enabled ? "Redesign enabled" : "Redesign disabled");
        },
      },
      {
        id: "toggle-ribbon",
        group: "Appearance",
        label: settings.hideRibbon ? "Show Outlook ribbon tabs" : "Hide Outlook ribbon tabs",
        run: () => {
          saveSetting({ hideRibbon: !settings.hideRibbon });
          showToast(settings.hideRibbon ? "Ribbon hidden" : "Ribbon shown");
        },
      },
      {
        id: "toggle-rail",
        group: "Appearance",
        label: settings.hideRail ? "Show Microsoft 365 app rail" : "Hide Microsoft 365 app rail",
        run: () => {
          saveSetting({ hideRail: !settings.hideRail });
          showToast(settings.hideRail ? "App rail hidden" : "App rail shown");
        },
      },
      {
        id: "shortcuts",
        group: "Help",
        label: "Show keyboard shortcuts",
        kbd: "?",
        run: () => openShortcutsModal(),
      },
    ];
  }

  function ensureShadowUi() {
    if (shadowRoot || !document.body) return;

    const host = document.createElement("div");
    host.id = "relay-shadow-host";
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap {
          font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          --bg: #0f1115;
          --bg-elev: #171a21;
          --bg-hover: #212631;
          --border: #2a303c;
          --text: #f3f4f6;
          --text-2: #9ca3af;
          --muted: #6b7280;
          --accent: #3b82f6;
          --kbd-bg: #1e222b;
        }
        .wrap.light {
          --bg: #ffffff;
          --bg-elev: #f7f8fa;
          --bg-hover: #eef0f4;
          --border: #e2e5eb;
          --text: #111827;
          --text-2: #4b5563;
          --muted: #6b7280;
          --accent: #2563eb;
          --kbd-bg: #f3f4f6;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483640;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(2px);
          display: none;
          align-items: flex-start;
          justify-content: center;
          padding-top: 14vh;
        }
        .backdrop.open { display: flex; }
        .dialog {
          width: min(520px, 92vw);
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
          overflow: hidden;
          color: var(--text);
        }
        .search-row {
          display: flex;
          align-items: center;
          padding: 0 14px;
          border-bottom: 1px solid var(--border);
        }
        .search-input {
          width: 100%;
          height: 44px;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 14px;
        }
        .search-input::placeholder { color: var(--muted); }
        .list {
          max-height: 340px;
          overflow-y: auto;
          padding: 6px;
        }
        .group-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          padding: 8px 10px 4px;
        }
        .item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          border: none;
          background: transparent;
          color: var(--text-2);
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          text-align: left;
        }
        .item.active, .item:hover {
          background: var(--bg-hover);
          color: var(--text);
        }
        kbd {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--kbd-bg);
          border: 1px solid var(--border);
          color: var(--text-2);
        }
        .empty {
          padding: 28px;
          text-align: center;
          font-size: 12px;
          color: var(--muted);
        }
        .shortcuts-body {
          padding: 14px 16px 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 18px;
          font-size: 12.5px;
        }
        .shortcut-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 0;
          border-bottom: 1px solid var(--border);
          color: var(--text-2);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
          font-weight: 600;
        }
        .toast {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 2147483645;
          background: var(--bg-elev);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 500;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          opacity: 0;
          transform: translateY(6px);
          pointer-events: none;
          transition: opacity 140ms ease, transform 140ms ease;
        }
        .toast.visible {
          opacity: 1;
          transform: translateY(0);
        }
      </style>
      <div class="wrap" id="relay-wrap">
        <div class="backdrop" id="palette-backdrop">
          <div class="dialog" role="dialog" aria-label="Facelift command palette">
            <div class="search-row">
              <input class="search-input" id="palette-input" type="text" placeholder="Jump to folder or run an action..." autocomplete="off" />
              <kbd>ESC</kbd>
            </div>
            <div class="list" id="palette-list"></div>
          </div>
        </div>

        <div class="backdrop" id="shortcuts-backdrop">
          <div class="dialog" role="dialog" aria-label="Keyboard Shortcuts">
            <div class="modal-header">
              <span>Keyboard shortcuts</span>
              <kbd>ESC</kbd>
            </div>
            <div class="shortcuts-body">
              <div class="shortcut-row"><span>Next email</span><kbd>J</kbd></div>
              <div class="shortcut-row"><span>Previous email</span><kbd>K</kbd></div>
              <div class="shortcut-row"><span>Open email</span><kbd>Enter</kbd></div>
              <div class="shortcut-row"><span>Compose</span><kbd>C</kbd></div>
              <div class="shortcut-row"><span>Reply</span><kbd>R</kbd></div>
              <div class="shortcut-row"><span>Reply all</span><kbd>Shift+R</kbd></div>
              <div class="shortcut-row"><span>Forward</span><kbd>F</kbd></div>
              <div class="shortcut-row"><span>Archive</span><kbd>E</kbd></div>
              <div class="shortcut-row"><span>Read / Unread</span><kbd>U</kbd></div>
              <div class="shortcut-row"><span>Move to Trash</span><kbd># / Del</kbd></div>
              <div class="shortcut-row"><span>Search mail</span><kbd>/</kbd></div>
              <div class="shortcut-row"><span>Command palette</span><kbd>Ctrl+K</kbd></div>
            </div>
          </div>
        </div>

        <div class="toast" id="relay-toast" role="status" aria-live="polite"></div>
      </div>
    `;

    const paletteBackdrop = shadowRoot.getElementById("palette-backdrop");
    const shortcutsBackdrop = shadowRoot.getElementById("shortcuts-backdrop");
    const input = shadowRoot.getElementById("palette-input");

    paletteBackdrop.addEventListener("click", (e) => {
      if (e.target === paletteBackdrop) closeOverlays();
    });
    shortcutsBackdrop.addEventListener("click", (e) => {
      if (e.target === shortcutsBackdrop) closeOverlays();
    });

    input.addEventListener("input", () => {
      paletteSelectedIndex = 0;
      renderPaletteList(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (paletteFiltered.length) {
          paletteSelectedIndex =
            (paletteSelectedIndex + 1) % paletteFiltered.length;
          renderPaletteList(input.value);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (paletteFiltered.length) {
          paletteSelectedIndex =
            (paletteSelectedIndex - 1 + paletteFiltered.length) %
            paletteFiltered.length;
          renderPaletteList(input.value);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = paletteFiltered[paletteSelectedIndex];
        if (cmd) {
          closeOverlays();
          cmd.run();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeOverlays();
      }
    });

    updateShadowTheme();
    updateFloatingPill();
  }

  function updateShadowTheme() {
    if (!shadowRoot) return;
    const wrap = shadowRoot.getElementById("relay-wrap");
    if (!wrap) return;
    wrap.classList.toggle("light", resolveTheme(settings.theme) === "light");
  }

  function updateFloatingPill() {
    if (!document.body) return;
    let pill = document.getElementById("relay-floating-pill");
    if (!settings.enabled) {
      if (pill) pill.remove();
      return;
    }
    if (!pill) {
      pill = document.createElement("button");
      pill.id = "relay-floating-pill";
      pill.type = "button";
      pill.title = "Open Facelift command palette (Ctrl+K / Cmd+K)";
      pill.textContent = "Facelift · Ctrl+K";
      pill.addEventListener("click", () => openPalette());
      document.body.appendChild(pill);
    }
  }

  function renderPaletteList(query) {
    if (!shadowRoot) return;
    const list = shadowRoot.getElementById("palette-list");
    const q = (query || "").trim().toLowerCase();
    const commands = getCommands();
    paletteFiltered = q
      ? commands.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.group.toLowerCase().includes(q)
        )
      : commands;

    if (paletteFiltered.length === 0) {
      list.innerHTML = `<div class="empty">No matching commands.</div>`;
      return;
    }

    let html = "";
    let lastGroup = "";
    paletteFiltered.forEach((cmd, idx) => {
      if (cmd.group !== lastGroup) {
        lastGroup = cmd.group;
        html += `<div class="group-label">${cmd.group}</div>`;
      }
      html += `
        <button type="button" class="item ${idx === paletteSelectedIndex ? "active" : ""}" data-idx="${idx}">
          <span>${cmd.label}</span>
          ${cmd.kbd ? `<kbd>${cmd.kbd}</kbd>` : ""}
        </button>
      `;
    });

    list.innerHTML = html;
    list.querySelectorAll(".item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const cmd = paletteFiltered[idx];
        closeOverlays();
        if (cmd) cmd.run();
      });
    });
  }

  function openPalette() {
    ensureShadowUi();
    if (!shadowRoot) return;
    closeOverlays();
    paletteOpen = true;
    paletteSelectedIndex = 0;
    const backdrop = shadowRoot.getElementById("palette-backdrop");
    const input = shadowRoot.getElementById("palette-input");
    input.value = "";
    renderPaletteList("");
    backdrop.classList.add("open");
    setTimeout(() => input.focus(), 10);
  }

  function openShortcutsModal() {
    ensureShadowUi();
    if (!shadowRoot) return;
    closeOverlays();
    shortcutsOpen = true;
    shadowRoot.getElementById("shortcuts-backdrop").classList.add("open");
  }

  function closeOverlays() {
    paletteOpen = false;
    shortcutsOpen = false;
    if (!shadowRoot) return;
    shadowRoot.getElementById("palette-backdrop")?.classList.remove("open");
    shadowRoot.getElementById("shortcuts-backdrop")?.classList.remove("open");
  }

  function showToast(message) {
    ensureShadowUi();
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById("relay-toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("visible");
    }, 2000);
  }

  // ---------- Global Keyboard Shortcuts ----------

  window.addEventListener(
    "keydown",
    (e) => {
      if (!settings.shortcutsEnabled) return;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        if (paletteOpen) closeOverlays();
        else openPalette();
        return;
      }

      if (e.key === "Escape") {
        if (paletteOpen || shortcutsOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeOverlays();
          return;
        }
        if (document.activeElement?.id === "topSearchInput") {
          document.activeElement.blur();
        }
        return;
      }

      if (paletteOpen || shortcutsOpen) return;
      if (isEditable(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case "j":
        case "J":
          e.preventDefault();
          e.stopPropagation();
          moveSelection(1);
          break;
        case "k":
        case "K":
          e.preventDefault();
          e.stopPropagation();
          moveSelection(-1);
          break;
        case "Enter":
          if (
            document.querySelector('[role="option"].relay-kbd-focus')
          ) {
            e.preventDefault();
            e.stopPropagation();
            openSelectedMessage();
          }
          break;
        case "c":
        case "C":
          e.preventDefault();
          e.stopPropagation();
          actionCompose();
          break;
        case "r":
          e.preventDefault();
          e.stopPropagation();
          actionReply("reply");
          break;
        case "R":
          e.preventDefault();
          e.stopPropagation();
          actionReply("replyAll");
          break;
        case "f":
        case "F":
          e.preventDefault();
          e.stopPropagation();
          actionReply("forward");
          break;
        case "e":
        case "E":
          e.preventDefault();
          e.stopPropagation();
          actionArchive();
          break;
        case "u":
        case "U":
          e.preventDefault();
          e.stopPropagation();
          actionToggleRead();
          break;
        case "b":
        case "B":
          e.preventDefault();
          e.stopPropagation();
          actionToggleFocusMode();
          break;
        case "#":
        case "Delete":
          e.preventDefault();
          e.stopPropagation();
          actionTrash();
          break;
        case "/":
          e.preventDefault();
          e.stopPropagation();
          focusSearch();
          break;
        case "?":
          e.preventDefault();
          e.stopPropagation();
          openShortcutsModal();
          break;
        default:
          break;
      }
    },
    true
  );

  // Initialize floating pill & dynamic clutter sweeper once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureShadowUi();
      updateFloatingPill();
      startObserver();
    });
  } else {
    ensureShadowUi();
    updateFloatingPill();
    startObserver();
  }
})();
