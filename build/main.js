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
const EXAMS_MAX_ATTEMPTS = 3;
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
  schoolStart: { type: "string", role: "time", name: (0, import_ObjectTranslations.translatedName)("schoolStart"), def: "" },
  schoolEnd: { type: "string", role: "time", name: (0, import_ObjectTranslations.translatedName)("schoolEnd"), def: "" },
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
  childTodayLessons = /* @__PURE__ */ new Map();
  hasTimetableSnapshot = false;
  unloaded = false;
  migratedNames = /* @__PURE__ */ new Set();
  lastMessageWarningAt = 0;
  lastExamsWarningAt = 0;
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
    } else if (desiredCommon.role === "date" && existing.common.unit !== void 0) {
      common.unit = null;
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
  /** Throw when asynchronous work resumes after adapter shutdown. */
  ensureActive() {
    if (this.unloaded) {
      throw new import_WebUntisErrors.WebUntisError("ABORTED", "Adapter is shutting down");
    }
  }
  /**
   * Create the WebUntis adapter.
   *
   * @param options Adapter constructor options.
   */
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
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onStateChange(id, state) {
    var _a, _b;
    if (!state || state.ack || state.val !== true || this.unloaded) {
      return;
    }
    if (id === "info.refresh" || id === `${this.namespace}.info.refresh`) {
      try {
        await this.updateTimetable();
      } finally {
        if (!this.unloaded) {
          await this.setStateAsync("info.refresh", false, true);
        }
      }
      return;
    }
    const match = /^inbox\.messages\.unread\.([a-zA-Z0-9_-]+)\.markRead$/.exec(id);
    if (!match) {
      return;
    }
    const messageId = match[1];
    const sourcePath = `inbox.messages.unread.${messageId}`;
    const sourceId = await this.getStateAsync(`${sourcePath}.id`);
    const fields = [
      ["id", "Message ID", typeof (sourceId == null ? void 0 : sourceId.val) === "number" ? "number" : "string"],
      ["dateTime", "Date and time", "string"],
      ["sender", "Sender", "string"],
      ["subject", "Subject", "string"],
      ["content", "Content", "string"],
      ["contentIsPreview", "Content is preview", "boolean"],
      ["hasAttachments", "Has attachments", "boolean"],
      ["readInWebUntis", "Read in WebUntis", "boolean"]
    ];
    const channelRows = await this.getObjectListAsync({
      startkey: `${this.namespace}.inbox.messages.read.`,
      endkey: `${this.namespace}.inbox.messages.read.\uFFFF`
    });
    const existingSlots = /* @__PURE__ */ new Set();
    for (const row of channelRows.rows || []) {
      const match2 = /^inbox\.messages\.read\.([^.]+)\./.exec(row.id.replace(`${this.namespace}.`, ""));
      if (match2) {
        existingSlots.add(match2[1]);
      }
    }
    const readMessages = [];
    for (const slot of existingSlots) {
      const entry = {};
      for (const [field] of fields) {
        const current = await this.getStateAsync(`inbox.messages.read.${slot}.${field}`);
        if ((current == null ? void 0 : current.val) !== void 0 && current.val !== null) {
          entry[field] = current.val;
        }
      }
      if (entry.id !== void 0 && entry.id !== (sourceId == null ? void 0 : sourceId.val)) {
        readMessages.push(entry);
      }
    }
    const sourceMessage = {};
    for (const [field] of fields) {
      const current = await this.getStateAsync(`${sourcePath}.${field}`);
      if ((current == null ? void 0 : current.val) === void 0 || current.val === null) {
        continue;
      }
      sourceMessage[field] = current.val;
    }
    sourceMessage.id = (_a = sourceId == null ? void 0 : sourceId.val) != null ? _a : messageId;
    sourceMessage.read = true;
    sourceMessage.readInWebUntis = false;
    readMessages.push(sourceMessage);
    readMessages.sort((left, right) => {
      var _a2, _b2;
      return String((_a2 = left.dateTime) != null ? _a2 : "").localeCompare(String((_b2 = right.dateTime) != null ? _b2 : ""));
    });
    for (const slot of existingSlots) {
      await this.delObjectAsync(`inbox.messages.read.${slot}`, { recursive: true });
    }
    for (let index = 0; index < readMessages.length; index++) {
      const entry = readMessages[index];
      const slot = String(index + 1).padStart(2, "0");
      const targetPath = `inbox.messages.read.${slot}`;
      const entryId = (_b = entry.id) != null ? _b : messageId;
      const entrySubject = typeof entry.subject === "string" ? entry.subject : `Message ${entryId}`;
      await this.ensureTranslatedObject(
        targetPath,
        {
          type: "channel",
          common: { name: entrySubject },
          native: { messageId: entryId }
        },
        "Read message"
      );
      for (const [field, name, type] of fields) {
        const value = entry[field];
        if (value === void 0 || value === null) {
          continue;
        }
        const role = field === "dateTime" ? "date" : type === "boolean" ? "indicator" : type === "number" ? "value" : "text";
        await this.writeSimpleState(
          `${targetPath}.${field}`,
          value,
          name,
          type,
          role,
          type === "boolean" ? false : type === "number" ? 0 : ""
        );
      }
      await this.writeSimpleState(`${targetPath}.read`, true, "Read", "boolean", "indicator", false);
      await this.writeSimpleState(
        `${targetPath}.readInWebUntis`,
        entry.readInWebUntis === true,
        "Read in WebUntis",
        "boolean",
        "indicator",
        false
      );
    }
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.read.count", readMessages.length);
    await this.setStateAsync(`${sourcePath}.markRead`, false, true);
    await this.delObjectAsync(sourcePath, { recursive: true });
    const unreadState = await this.getStateAsync("inbox.messages.unread.unread");
    if (typeof (unreadState == null ? void 0 : unreadState.val) === "string") {
      try {
        const unreadMessages = JSON.parse(unreadState.val);
        const remaining = unreadMessages.filter((message) => String(message.id) !== String(sourceId == null ? void 0 : sourceId.val));
        await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.unread.unread", JSON.stringify(remaining));
        await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.unread.unreadCount", remaining.length);
      } catch {
        this.log.warn("Could not update the inbox unread summary after marking a message as read");
      }
    }
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
      "info.refresh",
      {
        type: "state",
        common: {
          name: (0, import_ObjectTranslations.translatedStateName)("refresh"),
          type: "boolean",
          role: "button",
          read: false,
          write: true,
          def: false
        },
        native: {}
      },
      "Refresh now"
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
      "info.accountType",
      {
        type: "state",
        common: {
          name: { en: "WebUntis account type", de: "WebUntis-Kontotyp" },
          type: "string",
          role: "text",
          read: true,
          write: false,
          def: "Unknown"
        },
        native: {}
      },
      "WebUntis account type"
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
    await this.ensureStudentsRoot();
    await this.ensureInboxRoot();
    await this.ensureHolidaysRoot();
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
    var _a, _b, _c;
    if (this.unloaded) {
      return;
    }
    await this.setState("info.lastUpdate", (/* @__PURE__ */ new Date()).toISOString(), true);
    try {
      await (0, import_LegacyNamespaceCleanup.cleanupLegacyNamespace)(this, "messages");
      await this.ensureStudentsRoot();
      await this.ensureHolidaysRoot();
      const now = /* @__PURE__ */ new Date();
      const data = await this.webUntis.loadTimetable(this.config, now);
      if (this.unloaded) {
        return;
      }
      const accountType = data.personType === 5 ? "Student" : data.personType === 12 ? "Parent" : "Other";
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, "info.accountType", accountType);
      const students = ((_a = data.children) == null ? void 0 : _a.length) ? data.children : data.studentId ? [{ id: data.studentId, name: `Student ${data.studentId}`, timetable: data }] : [];
      this.todayLessons = (_c = (_b = students[0]) == null ? void 0 : _b.timetable.today) != null ? _c : data.today;
      this.hasTimetableSnapshot = true;
      let updated = 0;
      let removed = 0;
      if (students.length) {
        this.childTodayLessons = new Map(
          students.map((student) => [student.id, { name: student.name, lessons: student.timetable.today }])
        );
        for (const child of students) {
          this.ensureActive();
          const childRoot = `students.student_${child.id}`;
          await this.ensureTranslatedObject(
            childRoot,
            {
              type: "channel",
              common: { name: child.name || `Student ${child.id}` },
              native: { studentId: child.id }
            },
            child.name || `Student ${child.id}`
          );
          const timetableRoot = `${childRoot}.timetable`;
          await this.ensureTranslatedObject(
            timetableRoot,
            { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("timetable") }, native: {} },
            "Timetable"
          );
          for (const group of TIMETABLE_GROUPS) {
            const result = await this.writeTimetableGroup(
              group,
              child.timetable[group],
              now,
              timetableRoot
            );
            updated += result.updated;
            removed += result.removed;
          }
        }
        const existingChildren = await this.getObjectListAsync({
          startkey: `${this.namespace}.students.student_`,
          endkey: `${this.namespace}.students.student_\uFFFF`
        });
        const expectedChildren = new Set(students.map((student) => `student_${student.id}`));
        const staleChildren = /* @__PURE__ */ new Set();
        for (const object of existingChildren.rows || []) {
          const childId = object.id.replace(`${this.namespace}.students.`, "").split(".")[0];
          if (childId.startsWith("student_") && !expectedChildren.has(childId)) {
            staleChildren.add(childId);
          }
        }
        for (const childId of staleChildren) {
          this.ensureActive();
          await this.delObjectAsync(`students.${childId}`, { recursive: true });
        }
      } else {
        this.childTodayLessons.clear();
        const existingChildren = await this.getObjectListAsync({
          startkey: `${this.namespace}.students.student_`,
          endkey: `${this.namespace}.students.student_\uFFFF`
        });
        const staleChildren = new Set(
          (existingChildren.rows || []).map((object) => object.id.replace(`${this.namespace}.students.`, "").split(".")[0]).filter((childId) => childId.startsWith("student_"))
        );
        for (const childId of staleChildren) {
          this.ensureActive();
          await this.delObjectAsync(`students.${childId}`, { recursive: true });
        }
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
          const detail = error instanceof Error ? ` (${error.message})` : "";
          this.log.warn(`WebUntis messages refresh failed: ${code}${detail}; previous message data was kept`);
          this.lastMessageWarningAt = Date.now();
        }
      }
      try {
        const exams = await this.loadUpcomingExamsWithRetry(now);
        if (this.unloaded) {
          return;
        }
        await this.writeUpcomingExams(
          exams.map(
            (exam) => data.studentId && exam.studentId === void 0 ? { ...exam, studentId: data.studentId, studentName: `Student ${data.studentId}` } : exam
          ),
          students.map((student) => ({ id: student.id, name: student.name })),
          now
        );
        this.lastExamsWarningAt = 0;
      } catch (error) {
        const warningIntervalMs = 30 * 60 * 1e3;
        if (Date.now() - this.lastExamsWarningAt >= warningIntervalMs) {
          const code = error instanceof import_WebUntisErrors.WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
          const detail = error instanceof Error ? ` (${error.message})` : "";
          this.log.warn(
            `WebUntis upcoming exams refresh failed: ${code}${detail}; previous exam data was kept`
          );
          this.lastExamsWarningAt = Date.now();
        }
      }
      await this.cleanupLegacyDataRoots();
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
  async loadUpcomingExamsWithRetry(now) {
    for (let attempt = 1; attempt <= EXAMS_MAX_ATTEMPTS; attempt++) {
      this.ensureActive();
      try {
        return await this.webUntis.loadUpcomingExams(this.config, now);
      } catch (error) {
        const transient = error instanceof import_WebUntisErrors.WebUntisError && (error.code === "SERVER_UNREACHABLE" || error.code === "TIMEOUT");
        if (!transient || attempt === EXAMS_MAX_ATTEMPTS) {
          throw error;
        }
        this.log.debug(`WebUntis exams request attempt ${attempt}/${EXAMS_MAX_ATTEMPTS} failed; retrying`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
    throw new Error("WebUntis exams retry loop ended unexpectedly");
  }
  async ensureStudentsRoot() {
    await this.ensureTranslatedObject(
      "students",
      { type: "channel", common: { name: { en: "Students", de: "Sch\xFCler" } }, native: {} },
      "Students"
    );
  }
  async cleanupLegacyDataRoots() {
    for (const id of ["timetable", "exams", "children", "info.inbox"]) {
      if (await this.getObjectAsync(id)) {
        await this.delObjectAsync(id, { recursive: true });
      }
    }
    const existingStudents = await this.getObjectListAsync({
      startkey: `${this.namespace}.students.`,
      endkey: `${this.namespace}.students.\uFFFF`
    });
    for (const object of existingStudents.rows || []) {
      const studentId = object.id.replace(`${this.namespace}.students.`, "").split(".")[0];
      if (/^\d+$/.test(studentId)) {
        await this.delObjectAsync(`students.${studentId}`, { recursive: true });
      }
    }
  }
  async ensureInboxRoot() {
    var _a, _b, _c, _d;
    await this.ensureTranslatedObject(
      "inbox",
      { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("inbox") }, native: {} },
      "Messages"
    );
    await this.ensureTranslatedObject(
      "inbox.messages",
      { type: "channel", common: { name: "Messages" }, native: {} },
      "Messages"
    );
    await this.ensureTranslatedObject(
      "inbox.messages.unread",
      { type: "channel", common: { name: { en: "Unread", de: "Ungelesen" } }, native: {} },
      "Unread"
    );
    await this.ensureTranslatedObject(
      "inbox.messages.unread.unreadCount",
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
      "inbox.messages.unread.unread",
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
    await this.ensureTranslatedObject(
      "inbox.messages.read",
      { type: "channel", common: { name: { en: "Read", de: "Gelesen" } }, native: {} },
      "Read"
    );
    await this.ensureTranslatedObject(
      "inbox.messages.read.count",
      {
        type: "state",
        common: {
          name: { en: "Read message count", de: "Anzahl gelesener Nachrichten" },
          type: "number",
          role: "value",
          read: true,
          write: false,
          def: 0
        },
        native: {}
      },
      "Read message count"
    );
    const legacyCount = await this.getStateAsync("info.inbox.unreadCount");
    const legacyMessages = await this.getStateAsync("info.inbox.unread");
    const oldCount = await this.getStateAsync("inbox.unreadCount");
    const oldMessages = await this.getStateAsync("inbox.unread");
    await this.initializeRootState("inbox.messages.unread.unreadCount", (_b = (_a = oldCount == null ? void 0 : oldCount.val) != null ? _a : legacyCount == null ? void 0 : legacyCount.val) != null ? _b : 0);
    await this.initializeRootState("inbox.messages.unread.unread", (_d = (_c = oldMessages == null ? void 0 : oldMessages.val) != null ? _c : legacyMessages == null ? void 0 : legacyMessages.val) != null ? _d : "[]");
    await this.delObjectAsync("inbox.unreadCount");
    await this.delObjectAsync("inbox.unread");
  }
  async initializeRootState(id, defaultValue) {
    var _a;
    const current = await this.getStateAsync(id);
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, id, (_a = current == null ? void 0 : current.val) != null ? _a : defaultValue);
  }
  async writeUnreadMessages(messages) {
    const sortedMessages = [...messages].sort((left, right) => left.dateTime.localeCompare(right.dateTime));
    const unreadMessages = [];
    const locallyReadIds = /* @__PURE__ */ new Set();
    const existingRead = await this.getObjectListAsync({
      startkey: `${this.namespace}.inbox.messages.read.`,
      endkey: `${this.namespace}.inbox.messages.read.\uFFFF`
    });
    for (const row of existingRead.rows || []) {
      const relativePath = row.id.replace(`${this.namespace}.`, "");
      if (!/^inbox\.messages\.read\.[^.]+\.id$/.test(relativePath)) {
        continue;
      }
      const messageId = await this.getStateAsync(relativePath);
      const read = await this.getStateAsync(relativePath.replace(/\.id$/, ".read"));
      if ((messageId == null ? void 0 : messageId.val) !== void 0 && (read == null ? void 0 : read.val) === true) {
        locallyReadIds.add(String(messageId.val));
      }
    }
    for (const message of sortedMessages) {
      const locallyRead = locallyReadIds.has(String(message.id));
      if (!message.readInWebUntis && !locallyRead) {
        unreadMessages.push(message);
      }
    }
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.unread.unreadCount", unreadMessages.length);
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.unread.unread", JSON.stringify(unreadMessages));
    const messageRoot = "inbox.messages";
    const expected = /* @__PURE__ */ new Set();
    const slots = { read: 0, unread: 0 };
    for (const message of sortedMessages) {
      this.ensureActive();
      const locallyRead = locallyReadIds.has(String(message.id));
      const group = locallyRead || message.readInWebUntis ? "read" : "unread";
      const slot = String(++slots[group]).padStart(2, "0");
      const messagePath = `${messageRoot}.${group}.${slot}`;
      expected.add(`${group}.${slot}`);
      await this.ensureTranslatedObject(
        messagePath,
        {
          type: "channel",
          common: { name: message.subject || `Message ${message.id}` },
          native: { messageId: message.id }
        },
        message.subject || `Message ${message.id}`
      );
      if (!message.readInWebUntis && !locallyRead) {
        await this.ensureTranslatedObject(
          `${messagePath}.markRead`,
          {
            type: "state",
            common: {
              name: { en: "Mark as read", de: "Als gelesen markieren" },
              type: "boolean",
              role: "button",
              read: false,
              write: true,
              def: false
            },
            native: {}
          },
          "Mark as read"
        );
      }
      await this.writeSimpleState(
        `${messagePath}.read`,
        locallyRead || message.readInWebUntis,
        "Read",
        "boolean",
        "indicator",
        false
      );
      await this.writeSimpleState(
        `${messagePath}.readInWebUntis`,
        message.readInWebUntis,
        "Read in WebUntis",
        "boolean",
        "indicator",
        false
      );
      const fields = [
        ["id", "Message ID", typeof message.id === "number" ? "number" : "string", message.id],
        ["dateTime", "Date and time", "string", message.dateTime],
        ["sender", "Sender", "string", message.sender],
        ["subject", "Subject", "string", message.subject],
        ["content", "Content", "string", message.content],
        ["contentIsPreview", "Content is preview", "boolean", message.contentIsPreview],
        ["hasAttachments", "Has attachments", "boolean", message.hasAttachments]
      ];
      for (const [field, name, type, value] of fields) {
        if (field === "id" && typeof message.id === "number") {
          await this.writeSimpleState(`${messagePath}.${field}`, message.id, name, "number", "value", 0);
          continue;
        }
        const role = field === "dateTime" ? "date" : type === "boolean" ? "indicator" : type === "number" ? "value" : "text";
        const defaultValue = type === "boolean" ? false : type === "number" ? 0 : "";
        await this.writeSimpleState(`${messagePath}.${field}`, value, name, type, role, defaultValue);
      }
    }
    await (0, import_StateWriter.setStateChangedOrInitialize)(this, "inbox.messages.read.count", slots.read);
    const existing = await this.getObjectListAsync({
      startkey: `${this.namespace}.${messageRoot}.`,
      endkey: `${this.namespace}.${messageRoot}.\uFFFF`
    });
    const stale = /* @__PURE__ */ new Set();
    for (const object of existing.rows || []) {
      const relativeId = object.id.replace(`${this.namespace}.${messageRoot}.`, "");
      const parts = relativeId.split(".");
      if (parts[0] === "read" && parts[1] === "count" || parts[0] === "unread" && (parts[1] === "unreadCount" || parts[1] === "unread")) {
        continue;
      }
      const messagePath = `${parts[0]}.${parts[1]}`;
      if ((parts[0] === "read" || parts[0] === "unread") && parts[1] && !expected.has(messagePath)) {
        stale.add(messagePath);
      }
    }
    for (const messagePath of stale) {
      this.ensureActive();
      await this.delObjectAsync(`${messageRoot}.${messagePath}`, { recursive: true });
    }
  }
  async writeUpcomingExams(exams, linkedChildren = [], now = /* @__PURE__ */ new Date()) {
    var _a, _b;
    const students = /* @__PURE__ */ new Map();
    const studentNames = new Map(linkedChildren.map((student) => [student.id, student.name]));
    for (const child of linkedChildren) {
      students.set(child.id, []);
    }
    for (const exam of exams) {
      if (exam.studentId === void 0) {
        continue;
      }
      const studentExams = (_a = students.get(exam.studentId)) != null ? _a : [];
      studentExams.push(exam);
      students.set(exam.studentId, studentExams);
    }
    for (const [studentId, studentExams] of students) {
      this.ensureActive();
      const studentName = ((_b = studentExams.find((exam) => exam.studentName)) == null ? void 0 : _b.studentName) || studentNames.get(studentId) || `Student ${studentId}`;
      const studentRoot = `students.student_${studentId}`;
      await this.ensureTranslatedObject(
        studentRoot,
        {
          type: "channel",
          common: { name: studentName },
          native: { studentId, studentName }
        },
        studentName
      );
      const examsRoot = `${studentRoot}.exams`;
      await this.ensureTranslatedObject(
        examsRoot,
        { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("exams") }, native: {} },
        "Exams"
      );
      const childStates = [
        [
          "count",
          "Upcoming exam count",
          { name: "Upcoming exam count", type: "number", role: "value", read: true, write: false, def: 0 },
          studentExams.length
        ],
        [
          "upcoming",
          "Upcoming exams",
          { name: "Upcoming exams", type: "string", role: "json", read: true, write: false, def: "[]" },
          JSON.stringify(studentExams)
        ],
        [
          "upcomingText",
          "Upcoming exams text",
          { name: "Upcoming exams text", type: "string", role: "text", read: true, write: false, def: "" },
          studentExams.map((exam) => exam.displayText).join("\n")
        ]
      ];
      for (const [name, label, common, value] of childStates) {
        const id = `${examsRoot}.${name}`;
        await this.ensureTranslatedObject(id, { type: "state", common, native: {} }, label);
        await (0, import_StateWriter.setStateChangedOrInitialize)(this, id, value);
      }
      const entriesRoot = `${examsRoot}.entries`;
      await this.ensureTranslatedObject(
        entriesRoot,
        { type: "channel", common: { name: (0, import_ObjectTranslations.translatedName)("upcomingExams") }, native: {} },
        "Upcoming exams"
      );
      const expected = new Set(studentExams.map((_exam, index) => String(index + 1).padStart(2, "0")));
      for (const [index, exam] of studentExams.entries()) {
        this.ensureActive();
        const slot = String(index + 1).padStart(2, "0");
        const base = `${entriesRoot}.${slot}`;
        const label = exam.displayText || (0, import_ObjectTranslations.translatedName)("examFallback").en;
        await this.ensureTranslatedObject(
          base,
          {
            type: "channel",
            common: { name: label },
            native: { [WebuntisNext.generatedLessonNameKey]: label }
          },
          `Exam ${exam.id}`,
          true
        );
        const [examYear, examMonth, examDay] = exam.date.split("-").map(Number);
        const values = {
          id: exam.id,
          subject: exam.subject,
          date: numericDate(exam.date),
          daysUntil: Math.floor(Date.UTC(examYear, examMonth - 1, examDay) / 864e5) - Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5),
          startTime: exam.startTime,
          endTime: exam.endTime,
          name: exam.name,
          text: exam.text,
          displayText: exam.displayText
        };
        const names = {
          id: (0, import_ObjectTranslations.translatedStateName)("Exam ID"),
          subject: (0, import_ObjectTranslations.translatedStateName)("Subject"),
          date: (0, import_ObjectTranslations.translatedStateName)("Date"),
          daysUntil: (0, import_ObjectTranslations.translatedStateName)("daysUntil"),
          startTime: (0, import_ObjectTranslations.translatedStateName)("Exam start time"),
          endTime: (0, import_ObjectTranslations.translatedStateName)("Exam end time"),
          name: (0, import_ObjectTranslations.translatedStateName)("Exam name"),
          text: (0, import_ObjectTranslations.translatedStateName)("Exam text"),
          displayText: (0, import_ObjectTranslations.translatedStateName)("Display text")
        };
        for (const [field, value] of Object.entries(values)) {
          const type = field === "id" || field === "daysUntil" || field === "date" ? "number" : "string";
          await this.ensureTranslatedObject(
            `${base}.${field}`,
            {
              type: "state",
              common: {
                name: names[field],
                type,
                role: field === "date" ? "date" : field === "startTime" || field === "endTime" ? "time" : type === "number" ? "value" : "text",
                read: true,
                write: false,
                def: type === "number" ? 0 : ""
              },
              native: {}
            },
            String(names[field].en)
          );
          await (0, import_StateWriter.setStateChangedOrInitialize)(this, `${base}.${field}`, value);
        }
      }
      const existing = await this.getObjectListAsync({
        startkey: `${this.namespace}.${entriesRoot}.`,
        endkey: `${this.namespace}.${entriesRoot}.\uFFFF`
      });
      const stale = /* @__PURE__ */ new Set();
      for (const object of existing.rows || []) {
        const slot = object.id.replace(`${this.namespace}.${entriesRoot}.`, "").split(".")[0];
        if (slot && !expected.has(slot)) {
          stale.add(slot);
        }
      }
      for (const slot of stale) {
        this.ensureActive();
        await this.delObjectAsync(`${entriesRoot}.${slot}`, { recursive: true });
      }
    }
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
      numericDate(summary.current.startDate),
      "Start date",
      "number",
      "date",
      0
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
      numericDate(summary.current.endDate),
      "End date",
      "number",
      "date",
      0
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
      numericDate(summary.next.startDate),
      "Start date",
      "number",
      "date",
      0
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
      numericDate(summary.next.endDate),
      "End date",
      "number",
      "date",
      0
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
        `${path}.${name}`,
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
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, `${path}.${name}`, summary[name]);
    }
    await this.writeSimpleState(
      `${path}.lessonComparison`,
      JSON.stringify((0, import_Timetable.buildLessonComparison)(lessons)),
      "Lesson comparison (JSON)",
      "string",
      "json",
      "[]"
    );
  }
  async writeCurrentNextSummary(lessons, now, path = "timetable.today") {
    const summary = (0, import_CurrentNextLesson.deriveCurrentNextLesson)(lessons, now);
    for (const [name, definition] of Object.entries(CURRENT_NEXT_STATE_DEFINITIONS)) {
      await this.ensureTranslatedObject(
        `${path}.${name}`,
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
      await (0, import_StateWriter.setStateChangedOrInitialize)(this, `${path}.${name}`, summary[name]);
    }
  }
  async updateCurrentNextStates() {
    if (this.unloaded || !this.hasTimetableSnapshot) {
      return;
    }
    for (const [studentId, child] of this.childTodayLessons) {
      await this.writeCurrentNextSummary(
        child.lessons,
        /* @__PURE__ */ new Date(),
        `students.student_${studentId}.timetable.today`
      );
    }
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
  async writeTimetableGroup(group, lessons, now, root = "timetable") {
    await this.ensureTranslatedObject(
      `${root}.${group}`,
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
          `${root}.week.${weekdayNames[index]}`,
          byDay[index],
          this.timetableDate((0, import_Timetable.nextWeekday)(now, index))
        );
        await this.writeDaySummary(
          `${root}.week.${weekdayNames[index]}`,
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
      const result = await this.writeTimetableDay(`${root}.${group}`, lessons, this.timetableDate(day));
      await this.writeDaySummary(`${root}.${group}`, (0, import_Timetable.summarizeTimetable)(lessons), lessons);
      if (group === "today") {
        await this.writeCurrentNextSummary(lessons, now, `${root}.today`);
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
    await this.writeSimpleState(`${path}.date`, numericDate(date), "Date", "number", "date", 0);
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
    var _a;
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
      date: { value: numericDate(lesson.date), type: "number", role: "date" },
      dateTimestamp: { value: numericDate(lesson.date), type: "number", role: "value", unit: "ms" },
      startTime: { value: lesson.startTime, type: "string", role: "time" },
      endTime: { value: lesson.endTime, type: "string", role: "time" },
      subject: { value: lesson.subject, type: "string", role: "text" },
      subjectLong: { value: lesson.subjectLong, type: "string", role: "text" },
      teacher: { value: lesson.teacher, type: "string", role: "text" },
      teacherLong: { value: lesson.teacherLong, type: "string", role: "text" },
      room: { value: lesson.room, type: "string", role: "text" },
      roomLong: { value: lesson.roomLong, type: "string", role: "text" },
      class: { value: lesson.class, type: "string", role: "text" },
      classLong: { value: lesson.classLong, type: "string", role: "text" },
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
        typeof ((_a = LESSON_STATE_NAMES[name]) == null ? void 0 : _a.en) === "string" ? LESSON_STATE_NAMES[name].en : name
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
  module.exports = Object.assign((options) => new WebuntisNext(options), {
    WebuntisNext
  });
} else {
  (() => new WebuntisNext())();
}
//# sourceMappingURL=main.js.map
