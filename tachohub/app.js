"use strict";

const APP_DNS = "gapp_tachohub";
const TOKEN_FIELD = "tachohub_token";

const DEFAULT_API_URL = "https://hst-api.wialon.com";
const DEFAULT_HOST_URL = "https://hosting.wialon.com";
const DEFAULT_TACHOBOX_LANG = "ro-RO";
const DEFAULT_TACHOBOX_THEME = "dark";
const TACHOBOX_BASE_URL = "https://tachobox.flespi.io";

const WIALON_SESSION_FLAGS = 0x800;
const RESOURCE_CUSTOM_FIELDS_FLAG = 8;

const queryParams = new URLSearchParams(window.location.search);
let sdkLoadPromise = null;
let loginMessageHandler = null;

class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = message;
  status.style.display = "block";
}

function fail(message) {
  hideLoginPanel();
  setStatus(message);
}

function logDebug(label, details) {
  if (!window.console || typeof console.info !== "function") return;

  console.info(`[TachoHub] ${label}`, details || "");
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

function getLaunchAuthHash() {
  return (
    getFirstParam(["authHash", "access_hash", "hash"]) ||
    getAuthHashFromLocationHash()
  );
}

function getAuthHashFromLocationHash() {
  const rawHash = window.location.hash.replace(/^#/, "");
  if (!rawHash) return "";

  const params = new URLSearchParams(rawHash);
  return (
    params.get("authHash") ||
    params.get("access_hash") ||
    params.get("hash") ||
    ""
  ).trim();
}

function removeReturnedAuthHashFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;

  for (const name of ["authHash", "access_hash", "hash"]) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

    for (const name of ["authHash", "access_hash", "hash"]) {
      if (hashParams.has(name)) {
        hashParams.delete(name);
        changed = true;
      }
    }

    const nextHash = hashParams.toString();
    url.hash = nextHash ? `#${nextHash}` : "";
  }

  if (changed && window.history && window.history.replaceState) {
    window.history.replaceState(null, document.title, url.toString());
  }
}

function normalizeTachoboxLang(lang) {
  const value = (lang || "").toLowerCase();

  if (value === "ro" || value === "ro-ro") return "ro-RO";
  if (value === "en" || value === "en-us") return "en-US";
  if (value === "ru" || value === "ru-ru") return "ru-RU";

  return lang || DEFAULT_TACHOBOX_LANG;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.src = src;
    script.async = true;
    script.charset = "UTF-8";

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });
}

function loadWialonSdk(baseUrl) {
  if (window.wialon && wialon.core && wialon.core.Session) {
    logDebug("Wialon SDK already loaded");
    return Promise.resolve();
  }

  if (!sdkLoadPromise) {
    logDebug("Loading Wialon SDK", { baseUrl });
    sdkLoadPromise = loadScript(`${baseUrl}/wsdk/script/wialon.js`);
  }

  return sdkLoadPromise;
}

function getWialonErrorText(code) {
  if (
    window.wialon &&
    wialon.core &&
    wialon.core.Errors &&
    typeof wialon.core.Errors.getErrorText === "function"
  ) {
    return wialon.core.Errors.getErrorText(code);
  }

  return `Wialon error ${code}`;
}

function isAuthErrorCode(code) {
  return code === 1 || code === 1003;
}

function getSession() {
  if (!window.wialon || !wialon.core || !wialon.core.Session) {
    throw new Error("Wialon JS SDK did not load.");
  }

  return wialon.core.Session.getInstance();
}

function getRemote() {
  if (!window.wialon || !wialon.core || !wialon.core.Remote) {
    throw new Error("Wialon Remote API wrapper is not available.");
  }

  return wialon.core.Remote.getInstance();
}

function initSession(baseUrl) {
  logDebug("Initializing Wialon session", { baseUrl });
  getSession().initSession(baseUrl);
}

