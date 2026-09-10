/* eslint-disable jsdoc/require-jsdoc */

export interface HolidayEntry {
	id: number | string | null;
	name: string;
	longName: string;
	startDate: string;
	endDate: string;
}

export interface HolidayDaySummary {
	name: string;
	longName: string;
	startDate: string;
	endDate: string;
}

export interface HolidaySummary {
	current: HolidayDaySummary & { active: boolean };
	next: HolidayDaySummary & { daysUntil: number };
}

const EMPTY_DAY = { name: "", longName: "", startDate: "", endDate: "" };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function datePart(value: unknown): string | null {
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

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function localDatePart(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daySerial(value: string): number {
	const [year, month, day] = value.split("-").map(Number);
	return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function emptySummary(): HolidaySummary {
	return {
		current: { ...EMPTY_DAY, active: false },
		next: { ...EMPTY_DAY, daysUntil: 0 },
	};
}

export function normalizeHolidayEntries(value: unknown): HolidayEntry[] {
	if (!Array.isArray(value)) {
		throw new Error("Invalid WebUntis holiday result");
	}
	return value.flatMap(item => {
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
				endDate,
			},
		];
	});
}

export function summarizeHolidays(entries: HolidayEntry[], now: Date): HolidaySummary {
	const today = localDatePart(now);
	const sorted = [...entries].sort((left, right) => left.startDate.localeCompare(right.startDate));
	const current = sorted.find(entry => entry.startDate <= today && entry.endDate >= today);
	const next = sorted.find(entry => entry.startDate > today);
	const result = emptySummary();
	if (current) {
		result.current = {
			name: current.name,
			longName: current.longName || current.name,
			startDate: current.startDate,
			endDate: current.endDate,
			active: true,
		};
	}
	if (next) {
		result.next = {
			name: next.name,
			longName: next.longName || next.name,
			startDate: next.startDate,
			endDate: next.endDate,
			daysUntil: daySerial(next.startDate) - daySerial(today),
		};
	}
	return result;
}

export class HolidayCache {
	private entries: HolidayEntry[] | null = null;
	private fetchedAt = 0;

	public constructor(private readonly ttlMs = 6 * 60 * 60 * 1000) {}

	public async get(now: Date, loader: () => Promise<unknown>): Promise<HolidayEntry[] | null> {
		if (this.entries && now.getTime() - this.fetchedAt < this.ttlMs) {
			return this.entries;
		}
		const entries = normalizeHolidayEntries(await loader());
		this.entries = entries;
		this.fetchedAt = now.getTime();
		return entries;
	}
}
