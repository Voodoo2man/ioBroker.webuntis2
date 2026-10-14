import * as utils from "@iobroker/adapter-core";
import { cleanupLegacyNamespace } from "./lib/LegacyNamespaceCleanup";
import { removeStaleLessonStates } from "./lib/LessonStateCleanup";
import {
	hasObjectValueChanged,
	isGeneratedLessonName,
	needsNameMigration,
	translatedLessonFallback,
	translatedName,
	translatedStateName,
	translatedTimetableGroup,
	translatedWeekday,
} from "./lib/ObjectTranslations";
import { deriveCurrentNextLesson, type CurrentNextLessonSummary } from "./lib/webuntis/CurrentNextLesson";
import type { HolidaySummary } from "./lib/webuntis/Holidays";
import {
	lessonChannelName,
	nextWeekday,
	summarizeTimetable,
	type TimetableLesson,
	type TimetableSummary,
} from "./lib/webuntis/Timetable";
import { WebUntisError } from "./lib/webuntis/WebUntisErrors";
import { WebUntisService, type WebUntisConnectionConfig } from "./lib/webuntis/WebUntisService";
import type { WebUntisHttpDiagnostic } from "./lib/webuntis/WebUntisTypes";

const TIMETABLE_INTERVAL_MS = 5 * 60 * 1000;
const CURRENT_NEXT_INTERVAL_MS = 60 * 1000;
const TIMETABLE_GROUPS = ["today", "tomorrow", "week"] as const;
type TimetableGroup = (typeof TIMETABLE_GROUPS)[number];

const SUMMARY_STATE_DEFINITIONS: Record<
	keyof TimetableSummary,
	{
		type: "string" | "number" | "boolean";
		role: string;
		name: ioBroker.Translated;
		def: string | number | boolean;
		unit?: string;
	}
> = {
	hasSchool: { type: "boolean", role: "indicator", name: translatedName("hasSchool"), def: false },
	lessonCount: { type: "number", role: "value", name: translatedName("lessonCount"), def: 0 },
	lessonDurationMinutes: {
		type: "number",
		role: "value.timer",
		name: translatedName("lessonDurationMinutes"),
		def: 0,
		unit: "min",
	},
	schoolStart: { type: "string", role: "text", name: translatedName("schoolStart"), def: "" },
	schoolEnd: { type: "string", role: "text", name: translatedName("schoolEnd"), def: "" },
	subjects: { type: "string", role: "text", name: translatedName("subjects"), def: "" },
	subjectCount: { type: "number", role: "value", name: translatedName("subjectCount"), def: 0 },
	firstSubject: { type: "string", role: "text", name: translatedName("firstSubject"), def: "" },
	lastSubject: { type: "string", role: "text", name: translatedName("lastSubject"), def: "" },
	hasChanges: { type: "boolean", role: "indicator", name: translatedName("hasChanges"), def: false },
	changeCount: { type: "number", role: "value", name: translatedName("changeCount"), def: 0 },
	cancellationCount: { type: "number", role: "value", name: translatedName("cancellationCount"), def: 0 },
};

const LESSON_STATE_NAMES: Record<string, ioBroker.Translated> = {
	date: translatedName("date"),
	dateTimestamp: translatedName("dateTimestamp"),
	startTime: translatedName("startTime"),
	endTime: translatedName("endTime"),
	subject: translatedName("subject"),
	subjectLong: translatedName("subjectLong"),
	teacher: translatedName("teacher"),
	room: translatedName("room"),
	class: translatedName("class"),
	lessonId: translatedName("lessonId"),
	periodId: translatedName("periodId"),
	status: translatedName("status"),
	changed: translatedName("changed"),
	cancelled: translatedName("cancelled"),
	substitution: translatedName("substitution"),
	originalTeacher: translatedName("originalTeacher"),
	originalRoom: translatedName("originalRoom"),
	originalSubject: translatedName("originalSubject"),
};

