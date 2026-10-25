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
  WebUntisClient: () => WebUntisClient,
  localDateString: () => localDateString
});
module.exports = __toCommonJS(WebUntisClient_exports);
var import_Exams = require("./Exams");
var import_WebUntisErrors = require("./WebUntisErrors");
const REQUEST_TIMEOUT_MS = 1e4;
function localDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function guardianTimetableResponseShape(value) {
  var _a;
  const shape = {
    rootType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value
  };
  if (!isRecord(value)) {
    return JSON.stringify(shape);
  }
  shape.rootKeys = Object.keys(value).sort();
  const timetable = isRecord(value.data) ? value.data : value;
  shape.dataType = Array.isArray(value.data) ? "array" : value.data === void 0 ? "missing" : typeof value.data;
  if (isRecord(timetable)) {
    shape.dataKeys = Object.keys(timetable).sort();
  }
  if (Array.isArray(timetable.days)) {
    shape.dayCount = timetable.days.length;
    const entryTypes = /* @__PURE__ */ new Map();
    const examShapes = [];
    for (const day of timetable.days) {
      if (!isRecord(day) || !Array.isArray(day.gridEntries)) {
        continue;
      }
      for (const entry of day.gridEntries) {
        if (!isRecord(entry)) {
          continue;
        }
        const entryType = typeof entry.type === "string" ? entry.type : typeof entry.type;
        entryTypes.set(entryType, ((_a = entryTypes.get(entryType)) != null ? _a : 0) + 1);
        if (typeof entry.type !== "string" || !entry.type.toUpperCase().includes("EXAM") || examShapes.length >= 5) {
          continue;
        }
        const duration = entry.duration;
        const positions = Object.entries(entry).filter(([key]) => /^position\d+$/i.test(key));
        examShapes.push({
          keys: Object.keys(entry).sort(),
          duration: isRecord(duration) ? Object.fromEntries(Object.entries(duration).map(([key, field]) => [key, typeof field])) : typeof duration,
          positions: positions.map(([key, position]) => ({
            key,
            shape: (Array.isArray(position) ? position : [position]).map((item) => {
              if (!isRecord(item)) {
                return { type: typeof item };
              }
              const current = item.current;
              const original = item.original;
              return {
                keys: Object.keys(item).sort(),
                current: isRecord(current) ? {
                  keys: Object.keys(current).sort(),
                  fieldTypes: Object.fromEntries(
                    Object.entries(current).map(([field, value2]) => [field, typeof value2])
                  )
                } : typeof current,
                original: isRecord(original) ? {
                  keys: Object.keys(original).sort(),
                  fieldTypes: Object.fromEntries(
                    Object.entries(original).map(([field, value2]) => [field, typeof value2])
                  )
                } : typeof original
              };
            })
          }))
        });
      }
    }
    shape.entryTypes = Object.fromEntries([...entryTypes.entries()].sort(([a], [b]) => a.localeCompare(b)));
    shape.examShapes = examShapes;
  }
  return JSON.stringify(shape);
}
function positiveSafeId(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function safeHeaderId(value) {
  const text = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  if (typeof text !== "string") {
    return void 0;
  }
  const unquoted = text.trim().replace(/^"(.*)"$/, "$1");
  return /^[A-Za-z0-9._:-]{1,128}$/.test(unquoted) ? unquoted : void 0;
}
function tenantIdFromCookie(header) {
  var _a;
  return safeHeaderId((_a = cookieValue(header, "Tenant-Id")) != null ? _a : cookieValue(header, "tenant-id"));
}
function parseParentExamContext(raw) {
  var _a, _b, _c;
  if (!isRecord(raw)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
  }
  if (raw.data !== void 0 && !isRecord(raw.data)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
  }
  const data = isRecord(raw.data) ? raw.data : raw;
  const user = data.user;
  if (!isRecord(user) || !Array.isArray(user.students)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
  }
  const students = [];
  for (const student of user.students) {
    const id = isRecord(student) ? positiveSafeId(student.id) : void 0;
    if (id === void 0) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
    }
    const name = isRecord(student) ? valueText((_c = (_b = (_a = student.displayName) != null ? _a : student.name) != null ? _b : student.longName) != null ? _c : student.shortName).trim() : "";
    students.push({ id, name });
  }
  const tenant = isRecord(data.tenant) ? data.tenant : void 0;
  const schoolYear = isRecord(data.currentSchoolYear) ? data.currentSchoolYear : void 0;
  return {
    students: [...new Map(students.map((student) => [student.id, student])).values()],
    tenantId: safeHeaderId(tenant == null ? void 0 : tenant.id),
    schoolYearId: positiveSafeId(schoolYear == null ? void 0 : schoolYear.id)
  };
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
function valueText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function extractMessageContent(value, depth = 0) {
  if (typeof value === "string") {
    return value;
  }
  if (depth > 4 || !isRecord(value)) {
    return "";
  }
  for (const key of ["content", "text", "body", "message", "messageContent", "messageText", "fullText"]) {
    if (typeof value[key] === "string" && value[key]) {
      return value[key];
    }
  }
  for (const key of ["data", "message", "result", "item"]) {
    const content = extractMessageContent(value[key], depth + 1);
    if (content) {
      return content;
    }
  }
  return "";
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
  return url.replace(/;jsessionid=[^?;]+/gi, ";jsessionid=<redacted>").replace(/([?&]studentId=)[^&]*/gi, "$1<redacted>");
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
  constructor(config, fetchImpl = fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS, onDiagnostic, abortSignal) {
    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.onDiagnostic = onDiagnostic;
    this.abortSignal = abortSignal;
    this.endpoint = getEndpoint(config.server, config.schoolName);
    this.schoolName = config.schoolName;
  }
  endpoint;
  schoolName;
  sessionCookie;
  messageSchoolCookie;
  authenticatedAt;
  requestSequence = 0;
  getRequestSignal() {
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    return this.abortSignal ? AbortSignal.any([timeoutSignal, this.abortSignal]) : timeoutSignal;
  }
  /**
   *
   */
  async authenticate(username, password) {
    var _a, _b, _c;
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
        signal: this.getRequestSignal()
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
      if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new import_WebUntisErrors.WebUntisError(
          ((_b = this.abortSignal) == null ? void 0 : _b.aborted) ? "ABORTED" : "TIMEOUT",
          ((_c = this.abortSignal) == null ? void 0 : _c.aborted) ? "WebUntis authentication was aborted" : "WebUntis authentication timed out"
        );
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
  async getUnreadMessages(session) {
    const token = await this.getRestToken(session);
    const payload = await this.restRequest("/api/rest/view/v1/messages", session, token, "getMessages");
    const inbox = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
    if (!isRecord(inbox) || !Array.isArray(inbox.incomingMessages)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis messages response");
    }
    const messages = inbox.incomingMessages.filter(
      (message) => isRecord(message) && typeof message.isMessageRead === "boolean" && (typeof message.id === "number" || typeof message.id === "string")
    );
    const result = [];
    for (let index = 0; index < messages.length; index += 4) {
      const batch = await Promise.all(
        messages.slice(index, index + 4).map(async (message) => {
          var _a;
          const preview = valueText(message.contentPreview);
          let content = preview;
          let contentIsPreview = true;
          if (message.isMessageRead === false) {
            try {
              const detail = await this.restRequest(
                `/api/rest/view/v1/messages/${encodeURIComponent(String(message.id))}`,
                session,
                token,
                "getMessage"
              );
              const fullContent = extractMessageContent(detail);
              if (fullContent) {
                content = fullContent;
                contentIsPreview = false;
              }
            } catch (error) {
              if (error instanceof import_WebUntisErrors.WebUntisError && error.code === "SESSION_EXPIRED") {
                throw error;
              }
            }
          }
          const sender = isRecord(message.sender) ? valueText(message.sender.displayName) : valueText(message.sender);
          return {
            id: message.id,
            readInWebUntis: message.isMessageRead === true,
            dateTime: valueText((_a = message.sentDateTime) != null ? _a : message.dateTime),
            sender,
            subject: valueText(message.subject),
            content,
            contentIsPreview,
            hasAttachments: message.hasAttachments === true
          };
        })
      );
      result.push(...batch);
    }
    return result;
  }
  /** Load exams from the authenticated REST endpoint. */
  async getExams(session, startDate, endDate, klasseId = -1) {
    var _a, _b, _c, _d, _e;
    const url = new URL(this.restUrl("/api/exams"));
    url.searchParams.set("startDate", String(startDate));
    url.searchParams.set("endDate", String(endDate));
    url.searchParams.set("klasseId", String(klasseId));
    url.searchParams.set("withGrades", "false");
    if (session.personType === 5 && Number.isSafeInteger(session.personId) && session.personId > 0) {
      url.searchParams.set("studentId", String(session.personId));
    }
    try {
      let authContext = "cookie";
      let childScope = session.personType === 5 ? "self" : session.personType > 5 ? "unresolved" : "not-applicable";
      let linkedStudentCount;
      let contextLoaded = false;
      let tenantId = tenantIdFromCookie(this.sessionCookie);
      let schoolYearId;
      const request = async (options = {}) => {
        var _a2;
        const requestUrl = new URL(url.href);
        if (options.studentId) {
          requestUrl.searchParams.set("studentId", String(options.studentId));
        }
        const response2 = await this.fetchImpl(requestUrl, {
          method: "GET",
          signal: this.getRequestSignal(),
          headers: {
            accept: "application/json",
            cookie: this.restCookie(session),
            ...options.token ? { Authorization: `Bearer ${options.token}` } : {},
            ...tenantId ? { "Tenant-Id": tenantId } : {},
            ...schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}
          }
        });
        const cookie = mergeCookieHeader(this.sessionCookie, response2.headers);
        this.sessionCookie = cookie.value;
        const body = await response2.text();
        let payload2;
        try {
          payload2 = JSON.parse(body);
        } catch {
          payload2 = void 0;
        }
        (_a2 = this.onDiagnostic) == null ? void 0 : _a2.call(this, {
          method: "getExams",
          authContext,
          personType: session.personType,
          childScope,
          linkedStudentCount,
          contextLoaded,
          tenantIdPresent: Boolean(tenantId),
          schoolYearIdPresent: Boolean(schoolYearId),
          status: response2.status,
          contentType: response2.headers.get("content-type") || "",
          url: redactUrl(response2.url),
          redirected: response2.redirected,
          length: body.length,
          type: getResponseType(body, response2.headers.get("content-type") || ""),
          cookiePresent: Boolean(this.sessionCookie),
          cookieChanged: cookie.changed,
          sessionCookieChanged: cookie.sessionCookieChanged
        });
        return { response: response2, payload: payload2 };
      };
      let result = await request();
      if (result.response.status === 403) {
        const token = await this.getRestToken(session, "exams");
        authContext = "bearer";
        tenantId = (_a = tenantIdFromCookie(this.sessionCookie)) != null ? _a : tenantId;
        let studentId;
        if (session.personType === 12) {
          const context = await this.getParentExamContext(session, token, tenantId);
          contextLoaded = true;
          linkedStudentCount = context.students.length;
          tenantId = (_b = context.tenantId) != null ? _b : tenantId;
          schoolYearId = context.schoolYearId;
          if (linkedStudentCount === 0) {
            childScope = "unresolved";
            throw new import_WebUntisErrors.WebUntisError(
              "API_REQUEST",
              `WebUntis parent exam scope unresolved after app-data lookup (auth=bearer, personType=${session.personType}, childScope=unresolved, linkedStudents=0)`
            );
          }
          childScope = linkedStudentCount === 1 ? "unique" : "ambiguous";
          return this.loadLinkedStudentExams(
            session,
            context.students,
            token,
            startDate,
            endDate,
            tenantId,
            schoolYearId
          );
        }
        result = await request({ token, studentId });
        if (result.response.status === 403 && session.personType >= 5) {
          const scopedStudentId = session.personType === 5 ? session.personId : studentId;
          if (!scopedStudentId) {
            throw new import_WebUntisErrors.WebUntisError("API_REQUEST", "Student scope is unavailable for timetable exams");
          }
          return await this.getGuardianTimetableExams(
            session,
            token,
            startDate,
            endDate,
            scopedStudentId,
            "",
            tenantId,
            schoolYearId,
            linkedStudentCount
          );
        }
      }
      const { response, payload } = result;
      if (response.status === 401 || response.redirected || isRecord(payload) && isLoginPagePayload(payload)) {
        const retryDetails = authContext === "bearer" ? ` after REST token retry (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})` : "";
        throw new import_WebUntisErrors.WebUntisError(
          "SESSION_EXPIRED",
          `WebUntis session expired while loading exams${retryDetails}`
        );
      }
      if (!response.ok) {
        const retryDetails = authContext === "bearer" ? ` after REST token retry (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})` : ` (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})`;
        throw new import_WebUntisErrors.WebUntisError(
          "API_REQUEST",
          `WebUntis exams request failed (HTTP ${response.status})${retryDetails}`
        );
      }
      if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.exams)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exams response");
      }
      if (session.personType === 12) {
        const token = await this.getRestToken(session, "exams");
        const context = await this.getParentExamContext(session, token, tenantIdFromCookie(this.sessionCookie));
        if (context.students.length === 0) {
          throw new import_WebUntisErrors.WebUntisError("API_REQUEST", "WebUntis parent exam scope has no linked students");
        }
        return this.loadLinkedStudentExams(
          session,
          context.students,
          token,
          startDate,
          endDate,
          (_c = context.tenantId) != null ? _c : tenantIdFromCookie(this.sessionCookie),
          context.schoolYearId
        );
      }
      if (payload.data.exams.length === 0 && session.personType === 5 && Number.isSafeInteger(session.personId) && session.personId > 0) {
        const token = await this.getRestToken(session, "exams");
        const timetableExams = await this.getGuardianTimetableExams(
          session,
          token,
          startDate,
          endDate,
          session.personId,
          "",
          tenantIdFromCookie(this.sessionCookie),
          void 0,
          void 0
        );
        return [...payload.data.exams, ...timetableExams];
      }
      return payload.data.exams;
    } catch (error) {
      if (error instanceof import_WebUntisErrors.WebUntisError) {
        throw error;
      }
      if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new import_WebUntisErrors.WebUntisError(
          ((_d = this.abortSignal) == null ? void 0 : _d.aborted) ? "ABORTED" : "TIMEOUT",
          ((_e = this.abortSignal) == null ? void 0 : _e.aborted) ? "WebUntis exams request was aborted" : "WebUntis exams request timed out"
        );
      }
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", "WebUntis exams request failed", { cause: error });
    }
  }
  /**
   *
   */
  async getLinkedStudents(session) {
    const token = await this.getRestToken(session, "exams");
    const context = await this.getParentExamContext(session, token, tenantIdFromCookie(this.sessionCookie));
    if (context.students.length === 0) {
      throw new import_WebUntisErrors.WebUntisError("API_REQUEST", "WebUntis parent account has no linked students");
    }
    return context.students;
  }
  async loadLinkedStudentExams(session, students, token, startDate, endDate, tenantId, schoolYearId) {
    const childExams = await Promise.all(
      students.map(
        (student) => this.getGuardianTimetableExams(
          session,
          token,
          startDate,
          endDate,
          student.id,
          student.name,
          tenantId,
          schoolYearId,
          students.length
        )
      )
    );
    return childExams.flat();
  }
  async getGuardianTimetablePayload(session, token, startDate, endDate, studentId, tenantId, schoolYearId, linkedStudentCount) {
    const formatDate = (value) => `${String(Math.floor(value / 1e4)).padStart(4, "0")}-${String(Math.floor(value % 1e4 / 100)).padStart(2, "0")}-${String(value % 100).padStart(2, "0")}`;
    const url = new URL(this.restUrl("/api/rest/view/v1/timetable/entries"));
    url.search = new URLSearchParams({
      start: formatDate(startDate),
      end: formatDate(endDate),
      format: "4",
      resourceType: "STUDENT",
      resources: String(studentId),
      periodTypes: "",
      timetableType: "MY_TIMETABLE"
    }).toString();
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
        cookie: this.restCookie(session),
        ...tenantId ? { "Tenant-Id": tenantId } : {},
        ...schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}
      }
    });
    this.sessionCookie = mergeCookieHeader(this.sessionCookie, response.headers).value;
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = void 0;
    }
    if (response.status === 401 || response.redirected || isRecord(payload) && isLoginPagePayload(payload)) {
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired while loading child timetable");
    }
    if (!response.ok) {
      throw new import_WebUntisErrors.WebUntisError(
        "API_REQUEST",
        `WebUntis child timetable request failed (HTTP ${response.status}, linkedStudents=${linkedStudentCount})`
      );
    }
    return payload;
  }
  async getGuardianTimetableExams(session, token, startDate, endDate, studentId, studentName, tenantId, schoolYearId, linkedStudentCount) {
    var _a, _b;
    const dateString = (value) => {
      const year = Math.floor(value / 1e4);
      const month = Math.floor(value % 1e4 / 100);
      const day = value % 100;
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    const url = new URL(this.restUrl("/api/rest/view/v1/timetable/entries"));
    url.searchParams.set("start", dateString(startDate));
    url.searchParams.set("end", dateString(endDate));
    url.searchParams.set("format", "4");
    url.searchParams.set("resourceType", "STUDENT");
    url.searchParams.set("resources", String(studentId));
    url.searchParams.set("periodTypes", "");
    url.searchParams.set("timetableType", "MY_TIMETABLE");
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
        cookie: this.restCookie(session),
        ...tenantId ? { "Tenant-Id": tenantId } : {},
        ...schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = void 0;
    }
    const contentType = response.headers.get("content-type") || "";
    (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
      method: "getGuardianTimetableExams",
      authContext: "bearer",
      personType: session.personType,
      childScope: "unique",
      linkedStudentCount,
      contextLoaded: true,
      tenantIdPresent: Boolean(tenantId),
      schoolYearIdPresent: Boolean(schoolYearId),
      status: response.status,
      contentType,
      url: redactUrl(response.url || url.href),
      redirected: response.redirected,
      length: body.length,
      type: getResponseType(body, contentType),
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged
    });
    const context = `(auth=bearer, personType=${session.personType}, childScope=unique, linkedStudents=${linkedStudentCount != null ? linkedStudentCount : 0})`;
    if (response.status === 401 || response.redirected || isRecord(payload) && isLoginPagePayload(payload)) {
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", `WebUntis session expired while loading exams ${context}`);
    }
    if (!response.ok) {
      throw new import_WebUntisErrors.WebUntisError(
        "API_REQUEST",
        `WebUntis guardian exams request failed (HTTP ${response.status}) after modern guardian route ${context}`
      );
    }
    try {
      return (0, import_Exams.normalizeGuardianTimetableExams)(payload, studentId, studentName);
    } catch {
      (_b = this.onDiagnostic) == null ? void 0 : _b.call(this, {
        method: "getGuardianTimetableExamsResponseShape",
        status: response.status,
        contentType,
        url: redactUrl(response.url || url.href),
        redirected: response.redirected,
        length: body.length,
        type: getResponseType(body, contentType),
        responseShape: payload === void 0 ? "invalid-json" : guardianTimetableResponseShape(payload)
      });
      throw new import_WebUntisErrors.WebUntisError(
        "INVALID_RESPONSE",
        `Invalid WebUntis guardian exams response after modern guardian route ${context}`
      );
    }
  }
  examScopeDetails(authContext, session, childScope, linkedStudentCount) {
    return `auth=${authContext}, personType=${session.personType}, childScope=${childScope}${linkedStudentCount === void 0 ? "" : `, linkedStudents=${linkedStudentCount}`}`;
  }
  restUrl(path) {
    return this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, path);
  }
  restCookie(session, schoolNameCookie) {
    var _a;
    const cookies = /* @__PURE__ */ new Map();
    for (const cookie of (this.sessionCookie || "").split(/;\s*/)) {
      const separator = cookie.indexOf("=");
      if (separator > 0) {
        cookies.set(cookie.slice(0, separator), cookie);
      }
    }
    cookies.set("JSESSIONID", `JSESSIONID=${session.sessionId}`);
    const schoolCookie = (_a = schoolNameCookie != null ? schoolNameCookie : this.messageSchoolCookie) != null ? _a : `_${Buffer.from(this.schoolName).toString("base64")}`;
    cookies.set("schoolname", `schoolname=${schoolCookie}`);
    return [...cookies.values()].join("; ");
  }
  async getRestToken(session, context = "message") {
    var _a;
    const url = this.restUrl("/api/token/new");
    const schoolCookies = [.../* @__PURE__ */ new Set([`_${Buffer.from(this.schoolName).toString("base64")}`, this.schoolName])];
    for (let index = 0; index < schoolCookies.length; index++) {
      const schoolCookie = schoolCookies[index];
      const response = await this.fetchImpl(url, {
        method: "GET",
        signal: this.getRequestSignal(),
        headers: {
          accept: "application/json",
          cookie: this.restCookie(session, schoolCookie),
          ...context === "exams" && tenantIdFromCookie(this.sessionCookie) ? { "Tenant-Id": tenantIdFromCookie(this.sessionCookie) } : {}
        }
      });
      const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
      this.sessionCookie = cookie.value;
      const body = await response.text();
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
        method: context === "exams" ? "getExamsToken" : "getMessageToken",
        ...context === "exams" ? {
          authContext: "bearer",
          personType: session.personType,
          childScope: session.personType === 5 ? "self" : "unresolved",
          tenantIdPresent: Boolean(tenantIdFromCookie(this.sessionCookie))
        } : {},
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        url: redactUrl(response.url),
        redirected: response.redirected,
        length: body.length,
        type: getResponseType(body, response.headers.get("content-type") || ""),
        cookiePresent: Boolean(this.sessionCookie),
        cookieChanged: cookie.changed,
        sessionCookieChanged: cookie.sessionCookieChanged,
        schoolCookieFormat: index === 0 ? "base64" : "plain"
      });
      if (!response.ok || response.redirected) {
        const responseDetail = response.redirected ? "redirected" : `HTTP ${response.status}`;
        const error = new import_WebUntisErrors.WebUntisError(
          response.status === 401 || response.redirected ? "SESSION_EXPIRED" : "API_REQUEST",
          `WebUntis ${context} authentication failed (${responseDetail})`
        );
        if (error.code === "SESSION_EXPIRED" || response.status !== 406 || index === schoolCookies.length - 1) {
          throw error;
        }
        continue;
      }
      let token = body.trim();
      if (token.startsWith('"') && token.endsWith('"')) {
        try {
          const parsed = JSON.parse(token);
          if (typeof parsed !== "string") {
            throw new Error("Token is not a string");
          }
          token = parsed;
        } catch {
          throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${context} token response`);
        }
      }
      if (!token || token.startsWith("<")) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${context} token response`);
      }
      this.messageSchoolCookie = schoolCookie;
      return token;
    }
    throw new import_WebUntisErrors.WebUntisError("API_REQUEST", `WebUntis ${context} authentication failed`);
  }
  async getParentExamContext(session, token, tenantId) {
    var _a, _b, _c, _d, _e;
    const url = this.restUrl("/api/rest/view/v1/app/data");
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
        cookie: this.restCookie(session),
        ...tenantId ? { "Tenant-Id": tenantId } : {}
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = void 0;
    }
    const diagnosticBase = {
      method: "getExamContext",
      authContext: "bearer",
      personType: session.personType,
      childScope: "unresolved",
      tenantIdPresent: Boolean(tenantId),
      contextLoaded: false,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      url: redactUrl(response.url),
      redirected: response.redirected,
      length: body.length,
      type: getResponseType(body, response.headers.get("content-type") || ""),
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged
    };
    if (response.status === 401 || response.redirected || isRecord(payload) && isLoginPagePayload(payload)) {
      (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, diagnosticBase);
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis parent exam context session expired");
    }
    if (!response.ok) {
      (_b = this.onDiagnostic) == null ? void 0 : _b.call(this, diagnosticBase);
      throw new import_WebUntisErrors.WebUntisError(
        "API_REQUEST",
        `WebUntis parent exam context request failed (HTTP ${response.status}, auth=bearer, personType=${session.personType}, childScope=unresolved)`
      );
    }
    let context;
    try {
      context = parseParentExamContext(payload);
    } catch {
      (_c = this.onDiagnostic) == null ? void 0 : _c.call(this, diagnosticBase);
      throw new import_WebUntisErrors.WebUntisError(
        "INVALID_RESPONSE",
        `Invalid WebUntis parent exam context response (auth=bearer, personType=${session.personType}, childScope=unresolved)`
      );
    }
    const childScope = context.students.length === 1 ? "unique" : context.students.length > 1 ? "ambiguous" : "unresolved";
    (_e = this.onDiagnostic) == null ? void 0 : _e.call(this, {
      ...diagnosticBase,
      childScope,
      linkedStudentCount: context.students.length,
      tenantIdPresent: Boolean((_d = context.tenantId) != null ? _d : tenantId),
      schoolYearIdPresent: Boolean(context.schoolYearId),
      contextLoaded: true
    });
    return context;
  }
  async restRequest(path, session, token, method) {
    var _a;
    const url = this.restUrl(path);
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
        cookie: this.restCookie(session)
      }
    });
    const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
    this.sessionCookie = cookie.value;
    const body = await response.text();
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      payload = void 0;
    }
    (_a = this.onDiagnostic) == null ? void 0 : _a.call(this, {
      method,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      url: redactUrl(response.url),
      redirected: response.redirected,
      length: body.length,
      type: getResponseType(body, response.headers.get("content-type") || ""),
      cookiePresent: Boolean(this.sessionCookie),
      cookieChanged: cookie.changed,
      sessionCookieChanged: cookie.sessionCookieChanged,
      resultKeys: isRecord(payload) ? Object.keys(payload) : void 0
    });
    if (response.status === 401 || response.redirected || isRecord(payload) && isLoginPagePayload(payload)) {
      throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired while loading messages");
    }
    if (!response.ok) {
      throw new import_WebUntisErrors.WebUntisError("API_REQUEST", `WebUntis ${method} request failed (HTTP ${response.status})`);
    }
    if (payload === void 0) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${method} response`);
    }
    return payload;
  }
  /**
   *
   */
  async getClassId(session) {
    var _a, _b;
    const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/daytimetable/config");
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
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
    url.searchParams.set("date", localDateString(date));
    url.searchParams.set("formatId", "1");
    const response = await this.fetchImpl(url, {
      method: "GET",
      signal: this.getRequestSignal(),
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
      signal: this.getRequestSignal(),
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
    var _a, _b, _c;
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
        signal: this.getRequestSignal()
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
        if (payload.error.code === -7001 || payload.error.code === -8520) {
          throw new import_WebUntisErrors.WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
        }
        const details = [
          typeof payload.error.code === "number" || typeof payload.error.code === "string" ? `code ${payload.error.code}` : "",
          typeof payload.error.message === "string" ? payload.error.message.slice(0, 120) : ""
        ].filter(Boolean);
        throw new import_WebUntisErrors.WebUntisError(
          "UNEXPECTED_RESPONSE",
          `WebUntis timetable request failed${details.length ? ` (${details.join(": ")})` : ""}`
        );
      }
      if (!isPeriodList(payload.result)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
      }
      return payload.result;
    } catch (error) {
      if (error instanceof import_WebUntisErrors.WebUntisError) {
        throw error;
      }
      if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new import_WebUntisErrors.WebUntisError(
          ((_b = this.abortSignal) == null ? void 0 : _b.aborted) ? "ABORTED" : "TIMEOUT",
          ((_c = this.abortSignal) == null ? void 0 : _c.aborted) ? "WebUntis timetable request was aborted" : "WebUntis timetable request timed out"
        );
      }
      throw new import_WebUntisErrors.WebUntisError("SERVER_UNREACHABLE", "WebUntis timetable request failed", { cause: error });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebUntisClient,
  localDateString
});
//# sourceMappingURL=WebUntisClient.js.map