function loginWithSid(sid, user) {
  return new Promise((resolve, reject) => {
    logDebug("Trying SID login", {
      hasSid: Boolean(sid),
      user: user || ""
    });

    getSession().duplicate(sid, user || "", true, (code) => {
      if (code) {
        logDebug("SID login failed", { code, error: getWialonErrorText(code) });
        reject(new AuthRequiredError(`${getWialonErrorText(code)} during SID login.`));
        return;
      }

      logDebug("SID login succeeded");
      resolve();
    });
  });
}

function loginWithAuthHash(authHash) {
  return new Promise((resolve, reject) => {
    logDebug("Trying authorization hash login", { hasAuthHash: Boolean(authHash) });

    getSession().loginAuthHash(authHash, "", (code) => {
      if (code) {
        logDebug("Authorization hash login failed", { code, error: getWialonErrorText(code) });
        reject(new AuthRequiredError(`${getWialonErrorText(code)} during authorization hash login.`));
        return;
      }

      logDebug("Authorization hash login succeeded");
      removeReturnedAuthHashFromUrl();
      resolve();
    });
  });
}

async function authenticateFromLaunchParams(baseUrl) {
  initSession(baseUrl);

  const sid = getParam("sid");
  const user = getLaunchUser();
  const authHash = getLaunchAuthHash();

  logDebug("Launch auth parameters", {
    hasSid: Boolean(sid),
    hasAuthHash: Boolean(authHash),
    user
  });

  if (sid) {
    try {
      await loginWithSid(sid, user);
      return;
    } catch (err) {
      logDebug("SID login did not complete", {
        hasAuthHashFallback: Boolean(authHash),
        error: err && err.message ? err.message : String(err)
      });

      if (!authHash) throw err;
    }
  }

  if (authHash) {
    await loginWithAuthHash(authHash);
    return;
  }

  throw new AuthRequiredError("No usable Wialon SID or authorization hash was provided.");
}