const CURRENT_NEXT_STATE_DEFINITIONS: Record<
	keyof CurrentNextLessonSummary,
	{
		type: "string" | "number" | "boolean";
		role: string;
		name: ioBroker.Translated;
		def: string | number | boolean;
		unit?: string;
	}
> = {
	currentLesson: { type: "string", role: "text", name: translatedName("currentLesson"), def: "" },
	currentSubject: { type: "string", role: "text", name: translatedName("currentSubject"), def: "" },
	currentRoom: { type: "string", role: "text", name: translatedName("currentRoom"), def: "" },
	currentTeacher: { type: "string", role: "text", name: translatedName("currentTeacher"), def: "" },
	nextLesson: { type: "string", role: "text", name: translatedName("nextLesson"), def: "" },
	nextSubject: { type: "string", role: "text", name: translatedName("nextSubject"), def: "" },
	nextRoom: { type: "string", role: "text", name: translatedName("nextRoom"), def: "" },
	nextTeacher: { type: "string", role: "text", name: translatedName("nextTeacher"), def: "" },
	nextLessonStart: { type: "string", role: "text", name: translatedName("nextLessonStart"), def: "" },
	minutesUntilNextLesson: {
		type: "number",
		role: "value.interval",
		name: translatedName("minutesUntilNextLesson"),
		def: 0,
		unit: "m",
	},
	schoolRunning: { type: "boolean", role: "indicator", name: translatedName("schoolRunning"), def: false },
	minutesUntilSchoolEnd: {
		type: "number",
		role: "value.interval",
		name: translatedName("minutesUntilSchoolEnd"),
		def: 0,
		unit: "m",
	},
};

function dateOnly(value: string): string {
	return value.trim().split(/[T ]/, 1)[0] || "";
}

function numericDate(value: string): number {
	const [year, month, day] = dateOnly(value).split("-").map(Number);
	return year && month && day ? new Date(year, month - 1, day).getTime() : 0;
}

class WebuntisNext extends utils.Adapter {
	private readonly webUntis: WebUntisService;
	private timetableTimer?: ioBroker.Timeout;
	private currentNextTimer?: ioBroker.Timeout;
	private todayLessons: TimetableLesson[] = [];
	private unloaded = false;
	private readonly migratedNames = new Set<string>();

