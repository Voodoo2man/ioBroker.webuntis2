import * as utils from "@iobroker/adapter-core";
import { cleanupLegacyNamespace } from "./lib/LegacyNamespaceCleanup";
import { setStateChangedOrInitialize } from "./lib/StateWriter";
import { removeStaleLessonStates } from "./lib/LessonStateCleanup";
import {
	hasObjectValueChanged,
	shouldMigrateDynamicName,
	needsNameMigration,
	translatedLessonFallback,
	translatedName,
	translatedStateName,
	translatedTimetableGroup,
	translatedWeekday,
} from "./lib/ObjectTranslations";
import { deriveCurrentNextLesson, type CurrentNextLessonSummary } from "./lib/webuntis/CurrentNextLesson";
import type { UpcomingExam } from "./lib/webuntis/Exams";
import type { HolidaySummary } from "./lib/webuntis/Holidays";
import {
	buildLessonComparison,
	lessonChannelName,
	nextWeekday,
	summarizeTimetable,
	type TimetableLesson,
	type TimetableSummary,
} from "./lib/webuntis/Timetable";
import { WebUntisError } from "./lib/webuntis/WebUntisErrors";
import { WebUntisService, type WebUntisConnectionConfig } from "./lib/webuntis/WebUntisService";
import type { WebUntisHttpDiagnostic, WebUntisInboxMessage } from "./lib/webuntis/WebUntisTypes";

const TIMETABLE_INTERVAL_MS = 5 * 60 * 1000;
const CURRENT_NEXT_INTERVAL_MS = 60 * 1000;
const EXAMS_MAX_ATTEMPTS = 3;
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
		role: "value",
		name: translatedName("lessonDurationMinutes"),
		def: 0,
		unit: "min",
	},
	schoolStart: { type: "string", role: "time", name: translatedName("schoolStart"), def: "" },
	schoolEnd: { type: "string", role: "time", name: translatedName("schoolEnd"), def: "" },
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
	teacherLong: translatedName("longName"),
	room: translatedName("room"),
	roomLong: translatedName("longName"),
	class: translatedName("class"),
	classLong: translatedName("longName"),
	lessonId: translatedName("lessonId"),
	periodId: translatedName("periodId"),
	status: translatedName("status"),
	changed: translatedName("changed"),
	cancelled: translatedName("cancelled"),
	substitution: translatedName("substitution"),
	originalTeacher: translatedName("originalTeacher"),
	originalTeacherLong: translatedName("longName"),
	originalRoom: translatedName("originalRoom"),
	originalRoomLong: translatedName("longName"),
	originalSubject: translatedName("originalSubject"),
	originalSubjectLong: translatedName("longName"),
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
	currentRoomLong: { type: "string", role: "text", name: translatedName("longName"), def: "" },
	currentTeacher: { type: "string", role: "text", name: translatedName("currentTeacher"), def: "" },
	currentTeacherLong: { type: "string", role: "text", name: translatedName("longName"), def: "" },
	nextLesson: { type: "string", role: "text", name: translatedName("nextLesson"), def: "" },
	nextSubject: { type: "string", role: "text", name: translatedName("nextSubject"), def: "" },
	nextRoom: { type: "string", role: "text", name: translatedName("nextRoom"), def: "" },
	nextRoomLong: { type: "string", role: "text", name: translatedName("longName"), def: "" },
	nextTeacher: { type: "string", role: "text", name: translatedName("nextTeacher"), def: "" },
	nextTeacherLong: { type: "string", role: "text", name: translatedName("longName"), def: "" },
	nextLessonStart: { type: "string", role: "text", name: translatedName("nextLessonStart"), def: "" },
	minutesUntilNextLesson: {
		type: "number",
		role: "value.timer",
		name: translatedName("minutesUntilNextLesson"),
		def: 0,
		unit: "min",
	},
	schoolRunning: { type: "boolean", role: "indicator", name: translatedName("schoolRunning"), def: false },
	minutesUntilSchoolEnd: {
		type: "number",
		role: "value.timer",
		name: translatedName("minutesUntilSchoolEnd"),
		def: 0,
		unit: "min",
	},
};

function dateOnly(value: string): string {
	return value.trim().split(/[T ]/, 1)[0] || "";
}

function numericDate(value: string): number {
	const [year, month, day] = dateOnly(value).split("-").map(Number);
	return year && month && day ? new Date(year, month - 1, day).getTime() : 0;
}

