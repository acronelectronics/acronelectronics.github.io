"use strict";

const APP_DNS = "gapp_tachohub";
const ACCOUNT_TOKEN_FIELD = "tachohub_token";
const LOGIN_TOKEN_STORAGE_KEY = "wwt";
const THEME_STORAGE_KEY = "ath_theme";
const SELECTED_DEVICE_STORAGE_KEY = "ath_selected_device_id";

const DEFAULT_API_URL = "https://hst-api.wialon.com";
const DEFAULT_HOST_URL = "https://hosting.wialon.com";
const DEFAULT_FRAME_LANG = "en-US";
const DEFAULT_FRAME_THEME = "dark";
const FRAME_BASE_URL = "https://tachobox.flespi.io";
const DEVICE_LIST_URL = "https://flespi.io/gw/devices/all?fields=id,name,configuration.ident,connected";

const RESOURCE_CUSTOM_FIELDS_FLAG = 8;
const LOGIN_RESPONSE_FLAGS = 1;
const LOGIN_ACCESS_TYPE = 256;
const LOGIN_ACTIVATION_TIME = 0;
const LOGIN_TOKEN_DURATION = 0;
const THEMES = new Set(["dark", "light"]);
const SUPPORTED_UI_LANGS = new Set(["en", "ro"]);

const queryParams = new URLSearchParams(window.location.search);
let sdkLoadPromise = null;
let loginMessageHandler = null;

const appState = {
  apiBaseUrl: "",
  frameToken: "",
  uiLang: "en",
  frameLang: DEFAULT_FRAME_LANG,
  theme: DEFAULT_FRAME_THEME,
  devices: [],
  selectedDeviceId: "",
  currentFrameDeviceId: "",
  searchText: "",
  isLoginVisible: false,
  frameLoadGeneration: 0,
  frameReloadNonce: 0
};

