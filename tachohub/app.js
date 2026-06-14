"use strict";

const APP_DNS = "Acron Tacho Hub";
const ACCOUNT_TOKEN_FIELD = "tachohub_token";
const LOGIN_TOKEN_STORAGE_KEY = "wwt";
const THEME_STORAGE_KEY = "ath_theme";
const SELECTED_DEVICE_STORAGE_KEY = "ath_selected_device_id";

const DEFAULT_API_URL = "https://hst-api.wialon.com";
const DEFAULT_HOST_URL = "https://hosting.wialon.com";
const DEFAULT_FRAME_LANG = "ro-RO";
const DEFAULT_FRAME_THEME = "dark";
const FRAME_BASE_URL = "https://tachobox.flespi.io";
const DEVICE_LIST_URL = "https://flespi.io/gw/devices/all?fields=id,name,configuration.ident,connected";

const RESOURCE_CUSTOM_FIELDS_FLAG = 8;
const LOGIN_RESPONSE_FLAGS = 1;
const LOGIN_ACCESS_TYPE = 256;
const LOGIN_ACTIVATION_TIME = 0;
const LOGIN_TOKEN_DURATION = 0;
const THEMES = new Set(["dark", "light"]);

const queryParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
let sdkLoadPromise = null;
let loginMessageHandler = null;

const appState = {
  apiBaseUrl: "",
  frameToken: "",
  lang: DEFAULT_FRAME_LANG,
  theme: DEFAULT_FRAME_THEME,
  devices: [],
  selectedDeviceId: "",
  searchText: "",
  frameReloadCounter: 0
};

class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

class UserFacingError extends Error {
  constructor(userMessageKey, technicalMessage) {
    super(technicalMessage || userMessageKey);
    this.name = "UserFacingError";
    this.userMessageKey = userMessageKey;
  }
}

const VISIBLE_ERROR_MESSAGES = Object.freeze({
  inactive: "Tacho Hub not active for this account.",
  invalidAccess: "Tacho Hub access expired or is invalid.",
  noVehicles: "No vehicles are available for this account on Tacho Hub.",
  technical: "Technical error."
});

function getVisibleErrorMessage(error) {
  if (error instanceof UserFacingError && VISIBLE_ERROR_MESSAGES[error.userMessageKey]) {
    return VISIBLE_ERROR_MESSAGES[error.userMessageKey];
  }

  return VISIBLE_ERROR_MESSAGES.technical;
}

function setStatus(message, isError = false) {
  if (!isError) {
    logDebug("Status", { message });
    return;
  }

  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("error", true);
  status.style.display = "flex";
}

function hideStatus() {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = "";
    status.classList.remove("error");
    status.style.display = "none";
  }
}

function fail(error) {
  hideLoginPanel();
  logDebug("Visible error", {
    visibleMessage: getVisibleErrorMessage(error),
    technicalMessage: error && error.message ? error.message : String(error || "")
  });
  setStatus(getVisibleErrorMessage(error), true);
}

function logDebug(label, details) {
  if (!window.console || typeof console.info !== "function") return;
  console.info(`[Acron Tacho Hub] ${label}`, details || "");
}

function getParam(name) {
  const value = queryParams.get(name) || hashParams.get(name) || "";
  if (!value || !value.trim()) return "";
  return value.trim();
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getApiBaseUrl() {
  const baseUrl = getParam("baseUrl");
  const hostUrl = getParam("hostUrl");

  if (baseUrl) return stripTrailingSlash(baseUrl);
  if (hostUrl) return stripTrailingSlash(hostUrl);

  return DEFAULT_API_URL;
}

function getLoginHostUrl() {
  const hostUrl = getParam("hostUrl");
  if (hostUrl) return stripTrailingSlash(hostUrl);

  const baseUrl = getParam("baseUrl");
  if (!baseUrl) return DEFAULT_HOST_URL;

  try {
    const url = new URL(baseUrl);

    if (url.hostname.startsWith("hst-api.")) {
      return stripTrailingSlash(`${url.protocol}//${url.hostname.replace(/^hst-api\./, "hosting.")}`);
    }

    if (url.hostname === "dev-api.wialon.com") {
      return "https://dev.wialon.com";
    }

    return stripTrailingSlash(`${url.protocol}//${url.hostname}`);
  } catch (_err) {
    return DEFAULT_HOST_URL;
  }
}

function getLaunchUser() {
  return getParam("user");
}

function getLaunchLanguage() {
  return getParam("lang") || "en";
}

function normalizeFrameLang(lang) {
  const value = (lang || "").toLowerCase();

  if (value === "ro" || value === "ro-ro") return "ro-RO";
  if (value === "en" || value === "en-us") return "en-US";
  return lang || DEFAULT_FRAME_LANG;
}

function isValidTheme(theme) {
  return THEMES.has(theme);
}

function readStoredValue(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) || "" : "";
  } catch (_err) {
    return "";
  }
}