/** Main ioBroker adapter. */
class WebuntisNext extends utils.Adapter {
	private static readonly generatedLessonNameKey = "webuntis2GeneratedName";
	private readonly webUntis: WebUntisService;
	private timetableTimer?: ioBroker.Timeout;
	private currentNextTimer?: ioBroker.Timeout;
	private todayLessons: TimetableLesson[] = [];
	private childTodayLessons = new Map<number, { name: string; lessons: TimetableLesson[] }>();
	private hasTimetableSnapshot = false;
	private unloaded = false;
	private readonly migratedNames = new Set<string>();
	private lastMessageWarningAt = 0;
	private lastExamsWarningAt = 0;

	private async ensureTranslatedObject(
		id: string,
		object: ioBroker.SettableObject,
		legacyName?: string,
		dynamicName = false,
	): Promise<void> {
		this.ensureActive();
		await this.setObjectNotExistsAsync(id, object);
		this.ensureActive();
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
		const generatedName = existing.native?.[WebuntisNext.generatedLessonNameKey];
		const shouldMigrateName =
			needsNameMigration(currentName, legacyName) ||
			(dynamicName && shouldMigrateDynamicName(currentName, generatedName));
		const desiredCommon = (object.common || {}) as Record<string, unknown>;
		const common: Record<string, unknown> = {};
		for (const key of ["type", "role", "read", "write", "def"]) {
			if (key in desiredCommon && hasObjectValueChanged(existing.common[key], desiredCommon[key])) {
				common[key] = desiredCommon[key];
			}
		}
		if ("unit" in desiredCommon && hasObjectValueChanged(existing.common.unit, desiredCommon.unit)) {
			common.unit = desiredCommon.unit;
		} else if (desiredCommon.role === "date" && existing.common.unit !== undefined) {
			common.unit = null;
		}
		if (shouldMigrateName && hasObjectValueChanged(existing.common.name, object.common?.name)) {
			common.name = object.common?.name;
		}
		const native =
			dynamicName && object.native && typeof object.native === "object"
				? (object.native as Record<string, unknown>)
				: undefined;
		const shouldMigrateMarker =
			dynamicName &&
			native &&
			shouldMigrateName &&
			(typeof generatedName !== "string" || generatedName === currentName) &&
			hasObjectValueChanged(
				existing.native?.[WebuntisNext.generatedLessonNameKey],
				native[WebuntisNext.generatedLessonNameKey],
			);
		if (Object.keys(common).length || shouldMigrateMarker) {
			await this.extendObjectAsync(id, { common, ...(shouldMigrateMarker ? { native } : {}) });
		}
	}

	/** Throw when asynchronous work resumes after adapter shutdown. */
	private ensureActive(): void {
		if (this.unloaded) {
			throw new WebUntisError("ABORTED", "Adapter is shutting down");
		}
	}

