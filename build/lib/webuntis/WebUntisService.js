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
class WebUntisService {
  constructor(onDiagnostic) {
    this.onDiagnostic = onDiagnostic;
  }
  holidayCache = new import_Holidays.HolidayCache();
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
    const client = new import_WebUntisClient.WebUntisClient(config, fetch, void 0, this.onDiagnostic);
    const session = await client.authenticate(config.username, config.password);
    let holidayEntries = null;
    try {
      holidayEntries = await this.holidayCache.get(now, () => client.getHolidays(session));
    } catch {
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
    const [subjects, teachers, rooms, klassen] = await Promise.all([
      client.getSubjects(session).catch(() => []),
      client.getTeachers(session).catch(() => []),
      client.getRooms(session).catch(() => []),
      client.getKlassen(session).catch(() => [])
    ]);
    return {
      ...(0, import_Timetable.splitTimetable)(
        (0, import_Timetable.normalizeLessons)((0, import_Timetable.resolveTimetableReferences)(periods, { subjects, teachers, rooms, klassen })),
        now
      ),
      holidays
    };
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
      await new import_WebUntisClient.WebUntisClient(config, fetch, void 0, this.onDiagnostic).authenticate(
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