const TEXT = {
  en: {
    appTitle: "Acron Tacho Hub",
    loadingSdk: "Loading SDK...",
    initializingSession: "Initializing session...",
    loadingAccountSettings: "Loading account settings...",
    loadingVehicles: "Loading vehicles...",
    loadingFrame: "Loading vehicle data...",
    loggingIn: "Logging in...",
    loginRequired: "Please log in to continue.",
    loginFailed: "Login failed.",
    appLoadError: "Application loading error.",
    sdkLoadFailed: "Failed to load required SDK script: {src}",
    remoteApiError: "Remote API error {code}",
    missingSdk: "The required SDK did not load.",
    missingRemoteWrapper: "The Remote API wrapper is not available.",
    loginRequiredGeneric: "Login is required.",
    tokenLoginFailed: "Token login failed.",
    sessionLoginFailed: "Session login failed.",
    accountIdError: "Can't determine the account ID of the current user.",
    accountLoadError: "Could not load current account/resource.",
    accountTokenMissing: "Tacho Hub not active for this account.",
    vehicleListJsonError: "Vehicle list response was not valid JSON.",
    vehicleListLoadError: "Tacho Hub access expired or is invalid.",
    noVehiclesForToken: "No vehicles are available for this account token.",
    missingMainFrame: "Missing main iframe element.",
    hideVehicles: "Hide vehicles",
    showVehicles: "Show vehicles",
    searchVehicles: "Search vehicles...",
    reloadApp: "Reload app",
    switchToDark: "Dark",
    switchToLight: "Light",
    switchThemeToDark: "Switch to dark theme",
    switchThemeToLight: "Switch to light theme",
    noVehiclesFound: "No vehicles found.",
    noMatchingVehicles: "No matching vehicles.",
    vehicleCount: "{count} vehicles",
    vehicleCountFiltered: "{shown} of {total} vehicles",
    deviceLabel: "ID {id}",
    online: "online",
    offline: "offline",
    defaultDeviceName: "Device {id}",
    mainFrameTitle: "Acron Tacho Hub content",
    loginFrameTitle: "Login"
  },
  ro: {
    appTitle: "Acron Tacho Hub",
    loadingSdk: "Se încarcă SDK-ul...",
    initializingSession: "Se inițializează sesiunea...",
    loadingAccountSettings: "Se încarcă setările contului...",
    loadingVehicles: "Se încarcă vehiculele...",
    loadingFrame: "Se încarcă datele vehiculului...",
    loggingIn: "Se face autentificarea...",
    loginRequired: "Autentifică-te pentru a continua.",
    loginFailed: "Autentificarea a eșuat.",
    appLoadError: "Eroare la încărcarea aplicației.",
    sdkLoadFailed: "Nu s-a putut încărca scriptul SDK necesar: {src}",
    remoteApiError: "Eroare Remote API {code}",
    missingSdk: "SDK-ul necesar nu s-a încărcat.",
    missingRemoteWrapper: "Interfața Remote API nu este disponibilă.",
    loginRequiredGeneric: "Autentificarea este necesară.",
    tokenLoginFailed: "Autentificarea cu token a eșuat.",
    sessionLoginFailed: "Autentificarea cu sesiunea existentă a eșuat.",
    accountIdError: "Nu se poate determina ID-ul contului utilizatorului curent.",
    accountLoadError: "Nu s-a putut încărca resursa/contul curent.",
    accountTokenMissing: "Tacho Hub nu este activ pentru acest cont.",
    vehicleListJsonError: "Răspunsul listei de vehicule nu este JSON valid.",
    vehicleListLoadError: "Accesul Tacho Hub a expirat sau nu este valid.",
    noVehiclesForToken: "Nu există vehicule disponibile pentru tokenul acestui cont.",
    missingMainFrame: "Elementul iframe principal lipsește.",
    hideVehicles: "Ascunde vehiculele",
    showVehicles: "Afișează vehiculele",
    searchVehicles: "Caută vehicule...",
    reloadApp: "Reîncarcă aplicația",
    switchToDark: "Întunecat",
    switchToLight: "Luminos",
    switchThemeToDark: "Schimbă la tema întunecată",
    switchThemeToLight: "Schimbă la tema luminoasă",
    noVehiclesFound: "Nu s-au găsit vehicule.",
    noMatchingVehicles: "Nu există vehicule care corespund căutării.",
    vehicleCount: "{count} vehicule",
    vehicleCountFiltered: "{shown} din {total} vehicule",
    deviceLabel: "ID {id}",
    online: "online",
    offline: "offline",
    defaultDeviceName: "Dispozitiv {id}",
    mainFrameTitle: "Conținut Acron Tacho Hub",
    loginFrameTitle: "Autentificare"
  }
};

class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function t(key, values = {}) {
  const dictionary = TEXT[appState.uiLang] || TEXT.en;
  const template = dictionary[key] || TEXT.en[key] || key;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : ""
  ));
}

function setStatus(message, isError = false, showContent = false) {
  const topbarMessage = document.getElementById("topbar-message");
  const status = document.getElementById("status");
  const text = String(message || "");

  if (topbarMessage) {
    topbarMessage.textContent = text;
    topbarMessage.classList.toggle("error", Boolean(isError));
  }

  if (!status) return;

  status.textContent = text;
  status.classList.toggle("error", Boolean(isError));
  status.style.display = text && (showContent || isError) ? "flex" : "none";
}

function hideStatus() {
  const topbarMessage = document.getElementById("topbar-message");
  const status = document.getElementById("status");

  if (topbarMessage) {
    topbarMessage.textContent = "";
    topbarMessage.classList.remove("error");
  }

  if (status) {
    status.textContent = "";
    status.classList.remove("error");
    status.style.display = "none";
  }
}