	/**
	 * Create the WebUntis adapter.
	 *
	 * @param options Adapter constructor options.
	 */
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
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
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
		const fields: Array<[string, string, "string" | "number" | "boolean"]> = [
			["id", "Message ID", typeof sourceId?.val === "number" ? "number" : "string"],
			["dateTime", "Date and time", "string"],
			["sender", "Sender", "string"],
			["subject", "Subject", "string"],
			["content", "Content", "string"],
			["contentIsPreview", "Content is preview", "boolean"],
			["hasAttachments", "Has attachments", "boolean"],
			["readInWebUntis", "Read in WebUntis", "boolean"],
		];
		const channelRows = await this.getObjectListAsync({
			startkey: `${this.namespace}.inbox.messages.read.`,
			endkey: `${this.namespace}.inbox.messages.read.\uffff`,
		});
		const existingSlots = new Set<string>();
		for (const row of channelRows.rows || []) {
			const match = /^inbox\.messages\.read\.([^.]+)\./.exec(row.id.replace(`${this.namespace}.`, ""));
			if (match) {
				existingSlots.add(match[1]);
			}
		}
		const readMessages: Array<Record<string, ioBroker.StateValue>> = [];
		for (const slot of existingSlots) {
			const entry: Record<string, ioBroker.StateValue> = {};
			for (const [field] of fields) {
				const current = await this.getStateAsync(`inbox.messages.read.${slot}.${field}`);
				if (current?.val !== undefined && current.val !== null) {
					entry[field] = current.val;
				}
			}
			if (entry.id !== undefined && entry.id !== sourceId?.val) {
				readMessages.push(entry);
			}
		}
		const sourceMessage: Record<string, ioBroker.StateValue> = {};
		for (const [field] of fields) {
			const current = await this.getStateAsync(`${sourcePath}.${field}`);
			if (current?.val === undefined || current.val === null) {
				continue;
			}
			sourceMessage[field] = current.val;
		}
		sourceMessage.id = sourceId?.val ?? messageId;
		sourceMessage.read = true;
		sourceMessage.readInWebUntis = false;
		readMessages.push(sourceMessage);
		readMessages.sort((left, right) => String(left.dateTime ?? "").localeCompare(String(right.dateTime ?? "")));
		for (const slot of existingSlots) {
			await this.delObjectAsync(`inbox.messages.read.${slot}`, { recursive: true });
		}
		for (let index = 0; index < readMessages.length; index++) {
			const entry = readMessages[index];
			const slot = String(index + 1).padStart(2, "0");
			const targetPath = `inbox.messages.read.${slot}`;
			const entryId = entry.id ?? messageId;
			const entrySubject = typeof entry.subject === "string" ? entry.subject : `Message ${entryId}`;
			await this.ensureTranslatedObject(
				targetPath,
				{
					type: "channel",
					common: { name: entrySubject },
					native: { messageId: entryId },
				},
				"Read message",
			);
			for (const [field, name, type] of fields) {
				const value = entry[field];
				if (value === undefined || value === null) {
					continue;
				}
				const role =
					field === "dateTime"
						? "date"
						: type === "boolean"
							? "indicator"
							: type === "number"
								? "value"
								: "text";
				await this.writeSimpleState(
					`${targetPath}.${field}`,
					value,
					name,
					type,
					role,
					type === "boolean" ? false : type === "number" ? 0 : "",
				);
			}
			await this.writeSimpleState(`${targetPath}.read`, true, "Read", "boolean", "indicator", false);
			await this.writeSimpleState(
				`${targetPath}.readInWebUntis`,
				entry.readInWebUntis === true,
				"Read in WebUntis",
				"boolean",
				"indicator",
				false,
			);
		}
		await setStateChangedOrInitialize(this, "inbox.messages.read.count", readMessages.length);
		await this.setStateAsync(`${sourcePath}.markRead`, false, true);
		await this.delObjectAsync(sourcePath, { recursive: true });
		const unreadState = await this.getStateAsync("inbox.messages.unread.unread");
		if (typeof unreadState?.val === "string") {
			try {
				const unreadMessages = JSON.parse(unreadState.val) as WebUntisInboxMessage[];
				const remaining = unreadMessages.filter(message => String(message.id) !== String(sourceId?.val));
				await setStateChangedOrInitialize(this, "inbox.messages.unread.unread", JSON.stringify(remaining));
				await setStateChangedOrInitialize(this, "inbox.messages.unread.unreadCount", remaining.length);
			} catch {
				this.log.warn("Could not update the inbox unread summary after marking a message as read");
			}
		}
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
			"info.refresh",
			{
				type: "state",
				common: {
					name: translatedStateName("refresh"),
					type: "boolean",
					role: "button",
					read: false,
					write: true,
					def: false,
				},
				native: {},
			},
			"Refresh now",
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
			"info.accountType",
			{
				type: "state",
				common: {
					name: { en: "WebUntis account type", de: "WebUntis-Kontotyp" },
					type: "string",
					role: "text",
					read: true,
					write: false,
					def: "Unknown",
				},
				native: {},
			},
			"WebUntis account type",
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
			await this.ensureStudentsRoot();
			await this.ensureHolidaysRoot();
			const now = new Date();
			const data = await this.webUntis.loadTimetable(this.config, now);
			if (this.unloaded) {
				return;
			}
			const accountType = data.personType === 5 ? "Student" : data.personType === 12 ? "Parent" : "Other";
			await setStateChangedOrInitialize(this, "info.accountType", accountType);
			const students = data.children?.length
				? data.children
				: data.studentId
					? [{ id: data.studentId, name: `Student ${data.studentId}`, timetable: data }]
					: [];
			this.todayLessons = students[0]?.timetable.today ?? data.today;
			this.hasTimetableSnapshot = true;
			let updated = 0;
			let removed = 0;
			if (students.length) {
				this.childTodayLessons = new Map(
					students.map(student => [student.id, { name: student.name, lessons: student.timetable.today }]),
				);
				for (const child of students) {
					this.ensureActive();
					const childRoot = `students.student_${child.id}`;
					await this.ensureTranslatedObject(
						childRoot,
						{
							type: "channel",
							common: { name: child.name || `Student ${child.id}` },
							native: { studentId: child.id },
						},
						child.name || `Student ${child.id}`,
					);
					const timetableRoot = `${childRoot}.timetable`;
					await this.ensureTranslatedObject(
						timetableRoot,
						{ type: "channel", common: { name: translatedName("timetable") }, native: {} },
						"Timetable",
					);
					for (const group of TIMETABLE_GROUPS) {
						const result = await this.writeTimetableGroup(
							group,
							child.timetable[group],
							now,
							timetableRoot,
						);
						updated += result.updated;
						removed += result.removed;
					}
				}
				const existingChildren = await this.getObjectListAsync({
					startkey: `${this.namespace}.students.student_`,
					endkey: `${this.namespace}.students.student_\uffff`,
				});
				const expectedChildren = new Set(students.map(student => `student_${student.id}`));
				const staleChildren = new Set<string>();
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
					endkey: `${this.namespace}.students.student_\uffff`,
				});
				const staleChildren = new Set(
					(existingChildren.rows || [])
						.map(object => object.id.replace(`${this.namespace}.students.`, "").split(".")[0])
						.filter(childId => childId.startsWith("student_")),
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
				const warningIntervalMs = 30 * 60 * 1000;
				if (Date.now() - this.lastMessageWarningAt >= warningIntervalMs) {
					const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
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
					exams.map(exam =>
						data.studentId && exam.studentId === undefined
							? { ...exam, studentId: data.studentId, studentName: `Student ${data.studentId}` }
							: exam,
					),
					students.map(student => ({ id: student.id, name: student.name })),
					now,
				);
				this.lastExamsWarningAt = 0;
			} catch (error) {
				const warningIntervalMs = 30 * 60 * 1000;
				if (Date.now() - this.lastExamsWarningAt >= warningIntervalMs) {
					const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
					const detail = error instanceof Error ? ` (${error.message})` : "";
					this.log.warn(
						`WebUntis upcoming exams refresh failed: ${code}${detail}; previous exam data was kept`,
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
			const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
			const detail = error instanceof Error ? ` (${error.message})` : "";
			this.log.warn(`Timetable update failed: ${code}${detail}; existing timetable data was kept`);
		}
	}

	private async loadUpcomingExamsWithRetry(now: Date): Promise<UpcomingExam[]> {
		for (let attempt = 1; attempt <= EXAMS_MAX_ATTEMPTS; attempt++) {
			this.ensureActive();
			try {
				return await this.webUntis.loadUpcomingExams(this.config, now);
			} catch (error) {
				const transient =
					error instanceof WebUntisError && (error.code === "SERVER_UNREACHABLE" || error.code === "TIMEOUT");
				if (!transient || attempt === EXAMS_MAX_ATTEMPTS) {
					throw error;
				}
				this.log.debug(`WebUntis exams request attempt ${attempt}/${EXAMS_MAX_ATTEMPTS} failed; retrying`);
				await new Promise(resolve => setTimeout(resolve, attempt * 250));
			}
		}
		throw new Error("WebUntis exams retry loop ended unexpectedly");
	}

	private async ensureStudentsRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"students",
			{ type: "channel", common: { name: { en: "Students", de: "Schüler" } }, native: {} },
			"Students",
		);
	}

	private async cleanupLegacyDataRoots(): Promise<void> {
		for (const id of ["timetable", "exams", "children", "info.inbox"]) {
			if (await this.getObjectAsync(id)) {
				await this.delObjectAsync(id, { recursive: true });
			}
		}
		const existingStudents = await this.getObjectListAsync({
			startkey: `${this.namespace}.students.`,
			endkey: `${this.namespace}.students.\uffff`,
		});
		for (const object of existingStudents.rows || []) {
			const studentId = object.id.replace(`${this.namespace}.students.`, "").split(".")[0];
			if (/^\d+$/.test(studentId)) {
				await this.delObjectAsync(`students.${studentId}`, { recursive: true });
			}
		}
	}

	private async ensureInboxRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"inbox",
			{ type: "channel", common: { name: translatedName("inbox") }, native: {} },
			"Messages",
		);
		await this.ensureTranslatedObject(
			"inbox.messages",
			{ type: "channel", common: { name: "Messages" }, native: {} },
			"Messages",
		);
		await this.ensureTranslatedObject(
			"inbox.messages.unread",
			{ type: "channel", common: { name: { en: "Unread", de: "Ungelesen" } }, native: {} },
			"Unread",
		);
		await this.ensureTranslatedObject(
			"inbox.messages.unread.unreadCount",
			{
				type: "state",
				common: {
					name: translatedName("unreadMessagesCount"),
					type: "number",
					role: "value",
					read: true,
					write: false,
					def: 0,
				},
				native: {},
			},
			"Unread message count",
		);
		await this.ensureTranslatedObject(
			"inbox.messages.unread.unread",
			{
				type: "state",
				common: {
					name: translatedName("unreadMessages"),
					type: "string",
					role: "json",
					read: true,
					write: false,
					def: "[]",
				},
				native: {},
			},
			"Unread messages",
		);
		await this.ensureTranslatedObject(
			"inbox.messages.read",
			{ type: "channel", common: { name: { en: "Read", de: "Gelesen" } }, native: {} },
			"Read",
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
					def: 0,
				},
				native: {},
			},
			"Read message count",
		);
		const legacyCount = await this.getStateAsync("info.inbox.unreadCount");
		const legacyMessages = await this.getStateAsync("info.inbox.unread");
		const oldCount = await this.getStateAsync("inbox.unreadCount");
		const oldMessages = await this.getStateAsync("inbox.unread");
		await this.initializeRootState("inbox.messages.unread.unreadCount", oldCount?.val ?? legacyCount?.val ?? 0);
		await this.initializeRootState("inbox.messages.unread.unread", oldMessages?.val ?? legacyMessages?.val ?? "[]");
		await this.delObjectAsync("inbox.unreadCount");
		await this.delObjectAsync("inbox.unread");
	}

	private async initializeRootState(id: string, defaultValue: ioBroker.StateValue): Promise<void> {
		const current = await this.getStateAsync(id);
		await setStateChangedOrInitialize(this, id, current?.val ?? defaultValue);
	}

	private async writeUnreadMessages(messages: WebUntisInboxMessage[]): Promise<void> {
		const sortedMessages = [...messages].sort((left, right) => left.dateTime.localeCompare(right.dateTime));
		const unreadMessages: WebUntisInboxMessage[] = [];
		const locallyReadIds = new Set<string>();
		const existingRead = await this.getObjectListAsync({
			startkey: `${this.namespace}.inbox.messages.read.`,
			endkey: `${this.namespace}.inbox.messages.read.\uffff`,
		});
		for (const row of existingRead.rows || []) {
			const relativePath = row.id.replace(`${this.namespace}.`, "");
			if (!/^inbox\.messages\.read\.[^.]+\.id$/.test(relativePath)) {
				continue;
			}
			const messageId = await this.getStateAsync(relativePath);
			const read = await this.getStateAsync(relativePath.replace(/\.id$/, ".read"));
			if (messageId?.val !== undefined && read?.val === true) {
				locallyReadIds.add(String(messageId.val));
			}
		}
		for (const message of sortedMessages) {
			const locallyRead = locallyReadIds.has(String(message.id));
			if (!message.readInWebUntis && !locallyRead) {
				unreadMessages.push(message);
			}
		}
		await setStateChangedOrInitialize(this, "inbox.messages.unread.unreadCount", unreadMessages.length);
		await setStateChangedOrInitialize(this, "inbox.messages.unread.unread", JSON.stringify(unreadMessages));
		const messageRoot = "inbox.messages";
		const expected = new Set<string>();
		const slots: Record<"read" | "unread", number> = { read: 0, unread: 0 };
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
					native: { messageId: message.id },
				},
				message.subject || `Message ${message.id}`,
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
							def: false,
						},
						native: {},
					},
					"Mark as read",
				);
			}
			await this.writeSimpleState(
				`${messagePath}.read`,
				locallyRead || message.readInWebUntis,
				"Read",
				"boolean",
				"indicator",
				false,
			);
			await this.writeSimpleState(
				`${messagePath}.readInWebUntis`,
				message.readInWebUntis,
				"Read in WebUntis",
				"boolean",
				"indicator",
				false,
			);
			const fields: Array<[string, string, "string" | "number" | "boolean", string | number | boolean]> = [
				["id", "Message ID", typeof message.id === "number" ? "number" : "string", message.id],
				["dateTime", "Date and time", "string", message.dateTime],
				["sender", "Sender", "string", message.sender],
				["subject", "Subject", "string", message.subject],
				["content", "Content", "string", message.content],
				["contentIsPreview", "Content is preview", "boolean", message.contentIsPreview],
				["hasAttachments", "Has attachments", "boolean", message.hasAttachments],
			];
			for (const [field, name, type, value] of fields) {
				if (field === "id" && typeof message.id === "number") {
					await this.writeSimpleState(`${messagePath}.${field}`, message.id, name, "number", "value", 0);
					continue;
				}
				const role =
					field === "dateTime"
						? "date"
						: type === "boolean"
							? "indicator"
							: type === "number"
								? "value"
								: "text";
				const defaultValue = type === "boolean" ? false : type === "number" ? 0 : "";
				await this.writeSimpleState(`${messagePath}.${field}`, value, name, type, role, defaultValue);
			}
		}
		await setStateChangedOrInitialize(this, "inbox.messages.read.count", slots.read);
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.${messageRoot}.`,
			endkey: `${this.namespace}.${messageRoot}.\uffff`,
		});
		const stale = new Set<string>();
		for (const object of existing.rows || []) {
			const relativeId = object.id.replace(`${this.namespace}.${messageRoot}.`, "");
			const parts = relativeId.split(".");
			if (
				(parts[0] === "read" && parts[1] === "count") ||
				(parts[0] === "unread" && (parts[1] === "unreadCount" || parts[1] === "unread"))
			) {
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

	private async writeUpcomingExams(
		exams: UpcomingExam[],
		linkedChildren: Array<{ id: number; name: string }> = [],
		now: Date = new Date(),
	): Promise<void> {
		const students = new Map<number, UpcomingExam[]>();
		const studentNames = new Map(linkedChildren.map(student => [student.id, student.name]));
		for (const child of linkedChildren) {
			students.set(child.id, []);
		}
		for (const exam of exams) {
			if (exam.studentId === undefined) {
				continue;
			}
			const studentExams = students.get(exam.studentId) ?? [];
			studentExams.push(exam);
			students.set(exam.studentId, studentExams);
		}
		for (const [studentId, studentExams] of students) {
			this.ensureActive();
			const studentName =
				studentExams.find(exam => exam.studentName)?.studentName ||
				studentNames.get(studentId) ||
				`Student ${studentId}`;
			const studentRoot = `students.student_${studentId}`;
			await this.ensureTranslatedObject(
				studentRoot,
				{
					type: "channel",
					common: { name: studentName },
					native: { studentId, studentName },
				},
				studentName,
			);
			const examsRoot = `${studentRoot}.exams`;
			await this.ensureTranslatedObject(
				examsRoot,
				{ type: "channel", common: { name: translatedName("exams") }, native: {} },
				"Exams",
			);
			const childStates: Array<[string, string, ioBroker.StateCommon, ioBroker.StateValue]> = [
				[
					"count",
					"Upcoming exam count",
					{ name: "Upcoming exam count", type: "number", role: "value", read: true, write: false, def: 0 },
					studentExams.length,
				],
				[
					"upcoming",
					"Upcoming exams",
					{ name: "Upcoming exams", type: "string", role: "json", read: true, write: false, def: "[]" },
					JSON.stringify(studentExams),
				],
				[
					"upcomingText",
					"Upcoming exams text",
					{ name: "Upcoming exams text", type: "string", role: "text", read: true, write: false, def: "" },
					studentExams.map(exam => exam.displayText).join("\n"),
				],
			];
			for (const [name, label, common, value] of childStates) {
				const id = `${examsRoot}.${name}`;
				await this.ensureTranslatedObject(id, { type: "state", common, native: {} }, label);
				await setStateChangedOrInitialize(this, id, value);
			}
			const entriesRoot = `${examsRoot}.entries`;
			await this.ensureTranslatedObject(
				entriesRoot,
				{ type: "channel", common: { name: translatedName("upcomingExams") }, native: {} },
				"Upcoming exams",
			);
			const expected = new Set(studentExams.map((_exam, index) => String(index + 1).padStart(2, "0")));
			for (const [index, exam] of studentExams.entries()) {
				this.ensureActive();
				const slot = String(index + 1).padStart(2, "0");
				const base = `${entriesRoot}.${slot}`;
				const label = exam.displayText || translatedName("examFallback").en;
				await this.ensureTranslatedObject(
					base,
					{
						type: "channel",
						common: { name: label },
						native: { [WebuntisNext.generatedLessonNameKey]: label },
					},
					`Exam ${exam.id}`,
					true,
				);
				const [examYear, examMonth, examDay] = exam.date.split("-").map(Number);
				const values: Record<string, string | number> = {
					id: exam.id,
					subject: exam.subject,
					date: numericDate(exam.date),
					daysUntil:
						Math.floor(Date.UTC(examYear, examMonth - 1, examDay) / 86_400_000) -
						Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000),
					startTime: exam.startTime,
					endTime: exam.endTime,
					name: exam.name,
					text: exam.text,
					displayText: exam.displayText,
				};
				const names: Record<string, ioBroker.Translated> = {
					id: translatedStateName("Exam ID"),
					subject: translatedStateName("Subject"),
					date: translatedStateName("Date"),
					daysUntil: translatedStateName("daysUntil"),
					startTime: translatedStateName("Exam start time"),
					endTime: translatedStateName("Exam end time"),
					name: translatedStateName("Exam name"),
					text: translatedStateName("Exam text"),
					displayText: translatedStateName("Display text"),
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
								role:
									field === "date"
										? "date"
										: field === "startTime" || field === "endTime"
											? "time"
											: type === "number"
												? "value"
												: "text",
								read: true,
								write: false,
								def: type === "number" ? 0 : "",
							},
							native: {},
						},
						String(names[field].en),
					);
					await setStateChangedOrInitialize(this, `${base}.${field}`, value);
				}
			}
			const existing = await this.getObjectListAsync({
				startkey: `${this.namespace}.${entriesRoot}.`,
				endkey: `${this.namespace}.${entriesRoot}.\uffff`,
			});
			const stale = new Set<string>();
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
			numericDate(summary.current.startDate),
			"Start date",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(
			"holidays.current.startDateTimestamp",
			numericDate(summary.current.startDate),
			"Start date (Unix timestamp ms)",
			"number",
			"value",
			0,
			"ms",
		);
		await this.writeSimpleState(
			"holidays.current.endDate",
			numericDate(summary.current.endDate),
			"End date",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(
			"holidays.current.endDateTimestamp",
			numericDate(summary.current.endDate),
			"End date (Unix timestamp ms)",
			"number",
			"value",
			0,
			"ms",
		);
		await this.writeSimpleState("holidays.next.name", summary.next.name, "Name", "string", "text", "");
		await this.writeSimpleState("holidays.next.longName", summary.next.longName, "Long name", "string", "text", "");
		await this.writeSimpleState(
			"holidays.next.startDate",
			numericDate(summary.next.startDate),
			"Start date",
			"number",
			"date",
			0,
		);
		await this.writeSimpleState(
			"holidays.next.startDateTimestamp",
			numericDate(summary.next.startDate),
			"Start date (Unix timestamp ms)",
			"number",
			"value",
			0,
			"ms",
		);
		await this.writeSimpleState(
			"holidays.next.endDate",
			numericDate(summary.next.endDate),
			"End date",
			"number",
			"date",
			0,
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
			"value",
			0,
			"ms",
		);
	}

	private async writeDaySummary(path: string, summary: TimetableSummary, lessons: TimetableLesson[]): Promise<void> {
		for (const [name, definition] of Object.entries(SUMMARY_STATE_DEFINITIONS) as [
			keyof TimetableSummary,
			(typeof SUMMARY_STATE_DEFINITIONS)[keyof TimetableSummary],
		][]) {
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
						...(definition.unit ? { unit: definition.unit } : {}),
					},
					native: {},
				},
				definition.name.en,
			);
			await setStateChangedOrInitialize(this, `${path}.${name}`, summary[name]);
		}
		await this.writeSimpleState(
			`${path}.lessonComparison`,
			JSON.stringify(buildLessonComparison(lessons)),
			"Lesson comparison (JSON)",
			"string",
			"json",
			"[]",
		);
	}

	private async writeCurrentNextSummary(
		lessons: TimetableLesson[],
		now: Date,
		path = "timetable.today",
	): Promise<void> {
		const summary = deriveCurrentNextLesson(lessons, now);
		for (const [name, definition] of Object.entries(CURRENT_NEXT_STATE_DEFINITIONS) as [
			keyof CurrentNextLessonSummary,
			(typeof CURRENT_NEXT_STATE_DEFINITIONS)[keyof CurrentNextLessonSummary],
		][]) {
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
						...(definition.unit ? { unit: definition.unit } : {}),
					},
					native: {},
				},
				definition.name.en,
			);
			await setStateChangedOrInitialize(this, `${path}.${name}`, summary[name]);
		}
	}

	private async updateCurrentNextStates(): Promise<void> {
		if (this.unloaded || !this.hasTimetableSnapshot) {
			return;
		}
		for (const [studentId, child] of this.childTodayLessons) {
			await this.writeCurrentNextSummary(
				child.lessons,
				new Date(),
				`students.student_${studentId}.timetable.today`,
			);
		}
	}

	private async cleanupObsoleteStructure(): Promise<void> {
		for (const id of [
			"info.apiFieldReport",
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
		root = "timetable",
	): Promise<{ updated: number; removed: number }> {
		await this.ensureTranslatedObject(
			`${root}.${group}`,
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
					`${root}.week.${weekdayNames[index]}`,
					byDay[index],
					this.timetableDate(nextWeekday(now, index)),
				);
				await this.writeDaySummary(
					`${root}.week.${weekdayNames[index]}`,
					summarizeTimetable(byDay[index]),
					byDay[index],
				);
				removed += result.removed;
			}
		} else {
			const day = new Date(now);
			if (group === "tomorrow") {
				day.setDate(day.getDate() + 1);
			}
			const result = await this.writeTimetableDay(`${root}.${group}`, lessons, this.timetableDate(day));
			await this.writeDaySummary(`${root}.${group}`, summarizeTimetable(lessons), lessons);
			if (group === "today") {
				await this.writeCurrentNextSummary(lessons, now, `${root}.today`);
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
		await this.writeSimpleState(`${path}.date`, numericDate(date), "Date", "number", "date", 0);
		await this.writeSimpleState(
			`${path}.dateTimestamp`,
			numericDate(date),
			"Date (Unix timestamp ms)",
			"number",
			"value",
			0,
			"ms",
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
		this.ensureActive();
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
		this.ensureActive();
		await setStateChangedOrInitialize(this, id, value);
	}

	private async writeLesson(path: string, slot: string, lesson: TimetableLesson): Promise<void> {
		this.ensureActive();
		const base = `${path}.lessons.${slot}`;
		const label = lessonChannelName(lesson);
		await this.ensureTranslatedObject(
			base,
			{
				type: "channel",
				common: { name: label || translatedLessonFallback(slot) },
				native: { [WebuntisNext.generatedLessonNameKey]: label || translatedLessonFallback(slot) },
			},
			`Lesson ${slot}`,
			true,
		);
		this.ensureActive();
		const values: Record<
			string,
			{ value: string | number | boolean; type: "string" | "number" | "boolean"; role: string; unit?: string }
		> = {
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
				? {
						originalTeacher: { value: lesson.originalTeacher, type: "string" as const, role: "text" },
						originalTeacherLong: {
							value: lesson.originalTeacherLong,
							type: "string" as const,
							role: "text",
						},
					}
				: {}),
			...(lesson.originalRoom && lesson.originalRoom !== lesson.room
				? {
						originalRoom: { value: lesson.originalRoom, type: "string" as const, role: "text" },
						originalRoomLong: { value: lesson.originalRoomLong, type: "string" as const, role: "text" },
					}
				: {}),
			...(lesson.originalSubject && lesson.originalSubject !== lesson.subject
				? {
						originalSubject: { value: lesson.originalSubject, type: "string" as const, role: "text" },
						originalSubjectLong: {
							value: lesson.originalSubjectLong,
							type: "string" as const,
							role: "text",
						},
					}
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
						...(item.unit ? { unit: item.unit } : {}),
					},
					native: {},
				},
				typeof LESSON_STATE_NAMES[name]?.en === "string" ? LESSON_STATE_NAMES[name].en : name,
			);
			await setStateChangedOrInitialize(this, `${base}.${name}`, item.value);
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
	module.exports = Object.assign((options: Partial<utils.AdapterOptions> | undefined) => new WebuntisNext(options), {
		WebuntisNext,
	});
} else {
	(() => new WebuntisNext())();
}
