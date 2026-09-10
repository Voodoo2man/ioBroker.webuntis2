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
var WebUntisService_exports = {};
__export(WebUntisService_exports, {
  WebUntisError: () => import_WebUntisErrors.WebUntisError,
  WebUntisService: () => WebUntisService
});
module.exports = __toCommonJS(WebUntisService_exports);
var import_SchoolDiscovery = require("./SchoolDiscovery");
var import_Holidays = require("./Holidays");
var import_WebUntisClient = require("./WebUntisClient");
var import_WebUntisErrors = require("./WebUntisErrors");
var import_Timetable = require("./Timetable");
const MASTERDATA_TTL_MS = 6 * 60 * 60 * 1e3;
class WebUntisService {
  constructor(onDiagnostic, onInfo, onWarning, fetchImpl = fetch) {
    this.onDiagnostic = onDiagnostic;
    this.onInfo = onInfo;
    this.onWarning = onWarning;
    this.fetchImpl = fetchImpl;
  }
  holidayCache = new import_Holidays.HolidayCache();
  sessionClient;
  session;
  sessionKey;
  sessionLoading;
  masterDataCache;
  /**
   *
   */
  searchSchools(query) {
    return (0, import_SchoolDiscovery.searchSchools)(query);
  }
  async loadTimetable(config, now = /* @__PURE__ */ new Date()) {
    if (!config.server || !config.schoolName || config.schoolId === null) {
      throw new import_WebUntisErrors.WebUntisError("SCHOOL_NOT_SELECTED", "School selection is missing");
    }
    if (!config.username.trim()) {
      throw new import_WebUntisErrors.WebUntisError("USERNAME_REQUIRED", "Username is missing");
    }
    if (!config.password) {
      throw new import_WebUntisErrors.WebUntisError("PASSWORD_REQUIRED", "Password is missing");
    }
    try {
      return await this.loadTimetableWithSession(config, now);
    } catch (error) {
      if (!(error instanceof import_WebUntisErrors.WebUntisError) || error.code !== "SESSION_EXPIRED") {
        throw error;
      }
      this.sessionClient = void 0;
      this.session = void 0;
      this.sessionKey = void 0;
      return this.loadTimetableWithSession(config, now);
    }
  }
  async loadTimetableWithSession(config, now) {
    const { client, session } = await this.getSession(config);
    let holidayEntries = null;
    try {
      holidayEntries = await this.holidayCache.get(now, async () => {
        var _a;
        const entries = await client.getHolidays(session);
        (_a = this.onInfo) == null ? void 0 : _a.call(this, `Holidays loaded: ${entries.length} entries`);
        return entries;
      });
    } catch (error) {
      if (error instanceof import_WebUntisErrors.WebUntisError && error.code === "SESSION_EXPIRED") {
        throw error;
      }
    }
    const holidays = holidayEntries ? (0, import_Holidays.summarizeHolidays)(holidayEntries, now) : null;
    const range = (0, import_Timetable.weekRange)(now);
    const classId = session.personType >= 1 && session.personType <= 5 ? null : await client.getClassId(session);
    const supportedPerson = session.personType >= 1 && session.personType <= 5 ? null : await client.getSupportedPerson(session);
    const element = session.personType >= 1 && session.personType <= 5 ? { id: session.personId, type: session.personType } : supportedPerson ? supportedPerson : (classId != null ? classId : session.klasseId) > 0 ? { id: classId != null ? classId : session.klasseId, type: 1 } : null;
    if (!element) {
      const periods2 = await client.getPublicTimetable(session, now);
      return { ...(0, import_Timetable.splitTimetable)((0, import_Timetable.normalizeLessons)(periods2), now), holidays };
    }
    const periods = await client.getTimetable(session, {
      ...range,
      element,
      onlyBaseTimetable: false,
      showBooking: true,
      showInfo: true,
      showSubstText: true,
      showLsText: true,
      showLsNumber: true,
      showStudentgroup: true
    });
    const { subjects, teachers, rooms, klassen } = await this.getMasterData(
      client,
      session,
      this.configKey(config),
      now
    );
    return {
      ...(0, import_Timetable.splitTimetable)(
        (0, import_Timetable.normalizeLessons)((0, import_Timetable.resolveTimetableReferences)(periods, { subjects, teachers, rooms, klassen })),
        now
      ),
      holidays
    };
  }
  configKey(config) {
    return [config.server, config.schoolName, config.username, config.password].join("\0");
  }
  async getSession(config) {
    var _a;
    const key = this.configKey(config);
    if (this.sessionClient && this.session && this.sessionKey === key) {
      return { client: this.sessionClient, session: this.session };
    }
    if (((_a = this.sessionLoading) == null ? void 0 : _a.key) === key) {
      return this.sessionLoading.promise;
    }
    const client = new import_WebUntisClient.WebUntisClient(config, this.fetchImpl, void 0, this.onDiagnostic);
    const promise = client.authenticate(config.username, config.password).then((session) => {
      var _a2;
      this.sessionClient = client;
      this.session = session;
      this.sessionKey = key;
      (_a2 = this.onInfo) == null ? void 0 : _a2.call(this, "WebUntis login successful");
      return { client, session };
    });
    this.sessionLoading = { key, promise };
    void promise.then(
      () => {
        var _a2;
        if (((_a2 = this.sessionLoading) == null ? void 0 : _a2.promise) === promise) {
          this.sessionLoading = void 0;
        }
      },
      () => {
        var _a2;
        if (((_a2 = this.sessionLoading) == null ? void 0 : _a2.promise) === promise) {
          this.sessionLoading = void 0;
        }
      }
    );
    return promise;
  }
  async getMasterData(client, session, key, now) {
    const current = this.masterDataCache;
    if ((current == null ? void 0 : current.key) === key && current.fetchedAt > 0 && now.getTime() - current.fetchedAt < MASTERDATA_TTL_MS) {
      return current.data;
    }
    if ((current == null ? void 0 : current.key) === key && current.loading) {
      return current.loading;
    }
    const cache = {
      key,
      data: (current == null ? void 0 : current.key) === key ? current.data : { subjects: [], teachers: [], rooms: [], klassen: [] },
      fetchedAt: (current == null ? void 0 : current.key) === key ? current.fetchedAt : 0
    };
    this.masterDataCache = cache;
    const loading = this.refreshMasterData(client, session, cache, now);
    cache.loading = loading;
    void loading.then(
      () => {
        if (cache.loading === loading) {
          cache.loading = void 0;
        }
      },
      () => {
        if (cache.loading === loading) {
          cache.loading = void 0;
        }
      }
    );
    return loading;
  }
  async refreshMasterData(client, session, cache, now) {
    var _a, _b, _c;
    const results = await Promise.allSettled([
      client.getSubjects(session),
      client.getTeachers(session),
      client.getRooms(session),
      client.getKlassen(session)
    ]);
    const failed = results.some((result) => result.status === "rejected");
    if (failed && cache.fetchedAt > 0) {
      (_a = this.onWarning) == null ? void 0 : _a.call(this, "Master data refresh failed; existing master data is being reused");
      return cache.data;
    }
    const data = {
      subjects: results[0].status === "fulfilled" ? results[0].value : [],
      teachers: results[1].status === "fulfilled" ? results[1].value : [],
      rooms: results[2].status === "fulfilled" ? results[2].value : [],
      klassen: results[3].status === "fulfilled" ? results[3].value : []
    };
    cache.data = data;
    cache.fetchedAt = now.getTime();
    if (failed) {
      (_b = this.onWarning) == null ? void 0 : _b.call(this, "Some master data could not be loaded; unavailable lookups remain empty");
    } else {
      (_c = this.onInfo) == null ? void 0 : _c.call(
        this,
        `Master data loaded: ${data.subjects.length} subjects, ${data.teachers.length} teachers, ${data.rooms.length} rooms, ${data.klassen.length} classes`
      );
    }
    return data;
  }
  /**
   *
   */
  async testConnection(config) {
    if (!config.server || !config.schoolName || config.schoolId === null) {
      return { ok: false, code: "SCHOOL_NOT_SELECTED" };
    }
    if (!config.username.trim()) {
      return { ok: false, code: "USERNAME_REQUIRED" };
    }
    if (!config.password) {
      return { ok: false, code: "PASSWORD_REQUIRED" };
    }
    try {
      await new import_WebUntisClient.WebUntisClient(config, this.fetchImpl, void 0, this.onDiagnostic).authenticate(
        config.username,
        config.password
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, code: (0, import_WebUntisErrors.classifyWebUntisError)(error) };
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WebUntisError,
  WebUntisService
});
//# sourceMappingURL=WebUntisService.js.map
