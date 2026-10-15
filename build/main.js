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
var import_LegacyNamespaceCleanup = require("./lib/LegacyNamespaceCleanup");
var import_StateWriter = require("./lib/StateWriter");
var import_LessonStateCleanup = require("./lib/LessonStateCleanup");
var import_ObjectTranslations = require("./lib/ObjectTranslations");
var import_CurrentNextLesson = require("./lib/webuntis/CurrentNextLesson");
var import_Timetable = require("./lib/webuntis/Timetable");
var import_WebUntisErrors = require("./lib/webuntis/WebUntisErrors");
var import_WebUntisService = require("./lib/webuntis/WebUntisService");
const TIMETABLE_INTERVAL_MS = 5 * 60 * 1e3;
const CURRENT_NEXT_INTERVAL_MS = 60 * 1e3;
const TIMETABLE_GROUPS = ["today", "tomorrow", "week"];
const SUMMARY_STATE_DEFINITIONS = {
  hasSchool: { type: "boolean", role: "indicator", name: (0, import_ObjectTranslations.translatedName)("hasSchool"), def: false },
  lessonCount: { type: "number", role: "value", name: (0, import_ObjectTranslations.translatedName)("lessonCount"), def: 0 },
  lessonDurationMinutes: {
    type: "number",
    role: "value",
    name: (0, import_ObjectTranslations.translatedName)("lessonDurationMinutes"),
    def: 0,
    unit: "min"
  },
  schoolStart: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("schoolStart"), def: "" },
  schoolEnd: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("schoolEnd"), def: "" },
  subjects: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("subjects"), def: "" },
  subjectCount: { type: "number", role: "value", name: (0, import_ObjectTranslations.translatedName)("subjectCount"), def: 0 },
  firstSubject: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("firstSubject"), def: "" },
  lastSubject: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("lastSubject"), def: "" },
  hasChanges: { type: "boolean", role: "indicator", name: (0, import_ObjectTranslations.translatedName)("hasChanges"), def: false },
  changeCount: { type: "number", role: "value", name: (0, import_ObjectTranslations.translatedName)("changeCount"), def: 0 },
  cancellationCount: { type: "number", role: "value", name: (0, import_ObjectTranslations.translatedName)("cancellationCount"), def: 0 }
};
const LESSON_STATE_NAMES = {
  date: (0, import_ObjectTranslations.translatedName)("date"),
  dateTimestamp: (0, import_ObjectTranslations.translatedName)("dateTimestamp"),
  startTime: (0, import_ObjectTranslations.translatedName)("startTime"),
  endTime: (0, import_ObjectTranslations.translatedName)("endTime"),
  subject: (0, import_ObjectTranslations.translatedName)("subject"),
  subjectLong: (0, import_ObjectTranslations.translatedName)("subjectLong"),
  teacher: (0, import_ObjectTranslations.translatedName)("teacher"),
  teacherLong: (0, import_ObjectTranslations.translatedName)("longName"),
  room: (0, import_ObjectTranslations.translatedName)("room"),
  roomLong: (0, import_ObjectTranslations.translatedName)("longName"),
  class: (0, import_ObjectTranslations.translatedName)("class"),
  classLong: (0, import_ObjectTranslations.translatedName)("longName"),
  lessonNumber: (0, import_ObjectTranslations.translatedName)("lessonNumber"),
  lessonId: (0, import_ObjectTranslations.translatedName)("lessonId"),
  periodId: (0, import_ObjectTranslations.translatedName)("periodId"),
  status: (0, import_ObjectTranslations.translatedName)("status"),
  changed: (0, import_ObjectTranslations.translatedName)("changed"),
  cancelled: (0, import_ObjectTranslations.translatedName)("cancelled"),
  substitution: (0, import_ObjectTranslations.translatedName)("substitution"),
  originalTeacher: (0, import_ObjectTranslations.translatedName)("originalTeacher"),
  originalTeacherLong: (0, import_ObjectTranslations.translatedName)("longName"),
  originalRoom: (0, import_ObjectTranslations.translatedName)("originalRoom"),
  originalRoomLong: (0, import_ObjectTranslations.translatedName)("longName"),
  originalSubject: (0, import_ObjectTranslations.translatedName)("originalSubject"),
  originalSubjectLong: (0, import_ObjectTranslations.translatedName)("longName")
};
const CURRENT_NEXT_STATE_DEFINITIONS = {
  currentLesson: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("currentLesson"), def: "" },
  currentSubject: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("currentSubject"), def: "" },
  currentRoom: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("currentRoom"), def: "" },
  currentRoomLong: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("longName"), def: "" },
  currentTeacher: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("currentTeacher"), def: "" },
  currentTeacherLong: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("longName"), def: "" },
  nextLesson: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("nextLesson"), def: "" },
  nextSubject: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("nextSubject"), def: "" },
  nextRoom: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("nextRoom"), def: "" },
  nextRoomLong: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("longName"), def: "" },
  nextTeacher: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("nextTeacher"), def: "" },
  nextTeacherLong: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("longName"), def: "" },
  nextLessonStart: { type: "string", role: "text", name: (0, import_ObjectTranslations.translatedName)("nextLessonStart"), def: "" },
  minutesUntilNextLesson: {
    type: "number",
    role: "value.timer",
    name: (0, import_ObjectTranslations.translatedName)("minutesUntilNextLesson"),
    def: 0,
    unit: "min"
  },
  schoolRunning: { type: "boolean", role: "indicator", name: (0, import_ObjectTranslations.translatedName)("schoolRunning"), def: false },
  minutesUntilSchoolEnd: {
    type: "number",
    role: "value.timer",
    name: (0, import_ObjectTranslations.translatedName)("minutesUntilSchoolEnd"),
    def: 0,
    unit: "min"
  }
};
function dateOnly(value) {
  return value.trim().split(/[T ]/, 1)[0] || "";
}
function numericDate(value) {
  const [year, month, day] = dateOnly(value).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day).getTime() : 0;
}
class WebuntisNext extends utils.Adapter {
  static generatedLessonNameKey = "webuntis2GeneratedName";
  webUntis;
  timetableTimer;
  currentNextTimer;
  todayLessons = [];
  hasTimetableSnapshot = false;
  unloaded = false;
  migratedNames = /* @__PURE__ */ new Set();
  lastMessageWarningAt = 0;
  async ensureTranslatedObject(id, object, legacyName, dynamicName = false) {
    var _a, _b, _c, _d;
    this.ensureActive();
    await this.setObjectNotExistsAsync(id, object);
    this.ensureActive();
    if (!legacyName || !dynamicName && this.migratedNames.has(id)) {
      return;
    }
    const existing = await this.getObjectAsync(id);
    if (!dynamicName) {
      this.migratedNames.add(id);
    }
    if (!existing) {
      return;
    }
    const currentName = existing.common.name;
    const generatedName = (_a = existing.native) == null ? void 0 : _a[WebuntisNext.generatedLessonNameKey];
    const shouldMigrateName = (0, import_ObjectTranslations.needsNameMigration)(currentName, legacyName) || dynamicName && (0, import_ObjectTranslations.shouldMigrateDynamicName)(currentName, generatedName);
    const desiredCommon = object.common || {};
    const common = {};
    for (const key of ["type", "role", "read", "write", "def"]) {
      if (key in desiredCommon && (0, import_ObjectTranslations.hasObjectValueChanged)(existing.common[key], desiredCommon[key])) {
        common[key] = desiredCommon[key];
      }
    }
    if ("unit" in desiredCommon && (0, import_ObjectTranslations.hasObjectValueChanged)(existing.common.unit, desiredCommon.unit)) {
      common.unit = desiredCommon.unit;
    }
    if (shouldMigrateName && (0, import_ObjectTranslations.hasObjectValueChanged)(existing.common.name, (_b = object.common) == null ? void 0 : _b.name)) {
      common.name = (_c = object.common) == null ? void 0 : _c.name;
    }
    const native = dynamicName && object.native && typeof object.native === "object" ? object.native : void 0;
    const shouldMigrateMarker = dynamicName && native && shouldMigrateName && (typeof generatedName !== "string" || generatedName === currentName) && (0, import_ObjectTranslations.hasObjectValueChanged)(
      (_d = existing.native) == null ? void 0 : _d[WebuntisNext.generatedLessonNameKey],
      native[WebuntisNext.generatedLessonNameKey]
    );
    if (Object.keys(common).length || shouldMigrateMarker) {
      await this.extendObjectAsync(id, { common, ...shouldMigrateMarker ? { native } : {} });
    }
  }
  ensureActive() {
    if (this.unloaded) {
      throw new import_WebUntisErrors.WebUntisError("ABORTED", "Adapter is shutting down");
    }
  }
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
    if (this.unloaded) {
      return;
    }
    await this.ensureTranslatedObject(
      "info",
      { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("information") }, native: {} },
      "Information"
    );
    await this.ensureTranslatedObject(
      "info.connection",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("deviceOrServiceConnected"),
          type: "boolean",
          role: "indicator.connected",
          read: true,
          write: false
        },
        native: {}
      },
      "Device or service connected"
    );
    await this.ensureTranslatedObject(
      "info.lastUpdate",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("lastUpdateAttempt"),
          type: "string",
          role: "date",
          read: true,
          write: false
        },
        native: {}
      },
      "Last timetable update attempt"
    );
    await this.ensureTranslatedObject(
      "info.lastSuccessfulUpdate",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("lastSuccessfulUpdate"),
          type: "string",
          role: "date",
          read: true,
          write: false
        },
        native: {}
      },
      "Last successful timetable update"
    );
    await this.ensureTranslatedObject(
      "info.nextUpdate",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("nextUpdate"),
          type: "string",
          role: "date",
          read: true,
          write: false
        },
        native: {}
      },
      "Next timetable update"
    );
    await this.ensureInboxRoot();
    await this.cleanupObsoleteStructure();
    await this.setState("info.connection", false, true);
    if (!this.hasConnectionConfig()) {
      return;
    }
    await this.updateTimetable();
    this.scheduleTimetableUpdate();
    this.scheduleCurrentNextUpdate();
  }
  scheduleTimetableUpdate() {
    if (this.unloaded) {
      return;
    }
    this.timetableTimer = this.setTimeout(() => {
      this.timetableTimer = void 0;
      void this.updateTimetable().catch((error) => this.log.error(`Unexpected timetable update error: ${error}`)).finally(() => this.scheduleTimetableUpdate());
    }, TIMETABLE_INTERVAL_MS);
  }
  scheduleCurrentNextUpdate() {
    if (this.unloaded) {
      return;
    }
    this.currentNextTimer = this.setTimeout(() => {
      this.currentNextTimer = void 0;
      void this.updateCurrentNextStates().catch((error) => this.log.error(`Unexpected current/next update error: ${error}`)).finally(() => this.scheduleCurrentNextUpdate());
    }, CURRENT_NEXT_INTERVAL_MS);
  }
  hasConnectionConfig() {
    return Boolean(
      this.config.server && this.config.schoolName && typeof this.config.schoolId === "number" && this.config.username && this.config.password
    );
  }
  async updateTimetable() {
    if (this.unloaded) {
      return;
    }
    await this.setState("info.lastUpdate", (/* @__PURE__ */ new Date()).toISOString(), true);
    try {
      await (0, import_LegacyNamespaceCleanup.cleanupLegacyNamespace)(this, "messages");
      await this.ensureTimetableRoot();
      await this.ensureHolidaysRoot();
      const now = /* @__PURE__ */ new Date();
      const data = await this.webUntis.loadTimetable(this.config, now);
      if (this.unloaded) {
        return;
      }
      this.todayLessons = data.today;
      this.hasTimetableSnapshot = true;
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
      try {
        const unreadMessages = await this.webUntis.loadUnreadMessages(this.config);
        await this.writeUnreadMessages(unreadMessages);
        this.lastMessageWarningAt = 0;
      } catch (error) {
        const warningIntervalMs = 30 * 60 * 1e3;
        if (Date.now() - this.lastMessageWarningAt >= warningIntervalMs) {
          const code = error instanceof import_WebUntisErrors.WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
          this.log.warn(`WebUntis messages refresh failed: ${code}; previous message data was kept`);
          this.lastMessageWarningAt = Date.now();
        }
      }
      await this.setState("info.lastSuccessfulUpdate", now.toISOString(), true);
      await this.setState("info.nextUpdate", new Date(now.getTime() + TIMETABLE_INTERVAL_MS).toISOString(), true);
      await this.setState("info.connection", true, true);
      this.log.debug(`Timetable updated: ${updated} lessons updated, ${removed} obsolete lessons removed`);
    } catch (error) {
      if (this.unloaded) {
        return;
      }
      await this.setState("info.connection", false, true);
      await this.setState("info.nextUpdate", new Date(Date.now() + TIMETABLE_INTERVAL_MS).toISOString(), true);
      const code = error instanceof import_WebUntisErrors.WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
      const detail = error instanceof Error ? ` (${error.message})` : "";
      this.log.warn(`Timetable update failed: ${code}${detail}; existing timetable data was kept`);
    }
  }
  async ensureInboxRoot() {
    await this.ensureTranslatedObject(
      "inbox",
      { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("inbox") }, native: {} },
      "Messages"
    );
    await this.ensureTranslatedObject(
      "inbox.unreadCount",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("unreadMessagesCount"),
          type: "number",
          role: "value",
          read: true,
          write: false,
          def: 0
        },
        native: {}
      },
      "Unread message count"
    );
    await this.ensureTranslatedObject(
      "inbox.unread",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedName)("unreadMessages"),
          type: "string",
          role: "json",
          read: true,
          write: false,
          def: "[]"
        },
        native: {}
      },
      "Unread messages"
    );
    await this.initializeInboxState("inbox.unreadCount", 0);
    await this.initializeInboxState("inbox.unread", "[]");
  }
  async initializeInboxState(id, defaultValue) {
    var _a;
    const current = await this.getStateAsync(id);
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, id, (_a = current == null ? void 0 : current.val) != null ? _a : defaultValue);
  }
  async writeUnreadMessages(messages) {
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.unreadCount", messages.length);
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.unread", JSON.stringify(messages));
  }
  async ensureTimetableRoot() {
    await this.ensureTranslatedObject(
      "timetable",
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedName)("timetable") },
        native: {}
      },
      "Timetable"
    );
  }
  async ensureHolidaysRoot() {
    await this.ensureTranslatedObject(
      "holidays",
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedName)("holidays") },
        native: {}
      },
      "Holidays"
    );
    await this.ensureTranslatedObject(
      "holidays.current",
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedName)("currentHoliday") },
        native: {}
      },
      "Current holiday"
    );
    await this.ensureTranslatedObject(
      "holidays.next",
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedName)("nextHoliday") },
        native: {}
      },
      "Next holiday"
    );
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
      dateOnly(summary.current.startDate),
      "Start date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState(
      "holidays.current.startDateTimestamp",
      numericDate(summary.current.startDate),
      "Start date (Unix timestamp ms)",
      "number",
      "value",
      0,
      "ms"
    );
    await this.writeSimpleState(
      "holidays.current.endDate",
      dateOnly(summary.current.endDate),
      "End date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState(
      "holidays.current.endDateTimestamp",
      numericDate(summary.current.endDate),
      "End date (Unix timestamp ms)",
      "number",
      "value",
      0,
      "ms"
    );
    await this.writeSimpleState("holidays.next.name", summary.next.name, "Name", "string", "text", "");
    await this.writeSimpleState("holidays.next.longName", summary.next.longName, "Long name", "string", "text", "");
    await this.writeSimpleState(
      "holidays.next.startDate",
      dateOnly(summary.next.startDate),
      "Start date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState(
      "holidays.next.startDateTimestamp",
      numericDate(summary.next.startDate),
      "Start date (Unix timestamp ms)",
      "number",
      "value",
      0,
      "ms"
    );
    await this.writeSimpleState(
      "holidays.next.endDate",
      dateOnly(summary.next.endDate),
      "End date",
      "string",
      "date",
      ""
    );
    await this.writeSimpleState(
      "holidays.next.daysUntil",
      summary.next.daysUntil,
      "Days until",
      "number",
      "value.interval",
      0,
      "d"
    );
    await this.writeSimpleState(
      "holidays.next.endDateTimestamp",
      numericDate(summary.next.endDate),
      "End date (Unix timestamp ms)",
      "number",
      "value",
      0,
      "ms"
    );
  }
  async writeDaySummary(path, summary, lessons) {
    for (const [name, definition] of Object.entries(SUMMARY_STATE_DEFINITIONS)) {
      if (name === "lessonCount") {
        continue;
      }
      await this.ensureTranslatedObject(
        `timetable.${path}.${name}`,
        {
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
        },
        definition.name.en
      );
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, `timetable.${path}.${name}`, summary[name]);
    }
    await this.writeSimpleState(
      `timetable.${path}.lessonComparison`,
      JSON.stringify((0, import_Timetable.buildLessonComparison)(lessons)),
      "Lesson comparison (JSON)",
      "string",
      "json",
      "[]"
    );
  }
  async writeCurrentNextSummary(lessons, now) {
    const summary = (0, import_CurrentNextLesson.deriveCurrentNextLesson)(lessons, now);
    for (const [name, definition] of Object.entries(CURRENT_NEXT_STATE_DEFINITIONS)) {
      await this.ensureTranslatedObject(
        `timetable.today.${name}`,
        {
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
        },
        definition.name.en
      );
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, `timetable.today.${name}`, summary[name]);
    }
  }
  async updateCurrentNextStates() {
    if (this.unloaded || !this.hasTimetableSnapshot) {
      return;
    }
    await this.writeCurrentNextSummary(this.todayLessons, /* @__PURE__ */ new Date());
  }
  async cleanupObsoleteStructure() {
    for (const id of [
      "info.apiFieldReport",
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
    await this.ensureTranslatedObject(
      `timetable.${group}`,
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedTimetableGroup)(group) },
        native: {}
      },
      `Timetable ${group}`
    );
    let removed = await this.removeLegacyLessons(group);
    if (group === "week") {
      const weekdayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      const byDay = weekdayNames.map((_, index) => {
        const targetDate = this.timetableDate((0, import_Timetable.nextWeekday)(now, index));
        return lessons.filter((lesson) => lesson.date === targetDate);
      });
      for (let index = 0; index < weekdayNames.length; index++) {
        const result = await this.writeTimetableDay(
          `timetable.week.${weekdayNames[index]}`,
          byDay[index],
          this.timetableDate((0, import_Timetable.nextWeekday)(now, index))
        );
        await this.writeDaySummary(
          `week.${weekdayNames[index]}`,
          (0, import_Timetable.summarizeTimetable)(byDay[index]),
          byDay[index]
        );
        removed += result.removed;
      }
    } else {
      const day = new Date(now);
      if (group === "tomorrow") {
        day.setDate(day.getDate() + 1);
      }
      const result = await this.writeTimetableDay(`timetable.${group}`, lessons, this.timetableDate(day));
      await this.writeDaySummary(group, (0, import_Timetable.summarizeTimetable)(lessons), lessons);
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
    const dayName = path.split(".").at(-1) || "Day";
    await this.ensureTranslatedObject(
      path,
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedWeekday)(dayName) },
        native: {}
      },
      dayName
    );
    await this.writeSimpleState(`${path}.date`, dateOnly(date), "Date", "string", "text", "");
    await this.writeSimpleState(
      `${path}.dateTimestamp`,
      numericDate(date),
      "Date (Unix timestamp ms)",
      "number",
      "value",
      0,
      "ms"
    );
    await this.writeSimpleState(`${path}.lessonCount`, lessons.length, "Lesson count", "number", "value", 0);
    await this.ensureTranslatedObject(
      `${path}.lessons`,
      {
        type: "channel",
        common: { name: (0, import_ObjectTranslations.translatedName)("lessons") },
        native: {}
      },
      "Lessons"
    );
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
  timetableDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  async writeSimpleState(id, value, name, type, role, def, unit) {
    this.ensureActive();
    await this.ensureTranslatedObject(
      id,
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedStateName)(name),
          type,
          role,
          read: true,
          write: false,
          def,
          ...unit ? { unit } : {}
        },
        native: {}
      },
      name
    );
    this.ensureActive();
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, id, value);
  }
  async writeLesson(path, slot, lesson) {
    var _a, _b;
    this.ensureActive();
    const base = `${path}.lessons.${slot}`;
    const label = (0, import_Timetable.lessonChannelName)(lesson);
    await this.ensureTranslatedObject(
      base,
      {
        type: "channel",
        common: { name: label || (0, import_ObjectTranslations.translatedLessonFallback)(slot) },
        native: { [WebuntisNext.generatedLessonNameKey]: label || (0, import_ObjectTranslations.translatedLessonFallback)(slot) }
      },
      `Lesson ${slot}`,
      true
    );
    this.ensureActive();
    const values = {
      date: { value: dateOnly(lesson.date), type: "string", role: "text" },
      dateTimestamp: { value: numericDate(lesson.date), type: "number", role: "value", unit: "ms" },
      startTime: { value: lesson.startTime, type: "string", role: "text" },
      endTime: { value: lesson.endTime, type: "string", role: "text" },
      subject: { value: lesson.subject, type: "string", role: "text" },
      subjectLong: { value: lesson.subjectLong, type: "string", role: "text" },
      teacher: { value: lesson.teacher, type: "string", role: "text" },
      teacherLong: { value: lesson.teacherLong, type: "string", role: "text" },
      room: { value: lesson.room, type: "string", role: "text" },
      roomLong: { value: lesson.roomLong, type: "string", role: "text" },
      class: { value: lesson.class, type: "string", role: "text" },
      classLong: { value: lesson.classLong, type: "string", role: "text" },
      lessonNumber: {
        value: (_a = lesson.lessonNumber) != null ? _a : Number(slot),
        type: "number",
        role: "value"
      },
      ...lesson.lessonId === null ? {} : { lessonId: { value: String(lesson.lessonId), type: "string", role: "text" } },
      ...lesson.periodId === null ? {} : { periodId: { value: String(lesson.periodId), type: "string", role: "text" } },
      status: { value: lesson.status, type: "string", role: "text" },
      changed: { value: lesson.changed, type: "boolean", role: "indicator" },
      cancelled: { value: lesson.cancelled, type: "boolean", role: "indicator" },
      ...lesson.substitution ? { substitution: { value: lesson.substitution, type: "string", role: "text" } } : {},
      ...lesson.originalTeacher && lesson.originalTeacher !== lesson.teacher ? {
        originalTeacher: { value: lesson.originalTeacher, type: "string", role: "text" },
        originalTeacherLong: {
          value: lesson.originalTeacherLong,
          type: "string",
          role: "text"
        }
      } : {},
      ...lesson.originalRoom && lesson.originalRoom !== lesson.room ? {
        originalRoom: { value: lesson.originalRoom, type: "string", role: "text" },
        originalRoomLong: { value: lesson.originalRoomLong, type: "string", role: "text" }
      } : {},
      ...lesson.originalSubject && lesson.originalSubject !== lesson.subject ? {
        originalSubject: { value: lesson.originalSubject, type: "string", role: "text" },
        originalSubjectLong: {
          value: lesson.originalSubjectLong,
          type: "string",
          role: "text"
        }
      } : {}
    };
    await (0, import_LessonStateCleanup.removeStaleLessonStates)(base, values, this.getObjectAsync.bind(this), this.delObjectAsync.bind(this));
    for (const [name, item] of Object.entries(values)) {
      await this.ensureTranslatedObject(
        `${base}.${name}`,
        {
          type: "state",
          common: {
            name: LESSON_STATE_NAMES[name] || name,
            type: item.type,
            role: item.role,
            read: true,
            write: false,
            def: item.type === "string" ? "" : item.type === "boolean" ? false : 0,
            ...item.unit ? { unit: item.unit } : {}
          },
          native: {}
        },
        typeof ((_b = LESSON_STATE_NAMES[name]) == null ? void 0 : _b.en) === "string" ? LESSON_STATE_NAMES[name].en : name
      );
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, `${base}.${name}`, item.value);
    }
  }
  async onMessage(obj) {
    if (this.unloaded || !obj || !obj.command || !obj.callback) {
      return;
    }
    try {
      if (obj.command === "searchSchools") {
        const results = await this.webUntis.searchSchools(this.getStringPayload(obj.message, "query"));
        if (this.unloaded) {
          return;
        }
        this.log.info(`School search returned ${results.length} results`);
        this.sendTo(obj.from, obj.command, { ok: true, results }, obj.callback);
        return;
      }
      if (obj.command === "testConnection") {
        const result = await this.webUntis.testConnection(this.getConnectionPayload(obj.message));
        if (this.unloaded) {
          return;
        }
        await this.setState("info.connection", result.ok, true);
        if (result.ok) {
          this.log.info("WebUntis authentication successful");
        } else {
          this.log.warn(`WebUntis authentication failed: ${result.code}`);
        }
        this.sendTo(obj.from, obj.command, result, obj.callback);
      }
    } catch (error) {
      if (this.unloaded) {
        return;
      }
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
    if (this.unloaded) {
      return;
    }
    this.unloaded = true;
    this.webUntis.shutdown();
    if (this.timetableTimer) {
      this.clearTimeout(this.timetableTimer);
    }
    if (this.currentNextTimer) {
      this.clearTimeout(this.currentNextTimer);
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
