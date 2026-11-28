import * as utils from "@iobroker/adapter-core";
import { cleanupLegacyNamespace } from "./lib/LegacyNamespaceCleanup";
import { removeStaleLessonStates } from "./lib/LessonStateCleanup";
import {
	hasObjectValueChanged,
	needsNameMigration,
	shouldMigrateDynamicName,
	translatedLessonFallback,
	translatedName,
	translatedStateName,
	translatedTimetableGroup,
	translatedWeekday,
} from "./lib/ObjectTranslations";
import { setStateChangedOrInitialize } from "./lib/StateWriter";
import {
	DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES,
	DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES,
	getRefreshIntervalMs,
	MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
} from "./lib/RefreshIntervals";
import { deriveCurrentNextLesson, type CurrentNextLessonSummary } from "./lib/webuntis/CurrentNextLesson";
import {
	decodeSchoolSelection,
	encodeSchoolSelection,
	rankSchoolResults,
	schoolResultToConfig,
} from "./lib/webuntis/SchoolDiscovery";
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
import type {
	WebUntisAbsence,
	WebUntisHomework,
	WebUntisHttpDiagnostic,
	WebUntisInboxMessage,
	WebUntisMessageOfDay,
	WebUntisSchoolConfig,
	WebUntisStudentIdentity,
	SchoolSearchResult,
} from "./lib/webuntis/WebUntisTypes";

const EXAMS_MAX_ATTEMPTS = 3;
const MAX_VERIFIED_SCHOOL_SELECTIONS = 200;
const TIMETABLE_GROUPS = ["today", "tomorrow", "week"] as const;
type AdapterStateDefinition = {
	type: "string" | "number" | "boolean";
	role: string;
	name: ioBroker.Translated;
	def: string | number | boolean | null;
	unit?: string;
};
const HOMEWORK_STATE_DEFINITIONS: Record<
	| "id"
	| "lessonId"
	| "subject"
	| "teacher"
	| "date"
	| "dueDate"
	| "text"
	| "remark"
	| "completed"
	| "completedKnown"
	| "hasAttachments",
	AdapterStateDefinition
> = {
	id: { type: "string", role: "text", name: translatedName("homeworkId"), def: "" },
	lessonId: { type: "string", role: "text", name: translatedName("lessonId"), def: "" },
	subject: { type: "string", role: "text", name: translatedName("subject"), def: "" },
	teacher: { type: "string", role: "text", name: translatedName("teacher"), def: "" },
	date: { type: "string", role: "date", name: translatedName("date"), def: "" },
	dueDate: { type: "string", role: "date", name: translatedName("dueDate"), def: "" },
	text: { type: "string", role: "text", name: translatedName("homeworkText"), def: "" },
	remark: { type: "string", role: "text", name: translatedName("remark"), def: "" },
	completed: { type: "boolean", role: "indicator", name: translatedName("completed"), def: null },
	completedKnown: { type: "boolean", role: "indicator", name: translatedName("completedKnown"), def: false },
	hasAttachments: { type: "boolean", role: "indicator", name: translatedName("hasAttachments"), def: false },
};
const ABSENCE_STATE_DEFINITIONS: Record<
	| "startDate"
	| "endDate"
	| "startTime"
	| "endTime"
	| "reason"
	| "excuseStatus"
	| "excuseStatusKnown"
	| "excuseText"
	| "isExcused",
	AdapterStateDefinition
> = {
	startDate: { type: "string", role: "date", name: translatedName("startDate"), def: "" },
	endDate: { type: "string", role: "date", name: translatedName("endDate"), def: "" },
	startTime: { type: "string", role: "text", name: translatedName("absenceStartTime"), def: "" },
	endTime: { type: "string", role: "text", name: translatedName("absenceEndTime"), def: "" },
	reason: { type: "string", role: "text", name: translatedName("reason"), def: "" },
	excuseStatus: { type: "string", role: "text", name: translatedName("excuseStatus"), def: "unknown" },
	excuseStatusKnown: {
		type: "boolean",
		role: "indicator",
		name: translatedName("excuseStatusKnown"),
		def: false,
	},
	excuseText: { type: "string", role: "text", name: translatedName("excuseText"), def: "" },
	isExcused: { type: "boolean", role: "indicator", name: translatedName("isExcused"), def: null },
};
const ABSENCE_STATE_ALLOWED_IDS = new Set(Object.keys(ABSENCE_STATE_DEFINITIONS));
const ABSENCE_JSON_STATE_DEFINITION: AdapterStateDefinition = {
	type: "string",
	role: "json",
	name: translatedName("absencesJson"),
	def: "[]",
};
const NEWS_OF_DAY_STATE_DEFINITIONS: Record<
	"date" | "count" | "json" | "id" | "subject" | "text" | "hasAttachments",
	{
		type: "string" | "number" | "boolean";
		role: string;
		name: ioBroker.Translated;
		def: string | number | boolean;
	}
> = {
	date: { type: "string", role: "date", name: translatedName("date"), def: "" },
	count: { type: "number", role: "value", name: translatedName("messageCount"), def: 0 },
	json: { type: "string", role: "json", name: translatedName("messagesJson"), def: "[]" },
	id: { type: "string", role: "text", name: translatedName("messageId"), def: "" },
	subject: { type: "string", role: "text", name: translatedName("subject"), def: "" },
	text: { type: "string", role: "text", name: translatedName("messageText"), def: "" },
	hasAttachments: { type: "boolean", role: "indicator", name: translatedName("hasAttachments"), def: false },
};
type TimetableGroup = (typeof TIMETABLE_GROUPS)[number];

function absenceExcusedValue(absence: WebUntisAbsence): boolean | undefined {
	if (absence.isExcused !== undefined) {
		return absence.isExcused;
	}
	const status = absence.excuseStatus
		?.trim()
		.toLocaleLowerCase()
		.replace(/[ _-]+/g, "");
	if (status === "excused") {
		return true;
	}
	if (status === "unexcused" || status === "notexcused") {
		return false;
	}
	return undefined;
}