function writeStoredValue(key, value) {
  try {
    if (window.localStorage) window.localStorage.setItem(key, value);
  } catch (_err) {
    // Storage can be unavailable in hardened browser modes. The session still works until refresh.
  }
}

function removeStoredValue(key) {
  try {
    if (window.localStorage) window.localStorage.removeItem(key);
  } catch (_err) {
    // Nothing else to do.
  }
}

function getStoredLoginToken() {
  return readStoredValue(LOGIN_TOKEN_STORAGE_KEY).trim();
}

function setStoredLoginToken(token) {
  writeStoredValue(LOGIN_TOKEN_STORAGE_KEY, token.trim());
}

function clearStoredLoginToken() {
  removeStoredValue(LOGIN_TOKEN_STORAGE_KEY);
}

function getStoredTheme() {
  const theme = readStoredValue(THEME_STORAGE_KEY).trim().toLowerCase();
  return isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME;
}

function setStoredTheme(theme) {
  if (isValidTheme(theme)) writeStoredValue(THEME_STORAGE_KEY, theme);
}

function getStoredSelectedDeviceId() {
  return readStoredValue(SELECTED_DEVICE_STORAGE_KEY).trim();
}

function setStoredSelectedDeviceId(deviceId) {
  const cleanDeviceId = String(deviceId || "").trim();
  if (cleanDeviceId) writeStoredValue(SELECTED_DEVICE_STORAGE_KEY, cleanDeviceId);
}

