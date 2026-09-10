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
var CurrentNextLesson_exports = {};
__export(CurrentNextLesson_exports, {
  deriveCurrentNextLesson: () => deriveCurrentNextLesson
});
module.exports = __toCommonJS(CurrentNextLesson_exports);
var import_Timetable = require("./Timetable");
const EMPTY_SUMMARY = {
  currentLesson: "",
  currentSubject: "",
  currentRoom: "",
  currentTeacher: "",
  nextLesson: "",
  nextSubject: "",
  nextRoom: "",
  nextTeacher: "",
  nextLessonStart: "",
  minutesUntilNextLesson: 0,
  schoolRunning: false,
  minutesUntilSchoolEnd: 0
};
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function lessonTime(date, time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }
  const result = new Date(date);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return Number.isNaN(result.getTime()) ? null : result.getTime();
}
function details(lesson) {
  return {
    currentLesson: (0, import_Timetable.lessonChannelName)(lesson),
    currentSubject: lesson.subjectLong || lesson.subject || "",
    currentRoom: lesson.room || "",
    currentTeacher: lesson.teacher || ""
  };
}
function nextDetails(lesson) {
  return {
    nextLesson: (0, import_Timetable.lessonChannelName)(lesson),
    nextSubject: lesson.subjectLong || lesson.subject || "",
    nextRoom: lesson.room || "",
    nextTeacher: lesson.teacher || "",
    nextLessonStart: lesson.startTime || ""
  };
}
function deriveCurrentNextLesson(lessons, now) {
  const nowMs = now.getTime();
  const activeLessons = lessons.filter((lesson) => lesson.date === localDate(now) && !lesson.cancelled).flatMap((lesson) => {
    const start = lessonTime(now, lesson.startTime);
    const end = lessonTime(now, lesson.endTime);
    return start === null || end === null ? [] : [{ lesson, start, end }];
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.lesson.id.localeCompare(b.lesson.id));
  if (!activeLessons.length) {
    return { ...EMPTY_SUMMARY };
  }
  const current = activeLessons.find((item) => item.start <= nowMs && nowMs < item.end);
  const next = activeLessons.find((item) => item.start > nowMs);
  const first = activeLessons[0];
  const last = activeLessons.at(-1);
  const schoolRunning = nowMs >= first.start && nowMs < last.end;
  return {
    ...EMPTY_SUMMARY,
    ...current ? details(current.lesson) : {},
    ...next ? {
      ...nextDetails(next.lesson),
      minutesUntilNextLesson: Math.ceil((next.start - nowMs) / 6e4)
    } : {},
    schoolRunning,
    minutesUntilSchoolEnd: schoolRunning ? Math.ceil((last.end - nowMs) / 6e4) : 0
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deriveCurrentNextLesson
});
//# sourceMappingURL=CurrentNextLesson.js.map