function studentChannelIds(students: Array<{ id: number; name: string }>): Map<number, string> {
	const normalize = (name: string): string =>
		name
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || "student";
	const names = students.map(student => ({
		...student,
		key: normalize(!student.name || student.name === `Student ${student.id}` ? String(student.id) : student.name),
	}));
	const counts = new Map<string, number>();
	for (const student of names) {
		counts.set(student.key, (counts.get(student.key) ?? 0) + 1);
	}
	return new Map(
		names.map(student => [student.id, `${student.key}${counts.get(student.key)! > 1 ? `_${student.id}` : ""}`]),
	);
}

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
	private currentNextTimerGeneration = 0;
	private timetableSnapshotAt?: Date;
	private timetableLessons: TimetableLesson[] = [];
	private childTimetableLessons = new Map<number, { name: string; channelId: string; lessons: TimetableLesson[] }>();
	private hasTimetableSnapshot = false;
	private timetableTodayDate?: string;
	private lastCurrentNextUpdateAt?: number;
	private lastCurrentNextUpdateDate?: string;
	private unloaded = false;
	private startupInitialized = false;
	private failedCentralCredentialId?: string;
	private failedCentralCredentialSnapshot?: { id: string; username: string; password: string };
	private authenticatedCentralCredentialSnapshot?: { id: string; username: string; password: string };
	private temporaryFailedCentralCredentialId?: string;
	private readonly verifiedSchoolSelections = new Map<string, SchoolSearchResult>();
	private readonly credentialWatchers = new Map<
		string,
		{
			references: number;
			listener: (id: string) => void;
			subscription: Promise<boolean>;
		}
	>();
	private resolvedCredential?: { id: string; username: string; password: string };
	private credentialGeneration = 0;
	private readonly migratedNames = new Set<string>();
	private inboxMutationQueue: Promise<void> = Promise.resolve();
	private refreshMutationQueue: Promise<void> = Promise.resolve();
	private lastMessageWarningAt = 0;
	private lastNewsOfDayWarningAt = 0;
	private lastHomeworkWarningAt = 0;
	private lastAbsencesWarningAt = 0;
	private lastExamsWarningAt = 0;
	private knownStudentIdentities?: Array<{ id: number; name: string }>;

	private async ensureTranslatedObject(
		id: string,
		object: ioBroker.SettableObject,
		legacyName?: string | string[],
		dynamicName = false,
		clearDescription = false,
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
		const desiredNative = object.native as Record<string, unknown> | undefined;
		const messageIdentityChanged =
			dynamicName &&
			desiredNative &&
			"messageId" in desiredNative &&
			hasObjectValueChanged(existing.native?.messageId, desiredNative.messageId);
		const shouldMigrateName =
			(Array.isArray(legacyName)
				? legacyName.some(name => needsNameMigration(currentName, name))
				: needsNameMigration(currentName, legacyName)) ||
			messageIdentityChanged ||
			(dynamicName && shouldMigrateDynamicName(currentName, generatedName));
		const desiredCommon = (object.common || {}) as Record<string, unknown>;
		const common: Record<string, unknown> = {};
		for (const key of ["type", "role", "read", "write", "def"]) {
			if (key in desiredCommon && hasObjectValueChanged(existing.common[key], desiredCommon[key])) {
				common[key] = desiredCommon[key];
			}
		}
		if (clearDescription && existing.common.desc !== undefined) {
			common.desc = null;
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
			(messageIdentityChanged || typeof generatedName !== "string" || generatedName === currentName) &&
			hasObjectValueChanged(
				existing.native?.[WebuntisNext.generatedLessonNameKey],
				native[WebuntisNext.generatedLessonNameKey],
			);
		if (Object.keys(common).length || shouldMigrateMarker) {
			await this.extendObjectAsync(id, { common, ...(shouldMigrateMarker ? { native } : {}) });
		}
	}

	private enqueueInboxMutation<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.inboxMutationQueue.then(operation);
		this.inboxMutationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private enqueueRefreshMutation<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.refreshMutationQueue.then(operation);
		this.refreshMutationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private enqueueRefreshMutationWithFallbackCleanup<T>(operation: () => Promise<T>): Promise<T> {
		return this.enqueueRefreshMutation(async () => {
			const generation = this.credentialGeneration;
			try {
				return await operation();
			} finally {
				this.clearTemporaryCentralCredentialFallback(this.temporaryFailedCentralCredentialId, generation);
			}
		});
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
		if (!state || this.unloaded) {
			return;
		}
		if (state.val === true && (id === "info.refresh" || id === `${this.namespace}.info.refresh`)) {
			try {
				await this.refreshAll();
				this.resetCurrentNextUpdateTimer();
			} finally {
				if (!this.unloaded) {
					await this.setStateAsync("info.refresh", false, true);
				}
			}
			return;
		}
		if (state.ack) {
			return;
		}
		const localId = id.startsWith(`${this.namespace}.`) ? id.slice(this.namespace.length + 1) : id;
		if (state.val === true) {
			const markReadMatch = /^inbox\.unread\.([a-zA-Z0-9_-]+)\.markRead$/.exec(localId);
			if (markReadMatch) {
				return this.enqueueInboxMutation(() => this.markInboxMessageRead(markReadMatch[1]));
			}
		}
		if (state.val === true) {
			const markUnreadMatch = /^inbox\.read\.([a-zA-Z0-9_-]+)\.markAsUnread$/.exec(localId);
			if (markUnreadMatch) {
				return this.enqueueInboxMutation(() => this.markInboxMessageUnread(markUnreadMatch[1]));
			}
		}
	}

	private async markInboxMessageUnread(readSlot: string): Promise<void> {
		const sourcePath = `inbox.read.${readSlot}`;
		const sourceId = await this.getStateAsync(`${sourcePath}.id`);
		const readInWebUntis = await this.getStateAsync(`${sourcePath}.readInWebUntis`);
		if (readInWebUntis?.val !== false) {
			await this.setStateAsync(`${sourcePath}.markAsUnread`, false, true);
			return;
		}

		const fields: Array<[string, string, "string" | "number" | "boolean"]> = [
			["id", "Message ID", typeof sourceId?.val === "number" ? "number" : "string"],
			["dateTime", "Date and time", "string"],
			["sender", "Sender", "string"],
			["subject", "Subject", "string"],
			["content", "Content", "string"],
			["contentIsPreview", "Content is preview", "boolean"],
			["hasAttachments", "Has attachments", "boolean"],
		];
		const unreadRows = await this.getObjectListAsync({
			startkey: `${this.namespace}.inbox.unread.`,
			endkey: `${this.namespace}.inbox.unread.\uffff`,
		});
		const usedSlots = new Set(
			(unreadRows.rows || [])
				.map(row => /^inbox\.unread\.(\d+)\./.exec(row.id.replace(`${this.namespace}.`, ""))?.[1])
				.filter((slot): slot is string => slot !== undefined),
		);
		let index = 1;
		while (usedSlots.has(String(index).padStart(2, "0"))) {
			index++;
		}
		const targetPath = `inbox.unread.${String(index).padStart(2, "0")}`;
		const message: Record<string, ioBroker.StateValue> = {};
		for (const [field] of fields) {
			const value = await this.getStateAsync(`${sourcePath}.${field}`);
			if (value?.val !== undefined && value.val !== null) {
				message[field] = value.val;
			}
		}
		const messageId = sourceId?.val ?? readSlot;
		const subject = typeof message.subject === "string" ? message.subject : `Message ${messageId}`;
		await this.ensureTranslatedObject(
			targetPath,
			{
				type: "channel",
				common: { name: subject },
				native: { messageId, locallyRead: false, [WebuntisNext.generatedLessonNameKey]: subject },
			},
			subject,
			true,
		);
		await this.ensureTranslatedObject(
			`${targetPath}.markRead`,
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
		for (const [field, name, type] of fields) {
			const value = message[field];
			if (value === undefined) {
				continue;
			}
			let role = "text";
			if (field === "dateTime") {
				role = "date";
			} else if (type === "boolean") {
				role = "indicator";
			} else if (type === "number") {
				role = "value";
			}
			await this.writeSimpleState(
				`${targetPath}.${field}`,
				value as string | number | boolean,
				name,
				type,
				role,
				type === "boolean" ? false : type === "number" ? 0 : "",
			);
		}
		await this.writeSimpleState(`${targetPath}.read`, false, "Read", "boolean", "indicator", false);
		await this.writeSimpleState(
			`${targetPath}.readInWebUntis`,
			false,
			"Read in WebUntis",
			"boolean",
			"indicator",
			false,
		);
		await this.delObjectAsync(sourcePath, { recursive: true });
		const remainingReadRows = await this.getObjectListAsync({
			startkey: `${this.namespace}.inbox.read.`,
			endkey: `${this.namespace}.inbox.read.\uffff`,
		});
		const remainingReadSlots = new Set(
			(remainingReadRows.rows || [])
				.map(row => /^inbox\.read\.(\d+)\./.exec(row.id.replace(`${this.namespace}.`, ""))?.[1])
				.filter((slot): slot is string => slot !== undefined),
		);
		await setStateChangedOrInitialize(this, "inbox.read.count", remainingReadSlots.size);
		await setStateChangedOrInitialize(this, "inbox.unread.count", usedSlots.size + 1);
	}

	private async markInboxMessageRead(messageId: string): Promise<void> {
		const sourcePath = `inbox.unread.${messageId}`;
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
			startkey: `${this.namespace}.inbox.read.`,
			endkey: `${this.namespace}.inbox.read.\uffff`,
		});
		const existingSlots = new Set<string>();
		for (const row of channelRows.rows || []) {
			const match = /^inbox\.read\.([^.]+)\./.exec(row.id.replace(`${this.namespace}.`, ""));
			if (match) {
				existingSlots.add(match[1]);
			}
		}
		const readMessages: Array<Record<string, ioBroker.StateValue>> = [];
		for (const slot of existingSlots) {
			const entry: Record<string, ioBroker.StateValue> = {};
			for (const [field] of fields) {
				const current = await this.getStateAsync(`inbox.read.${slot}.${field}`);
				if (current?.val !== undefined && current.val !== null) {
					entry[field] = current.val;
				}
			}
			const legacyLocalRead = await this.getStateAsync(`inbox.read.${slot}.readLocally`);
			const channel = await this.getObjectAsync(`inbox.read.${slot}`);
			entry.locallyRead = channel?.native?.locallyRead === true || legacyLocalRead?.val === true;
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
		sourceMessage.locallyRead = true;
		readMessages.push(sourceMessage);
		readMessages.sort((left, right) => String(left.dateTime ?? "").localeCompare(String(right.dateTime ?? "")));
		for (const slot of existingSlots) {
			await this.delObjectAsync(`inbox.read.${slot}`, { recursive: true });
		}
		for (let index = 0; index < readMessages.length; index++) {
			const entry = readMessages[index];
			const slot = String(index + 1).padStart(2, "0");
			const targetPath = `inbox.read.${slot}`;
			const entryId = entry.id ?? messageId;
			const entrySubject = typeof entry.subject === "string" ? entry.subject : `Message ${entryId}`;
			await this.ensureTranslatedObject(
				targetPath,
				{
					type: "channel",
					common: { name: entrySubject },
					native: {
						messageId: entryId,
						locallyRead: entry.locallyRead === true,
						[WebuntisNext.generatedLessonNameKey]: entrySubject,
					},
				},
				"Read message",
				true,
			);
			await this.ensureTranslatedObject(
				`${targetPath}.markAsUnread`,
				{
					type: "state",
					common: {
						name: { en: "Mark as unread", de: "Als ungelesen markieren" },
						type: "boolean",
						role: "button",
						read: false,
						write: true,
						def: false,
					},
					native: {},
				},
				"Mark as unread",
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
		await setStateChangedOrInitialize(this, "inbox.read.count", readMessages.length);
		await this.setStateAsync(`${sourcePath}.markRead`, false, true);
		await this.delObjectAsync(sourcePath, { recursive: true });
		const unreadRows = await this.getObjectListAsync({
			startkey: `${this.namespace}.inbox.unread.`,
			endkey: `${this.namespace}.inbox.unread.\uffff`,
		});
		const remainingUnreadSlots = new Set(
			(unreadRows.rows || [])
				.map(row => /^inbox\.unread\.(\d+)\./.exec(row.id.replace(`${this.namespace}.`, ""))?.[1])
				.filter((slot): slot is string => slot !== undefined),
		);
		await setStateChangedOrInitialize(this, "inbox.unread.count", remainingUnreadSlots.size);
	}

	private logHttpDiagnostic(diagnostic: WebUntisHttpDiagnostic): void {
		this.log.debug(`WebUntis ${diagnostic.method || "request"} HTTP ${JSON.stringify(diagnostic)}`);
	}

	private async onReady(): Promise<void> {
		this.log.info("Adapter startup initialization started");
		try {
			await this.initialize();
		} catch (error) {
			if (!this.unloaded) {
				const detail = error instanceof Error ? error.message : "Unknown error";
				this.log.error(`Adapter startup failed: ${detail}`);
			}
		}
	}

	private async initialize(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.subscribeConfiguredCredential();
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
					name: translatedName("refresh"),
					type: "boolean",
					role: "button",
					read: false,
					write: true,
					def: false,
				},
				native: {},
			},
			["Refresh now", "refresh"],
			false,
			true,
		);
		await this.subscribeStatesAsync("info.refresh");
		await this.subscribeInboxMessageActions();
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
		await this.ensureNewsOfDayRoot();
		await this.ensureHolidaysRoot();
		await this.cleanupObsoleteStructure();
		await this.setState("info.connection", false, true);
		this.startupInitialized = true;
		if (!this.hasSchoolConfig() || !this.hasCredentialSource()) {
			return;
		}
		const credentialGeneration = this.credentialGeneration;
		const temporaryFallbackId = await this.authenticateConfiguredCredentialAtStartup(credentialGeneration);
		if (this.unloaded || credentialGeneration !== this.credentialGeneration) {
			return;
		}
		try {
			try {
				await this.getConnectionConfig();
			} catch (error) {
				const code = error instanceof WebUntisError ? error.code : "CREDENTIAL_UNAVAILABLE";
				this.log.warn(
					`WebUntis credentials are unavailable (${code}); select a valid login credential in Admin`,
				);
				if (!this.unloaded) {
					this.scheduleTimetableUpdate();
					this.scheduleCurrentNextUpdate();
				}
				return;
			}
			await this.refreshAll();
		} finally {
			this.clearTemporaryCentralCredentialFallback(temporaryFallbackId, credentialGeneration);
		}
		this.scheduleTimetableUpdate();
		this.scheduleCurrentNextUpdate();
	}

	private async subscribeInboxMessageActions(): Promise<void> {
		await this.subscribeStatesAsync("inbox.unread.*.markRead");
		await this.subscribeStatesAsync("inbox.read.*.markAsUnread");
	}

	private async refreshAll(): Promise<void> {
		return this.enqueueRefreshMutationWithFallbackCleanup(() => this.refreshAllLocked());
	}

	private async refreshAllLocked(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.ensureStudentsRoot();
		await this.ensureInboxRoot();
		await this.ensureNewsOfDayRoot();
		await this.ensureHolidaysRoot();
		await this.updateTimetableLocked();
		await this.updateCurrentNextStatesLocked(true);
	}

	private getTimetableRefreshIntervalMs(): number {
		return getRefreshIntervalMs(
			this.config.timetableRefreshIntervalMinutes,
			DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES,
			MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
		);
	}

	private getCurrentNextRefreshIntervalMs(): number {
		return getRefreshIntervalMs(
			this.config.currentNextRefreshIntervalMinutes,
			DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES,
		);
	}

	private clearTimetableUpdateTimer(): void {
		if (this.timetableTimer) {
			this.clearTimeout(this.timetableTimer);
			this.timetableTimer = undefined;
		}
	}

	private resetTimetableUpdateTimer(): void {
		this.clearTimetableUpdateTimer();
		this.scheduleTimetableUpdate();
	}

	private scheduleTimetableUpdate(): void {
		if (this.unloaded) {
			return;
		}
		const now = Date.now();
		const intervalMs = this.getTimetableRefreshIntervalMs();
		let delayMs = DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES * 60_000;
		if (this.timetableSnapshotAt) {
			delayMs = intervalMs;
			const cacheDeadline = new Date(this.timetableSnapshotAt);
			cacheDeadline.setHours(0, 0, 0, 0);
			cacheDeadline.setDate(cacheDeadline.getDate() + 6);
			const timeUntilCacheDeadline = cacheDeadline.getTime() - now;
			delayMs =
				timeUntilCacheDeadline <= 0
					? DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES * 60_000
					: Math.min(intervalMs, timeUntilCacheDeadline);
		}
		const nextUpdate = new Date(now + delayMs);
		this.timetableTimer = this.setTimeout(() => {
			this.timetableTimer = undefined;
			void this.updateTimetable()
				.then(() => this.updateCurrentNextStates())
				.catch(error => this.log.error(`Unexpected timetable update error: ${error}`))
				.finally(() => this.scheduleTimetableUpdate());
		}, delayMs);
		void this.setState("info.nextUpdate", nextUpdate.toISOString(), true).catch(error =>
			this.log.warn(`Failed to update the next timetable update time: ${error}`),
		);
	}

	private scheduleCurrentNextUpdate(): void {
		if (this.unloaded) {
			return;
		}
		const generation = ++this.currentNextTimerGeneration;
		if (this.currentNextTimer) {
			this.clearTimeout(this.currentNextTimer);
			this.currentNextTimer = undefined;
		}
		const now = Date.now();
		const nextDay = new Date(now);
		nextDay.setHours(24, 0, 0, 0);
		const delayMs = Math.min(this.getCurrentNextRefreshIntervalMs(), nextDay.getTime() - now);
		this.currentNextTimer = this.setTimeout(() => {
			if (generation !== this.currentNextTimerGeneration) {
				return;
			}
			this.currentNextTimer = undefined;
			void this.updateCurrentNextStates()
				.catch(error => this.log.error(`Unexpected current/next update error: ${error}`))
				.finally(() => {
					if (generation === this.currentNextTimerGeneration) {
						this.scheduleCurrentNextUpdate();
					}
				});
		}, delayMs);
	}

	private resetCurrentNextUpdateTimer(): void {
		this.scheduleCurrentNextUpdate();
	}

	private hasSchoolConfig(): boolean {
		const school = this.getSchoolConfig();
		return Boolean(school.server && school.schoolName && typeof school.schoolId === "number");
	}

	private hasCredentialSource(): boolean {
		return Boolean(this.config.credentialId?.trim() || (this.config.username?.trim() && this.config.password));
	}

	private getSchoolConfig(): WebUntisSchoolConfig {
		const selectedSchool = decodeSchoolSelection(this.config.schoolSelection);
		if (selectedSchool) {
			return schoolResultToConfig(selectedSchool);
		}
		return {
			server: this.config.server,
			schoolName: this.config.schoolName,
			schoolDisplayName: this.config.schoolDisplayName,
			schoolAddress: this.config.schoolAddress,
			schoolId: this.config.schoolId,
		};
	}

	private async resolveCentralCredential(
		credentialId: string,
		expectedGeneration = this.credentialGeneration,
	): Promise<{ id: string; username: string; password: string }> {
		let credential: utils.Credentials.CredentialInfo<utils.Credentials.LoginPasswordCredentials>;
		try {
			credential = await utils.Credentials.getCredentials<utils.Credentials.LoginPasswordCredentials>(
				this,
				credentialId,
			);
		} catch {
			throw new WebUntisError("CREDENTIAL_UNAVAILABLE", "The selected WebUntis credential is unavailable");
		}
		if (expectedGeneration !== this.credentialGeneration) {
			throw new WebUntisError("CREDENTIAL_CHANGED", "The selected WebUntis credential changed during validation");
		}
		const values = credential.values as unknown as Record<string, unknown>;
		if (
			credential.type !== "custom" ||
			utils.Credentials.getCredentialForm(values) !== "login" ||
			typeof values.login !== "string" ||
			!values.login.trim() ||
			typeof values.password !== "string" ||
			!values.password
		) {
			throw new WebUntisError("CREDENTIAL_INVALID", "The selected credential must contain a login and password");
		}
		return { id: credentialId, username: values.login, password: values.password };
	}

	private async getConnectionConfig(
		credentialId = this.config.credentialId,
		schoolConfig = this.getSchoolConfig(),
		allowLegacyFallback = true,
		expectedGeneration = this.credentialGeneration,
	): Promise<WebUntisConnectionConfig> {
		const selectedId = typeof credentialId === "string" ? credentialId.trim() : "";
		const hasLegacyCredentials = Boolean(this.config.username?.trim() && this.config.password);
		if (
			this.authenticatedCentralCredentialSnapshot &&
			(this.authenticatedCentralCredentialSnapshot.id !== this.config.credentialId?.trim() ||
				!hasLegacyCredentials)
		) {
			this.authenticatedCentralCredentialSnapshot = undefined;
		}
		if (!selectedId) {
			if (allowLegacyFallback && hasLegacyCredentials) {
				return { ...schoolConfig, username: this.config.username, password: this.config.password };
			}
			throw new WebUntisError("CREDENTIAL_REQUIRED", "A WebUntis login credential must be selected");
		}
		if (allowLegacyFallback && hasLegacyCredentials && selectedId === this.temporaryFailedCentralCredentialId) {
			if (expectedGeneration !== this.credentialGeneration) {
				throw new WebUntisError(
					"CREDENTIAL_CHANGED",
					"The selected WebUntis credential changed during validation",
				);
			}
			return { ...schoolConfig, username: this.config.username, password: this.config.password };
		}

		const hasActiveWatcher = await this.hasActiveCredentialWatcher(selectedId);
		let resolvedAfterFallbackCheck: { id: string; username: string; password: string } | undefined;
		const isPersistentFallback = selectedId === this.failedCentralCredentialId;
		const authenticatedCredential =
			this.authenticatedCentralCredentialSnapshot?.id === selectedId
				? this.authenticatedCentralCredentialSnapshot
				: undefined;
		const shouldRevalidateWithoutWatcher =
			allowLegacyFallback && hasLegacyCredentials && (isPersistentFallback || Boolean(authenticatedCredential));
		if (allowLegacyFallback && hasLegacyCredentials && isPersistentFallback && hasActiveWatcher) {
			if (expectedGeneration !== this.credentialGeneration) {
				throw new WebUntisError(
					"CREDENTIAL_CHANGED",
					"The selected WebUntis credential changed during validation",
				);
			}
			return { ...schoolConfig, username: this.config.username, password: this.config.password };
		}
		if (shouldRevalidateWithoutWatcher && !hasActiveWatcher) {
			try {
				resolvedAfterFallbackCheck = await this.resolveCentralCredential(selectedId, expectedGeneration);
			} catch (error) {
				if (error instanceof WebUntisError && error.code === "CREDENTIAL_CHANGED") {
					throw error;
				}
				return { ...schoolConfig, username: this.config.username, password: this.config.password };
			}
			const knownCredential = isPersistentFallback
				? this.failedCentralCredentialSnapshot
				: authenticatedCredential;
			if (
				knownCredential?.id === selectedId &&
				resolvedAfterFallbackCheck.username === knownCredential.username &&
				resolvedAfterFallbackCheck.password === knownCredential.password
			) {
				if (isPersistentFallback) {
					return { ...schoolConfig, username: this.config.username, password: this.config.password };
				}
				return {
					...schoolConfig,
					username: resolvedAfterFallbackCheck.username,
					password: resolvedAfterFallbackCheck.password,
				};
			}

			let result: Awaited<ReturnType<WebUntisService["testConnection"]>>;
			try {
				result = await this.webUntis.testConnection({
					...schoolConfig,
					username: resolvedAfterFallbackCheck.username,
					password: resolvedAfterFallbackCheck.password,
				});
			} catch (error) {
				if (expectedGeneration !== this.credentialGeneration) {
					throw new WebUntisError(
						"CREDENTIAL_CHANGED",
						"The selected WebUntis credential changed during validation",
					);
				}
				if (!this.markCentralCredentialForFallback(selectedId, expectedGeneration, false)) {
					throw new WebUntisError(
						"CREDENTIAL_CHANGED",
						"The selected WebUntis credential changed during validation",
					);
				}
				const code = error instanceof WebUntisError ? error.code : "CREDENTIAL_UNAVAILABLE";
				this.log.warn(
					`The updated central WebUntis credential could not be validated (${code}); legacy credentials were retained`,
				);
				return { ...schoolConfig, username: this.config.username, password: this.config.password };
			}
			if (expectedGeneration !== this.credentialGeneration) {
				throw new WebUntisError(
					"CREDENTIAL_CHANGED",
					"The selected WebUntis credential changed during validation",
				);
			}
			if (result.ok) {
				if (
					!(await this.centralCredentialUnchangedAfterAuthentication(
						resolvedAfterFallbackCheck,
						expectedGeneration,
					))
				) {
					if (expectedGeneration !== this.credentialGeneration) {
						throw new WebUntisError(
							"CREDENTIAL_CHANGED",
							"The selected WebUntis credential changed during validation",
						);
					}
					if (!this.markCentralCredentialForFallback(selectedId, expectedGeneration, false)) {
						throw new WebUntisError(
							"CREDENTIAL_CHANGED",
							"The selected WebUntis credential changed during validation",
						);
					}
					return { ...schoolConfig, username: this.config.username, password: this.config.password };
				}
				this.clearCentralCredentialFallback(selectedId);
				this.rememberAuthenticatedCentralCredential(resolvedAfterFallbackCheck);
				return {
					...schoolConfig,
					username: resolvedAfterFallbackCheck.username,
					password: resolvedAfterFallbackCheck.password,
				};
			}

			const persistentFailure = result.code === "INVALID_CREDENTIALS" || result.code === "USER_BLOCKED";
			const credentialUnchanged =
				persistentFailure &&
				(await this.centralCredentialUnchangedAfterAuthentication(
					resolvedAfterFallbackCheck,
					expectedGeneration,
				));
			if (expectedGeneration !== this.credentialGeneration) {
				throw new WebUntisError(
					"CREDENTIAL_CHANGED",
					"The selected WebUntis credential changed during validation",
				);
			}
			if (
				!this.markCentralCredentialForFallback(
					selectedId,
					expectedGeneration,
					persistentFailure && credentialUnchanged,
					resolvedAfterFallbackCheck,
				)
			) {
				throw new WebUntisError(
					"CREDENTIAL_CHANGED",
					"The selected WebUntis credential changed during validation",
				);
			}
			this.log.warn(
				`The updated central WebUntis credential failed authentication (${result.code}); legacy credentials were retained`,
			);
			return { ...schoolConfig, username: this.config.username, password: this.config.password };
		}

		let resolved =
			resolvedAfterFallbackCheck ??
			(hasActiveWatcher && selectedId === this.config.credentialId?.trim() ? this.resolvedCredential : undefined);
		if (!resolved || resolved.id !== selectedId) {
			resolved = await this.resolveCentralCredential(selectedId, expectedGeneration);
			if (hasActiveWatcher && selectedId === this.config.credentialId?.trim()) {
				this.resolvedCredential = resolved;
			}
		}
		if (expectedGeneration !== this.credentialGeneration) {
			throw new WebUntisError("CREDENTIAL_CHANGED", "The selected WebUntis credential changed during validation");
		}
		return { ...schoolConfig, username: resolved.username, password: resolved.password };
	}

	private async centralCredentialUnchangedAfterAuthentication(
		authenticatedCredential: { id: string; username: string; password: string },
		generation: number,
	): Promise<boolean> {
		if (this.unloaded || generation !== this.credentialGeneration) {
			return false;
		}
		try {
			const currentCredential = await this.resolveCentralCredential(authenticatedCredential.id, generation);
			return (
				!this.unloaded &&
				generation === this.credentialGeneration &&
				currentCredential.id === authenticatedCredential.id &&
				currentCredential.username === authenticatedCredential.username &&
				currentCredential.password === authenticatedCredential.password
			);
		} catch {
			return false;
		}
	}

	private markCentralCredentialForFallback(
		credentialId: string,
		generation: number,
		persistent: boolean,
		credential?: { username: string; password: string },
	): boolean {
		if (
			generation !== this.credentialGeneration ||
			credentialId !== this.config.credentialId?.trim() ||
			!this.config.username?.trim() ||
			!this.config.password
		) {
			return false;
		}
		if (persistent) {
			this.failedCentralCredentialId = credentialId;
			this.failedCentralCredentialSnapshot = credential
				? { id: credentialId, username: credential.username, password: credential.password }
				: undefined;
			this.authenticatedCentralCredentialSnapshot = undefined;
		} else {
			this.temporaryFailedCentralCredentialId = credentialId;
		}
		this.resolvedCredential = undefined;
		this.webUntis.clearSession();
		return true;
	}

	private async hasActiveCredentialWatcher(credentialId: string): Promise<boolean> {
		const watcher = this.credentialWatchers.get(credentialId);
		return watcher ? watcher.subscription : false;
	}

	private clearCentralCredentialFallback(credentialId: string): void {
		if (this.failedCentralCredentialId === credentialId) {
			this.failedCentralCredentialId = undefined;
			this.failedCentralCredentialSnapshot = undefined;
		}
		if (this.authenticatedCentralCredentialSnapshot?.id === credentialId) {
			this.authenticatedCentralCredentialSnapshot = undefined;
		}
		if (this.temporaryFailedCentralCredentialId === credentialId) {
			this.temporaryFailedCentralCredentialId = undefined;
		}
	}

	private rememberAuthenticatedCentralCredential(credential: {
		id: string;
		username: string;
		password: string;
	}): void {
		if (
			credential.id === this.config.credentialId?.trim() &&
			this.config.username?.trim() &&
			this.config.password
		) {
			this.authenticatedCentralCredentialSnapshot = {
				id: credential.id,
				username: credential.username,
				password: credential.password,
			};
		} else {
			this.authenticatedCentralCredentialSnapshot = undefined;
		}
	}

	private clearTemporaryCentralCredentialFallback(credentialId: string | undefined, generation: number): void {
		if (
			credentialId &&
			!this.unloaded &&
			generation === this.credentialGeneration &&
			credentialId === this.temporaryFailedCentralCredentialId
		) {
			this.temporaryFailedCentralCredentialId = undefined;
		}
	}

	private isSavedCredentialSelection(credentialId: string, schoolConfig: WebUntisSchoolConfig): boolean {
		const configuredSchool = this.getSchoolConfig();
		return (
			credentialId === this.config.credentialId?.trim() &&
			configuredSchool.server === schoolConfig.server &&
			configuredSchool.schoolName === schoolConfig.schoolName &&
			configuredSchool.schoolId === schoolConfig.schoolId
		);
	}

	private async clearLegacyCredentialsAfterSuccessfulAuthentication(
		authenticatedCredential: { id: string; username: string; password: string },
		generation: number,
		schoolConfig: WebUntisSchoolConfig,
		markTemporaryFallbackOnCredentialChange = false,
	): Promise<boolean> {
		if (!this.config.username?.trim() && !this.config.password) {
			return false;
		}
		if (!this.isSavedCredentialSelection(authenticatedCredential.id, schoolConfig)) {
			return false;
		}
		if (!(await this.centralCredentialUnchangedAfterAuthentication(authenticatedCredential, generation))) {
			if (markTemporaryFallbackOnCredentialChange) {
				this.markCentralCredentialForFallback(authenticatedCredential.id, generation, false);
			}
			this.log.warn(
				"The authenticated WebUntis credential changed before legacy cleanup; legacy credentials were retained",
			);
			return false;
		}
		if (!this.isSavedCredentialSelection(authenticatedCredential.id, schoolConfig)) {
			return false;
		}
		try {
			await this.updateConfig({ username: "", password: "" });
			this.clearCentralCredentialFallback(authenticatedCredential.id);
			return true;
		} catch {
			this.rememberAuthenticatedCentralCredential(authenticatedCredential);
			this.log.warn(
				"The WebUntis credential was authenticated, but legacy credentials could not be cleared; check adapter permissions",
			);
			return false;
		}
	}

	private async authenticateConfiguredCredentialAtStartup(
		generation = this.credentialGeneration,
	): Promise<string | undefined> {
		const credentialId = this.config.credentialId?.trim();
		if (!credentialId || (!this.config.username?.trim() && !this.config.password) || !this.hasSchoolConfig()) {
			return undefined;
		}
		const schoolConfig = this.getSchoolConfig();
		let credential: { id: string; username: string; password: string };
		try {
			credential = await this.resolveCentralCredential(credentialId, generation);
		} catch (error) {
			const code = error instanceof WebUntisError ? error.code : "CREDENTIAL_UNAVAILABLE";
			const temporaryFallbackId =
				code === "CREDENTIAL_CHANGED" || !this.markCentralCredentialForFallback(credentialId, generation, false)
					? undefined
					: credentialId;
			this.log.warn(
				`The selected WebUntis credential could not be read (${code}); legacy credentials were retained`,
			);
			return temporaryFallbackId;
		}
		const result = await this.webUntis.testConnection({
			...schoolConfig,
			username: credential.username,
			password: credential.password,
		});
		if (this.unloaded || generation !== this.credentialGeneration) {
			return undefined;
		}
		if (!result.ok) {
			const persistent = result.code === "INVALID_CREDENTIALS" || result.code === "USER_BLOCKED";
			const fallbackMarked = this.markCentralCredentialForFallback(
				credentialId,
				generation,
				persistent,
				credential,
			);
			this.log.warn(
				`The selected central WebUntis credential failed authentication (${result.code}); legacy credentials were retained`,
			);
			return !persistent && fallbackMarked ? credentialId : undefined;
		}
		if (!(await this.centralCredentialUnchangedAfterAuthentication(credential, generation))) {
			const fallbackMarked = this.markCentralCredentialForFallback(credentialId, generation, false);
			this.log.warn("The authenticated WebUntis credential changed; legacy credentials were retained");
			return fallbackMarked ? credentialId : undefined;
		}
		this.clearCentralCredentialFallback(credentialId);
		await this.clearLegacyCredentialsAfterSuccessfulAuthentication(credential, generation, schoolConfig, true);
		return this.temporaryFailedCentralCredentialId === credentialId ? credentialId : undefined;
	}

	private async subscribeConfiguredCredential(): Promise<void> {
		const credentialId = this.config.credentialId?.trim();
		if (credentialId) {
			await this.watchCredential(credentialId);
		}
	}

	private async watchCredential(credentialId: string): Promise<() => Promise<void>> {
		if (this.unloaded || !credentialId) {
			return () => Promise.resolve();
		}
		let watcher = this.credentialWatchers.get(credentialId);
		if (watcher) {
			watcher.references++;
		} else {
			const listener = (changedId: string): void => {
				if (changedId !== credentialId || this.unloaded) {
					return;
				}
				const generation = ++this.credentialGeneration;
				this.clearCentralCredentialFallback(credentialId);
				this.resolvedCredential = undefined;
				this.webUntis.clearSession();
				void this.setStateAsync("info.connection", false, true).catch(() => {
					if (!this.unloaded) {
						this.log.warn("Could not update the WebUntis connection state after credential changes");
					}
				});
				if (this.startupInitialized && this.hasSchoolConfig() && this.hasCredentialSource()) {
					this.clearTimetableUpdateTimer();
					void this.enqueueRefreshMutation(async () => {
						const temporaryFallbackId = await this.authenticateConfiguredCredentialAtStartup(generation);
						if (this.unloaded || generation !== this.credentialGeneration) {
							return;
						}
						try {
							await this.refreshAllLocked();
						} finally {
							this.clearTemporaryCentralCredentialFallback(temporaryFallbackId, generation);
						}
					})
						.catch(error => {
							if (!this.unloaded && generation === this.credentialGeneration) {
								const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
								this.log.warn(`WebUntis refresh after credential change failed (${code})`);
							}
						})
						.finally(() => {
							if (!this.unloaded && generation === this.credentialGeneration) {
								this.resetTimetableUpdateTimer();
								this.resetCurrentNextUpdateTimer();
							}
						});
				}
			};
			watcher = { references: 1, listener, subscription: Promise.resolve(false) };
			this.credentialWatchers.set(credentialId, watcher);
			this.on("objectChange", listener);
			watcher.subscription = Promise.resolve()
				.then(() => this.subscribeForeignObjectsAsync(credentialId))
				.then(() => true)
				.catch(() => {
					if (this.credentialWatchers.get(credentialId) === watcher) {
						this.credentialWatchers.delete(credentialId);
						this.removeListener("objectChange", listener);
					}
					this.log.warn(
						"Could not monitor the selected WebUntis credential; it will be re-read before each request",
					);
					return false;
				});
		}

		if (!(await watcher.subscription) || this.unloaded) {
			return () => Promise.resolve();
		}
		let released = false;
		return async () => {
			if (released) {
				return;
			}
			released = true;
			if (this.credentialWatchers.get(credentialId) !== watcher) {
				return;
			}
			watcher.references--;
			if (watcher.references > 0) {
				return;
			}
			this.credentialWatchers.delete(credentialId);
			this.removeListener("objectChange", watcher.listener);
			try {
				await this.unsubscribeForeignObjectsAsync(credentialId);
			} catch {
				this.log.warn("Could not unsubscribe from the selected WebUntis credential");
			}
		};
	}

	private async updateTimetable(): Promise<void> {
		return this.enqueueRefreshMutationWithFallbackCleanup(() => this.updateTimetableLocked());
	}

	private async updateTimetableLocked(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		await this.setState("info.lastUpdate", new Date().toISOString(), true);
		const refreshNow = new Date();
		let timetableGroupWriteStarted = false;
		try {
			const now = new Date();
			const messages = await this.webUntis.loadMessagesOfDay(await this.getConnectionConfig(), now);
			if (!this.unloaded) {
				await this.writeMessagesOfDay(messages, now);
			}
			this.lastNewsOfDayWarningAt = 0;
		} catch (error) {
			const warningIntervalMs = 30 * 60 * 1000;
			if (!this.unloaded && Date.now() - this.lastNewsOfDayWarningAt >= warningIntervalMs) {
				const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
				const detail = error instanceof Error ? ` (${error.message})` : "";
				this.log.warn(
					`WebUntis messages-of-day refresh failed: ${code}${detail}; previous message data was kept`,
				);
				this.lastNewsOfDayWarningAt = Date.now();
			}
		}
		try {
			const unreadMessages = await this.webUntis.loadUnreadMessages(await this.getConnectionConfig());
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
			await cleanupLegacyNamespace(this, "messages");
			await this.ensureStudentsRoot();
			await this.ensureHolidaysRoot();
			const now = refreshNow;
			const data = await this.webUntis.loadTimetable(await this.getConnectionConfig(), now);
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
			const childChannelIds = studentChannelIds(students);
			this.knownStudentIdentities = students.map(({ id, name }) => ({ id, name }));
			const firstTimetable = students[0]?.timetable ?? data;
			const nextTimetableLessons = [...firstTimetable.week];
			const nextChildTimetableLessons = new Map(
				students.map(student => [
					student.id,
					{
						name: student.name,
						channelId: childChannelIds.get(student.id)!,
						lessons: [...student.timetable.week],
					},
				]),
			);
			let updated = 0;
			let removed = 0;
			if (students.length) {
				for (const child of students) {
					this.ensureActive();
					const childRoot = `students.${childChannelIds.get(child.id)}`;
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
						timetableGroupWriteStarted = true;
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
			}
			const existingChildren = await this.getObjectListAsync({
				startkey: `${this.namespace}.students.`,
				endkey: `${this.namespace}.students.\uffff`,
			});
			const expectedChildren = new Set(childChannelIds.values());
			const childRoots = new Set(
				(existingChildren.rows || []).map(
					object => object.id.replace(`${this.namespace}.students.`, "").split(".")[0],
				),
			);
			for (const childId of childRoots) {
				if (expectedChildren.has(childId)) {
					continue;
				}
				const studentRoot = await this.getObjectAsync(`students.${childId}`);
				const native = studentRoot?.native as { studentId?: unknown } | undefined;
				if (Number.isSafeInteger(native?.studentId) || childId.startsWith("student_")) {
					this.ensureActive();
					await this.delObjectAsync(`students.${childId}`, { recursive: true });
				}
			}
			if (!students.length) {
				await this.ensureTranslatedObject(
					"timetable",
					{ type: "channel", common: { name: translatedName("timetable") }, native: {} },
					"Timetable",
				);
				for (const group of TIMETABLE_GROUPS) {
					timetableGroupWriteStarted = true;
					const result = await this.writeTimetableGroup(group, data[group], now);
					updated += result.updated;
					removed += result.removed;
				}
			}
			this.timetableLessons = nextTimetableLessons;
			this.childTimetableLessons = nextChildTimetableLessons;
			this.timetableSnapshotAt = new Date(refreshNow);
			this.hasTimetableSnapshot = true;
			this.timetableTodayDate = this.timetableDate(now);
			if (data.holidays) {
				await this.writeHolidaySummary(data.holidays);
			} else {
				this.log.warn("WebUntis holidays are not available; previous holiday values were preserved");
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
			await this.cleanupLegacyDataRoots(students.length > 0);
			await this.setState("info.lastSuccessfulUpdate", now.toISOString(), true);
			await this.setState("info.connection", true, true);
			this.log.debug(`Timetable updated: ${updated} lessons updated, ${removed} obsolete lessons removed`);
		} catch (error) {
			if (this.unloaded) {
				return;
			}
			const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
			const detail = error instanceof Error ? ` (${error.message})` : "";
			this.log.warn(`Timetable update failed: ${code}${detail}; existing timetable data was kept`);
			if (this.hasTimetableSnapshot && timetableGroupWriteStarted) {
				this.timetableTodayDate = undefined;
				try {
					await this.updateCurrentNextStatesLocked(true);
				} catch (recoveryError) {
					const recoveryDetail = recoveryError instanceof Error ? ` (${recoveryError.message})` : "";
					this.log.warn(
						`Failed to restore today's timetable from the last successful snapshot${recoveryDetail}`,
					);
				}
			}
			await this.setState("info.connection", false, true);
		}
		if (!this.unloaded) {
			await this.updateHomeworkAndAbsences();
		}
	}

	private async updateHomeworkAndAbsences(): Promise<void> {
		if (this.unloaded || !this.hasSchoolConfig() || !this.hasCredentialSource()) {
			return;
		}
		const warningIntervalMs = 30 * 60 * 1000;
		const identities = this.knownStudentIdentities?.length
			? this.knownStudentIdentities
			: await this.loadStudentIdentitiesForOptionalRefresh();
		if (!identities) {
			return;
		}
		const channelIds = studentChannelIds(identities);
		for (const student of identities) {
			const studentRoot = `students.${channelIds.get(student.id)!}`;
			await this.ensureTranslatedObject(
				studentRoot,
				{
					type: "channel",
					common: { name: student.name || `Student ${student.id}` },
					native: { studentId: student.id },
				},
				student.name || `Student ${student.id}`,
			);
			await this.ensureTranslatedObject(`${studentRoot}.absences`, {
				type: "channel",
				common: { name: translatedName("absences") },
				native: {},
			});
		}
		let schoolYear: Awaited<ReturnType<WebUntisService["loadCurrentSchoolYear"]>>;
		try {
			schoolYear = await this.webUntis.loadCurrentSchoolYear(await this.getConnectionConfig());
		} catch (error) {
			this.logOptionalRefreshFailure("homework and absences", error, "lastHomeworkWarningAt", warningIntervalMs);
			this.logOptionalRefreshFailure("homework and absences", error, "lastAbsencesWarningAt", warningIntervalMs);
			return;
		}
		const startDate = Number(schoolYear.startDate.replace(/-/g, ""));
		const endDate = Number(schoolYear.endDate.replace(/-/g, ""));
		if (!Number.isSafeInteger(startDate) || !Number.isSafeInteger(endDate) || startDate > endDate) {
			return;
		}

		try {
			const homeworks = await this.webUntis.loadHomework(
				await this.getConnectionConfig(),
				startDate,
				endDate,
				schoolYear,
			);
			if (this.unloaded) {
				return;
			}
			const grouped = new Map(identities.map(student => [student.id, [] as WebUntisHomework[]]));
			const unassigned: WebUntisHomework[] = [];
			for (const homework of homeworks) {
				const studentId = homework.studentId ?? (identities.length === 1 ? identities[0].id : undefined);
				if (studentId !== undefined && grouped.has(studentId)) {
					grouped.get(studentId)!.push(homework);
				} else {
					unassigned.push(homework);
				}
			}
			const homeworkName = translatedName("homework");
			await this.ensureTranslatedObject("homework", {
				type: "channel",
				common: { name: homeworkName },
				native: {},
			});
			for (const student of identities) {
				const studentRoot = `students.${channelIds.get(student.id)!}`;
				const records = grouped.get(student.id) ?? [];
				records.sort(
					(a, b) =>
						(a.dueDate ?? a.date ?? "9999-12-31").localeCompare(b.dueDate ?? b.date ?? "9999-12-31") ||
						String(a.id).localeCompare(String(b.id)),
				);
				const root = `${studentRoot}.homework`;
				await this.writeNumberedRecords(
					root,
					records.map(homework => this.homeworkStateValues(homework)),
					HOMEWORK_STATE_DEFINITIONS,
					homeworkName,
				);
				await this.writeCountState(`${root}.count`, translatedName("homeworkCount"), records.length);
				await this.writeCountState(
					`${root}.openCount`,
					translatedName("openHomeworkCount"),
					records.filter(item => item.status === false).length,
				);
				await this.writeCountState(
					`${root}.completedCount`,
					translatedName("completedHomeworkCount"),
					records.filter(item => item.status === true).length,
				);
				await this.writeCountState(
					`${root}.unknownCount`,
					translatedName("unknownCount"),
					records.filter(item => item.status === "unknown").length,
				);
			}
			unassigned.sort(
				(a, b) =>
					(a.dueDate ?? a.date ?? "9999-12-31").localeCompare(b.dueDate ?? b.date ?? "9999-12-31") ||
					String(a.id).localeCompare(String(b.id)),
			);
			await this.writeNumberedRecords(
				"homework.unassigned",
				unassigned.map(homework => this.homeworkStateValues(homework)),
				HOMEWORK_STATE_DEFINITIONS,
				homeworkName,
			);
			await this.writeCountState("homework.unassigned.count", translatedName("homeworkCount"), unassigned.length);
			await this.writeCountState(
				"homework.unassigned.openCount",
				translatedName("openHomeworkCount"),
				unassigned.filter(item => item.status === false).length,
			);
			await this.writeCountState(
				"homework.unassigned.completedCount",
				translatedName("completedHomeworkCount"),
				unassigned.filter(item => item.status === true).length,
			);
			await this.writeCountState(
				"homework.unassigned.unknownCount",
				translatedName("unknownCount"),
				unassigned.filter(item => item.status === "unknown").length,
			);
			this.lastHomeworkWarningAt = 0;
		} catch (error) {
			this.logOptionalRefreshFailure("homework", error, "lastHomeworkWarningAt", warningIntervalMs);
		}

		let absencesFailed = false;
		for (const student of identities) {
			if (this.unloaded) {
				return;
			}
			try {
				const channelId = channelIds.get(student.id)!;
				const root = `students.${channelId}.absences`;
				const absenceResponse = await this.webUntis.loadAbsences(
					await this.getConnectionConfig(),
					student.id,
					startDate,
					endDate,
					schoolYear,
					identities.map(identity => identity.id),
				);
				if (this.unloaded) {
					return;
				}
				const absences = absenceResponse.absences;
				const sortedAbsences = absences
					.slice()
					.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
				const records = sortedAbsences.map(absence => this.absenceStateValues(absence));
				await this.writeNumberedRecords(root, records, ABSENCE_STATE_DEFINITIONS, translatedName("absences"));
				await this.writeTypedState(`${root}.json`, JSON.stringify(records), ABSENCE_JSON_STATE_DEFINITION);
			} catch (error) {
				absencesFailed = true;
				this.logOptionalRefreshFailure("absences", error, "lastAbsencesWarningAt", warningIntervalMs);
			}
		}
		if (!absencesFailed) {
			this.lastAbsencesWarningAt = 0;
		}
	}

	private async loadStudentIdentitiesForOptionalRefresh(): Promise<WebUntisStudentIdentity[] | undefined> {
		try {
			const students = await this.webUntis.loadStudentIdentities(await this.getConnectionConfig());
			if (!this.unloaded) {
				this.knownStudentIdentities = students;
			}
			return students;
		} catch (error) {
			this.logOptionalRefreshFailure("student identity lookup", error, "lastAbsencesWarningAt", 30 * 60 * 1000);
			return undefined;
		}
	}

	private homeworkStateValues(homework: WebUntisHomework): Record<string, ioBroker.StateValue> {
		return {
			id: String(homework.id),
			lessonId: homework.lessonId === undefined ? "" : String(homework.lessonId),
			subject: homework.subject ?? "",
			teacher: homework.teacher ?? "",
			date: homework.date ?? "",
			dueDate: homework.dueDate ?? "",
			text: homework.text ?? "",
			remark: homework.remark ?? "",
			completed: homework.status === "unknown" ? null : homework.status,
			completedKnown: homework.status !== "unknown",
			hasAttachments: (homework.attachments?.length ?? 0) > 0,
		};
	}

	private absenceStateValues(absence: WebUntisAbsence): Record<string, ioBroker.StateValue> {
		const isExcused = absenceExcusedValue(absence);
		const excuseStatus =
			absence.excuseStatus || (isExcused === undefined ? "unknown" : isExcused ? "excused" : "unexcused");
		return {
			startDate: absence.startDate,
			endDate: absence.endDate,
			startTime: absence.startTime === undefined ? "" : String(absence.startTime),
			endTime: absence.endTime === undefined ? "" : String(absence.endTime),
			reason: absence.reason ?? "",
			excuseStatus,
			excuseStatusKnown: isExcused !== undefined,
			excuseText: absence.excuseText ?? "",
			isExcused: isExcused === undefined ? null : isExcused,
		};
	}

	private logOptionalRefreshFailure(
		area: string,
		error: unknown,
		warningKey: "lastHomeworkWarningAt" | "lastAbsencesWarningAt",
		warningIntervalMs: number,
	): void {
		const lastWarning = this[warningKey];
		if (this.unloaded || Date.now() - lastWarning < warningIntervalMs) {
			return;
		}
		const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
		this.log.warn(`WebUntis ${area} refresh failed: ${code}; previous data was kept`);
		this[warningKey] = Date.now();
	}

	private async loadUpcomingExamsWithRetry(now: Date): Promise<UpcomingExam[]> {
		for (let attempt = 1; attempt <= EXAMS_MAX_ATTEMPTS; attempt++) {
			this.ensureActive();
			try {
				return await this.webUntis.loadUpcomingExams(await this.getConnectionConfig(), now);
			} catch (error) {
				const transient =
					error instanceof WebUntisError && (error.code === "SERVER_UNREACHABLE" || error.code === "TIMEOUT");
				if (!transient || attempt === EXAMS_MAX_ATTEMPTS) {
					throw error;
				}
				this.log.debug(`WebUntis exams request attempt ${attempt}/${EXAMS_MAX_ATTEMPTS} failed; retrying`);
				await this.delay(attempt * 250);
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

	private async cleanupLegacyDataRoots(removeTimetable = true): Promise<void> {
		for (const id of [...(removeTimetable ? ["timetable"] : []), "exams", "children", "info.inbox"]) {
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
				const studentRoot = await this.getObjectAsync(`students.${studentId}`);
				const native = studentRoot?.native as { studentId?: unknown } | undefined;
				if (!Number.isSafeInteger(native?.studentId)) {
					await this.delObjectAsync(`students.${studentId}`, { recursive: true });
				}
			}
		}
	}

	private async ensureNewsOfDayRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"newsOfDay",
			{ type: "channel", common: { name: translatedName("newsOfDay") }, native: {} },
			"Messages of the day",
		);
		await this.ensureTranslatedObject(
			"newsOfDay.today",
			{ type: "channel", common: { name: translatedName("today") }, native: {} },
			"Today",
		);
	}

	private async writeMessagesOfDay(messages: WebUntisMessageOfDay[], today: Date): Promise<void> {
		this.ensureActive();
		const todayPath = "newsOfDay.today";
		await this.writeNewsOfDayState(`${todayPath}.date`, this.timetableDate(today));
		await this.writeNewsOfDayState(`${todayPath}.count`, messages.length);
		await this.writeNewsOfDayState(`${todayPath}.json`, JSON.stringify(messages));

		const expected = new Set(messages.map((_, index) => String(index + 1).padStart(2, "0")));
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.${todayPath}.`,
			endkey: `${this.namespace}.${todayPath}.\uffff`,
		});
		const stale = new Set<string>();
		for (const object of existing.rows || []) {
			const remainder = object.id.replace(`${this.namespace}.${todayPath}.`, "");
			const slot = remainder.split(".")[0];
			if (/^\d+$/.test(slot) && !expected.has(slot)) {
				stale.add(slot);
			}
		}
		for (const [index, message] of messages.entries()) {
			this.ensureActive();
			const messagePath = `${todayPath}.${String(index + 1).padStart(2, "0")}`;
			await this.ensureTranslatedObject(
				messagePath,
				{ type: "channel", common: { name: translatedName("message") }, native: {} },
				"Message",
			);
			for (const [field, value] of Object.entries({
				id: message.id,
				subject: message.subject,
				text: message.text,
				hasAttachments: message.hasAttachments,
			})) {
				await this.writeNewsOfDayState(`${messagePath}.${field}`, value);
			}
		}
		for (const slot of stale) {
			await this.delObjectAsync(`${todayPath}.${slot}`, { recursive: true });
		}
	}

	private async writeNewsOfDayState(id: string, value: string | number | boolean): Promise<void> {
		this.ensureActive();
		const definition =
			NEWS_OF_DAY_STATE_DEFINITIONS[id.split(".").at(-1) as keyof typeof NEWS_OF_DAY_STATE_DEFINITIONS];
		if (!definition) {
			throw new Error(`Unknown messages-of-day state: ${id}`);
		}
		await this.writeTypedState(id, value, definition);
	}

	private async writeTypedState(
		id: string,
		value: ioBroker.StateValue,
		definition: AdapterStateDefinition,
	): Promise<void> {
		this.ensureActive();
		await this.ensureTranslatedObject(id, {
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
		});
		this.ensureActive();
		await setStateChangedOrInitialize(this, id, value);
	}

	private async writeCountState(id: string, name: ioBroker.Translated, value: number): Promise<void> {
		await this.writeTypedState(id, value, { type: "number", role: "value", name, def: 0 });
	}

	private async writeNumberedRecords(
		root: string,
		records: Array<Record<string, ioBroker.StateValue>>,
		definitions: Record<string, AdapterStateDefinition>,
		channelName: ioBroker.Translated,
	): Promise<void> {
		this.ensureActive();
		await this.ensureTranslatedObject(root, {
			type: "channel",
			common: { name: channelName },
			native: {},
		});
		const expected = new Set(records.map((_, index) => String(index + 1).padStart(2, "0")));
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.${root}.`,
			endkey: `${this.namespace}.${root}.\uffff`,
		});
		const stale = new Set<string>();
		for (const object of existing.rows || []) {
			const remainder = object.id.replace(`${this.namespace}.${root}.`, "");
			const slot = remainder.split(".")[0];
			if (/^\d+$/.test(slot) && slot !== "0" && !expected.has(slot)) {
				stale.add(slot);
			}
		}
		for (const [index, record] of records.entries()) {
			this.ensureActive();
			const slot = String(index + 1).padStart(2, "0");
			const channelId = `${root}.${slot}`;
			await this.ensureTranslatedObject(channelId, {
				type: "channel",
				common: { name: channelName },
				native: {},
			});
			for (const [field, value] of Object.entries(record)) {
				const definition = definitions[field];
				if (definition) {
					await this.writeTypedState(`${channelId}.${field}`, value, definition);
				}
			}
		}
		for (const slot of stale) {
			this.ensureActive();
			await this.delObjectAsync(`${root}.${slot}`, { recursive: true });
		}
	}

	private async ensureInboxRoot(): Promise<void> {
		await this.ensureTranslatedObject(
			"inbox",
			{ type: "channel", common: { name: translatedName("inbox") }, native: {} },
			"Messages",
		);
		await this.ensureTranslatedObject(
			"inbox.unread",
			{ type: "channel", common: { name: { en: "Unread", de: "Ungelesen" } }, native: {} },
			"Unread",
		);
		await this.ensureTranslatedObject(
			"inbox.unread.count",
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
			"inbox.read",
			{ type: "channel", common: { name: { en: "Read", de: "Gelesen" } }, native: {} },
			"Read",
		);
		await this.ensureTranslatedObject(
			"inbox.read.count",
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
		const oldCount = await this.getStateAsync("inbox.unreadCount");
		const previousUnreadCount = await this.getStateAsync("inbox.messages.unread.count");
		const previousReadCount = await this.getStateAsync("inbox.messages.read.count");
		await this.initializeRootState(
			"inbox.unread.count",
			previousUnreadCount?.val ?? oldCount?.val ?? legacyCount?.val ?? 0,
		);
		await this.initializeRootState("inbox.read.count", previousReadCount?.val ?? 0);
		await this.delObjectAsync("inbox.messages.unread.unread");
		await this.delObjectAsync("inbox.unreadCount");
		await this.delObjectAsync("info.inbox.unread");
	}

	private async initializeRootState(id: string, defaultValue: ioBroker.StateValue): Promise<void> {
		const current = await this.getStateAsync(id);
		await setStateChangedOrInitialize(this, id, current?.val ?? defaultValue);
	}

	private writeUnreadMessages(messages: WebUntisInboxMessage[]): Promise<void> {
		return this.enqueueInboxMutation(() => this.writeUnreadMessagesLocked(messages));
	}

	private async writeUnreadMessagesLocked(messages: WebUntisInboxMessage[]): Promise<void> {
		const sortedMessages = [...messages].sort((left, right) => left.dateTime.localeCompare(right.dateTime));
		const unreadMessages: WebUntisInboxMessage[] = [];
		const locallyReadIds = new Set<string>();
		const existingReadRows = await Promise.all(
			["inbox.read.", "inbox.messages.read."].map(async path => {
				const result = await this.getObjectListAsync({
					startkey: `${this.namespace}.${path}`,
					endkey: `${this.namespace}.${path}\uffff`,
				});
				return result.rows || [];
			}),
		);
		for (const row of existingReadRows.flat()) {
			const relativePath = row.id.replace(`${this.namespace}.`, "");
			if (!/^inbox\.(?:messages\.)?read\.[^.]+\.id$/.test(relativePath)) {
				continue;
			}
			const messageId = await this.getStateAsync(relativePath);
			const parentPath = relativePath.replace(/\.id$/, "");
			const readLocally = await this.getStateAsync(`${parentPath}.readLocally`);
			const channel = await this.getObjectAsync(parentPath);
			if (messageId?.val !== undefined && (channel?.native?.locallyRead === true || readLocally?.val === true)) {
				locallyReadIds.add(String(messageId.val));
			}
		}
		for (const message of sortedMessages) {
			const locallyRead = !message.readInWebUntis && locallyReadIds.has(String(message.id));
			if (!message.readInWebUntis && !locallyRead) {
				unreadMessages.push(message);
			}
		}
		await setStateChangedOrInitialize(this, "inbox.unread.count", unreadMessages.length);
		const messageRoot = "inbox";
		const expected = new Set<string>();
		const slots: Record<"read" | "unread", number> = { read: 0, unread: 0 };
		for (const message of sortedMessages) {
			this.ensureActive();
			const locallyRead = !message.readInWebUntis && locallyReadIds.has(String(message.id));
			const group = locallyRead || message.readInWebUntis ? "read" : "unread";
			const slot = String(++slots[group]).padStart(2, "0");
			const messagePath = `${messageRoot}.${group}.${slot}`;
			expected.add(`${group}.${slot}`);
			await this.ensureTranslatedObject(
				messagePath,
				{
					type: "channel",
					common: { name: message.subject || `Message ${message.id}` },
					native: {
						messageId: message.id,
						locallyRead,
						[WebuntisNext.generatedLessonNameKey]: message.subject || `Message ${message.id}`,
					},
				},
				message.subject || `Message ${message.id}`,
				true,
			);
			await this.extendObjectAsync(messagePath, { native: { locallyRead } });
			if (await this.getObjectAsync(`${messagePath}.readLocally`)) {
				await this.delObjectAsync(`${messagePath}.readLocally`);
			}
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
			await this.ensureTranslatedObject(
				`${messagePath}.read`,
				{
					type: "state",
					common: {
						name: translatedName("effectiveRead"),
						type: "boolean",
						role: "indicator",
						read: true,
						write: false,
						def: false,
					},
					native: {},
				},
				"Read",
			);
			await setStateChangedOrInitialize(this, `${messagePath}.read`, locallyRead || message.readInWebUntis);
			await this.writeSimpleState(
				`${messagePath}.readInWebUntis`,
				message.readInWebUntis,
				"Read in WebUntis",
				"boolean",
				"indicator",
				false,
			);
			if (group === "read") {
				await this.ensureTranslatedObject(
					`${messagePath}.markAsUnread`,
					{
						type: "state",
						common: {
							name: { en: "Mark as unread", de: "Als ungelesen markieren" },
							type: "boolean",
							role: "button",
							read: false,
							write: true,
							def: false,
						},
						native: {},
					},
					"Mark as unread",
				);
			}
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
		await setStateChangedOrInitialize(this, "inbox.read.count", slots.read);
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
				(parts[0] === "unread" && parts[1] === "count") ||
				(parts[0] === "messages" && parts[1] === "read" && parts[2] === "count") ||
				(parts[0] === "messages" && parts[1] === "unread" && parts[2] === "count")
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
		await this.delObjectAsync("inbox.messages", { recursive: true });
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
			if (exam.studentName) {
				studentNames.set(exam.studentId, exam.studentName);
			}
		}
		const channelIds = studentChannelIds(
			[...students.keys()].map(id => ({ id, name: studentNames.get(id) || `Student ${id}` })),
		);
		for (const [studentId, studentExams] of students) {
			this.ensureActive();
			const studentName =
				studentExams.find(exam => exam.studentName)?.studentName ||
				studentNames.get(studentId) ||
				`Student ${studentId}`;
			const studentRoot = `students.${channelIds.get(studentId)}`;
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
					{
						name: translatedName("upcomingExamCount"),
						type: "number",
						role: "value",
						read: true,
						write: false,
						def: 0,
					},
					studentExams.length,
				],
				[
					"upcoming",
					"Upcoming exams",
					{
						name: translatedName("upcomingExams"),
						type: "string",
						role: "json",
						read: true,
						write: false,
						def: "[]",
					},
					JSON.stringify(studentExams),
				],
				[
					"upcomingText",
					"Upcoming exams text",
					{
						name: translatedName("upcomingExamsText"),
						type: "string",
						role: "text",
						read: true,
						write: false,
						def: "",
					},
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
					daysUntil: translatedName("daysUntil"),
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
											: field === "daysUntil"
												? "value.interval"
												: type === "number"
													? "value"
													: "text",
								...(field === "daysUntil" ? { unit: "d" } : {}),
								read: true,
								write: false,
								def: type === "number" ? 0 : "",
							},
							native: {},
						},
						field === "daysUntil" ? [String(names[field].en), "daysUntil"] : String(names[field].en),
						false,
						field === "daysUntil",
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
			"holidays.current.endDate",
			numericDate(summary.current.endDate),
			"End date",
			"number",
			"date",
			0,
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
		return this.enqueueRefreshMutation(() => this.updateCurrentNextStatesLocked());
	}

	private async updateCurrentNextStatesLocked(force = false, now = new Date()): Promise<void> {
		if (this.unloaded || !this.hasTimetableSnapshot) {
			return;
		}
		const nowMs = now.getTime();
		const today = this.timetableDate(now);
		const dateChanged = this.lastCurrentNextUpdateDate !== today;
		const todayNeedsRefresh = this.timetableTodayDate !== today;
		if (
			!force &&
			!dateChanged &&
			!todayNeedsRefresh &&
			this.lastCurrentNextUpdateAt !== undefined &&
			nowMs - this.lastCurrentNextUpdateAt < this.getCurrentNextRefreshIntervalMs()
		) {
			return;
		}
		if (todayNeedsRefresh) {
			for (const child of this.childTimetableLessons.values()) {
				const lessons = child.lessons.filter(lesson => lesson.date === today);
				await this.writeTimetableGroup("today", lessons, now, `students.${child.channelId}.timetable`);
			}
			if (this.childTimetableLessons.size === 0) {
				const lessons = this.timetableLessons.filter(lesson => lesson.date === today);
				await this.writeTimetableGroup("today", lessons, now);
			}
		}
		for (const child of this.childTimetableLessons.values()) {
			await this.writeCurrentNextSummary(child.lessons, now, `students.${child.channelId}.timetable.today`);
		}
		if (this.childTimetableLessons.size === 0) {
			await this.writeCurrentNextSummary(this.timetableLessons, now, "timetable.today");
		}
		if (todayNeedsRefresh) {
			this.timetableTodayDate = today;
		}
		this.lastCurrentNextUpdateAt = nowMs;
		this.lastCurrentNextUpdateDate = today;
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
		for (const root of ["holidays", "students"]) {
			const existing = await this.getObjectListAsync({
				startkey: `${this.namespace}.${root}.`,
				endkey: `${this.namespace}.${root}.\uffff`,
			});
			for (const object of existing.rows || []) {
				if (/\.(?:dateTimestamp|startDateTimestamp|endDateTimestamp)$/.test(object.id)) {
					await this.delObjectAsync(object.id.slice(this.namespace.length + 1));
				}
			}
		}
		await this.cleanupAbsenceStructure();
	}

	private async cleanupAbsenceStructure(): Promise<void> {
		const existing = await this.getObjectListAsync({
			startkey: `${this.namespace}.students.`,
			endkey: `${this.namespace}.students.\uffff`,
		});
		const roots = new Set<string>();
		for (const object of existing.rows || []) {
			const match = object.id.slice(this.namespace.length + 1).match(/^(students\..+?\.absences)(?:\.|$)/);
			if (match) {
				roots.add(match[1]);
			}
		}
		for (const relativeRoot of roots) {
			const root = `${this.namespace}.${relativeRoot}`;
			const objects = await this.getObjectListAsync({ startkey: `${root}.`, endkey: `${root}.\uffff` });
			const rows = (objects.rows || []).slice().sort((a, b) => a.id.length - b.id.length);
			const removed = new Set<string>();
			for (const object of rows) {
				if (Array.from(removed).some(id => object.id.startsWith(`${id}.`))) {
					continue;
				}
				const remainder = object.id.slice(root.length + 1);
				const parts = remainder.split(".");
				const isJsonState = remainder === "json" && object.value.type === "state";
				const isEntryChannel =
					parts.length === 1 && /^\d{2}$/.test(parts[0]) && object.value.type === "channel";
				const isEntryState =
					parts.length === 2 &&
					/^\d{2}$/.test(parts[0]) &&
					ABSENCE_STATE_ALLOWED_IDS.has(parts[1]) &&
					object.value.type === "state";
				if (!isJsonState && !isEntryChannel && !isEntryState) {
					const relativeId = object.id.slice(this.namespace.length + 1);
					await this.delObjectAsync(relativeId, { recursive: true });
					removed.add(object.id);
				}
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

	private rememberVerifiedSchoolSelection(school: SchoolSearchResult): string {
		const selection = encodeSchoolSelection(school);
		this.verifiedSchoolSelections.delete(selection);
		this.verifiedSchoolSelections.set(selection, school);
		while (this.verifiedSchoolSelections.size > MAX_VERIFIED_SCHOOL_SELECTIONS) {
			const oldestSelection = this.verifiedSchoolSelections.keys().next().value;
			if (oldestSelection === undefined) {
				break;
			}
			this.verifiedSchoolSelections.delete(oldestSelection);
		}
		return selection;
	}

	private async onMessage(obj: ioBroker.Message): Promise<void> {
		if (obj?.command === "searchSchools") {
			this.log.info(`School search request received (callback: ${Boolean(obj.callback)})`);
		}
		if (this.unloaded || !obj || !obj.command || !obj.callback) {
			return;
		}
		if (obj.command !== "searchSchools" && !/^system\.adapter\.admin\.\d+$/.test(obj.from)) {
			this.sendTo(
				obj.from,
				obj.command,
				{ ok: false, code: "UNAUTHORIZED", error: "UNAUTHORIZED" },
				obj.callback,
			);
			return;
		}
		try {
			if (obj.command === "searchSchools") {
				const query = this.getStringPayload(obj.message, "query");
				const results = rankSchoolResults(await this.webUntis.searchSchools(query), query);
				if (this.unloaded) {
					return;
				}
				this.log.info(`School search returned ${results.length} results`);
				this.sendTo(
					obj.from,
					obj.command,
					results.map(school => ({
						label: school.displayName,
						value: this.rememberVerifiedSchoolSelection(school),
						description: [school.address, school.loginName].filter(Boolean).join(" · "),
						noTranslation: true,
					})),
					obj.callback,
				);
				return;
			}
			if (obj.command === "testConnection") {
				const selectedCredentialId = this.getSelectedCredentialId(obj.message);
				const configuredCredentialId = this.config.credentialId?.trim();
				const releaseCredentialWatch =
					selectedCredentialId && selectedCredentialId === configuredCredentialId
						? await this.watchCredential(selectedCredentialId)
						: undefined;
				try {
					if (this.unloaded) {
						return;
					}
					const credentialGeneration = this.credentialGeneration;
					const config = await this.getConnectionPayload(obj.message, credentialGeneration);
					if (this.unloaded) {
						return;
					}
					if (credentialGeneration !== this.credentialGeneration) {
						throw new WebUntisError(
							"CREDENTIAL_CHANGED",
							"The selected credential changed during the connection test",
						);
					}
					const result = await this.webUntis.testConnection(config);
					if (this.unloaded) {
						return;
					}
					if (selectedCredentialId) {
						let currentCredential: { id: string; username: string; password: string };
						try {
							currentCredential = await this.resolveCentralCredential(
								selectedCredentialId,
								credentialGeneration,
							);
						} catch {
							throw new WebUntisError(
								"CREDENTIAL_CHANGED",
								"The selected credential changed during the connection test",
							);
						}
						if (
							currentCredential.username !== config.username ||
							currentCredential.password !== config.password
						) {
							throw new WebUntisError(
								"CREDENTIAL_CHANGED",
								"The selected credential changed during the connection test",
							);
						}
					}
					if (credentialGeneration !== this.credentialGeneration) {
						this.sendTo(
							obj.from,
							obj.command,
							{ ok: false, code: "CREDENTIAL_CHANGED", error: "CREDENTIAL_CHANGED" },
							obj.callback,
						);
						return;
					}
					if (
						!result.ok &&
						selectedCredentialId &&
						this.isSavedCredentialSelection(selectedCredentialId, config) &&
						(result.code === "INVALID_CREDENTIALS" || result.code === "USER_BLOCKED")
					) {
						this.markCentralCredentialForFallback(selectedCredentialId, credentialGeneration, true, {
							username: config.username,
							password: config.password,
						});
					}
					await this.setState("info.connection", result.ok, true);
					if (credentialGeneration !== this.credentialGeneration) {
						await this.setState("info.connection", false, true);
						this.sendTo(
							obj.from,
							obj.command,
							{ ok: false, code: "CREDENTIAL_CHANGED", error: "CREDENTIAL_CHANGED" },
							obj.callback,
						);
						return;
					}
					if (result.ok) {
						if (selectedCredentialId && this.isSavedCredentialSelection(selectedCredentialId, config)) {
							this.clearCentralCredentialFallback(selectedCredentialId);
						}
						this.log.info("WebUntis authentication successful");
						this.sendTo(obj.from, obj.command, { ok: true, result: "CONNECTED" }, obj.callback);
						if (selectedCredentialId) {
							await this.clearLegacyCredentialsAfterSuccessfulAuthentication(
								{ id: selectedCredentialId, username: config.username, password: config.password },
								credentialGeneration,
								config,
							);
						}
					} else {
						this.log.warn(`WebUntis authentication failed: ${result.code}`);
						this.sendTo(obj.from, obj.command, { ...result, error: result.code }, obj.callback);
					}
				} finally {
					await releaseCredentialWatch?.();
				}
			}
		} catch (error) {
			if (this.unloaded) {
				return;
			}
			const code = error instanceof WebUntisError ? error.code : "UNEXPECTED_RESPONSE";
			this.log.warn(`WebUntis request failed: ${code}`);
			const payload = obj.command === "searchSchools" ? [] : { ok: false, code, error: code };
			this.sendTo(obj.from, obj.command, payload, obj.callback);
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

	private getSelectedCredentialId(message: ioBroker.MessagePayload): string {
		if (typeof message === "object" && message !== null) {
			const value = message as Record<string, unknown>;
			if (Object.prototype.hasOwnProperty.call(value, "credentialId")) {
				return typeof value.credentialId === "string" ? value.credentialId.trim() : "";
			}
		}
		return this.config.credentialId?.trim() ?? "";
	}

	private async getConnectionPayload(
		message: ioBroker.MessagePayload,
		expectedGeneration = this.credentialGeneration,
	): Promise<WebUntisConnectionConfig> {
		if (typeof message !== "object" || message === null) {
			throw new WebUntisError("INVALID_CONFIG", "Invalid connection payload");
		}
		const value = message as Record<string, unknown>;
		let schoolConfig = this.getSchoolConfig();
		if (value.schoolSelection !== undefined && value.schoolSelection !== "") {
			if (typeof value.schoolSelection !== "string") {
				throw new WebUntisError("INVALID_CONFIG", "Invalid school selection");
			}
			const selectedSchool =
				this.verifiedSchoolSelections.get(value.schoolSelection) ??
				(value.schoolSelection === this.config.schoolSelection
					? decodeSchoolSelection(value.schoolSelection)
					: undefined);
			if (!selectedSchool) {
				throw new WebUntisError("INVALID_CONFIG", "School selection was not returned by WebUntis search");
			}
			schoolConfig = schoolResultToConfig(selectedSchool);
		}
		if (!schoolConfig.server || !schoolConfig.schoolName || schoolConfig.schoolId === null) {
			return { ...schoolConfig, username: "", password: "" };
		}
		const credentialId = this.getSelectedCredentialId(message);
		return this.getConnectionConfig(credentialId, schoolConfig, !credentialId, expectedGeneration);
	}

	private onUnload(callback: () => void): void {
		if (this.unloaded) {
			return;
		}
		this.unloaded = true;
		this.credentialGeneration++;
		this.webUntis.shutdown();
		this.failedCentralCredentialId = undefined;
		this.failedCentralCredentialSnapshot = undefined;
		this.authenticatedCentralCredentialSnapshot = undefined;
		this.temporaryFailedCentralCredentialId = undefined;
		this.resolvedCredential = undefined;
		const credentialWatchers = [...this.credentialWatchers.entries()];
		this.credentialWatchers.clear();
		for (const [credentialId, watcher] of credentialWatchers) {
			this.removeListener("objectChange", watcher.listener);
			void watcher.subscription
				.then(async subscribed => {
					if (subscribed) {
						await this.unsubscribeForeignObjectsAsync(credentialId);
					}
				})
				.catch(() => {
					this.log.warn("Could not unsubscribe from the selected WebUntis credential");
				});
		}
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