function clearStoredSelectedDeviceId() {
  removeStoredValue(SELECTED_DEVICE_STORAGE_KEY);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = src;
    script.async = true;
    script.charset = "UTF-8";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load required SDK script: ${src}`));

    document.head.appendChild(script);
  });
}

function loadPlatformSdk(baseUrl) {
  if (window.wialon && wialon.core && wialon.core.Session) {
    logDebug("SDK already loaded");
    return Promise.resolve();
  }

  if (!sdkLoadPromise) {
    logDebug("Loading SDK", { baseUrl });
    sdkLoadPromise = loadScript(`${baseUrl}/wsdk/script/wialon.js`);
  }

  return sdkLoadPromise;
}

function getPlatformErrorText(code) {
  if (
    window.wialon &&
    wialon.core &&
    wialon.core.Errors &&
    typeof wialon.core.Errors.getErrorText === "function"
  ) {
    return wialon.core.Errors.getErrorText(code);
  }

  return `Remote API error ${code}`;
}

function isSessionErrorCode(code) {
  return code === 1 || code === 1003;
}

function getSession() {
  if (!window.wialon || !wialon.core || !wialon.core.Session) {
    throw new Error("The required SDK did not load.");
  }

  return wialon.core.Session.getInstance();
}

function getRemote() {
  if (!window.wialon || !wialon.core || !wialon.core.Remote) {
    throw new Error("The Remote API wrapper is not available.");
  }

  return wialon.core.Remote.getInstance();
}

function initSession(baseUrl) {
  logDebug("Initializing API session", { baseUrl });
  getSession().initSession(baseUrl);
}

function loginWithToken(token) {
  return new Promise((resolve, reject) => {
    const cleanToken = (token || "").trim();

    if (!cleanToken) {
      reject(new AuthRequiredError("Login is required."));
      return;
    }

    logDebug("Trying token login", { hasToken: Boolean(cleanToken) });

    getSession().loginToken(cleanToken, "", (code) => {
      if (code) {
        logDebug("Token login failed", { code, error: getPlatformErrorText(code) });
        reject(new AuthRequiredError(`${getPlatformErrorText(code)} during token login.`));
        return;
      }

      logDebug("Token login succeeded");
      resolve();
    });
  });
}

async function authenticateWithStoredToken(baseUrl) {
  initSession(baseUrl);

  const token = getStoredLoginToken();
  if (!token) {
    throw new AuthRequiredError("No stored login token is available.");
  }

  try {
    await loginWithToken(token);
  } catch (err) {
    clearStoredLoginToken();
    throw err;
  }
}

function getLaunchSessionId() {
  return getParam("sid") || getParam("eid") || getParam("SID") || getParam("EID");
}

function cloneLaunchSession(sessionId, user) {
  return new Promise((resolve, reject) => {
    const cleanSessionId = (sessionId || "").trim();

    if (!cleanSessionId) {
      reject(new AuthRequiredError("No launch session is available."));
      return;
    }

    const session = getSession();
    if (typeof session.duplicate !== "function") {
      reject(new Error("The session cloning method is not available."));
      return;
    }

    logDebug("Trying launch session clone", {
      hasLaunchSession: Boolean(cleanSessionId),
      user: user || ""
    });

    session.duplicate(cleanSessionId, user || "", true, (code) => {
      if (code) {
        logDebug("Launch session clone failed", { code, error: getPlatformErrorText(code) });
        reject(new AuthRequiredError(`${getPlatformErrorText(code)} during launch session clone.`));
        return;
      }

      logDebug("Launch session clone succeeded");
      resolve();
    });
  });
}

async function authenticateWithLaunchSession(baseUrl) {
  initSession(baseUrl);

  const launchSessionId = getLaunchSessionId();
  if (!launchSessionId) {
    throw new AuthRequiredError("No launch session was provided.");
  }

  await cloneLaunchSession(launchSessionId, getLaunchUser());
}

async function authenticate(baseUrl) {
  if (getStoredLoginToken()) {
    try {
      await authenticateWithStoredToken(baseUrl);
      return;
    } catch (err) {
      if (!(err instanceof AuthRequiredError)) {
        throw err;
      }

      logDebug("Stored token was not usable; trying launch session", {
        error: err.message || String(err)
      });
    }
  }

  await authenticateWithLaunchSession(baseUrl);
}

function apiCall(svc, callParams) {
  return new Promise((resolve, reject) => {
    getRemote().remoteCall(svc, callParams, (code, result) => {
      if (code) {
        const message = `${getPlatformErrorText(code)} for ${svc}`;

        logDebug("Remote call failed", { svc, code, error: getPlatformErrorText(code) });

        if (isSessionErrorCode(code)) {
          reject(new AuthRequiredError(message));
          return;
        }

        reject(new Error(message));
        return;
      }

      logDebug("Remote call succeeded", { svc });
      resolve(result);
    });
  });
}

function getAccountIdFromSdk() {
  const session = getSession();
  const user = session.getCurrUser && session.getCurrUser();

  if (!user) return null;

  if (typeof user.getAccountId === "function") {
    return user.getAccountId();
  }

  if (typeof user.getData === "function") {
    const data = user.getData();
    if (data && data.bact) return data.bact;
  }

  if (user.bact) return user.bact;
  if (user._data && user._data.bact) return user._data.bact;

  return null;
}

async function getCurrentAccountId() {
  const sdkAccountId = getAccountIdFromSdk();
  if (sdkAccountId) {
    logDebug("Account ID read from SDK user object", { accountId: sdkAccountId });
    return sdkAccountId;
  }

  logDebug("Account ID not available on SDK user object; restoring session metadata");
  const sessionInfo = await apiCall("core/duplicate", { restore: 1 });
  const accountId = sessionInfo && sessionInfo.user && sessionInfo.user.bact;

  if (!accountId) {
    throw new Error("Can't determine the account ID of the current user.");
  }

  logDebug("Account ID read from session metadata", { accountId });
  return accountId;
}

async function getAccountCustomFields(accountId) {
  logDebug("Loading account custom fields", { accountId });

  const response = await apiCall("core/search_item", {
    id: accountId,
    flags: RESOURCE_CUSTOM_FIELDS_FLAG
  });

  const item = response && response.item;

  if (!item) {
    throw new Error("Could not load current account/resource.");
  }

  logDebug("Account custom fields loaded", {
    hasFields: Boolean(item.flds)
  });

  return item.flds || null;
}

function findCustomFieldValue(fieldsObject, fieldName) {
  if (!fieldsObject || typeof fieldsObject !== "object") return null;

  for (const key of Object.keys(fieldsObject)) {
    const field = fieldsObject[key];

    if (field && field.n === fieldName) {
      return field.v || null;
    }
  }

  return null;
}

async function loadFrameTokenFromAccount() {
  const accountId = await getCurrentAccountId();
  const customFields = await getAccountCustomFields(accountId);
  const token = findCustomFieldValue(customFields, ACCOUNT_TOKEN_FIELD);

  if (!token) {
    throw new UserFacingError(
      "inactive",
      `Could not find custom field '${ACCOUNT_TOKEN_FIELD}' on this account/resource.`
    );
  }

  logDebug("Frame token found in account custom fields");
  return token;
}

async function fetchDevices(token) {
  logDebug("Loading vehicle list");

  const response = await fetch(DEVICE_LIST_URL, {
    method: "GET",
    headers: {
      Authorization: `FlespiToken ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    throw new Error("Vehicle list response was not valid JSON.");
  }

  if (!response.ok) {
    const detail = extractApiError(payload) || response.statusText || `HTTP ${response.status}`;
    throw new UserFacingError("invalidAccess", `Could not load vehicles: ${detail}`);
  }

  if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new UserFacingError("invalidAccess", `Could not load vehicles: ${extractApiError(payload)}`);
  }

  const result = payload && Array.isArray(payload.result) ? payload.result : [];
  return normalizeDevices(result);
}