function fail(message) {
  hideLoginPanel();
  setStatus(message, true, true);
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

function getLaunchSid() {
  return getParam("sid") || getParam("eid");
}

function getLaunchLanguage() {
  return getParam("lang") || "en";
}

function normalizeUiLang(lang) {
  const language = String(lang || "").trim().toLowerCase().split("-")[0];
  return SUPPORTED_UI_LANGS.has(language) ? language : "en";
}

function normalizeFrameLang(lang) {
  const value = String(lang || "").trim().toLowerCase();

  if (value === "ro" || value === "ro-ro") return "ro-RO";
  if (value === "en" || value === "en-us" || value === "en-gb") return "en-US";

  return DEFAULT_FRAME_LANG;
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
    // Storage can be unavailable in hardened browser modes. The current browser session can still continue.
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
  writeStoredValue(LOGIN_TOKEN_STORAGE_KEY, String(token || "").trim());
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

function getStoredDeviceId() {
  return readStoredValue(SELECTED_DEVICE_STORAGE_KEY).trim();
}

function setStoredDeviceId(deviceId) {
  const value = String(deviceId || "").trim();

  if (value) {
    writeStoredValue(SELECTED_DEVICE_STORAGE_KEY, value);
    return;
  }

  clearStoredDeviceId();
}

function clearStoredDeviceId() {
  removeStoredValue(SELECTED_DEVICE_STORAGE_KEY);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = src;
    script.async = true;
    script.charset = "UTF-8";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t("sdkLoadFailed", { src })));

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
    throw new Error(t("missingSdk"));
  }

  return wialon.core.Session.getInstance();
}

function getRemote() {
  if (!window.wialon || !wialon.core || !wialon.core.Remote) {
    throw new Error(t("missingRemoteWrapper"));
  }

  return wialon.core.Remote.getInstance();
}

function initSession(baseUrl) {
  logDebug("Initializing API session", { baseUrl });
  getSession().initSession(baseUrl);
}

function loginWithToken(token) {
  return new Promise((resolve, reject) => {
    const cleanToken = String(token || "").trim();

    if (!cleanToken) {
      reject(new AuthRequiredError(t("loginRequiredGeneric")));
      return;
    }

    logDebug("Trying token login", { hasToken: Boolean(cleanToken) });

    getSession().loginToken(cleanToken, "", (code) => {
      if (code) {
        logDebug("Token login failed", { code, error: getPlatformErrorText(code) });
        reject(new AuthRequiredError(`${t("tokenLoginFailed")}: ${getPlatformErrorText(code)}`));
        return;
      }

      logDebug("Token login succeeded");
      resolve();
    });
  });
}

function loginWithLaunchSession(sid) {
  return new Promise((resolve, reject) => {
    const cleanSid = String(sid || "").trim();
    const session = getSession();

    if (!cleanSid || typeof session.duplicate !== "function") {
      reject(new AuthRequiredError(t("loginRequired")));
      return;
    }

    logDebug("Trying launch session duplicate", { hasSid: Boolean(cleanSid), hasUser: Boolean(getLaunchUser()) });

    session.duplicate(cleanSid, getLaunchUser() || "", true, (code) => {
      if (code) {
        logDebug("Launch session duplicate failed", { code, error: getPlatformErrorText(code) });
        reject(new AuthRequiredError(`${t("sessionLoginFailed")}: ${getPlatformErrorText(code)}`));
        return;
      }

      logDebug("Launch session duplicate succeeded");
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
      logDebug("Stored token could not be used; falling back to launch session", { message: err.message });
    }
  }

  const launchSid = getLaunchSid();
  if (launchSid) {
    await loginWithLaunchSession(launchSid);
    return;
  }

  throw new AuthRequiredError(t("loginRequired"));
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
    throw new Error(t("accountIdError"));
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
    throw new Error(t("accountLoadError"));
  }

  logDebug("Account custom fields loaded", { hasFields: Boolean(item.flds) });
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
    throw new Error(t("accountTokenMissing"));
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
    throw new Error(t("vehicleListJsonError"));
  }

  if (!response.ok) {
    const detail = extractApiError(payload) || response.statusText || `HTTP ${response.status}`;
    logDebug("Vehicle list API request failed", { status: response.status, detail });
    throw new Error(t("vehicleListLoadError"));
  }

  if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
    logDebug("Vehicle list API returned errors", { detail: extractApiError(payload) });
    throw new Error(t("vehicleListLoadError"));
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
    const name = String(item.name || ident || t("defaultDeviceName", { id }));

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
    count.textContent = t("noVehiclesFound");
    return;
  }

  count.textContent = appState.searchText.trim()
    ? t("vehicleCountFiltered", { shown: filtered.length, total: appState.devices.length })
    : t("vehicleCount", { count: appState.devices.length });

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
  const parts = [t("deviceLabel", { id: vehicle.id })];
  if (vehicle.ident) parts.push(vehicle.ident);
  parts.push(vehicle.connected ? t("online") : t("offline"));
  return parts.join(" · ");
}

