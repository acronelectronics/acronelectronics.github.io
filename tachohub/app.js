"use strict";

const DEFAULT_API_URL = "https://hst-api.wialon.com";
const TOKEN_FIELD = "tachohub_token";

const TACHOBOX_BASE_URL = "https://tachobox.flespi.io";
const DEFAULT_TACHOBOX_LANG = "ro-RO";
const DEFAULT_TACHOBOX_THEME = "dark";

const RESOURCE_CUSTOM_FIELDS_FLAG = 8;

const params = new URLSearchParams(window.location.search);

function setStatus(message) {
  const status = document.getElementById("status");
  if (!status) return;

  status.textContent = message;
  status.style.display = "block";
}

function fail(message) {
  setStatus(message);
}

function getRequiredParam(name) {
  const value = params.get(name);
  if (!value || !value.trim()) return null;
  return value.trim();
}

function getOptionalParam(name, fallback) {
  const value = params.get(name);
  if (!value || !value.trim()) return fallback;
  return value.trim();
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

  return `SDK error ${code}`;
}

function getSession() {
  if (!window.wialon || !wialon.core || !wialon.core.Session) {
    throw new Error("JS SDK did not load.");
  }

  return wialon.core.Session.getInstance();
}

function getRemote() {
  if (!window.wialon || !wialon.core || !wialon.core.Remote) {
    throw new Error("Remote API wrapper is not available.");
  }

  return wialon.core.Remote.getInstance();
}

function initWialonSessionWithSid(baseUrl, sid) {
  return new Promise((resolve, reject) => {
    const session = getSession();

    session.initSession(baseUrl);

    if (typeof session.duplicate !== "function") {
      reject(
        new Error(
          "This JS SDK version does not expose session.duplicate(). Use Authorize hash or a backend proxy."
        )
      );
      return;
    }

    const user = getOptionalParam("user", "");

    /*
      Apps Active SID gives us the existing session.
      The JS SDK duplicate call attaches the SDK to that existing SID.

      Parameters used here:
      sid
      operateAs = ""
      continueCurrentSession = true
      callback
    */
    session.duplicate(sid, user, true, (code) => {
      if (code) {
        reject(new Error(getWialonErrorText(code)));
        return;
      }

      resolve(session);
    });
  });
}

function wialonCall(svc, callParams) {
  return new Promise((resolve, reject) => {
    const remote = getRemote();

    remote.remoteCall(svc, callParams, (code, result) => {
      if (code) {
        reject(new Error(`${getWialonErrorText(code)} for ${svc}`));
        return;
      }

      resolve(result);
    });
  });
}

function findCustomFieldValue(fieldsObject, fieldName) {
  if (!fieldsObject) return null;

  for (const key of Object.keys(fieldsObject)) {
    const field = fieldsObject[key];

    if (field && field.n === fieldName) {
      return field.v;
    }
  }

  return null;
}

function buildTachoboxUrl(deviceId, token, lang) {
  const safeDeviceId = encodeURIComponent(deviceId);

  const query = new URLSearchParams();
  query.set("token", token);
  query.set("hidepanels", "1");
  query.set("whitelabel", "true");
  query.set("hidedisclaimer", "true");
  query.set("theme", DEFAULT_TACHOBOX_THEME);
  query.set("lang", lang || DEFAULT_TACHOBOX_LANG);

  return `${TACHOBOX_BASE_URL}/#/device/${safeDeviceId}?${query.toString()}`;
}

async function getCurrentAccountId() {
  const sessionInfo = await wialonCall("core/duplicate", { restore: 1 });
  const accountId = sessionInfo && sessionInfo.user && sessionInfo.user.bact;

  if (!accountId) {
    throw new Error("Can't determine the account ID of the current user.");
  }

  return accountId;
}

async function getAccountCustomFields(accountId) {
  const response = await wialonCall("core/search_item", {
    id: accountId,
    flags: RESOURCE_CUSTOM_FIELDS_FLAG
  });

  const item = response && response.item;

  if (!item) {
    throw new Error("Could not load current account/resource.");
  }

  return item.flds || null;
}

async function main() {
  setStatus("Initializing session...");

  const sid = getRequiredParam("sid");
  const deviceId = getRequiredParam("deviceId");
  const baseUrl = getOptionalParam("baseUrl", DEFAULT_API_URL);
  const lang = getOptionalParam("lang", DEFAULT_TACHOBOX_LANG);

  if (!sid) {
    fail("Missing SID. In Apps configurator, enable Advanced URL parameter: Active SID.");
    return;
  }

  if (!deviceId) {
    fail("Missing deviceId. Add ?deviceId=DEVICE_ID to the app URL.");
    return;
  }

  await initWialonSessionWithSid(baseUrl, sid);

  setStatus("Reading account custom fields...");

  const accountId = await getCurrentAccountId();
  const customFields = await getAccountCustomFields(accountId);
  const token = findCustomFieldValue(customFields, TOKEN_FIELD);

  if (!token) {
    fail(`Could not find custom field '${TOKEN_FIELD}' on this account/resource.`);
    return;
  }

  const iframe = document.getElementById("tachohub");

  if (!iframe) {
    fail("Missing iframe element with id='tachohub'.");
    return;
  }

  iframe.src = buildTachoboxUrl(deviceId, token, lang);
  iframe.style.display = "block";

  const status = document.getElementById("status");
  if (status) status.style.display = "none";
}

main().catch((err) => {
  console.error(err);
  fail(err && err.message ? err.message : "Application loading error.");
});
