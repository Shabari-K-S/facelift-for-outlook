(() => {
  "use strict";

  const extApi = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true,
    theme: "dark",
    hideAi: true,
    hideRail: true,
    hideRibbon: true,
    cleanFolders: true,
    compactList: true,
    cleanReading: true,
    focusMode: false,
    shortcutsEnabled: true,
  };

  const checkboxIds = [
    "enabled",
    "cleanReading",
    "compactList",
    "cleanFolders",
    "focusMode",
    "hideAi",
    "hideRail",
    "hideRibbon",
    "shortcutsEnabled",
  ];

  const themeButtons = Array.from(
    document.querySelectorAll(".segmented button[data-theme]")
  );

  function renderTheme(activeTheme) {
    themeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === activeTheme);
    });
  }

  async function init() {
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(await extApi.storage.local.get(DEFAULT_SETTINGS)),
    };

    checkboxIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = Boolean(settings[id]);
      el.addEventListener("change", () => {
        extApi.storage.local.set({ [id]: el.checked });
      });
    });

    renderTheme(settings.theme);

    themeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        renderTheme(theme);
        extApi.storage.local.set({ theme });
      });
    });
  }

  init();
})();
