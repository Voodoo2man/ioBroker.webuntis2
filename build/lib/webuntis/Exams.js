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
var Exams_exports = {};
__export(Exams_exports, {
  normalizeGuardianTimetableExams: () => normalizeGuardianTimetableExams,
  normalizeModernGuardianExams: () => normalizeModernGuardianExams,
  normalizeUpcomingExams: () => normalizeUpcomingExams
});
module.exports = __toCommonJS(Exams_exports);
var import_node_crypto = require("node:crypto");
var import_WebUntisErrors = require("./WebUntisErrors");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCalendarDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function parseDate(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 10000101 || value > 99991231) {
    return null;
  }
  const year = Math.floor(value / 1e4);
  const month = Math.floor(value % 1e4 / 100);
  const day = value % 100;
  if (!isCalendarDate(year, month, day)) {
    return null;
  }
  return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, sortKey: value };
}
function parseTime(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2359) {
    const hour = Math.floor(value / 100);
    const minute = value % 100;
    return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : null;
  }
  if (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return value;
  }
  return null;
}
function optionalText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
function displayDate(date) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}
function parseLocalDateTime(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isCalendarDate(year, month, day)) {
    return null;
  }
  return {
    date: year * 1e4 + month * 100 + day,
    time: Number(match[4]) * 100 + Number(match[5])
  };
}
function modernExamEntries(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (!isRecord(raw)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exams response");
  }
  const source = isRecord(raw.data) ? raw.data : raw;
  const groups = [source.examsDone, source.examsUpcoming, source.examsFuture];
  if (groups.some((group) => group !== void 0)) {
    if (!groups.every(Array.isArray)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exams response");
    }
    return groups.flatMap((group) => group);
  }
  if (Array.isArray(source.exams)) {
    return source.exams;
  }
  if (raw.data !== void 0 && Array.isArray(raw.data)) {
    return raw.data;
  }
  throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exams response");
}
function normalizeModernGuardianExams(raw) {
  return modernExamEntries(raw).flatMap((candidate) => {
    if (!isRecord(candidate)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
    }
    if (candidate.exam !== void 0 && !isRecord(candidate.exam)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
    }
    const exam = isRecord(candidate.exam) ? candidate.exam : candidate;
    if (exam.deleted === true) {
      return [];
    }
    const id = exam.examId;
    const start = parseLocalDateTime(exam.examStart);
    const end = parseLocalDateTime(exam.examEnd);
    const rawSubject = exam.subject;
    const subject = typeof rawSubject === "string" ? rawSubject.trim() : isRecord(rawSubject) && typeof rawSubject.displayName === "string" ? rawSubject.displayName.trim() : "";
    if (exam.examName !== void 0 && typeof exam.examName !== "string" || exam.examText !== void 0 && typeof exam.examText !== "string") {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
    }
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 || !start || !end || start.date !== end.date || end.time <= start.time || !subject) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
    }
    return [
      {
        id,
        subject,
        examDate: start.date,
        startTime: start.time,
        endTime: end.time,
        name: optionalText(exam.examName),
        text: optionalText(exam.examText)
      }
    ];
  });
}
function normalizeGuardianTimetableExams(raw, studentId, studentName = "") {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const timetable = isRecord(raw) && isRecord(raw.data) ? raw.data : raw;
  if (!isRecord(timetable) || !Array.isArray(timetable.days)) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian timetable response");
  }
  const exams = [];
  for (const day of timetable.days) {
    if (!isRecord(day) || !Array.isArray(day.gridEntries)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian timetable response");
    }
    for (const entry of day.gridEntries) {
      if (!isRecord(entry) || typeof entry.type !== "string" || !entry.type.toUpperCase().includes("EXAM")) {
        continue;
      }
      const duration = entry.duration;
      if (!isRecord(duration)) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
      }
      const start = parseLocalDateTime(duration.start);
      const end = parseLocalDateTime(duration.end);
      const subjects = [];
      const positionValues = Object.entries(entry).filter(([key]) => /^position\d+$/i.test(key)).map(([, value]) => value);
      if (Array.isArray(entry.positions)) {
        positionValues.push(...entry.positions);
      } else if (isRecord(entry.positions)) {
        positionValues.push(...Object.values(entry.positions));
      }
      for (const positions of positionValues) {
        const items = Array.isArray(positions) ? positions : isRecord(positions) ? [positions] : [];
        for (const rawPosition of items) {
          if (!isRecord(rawPosition)) {
            continue;
          }
          const current = rawPosition.current;
          const position = isRecord(current) ? current : rawPosition;
          const type = (_a = position.type) != null ? _a : rawPosition.type;
          if (typeof type !== "string" || type.toUpperCase() !== "SUBJECT") {
            continue;
          }
          const subjectValue = isRecord(current) ? (_e = (_d = (_c = (_b = current.longName) != null ? _b : current.displayName) != null ? _c : current.shortName) != null ? _d : current.name) != null ? _e : current.value : (_g = (_f = rawPosition.current) != null ? _f : rawPosition.value) != null ? _g : rawPosition.name;
          const values = Array.isArray(subjectValue) ? subjectValue : [subjectValue];
          for (const value of values) {
            let subject2;
            if (typeof value === "string") {
              subject2 = value;
            } else if (isRecord(value)) {
              subject2 = (_k = (_j = (_i = (_h = value.displayName) != null ? _h : value.longName) != null ? _i : value.shortName) != null ? _j : value.name) != null ? _k : value.value;
            }
            if (typeof subject2 === "string" && subject2.trim()) {
              subjects.push(subject2.trim());
            }
          }
        }
      }
      const subject = [...new Set(subjects)].join(", ");
      if (!start || !end || start.date !== end.date || end.time <= start.time || !subject) {
        throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis guardian exam entry");
      }
      const name = optionalText(entry.name);
      const description = [entry.lessonInfo, entry.lessonText, ...Array.isArray(entry.texts) ? entry.texts : []].map((value) => isRecord(value) ? value.text : value).map(optionalText).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" \xB7 ");
      const text = [subject, description].filter(Boolean).join(" \xB7 ");
      const identity = [studentId, start.date, start.time, end.time, subject, name, text].join("|");
      const id = (0, import_node_crypto.createHash)("sha1").update(identity).digest().readUInt32BE(0) || 1;
      exams.push({
        id,
        subject,
        examDate: start.date,
        startTime: start.time,
        endTime: end.time,
        name,
        text,
        studentId,
        studentName
      });
    }
  }
  return exams;
}
function normalizeUpcomingExams(raw, now) {
  const exams = Array.isArray(raw) ? raw : isRecord(raw) && isRecord(raw.data) && Array.isArray(raw.data.exams) ? raw.data.exams : null;
  if (!exams) {
    throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exams response");
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 90);
  const startKey = start.getFullYear() * 1e4 + (start.getMonth() + 1) * 100 + start.getDate();
  const endKey = end.getFullYear() * 1e4 + (end.getMonth() + 1) * 100 + end.getDate();
  const byId = /* @__PURE__ */ new Map();
  for (const rawExam of exams) {
    if (!isRecord(rawExam)) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exam entry");
    }
    const id = rawExam.id;
    const parsedDate = parseDate(rawExam.examDate);
    const startTime = parseTime(rawExam.startTime);
    const endTime = parseTime(rawExam.endTime);
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || !parsedDate || !startTime || !endTime) {
      throw new import_WebUntisErrors.WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exam entry");
    }
    if (parsedDate.sortKey < startKey || parsedDate.sortKey > endKey) {
      continue;
    }
    const subject = optionalText(rawExam.subject);
    const name = optionalText(rawExam.name) || optionalText(rawExam.examName);
    const text = optionalText(rawExam.text);
    const studentId = typeof rawExam.studentId === "number" ? rawExam.studentId : void 0;
    const studentName = optionalText(rawExam.studentName);
    const details = [displayDate(parsedDate.date), `${startTime}\u2013${endTime}`, subject, text || name].filter(
      Boolean
    );
    const exam = {
      id,
      subject,
      date: parsedDate.date,
      startTime,
      endTime,
      name,
      text,
      displayText: details.join(" \xB7 "),
      ...studentId === void 0 ? {} : { studentId },
      ...studentName ? { studentName } : {}
    };
    if (!byId.has(id)) {
      byId.set(id, {
        exam,
        dateKey: parsedDate.sortKey,
        startMinute: Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3))
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.dateKey - b.dateKey || a.startMinute - b.startMinute || a.exam.id - b.exam.id).map((entry) => entry.exam);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  normalizeGuardianTimetableExams,
  normalizeModernGuardianExams,
  normalizeUpcomingExams
});
//# sourceMappingURL=Exams.js.map