function extractApiError(payload) {
  if (!payload || typeof payload !== "object") return "";

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((err) => {
        if (!err) return "";
        if (typeof err === "string") return err;
        return err.reason || err.message || err.text || JSON.stringify(err);
      })
      .filter(Boolean)
      .join("; ");
  }

  return payload.reason || payload.message || payload.error || "";
}

function normalizeDevices(items) {
  const devices = [];

  for (const item of items) {
    if (!item || item.id === undefined || item.id === null) continue;

    const id = String(item.id);
    const configuration = item.configuration && typeof item.configuration === "object"
      ? item.configuration
      : {};
    const ident = configuration.ident || item["configuration.ident"] || "";
    const name = String(item.name || ident || `Device ${id}`);

    devices.push({
      id,
      name,
      ident: String(ident || ""),
      connected: Boolean(item.connected)
    });
  }

  devices.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  return devices;
}

function getVehicleSearchText(vehicle) {
  return `${vehicle.name} ${vehicle.ident} ${vehicle.id}`.toLowerCase();
}

function getFilteredDevices() {
  const searchText = appState.searchText.trim().toLowerCase();
  if (!searchText) return appState.devices;

  return appState.devices.filter((vehicle) => getVehicleSearchText(vehicle).includes(searchText));
}

function renderVehicleList() {
  const list = document.getElementById("vehicle-list");
  const count = document.getElementById("vehicle-count");
  if (!list || !count) return;

  const filtered = getFilteredDevices();
  list.textContent = "";

  if (!appState.devices.length) {
    count.textContent = "No vehicles found.";
    return;
  }

  count.textContent = appState.searchText.trim()
    ? `${filtered.length} of ${appState.devices.length} vehicles`
    : `${appState.devices.length} vehicles`;

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "vehicle-meta";
    empty.style.padding = "10px";
    empty.textContent = "No matching vehicles.";
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const vehicle of filtered) {
    const button = document.createElement("button");
    const isSelected = vehicle.id === appState.selectedDeviceId;

    button.type = "button";
    button.className = `vehicle-item${isSelected ? " selected" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", isSelected ? "true" : "false");
    button.dataset.deviceId = vehicle.id;

    const name = document.createElement("span");
    name.className = "vehicle-name";
    name.textContent = vehicle.name;

    const meta = document.createElement("span");
    meta.className = "vehicle-meta";
    meta.textContent = getVehicleMeta(vehicle);

    button.appendChild(name);
    button.appendChild(meta);
    button.addEventListener("click", () => selectVehicle(vehicle.id));

    fragment.appendChild(button);
  }

  list.appendChild(fragment);
}

function getVehicleMeta(vehicle) {
  const parts = [`ID ${vehicle.id}`];
  if (vehicle.ident) parts.push(vehicle.ident);
  parts.push(vehicle.connected ? "online" : "offline");
  return parts.join(" · ");
}

function selectVehicle(deviceId) {
  const selected = appState.devices.find((vehicle) => vehicle.id === String(deviceId));
  if (!selected) return;

  appState.selectedDeviceId = selected.id;
  setStoredSelectedDeviceId(selected.id);
  renderVehicleList();
  loadHubFrame(selected.id);
}

function chooseInitialDevice() {
  const storedDeviceId = getStoredSelectedDeviceId();
  if (storedDeviceId && appState.devices.some((vehicle) => vehicle.id === storedDeviceId)) {
    return storedDeviceId;
  }

  if (storedDeviceId) {
    clearStoredSelectedDeviceId();
  }

  const requestedDeviceId = getParam("deviceId");
  if (requestedDeviceId && appState.devices.some((vehicle) => vehicle.id === requestedDeviceId)) {
    return requestedDeviceId;
  }

  return appState.devices.length ? appState.devices[0].id : "";
}

function buildFrameUrl(deviceId, token, lang, theme, reloadNonce) {
  const query = new URLSearchParams();

  query.set("token", token);
  query.set("hidepanels", "1");
  query.set("whitelabel", "true");
  query.set("hidedisclaimer", "true");
  query.set("theme", isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME);
  query.set("lang", normalizeFrameLang(lang));
  if (reloadNonce) query.set("reload", reloadNonce);

  return `${FRAME_BASE_URL}/#/device/${encodeURIComponent(deviceId)}?${query.toString()}`;
}

