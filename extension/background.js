// =============================================================
// TV Dashboard Rotator — Background Service Worker
// =============================================================
// Rotates a single browser tab between multiple URLs.
// Config is fetched from a remote JSON file (GitHub Gist).
// =============================================================

const CONFIG_URL =
  "https://gist.githubusercontent.com/Lendrit20/1507ca49040c910d087297a00e922ff2/raw/config.json";
const CONFIG_POLL_SECONDS = 60;

let config = null;
let configHash = "";
let rotationIndex = 0;
let displayTabId = null;
let coffeeActive = false;
let coffeeTimeout = null;
let currentUrl = null;

// --- Logging (viewable in extension service-worker console) ---
function log(msg) {
  console.log("[TV-Dashboard]", new Date().toLocaleTimeString(), msg);
}

// --- Default config (fallback if fetch fails) ---
function getDefaultConfig() {
  return {
    defaultUrls: [
      "https://confluence.baloisenet.com/x/aYuE1Q#zoomOnLoad=true&auto-reload=97",
      "https://confluence.baloisenet.com/spaces/AC/pages/3665113558/Depot+Extractor+Metrics+Dashboard+Prod#zoomOnLoad=true&auto-reload=97"
    ],
    rotationIntervalSeconds: 300,
    schedule: [
      {
        url: "https://sv-gastronomie.ch/menu/Baloise,%20Basel/Mittagsmen%C3%BC%20Nord",
        startTime: "11:15",
        endTime: "11:45"
      }
    ],
    coffeeBreakMinutes: 15,
    forceUrl: null
  };
}

// --- Config fetching ---
async function fetchConfig() {
  try {
    const resp = await fetch(CONFIG_URL + "?_=" + Date.now(), {
      cache: "no-store"
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();

    const newHash = JSON.stringify(data);
    if (newHash !== configHash) {
      configHash = newHash;
      config = data;
      log("Config updated: " + config.defaultUrls.length + " URL(s)");
      scheduleRotation();
    }
  } catch (e) {
    log("Config fetch failed: " + e.message);
    if (!config) {
      config = getDefaultConfig();
      log("Using default config");
      scheduleRotation();
    }
  }
}

// --- Schedule logic ---
function getActiveScheduledUrl() {
  if (!config || !config.schedule) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (const entry of config.schedule) {
    const [sh, sm] = entry.startTime.split(":").map(Number);
    const [eh, em] = entry.endTime.split(":").map(Number);
    if (nowMins >= sh * 60 + sm && nowMins < eh * 60 + em) return entry.url;
  }
  return null;
}

function getDefaultUrl() {
  const urls =
    config.defaultUrls || (config.defaultUrl ? [config.defaultUrl] : []);
  if (urls.length === 0) return null;
  return urls[rotationIndex % urls.length];
}

function getTargetUrl() {
  if (!config) return null;
  return config.forceUrl || getActiveScheduledUrl() || getDefaultUrl();
}

// --- Tab management ---
async function ensureDisplayTab() {
  // Check if our tab still exists
  if (displayTabId !== null) {
    try {
      await chrome.tabs.get(displayTabId);
      return; // Tab exists
    } catch {
      displayTabId = null; // Tab was closed
    }
  }

  // Find an existing non-extension tab, or create one
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidate = tabs.find(
    (t) => !t.url.startsWith("chrome") && !t.url.startsWith("edge")
  );

  if (candidate) {
    displayTabId = candidate.id;
    log("Reusing existing tab: " + displayTabId);
  } else {
    const tab = await chrome.tabs.create({ url: "about:blank", active: true });
    displayTabId = tab.id;
    log("Created new tab: " + displayTabId);
  }
}

async function navigateTo(url) {
  if (!url) return;

  await ensureDisplayTab();

  // Only navigate if URL actually changed
  if (url === currentUrl) return;
  currentUrl = url;

  try {
    await chrome.tabs.update(displayTabId, { url, active: !coffeeActive });
    log("Navigated to: " + url);
  } catch (e) {
    log("Navigation failed: " + e.message);
    displayTabId = null; // Reset so we create/find a tab next time
  }
}

// --- Rotation via chrome.alarms ---
function scheduleRotation() {
  const urls =
    config.defaultUrls || (config.defaultUrl ? [config.defaultUrl] : []);
  const intervalSec = config.rotationIntervalSeconds || 300;

  // Clear existing alarm
  chrome.alarms.clear("rotate");

  if (urls.length > 1) {
    chrome.alarms.create("rotate", {
      periodInMinutes: intervalSec / 60
    });
    log(
      "Rotation scheduled: every " +
        intervalSec +
        "s across " +
        urls.length +
        " URLs"
    );
  }

  // Navigate immediately
  navigateTo(getTargetUrl());
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rotate") {
    if (coffeeActive) return;
    if (config.forceUrl || getActiveScheduledUrl()) {
      // Don't rotate when an override is active
      navigateTo(getTargetUrl());
      return;
    }
    const urls =
      config.defaultUrls || (config.defaultUrl ? [config.defaultUrl] : []);
    rotationIndex = (rotationIndex + 1) % urls.length;
    currentUrl = null; // Force navigation even if same domain
    navigateTo(urls[rotationIndex]);
  }

  if (alarm.name === "config-poll") {
    fetchConfig();
    // Also re-check schedule overrides
    navigateTo(getTargetUrl());
  }
});

