/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/no-blank-blocks */

import { createHash } from "node:crypto";
import { WebUntisError } from "./WebUntisErrors";
import type { WebUntisPeriod } from "./WebUntisTypes";

/**
 *
 */
export interface TimetableLesson {
	/**
	 *
	 */
	id: string;
	/**
	 *
	 */
	date: string;
	/**
	 *
	 */
	startTime: string;
	/**
	 *
	 */
	endTime: string;
	/**
	 *
	 */
	subject: string;
	/**
	 *
	 */
	subjectLong: string;
	/**
	 *
	 */
	teacher: string;
	/**
	 *
	 */
	room: string;
	/**
	 *
	 */
	class: string;
	/**
	 *
	 */
	lessonId: number | null;
	/**
	 *
	 */
	periodId: number | null;
	/**
	 *
	 */
	status: string;
	/**
	 *
	 */
	changed: boolean;
	/**
	 *
	 */
	cancelled: boolean;
	/**
	 *
	 */
	substitution: string;
	/**
	 *
	 */
	originalTeacher: string;
	/**
	 *
	 */
	originalRoom: string;
	/**
	 *
	 */
	originalSubject: string;
}

export interface TimetableSummary {
	hasSchool: boolean;
	lessonCount: number;
	lessonDurationMinutes: number;
	schoolStart: string;
	schoolEnd: string;
	subjects: string;
	subjectCount: number;
	firstSubject: string;
	lastSubject: string;
	hasChanges: boolean;
	changeCount: number;
	cancellationCount: number;
}

export interface TimetableMasterData {
	subjects: WebUntisPeriod[];
	teachers: WebUntisPeriod[];
	rooms: WebUntisPeriod[];
	klassen: WebUntisPeriod[];
}

export function lessonChannelName(lesson: TimetableLesson): string {
	const time =
		lesson.startTime && lesson.endTime
			? `${lesson.startTime}–${lesson.endTime}`
			: lesson.startTime || lesson.endTime;
	return [time, lesson.subjectLong || lesson.subject, lesson.teacher, lesson.room]
		.map(value => value.trim())
		.filter(Boolean)
		.join(" · ");
}