function selectVehicle(deviceId) {
  const selected = appState.devices.find((vehicle) => vehicle.id === String(deviceId));
  if (!selected) return;

  appState.selectedDeviceId = selected.id;
  setStoredDeviceId(selected.id);
  renderVehicleList();
  loadHubFrame(selected.id, { showLoading: true });
}

function findDeviceById(deviceId) {
  const cleanDeviceId = String(deviceId || "").trim();
  if (!cleanDeviceId) return null;

  return appState.devices.find((vehicle) => vehicle.id === cleanDeviceId) || null;
}

function chooseInitialDevice() {
  const storedDeviceId = getStoredDeviceId();
  const storedDevice = findDeviceById(storedDeviceId);

  if (storedDevice) {
    return storedDevice.id;
  }

  if (storedDeviceId) {
    clearStoredDeviceId();
  }

  return appState.devices.length ? appState.devices[0].id : "";
}

function buildFrameUrl(deviceId, token, lang, theme, reloadNonce = "") {
  const safeTheme = isValidTheme(theme) ? theme : DEFAULT_FRAME_THEME;
  const safeLang = normalizeFrameLang(lang);
  const pageQuery = new URLSearchParams();
  const routeQuery = new URLSearchParams();

  pageQuery.set("theme", safeTheme);
  pageQuery.set("lang", safeLang);

  routeQuery.set("token", token);
  routeQuery.set("hidepanels", "1");
  routeQuery.set("whitelabel", "true");
  routeQuery.set("hidedisclaimer", "true");
  routeQuery.set("theme", safeTheme);
  routeQuery.set("lang", safeLang);

  if (reloadNonce) {
    pageQuery.set("reload", String(reloadNonce));
    routeQuery.set("reload", String(reloadNonce));
  }

  return `${FRAME_BASE_URL}/?${pageQuery.toString()}#/device/${encodeURIComponent(deviceId)}?${routeQuery.toString()}`;
}

function loadHubFrame(deviceId, options = {}) {
  const cleanDeviceId = String(deviceId || "").trim();
  if (!cleanDeviceId) return;

  const selectedDevice = findDeviceById(cleanDeviceId);
  if (!selectedDevice) {
    clearStoredDeviceId();
    return;
  }

  const iframe = document.getElementById("tachohub");
  if (!iframe) {
    throw new Error(t("missingMainFrame"));
  }

  if (options.forceReload) {
    appState.frameReloadNonce += 1;
  }

  const url = buildFrameUrl(
    selectedDevice.id,
    appState.frameToken,
    appState.frameLang,
    appState.theme,
    options.forceReload ? appState.frameReloadNonce : ""
  );
  const generation = appState.frameLoadGeneration + 1;

  appState.frameLoadGeneration = generation;
  appState.currentFrameDeviceId = selectedDevice.id;

  if (options.showLoading) {
    setStatus(t("loadingFrame"));
  }

  iframe.style.display = "block";
  iframe.onload = () => {
    if (appState.frameLoadGeneration === generation) hideStatus();
  };
  iframe.src = url;
}

async function loadApplication() {
  setStatus(t("loadingAccountSettings"));

  appState.frameToken = await loadFrameTokenFromAccount();

  setStatus(t("loadingVehicles"));
  appState.devices = await fetchDevices(appState.frameToken);

  const initialDeviceId = chooseInitialDevice();
  if (!initialDeviceId) {
    throw new Error(t("noVehiclesForToken"));
  }

  appState.selectedDeviceId = initialDeviceId;
  setStoredDeviceId(initialDeviceId);
  renderVehicleList();
  hideLoginPanel();
  loadHubFrame(initialDeviceId, { showLoading: true });
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
  loginUrl.searchParams.set("lang", appState.uiLang);

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
  const loginView = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");
  const loginUrl = buildLoginUrl();
  const allowedOrigin = new URL(getLoginHostUrl()).origin;
  const message = reason || t("loginRequired");

  logDebug("Showing login view", { reason: message, loginHost: getLoginHostUrl() });

  if (!loginView || !loginFrame) {
    fail(message);
    return;
  }

  appState.isLoginVisible = true;
  document.body.classList.add("login-active");
  setStatus(message);

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
      hideLoginPanel();
      setStoredLoginToken(token);
      initSession(appState.apiBaseUrl || getApiBaseUrl());
      await loginWithToken(token);
      await loadApplication();
    } catch (err) {
      clearStoredLoginToken();
      showLoginPanel(err && err.message ? err.message : t("loginFailed"));
    }
  };

  window.addEventListener("message", loginMessageHandler);
}

