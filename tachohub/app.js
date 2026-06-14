"use strict";

const APP_DNS = "gapp_tachohub";
const ACCOUNT_TOKEN_FIELD = "tachohub_token";
const LOGIN_TOKEN_STORAGE_KEY = "wwt";
const THEME_STORAGE_KEY = "ath_theme";

const DEFAULT_API_URL = "https://hst-api.wialon.com";
const DEFAULT_HOST_URL = "https://hosting.wialon.com";
const DEFAULT_FRAME_THEME = "dark";
const FRAME_BASE_URL = "https://tachobox.flespi.io";
const DEVICE_LIST_URL = "https://flespi.io/gw/devices/all?fields=id,name,configuration.ident,connected";

const RESOURCE_CUSTOM_FIELDS_FLAG = 8;
const LOGIN_RESPONSE_FLAGS = 1;
const LOGIN_ACCESS_TYPE = 256;
const LOGIN_ACTIVATION_TIME = 0;
const LOGIN_TOKEN_DURATION = 0;
const THEMES = new Set(["dark", "light"]);

const I18N = Object.freeze({
  en: Object.freeze({
    appName: "Acron Tacho Hub",
    vehicles: "Vehicles",
    showVehicles: "Show vehicles",
    hideVehicles: "Hide vehicles",
    searchVehicles: "Search vehicles",
    vehicleList: "Vehicles",
    switchToDark: "Dark",
    switchToLight: "Light",
    switchToDarkTheme: "Switch to dark theme",
    switchToLightTheme: "Switch to light theme",
    reload: "Reload",
    reloadApp: "Reload application",
    loading: "Loading Acron Tacho Hub...",
    loadingSdk: "Loading required components...",
    initializingSession: "Initializing session...",
    loadingAccountSettings: "Loading account settings...",
    loadingVehicles: "Loading vehicles...",
    loggingIn: "Logging in...",
    loginRequired: "Please log in to continue.",
    loginFailed: "Login failed.",
    appLoadFailed: "Application loading error.",
    sdkLoadFailed: "Failed to load a required component.",
    sdkUnavailable: "A required component is not available.",
    remoteUnavailable: "The API wrapper is not available.",
    tokenRequired: "Login is required.",
    tokenLoginFailed: "Could not start a session with the saved token.",
    remoteApiError: "Remote API error {code}",
    remoteCallFailed: "Request failed: {operation}.",
    accountIdMissing: "Can't determine the current account ID.",
    accountLoadFailed: "Could not load the current account/resource.",
    accountTokenMissing: "Could not find custom field '{field}' on this account/resource.",
    invalidVehicleJson: "Vehicle list response was not valid JSON.",
    vehiclesLoadFailed: "Could not load vehicles: {detail}",
    noVehicles: "No vehicles found.",
    noVehiclesForToken: "No vehicles are available for this account token.",
    vehiclesCount: "{count} vehicles",
    filteredVehiclesCount: "{shown} of {total} vehicles",
    noMatchingVehicles: "No matching vehicles.",
    deviceFallback: "Device {id}",
    online: "online",
    offline: "offline",
    missingFrame: "Missing main iframe element."
  }),
  ro: Object.freeze({
    appName: "Acron Tacho Hub",
    vehicles: "Vehicule",
    showVehicles: "Afișează vehiculele",
    hideVehicles: "Ascunde vehiculele",
    searchVehicles: "Caută vehicule",
    vehicleList: "Vehicule",
    switchToDark: "Întunecat",
    switchToLight: "Luminos",
    switchToDarkTheme: "Comută la tema întunecată",
    switchToLightTheme: "Comută la tema luminoasă",
    reload: "Reîncarcă",
    reloadApp: "Reîncarcă aplicația",
    loading: "Se încarcă Acron Tacho Hub...",
    loadingSdk: "Se încarcă componentele necesare...",
    initializingSession: "Se inițializează sesiunea...",
    loadingAccountSettings: "Se încarcă setările contului...",
    loadingVehicles: "Se încarcă vehiculele...",
    loggingIn: "Autentificare...",
    loginRequired: "Autentifică-te pentru a continua.",
    loginFailed: "Autentificarea a eșuat.",
    appLoadFailed: "Eroare la încărcarea aplicației.",
    sdkLoadFailed: "Nu s-a putut încărca o componentă necesară.",
    sdkUnavailable: "O componentă necesară nu este disponibilă.",
    remoteUnavailable: "Interfața API nu este disponibilă.",
    tokenRequired: "Autentificarea este necesară.",
    tokenLoginFailed: "Nu s-a putut porni o sesiune cu tokenul salvat.",
    remoteApiError: "Eroare API la distanță {code}",
    remoteCallFailed: "Cererea a eșuat: {operation}.",
    accountIdMissing: "Nu se poate determina ID-ul contului curent.",
    accountLoadFailed: "Nu s-a putut încărca resursa/contul curent.",
    accountTokenMissing: "Nu s-a găsit câmpul personalizat „{field}” pe această resursă/acest cont.",
    invalidVehicleJson: "Răspunsul listei de vehicule nu este JSON valid.",
    vehiclesLoadFailed: "Nu s-au putut încărca vehiculele: {detail}",
    noVehicles: "Nu s-au găsit vehicule.",
    noVehiclesForToken: "Nu există vehicule disponibile pentru tokenul acestui cont.",
    vehiclesCount: "{count} vehicule",
    filteredVehiclesCount: "{shown} din {total} vehicule",
    noMatchingVehicles: "Nu există vehicule potrivite.",
    deviceFallback: "Dispozitiv {id}",
    online: "online",
    offline: "offline",
    missingFrame: "Lipsește iframe-ul principal."
  })
});