// --- Coffee break ---
function startCoffee() {
  if (coffeeActive) return;
  coffeeActive = true;
  log("Coffee break started");

  if (config && config.coffeeBreakMinutes) {
    coffeeTimeout = setTimeout(() => {
      endCoffee();
    }, config.coffeeBreakMinutes * 60 * 1000);
  }
}

function endCoffee() {
  if (!coffeeActive) return;
  coffeeActive = false;
  if (coffeeTimeout) {
    clearTimeout(coffeeTimeout);
    coffeeTimeout = null;
  }
  log("Coffee break ended");

  // Bring display tab back
  if (displayTabId) {
    chrome.tabs.update(displayTabId, { active: true }).catch(() => {});
  }
}

// --- Message handling (from popup) ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "getStatus") {
    const urls =
      config?.defaultUrls || (config?.defaultUrl ? [config.defaultUrl] : []);
    sendResponse({
      coffeeActive,
      currentUrl,
      rotationIndex,
      totalUrls: urls.length,
      configLoaded: !!config,
      intervalSeconds: config?.rotationIntervalSeconds || 300
    });
    return true;
  }

  if (msg.type === "toggleCoffee") {
    coffeeActive ? endCoffee() : startCoffee();
    sendResponse({ coffeeActive });
    return true;
  }

  if (msg.type === "nextPage") {
    const urls =
      config?.defaultUrls || (config?.defaultUrl ? [config.defaultUrl] : []);
    if (urls.length > 1) {
      rotationIndex = (rotationIndex + 1) % urls.length;
      currentUrl = null;
      navigateTo(urls[rotationIndex]);
    }
    sendResponse({ rotationIndex });
    return true;
  }

  if (msg.type === "prevPage") {
    const urls =
      config?.defaultUrls || (config?.defaultUrl ? [config.defaultUrl] : []);
    if (urls.length > 1) {
      rotationIndex = (rotationIndex - 1 + urls.length) % urls.length;
      currentUrl = null;
      navigateTo(urls[rotationIndex]);
    }
    sendResponse({ rotationIndex });
    return true;
  }

  if (msg.type === "refreshConfig") {
    fetchConfig().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// --- Handle tab closure: if display tab is closed, clear our reference ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === displayTabId) {
    displayTabId = null;
    currentUrl = null;
    log("Display tab was closed");
    // Re-create on next rotation tick
  }
});

// --- Startup ---
chrome.alarms.create("config-poll", {
  periodInMinutes: CONFIG_POLL_SECONDS / 60
});

fetchConfig();
log("TV Dashboard extension started");
