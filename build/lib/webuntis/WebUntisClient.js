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
var WebUntisClient_exports = {};
__export(WebUntisClient_exports, {
  WebUntisClient: () => WebUntisClient
});
module.exports = __toCommonJS(WebUntisClient_exports);
var import_WebUntisErrors = require("./WebUntisErrors");
const REQUEST_TIMEOUT_MS = 1e4;
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isAuthenticationResponse(value) {
  return isRecord(value) && typeof value.sessionId === "string" && typeof value.personType === "number" && typeof value.personId === "number" && typeof value.klasseId === "number";
}
function isPeriodList(value) {
  return Array.isArray(value) && value.every(isRecord);
}
function getClassIdFromConfig(value) {
  var _a;
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }
  const classId = value.data.klasseId;
  if (typeof classId === "number" && Number.isInteger(classId) && classId > 0) {
    return classId;
  }
  if (typeof classId === "string" && /^\d+$/.test(classId) && Number(classId) > 0) {
    return Number(classId);
  }
  if (Array.isArray(value.data.klassen)) {
    const firstClass = value.data.klassen.find(isRecord);
    const id = (_a = firstClass == null ? void 0 : firstClass.id) != null ? _a : firstClass == null ? void 0 : firstClass.klasseId;
    if (typeof id === "number" && Number.isInteger(id)) {
      return id;
    }
    if (typeof id === "string" && /^\d+$/.test(id)) {
      return Number(id);
    }
  }
  return null;
}
function publicPeriods(value, personId) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.result)) {
    return [];
  }
  const data = value.data.result.data;
  if (!isRecord(data) || !isRecord(data.elementPeriods)) {
    return [];
  }
  const periods = data.elementPeriods[String(personId)];
  if (!Array.isArray(periods)) {
    return [];
  }
  return periods.filter(isRecord).map((period) => {
    const elements = Array.isArray(period.elements) ? period.elements.filter(isRecord) : [];
    const refs = (type) => elements.filter((element) => element.type === type).map((element) => isRecord(element.element) ? element.element : element);
    return { ...period, kl: refs(1), te: refs(2), su: refs(3), ro: refs(4) };
  });
}
function getSupportedPerson(value) {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.loginServiceConfig)) {
    return null;
  }
  const user = value.data.loginServiceConfig.user;
  if (!isRecord(user) || !Array.isArray(user.persons)) {
    return null;
  }
  for (const person of user.persons) {
    if (!isRecord(person) || typeof person.id !== "number" || typeof person.type !== "number") {
      continue;
    }
    if (person.type >= 1 && person.type <= 5) {
      return { id: person.id, type: person.type };
    }
  }
  return null;
}
function isLoginPagePayload(value) {
  return isRecord(value) && Boolean(value.loginError);
}
function getEndpoint(server, schoolName) {
  var _a;
  const url = new URL(server);
  const webUntisPath = ((_a = url.pathname.match(/^(.*\/WebUntis)(?:\/|$)/i)) == null ? void 0 : _a[1]) || "/WebUntis";
  return `${url.origin}${webUntisPath}/jsonrpc.do?school=${encodeURIComponent(schoolName)}`;
}
function getResponseType(body, contentType) {
  if (!body) {
    return "empty";
  }
  if (contentType.toLocaleLowerCase().includes("html") || /^\s*</.test(body)) {
    return "html";
  }
  try {
    JSON.parse(body);
    return "json";
  } catch {
    return "text";
  }
}
function redactUrl(url) {
  return url.replace(/;jsessionid=[^?;]+/gi, ";jsessionid=<redacted>");
}
function getCookieHeader(headers) {
  var _a, _b;
  const cookieHeaders = headers;
  const values = (_b = (_a = cookieHeaders.getSetCookie) == null ? void 0 : _a.call(cookieHeaders)) != null ? _b : [headers.get("set-cookie") || ""];
  const cookies = values.flatMap((value) => value.split(/,(?=[^;,]+=)/)).map((value) => value.split(";", 1)[0].trim()).filter(Boolean);
  return cookies.length ? cookies.join("; ") : void 0;
}
function cookieValue(header, name) {
  var _a;
  return (_a = header == null ? void 0 : header.split(/;\s*/).map((cookie) => cookie.split("=", 2)).find(([key]) => key === name)) == null ? void 0 : _a[1];
}
function mergeCookieHeader(previous, headers) {
  const values = /* @__PURE__ */ new Map();
  for (const cookie of (previous || "").split(/;\s*/)) {
    const separator = cookie.indexOf("=");
    if (separator > 0) {
      values.set(cookie.slice(0, separator), cookie);
    }
  }
  const next = getCookieHeader(headers);
  if (next) {
    for (const cookie of next.split(/;\s*/)) {
      const separator = cookie.indexOf("=");
      if (separator > 0) {
        values.set(cookie.slice(0, separator), cookie);
      }
    }
  }
  const value = values.size ? [...values.values()].join("; ") : void 0;
  return {
    value,
    changed: value !== previous,
    sessionCookieChanged: cookieValue(previous, "JSESSIONID") !== cookieValue(value, "JSESSIONID")
  };
}
class WebUntisClient {
  /**
   *
   */
  constructor(config, fetchImpl = fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS, onDiagnostic) {
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.onDiagnostic = onDiagnostic;
    this.endpoint = getEndpoint(config.server, config.schoolName);
  }
  endpoint;
  sessionCookie;
  authenticatedAt;
  requestSequence = 0;
  /**
   *
   */
  async authenticate(username, password) {
    var _a;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          id: Date.now().toString(),
          method: "authenticate",
          params: { user: username, password, client: "ioBroker.webuntis2" },
          jsonrpc: "2.0"
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs)
      });
      this.sessionCookie = getCookieHeader(response.headers);
      this.authenticatedAt = Date.now();
      const contentType = response.headers.get("content-type") || "";
      const body = await response.text();
      const type = getResponseType(body, contentType);
      let payload;
      if (type === "json") {
        try {
          payload = JSON.parse(body);
        } catch {
          throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis JSON response");
        }
      }
      const diagnostic = {
        method: "authenticate",
        status: response.status,
        contentType,
        url: redactUrl(response.url),
        redirected: response.redirected,
        length: body.length,
        type,
        cookiePresent: Boolean(this.sessionCookie),
        responseHeaders: Array.from(response.headers.keys()).sort()
      };
      if (isRecord(payload)) {
        diagnostic.keys = Object.keys(payload);
        if (isRecord(payload.error)) {
          diagnostic.errorKeys = Object.keys(payload.error);
          if (typeof payload.error.code === "number") {
            diagnostic.errorCode = payload.error.code;
          }
          if (typeof payload.error.message === "string") {
            diagnostic.errorMessage = payload.error.message.slice(0, 120);
          }
        }
        if (isRecord(payload.result)) {
          diagnostic.resultKeys = Object.keys(payload.result);
          if (typeof payload.result.personType === "number") {
            diagnostic.personType = payload.result.personType;
          }
          diagnostic.personIdPresent = typeof payload.result.personId === "number";
          diagnostic.klasseIdPresent = typeof payload.result.klasseId === "number";
        }
        diagnostic.resultType = Array.isArray(payload.result) ? "array" : payload.result === void 0 ? "missing" : isRecord(payload.result) ? "object" : "primitive";
        if (Array.isArray(payload.result)) {
          diagnostic.resultLength = payload.result.length;
        }
      }
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, diagnostic);
      if (!response.ok) {
        throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
      }
      if (response.redirected) {
        throw new import_WebUntisErrors.WebUntisError("REDIRECTED", "WebUntis redirected the authentication request");
      }
      if (type === "html") {
        throw new import_WebUntisErrors.WebUntisError("HTML_RESPONSE", "WebUntis returned HTML instead of JSON");
      }
      if (!isRecord(payload)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis response");
      }
      if (isRecord(payload.error)) {
        const code = payload.error.code;
        if (code === -8504 || code === -8520 || code === -8521) {
          throw new import_WebUntisErrors.WebUntisError("INVALID_CREDENTIALS", "WebUntis rejected the credentials");
        }
        if (code === -8522) {
          throw new import_WebUntisErrors.WebUntisError("USER_BLOCKED", "WebUntis user is blocked");
        }
        if (code === -8500) {
          throw new import_WebUntisErrors.WebUntisError("INVALID_SCHOOL", "WebUntis rejected the school");
        }
        throw new import_WebUntisErrors.WebUntisError("UNEXPECTED_RESPONSE", "WebUntis authentication failed");
      }
      if (!isAuthenticationResponse(payload.result)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid authentication response");
      }
      return payload.result;
    } catch (error) {
      if (error instanceof import_WebUntisErrors.WebUntisError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new import_WebUntisErrors.WebUntisError("TIMEOUT", "WebUntis authentication timed out");
      }
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", "WebUntis authentication failed", { cause: error });
    }
  }
  /**
   *
   */
  async getTimetable(session, options) {
    return this.request("getTimetable", { options }, session);
  }
  /**
   *
   */
  async getSubjects(session) {
    return this.request("getSubjects", {}, session);
  }
  /**
   *
   */
  async getTeachers(session) {
    return this.request("getTeachers", {}, session);
  }
  /**
   *
   */
  async getRooms(session) {
    return this.request("getRooms", {}, session);
  }
  /**
   *
   */
  async getKlassen(session) {
    return this.request("getKlassen", {}, session);
  }
  /**
   *
   */
  async getHolidays(session) {
    return this.request("getHolidays", {}, session);
  }
  /**
   *
   */
  async getClassId(session) {
    var _a, _b;
    const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/daytimetable/config");
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...this.sessionCookie ? { cookie: this.sessionCookie } : { cookie: `JSESSIONID=${session.sessionId}` }
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const type = getResponseType(body, contentType);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
        method: "getClassId",
        status: response.status,
        contentType,
        url: redactUrl(response.url),
        redirected: response.redirected,
        length: body.length,
        type
      });
      return null;
    }
    (_b = this.onDiagnostic) == null ? void 0 : _b.call(this, {
      method: "getClassId",
      status: response.status,
      contentType,
      url: redactUrl(response.url),
      redirected: response.redirected,
      length: body.length,
      type,
      resultType: "object",
      resultKeys: isRecord(payload) ? Object.keys(payload) : void 0,
      dataType: isRecord(payload) ? typeof payload.data : typeof payload,
      dataKeys: isRecord(payload) && isRecord(payload.data) ? Object.keys(payload.data) : [],
      classIdType: isRecord(payload) && isRecord(payload.data) ? typeof payload.data.klasseId : "missing",
      classIdPresent: getClassIdFromConfig(payload) !== null,
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged,
      cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
      classCandidateCount: isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.klassen) ? payload.data.klassen.length : 0
    });
    if (response.redirected || isLoginPagePayload(payload)) {
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
    }
    return getClassIdFromConfig(payload);
  }
  /**
   *
   */
  async getPublicTimetable(session, date) {
    var _a;
    const url = new URL(this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/public/timetable/weekly/data"));
    url.searchParams.set("elementType", String(session.personType));
    url.searchParams.set("elementId", String(session.personId));
    url.searchParams.set("date", date.toISOString().slice(0, 10));
    url.searchParams.set("formatId", "1");
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...this.sessionCookie ? { cookie: this.sessionCookie } : { cookie: `JSESSIONID=${session.sessionId}` }
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const type = getResponseType(body, contentType);
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis public timetable response");
    }
    const periods = publicPeriods(payload, session.personId);
    (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
      method: "getPublicTimetable",
      status: response.status,
      contentType,
      url: redactUrl(response.url),
      redirected: response.redirected,
      length: body.length,
      type,
      resultType: "array",
      resultLength: periods.length,
      resultKeys: isRecord(payload) ? Object.keys(payload) : void 0,
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged,
      cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
      errorMessage: isRecord(payload) && typeof payload.errorMessage === "string" ? payload.errorMessage.slice(0, 120) : isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string" ? payload.error.message.slice(0, 120) : void 0
    });
    if (!response.ok) {
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
    }
    return periods;
  }
  /**
   *
   */
  async getSupportedPerson(session) {
    var _a, _b;
    const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/app/config");
    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...this.sessionCookie ? { cookie: this.sessionCookie } : { cookie: `JSESSIONID=${session.sessionId}` }
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
        method: "getSupportedPerson",
        status: response.status,
        contentType,
        url: redactUrl(response.url),
        redirected: response.redirected,
        length: body.length,
        type: getResponseType(body, contentType)
      });
      return null;
    }
    const person = getSupportedPerson(payload);
    (_b = this.onDiagnostic) == null ? void 0 : _b.call(this, {
      method: "getSupportedPerson",
      status: response.status,
      contentType,
      url: redactUrl(response.url),
      redirected: response.redirected,
      length: body.length,
      type: getResponseType(body, contentType),
      resultType: person ? "object" : "missing",
      personCandidate: Boolean(person),
      resultKeys: isRecord(payload) ? Object.keys(payload) : void 0,
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged,
      cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
      errorMessage: isRecord(payload) && typeof payload.errorMessage === "string" ? payload.errorMessage.slice(0, 120) : void 0
    });
    if (response.redirected || isLoginPagePayload(payload)) {
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
    }
    return person;
  }
  async request(method, params, session) {
    var _a;
    try {
      const requestSequence = ++this.requestSequence;
      const sessionEndpoint = this.endpoint.replace(
        "/jsonrpc.do?",
        `/jsonrpc.do;jsessionid=${encodeURIComponent(session.sessionId)}?`
      );
      const requestOptions = isRecord(params) && isRecord(params.options) ? params.options : void 0;
      const response = await this.fetchImpl(sessionEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...this.sessionCookie ? { cookie: this.sessionCookie } : {}
        },
        body: JSON.stringify({ id: Date.now().toString(), method, params, jsonrpc: "2.0" }),
        signal: AbortSignal.timeout(this.requestTimeoutMs)
      });
      const body = await response.text();
      const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
      this.sessionCookie = cookie.value;
      const contentType = response.headers.get("content-type") || "";
      const type = getResponseType(body, contentType);
      let payload;
      if (type === "json") {
        try {
          payload = JSON.parse(body);
        } catch {
        }
      }
      const diagnostic = {
        method,
        status: response.status,
        contentType,
        url: redactUrl(response.url),
        redirected: response.redirected,
        length: body.length,
        type,
        cookiePresent: Boolean(this.sessionCookie),
        cookieChanged: cookie.changed,
        sessionCookieChanged: cookie.sessionCookieChanged,
        cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
        sessionAgeSeconds: this.authenticatedAt ? Math.max(0, Math.round((Date.now() - this.authenticatedAt) / 1e3)) : void 0,
        requestSequence,
        sessionPresent: Boolean(session.sessionId),
        personIdPresent: typeof session.personId === "number",
        elementType: isRecord(requestOptions == null ? void 0 : requestOptions.element) ? typeof requestOptions.element.type === "number" ? requestOptions.element.type : void 0 : void 0,
        startDate: typeof (requestOptions == null ? void 0 : requestOptions.startDate) === "number" ? requestOptions.startDate : void 0,
        endDate: typeof (requestOptions == null ? void 0 : requestOptions.endDate) === "number" ? requestOptions.endDate : void 0
      };
      if (isRecord(payload)) {
        diagnostic.keys = Object.keys(payload);
        if (isRecord(payload.error)) {
          diagnostic.errorKeys = Object.keys(payload.error);
          if (typeof payload.error.code === "number") {
            diagnostic.errorCode = payload.error.code;
          }
          if (typeof payload.error.message === "string") {
            diagnostic.errorMessage = payload.error.message.slice(0, 120);
          }
        }
        if (Array.isArray(payload.result)) {
          diagnostic.resultType = "array";
          diagnostic.resultLength = payload.result.length;
        } else if (isRecord(payload.result)) {
          diagnostic.resultType = "object";
          diagnostic.resultKeys = Object.keys(payload.result);
        } else {
          diagnostic.resultType = payload.result === void 0 ? "missing" : "primitive";
        }
      }
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, diagnostic);
      if (!response.ok) {
        throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
      }
      if (!isRecord(payload)) {
        throw new import_WebUntisErrors.WebUntisError(
          type === "html" ? "HTML_RESPONSE" : "INVALID_RESPONSE",
          type === "html" ? "WebUntis returned HTML instead of JSON" : "Invalid WebUntis timetable response"
        );
      }
      if (isRecord(payload.error)) {
        if (payload.error.code === -7001 && typeof payload.error.message === "string" && payload.error.message.startsWith("invalid elementType:")) {
          throw new import_WebUntisErrors.WebUntisError("API_REQUEST", "WebUntis rejected the timetable element type");
        }
        if (payload.error.code === -7001) {
          throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
        }
        throw new import_WebUntisErrors.WebUntisError("UNEXPECTED_RESPONSE", "WebUntis timetable request failed");
      }
      if (!isPeriodList(payload.result)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
      }
      return payload.result;
    } catch (error) {
      if (error instanceof import_WebUntisErrors.WebUntisError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new import_WebUntisErrors.WebUntisError("TIMEOUT", "WebUntis timetable request timed out");
      }
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", "WebUntis timetable request failed", { cause: error });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebUntisClient
});
//# sourceMappingURL=WebUntisClient.js.map