function text(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function firstName(value: unknown, long = false): string {
	if (!Array.isArray(value) || !value.length || typeof value[0] !== "object" || value[0] === null) {
		return "";
	}
	const item = value[0] as Record<string, unknown>;
	return text(item[long ? "longname" : "name"] ?? item.longName ?? item.name);
}

function dateString(value: unknown): string {
	const raw = text(value);
	if (/^\d{8}$/.test(raw)) {
		return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`;
	}
	return raw;
}

function timeString(value: unknown): string {
	const raw = text(value).padStart(4, "0");
	return /^\d{4}$/.test(raw) ? `${raw.slice(0, 2)}:${raw.slice(2)}` : text(value);
}

function bool(value: unknown): boolean {
	return value === true || value === 1 || value === "1" || value === "true";
}

function stableId(period: WebUntisPeriod): string {
	const id = period.id ?? period.lessonId ?? period.periodId;
	if (typeof id === "number" || typeof id === "string") {
		return `period-${id}`;
	}
	const key = [period.date, period.startTime, period.endTime, firstName(period.su), firstName(period.kl)].join("|");
	return `period-${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
}

/**
 *
 */
export function normalizeLesson(period: WebUntisPeriod): TimetableLesson {
	const substitution = text(period.substText ?? period.substitution ?? period.subst);
	const cancelled = bool(period.cancelled ?? period.isCancelled ?? period.cancelledLesson);
	const changed =
		cancelled || Boolean(substitution) || Boolean(period.substTeacher ?? period.substRoom ?? period.substSubject);
	return {
		id: stableId(period),
		date: dateString(period.date),
		startTime: timeString(period.startTime),
		endTime: timeString(period.endTime),
		subject: firstName(period.su),
		subjectLong: firstName(period.su, true),
		teacher: firstName(period.te),
		room: firstName(period.ro),
		class: firstName(period.kl),
		lessonId: typeof period.id === "number" ? period.id : null,
		periodId: typeof period.periodId === "number" ? period.periodId : null,
		status: text(period.activityType ?? period.status),
		changed,
		cancelled,
		substitution,
		originalTeacher: firstName(period.origTe ?? period.originalTeacher),
		originalRoom: firstName(period.origRo ?? period.originalRoom),
		originalSubject: firstName(period.origSu ?? period.originalSubject),
	};
}

function resolveReferences(value: unknown, masterData: WebUntisPeriod[]): unknown {
	if (!Array.isArray(value)) {
		return value;
	}
	const byId = new Map(
		masterData.flatMap(item => {
			const id = item.id ?? item.elementId;
			return typeof id === "string" || typeof id === "number" ? [[String(id), item] as const] : [];
		}),
	);
	return value.map(item => {
		if (typeof item !== "object" || item === null) {
			return item;
		}
		const id = (item as Record<string, unknown>).id;
		return byId.get(String(id)) || item;
	});
}

export function resolveTimetableReferences(
	periods: WebUntisPeriod[],
	masterData: TimetableMasterData,
): WebUntisPeriod[] {
	return periods.map(period => ({
		...period,
		kl: resolveReferences(period.kl, masterData.klassen),
		te: resolveReferences(period.te, masterData.teachers),
		su: resolveReferences(period.su, masterData.subjects),
		ro: resolveReferences(period.ro, masterData.rooms),
		origTe: resolveReferences(period.origTe, masterData.teachers),
		origRo: resolveReferences(period.origRo, masterData.rooms),
		origSu: resolveReferences(period.origSu, masterData.subjects),
	}));
}

/**
 *
 */
export function normalizeLessons(periods: WebUntisPeriod[]): TimetableLesson[] {
	return periods
		.map(normalizeLesson)
		.sort((a, b) => `${a.date}${a.startTime}${a.id}`.localeCompare(`${b.date}${b.startTime}${b.id}`));
}

function durationMinutes(startTime: string, endTime: string): number {
	const start = /^([0-9]{2}):([0-9]{2})$/.exec(startTime);
	const end = /^([0-9]{2}):([0-9]{2})$/.exec(endTime);
	if (!start || !end) {
		return 0;
	}
	const startMinutes = Number(start[1]) * 60 + Number(start[2]);
	const endMinutes = Number(end[1]) * 60 + Number(end[2]);
	return Math.max(0, endMinutes - startMinutes);
}

export function summarizeTimetable(lessons: TimetableLesson[]): TimetableSummary {
	const subjects = lessons
		.map(lesson => lesson.subjectLong || lesson.subject)
		.filter((subject, index, values) => subject !== "" && values.indexOf(subject) === index);
	return {
		hasSchool: lessons.length > 0,
		lessonCount: lessons.length,
		// Cancelled lessons count as periods but have no actual teaching duration.
		lessonDurationMinutes: lessons.reduce(
			(total, lesson) => total + (lesson.cancelled ? 0 : durationMinutes(lesson.startTime, lesson.endTime)),
			0,
		),
		schoolStart: lessons[0]?.startTime || "",
		schoolEnd: lessons.at(-1)?.endTime || "",
		subjects: subjects.join(", "),
		subjectCount: subjects.length,
		firstSubject: lessons[0]?.subjectLong || lessons[0]?.subject || "",
		lastSubject: lessons.at(-1)?.subjectLong || lessons.at(-1)?.subject || "",
		hasChanges: lessons.some(lesson => lesson.changed || Boolean(lesson.substitution)),
		changeCount: lessons.filter(lesson => lesson.changed || Boolean(lesson.substitution)).length,
		cancellationCount: lessons.filter(lesson => lesson.cancelled).length,
	};
}

/**
 *
 */
export function dateNumber(date: Date): number {
	return Number(
		`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`,
	);
}

/**
 * Returns the next date for a weekday, including today.
 */
export function nextWeekday(date: Date, targetWeekday: number): Date {
	const result = new Date(date);
	result.setHours(12, 0, 0, 0);
	const currentWeekday = (result.getDay() + 6) % 7;
	result.setDate(result.getDate() + ((targetWeekday - currentWeekday + 7) % 7));
	return result;
}

/**
 *
 */
export function dayRange(date: Date): {
	/**
	 *
	 */
	startDate: number;
	/**
	 *
	 */
	endDate: number;
} {
	return { startDate: dateNumber(date), endDate: dateNumber(date) };
}

/**
 *
 */
export function weekRange(date: Date): {
	/**
	 *
	 */
	startDate: number;
	/**
	 *
	 */
	endDate: number;
} {
	const start = new Date(date);
	start.setHours(12, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	return { startDate: dateNumber(start), endDate: dateNumber(end) };
}

/**
 *
 */
export function splitTimetable(
	lessons: TimetableLesson[],
	today: Date,
): {
	/**
	 *
	 */
	today: TimetableLesson[];
	/**
	 *
	 */
	tomorrow: TimetableLesson[];
	/**
	 *
	 */
	week: TimetableLesson[];
} {
	const todayKey = dateNumber(today).toString();
	const tomorrow = new Date(today);
	tomorrow.setDate(today.getDate() + 1);
	const tomorrowKey = dateNumber(tomorrow).toString();
	const dateKey = (value: string): string => value.replaceAll("-", "");
	return {
		today: lessons.filter(lesson => dateKey(lesson.date) === todayKey),
		tomorrow: lessons.filter(lesson => dateKey(lesson.date) === tomorrowKey),
		week: lessons,
	};
}

/**
 *
 */
export function assertTimetableResponse(value: unknown): asserts value is WebUntisPeriod[] {
	if (!Array.isArray(value) || !value.every(period => typeof period === "object" && period !== null)) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
	}
}
