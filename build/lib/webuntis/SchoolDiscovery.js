"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var SchoolDiscovery_exports = {};
__export(SchoolDiscovery_exports, {
  mergeSchoolSelection: () => mergeSchoolSelection,
  rankSchoolResults: () => rankSchoolResults,
  schoolResultToConfig: () => schoolResultToConfig,
  searchSchools: () => searchSchools
});
module.exports = __toCommonJS(SchoolDiscovery_exports);
var import_WebUntisErrors = require("./WebUntisErrors");
const SEARCH_URL = "https://mobile.webuntis.com/ms/schoolquery2";
const REQUEST_TIMEOUT_MS = 1e4;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function asString(value, field) {
  if (typeof value !== "string") {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", `Missing school field: ${field}`);
  }
  return value;
}
function mapSchool(value) {
  if (!isRecord(value)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid school search result");
  }
  if (typeof value.schoolId !== "number") {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Missing school field: schoolId");
  }
  return {
    displayName: asString(value.displayName, "displayName"),
    address: asString(value.address, "address"),
    loginName: asString(value.loginName, "loginName"),
    schoolId: value.schoolId,
    server: asString(value.server, "server"),
    serverUrl: asString(value.serverUrl, "serverUrl"),
    mobileServiceUrl: value.mobileServiceUrl === null ? null : asString(value.mobileServiceUrl, "mobileServiceUrl")
  };
}
function isSchoolSearchResponse(value) {
  return isRecord(value) && typeof value.size === "number" && Array.isArray(value.schools);
}
async function searchSchools(query, fetchImpl = fetch) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }
  try {
    const response = await fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        id: Date.now().toString(),
        method: "searchSchool",
        params: [{ schoolid: 0, search: normalizedQuery }],
        jsonrpc: "2.0"
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", `School search HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (isRecord(payload) && isRecord(payload.error) && payload.error.code === -6003) {
      return [];
    }
    if (!isRecord(payload) || !isSchoolSearchResponse(payload.result)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid school search response");
    }
    return payload.result.schools.map(mapSchool);
  } catch (error) {
    if (error instanceof import_WebUntisErrors.WebUntisError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new import_WebUntisErrors.WebUntisError("TIMEOUT", "School search timed out");
    }
    throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", "School search failed", { cause: error });
  }
}
function rankSchoolResults(results, query) {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const collator = new Intl.Collator("de", { sensitivity: "base" });
  const score = (school) => {
    const fields = [school.displayName, school.address, school.loginName, school.server].map(
      (value) => value.toLocaleLowerCase()
    );
    return tokens.reduce((total, token) => {
      if (fields.some((field) => field === token)) {
        return total + 100;
      }
      if (fields.some((field) => field.startsWith(token))) {
        return total + 20;
      }
      if (fields.some((field) => field.includes(token))) {
        return total + 10;
      }
      return total;
    }, 0);
  };
  return [...results].sort((left, right) => {
    const scoreDifference = score(right) - score(left);
    return scoreDifference || collator.compare(left.displayName, right.displayName);
  });
}
function schoolResultToConfig(school) {
  return {
    server: school.serverUrl,
    schoolName: school.loginName,
    schoolDisplayName: school.displayName,
    schoolAddress: school.address,
    schoolId: school.schoolId
  };
}
function mergeSchoolSelection(native, school) {
  return { ...native, ...schoolResultToConfig(school) };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  mergeSchoolSelection,
  rankSchoolResults,
  schoolResultToConfig,
  searchSchools
});
//# sourceMappingURL=SchoolDiscovery.js.map
