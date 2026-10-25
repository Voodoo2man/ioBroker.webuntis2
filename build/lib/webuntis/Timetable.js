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
var Timetable_exports = {};
__export(Timetable_exports, {
  assertTimetableResponse: () => assertTimetableResponse,
  buildLessonComparison: () => buildLessonComparison,
  dateNumber: () => dateNumber,
  dayRange: () => dayRange,
  lessonChannelName: () => lessonChannelName,
  nextWeekday: () => nextWeekday,
  normalizeLesson: () => normalizeLesson,
  normalizeLessons: () => normalizeLessons,
  resolveTimetableReferences: () => resolveTimetableReferences,
  splitTimetable: () => splitTimetable,
  summarizeTimetable: () => summarizeTimetable,
  weekRange: () => weekRange
});
module.exports = __toCommonJS(Timetable_exports);
var import_node_crypto = require("node:crypto");
var import_WebUntisErrors = require("./WebUntisErrors");
function lessonChannelName(lesson) {
  const time = lesson.startTime && lesson.endTime ? `${lesson.startTime}\u2013${lesson.endTime}` : lesson.startTime || lesson.endTime;
  const shortName = [time, lesson.subjectLong || lesson.subject, lesson.teacher, lesson.room].map((value) => value.trim()).filter(Boolean).join(" \xB7 ");
  const longName = [
    time,
    lesson.subjectLong || lesson.subject,
    lesson.teacher ? lesson.teacherLong || lesson.teacher : "",
    lesson.room ? lesson.roomLong || lesson.room : ""
  ].map((value) => value.trim()).filter(Boolean).join(" \xB7 ");
  return longName || shortName;
}
function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
function firstName(value, long = false) {
  var _a, _b;
  if (!Array.isArray(value) || !value.length || typeof value[0] !== "object" || value[0] === null) {
    return "";
  }
  const item = value[0];
  return text((_b = (_a = item[long ? "longname" : "name"]) != null ? _a : item.longName) != null ? _b : item.name);
}
function dateString(value) {
  const raw = text(value);
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
  }
  return raw;
}
function timeString(value) {
  const raw = text(value).padStart(4, "0");
  return /^\d{4}$/.test(raw) ? `${raw.slice(0, 2)}:${raw.slice(2)}` : text(value);
}
function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}
function stableId(period) {
  var _a, _b;
  const id = (_b = (_a = period.id) != null ? _a : period.lessonId) != null ? _b : period.periodId;
  if (typeof id === "number" || typeof id === "string") {
    return `period-${id}`;
  }
  const key = [period.date, period.startTime, period.endTime, firstName(period.su), firstName(period.kl)].join("|");
  return `period-${(0, import_node_crypto.createHash)("sha1").update(key).digest("hex").slice(0, 16)}`;
}
function normalizeLesson(period) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const substitution = text((_b = (_a = period.substText) != null ? _a : period.substitution) != null ? _b : period.subst);
  const cancelled = period.code === "cancelled" || bool((_d = (_c = period.cancelled) != null ? _c : period.isCancelled) != null ? _d : period.cancelledLesson);
  const changed = cancelled || Boolean(substitution) || Boolean((_f = (_e = period.substTeacher) != null ? _e : period.substRoom) != null ? _f : period.substSubject);
  const originalSubject = (_g = period.origSu) != null ? _g : period.originalSubject;
  return {
    id: stableId(period),
    date: dateString(period.date),
    startTime: timeString(period.startTime),
    endTime: timeString(period.endTime),
    subject: firstName(period.su),
    subjectLong: firstName(period.su, true),
    teacher: firstName(period.te),
    teacherLong: firstName(period.te, true),
    room: firstName(period.ro),
    roomLong: firstName(period.ro, true),
    class: firstName(period.kl),
    classLong: firstName(period.kl, true),
    lessonId: typeof period.id === "number" ? period.id : null,
    periodId: typeof period.periodId === "number" ? period.periodId : null,
    status: text((_h = period.activityType) != null ? _h : period.status),
    changed,
    cancelled,
    substitution,
    originalTeacher: firstName((_i = period.origTe) != null ? _i : period.originalTeacher),
    originalTeacherLong: firstName((_j = period.origTe) != null ? _j : period.originalTeacher, true),
    originalRoom: firstName((_k = period.origRo) != null ? _k : period.originalRoom),
    originalRoomLong: firstName((_l = period.origRo) != null ? _l : period.originalRoom, true),
    originalSubject: firstName(originalSubject, true) || firstName(originalSubject),
    originalSubjectLong: firstName(originalSubject, true)
  };
}
function resolveReferences(value, masterData) {
  if (!Array.isArray(value)) {
    return value;
  }
  const byId = new Map(
    masterData.flatMap((item) => {
      var _a;
      const id = (_a = item.id) != null ? _a : item.elementId;
      return typeof id === "string" || typeof id === "number" ? [[String(id), item]] : [];
    })
  );
  return value.map((item) => {
    if (typeof item !== "object" || item === null) {
      return item;
    }
    const id = item.id;
    return byId.get(String(id)) || item;
  });
}
function resolveTimetableReferences(periods, masterData) {
  return periods.map((period) => ({
    ...period,
    kl: resolveReferences(period.kl, masterData.klassen),
    te: resolveReferences(period.te, masterData.teachers),
    su: resolveReferences(period.su, masterData.subjects),
    ro: resolveReferences(period.ro, masterData.rooms),
    origTe: resolveReferences(period.origTe, masterData.teachers),
    origRo: resolveReferences(period.origRo, masterData.rooms),
    origSu: resolveReferences(period.origSu, masterData.subjects)
  }));
}
function normalizeLessons(periods) {
  return periods.map(normalizeLesson).sort((a, b) => `${a.date}${a.startTime}${a.id}`.localeCompare(`${b.date}${b.startTime}${b.id}`));
}
function durationMinutes(startTime, endTime) {
  const start = /^([0-9]{2}):([0-9]{2})$/.exec(startTime);
  const end = /^([0-9]{2}):([0-9]{2})$/.exec(endTime);
  if (!start || !end) {
    return 0;
  }
  const startMinutes = Number(start[1]) * 60 + Number(start[2]);
  const endMinutes = Number(end[1]) * 60 + Number(end[2]);
  return Math.max(0, endMinutes - startMinutes);
}
function buildLessonComparison(lessons) {
  return lessons.map((lesson, index) => {
    const subject = lesson.subjectLong || lesson.subject;
    return {
      lessonNumber: index + 1,
      date: lesson.date,
      original: {
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        subject: lesson.originalSubject || subject,
        subjectLong: lesson.originalSubjectLong || lesson.originalSubject || subject,
        teacher: lesson.originalTeacher || lesson.teacher,
        teacherLong: lesson.originalTeacherLong || lesson.originalTeacher || lesson.teacherLong || lesson.teacher,
        room: lesson.originalRoom || lesson.room,
        roomLong: lesson.originalRoomLong || lesson.originalRoom || lesson.roomLong || lesson.room,
        class: lesson.class,
        classLong: lesson.classLong
      },
      actual: {
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        subject,
        subjectLong: lesson.subjectLong || subject,
        teacher: lesson.teacher,
        teacherLong: lesson.teacherLong || lesson.teacher,
        room: lesson.room,
        roomLong: lesson.roomLong || lesson.room,
        class: lesson.class,
        classLong: lesson.classLong
      },
      status: lesson.status,
      changed: lesson.changed,
      cancelled: lesson.cancelled,
      substitution: lesson.substitution
    };
  });
}
function summarizeTimetable(lessons) {
  var _a, _b, _c, _d, _e, _f;
  const subjects = lessons.map((lesson) => lesson.subjectLong || lesson.subject).filter((subject, index, values) => subject !== "" && values.indexOf(subject) === index);
  return {
    hasSchool: lessons.length > 0,
    lessonCount: lessons.length,
    // Cancelled lessons count as periods but have no actual teaching duration.
    lessonDurationMinutes: lessons.reduce(
      (total, lesson) => total + (lesson.cancelled ? 0 : durationMinutes(lesson.startTime, lesson.endTime)),
      0
    ),
    schoolStart: ((_a = lessons[0]) == null ? void 0 : _a.startTime) || "",
    schoolEnd: ((_b = lessons.at(-1)) == null ? void 0 : _b.endTime) || "",
    subjects: subjects.join(", "),
    subjectCount: subjects.length,
    firstSubject: ((_c = lessons[0]) == null ? void 0 : _c.subjectLong) || ((_d = lessons[0]) == null ? void 0 : _d.subject) || "",
    lastSubject: ((_e = lessons.at(-1)) == null ? void 0 : _e.subjectLong) || ((_f = lessons.at(-1)) == null ? void 0 : _f.subject) || "",
    hasChanges: lessons.some((lesson) => lesson.changed || Boolean(lesson.substitution)),
    changeCount: lessons.filter((lesson) => lesson.changed || Boolean(lesson.substitution)).length,
    cancellationCount: lessons.filter((lesson) => lesson.cancelled).length
  };
}
function dateNumber(date) {
  return Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  );
}
function nextWeekday(date, targetWeekday) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const currentWeekday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() + (targetWeekday - currentWeekday + 7) % 7);
  return result;
}
function dayRange(date) {
  return { startDate: dateNumber(date), endDate: dateNumber(date) };
}
function weekRange(date) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { startDate: dateNumber(start), endDate: dateNumber(end) };
}
function splitTimetable(lessons, today) {
  const todayKey = dateNumber(today).toString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = dateNumber(tomorrow).toString();
  const dateKey = (value) => value.replaceAll("-", "");
  return {
    today: lessons.filter((lesson) => dateKey(lesson.date) === todayKey),
    tomorrow: lessons.filter((lesson) => dateKey(lesson.date) === tomorrowKey),
    week: lessons
  };
}
function assertTimetableResponse(value) {
  if (!Array.isArray(value) || !value.every((period) => typeof period === "object" && period !== null)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertTimetableResponse,
  buildLessonComparison,
  dateNumber,
  dayRange,
  lessonChannelName,
  nextWeekday,
  normalizeLesson,
  normalizeLessons,
  resolveTimetableReferences,
  splitTimetable,
  summarizeTimetable,
  weekRange
});
//# sourceMappingURL=Timetable.js.map