function loadHubFrame(deviceId) {
  if (!deviceId) return;

  const iframe = document.getElementById("tachohub");
  if (!iframe) {
    throw new Error("Missing main iframe element.");
  }

  appState.frameReloadCounter += 1;
  const reloadNonce = `${Date.now()}-${appState.frameReloadCounter}`;

  iframe.src = buildFrameUrl(deviceId, appState.frameToken, appState.lang, appState.theme, reloadNonce);
  iframe.style.display = "block";
  hideStatus();
}

async function loadApplication() {
  setStatus("Loading account settings...");

  appState.lang = normalizeFrameLang(getLaunchLanguage() || DEFAULT_FRAME_LANG);
  document.documentElement.lang = appState.lang;
  appState.theme = getStoredTheme();
  applyTheme(appState.theme);

  appState.frameToken = await loadFrameTokenFromAccount();

  setStatus("Loading vehicles...");
  appState.devices = await fetchDevices(appState.frameToken);
  renderVehicleList();

  const initialDeviceId = chooseInitialDevice();
  if (!initialDeviceId) {
    throw new UserFacingError("noVehicles", "No vehicles are available for this account token.");
  }

  if (appState.devices.some((vehicle) => vehicle.id === initialDeviceId)) {
    appState.selectedDeviceId = initialDeviceId;
    setStoredSelectedDeviceId(initialDeviceId);
    renderVehicleList();
  }

  loadHubFrame(initialDeviceId);
  hideLoginPanel();
}

function buildLoginUrl() {
  const loginHost = getLoginHostUrl();
  const loginUrl = new URL(`${loginHost}/login.html`);

  loginUrl.searchParams.set("client_id", APP_DNS);
  loginUrl.searchParams.set("access_type", String(LOGIN_ACCESS_TYPE));
  loginUrl.searchParams.set("activation_time", String(LOGIN_ACTIVATION_TIME));
  loginUrl.searchParams.set("duration", String(LOGIN_TOKEN_DURATION));
  loginUrl.searchParams.set("flags", String(LOGIN_RESPONSE_FLAGS));
  loginUrl.searchParams.set("response_type", "token");
  loginUrl.searchParams.set("redirect_uri", `${loginHost}/post_token.html`);
  loginUrl.searchParams.set("lang", getLaunchLanguage());

  const user = getLaunchUser();
  if (user) loginUrl.searchParams.set("user", user);

  return loginUrl.toString();
}

function extractLoginTokenFromMessage(message) {
  if (!message) return "";

  if (typeof message === "object") {
    const directToken = message.access_token || message.token;
    return typeof directToken === "string" ? directToken.trim() : "";
  }

  if (typeof message !== "string") return "";

  const trimmed = message.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed);
    const directToken = payload.access_token || payload.token;
    if (typeof directToken === "string") return directToken.trim();
  } catch (_err) {
    // Not JSON; continue with URL-style parsing.
  }

  const tokenFromParams = parseTokenParams(trimmed);
  if (tokenFromParams) return tokenFromParams;

  try {
    const parsedUrl = new URL(trimmed);
    return parseTokenParams(parsedUrl.search.slice(1)) || parseTokenParams(parsedUrl.hash.slice(1));
  } catch (_err) {
    return "";
  }
}

