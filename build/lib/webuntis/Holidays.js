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
var Holidays_exports = {};
__export(Holidays_exports, {
  HolidayCache: () => HolidayCache,
  normalizeHolidayEntries: () => normalizeHolidayEntries,
  summarizeHolidays: () => summarizeHolidays
});
module.exports = __toCommonJS(Holidays_exports);
const EMPTY_DAY = { name: "", longName: "", startDate: "", endDate: "" };
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function datePart(value) {
  if (typeof value === "number" && Number.isInteger(value)) {
    value = String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    return null;
  }
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function localDatePart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function daySerial(value) {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 864e5);
}
function emptySummary() {
  return {
    current: { ...EMPTY_DAY, active: false },
    next: { ...EMPTY_DAY, daysUntil: 0 }
  };
}
function normalizeHolidayEntries(value) {
  if (!Array.isArray(value)) {
    throw new Error("Invalid WebUntis holiday result");
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const startDate = datePart(item.startDate);
    const endDate = datePart(item.endDate);
    if (!startDate || !endDate || startDate > endDate) {
      return [];
    }
    return [
      {
        id: typeof item.id === "number" || typeof item.id === "string" ? item.id : null,
        name: text(item.name),
        longName: text(item.longName),
        startDate,
        endDate
      }
    ];
  });
}
function summarizeHolidays(entries, now) {
  const today = localDatePart(now);
  const sorted = [...entries].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const current = sorted.find((entry) => entry.startDate <= today && entry.endDate >= today);
  const next = sorted.find((entry) => entry.startDate > today);
  const result = emptySummary();
  if (current) {
    result.current = {
      name: current.name,
      longName: current.longName || current.name,
      startDate: current.startDate,
      endDate: current.endDate,
      active: true
    };
  }
  if (next) {
    result.next = {
      name: next.name,
      longName: next.longName || next.name,
      startDate: next.startDate,
      endDate: next.endDate,
      daysUntil: daySerial(next.startDate) - daySerial(today)
    };
  }
  return result;
}
class HolidayCache {
  constructor(ttlMs = 6 * 60 * 60 * 1e3) {
    this.ttlMs = ttlMs;
  }
  entries = null;
  fetchedAt = 0;
  async get(now, loader) {
    if (this.entries && now.getTime() - this.fetchedAt < this.ttlMs) {
      return this.entries;
    }
    const entries = normalizeHolidayEntries(await loader());
    this.entries = entries;
    this.fetchedAt = now.getTime();
    return entries;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HolidayCache,
  normalizeHolidayEntries,
  summarizeHolidays
});
//# sourceMappingURL=Holidays.js.map