const FRAME_LANGUAGE_BY_UI_LANGUAGE = Object.freeze({
  en: "en-US",
  ro: "ro-RO"
});

const queryParams = new URLSearchParams(window.location.search);
let sdkLoadPromise = null;
let loginMessageHandler = null;

const appState = {
  apiBaseUrl: "",
  frameToken: "",
  uiLang: "en",
  frameLang: "en-US",
  theme: DEFAULT_FRAME_THEME,
  devices: [],
  selectedDeviceId: "",
  currentFrameDeviceId: "",
  searchText: ""
};

class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function t(key, values = {}) {
  const dictionary = I18N[appState.uiLang] || I18N.en;
  const fallback = I18N.en[key] || key;
  const template = dictionary[key] || fallback;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) => {
    const value = values[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

function setTopbarMessage(message, isError = false) {
  const messageNode = document.getElementById("topbar-message");
  if (!messageNode) return;

  messageNode.textContent = message || "";
  messageNode.classList.toggle("error", Boolean(isError));
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
    status.style.display = isError && message ? "block" : "none";
  }

  setTopbarMessage(message, isError);
}

function hideStatus() {
  const status = document.getElementById("status");
  if (status) status.style.display = "none";
}

function clearTopbarMessage() {
  setTopbarMessage("");
}

function fail(message) {
  hideLoginView();
  setStatus(message, true);
}

function logDebug(label, details) {
  if (!window.console || typeof console.info !== "function") return;
  console.info(`[Acron Tacho Hub] ${label}`, details || "");
}

function getParam(name) {
  const value = queryParams.get(name);
  if (!value || !value.trim()) return "";
  return value.trim();
}

function getFirstParam(names) {
  for (const name of names) {
    const value = getParam(name);
    if (value) return value;
  }

  return "";
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getRawLanguage() {
  return getParam("lang") || getParam("language") || "en";
}

function getUiLanguage() {
  const base = getRawLanguage().split(/[-_]/)[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(I18N, base) ? base : "en";
}

function getFrameLanguage() {
  return FRAME_LANGUAGE_BY_UI_LANGUAGE[appState.uiLang] || FRAME_LANGUAGE_BY_UI_LANGUAGE.en;
}

function getLoginLanguage() {
  return appState.uiLang || "en";
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

function getLaunchSessionId() {
  return getFirstParam(["sid", "eid"]);
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

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = src;
    script.async = true;
    script.charset = "UTF-8";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t("sdkLoadFailed")));

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

  return t("remoteApiError", { code });
}

function isSessionErrorCode(code) {
  return code === 1 || code === 1003;
}

function getSession() {
  if (!window.wialon || !wialon.core || !wialon.core.Session) {
    throw new Error(t("sdkUnavailable"));
  }

  return wialon.core.Session.getInstance();
}

function getRemote() {
  if (!window.wialon || !wialon.core || !wialon.core.Remote) {
    throw new Error(t("remoteUnavailable"));
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
      reject(new AuthRequiredError(t("tokenRequired")));
      return;
    }

    logDebug("Trying token login", { hasToken: Boolean(cleanToken) });

    getSession().loginToken(cleanToken, "", (code) => {
      if (code) {
        const detail = getPlatformErrorText(code);
        logDebug("Token login failed", { code, error: detail });
        reject(new AuthRequiredError(`${t("tokenLoginFailed")} ${detail}`.trim()));
        return;
      }

      logDebug("Token login succeeded");
      resolve();
    });
  });
}