function hideLoginPanel() {
  const loginView = document.getElementById("login-view");
  const loginFrame = document.getElementById("login-frame");

  appState.isLoginVisible = false;
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
    nextTheme === "dark" ? t("switchThemeToDark") : t("switchThemeToLight")
  );
}

function updatePanelToggleText() {
  const panelToggle = document.getElementById("panel-toggle");
  const shell = document.getElementById("app-shell");
  if (!panelToggle || !shell) return;

  const isHidden = shell.classList.contains("nav-hidden");
  panelToggle.textContent = isHidden ? t("showVehicles") : t("hideVehicles");
  panelToggle.setAttribute("aria-expanded", isHidden ? "false" : "true");
}

function toggleTheme() {
  const nextTheme = appState.theme === "dark" ? "light" : "dark";
  appState.theme = nextTheme;
  setStoredTheme(nextTheme);
  applyTheme(nextTheme);

  const deviceId = appState.currentFrameDeviceId || appState.selectedDeviceId;
  if (deviceId && appState.frameToken) {
    loadHubFrame(deviceId, { forceReload: true, showLoading: true });
  }
}

function applyLocalization() {
  document.documentElement.lang = appState.uiLang;
  document.title = t("appTitle");

  const appTitle = document.getElementById("app-title");
  if (appTitle) appTitle.textContent = t("appTitle");

  const searchInput = document.getElementById("vehicle-search");
  if (searchInput) searchInput.placeholder = t("searchVehicles");

  const reloadButton = document.getElementById("app-reload");
  if (reloadButton) {
    reloadButton.textContent = t("reloadApp");
    reloadButton.setAttribute("aria-label", t("reloadApp"));
  }

  const mainFrame = document.getElementById("tachohub");
  if (mainFrame) mainFrame.setAttribute("title", t("mainFrameTitle"));

  const loginFrame = document.getElementById("login-frame");
  if (loginFrame) loginFrame.setAttribute("title", t("loginFrameTitle"));

  updatePanelToggleText();
  applyTheme(appState.theme);
}

function setupUi() {
  const panelToggle = document.getElementById("panel-toggle");
  const shell = document.getElementById("app-shell");
  const searchInput = document.getElementById("vehicle-search");
  const themeToggle = document.getElementById("theme-toggle");
  const reloadButton = document.getElementById("app-reload");

  if (panelToggle && shell) {
    panelToggle.addEventListener("click", () => {
      shell.classList.toggle("nav-hidden");
      updatePanelToggleText();
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

  applyLocalization();
}

async function main() {
  appState.apiBaseUrl = getApiBaseUrl();
  appState.uiLang = normalizeUiLang(getLaunchLanguage());
  appState.frameLang = normalizeFrameLang(getLaunchLanguage() || DEFAULT_FRAME_LANG);
  appState.theme = getStoredTheme();

  setupUi();
  applyTheme(appState.theme);

  logDebug("Starting app", {
    baseUrl: appState.apiBaseUrl,
    hostUrl: getLoginHostUrl(),
    uiLang: appState.uiLang,
    frameLang: appState.frameLang,
    hasLaunchSid: Boolean(getLaunchSid()),
    hasStoredToken: Boolean(getStoredLoginToken()),
    hasStoredDeviceId: Boolean(getStoredDeviceId())
  });

  setStatus(t("loadingSdk"));
  await loadPlatformSdk(appState.apiBaseUrl);

  try {
    setStatus(t("initializingSession"));
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
  console.error(err);
  fail(err && err.message ? err.message : t("appLoadError"));
});
