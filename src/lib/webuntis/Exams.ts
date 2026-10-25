import { WebUntisError } from "./WebUntisErrors";

/** A normalized WebUntis exam. */
export interface UpcomingExam {
	/** Stable WebUntis exam identifier. */
	id: number;
	/** Subject name. */
	subject: string;
	/** Local calendar date in YYYY-MM-DD format. */
	date: string;
	/** Local start time in HH:mm format. */
	startTime: string;
	/** Local end time in HH:mm format. */
	endTime: string;
	/** WebUntis exam name. */
	name: string;
	/** Additional WebUntis exam text. */
	text: string;
	/** Human-readable exam summary. */
	displayText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseDate(value: unknown): { date: string; sortKey: number } | null {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 10000101 || value > 99991231) {
		return null;
	}
	const year = Math.floor(value / 10000);
	const month = Math.floor((value % 10000) / 100);
	const day = value % 100;
	if (!isCalendarDate(year, month, day)) {
		return null;
	}
	return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, sortKey: value };
}

function parseTime(value: unknown): string | null {
	if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2359) {
		const hour = Math.floor(value / 100);
		const minute = value % 100;
		return hour <= 23 && minute <= 59
			? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
			: null;
	}
	if (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
		return value;
	}
	return null;
}

function optionalText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function displayDate(date: string): string {
	const [year, month, day] = date.split("-");
	return `${day}.${month}.${year}`;
}

/**
 * Convert and validate the WebUntis exams payload.
 *
 * @param raw The WebUntis exams response or its exam array.
 * @param now The current local date used to select upcoming exams.
 */
export function normalizeUpcomingExams(raw: unknown, now: Date): UpcomingExam[] {
	const exams = Array.isArray(raw)
		? raw
		: isRecord(raw) && isRecord(raw.data) && Array.isArray(raw.data.exams)
			? raw.data.exams
			: null;
	if (!exams) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exams response");
	}
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 90);
	const startKey = start.getFullYear() * 10000 + (start.getMonth() + 1) * 100 + start.getDate();
	const endKey = end.getFullYear() * 10000 + (end.getMonth() + 1) * 100 + end.getDate();
	const byId = new Map<number, { exam: UpcomingExam; dateKey: number; startMinute: number }>();
	for (const rawExam of exams) {
		if (!isRecord(rawExam)) {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exam entry");
		}
		const id = rawExam.id;
		const parsedDate = parseDate(rawExam.examDate);
		const startTime = parseTime(rawExam.startTime);
		const endTime = parseTime(rawExam.endTime);
		if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0 || !parsedDate || !startTime || !endTime) {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exam entry");
		}
		if (parsedDate.sortKey < startKey || parsedDate.sortKey > endKey) {
			continue;
		}
		const subject = optionalText(rawExam.subject);
		const name = optionalText(rawExam.name);
		const text = optionalText(rawExam.text);
		const details = [displayDate(parsedDate.date), `${startTime}–${endTime}`, subject, text || name].filter(
			Boolean,
		);
		const exam: UpcomingExam = {
			id,
			subject,
			date: parsedDate.date,
			startTime,
			endTime,
			name,
			text,
			displayText: details.join(" · "),
		};
		if (!byId.has(id)) {
			byId.set(id, {
				exam,
				dateKey: parsedDate.sortKey,
				startMinute: Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)),
			});
		}
	}
	return [...byId.values()]
		.sort((a, b) => a.dateKey - b.dateKey || a.startMinute - b.startMinute || a.exam.id - b.exam.id)
		.map(entry => entry.exam);
}