function loginWithLaunchSession(sessionId, user) {
  return new Promise((resolve, reject) => {
    const cleanSessionId = (sessionId || "").trim();
    const session = getSession();

    if (!cleanSessionId || typeof session.duplicate !== "function") {
      reject(new AuthRequiredError(t("loginRequired")));
      return;
    }

    logDebug("Trying launch session", {
      hasSessionId: Boolean(cleanSessionId),
      hasUser: Boolean(user)
    });

    session.duplicate(cleanSessionId, user || "", true, (code) => {
      if (code) {
        const detail = getPlatformErrorText(code);
        logDebug("Launch session failed", { code, error: detail });
        reject(new AuthRequiredError(`${t("loginRequired")} ${detail}`.trim()));
        return;
      }

      logDebug("Launch session succeeded");
      resolve();
    });
  });
}

async function authenticate(baseUrl) {
  initSession(baseUrl);

  const token = getStoredLoginToken();
  if (token) {
    try {
      await loginWithToken(token);
      return;
    } catch (err) {
      clearStoredLoginToken();
      logDebug("Stored token could not be used", { error: err && err.message ? err.message : String(err) });
    }
  }

  const launchSessionId = getLaunchSessionId();
  if (launchSessionId) {
    initSession(baseUrl);
    await loginWithLaunchSession(launchSessionId, getLaunchUser());
    return;
  }

  throw new AuthRequiredError(t("loginRequired"));
}