function parseTokenParams(rawParams) {
  if (!rawParams) return "";

  const normalized = rawParams.includes("?") || rawParams.includes("#")
    ? rawParams.replace(/^.*[?#]/, "")
    : rawParams;
  const params = new URLSearchParams(normalized);
  const token = params.get("access_token") || params.get("token") || "";

  return token.trim();
}

function showLoginPanel(reason) {
  const loginPanel = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");
  const loginUrl = buildLoginUrl();
  const allowedOrigin = new URL(getLoginHostUrl()).origin;

  logDebug("Showing login panel", {
    reason,
    loginHost: getLoginHostUrl()
  });

  if (!loginPanel || !loginFrame) {
    fail(new Error(reason || "Login is required."));
    return;
  }

  hideStatus();
  document.body.classList.add("login-active");
  loginPanel.style.display = "block";
  loginFrame.src = loginUrl;

  if (loginMessageHandler) {
    window.removeEventListener("message", loginMessageHandler);
  }

  loginMessageHandler = async (event) => {
    if (event.origin !== allowedOrigin) return;

    const token = extractLoginTokenFromMessage(event.data);
    if (!token) return;

    logDebug("Received login token from login form");

    try {
      setStatus("Logging in...");
      hideLoginPanel();
      setStoredLoginToken(token);
      initSession(appState.apiBaseUrl || getApiBaseUrl());
      await loginWithToken(token);
      await loadApplication();
    } catch (err) {
      clearStoredLoginToken();
      if (err instanceof AuthRequiredError) {
        showLoginPanel(err.message || "Login failed.");
      } else {
        fail(err || new Error("Application loading error."));
      }
    }
  };

  window.addEventListener("message", loginMessageHandler);
}

function hideLoginPanel() {
  const loginPanel = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");

  document.body.classList.remove("login-active");
  if (loginPanel) loginPanel.style.display = "none";
  if (loginFrame) loginFrame.removeAttribute("src");
}

function applyTheme(theme) {
  const safeTheme = isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME;
  document.documentElement.dataset.theme = safeTheme;

  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;

  const nextTheme = safeTheme === "dark" ? "light" : "dark";
  themeToggle.textContent = nextTheme === "dark" ? "Dark" : "Light";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
}

function toggleTheme() {
  const nextTheme = appState.theme === "dark" ? "light" : "dark";
  appState.theme = nextTheme;
  setStoredTheme(nextTheme);
  applyTheme(nextTheme);

  if (appState.selectedDeviceId && appState.frameToken) {
    loadHubFrame(appState.selectedDeviceId);
  }
}

function setupUi() {
  const panelToggle = document.getElementById("panel-toggle");
  const shell = document.getElementById("app-shell");
  const searchInput = document.getElementById("vehicle-search");
  const themeToggle = document.getElementById("theme-toggle");
  const reloadButton = document.getElementById("app-reload");

  if (panelToggle && shell) {
    panelToggle.textContent = shell.classList.contains("nav-hidden") ? "Show vehicles" : "Hide vehicles";
    panelToggle.addEventListener("click", () => {
      const isHidden = shell.classList.toggle("nav-hidden");
      panelToggle.setAttribute("aria-expanded", isHidden ? "false" : "true");
      panelToggle.textContent = isHidden ? "Show vehicles" : "Hide vehicles";
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      appState.searchText = searchInput.value || "";
      renderVehicleList();
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  if (reloadButton) {
    reloadButton.addEventListener("click", () => window.location.reload());
  }
}

async function main() {
  setupUi();
  appState.apiBaseUrl = getApiBaseUrl();
  appState.theme = getStoredTheme();
  applyTheme(appState.theme);

  logDebug("Starting app", {
    baseUrl: appState.apiBaseUrl,
    hostUrl: getLoginHostUrl(),
    lang: getLaunchLanguage(),
    hasDeviceId: Boolean(getParam("deviceId"))
  });

  setStatus("Loading SDK...");
  await loadPlatformSdk(appState.apiBaseUrl);

  try {
    setStatus("Initializing session...");
    await authenticate(appState.apiBaseUrl);
    await loadApplication();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      showLoginPanel(err.message);
      return;
    }

    throw err;
  }
}

main().catch((err) => {
  console.error("Application loading error", err);
  fail(err || new Error("Application loading error."));
});