	private async ensureTranslatedObject(
		id: string,
		object: ioBroker.SettableObject,
		legacyName?: string,
		dynamicName = false,
	): Promise<void> {
		await this.setObjectNotExistsAsync(id, object);
		if (!legacyName || (!dynamicName && this.migratedNames.has(id))) {
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
		const shouldMigrateName =
			needsNameMigration(currentName, legacyName) || (dynamicName && isGeneratedLessonName(currentName));
		const desiredCommon = (object.common || {}) as Record<string, unknown>;
		const common: Record<string, unknown> = {};
		for (const key of ["type", "role", "read", "write", "def"]) {
			if (key in desiredCommon && hasObjectValueChanged(existing.common[key], desiredCommon[key])) {
				common[key] = desiredCommon[key];
			}
		}
		if ("unit" in desiredCommon && hasObjectValueChanged(existing.common.unit, desiredCommon.unit)) {
			common.unit = desiredCommon.unit;
		} else if (
			!("unit" in desiredCommon) &&
			existing.common.type === "number" &&
			"unit" in existing.common &&
			hasObjectValueChanged(existing.common.unit, "")
		) {
			common.unit = "";
		}
		if (shouldMigrateName && hasObjectValueChanged(existing.common.name, object.common?.name)) {
			common.name = object.common?.name;
		}
		if (Object.keys(common).length) {
			await this.extendObjectAsync(id, { common });
		}
	}

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: "webuntis2" });
		this.webUntis = new WebUntisService(
			this.logHttpDiagnostic.bind(this),
			message => this.log.info(message),
			message => this.log.warn(message),
			fetch,
			message => this.log.debug(message),
		);
		this.on("ready", this.onReady.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	private logHttpDiagnostic(diagnostic: WebUntisHttpDiagnostic): void {
		this.log.debug(`WebUntis ${diagnostic.method || "request"} HTTP ${JSON.stringify(diagnostic)}`);
	}

	private async onReady(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.ensureTranslatedObject(
			"info",
			{ type: "channel", common: { name: translatedName("information") }, native: {} },
			"Information",
		);
		await this.ensureTranslatedObject(
			"info.connection",
			{
				type: "state",
				common: {
					name: translatedName("deviceOrServiceConnected"),
					type: "boolean",
					role: "indicator.connected",
					read: true,
					write: false,
				},
				native: {},
			},
			"Device or service connected",
		);
		await this.ensureTranslatedObject(
			"info.lastUpdate",
			{
				type: "state",
				common: {
					name: translatedName("lastUpdateAttempt"),
					type: "string",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			},
			"Last timetable update attempt",
		);
		await this.ensureTranslatedObject(
			"info.lastSuccessfulUpdate",
			{
				type: "state",
				common: {
					name: translatedName("lastSuccessfulUpdate"),
					type: "string",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			},
			"Last successful timetable update",
		);
		await this.ensureTranslatedObject(
			"info.nextUpdate",
			{
				type: "state",
				common: {
					name: translatedName("nextUpdate"),
					type: "string",
					role: "date",
					read: true,
					write: false,
				},
				native: {},
			},
			"Next timetable update",
		);
		await this.setState("info.connection", false, true);
		if (!this.hasConnectionConfig()) {
			return;
		}
		await this.updateTimetable();
		this.scheduleTimetableUpdate();
		this.scheduleCurrentNextUpdate();
	}

	private scheduleTimetableUpdate(): void {
		if (this.unloaded) {
			return;
		}
		this.timetableTimer = this.setTimeout(() => {
			this.timetableTimer = undefined;
			void this.updateTimetable()
				.catch(error => this.log.error(`Unexpected timetable update error: ${error}`))
				.finally(() => this.scheduleTimetableUpdate());
		}, TIMETABLE_INTERVAL_MS);
	}

	private scheduleCurrentNextUpdate(): void {
		if (this.unloaded) {
			return;
		}
		this.currentNextTimer = this.setTimeout(() => {
			this.currentNextTimer = undefined;
			void this.updateCurrentNextStates()
				.catch(error => this.log.error(`Unexpected current/next update error: ${error}`))
				.finally(() => this.scheduleCurrentNextUpdate());
		}, CURRENT_NEXT_INTERVAL_MS);
	}

	private hasConnectionConfig(): this is { config: WebUntisConnectionConfig } {
		return Boolean(
			this.config.server &&
			this.config.schoolName &&
			typeof this.config.schoolId === "number" &&
			this.config.username &&
			this.config.password,
		);
	}

	private async updateTimetable(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.setState("info.lastUpdate", new Date().toISOString(), true);
		try {
			await cleanupLegacyNamespace(this, "messages");
			await this.ensureTimetableRoot();
			await this.ensureHolidaysRoot();
			await this.cleanupObsoleteStructure();
			const now = new Date();
			const data = await this.webUntis.loadTimetable(this.config, now);
			if (this.unloaded) {
				return;
			}
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
			this.log.debug(`Timetable updated: ${updated} lessons updated, ${removed} obsolete lessons removed`);
		} catch (error) {
			if (this.unloaded) {
				return;
			}
			await this.setState("info.connection", false, true);
			await this.setState("info.nextUpdate", new Date(Date.now() + TIMETABLE_INTERVAL_MS).toISOString(), true);
			const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
			const detail = error instanceof Error ? ` (${error.message})` : "";
			this.log.warn(`Timetable update failed: ${code}${detail}; existing timetable data was kept`);
		}
	}

	private async ensureTimetableRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"timetable",
			{
				type: "channel",
				common: { name: translatedName("timetable") },
				native: {},
			},
			"Timetable",
		);
	}

	private async ensureHolidaysRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"holidays",
			{
				type: "channel",
				common: { name: translatedName("holidays") },
				native: {},
			},
			"Holidays",
		);
		await this.ensureTranslatedObject(
			"holidays.current",
			{
				type: "channel",
				common: { name: translatedName("currentHoliday") },
				native: {},
			},
			"Current holiday",
		);
		await this.ensureTranslatedObject(
			"holidays.next",
			{
				type: "channel",
				common: { name: translatedName("nextHoliday") },
				native: {},
			},
			"Next holiday",
		);
	}

	private async writeHolidaySummary(summary: HolidaySummary): Promise<void> {
		await this.writeSimpleState(
			"holidays.current.active",
			summary.current.active,
			"Active",
			"boolean",
			"indicator",
			false,
		);
		await this.writeSimpleState("holidays.current.name", summary.current.name, "Name", "string", "text", "");
		await this.writeSimpleState(
			"holidays.current.longName",
			summary.current.longName,
			"Long name",
			"string",
			"text",
			"",
		);
		await this.writeSimpleState(
			"holidays.current.startDate",
			dateOnly(summary.current.startDate),
			"Start date",
			"string",
			"date",
			"",
		);
		await this.writeSimpleState(
			"holidays.current.startDateTimestamp",
			numericDate(summary.current.startDate),
			"Start date (Unix timestamp ms)",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(
			"holidays.current.endDate",
			dateOnly(summary.current.endDate),
			"End date",
			"string",
			"date",
			"",
		);
		await this.writeSimpleState(
			"holidays.current.endDateTimestamp",
			numericDate(summary.current.endDate),
			"End date (Unix timestamp ms)",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState("holidays.next.name", summary.next.name, "Name", "string", "text", "");
		await this.writeSimpleState("holidays.next.longName", summary.next.longName, "Long name", "string", "text", "");
		await this.writeSimpleState(
			"holidays.next.startDate",
			dateOnly(summary.next.startDate),
			"Start date",
			"string",
			"date",
			"",
		);
		await this.writeSimpleState(
			"holidays.next.startDateTimestamp",
			numericDate(summary.next.startDate),
			"Start date (Unix timestamp ms)",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(
			"holidays.next.endDate",
			dateOnly(summary.next.endDate),
			"End date",
			"string",
			"date",
			"",
		);
		await this.writeSimpleState(
			"holidays.next.daysUntil",
			summary.next.daysUntil,
			"Days until",
			"number",
			"value.interval",
			0,
			"d",
		);
		await this.writeSimpleState(
			"holidays.next.endDateTimestamp",
			numericDate(summary.next.endDate),
			"End date (Unix timestamp ms)",
			"number",
			"date",
			0,
		);
	}

	private async writeDaySummary(path: string, summary: TimetableSummary): Promise<void> {
		for (const [name, definition] of Object.entries(SUMMARY_STATE_DEFINITIONS) as [
			keyof TimetableSummary,
			(typeof SUMMARY_STATE_DEFINITIONS)[keyof TimetableSummary],
		][]) {
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
						...(definition.unit ? { unit: definition.unit } : {}),
					},
					native: {},
				},
				definition.name.en,
			);
			await this.setStateChangedAsync(`timetable.${path}.${name}`, summary[name], true);
		}
	}

	private async writeCurrentNextSummary(lessons: TimetableLesson[], now: Date): Promise<void> {
		const summary = deriveCurrentNextLesson(lessons, now);
		for (const [name, definition] of Object.entries(CURRENT_NEXT_STATE_DEFINITIONS) as [
			keyof CurrentNextLessonSummary,
			(typeof CURRENT_NEXT_STATE_DEFINITIONS)[keyof CurrentNextLessonSummary],
		][]) {
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
						...(definition.unit ? { unit: definition.unit } : {}),
					},
					native: {},
				},
				definition.name.en,
			);
			await this.setStateChangedAsync(`timetable.today.${name}`, summary[name], true);
		}
	}

	private async updateCurrentNextStates(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.writeCurrentNextSummary(this.todayLessons, new Date());
	}

	private async cleanupObsoleteStructure(): Promise<void> {
		for (const id of [
			"info.timetable",
			"timetable.timetable",
			"timetable.today.count",
			"timetable.tomorrow.count",
			"timetable.today.subjectsJson",
			"timetable.tomorrow.subjectsJson",
		]) {
			if (await this.getObjectAsync(id)) {
				await this.delObjectAsync(id, { recursive: true });
			}
		}
	}

	private async writeTimetableGroup(
		group: TimetableGroup,
		lessons: TimetableLesson[],
		now: Date,
	): Promise<{ updated: number; removed: number }> {
		await this.ensureTranslatedObject(
			`timetable.${group}`,
			{
				type: "channel",
				common: { name: translatedTimetableGroup(group) },
				native: {},
			},
			`Timetable ${group}`,
		);
		let removed = await this.removeLegacyLessons(group);
		if (group === "week") {
			const weekdayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
			const byDay = weekdayNames.map((_, index) => {
				const targetDate = this.timetableDate(nextWeekday(now, index));
				return lessons.filter(lesson => lesson.date === targetDate);
			});
			for (let index = 0; index < weekdayNames.length; index++) {
				const result = await this.writeTimetableDay(
					`timetable.week.${weekdayNames[index]}`,
					byDay[index],
					this.timetableDate(nextWeekday(now, index)),
				);
				await this.writeDaySummary(`week.${weekdayNames[index]}`, summarizeTimetable(byDay[index]));
				removed += result.removed;
			}
		} else {
			const day = new Date(now);
			if (group === "tomorrow") {
				day.setDate(day.getDate() + 1);
			}
			const result = await this.writeTimetableDay(`timetable.${group}`, lessons, this.timetableDate(day));
			await this.writeDaySummary(group, summarizeTimetable(lessons));
			if (group === "today") {
				await this.writeCurrentNextSummary(lessons, now);
			}
			removed += result.removed;
		}
		return { updated: lessons.length, removed };
	}

	private async removeLegacyLessons(group: TimetableGroup): Promise<number> {
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.timetable.${group}.`,
			endkey: `${this.namespace}.timetable.${group}.\uffff`,
		});
		const legacy = new Set<string>();
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

	private async writeTimetableDay(
		path: string,
		lessons: TimetableLesson[],
		date: string,
	): Promise<{ removed: number }> {
		const dayName = path.split(".").at(-1) || "Day";
		await this.ensureTranslatedObject(
			path,
			{
				type: "channel",
				common: { name: translatedWeekday(dayName) },
				native: {},
			},
			dayName,
		);
		await this.writeSimpleState(`${path}.date`, dateOnly(date), "Date", "string", "text", "");
		await this.writeSimpleState(
			`${path}.dateTimestamp`,
			numericDate(date),
			"Date (Unix timestamp ms)",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(`${path}.lessonCount`, lessons.length, "Lesson count", "number", "value", 0);
		await this.ensureTranslatedObject(
			`${path}.lessons`,
			{
				type: "channel",
				common: { name: translatedName("lessons") },
				native: {},
			},
			"Lessons",
		);
		const expected = new Set(lessons.map((_lesson, index) => String(index + 1).padStart(2, "0")));
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.${path}.lessons.`,
			endkey: `${this.namespace}.${path}.lessons.\uffff`,
		});
		const stale = new Set<string>();
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

	private timetableDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	}

	private async writeSimpleState(
		id: string,
		value: string | number | boolean,
		name: string,
		type: "string" | "number" | "boolean",
		role: string,
		def: string | number | boolean,
		unit?: string,
	): Promise<void> {
		await this.ensureTranslatedObject(
			id,
			{
				type: "state",
				common: {
					name: translatedStateName(name),
					type,
					role,
					read: true,
					write: false,
					def,
					...(unit ? { unit } : {}),
				},
				native: {},
			},
			name,
		);
		await this.setStateChangedAsync(id, value, true);
	}

	private async writeLesson(path: string, slot: string, lesson: TimetableLesson): Promise<void> {
		const base = `${path}.lessons.${slot}`;
		const label = lessonChannelName(lesson);
		await this.ensureTranslatedObject(
			base,
			{
				type: "channel",
				common: { name: label || translatedLessonFallback(slot) },
				native: {},
			},
			`Lesson ${slot}`,
			true,
		);
		const values: Record<
			string,
			{ value: string | number | boolean; type: "string" | "number" | "boolean"; role: string }
		> = {
			date: { value: dateOnly(lesson.date), type: "string", role: "text" },
			dateTimestamp: { value: numericDate(lesson.date), type: "number", role: "date" },
			startTime: { value: lesson.startTime, type: "string", role: "text" },
			endTime: { value: lesson.endTime, type: "string", role: "text" },
			subject: { value: lesson.subject, type: "string", role: "text" },
			subjectLong: { value: lesson.subjectLong, type: "string", role: "text" },
			teacher: { value: lesson.teacher, type: "string", role: "text" },
			room: { value: lesson.room, type: "string", role: "text" },
			class: { value: lesson.class, type: "string", role: "text" },
			...(lesson.lessonId === null
				? {}
				: { lessonId: { value: String(lesson.lessonId), type: "string" as const, role: "text" } }),
			...(lesson.periodId === null
				? {}
				: { periodId: { value: String(lesson.periodId), type: "string" as const, role: "text" } }),
			status: { value: lesson.status, type: "string", role: "text" },
			changed: { value: lesson.changed, type: "boolean", role: "indicator" },
			cancelled: { value: lesson.cancelled, type: "boolean", role: "indicator" },
			...(lesson.substitution
				? { substitution: { value: lesson.substitution, type: "string" as const, role: "text" } }
				: {}),
			...(lesson.originalTeacher && lesson.originalTeacher !== lesson.teacher
				? { originalTeacher: { value: lesson.originalTeacher, type: "string" as const, role: "text" } }
				: {}),
			...(lesson.originalRoom && lesson.originalRoom !== lesson.room
				? { originalRoom: { value: lesson.originalRoom, type: "string" as const, role: "text" } }
				: {}),
			...(lesson.originalSubject && lesson.originalSubject !== lesson.subject
				? { originalSubject: { value: lesson.originalSubject, type: "string" as const, role: "text" } }
				: {}),
		};
		await removeStaleLessonStates(base, values, this.getObjectAsync.bind(this), this.delObjectAsync.bind(this));
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
					},
					native: {},
				},
				typeof LESSON_STATE_NAMES[name]?.en === "string" ? LESSON_STATE_NAMES[name].en : name,
			);
			await this.setStateChangedAsync(`${base}.${name}`, item.value, true);
		}
	}

	private async onMessage(obj: ioBroker.Message): Promise<void> {
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
			const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
			this.log.warn(`WebUntis request failed: ${code}`);
			this.sendTo(obj.from, obj.command, { ok: false, code }, obj.callback);
		}
	}

	private getStringPayload(message: ioBroker.MessagePayload, key: string): string {
		if (
			typeof message !== "object" ||
			message === null ||
			typeof (message as Record<string, unknown>)[key] !== "string"
		) {
			throw new WebUntisError("INVALID_CONFIG", "Invalid message payload");
		}
		return (message as Record<string, unknown>)[key] as string;
	}

	private getConnectionPayload(message: ioBroker.MessagePayload): WebUntisConnectionConfig {
		if (typeof message !== "object" || message === null) {
			throw new WebUntisError("INVALID_CONFIG", "Invalid connection payload");
		}
		const value = message as Record<string, unknown>;
		const stringValue = (key: string): string => (typeof value[key] === "string" ? value[key] : "");
		return {
			server: stringValue("server"),
			schoolName: stringValue("schoolName"),
			schoolDisplayName: stringValue("schoolDisplayName"),
			schoolAddress: stringValue("schoolAddress"),
			schoolId: typeof value.schoolId === "number" ? value.schoolId : null,
			username: stringValue("username"),
			password: stringValue("password"),
		};
	}

	private onUnload(callback: () => void): void {
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
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new WebuntisNext(options);
} else {
	(() => new WebuntisNext())();
}
