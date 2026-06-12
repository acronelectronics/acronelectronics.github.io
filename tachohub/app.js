const BASE_URL = "https://api.tracking.acronmanagement.com";
const TOKEN_FIELD = "tachohub_token";

const params = new URLSearchParams(window.location.search);

function fail(message) {
  document.getElementById("status").textContent = message;
}

async function apiCall(svc, callParams, sid) {
  const url =
    `${BASE_URL}/api` +
    `?svc=${encodeURIComponent(svc)}`;

  const body = new URLSearchParams();
  body.set("params", JSON.stringify(callParams));
  body.set("sid", sid);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json();

  if (data && data.error) {
    throw new Error(`API error ${data.error} for ${svc}`);
  }

  return data;
}

function findFieldValue(fieldsObject, fieldName) {
  if (!fieldsObject) return null;

  for (const key of Object.keys(fieldsObject)) {
    const field = fieldsObject[key];

    if (field && field.n === fieldName) {
      return field.v;
    }
  }

  return null;
}

async function main() {
  const sid = params.get("sid");
  const deviceId = params.get("deviceId");

  if (!sid) {
    fail("Missing SID. Activate Advanced URL parameter: Active SID.");
    return;
  }

  if (!deviceId) {
    fail("Missing deviceId. Send ?deviceId=DEVICE_ID in the URL.");
    return;
  }

  const sessionInfo = await apiCall("core/duplicate", { restore: 1 }, sid);
  const accountId = sessionInfo?.user?.bact;

  if (!accountId) {
    fail("Can't determine the account ID of the current user.");
    return;
  }

  const account = await apiCall(
    "core/search_item",
    { id: accountId, flags: 8 },
    sid
  );

  const item = account.item;
  const token = findFieldValue(item.flds, TOKEN_FIELD);

  if (!token) {
    fail(`Could not find custom field '${TOKEN_FIELD}' on this account.`);
    return;
  }

  const url =
    `https://tachobox.flespi.io/#/device/${encodeURIComponent(deviceId)}` +
    `?token=${encodeURIComponent(token)}` +
    `&hidepanels=1` +
    `&whitelabel=true` +
    `&hidedisclaimer=true` +
    `&theme=dark` +
    `&lang=ro-RO`;

  const iframe = document.getElementById("tachohub");
  iframe.src = url;
  iframe.style.display = "block";
  document.getElementById("status").style.display = "none";
}

main().catch((err) => {
  console.error(err);
  fail(err.message || "Application loading error.");
});