function apiCall(svc, callParams) {
  return new Promise((resolve, reject) => {
    getRemote().remoteCall(svc, callParams, (code, result) => {
      if (code) {
        const detail = getPlatformErrorText(code);
        const message = `${t("remoteCallFailed", { operation: svc })} ${detail}`.trim();

        logDebug("Remote call failed", { svc, code, error: detail });

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
    throw new Error(t("accountIdMissing"));
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
    throw new Error(t("accountLoadFailed"));
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
    throw new Error(t("accountTokenMissing", { field: ACCOUNT_TOKEN_FIELD }));
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
    throw new Error(t("invalidVehicleJson"));
  }

  if (!response.ok) {
    const detail = extractApiError(payload) || response.statusText || `HTTP ${response.status}`;
    throw new Error(t("vehiclesLoadFailed", { detail }));
  }

  if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(t("vehiclesLoadFailed", { detail: extractApiError(payload) }));
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
    const name = String(item.name || ident || t("deviceFallback", { id }));

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
    count.textContent = t("noVehicles");
    return;
  }

  count.textContent = appState.searchText.trim()
    ? t("filteredVehiclesCount", { shown: filtered.length, total: appState.devices.length })
    : t("vehiclesCount", { count: appState.devices.length });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "vehicle-meta";
    empty.style.padding = "10px";
    empty.textContent = t("noMatchingVehicles");
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
  parts.push(vehicle.connected ? t("online") : t("offline"));
  return parts.join(" · ");
}

function selectVehicle(deviceId) {
  const selected = appState.devices.find((vehicle) => vehicle.id === String(deviceId));
  if (!selected) return;

  appState.selectedDeviceId = selected.id;
  renderVehicleList();
  loadHubFrame(selected.id);
}

function chooseInitialDevice() {
  const requestedDeviceId = getParam("deviceId");

  if (requestedDeviceId && appState.devices.some((vehicle) => vehicle.id === requestedDeviceId)) {
    return requestedDeviceId;
  }

  if (requestedDeviceId && appState.devices.length === 0) {
    return requestedDeviceId;
  }

  return appState.devices.length ? appState.devices[0].id : "";
}

function buildFrameUrl(deviceId, token, lang, theme) {
  const query = new URLSearchParams();

  query.set("token", token);
  query.set("hidepanels", "1");
  query.set("whitelabel", "true");
  query.set("hidedisclaimer", "true");
  query.set("theme", isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME);
  query.set("lang", lang);

  return `${FRAME_BASE_URL}/#/device/${encodeURIComponent(deviceId)}?${query.toString()}`;
}

function loadHubFrame(deviceId) {
  if (!deviceId) return;

  const iframe = document.getElementById("tachohub");
  if (!iframe) {
    throw new Error(t("missingFrame"));
  }

  appState.currentFrameDeviceId = String(deviceId);
  iframe.src = buildFrameUrl(deviceId, appState.frameToken, appState.frameLang, appState.theme);
  iframe.style.display = "block";
  hideStatus();
  clearTopbarMessage();
}

async function loadApplication() {
  setStatus(t("loadingAccountSettings"));

  appState.frameToken = await loadFrameTokenFromAccount();

  setStatus(t("loadingVehicles"));
  appState.devices = await fetchDevices(appState.frameToken);
  renderVehicleList();

  const initialDeviceId = chooseInitialDevice();
  if (!initialDeviceId) {
    throw new Error(t("noVehiclesForToken"));
  }

  if (appState.devices.some((vehicle) => vehicle.id === initialDeviceId)) {
    appState.selectedDeviceId = initialDeviceId;
    renderVehicleList();
  }

  loadHubFrame(initialDeviceId);
  hideLoginView();
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
  loginUrl.searchParams.set("lang", getLoginLanguage());

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
    return parseTokenParams(parsedUrl.search.slice(1));
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

function showLoginView(reason) {
  const loginView = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");
  const loginUrl = buildLoginUrl();
  const allowedOrigin = new URL(getLoginHostUrl()).origin;
  const message = reason || t("loginRequired");

  logDebug("Showing login view", {
    reason: message,
    loginHost: getLoginHostUrl()
  });

  if (!loginView || !loginFrame) {
    fail(message);
    return;
  }

  hideStatus();
  document.body.classList.add("login-active");
  setTopbarMessage(message, Boolean(reason && reason !== t("loginRequired")));
  loginView.style.display = "block";
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
      setStatus(t("loggingIn"));
      hideLoginView();
      setStoredLoginToken(token);
      initSession(appState.apiBaseUrl || getApiBaseUrl());
      await loginWithToken(token);
      await loadApplication();
    } catch (err) {
      clearStoredLoginToken();
      showLoginView(err && err.message ? err.message : t("loginFailed"));
    }
  };

  window.addEventListener("message", loginMessageHandler);
}

function hideLoginView() {
  const loginView = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");

  document.body.classList.remove("login-active");
  if (loginView) loginView.style.display = "none";
  if (loginFrame) loginFrame.removeAttribute("src");
}

function applyTheme(theme) {
  const safeTheme = isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME;
  document.documentElement.dataset.theme = safeTheme;

  const themeToggle = document.getElementById("theme-toggle");
  if (!themeToggle) return;

  const nextTheme = safeTheme === "dark" ? "light" : "dark";
  themeToggle.textContent = nextTheme === "dark" ? t("switchToDark") : t("switchToLight");
  themeToggle.setAttribute(
    "aria-label",
    nextTheme === "dark" ? t("switchToDarkTheme") : t("switchToLightTheme")
  );
}

function toggleTheme() {
  const nextTheme = appState.theme === "dark" ? "light" : "dark";
  appState.theme = nextTheme;
  setStoredTheme(nextTheme);
  applyTheme(nextTheme);

  const activeDeviceId = appState.currentFrameDeviceId || appState.selectedDeviceId;
  if (activeDeviceId && appState.frameToken) {
    loadHubFrame(activeDeviceId);
  }
}

function applyLocalizedText() {
  document.documentElement.lang = appState.uiLang;
  document.title = t("appName");

  const appTitle = document.getElementById("app-title");
  if (appTitle) appTitle.textContent = t("appName");

  const panelToggle = document.getElementById("panel-toggle");
  const shell = document.getElementById("app-shell");
  if (panelToggle) {
    const isHidden = shell && shell.classList.contains("nav-hidden");
    panelToggle.textContent = isHidden ? t("showVehicles") : t("hideVehicles");
    panelToggle.setAttribute("aria-label", isHidden ? t("showVehicles") : t("hideVehicles"));
  }

  const searchInput = document.getElementById("vehicle-search");
  if (searchInput) searchInput.setAttribute("placeholder", t("searchVehicles"));

  const vehiclePanel = document.getElementById("vehicle-panel");
  if (vehiclePanel) vehiclePanel.setAttribute("aria-label", t("vehicleList"));

  const vehicleList = document.getElementById("vehicle-list");
  if (vehicleList) vehicleList.setAttribute("aria-label", t("vehicleList"));

  const reloadButton = document.getElementById("app-reload");
  if (reloadButton) {
    reloadButton.textContent = t("reload");
    reloadButton.setAttribute("aria-label", t("reloadApp"));
  }

  const iframe = document.getElementById("tachohub");
  if (iframe) iframe.setAttribute("title", t("appName"));

  const loginFrame = document.getElementById("login-frame");
  if (loginFrame) loginFrame.setAttribute("title", t("loginRequired"));

  applyTheme(appState.theme);
  renderVehicleList();
}

function setupUi() {
  const panelToggle = document.getElementById("panel-toggle");
  const shell = document.getElementById("app-shell");
  const searchInput = document.getElementById("vehicle-search");
  const themeToggle = document.getElementById("theme-toggle");
  const reloadButton = document.getElementById("app-reload");

  if (panelToggle && shell) {
    panelToggle.addEventListener("click", () => {
      const isHidden = shell.classList.toggle("nav-hidden");
      panelToggle.setAttribute("aria-expanded", isHidden ? "false" : "true");
      panelToggle.textContent = isHidden ? t("showVehicles") : t("hideVehicles");
      panelToggle.setAttribute("aria-label", isHidden ? t("showVehicles") : t("hideVehicles"));
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
  appState.uiLang = getUiLanguage();
  appState.frameLang = getFrameLanguage();
  appState.theme = getStoredTheme();
  appState.apiBaseUrl = getApiBaseUrl();

  setupUi();
  applyLocalizedText();
  applyTheme(appState.theme);

  logDebug("Starting app", {
    baseUrl: appState.apiBaseUrl,
    hostUrl: getLoginHostUrl(),
    lang: getRawLanguage(),
    effectiveLanguage: appState.uiLang,
    hasDeviceId: Boolean(getParam("deviceId"))
  });

  setStatus(t("loadingSdk"));
  await loadPlatformSdk(appState.apiBaseUrl);

  try {
    setStatus(t("initializingSession"));
    await authenticate(appState.apiBaseUrl);
    await loadApplication();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      showLoginView(err.message);
      return;
    }

    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  fail(err && err.message ? err.message : t("appLoadFailed"));
});