function wialonCall(svc, callParams) {
  return new Promise((resolve, reject) => {
    getRemote().remoteCall(svc, callParams, (code, result) => {
      if (code) {
        const message = `${getWialonErrorText(code)} for ${svc}`;

        logDebug("Remote call failed", { svc, code, error: getWialonErrorText(code) });

        if (isAuthErrorCode(code)) {
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

  logDebug("Account ID not available on SDK user object; using core/duplicate restore");
  const sessionInfo = await wialonCall("core/duplicate", { restore: 1 });
  const accountId = sessionInfo && sessionInfo.user && sessionInfo.user.bact;

  if (!accountId) {
    throw new Error("Can't determine the account ID of the current Wialon user.");
  }

  logDebug("Account ID read from session restore", { accountId });
  return accountId;
}

async function getAccountCustomFields(accountId) {
  logDebug("Loading account custom fields", { accountId });

  const response = await wialonCall("core/search_item", {
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

function buildTachoboxUrl(deviceId, token, lang) {
  const query = new URLSearchParams();

  query.set("token", token);
  query.set("hidepanels", "0");
  query.set("whitelabel", "true");
  query.set("hidedisclaimer", "true");
  query.set("theme", DEFAULT_TACHOBOX_THEME);
  query.set("lang", normalizeTachoboxLang(lang));

  return `${TACHOBOX_BASE_URL}/#/device/${encodeURIComponent(deviceId)}?${query.toString()}`;
}

async function loadApplication() {
  setStatus("Reading account custom fields...");

  const deviceId = getParam("deviceId");
  const lang = getLaunchLanguage() || DEFAULT_TACHOBOX_LANG;

  if (!deviceId) {
    throw new Error("Missing deviceId. Add deviceId=FLESPI_DEVICE_ID to the app URL.");
  }

  const accountId = await getCurrentAccountId();
  const customFields = await getAccountCustomFields(accountId);
  const token = findCustomFieldValue(customFields, TOKEN_FIELD);

  if (!token) {
    throw new Error(`Could not find custom field '${TOKEN_FIELD}' on this account/resource.`);
  }

  logDebug("TachoHub token found in account custom fields");

  const iframe = document.getElementById("tachohub");

  if (!iframe) {
    throw new Error("Missing iframe element with id='tachohub'.");
  }

  iframe.src = buildTachoboxUrl(deviceId, token, lang);
  iframe.style.display = "block";

  const status = document.getElementById("status");
  if (status) status.style.display = "none";

  hideLoginPanel();
}

function buildLoginUrl() {
  const loginHost = getLoginHostUrl();
  const loginUrl = new URL(`${loginHost}/login.html`);

  loginUrl.searchParams.set("client_id", APP_DNS);
  loginUrl.searchParams.set("access_type", "-1");
  loginUrl.searchParams.set("response_type", "hash");
  loginUrl.searchParams.set("redirect_uri", `${loginHost}/post_message.html`);
  loginUrl.searchParams.set("flags", "1");
  loginUrl.searchParams.set("lang", getLaunchLanguage());

  const user = getLaunchUser();
  if (user) loginUrl.searchParams.set("user", user);

  return loginUrl.toString();
}

function extractAuthHashFromMessage(message) {
  if (typeof message !== "string") return "";

  if (message.indexOf("loginauth:") === 0) {
    try {
      const payload = JSON.parse(message.slice("loginauth:".length));
      return (
        payload.access_hash ||
        payload.authHash ||
        payload.hash ||
        ""
      ).trim();
    } catch (_err) {
      return "";
    }
  }

  const normalized = message.includes("?") || message.includes("#")
    ? message.replace(/^.*[?#]/, "")
    : message;

  const params = new URLSearchParams(normalized);
  return (
    params.get("access_hash") ||
    params.get("authHash") ||
    params.get("hash") ||
    ""
  ).trim();
}

function showLoginPanel(reason) {
  const loginPanel = document.getElementById("login-panel");
  const loginFrame = document.getElementById("wialon-login");
  const loginTitle = document.getElementById("login-title");
  const openLogin = document.getElementById("open-login");
  const reloadApp = document.getElementById("reload-app");
  const loginUrl = buildLoginUrl();
  const allowedOrigin = new URL(getLoginHostUrl()).origin;

  logDebug("Showing Wialon login panel", {
    reason,
    loginHost: getLoginHostUrl()
  });

  if (!loginPanel || !loginFrame || !loginTitle || !openLogin || !reloadApp) {
    fail(reason || "Wialon login is required.");
    return;
  }

  loginTitle.textContent = reason || "Please log in to Wialon to continue.";
  loginPanel.style.display = "block";
  loginFrame.src = loginUrl;

  openLogin.onclick = () => {
    window.open(loginUrl, "_blank", "width=760,height=560");
  };

  reloadApp.onclick = () => {
    window.location.reload();
  };

  if (loginMessageHandler) {
    window.removeEventListener("message", loginMessageHandler);
  }

  loginMessageHandler = async (event) => {
    if (event.origin !== allowedOrigin) return;

    const authHash = extractAuthHashFromMessage(event.data);
    if (!authHash) return;

    logDebug("Received authorization hash from Wialon login form");

    try {
      setStatus("Logging in to Wialon...");
      hideLoginPanel();
      initSession(getApiBaseUrl());
      await loginWithAuthHash(authHash);
      await loadApplication();
    } catch (err) {
      showLoginPanel(err && err.message ? err.message : "Wialon login failed.");
    }
  };

  window.addEventListener("message", loginMessageHandler);
}

function hideLoginPanel() {
  const loginPanel = document.getElementById("login-panel");
  const loginFrame = document.getElementById("wialon-login");

  if (loginPanel) loginPanel.style.display = "none";
  if (loginFrame) loginFrame.removeAttribute("src");
}

async function main() {
  const baseUrl = getApiBaseUrl();

  logDebug("Starting app", {
    baseUrl,
    hostUrl: getLoginHostUrl(),
    lang: getLaunchLanguage(),
    hasDeviceId: Boolean(getParam("deviceId"))
  });

  setStatus("Loading Wialon SDK...");
  await loadWialonSdk(baseUrl);

  try {
    setStatus("Initializing Wialon session...");
    await authenticateFromLaunchParams(baseUrl);
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
  fail(err && err.message ? err.message : "Application loading error.");
});
