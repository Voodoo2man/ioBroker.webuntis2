"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_WebUntisService = require("./lib/webuntis/WebUntisService");
var import_LegacyNamespaceCleanup = require("./lib/LegacyNamespaceCleanup");
var import_WebUntisErrors = require("./lib/webuntis/WebUntisErrors");
var import_Timetable = require("./lib/webuntis/Timetable");
var import_CurrentNextLesson = require("./lib/webuntis/CurrentNextLesson");
const TIMETABLE_INTERVAL_MS = 5 * 60 * 1e3;
const CURRENT_NEXT_INTERVAL_MS = 60 * 1e3;
const TIMETABLE_GROUPS = ["today", "tomorrow", "week"];
const SUMMARY_STATE_DEFINITIONS = {
  hasSchool: { type: "boolean", role: "indicator", name: "Has school", def: false },
  lessonCount: { type: "number", role: "value", name: "Lesson count", def: 0 },
  lessonDurationMinutes: { type: "number", role: "value", name: "Lesson duration in minutes", def: 0 },
  schoolStart: { type: "string", role: "value.time", name: "School start", def: "" },
  schoolEnd: { type: "string", role: "value.time", name: "School end", def: "" },
  subjects: { type: "string", role: "text", name: "Subjects", def: "" },
  subjectCount: { type: "number", role: "value", name: "Subject count", def: 0 },
  firstSubject: { type: "string", role: "text", name: "First subject", def: "" },
  lastSubject: { type: "string", role: "text", name: "Last subject", def: "" },
  hasChanges: { type: "boolean", role: "indicator", name: "Has changes", def: false },
  changeCount: { type: "number", role: "value", name: "Change count", def: 0 },
  cancellationCount: { type: "number", role: "value", name: "Cancellation count", def: 0 }
};
const LESSON_STATE_NAMES = {
  date: "Date",
  startTime: "Lesson start",
  endTime: "Lesson end",
  subject: "Subject",
  subjectLong: "Subject name",
  teacher: "Teacher",
  room: "Room",
  class: "Class",
  lessonId: "WebUntis lesson ID",
  periodId: "WebUntis period ID",
  status: "Lesson status",
  changed: "Lesson changed",
  cancelled: "Lesson cancelled",
  substitution: "Substitution",
  originalTeacher: "Original teacher",
  originalRoom: "Original room",
  originalSubject: "Original subject"
};
const CURRENT_NEXT_STATE_DEFINITIONS = {
  currentLesson: { type: "string", role: "text", name: "Current lesson", def: "" },
  currentSubject: { type: "string", role: "text", name: "Current subject", def: "" },
  currentRoom: { type: "string", role: "text", name: "Current room", def: "" },
  currentTeacher: { type: "string", role: "text", name: "Current teacher", def: "" },
  nextLesson: { type: "string", role: "text", name: "Next lesson", def: "" },
  nextSubject: { type: "string", role: "text", name: "Next subject", def: "" },
  nextRoom: { type: "string", role: "text", name: "Next room", def: "" },
  nextTeacher: { type: "string", role: "text", name: "Next teacher", def: "" },
  nextLessonStart: { type: "string", role: "value.time", name: "Next lesson start", def: "" },
  minutesUntilNextLesson: {
    type: "number",
    role: "value.interval",
    name: "Minutes until next lesson",
    def: 0,
    unit: "min"
  },
  schoolRunning: { type: "boolean", role: "indicator", name: "School running", def: false },
  minutesUntilSchoolEnd: {
    type: "number",
    role: "value.interval",
    name: "Minutes until school end",
    def: 0,
    unit: "min"
  }
};
class WebuntisNext extends utils.Adapter {
  webUntis;
  timetableTimer;
  currentNextTimer;
  todayLessons = [];
  constructor(options = {}) {
    super({ ...options, name: "webuntis2" });
    this.webUntis = new import_WebUntisService.WebUntisService(
      this.logHttpDiagnostic.bind(this),
      (message) => this.log.info(message),
      (message) => this.log.warn(message),
      fetch,
      (message) => this.log.debug(message)
    );
    this.on("ready", this.onReady.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  logHttpDiagnostic(diagnostic) {
    this.log.debug(`WebUntis ${diagnostic.method || "request"} HTTP ${JSON.stringify(diagnostic)}`);
  }
  async onReady() {
    await this.setState("info.connection", false, true);
    if (!this.hasConnectionConfig()) {
      return;
    }
    await this.updateTimetable();
    this.timetableTimer = this.setInterval(() => void this.updateTimetable(), TIMETABLE_INTERVAL_MS);
    this.currentNextTimer = this.setInterval(() => void this.updateCurrentNextStates(), CURRENT_NEXT_INTERVAL_MS);
  }
  hasConnectionConfig() {
    return Boolean(
      this.config.server && this.config.schoolName && typeof this.config.schoolId === "number" && this.config.username && this.config.password
    );
  }
  async updateTimetable() {
    await this.setState("info.lastUpdate", (/* @__PURE__ */ new Date()).toISOString(), true);
    try {
      await (0, import_LegacyNamespaceCleanup.cleanupLegacyNamespace)(this, "messages");
      await this.ensureTimetableRoot();
      await this.ensureHolidaysRoot();
      await this.cleanupObsoleteStructure();
      const now = /* @__PURE__ */ new Date();
      const data = await this.webUntis.loadTimetable(this.config, now);
      this.todayLessons = data.today;
      let updated = 0;
      let removed = 0;
      for (const group of TIMETABLE_GROUPS) {
        const result = await this.writeTimetableGroup(group, data[group], now);
        updated += result.updated;
        removed += result.removed;
      }
      if (data.holidays) {
        await this.writeHolidaySummary(data.holidays);
      } else {
        this.log.warn("WebUntis holidays are not available; previous holiday values were preserved");
      }
      await this.setState("info.lastSuccessfulUpdate", now.toISOString(), true);
      await this.setState("info.nextUpdate", new Date(now.getTime() + TIMETABLE_INTERVAL_MS).toISOString(), true);
      await this.setState("info.connection", true, true);
      this.log.warn(`Timetable updated: ${updated} lessons updated, ${removed} obsolete lessons removed`);
    } catch (error) {
      await this.setState("info.connection", false, true);
      await this.setState("info.nextUpdate", new Date(Date.now() + TIMETABLE_INTERVAL_MS).toISOString(), true);
      const code = error instanceof import_WebUntisErrors.WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
      const detail = error instanceof Error ? ` (${error.message})` : "";
      this.log.warn(`Timetable update failed: ${code}${detail}; existing timetable data was kept`);
    }
  }
  async ensureTimetableRoot() {
    await this.setObjectNotExistsAsync("timetable", {
      type: "channel",
      common: { name: "Timetable" },
      native: {}
    });
  }
  async ensureHolidaysRoot() {
    await this.setObjectNotExistsAsync("holidays", {
      type: "channel",
      common: { name: "Holidays" },
      native: {}
    });
    await this.setObjectNotExistsAsync("holidays.current", {
      type: "channel",
      common: { name: "Current holiday" },
      native: {}
    });
    await this.setObjectNotExistsAsync("holidays.next", {
      type: "channel",
      common: { name: "Next holiday" },
      native: {}
    });
  }
  async writeHolidaySummary(summary) {
    await this.writeSimpleState(
      "holidays.current.active",
      summary.current.active,
      "Active",
      "boolean",
      "indicator",
      false
    );
    await this.writeSimpleState("holidays.current.name", summary.current.name, "Name", "string", "text", "");
    await this.writeSimpleState(
      "holidays.current.longName",
      summary.current.longName,
      "Long name",
      "string",
      "text",
      ""
    );
    await this.writeSimpleState(
      "holidays.current.startDate",
      summary.current.startDate,
      "Start date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState(
      "holidays.current.endDate",
      summary.current.endDate,
      "End date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState("holidays.next.name", summary.next.name, "Name", "string", "text", "");
    await this.writeSimpleState("holidays.next.longName", summary.next.longName, "Long name", "string", "text", "");
    await this.writeSimpleState(
      "holidays.next.startDate",
      summary.next.startDate,
      "Start date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState("holidays.next.endDate", summary.next.endDate, "End date", "string", "date", "");
    await this.writeSimpleState(
      "holidays.next.daysUntil",
      summary.next.daysUntil,
      "Days until",
      "number",
      "value",
      0
    );
  }
  async writeDaySummary(path, summary) {
    for (const [name, definition] of Object.entries(SUMMARY_STATE_DEFINITIONS)) {
      if (name === "lessonCount") {
        continue;
      }
      await this.setObjectNotExistsAsync(`timetable.${path}.${name}`, {
        type: "state",
        common: {
          name: definition.name,
          type: definition.type,
          role: definition.role,
          read: true,
          write: false,
          def: definition.def
        },
        native: {}
      });
      await this.setStateAsync(`timetable.${path}.${name}`, summary[name], true);
    }
  }
  async writeCurrentNextSummary(lessons, now) {
    const summary = (0, import_CurrentNextLesson.deriveCurrentNextLesson)(lessons, now);
    for (const [name, definition] of Object.entries(CURRENT_NEXT_STATE_DEFINITIONS)) {
      await this.setObjectNotExistsAsync(`timetable.today.${name}`, {
        type: "state",
        common: {
          name: definition.name,
          type: definition.type,
          role: definition.role,
          read: true,
          write: false,
          def: definition.def,
          ...definition.unit ? { unit: definition.unit } : {}
        },
        native: {}
      });
      await this.setStateAsync(`timetable.today.${name}`, summary[name], true);
    }
  }
  async updateCurrentNextStates() {
    await this.writeCurrentNextSummary(this.todayLessons, /* @__PURE__ */ new Date());
  }
  async cleanupObsoleteStructure() {
    for (const id of [
      "info.timetable",
      "timetable.timetable",
      "timetable.today.count",
      "timetable.tomorrow.count",
      "timetable.today.subjectsJson",
      "timetable.tomorrow.subjectsJson"
    ]) {
      if (await this.getObjectAsync(id)) {
        await this.delObjectAsync(id, { recursive: true });
      }
    }
  }
  async writeTimetableGroup(group, lessons, now) {
    await this.setObjectNotExistsAsync(`timetable.${group}`, {
      type: "channel",
      common: { name: `Timetable ${group}` },
      native: {}
    });
    let removed = await this.removeLegacyLessons(group);
    if (group === "week") {
      const weekdayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const byDay = weekdayNames.map(
        (_, index) => lessons.filter((lesson) => {
          const date = /* @__PURE__ */ new Date(`${lesson.date}T12:00:00`);
          return (date.getDay() + 6) % 7 === index;
        })
      );
      for (let index = 0; index < weekdayNames.length; index++) {
        const result = await this.writeTimetableDay(
          `timetable.week.${weekdayNames[index]}`,
          byDay[index],
          this.timetableDate(this.getMonday(now, index))
        );
        removed += result.removed;
      }
    } else {
      const day = new Date(now);
      if (group === "tomorrow") {
        day.setDate(day.getDate() + 1);
      }
      const result = await this.writeTimetableDay(`timetable.${group}`, lessons, this.timetableDate(day));
      await this.writeDaySummary(group, (0, import_Timetable.summarizeTimetable)(lessons));
      if (group === "today") {
        await this.writeCurrentNextSummary(lessons, now);
      }
      removed += result.removed;
    }
    return { updated: lessons.length, removed };
  }
  async removeLegacyLessons(group) {
    const existing = await this.getObjectListAsync({
      startkey: `${this.namespace}.timetable.${group}.`,
      endkey: `${this.namespace}.timetable.${group}.\uFFFF`
    });
    const legacy = /* @__PURE__ */ new Set();
    for (const object of existing.rows || []) {
      const first = object.id.replace(`${this.namespace}.timetable.${group}.`, "").split(".")[0];
      if (first.startsWith("period-")) {
        legacy.add(first);
      }
    }
    for (const id of legacy) {
      await this.delObjectAsync(`timetable.${group}.${id}`, { recursive: true });
    }
    return legacy.size;
  }
  async writeTimetableDay(path, lessons, date) {
    await this.setObjectNotExistsAsync(path, {
      type: "channel",
      common: { name: path.split(".").at(-1) || "Day" },
      native: {}
    });
    await this.writeSimpleState(`${path}.date`, date, "Date", "string", "date", "");
    await this.writeSimpleState(`${path}.lessonCount`, lessons.length, "Lesson count", "number", "value", 0);
    await this.setObjectNotExistsAsync(`${path}.lessons`, {
      type: "channel",
      common: { name: "Lessons" },
      native: {}
    });
    const expected = new Set(lessons.map((_lesson, index) => String(index + 1).padStart(2, "0")));
    const existing = await this.getObjectListAsync({
      startkey: `${this.namespace}.${path}.lessons.`,
      endkey: `${this.namespace}.${path}.lessons.\uFFFF`
    });
    const stale = /* @__PURE__ */ new Set();
    for (const object of existing.rows || []) {
      const slot = object.id.replace(`${this.namespace}.${path}.lessons.`, "").split(".")[0];
      if (slot && !expected.has(slot)) {
        stale.add(slot);
      }
    }
    for (const slot of stale) {
      await this.delObjectAsync(`${path}.lessons.${slot}`, { recursive: true });
    }
    for (const [index, lesson] of lessons.entries()) {
      await this.writeLesson(path, String(index + 1).padStart(2, "0"), lesson);
    }
    return { removed: stale.size };
  }
  getMonday(date, dayOffset) {
    const monday = new Date(date);
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + dayOffset);
    return monday;
  }
  timetableDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  async writeSimpleState(id, value, name, type, role, def) {
    await this.setObjectNotExistsAsync(id, {
      type: "state",
      common: { name, type, role, read: true, write: false, def },
      native: {}
    });
    await this.setStateAsync(id, value, true);
  }
  async writeLesson(path, slot, lesson) {
    const base = `${path}.lessons.${slot}`;
    const label = (0, import_Timetable.lessonChannelName)(lesson);
    await this.setObjectNotExistsAsync(base, {
      type: "channel",
      common: { name: label || `Lesson ${slot}` },
      native: {}
    });
    await this.extendObjectAsync(base, { common: { name: label || `Lesson ${slot}` } });
    const values = {
      date: { value: lesson.date, type: "string", role: "date" },
      startTime: { value: lesson.startTime, type: "string", role: "value.time" },
      endTime: { value: lesson.endTime, type: "string", role: "value.time" },
      subject: { value: lesson.subject, type: "string", role: "text" },
      subjectLong: { value: lesson.subjectLong, type: "string", role: "text" },
      teacher: { value: lesson.teacher, type: "string", role: "text" },
      room: { value: lesson.room, type: "string", role: "text" },
      class: { value: lesson.class, type: "string", role: "text" },
      ...lesson.lessonId === null ? {} : { lessonId: { value: String(lesson.lessonId), type: "string", role: "value" } },
      ...lesson.periodId === null ? {} : { periodId: { value: String(lesson.periodId), type: "string", role: "value" } },
      status: { value: lesson.status, type: "string", role: "text" },
      changed: { value: lesson.changed, type: "boolean", role: "indicator" },
      cancelled: { value: lesson.cancelled, type: "boolean", role: "indicator" },
      ...lesson.substitution ? { substitution: { value: lesson.substitution, type: "string", role: "text" } } : {},
      ...lesson.originalTeacher && lesson.originalTeacher !== lesson.teacher ? { originalTeacher: { value: lesson.originalTeacher, type: "string", role: "text" } } : {},
      ...lesson.originalRoom && lesson.originalRoom !== lesson.room ? { originalRoom: { value: lesson.originalRoom, type: "string", role: "text" } } : {},
      ...lesson.originalSubject && lesson.originalSubject !== lesson.subject ? { originalSubject: { value: lesson.originalSubject, type: "string", role: "text" } } : {}
    };
    const optional = ["substitution", "originalTeacher", "originalRoom", "originalSubject"];
    for (const name of optional) {
      if (!(name in values) && await this.getObjectAsync(`${base}.${name}`)) {
        await this.delObjectAsync(`${base}.${name}`);
      }
    }
    for (const [name, item] of Object.entries(values)) {
      await this.setObjectNotExistsAsync(`${base}.${name}`, {
        type: "state",
        common: {
          name: LESSON_STATE_NAMES[name] || name,
          type: item.type,
          role: item.role,
          read: true,
          write: false,
          def: item.value
        },
        native: {}
      });
      await this.extendObjectAsync(`${base}.${name}`, { common: { name: LESSON_STATE_NAMES[name] || name } });
      await this.setStateAsync(`${base}.${name}`, item.value, true);
    }
  }
  async onMessage(obj) {
    if (!obj || !obj.command || !obj.callback) {
      return;
    }
    try {
      if (obj.command === "searchSchools") {
        const results = await this.webUntis.searchSchools(this.getStringPayload(obj.message, "query"));
        this.log.info(`School search returned ${results.length} results`);
        this.sendTo(obj.from, obj.command, { ok: true, results }, obj.callback);
        return;
      }
      if (obj.command === "testConnection") {
        const result = await this.webUntis.testConnection(this.getConnectionPayload(obj.message));
        await this.setState("info.connection", result.ok, true);
        if (result.ok) {
          this.log.info("WebUntis authentication successful");
        } else {
          this.log.warn(`WebUntis authentication failed: ${result.code}`);
        }
        this.sendTo(obj.from, obj.command, result, obj.callback);
      }
    } catch (error) {
      const code = error instanceof import_WebUntisErrors.WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
      this.log.warn(`WebUntis request failed: ${code}`);
      this.sendTo(obj.from, obj.command, { ok: false, code }, obj.callback);
    }
  }
  getStringPayload(message, key) {
    if (typeof message !== "object" || message === null || typeof message[key] !== "string") {
      throw new import_WebUntisErrors.WebUntisError("INVALID_CONFIG", "Invalid message payload");
    }
    return message[key];
  }
  getConnectionPayload(message) {
    if (typeof message !== "object" || message === null) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_CONFIG", "Invalid connection payload");
    }
    const value = message;
    const stringValue = (key) => typeof value[key] === "string" ? value[key] : "";
    return {
      server: stringValue("server"),
      schoolName: stringValue("schoolName"),
      schoolDisplayName: stringValue("schoolDisplayName"),
      schoolAddress: stringValue("schoolAddress"),
      schoolId: typeof value.schoolId === "number" ? value.schoolId : null,
      username: stringValue("username"),
      password: stringValue("password")
    };
  }
  onUnload(callback) {
    if (this.timetableTimer) {
      this.clearInterval(this.timetableTimer);
    }
    if (this.currentNextTimer) {
      this.clearInterval(this.currentNextTimer);
    }
    callback();
  }
}
if (require.main !== module) {
  module.exports = (options) => new WebuntisNext(options);
} else {
  (() => new WebuntisNext())();
}
//# sourceMappingURL=main.js.map
