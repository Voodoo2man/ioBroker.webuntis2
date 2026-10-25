/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string */

import { expect } from "chai";
import { removeStaleLessonStates } from "./lib/LessonStateCleanup";
import type { UpcomingExam } from "./lib/webuntis/Exams";
import {
	mergeSchoolSelection,
	rankSchoolResults,
	schoolResultToConfig,
	searchSchools,
} from "./lib/webuntis/SchoolDiscovery";
import { WebUntisClient } from "./lib/webuntis/WebUntisClient";
import { WebUntisError } from "./lib/webuntis/WebUntisErrors";
import { WebUntisService } from "./lib/webuntis/WebUntisService";
import type { WebUntisInboxMessage } from "./lib/webuntis/WebUntisTypes";

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type AdapterClass = { prototype: object };

function loadAdapterClassForTest(): AdapterClass {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeModule = require("node:module") as {
		_load: (request: string, parent: unknown, isMain: boolean) => unknown;
	};
	const originalLoad = nodeModule._load;
	nodeModule._load = function (request, parent, isMain) {
		if (request === "@iobroker/adapter-core") {
			return { Adapter: class {} };
		}
		return originalLoad.call(this, request, parent, isMain);
	};
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return (require("./main") as { WebuntisNext: AdapterClass }).WebuntisNext;
	} finally {
		nodeModule._load = originalLoad;
	}
}

type AdapterHarness = {
	adapter: object;
	methods: {
		updateTimetable(): Promise<void>;
		refreshAll(): Promise<void>;
		ensureInboxRoot(): Promise<void>;
		subscribeInboxMessageActions(): Promise<void>;
		writeUnreadMessages(messages: never[]): Promise<void>;
		onStateChange(id: string, state: ioBroker.State | null): Promise<void>;
		writeDaySummary(path: string, summary: never, lessons: never[]): Promise<void>;
		writeTimetableDay(path: string, lessons: never[], date: string): Promise<{ removed: number }>;
		writeHolidaySummary(summary: never): Promise<void>;
		cleanupObsoleteStructure(): Promise<void>;
		updateCurrentNextStates(): Promise<void>;
	};
	values: Map<string, ioBroker.StateValue>;
	deleted: string[];
	objects: Record<string, ioBroker.SettableObject>;
	warnings: string[];
	groupWrites: Array<{ group: string; root: string }>;
	subscriptions: string[];
};

function makeAdapterHarness(
	examLoader: () => Promise<UpcomingExam[]>,
	existingSlots: number[] = [],
	children: Array<{ id: number; name: string; timetable: { today: never[]; tomorrow: never[]; week: never[] } }> = [],
	writeRealHolidaySummary = false,
	writeRealUnreadMessages = false,
	existingMessageIds: string[] = [],
	existingTimestampIds: string[] = [],
	existingSlotsStudentRoot = "42",
): AdapterHarness {
	const AdapterClass = loadAdapterClassForTest();
	const adapter = Object.create(AdapterClass.prototype) as object;
	const values = new Map<string, ioBroker.StateValue>([
		["students.42.exams.count", 8],
		["students.42.exams.upcoming", '[{"id":88}]'],
		["students.42.exams.upcomingText", "previous exams"],
		["info.inbox.unreadCount", 3],
		["info.inbox.unread", '[{"id":1}]'],
	]);
	const deleted: string[] = [];
	const objects: Record<string, ioBroker.SettableObject> = {};
	const warnings: string[] = [];
	const groupWrites: Array<{ group: string; root: string }> = [];
	const subscriptions: string[] = [];
	const allObjectRows = [
		...existingTimestampIds.map(id => ({ id: `webuntis2.0.${id}` })),
		...existingSlots.flatMap(slot => {
			const slotId = String(slot).padStart(2, "0");
			return [
				{ id: `webuntis2.0.students.${existingSlotsStudentRoot}.exams.entries.${slotId}` },
				{ id: `webuntis2.0.students.${existingSlotsStudentRoot}.exams.entries.${slotId}.subject` },
			];
		}),
		...existingMessageIds.flatMap(id => [
			{ id: `webuntis2.0.inbox.messages.unread.${id}` },
			{ id: `webuntis2.0.inbox.messages.unread.${id}.subject` },
		]),
	];
	const overrides: Record<string, unknown> = {
		unloaded: false,
		lastExamsWarningAt: 0,
		childTodayLessons: new Map(),
		namespace: "webuntis2.0",
		config: { server: "https://example.webuntis.com" },
		webUntis: {
			loadTimetable: async () => ({
				today: [],
				tomorrow: [],
				week: [],
				holidays: {} as never,
				personType: children.length ? 12 : 5,
				studentId: children.length ? undefined : 42,
				children,
			}),
			loadUnreadMessages: async () => [],
			loadUpcomingExams: examLoader,
		},
		log: { warn: (message: string) => warnings.push(message), debug: () => undefined, error: () => undefined },
		setState: async (id: string, value: ioBroker.StateValue) => {
			values.set(id, value);
		},
		getStateAsync: async (id: string) => {
			const val = values.get(id);
			return val === undefined ? null : ({ val, ack: true } as ioBroker.State);
		},
		setStateAsync: async (id: string, value: ioBroker.StateValue) => {
			values.set(id, value);
		},
		setStateChangedAsync: async (id: string, value: ioBroker.StateValue) => {
			if (values.get(id) !== value) {
				values.set(id, value);
			}
		},
		subscribeStatesAsync: async (pattern: string) => {
			subscriptions.push(pattern);
		},
		ensureTranslatedObject: async (id: string, object: ioBroker.SettableObject) => {
			objects[id] = object;
		},
		getObjectAsync: async (id: string) => (objects[id] as ioBroker.Object | undefined) ?? null,
		getObjectListAsync: async ({ startkey }: { startkey: string }) => ({
			rows: [...allObjectRows, ...Object.keys(objects).map(id => ({ id: `webuntis2.0.${id}` }))].filter(row =>
				row.id.startsWith(startkey),
			),
		}),
		delObjectAsync: async (id: string) => {
			deleted.push(id);
			for (const objectId of Object.keys(objects)) {
				if (objectId === id || objectId.startsWith(`${id}.`)) {
					delete objects[objectId];
				}
			}
		},
		ensureHolidaysRoot: async () => undefined,
		writeTimetableGroup: async (group: string, _lessons: unknown, _now: Date, root = "timetable") => {
			groupWrites.push({ group, root });
			return { updated: 0, removed: 0 };
		},
	};
	Object.assign(adapter, overrides);
	if (!writeRealUnreadMessages) {
		Object.assign(adapter, { writeUnreadMessages: async () => undefined });
	}
	if (!writeRealHolidaySummary) {
		Object.assign(adapter, { writeHolidaySummary: async () => undefined });
	}
	const methods = adapter as unknown as {
		updateTimetable(): Promise<void>;
		refreshAll(): Promise<void>;
		ensureInboxRoot(): Promise<void>;
		subscribeInboxMessageActions(): Promise<void>;
		writeUnreadMessages(messages: never[]): Promise<void>;
		onStateChange(id: string, state: ioBroker.State | null): Promise<void>;
		writeDaySummary(path: string, summary: never, lessons: never[]): Promise<void>;
		writeTimetableDay(path: string, lessons: never[], date: string): Promise<{ removed: number }>;
		writeHolidaySummary(summary: never): Promise<void>;
		cleanupObsoleteStructure(): Promise<void>;
		updateCurrentNextStates(): Promise<void>;
	};
	return { adapter, methods, values, deleted, objects, warnings, groupWrites, subscriptions };
}

const sampleExam = (id: number, startTime: string, displayText: string): UpcomingExam => ({
	id,
	subject: "Mathematics",
	date: "2026-11-03",
	startTime,
	endTime: "10:00",
	name: "Written exam",
	text: "Chapters 1–3",
	displayText,
});

describe("upcoming exams adapter states", () => {
	it("triggers a full refresh for local and qualified IDs regardless of ack", async () => {
		const harness = makeAdapterHarness(async () => []);
		let refreshCount = 0;
		Object.assign(harness.adapter, { refreshAll: async () => void (refreshCount += 1) });

		await harness.methods.onStateChange("info.refresh", { val: true, ack: false } as ioBroker.State);
		await harness.methods.onStateChange("webuntis2.0.info.refresh", { val: true, ack: true } as ioBroker.State);

		expect(refreshCount).to.equal(2);
		expect(harness.values.get("info.refresh")).to.equal(false);
	});

	it("subscribes to unread-message mark-read buttons", async () => {
		const harness = makeAdapterHarness(async () => []);
		await harness.methods.subscribeInboxMessageActions();

		expect(harness.subscriptions).to.deep.equal(["inbox.messages.unread.*.markRead"]);
	});

	it("runs all startup refresh steps when manually refreshed", async () => {
		const harness = makeAdapterHarness(async () => []);
		const steps: string[] = [];
		Object.assign(harness.adapter, {
			ensureStudentsRoot: async () => void steps.push("students"),
			ensureInboxRoot: async () => void steps.push("inbox"),
			ensureHolidaysRoot: async () => void steps.push("holidays"),
			cleanupObsoleteStructure: async () => void steps.push("cleanup"),
			updateTimetable: async () => void steps.push("timetable"),
			updateCurrentNextStates: async () => void steps.push("current-next"),
		});

		await harness.methods.refreshAll();

		expect(steps).to.deep.equal(["students", "inbox", "holidays", "cleanup", "timetable", "current-next"]);
	});

	it("removes legacy units from calendar date objects", async () => {
		const AdapterClass = loadAdapterClassForTest();
		const existing = {
			_id: "webuntis2.0.students.student_42.exams.entries.01.date",
			type: "state",
			common: { name: "Date", type: "number", role: "date", read: true, write: false, unit: "ms" },
			native: {},
		} as ioBroker.StateObject;
		let unit: unknown = existing.common.unit;
		const adapter = Object.assign(Object.create(AdapterClass.prototype) as object, {
			unloaded: false,
			migratedNames: new Set<string>(),
			ensureActive: () => undefined,
			setObjectNotExistsAsync: async () => undefined,
			getObjectAsync: async () => existing,
			extendObjectAsync: async (_id: string, patch: { common: { unit: null } }) => {
				if (patch.common.unit === null) {
					unit = undefined;
				}
			},
		});
		const ensureTranslatedObject = (
			AdapterClass.prototype as unknown as {
				ensureTranslatedObject: (
					id: string,
					object: ioBroker.SettableObject,
					legacyName?: string | string[],
					dynamicName?: boolean,
					clearDescription?: boolean,
				) => Promise<void>;
			}
		).ensureTranslatedObject;

		await ensureTranslatedObject.call(
			adapter,
			"students.student_42.exams.entries.01.date",
			{
				type: "state",
				common: { name: "Date", type: "number", role: "date", read: true, write: false },
				native: {},
			},
			"Date",
		);

		expect(unit).to.equal(undefined);
	});

	it("removes the daysUntil description and migrates its legacy name", async () => {
		const AdapterClass = loadAdapterClassForTest();
		let updatedCommon: Record<string, unknown> = {};
		const adapter = Object.assign(Object.create(AdapterClass.prototype) as object, {
			unloaded: false,
			migratedNames: new Set<string>(),
			ensureActive: () => undefined,
			setObjectNotExistsAsync: async () => undefined,
			getObjectAsync: async () => ({
				_id: "webuntis2.0.students.andres_lilly_marie.exams.entries.01.daysUntil",
				type: "state",
				common: {
					name: "daysUntil",
					desc: { en: "Old description" },
					type: "number",
					role: "value.interval",
					read: true,
					write: false,
				},
				native: {},
			}),
			extendObjectAsync: async (_id: string, patch: { common: Record<string, unknown> }) => {
				updatedCommon = patch.common;
			},
		});
		const ensureTranslatedObject = (
			AdapterClass.prototype as unknown as {
				ensureTranslatedObject: (
					id: string,
					object: ioBroker.SettableObject,
					legacyName?: string | string[],
					dynamicName?: boolean,
					clearDescription?: boolean,
				) => Promise<void>;
			}
		).ensureTranslatedObject;
		await ensureTranslatedObject.call(
			adapter,
			"students.andres_lilly_marie.exams.entries.01.daysUntil",
			{
				type: "state",
				common: {
					name: {
						en: "Days until",
						de: "Tage bis dahin",
						es: "Días restantes",
						fr: "Jours restants",
						it: "Giorni rimanenti",
						nl: "Dagen tot",
						pl: "Dni do",
						pt: "Dias restantes",
						ru: "Дней до начала",
						uk: "Днів до початку",
						"zh-cn": "剩余天数",
					},
					type: "number",
					role: "value.interval",
					read: true,
					write: false,
				},
				native: {},
			},
			["Days until", "daysUntil"],
			false,
			true,
		);

		expect(updatedCommon.name).to.include({ en: "Days until", de: "Tage bis dahin" });
		expect(updatedCommon.desc).to.equal(null);
	});

	it("removes the refresh description and migrates its legacy name", async () => {
		const AdapterClass = loadAdapterClassForTest();
		let updatedCommon: Record<string, unknown> = {};
		const adapter = Object.assign(Object.create(AdapterClass.prototype) as object, {
			unloaded: false,
			migratedNames: new Set<string>(),
			ensureActive: () => undefined,
			setObjectNotExistsAsync: async () => undefined,
			getObjectAsync: async () => ({
				_id: "webuntis2.0.info.refresh",
				type: "state",
				common: { name: "refresh", desc: { en: "Old description" }, type: "boolean", role: "button" },
				native: {},
			}),
			extendObjectAsync: async (_id: string, patch: { common: Record<string, unknown> }) => {
				updatedCommon = patch.common;
			},
		});
		const ensureTranslatedObject = (
			AdapterClass.prototype as unknown as {
				ensureTranslatedObject: (
					id: string,
					object: ioBroker.SettableObject,
					legacyName?: string | string[],
					dynamicName?: boolean,
					clearDescription?: boolean,
				) => Promise<void>;
			}
		).ensureTranslatedObject;

		await ensureTranslatedObject.call(
			adapter,
			"info.refresh",
			{
				type: "state",
				common: {
					name: {
						en: "Refresh now",
						de: "Jetzt aktualisieren",
						es: "Actualizar ahora",
						fr: "Actualiser maintenant",
						it: "Aggiorna ora",
						nl: "Nu vernieuwen",
						pl: "Odśwież teraz",
						pt: "Atualizar agora",
						ru: "Обновить сейчас",
						uk: "Оновити зараз",
						"zh-cn": "立即刷新",
					},
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

		expect(updatedCommon.name).to.include({ en: "Refresh now", de: "Jetzt aktualisieren" });
		expect(updatedCommon.desc).to.equal(null);
	});

	it("keeps inbox at the instance root and migrates old info inbox values", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], true);
		await harness.methods.ensureInboxRoot();

		expect(harness.objects.inbox.type).to.equal("channel");
		expect(harness.objects["inbox.messages.unread.unreadCount"]).to.exist;
		expect(harness.objects["inbox.messages.unread.unread"]).to.exist;
		expect(harness.objects["inbox.unreadCount"]).to.equal(undefined);
		expect(harness.objects["inbox.unread"]).to.equal(undefined);
		expect(harness.values.get("inbox.messages.unread.unreadCount")).to.equal(3);
		expect(harness.values.get("inbox.messages.unread.unread")).to.equal('[{"id":1}]');
	});

	it("writes each unread message to its own channel with all fields", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], false, true, ["123"]);
		const message = {
			id: 456,
			readInWebUntis: false,
			dateTime: "2026-10-15T10:00:00",
			sender: "Teacher",
			subject: "Schedule change",
			content: "The lesson starts later.",
			contentIsPreview: false,
			hasAttachments: true,
		};

		await harness.methods.ensureInboxRoot();
		harness.deleted.length = 0;
		await harness.methods.writeUnreadMessages([message] as never[]);

		expect(harness.objects["inbox.messages.unread.01"].type).to.equal("channel");
		for (const [field, value] of Object.entries(message)) {
			if (field !== "readInWebUntis") {
				expect(harness.values.get(`inbox.messages.unread.01.${field}`)).to.equal(value);
				expect(harness.objects[`inbox.messages.unread.01.${field}`]).to.exist;
			}
		}
		expect(harness.values.get("inbox.messages.unread.unreadCount")).to.equal(1);
		expect(JSON.parse(String(harness.values.get("inbox.messages.unread.unread")))).to.deep.equal([message]);
		expect(harness.objects["inbox.messages.unread.unreadCount"]).to.exist;
		expect(harness.objects["inbox.messages.unread.unread"]).to.exist;
		expect(harness.objects["inbox.messages.read.count"]).to.exist;
		expect(harness.deleted).to.deep.equal(["inbox.messages.unread.123"]);
		expect(harness.objects["inbox.messages.unread.01.markRead"].common).to.include({
			type: "boolean",
			role: "button",
			read: false,
			write: true,
		});
		expect(harness.objects["inbox.messages.unread.01.read"].common).to.include({
			type: "boolean",
			role: "indicator",
			read: true,
			write: false,
		});
		await harness.methods.onStateChange("webuntis2.0.inbox.messages.unread.01.markRead", {
			val: true,
			ack: false,
		} as ioBroker.State);
		expect(harness.objects["inbox.messages.read.01"].type).to.equal("channel");
		for (const [field, value] of Object.entries(message)) {
			expect(harness.values.get(`inbox.messages.read.01.${field}`)).to.equal(value);
		}
		expect((harness.objects["inbox.messages.read.01.id"].common as ioBroker.StateCommon).type).to.equal("number");
		expect(harness.values.get("inbox.messages.read.01.read")).to.equal(true);
		expect(harness.values.get("inbox.messages.read.01.readInWebUntis")).to.equal(false);
		expect(harness.values.get("inbox.messages.read.count")).to.equal(1);
		expect(harness.deleted).to.include("inbox.messages.unread.01");
		expect(harness.values.get("inbox.messages.unread.unreadCount")).to.equal(0);
		expect(harness.values.get("inbox.messages.unread.unread")).to.equal("[]");
		harness.deleted.length = 0;
		await harness.methods.writeUnreadMessages([message] as never[]);
		expect(harness.objects["inbox.messages.read.01"].type).to.equal("channel");
		expect(harness.values.get("inbox.messages.read.01.read")).to.equal(true);
		expect(harness.values.get("inbox.messages.read.01.readInWebUntis")).to.equal(false);
		expect(harness.values.get("inbox.messages.unread.unreadCount")).to.equal(0);
		expect(harness.values.get("inbox.messages.unread.unread")).to.equal("[]");
		expect(harness.deleted).to.deep.equal(["inbox.messages.unread.123"]);
		await harness.methods.writeUnreadMessages([{ ...message, readInWebUntis: true }] as never[]);
		expect(harness.values.get("inbox.messages.read.01.readInWebUntis")).to.equal(true);
	});

	it("places messages read in WebUntis into the read channel", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], false, true);
		const message = {
			id: 789,
			readInWebUntis: true,
			dateTime: "2026-10-16T10:00:00",
			sender: "Office",
			subject: "Information",
			content: "Already read in WebUntis",
			contentIsPreview: true,
			hasAttachments: false,
		};

		await harness.methods.writeUnreadMessages([message] as never[]);

		expect(harness.objects["inbox.messages.read.01"].type).to.equal("channel");
		expect(harness.values.get("inbox.messages.read.01.read")).to.equal(true);
		expect(harness.values.get("inbox.messages.read.01.readInWebUntis")).to.equal(true);
		expect(harness.values.get("inbox.messages.read.count")).to.equal(1);
		expect(harness.values.get("inbox.messages.unread.unreadCount")).to.equal(0);
		expect(harness.values.get("inbox.messages.unread.unread")).to.equal("[]");
	});

	it("numbers unread channels by ascending arrival date", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], false, true);
		const makeMessage = (id: number, dateTime: string): WebUntisInboxMessage => ({
			id,
			readInWebUntis: false,
			dateTime,
			sender: "Teacher",
			subject: `Message ${id}`,
			content: "Content",
			contentIsPreview: false,
			hasAttachments: false,
		});

		await harness.methods.writeUnreadMessages([
			makeMessage(2, "2026-10-25T12:00:00"),
			makeMessage(1, "2026-10-24T12:00:00"),
		] as never[]);

		expect(harness.values.get("inbox.messages.unread.01.id")).to.equal(1);
		expect(harness.values.get("inbox.messages.unread.02.id")).to.equal(2);
	});

	it("numbers read channels by ascending arrival date", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], false, true);
		const makeMessage = (id: number, dateTime: string): WebUntisInboxMessage => ({
			id,
			readInWebUntis: true,
			dateTime,
			sender: "Teacher",
			subject: `Message ${id}`,
			content: "Content",
			contentIsPreview: false,
			hasAttachments: false,
		});

		await harness.methods.writeUnreadMessages([
			makeMessage(263117, "2026-10-25T12:00:00"),
			makeMessage(263116, "2026-10-24T12:00:00"),
		] as never[]);

		const readObjectName = (field: string): ioBroker.Translated =>
			(harness.objects[`inbox.messages.read.01.${field}`].common as ioBroker.StateCommon)
				.name as ioBroker.Translated;
		expect(readObjectName("content").de).to.equal("Inhalt");
		expect(readObjectName("contentIsPreview").de).to.equal("Inhalt ist eine Vorschau");
		expect(readObjectName("dateTime").de).to.equal("Datum und Uhrzeit");
		expect(readObjectName("hasAttachments").de).to.equal("Hat Anhänge");
		expect(readObjectName("id").de).to.equal("Mitteilungs-ID");
		expect(readObjectName("read").de).to.equal("Gelesen");
		expect(readObjectName("readInWebUntis").de).to.equal("In WebUntis gelesen");
		expect(readObjectName("sender").de).to.equal("Absender");
		expect(readObjectName("subject").de).to.equal("Fach");
		expect(harness.values.get("inbox.messages.read.01.id")).to.equal(263116);
		expect(harness.values.get("inbox.messages.read.01.dateTime")).to.equal("2026-10-24T12:00:00");
		expect((harness.objects["inbox.messages.read.01.dateTime"].common as ioBroker.StateCommon).role).to.equal(
			"date",
		);
		expect(harness.values.get("inbox.messages.read.02.id")).to.equal(263117);
		expect(harness.values.get("inbox.messages.read.02.dateTime")).to.equal("2026-10-25T12:00:00");
	});

	it("creates timetable summary objects at the same IDs it writes", async () => {
		const harness = makeAdapterHarness(async () => []);
		const summary = {
			hasSchool: true,
			lessonDurationMinutes: 270,
			schoolStart: "08:00",
			schoolEnd: "12:30",
			subjects: "Mathematics",
			subjectCount: 1,
			firstSubject: "Mathematics",
			lastSubject: "Mathematics",
			hasChanges: false,
			changeCount: 0,
			cancellationCount: 0,
		} as never;

		await harness.methods.writeDaySummary("students.student_10759.timetable.today", summary, []);

		expect(harness.objects["students.student_10759.timetable.today.hasSchool"]).to.exist;
		expect(harness.objects["timetable.students.student_10759.timetable.today.hasSchool"]).to.equal(undefined);
		expect(harness.objects["students.student_10759.timetable.today.schoolStart"].common).to.include({
			type: "string",
			role: "time",
		});
		expect(harness.objects["students.student_10759.timetable.today.schoolEnd"].common).to.include({
			type: "string",
			role: "time",
		});
	});

	it("assigns date roles to timetable days and lessons", async () => {
		const harness = makeAdapterHarness(async () => []);
		const lesson = {
			date: "2026-10-26",
			startTime: "08:00",
			endTime: "08:45",
			subject: "Mathematics",
			subjectLong: "Mathematics",
			teacher: "Teacher",
			teacherLong: "Teacher",
			room: "101",
			roomLong: "101",
			class: "1A",
			classLong: "Class 1A",
			status: "Unterricht",
			changed: false,
			cancelled: false,
			lessonId: null,
			periodId: null,
			substitution: null,
			originalTeacher: null,
			originalTeacherLong: null,
			originalRoom: null,
			originalRoomLong: null,
		} as never;

		await harness.methods.writeTimetableDay("students.student_10759.timetable.tomorrow", [lesson], "2026-10-26");
		await harness.methods.writeTimetableDay("students.student_10759.timetable.week.monday", [lesson], "2026-10-26");

		expect(harness.values.get("students.student_10759.timetable.tomorrow.date")).to.equal(
			new Date(2026, 9, 26).getTime(),
		);
		expect(
			(harness.objects["students.student_10759.timetable.tomorrow.date"].common as ioBroker.StateCommon).role,
		).to.equal("date");
		expect(
			(harness.objects["students.student_10759.timetable.tomorrow.date"].common as ioBroker.StateCommon).unit,
		).to.equal(undefined);
		expect(harness.objects["students.student_10759.timetable.tomorrow.dateTimestamp"]).to.equal(undefined);
		expect(harness.values.get("students.student_10759.timetable.tomorrow.lessons.01.date")).to.equal(
			new Date(2026, 9, 26).getTime(),
		);
		expect(harness.objects["students.student_10759.timetable.tomorrow.lessons.01.dateTimestamp"]).to.equal(
			undefined,
		);
		expect(harness.objects["students.student_10759.timetable.tomorrow.lessons.01.date"].common).to.have.property(
			"role",
			"date",
		);
		expect(harness.objects["students.student_10759.timetable.week.monday.lessons.01.startTime"].common).to.include({
			type: "string",
			role: "time",
		});
		expect(harness.objects["students.student_10759.timetable.week.monday.lessons.01.endTime"].common).to.include({
			type: "string",
			role: "time",
		});
		expect(harness.values.get("students.student_10759.timetable.week.monday.date")).to.equal(
			new Date(2026, 9, 26).getTime(),
		);
		expect(harness.objects["students.student_10759.timetable.week.monday.date"].common).to.have.property(
			"role",
			"date",
		);
	});

	it("loads all timetable groups under each linked child channel", async () => {
		const children = [
			{ id: 41, name: "Kind A", timetable: { today: [], tomorrow: [], week: [] } },
			{ id: 42, name: "Kind B", timetable: { today: [], tomorrow: [], week: [] } },
		];
		const harness = makeAdapterHarness(async () => [], [], children);
		await harness.methods.updateTimetable();

		expect(harness.groupWrites.filter(write => write.root.startsWith("students."))).to.deep.equal(
			["kind_a", "kind_b"].flatMap(channelId =>
				["today", "tomorrow", "week"].map(group => ({
					group,
					root: `students.${channelId}.timetable`,
				})),
			),
		);
		expect((harness.objects["students.kind_a"].common as ioBroker.ChannelCommon).name).to.equal("Kind A");
		expect((harness.objects["students.kind_b"].common as ioBroker.ChannelCommon).name).to.equal("Kind B");
	});

	it("disambiguates linked students whose names normalize to the same channel ID", async () => {
		const children = [
			{ id: 41, name: "Émilie A", timetable: { today: [], tomorrow: [], week: [] } },
			{ id: 42, name: "Emilie-A", timetable: { today: [], tomorrow: [], week: [] } },
		];
		const harness = makeAdapterHarness(async () => [], [], children);
		await harness.methods.updateTimetable();

		expect(harness.objects["students.emilie_a_41"]).to.exist;
		expect(harness.objects["students.emilie_a_42"]).to.exist;
	});

	it("writes distinct exams on the same day and removes obsolete entries", async () => {
		const exams = [
			{
				...sampleExam(11, "08:00", "03.11.2026 08:00–10:00 Mathematics"),
				studentId: 42,
				studentName: "Kind Eins",
			},
			{ ...sampleExam(12, "11:00", "03.11.2026 11:00–10:00 Mathematics"), studentId: 41 },
		];
		const children = [
			{ id: 42, name: "Kind Eins", timetable: { today: [], tomorrow: [], week: [] } },
			{ id: 41, name: "Student 41", timetable: { today: [], tomorrow: [], week: [] } },
		];
		const harness = makeAdapterHarness(async () => exams, [1, 3], children, false, false, [], [], "kind_eins");
		await harness.methods.updateTimetable();

		expect(harness.values.get("students.kind_eins.exams.count")).to.equal(1);
		expect((harness.objects["students.kind_eins.exams.count"].common as ioBroker.StateCommon).name).to.include({
			de: "Anzahl bevorstehender Prüfungen",
		});
		expect((harness.objects["students.kind_eins.exams.upcoming"].common as ioBroker.StateCommon).name).to.include({
			de: "Bevorstehende Prüfungen",
		});
		expect(
			(harness.objects["students.kind_eins.exams.upcomingText"].common as ioBroker.StateCommon).name,
		).to.include({ de: "Text zu bevorstehenden Prüfungen" });
		expect(JSON.parse(String(harness.values.get("students.kind_eins.exams.upcoming")))).to.deep.equal([exams[0]]);
		expect(harness.values.get("students.kind_eins.exams.entries.01.id")).to.equal(11);
		expect(harness.values.get("students.kind_eins.exams.entries.01.name")).to.equal("Written exam");
		expect(harness.values.get("students.kind_eins.exams.entries.01.date")).to.equal(
			new Date(2026, 10, 3).getTime(),
		);
		expect(harness.values.get("students.kind_eins.exams.entries.01.daysUntil")).to.equal(
			Math.floor(Date.UTC(2026, 10, 3) / 86_400_000) -
				Math.floor(
					Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 86_400_000,
				),
		);
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.daysUntil"].common as ioBroker.StateCommon).role,
		).to.equal("value.interval");
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.daysUntil"].common as ioBroker.StateCommon).unit,
		).to.equal("d");
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.daysUntil"].common as ioBroker.StateCommon).name,
		).to.include({ de: "Tage bis dahin" });
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.daysUntil"].common as ioBroker.StateCommon).desc,
		).to.equal(undefined);
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.date"].common as ioBroker.StateCommon).role,
		).to.equal("date");
		expect(
			(harness.objects["students.kind_eins.exams.entries.01.date"].common as ioBroker.StateCommon).unit,
		).to.equal(undefined);
		expect(harness.values.get("students.41.exams.entries.01.id")).to.equal(12);
		expect(harness.objects["students.kind_eins"].common).to.exist;
		expect(harness.values.has("exams.count")).to.equal(false);
		expect(harness.deleted).to.deep.equal(["students.kind_eins.exams.entries.03"]);
		expect(harness.values.get("info.connection")).to.equal(true);
	});

	it("detects and publishes the account type from WebUntis", async () => {
		const harness = makeAdapterHarness(async () => []);
		await harness.methods.updateTimetable();

		expect(harness.values.get("info.accountType")).to.equal("Student");
		expect(harness.objects.students.type).to.equal("channel");
	});

	it("publishes timetables for non-student account types without deleting them", async () => {
		const harness = makeAdapterHarness(async () => []);
		const lesson = { id: "lesson-1" } as never;
		Object.assign(harness.adapter, {
			webUntis: {
				loadTimetable: async () => ({
					today: [lesson],
					tomorrow: [],
					week: [lesson],
					holidays: {} as never,
					personType: 2,
				}),
				loadUnreadMessages: async () => [],
				loadUpcomingExams: async () => [],
			},
		});
		await harness.methods.updateTimetable();

		expect(harness.values.get("info.accountType")).to.equal("Other");
		expect(harness.groupWrites).to.deep.equal(
			["today", "tomorrow", "week"].map(group => ({ group, root: "timetable" })),
		);
		expect(harness.deleted).not.to.include("timetable");
		expect(harness.values.get("info.connection")).to.equal(true);
	});

	it("removes stale named and numeric student channels", async () => {
		const children = [{ id: 42, name: "Current student", timetable: { today: [], tomorrow: [], week: [] } }];
		const harness = makeAdapterHarness(async () => [], [], children);
		harness.objects["students.old_name"] = {
			type: "channel",
			common: { name: "Old student" },
			native: { studentId: 41 },
		};
		harness.objects["students.43"] = {
			type: "channel",
			common: { name: "Removed student" },
			native: { studentId: 43 },
		};
		await harness.methods.updateTimetable();

		expect(harness.deleted).to.include("students.old_name");
		expect(harness.deleted).to.include("students.43");
		expect(harness.objects["students.kind_a"]).not.to.exist;
	});

	it("clears a student's values and entries after a successful empty result", async () => {
		const children = [{ id: 42, name: "Student 42", timetable: { today: [], tomorrow: [], week: [] } }];
		const harness = makeAdapterHarness(async () => [], [1, 2], children);
		await harness.methods.updateTimetable();

		expect(harness.values.get("students.42.exams.count")).to.equal(0);
		expect(harness.values.get("students.42.exams.upcoming")).to.equal("[]");
		expect(harness.values.get("students.42.exams.upcomingText")).to.equal("");
		expect(harness.deleted).to.deep.equal(["students.42.exams.entries.01", "students.42.exams.entries.02"]);
	});

	it("preserves existing exam values on optional load failure while timetable succeeds", async () => {
		const children = [{ id: 42, name: "Student 42", timetable: { today: [], tomorrow: [], week: [] } }];
		const harness = makeAdapterHarness(
			async () => {
				throw new WebUntisError("API_REQUEST", "exam permission denied");
			},
			[1],
			children,
		);
		await harness.methods.updateTimetable();

		expect(harness.values.get("students.42.exams.count")).to.equal(8);
		expect(harness.values.get("students.42.exams.upcoming")).to.equal('[{"id":88}]');
		expect(harness.values.get("students.42.exams.upcomingText")).to.equal("previous exams");
		expect(harness.deleted).to.deep.equal([]);
		expect(harness.values.get("info.connection")).to.equal(true);
		expect(harness.warnings).to.have.length(1);
	});

	it("retries transient exams failures before publishing a warning", async () => {
		let attempts = 0;
		const harness = makeAdapterHarness(async () => {
			attempts++;
			if (attempts === 1) {
				throw new WebUntisError("SERVER_UNREACHABLE", "temporary network failure");
			}
			return [{ ...sampleExam(21, "08:00", "Recovered exam"), studentId: 42 }];
		});

		await harness.methods.updateTimetable();

		expect(attempts).to.equal(2);
		expect(harness.values.get("students.42.exams.entries.01.id")).to.equal(21);
		expect(harness.warnings.some(message => message.includes("upcoming exams refresh failed"))).to.equal(false);
	});

	it("updates fields for the same exam ID on later cycles", async () => {
		let loaded = [
			{ ...sampleExam(11, "08:00", "First text"), studentId: 42 },
			{ ...sampleExam(12, "11:00", "Second text"), studentId: 42 },
		];
		const harness = makeAdapterHarness(async () => loaded, [1, 2]);
		await harness.methods.updateTimetable();
		loaded = [{ ...sampleExam(12, "09:00", "Updated text"), studentId: 42 }];
		await harness.methods.updateTimetable();

		expect(harness.values.get("students.42.exams.entries.01.id")).to.equal(12);
		expect(harness.values.get("students.42.exams.entries.01.startTime")).to.equal("09:00");
		expect(harness.values.get("students.42.exams.entries.01.endTime")).to.equal("10:00");
		expect(harness.objects["students.42.exams.entries.01.startTime"].common).to.include({
			type: "string",
			role: "time",
		});
		expect(harness.objects["students.42.exams.entries.01.endTime"].common).to.include({
			type: "string",
			role: "time",
		});
		expect(harness.values.get("students.42.exams.entries.01.displayText")).to.equal("Updated text");
		expect(harness.deleted).to.deep.equal(["students.42.exams.entries.02"]);
	});

	it("does not remove stale entries if unload begins during cleanup", async () => {
		const exams = [{ ...sampleExam(11, "08:00", "Updated exam"), studentId: 42 }];
		const harness = makeAdapterHarness(async () => exams, [3]);
		const adapterOverrides = harness.adapter as unknown as Record<string, unknown>;
		adapterOverrides.getObjectListAsync = async () => {
			adapterOverrides.unloaded = true;
			return { rows: [{ id: "webuntis2.0.students.student_42.exams.entries.03.subject" }] };
		};
		await harness.methods.updateTimetable();

		expect(harness.deleted).to.deep.equal([]);
	});
});

describe("holiday summary adapter states", () => {
	it("stores holiday dates without redundant timestamp states", async () => {
		const harness = makeAdapterHarness(async () => [], [], [], true);
		const summary = {
			current: { active: false, name: "", longName: "", startDate: "", endDate: "" },
			next: {
				name: "Winter break",
				longName: "Winter break",
				startDate: "2026-12-16",
				endDate: "2026-12-23",
				daysUntil: 52,
			},
		} as never;

		await harness.methods.writeHolidaySummary(summary);

		expect(harness.values.get("holidays.next.startDate")).to.equal(new Date(2026, 11, 16).getTime());
		expect(harness.values.get("holidays.next.endDate")).to.equal(new Date(2026, 11, 23).getTime());
		expect((harness.objects["holidays.next.startDate"].common as ioBroker.StateCommon).role).to.equal("date");
		expect((harness.objects["holidays.next.endDate"].common as ioBroker.StateCommon).role).to.equal("date");
		expect((harness.objects["holidays.current.startDate"].common as ioBroker.StateCommon).role).to.equal("date");
		expect((harness.objects["holidays.next.startDate"].common as ioBroker.StateCommon).type).to.equal("number");
		expect((harness.objects["holidays.next.startDate"].common as ioBroker.StateCommon).unit).to.equal(undefined);
		for (const id of [
			"holidays.current.startDateTimestamp",
			"holidays.current.endDateTimestamp",
			"holidays.next.startDateTimestamp",
			"holidays.next.endDateTimestamp",
		]) {
			expect(harness.objects[id]).to.equal(undefined);
		}
	});

	it("deletes previously created redundant timestamp states", async () => {
		const harness = makeAdapterHarness(
			async () => [],
			[],
			[],
			false,
			false,
			[],
			[
				"holidays.current.startDateTimestamp",
				"holidays.current.endDateTimestamp",
				"holidays.next.startDateTimestamp",
				"holidays.next.endDateTimestamp",
				"students.student_10759.timetable.tomorrow.dateTimestamp",
				"students.student_10759.timetable.tomorrow.lessons.01.dateTimestamp",
			],
		);
		await harness.methods.cleanupObsoleteStructure();

		expect(harness.deleted).to.include.members([
			"holidays.current.startDateTimestamp",
			"holidays.current.endDateTimestamp",
			"holidays.next.startDateTimestamp",
			"holidays.next.endDateTimestamp",
			"students.student_10759.timetable.tomorrow.dateTimestamp",
			"students.student_10759.timetable.tomorrow.lessons.01.dateTimestamp",
		]);
	});
});

describe("WebUntis school discovery", () => {
	it("maps a valid school search response", async () => {
		const result = await searchSchools("  München Schule ", async (url, init) => {
			expect(url).to.equal("https://mobile.webuntis.com/ms/schoolquery2");
			expect(init?.method).to.equal("POST");
			expect(String(init?.body)).to.contain('"search":"München Schule"');
			return response({
				result: {
					size: 1,
					schools: [
						{
							displayName: "Schule München",
							address: "München, DE",
							loginName: "schule münchen",
							schoolId: 7,
							server: "example",
							serverUrl: "https://example.webuntis.com",
							mobileServiceUrl: null,
						},
					],
				},
			});
		});
		expect(result).to.have.length(1);
		expect(result[0]).to.deep.include({
			displayName: "Schule München",
			schoolId: 7,
			serverUrl: "https://example.webuntis.com",
		});
	});

	it("sends the supported schoolid and ranks city and partial-name matches", async () => {
		let request: Record<string, unknown> | undefined;
		await searchSchools("Berlin Goethe", async (_url, init) => {
			request = JSON.parse(String(init?.body));
			return response({ result: { size: 0, schools: [] } });
		});
		expect(request).to.deep.include({ method: "searchSchool" });
		expect(request?.params).to.deep.equal([{ schoolid: 0, search: "Berlin Goethe" }]);
		expect(
			rankSchoolResults(
				[
					{
						displayName: "Andere Schule",
						address: "Berlin",
						loginName: "andere",
						schoolId: 2,
						server: "andere.webuntis.com",
						serverUrl: "https://andere.webuntis.com",
						mobileServiceUrl: null,
					},
					{
						displayName: "Goethe-Gymnasium",
						address: "Berlin",
						loginName: "goethe",
						schoolId: 1,
						server: "goethe.webuntis.com",
						serverUrl: "https://goethe.webuntis.com",
						mobileServiceUrl: null,
					},
				],
				"Goethe Berlin",
			)[0].displayName,
		).to.equal("Goethe-Gymnasium");
	});

	it("maps a selected result to all native school fields", () => {
		expect(
			schoolResultToConfig({
				displayName: "Goethe-Gymnasium",
				address: "Berlin",
				loginName: "goethe",
				schoolId: 1,
				server: "goethe.webuntis.com",
				serverUrl: "https://goethe.webuntis.com/WebUntis/?school=goethe",
				mobileServiceUrl: null,
			}),
		).to.deep.equal({
			server: "https://goethe.webuntis.com/WebUntis/?school=goethe",
			schoolName: "goethe",
			schoolDisplayName: "Goethe-Gymnasium",
			schoolAddress: "Berlin",
			schoolId: 1,
		});
	});

	it("replaces school A with school B without losing credentials", () => {
		const schoolA = {
			displayName: "Schule A",
			address: "Berlin",
			loginName: "schule-a",
			schoolId: 1,
			server: "a.webuntis.com",
			serverUrl: "https://a.webuntis.com",
			mobileServiceUrl: null,
		};
		const schoolB = { ...schoolA, displayName: "Schule B", loginName: "schule-b", schoolId: 2 };
		const native = { username: "alice", password: "secret", ...schoolResultToConfig(schoolA) };
		const merged = mergeSchoolSelection(native, schoolB);
		expect(merged).to.include({
			username: "alice",
			password: "secret",
			schoolName: "schule-b",
			schoolDisplayName: "Schule B",
			schoolId: 2,
		});
		expect(native.schoolName).to.equal("schule-a");
	});

	it("does not request an empty or too short search", async () => {
		let called = false;
		const fetchMock = async (): Promise<Response> => {
			called = true;
			return response({});
		};
		expect(await searchSchools(" ", fetchMock)).to.deep.equal([]);
		expect(await searchSchools("a", fetchMock)).to.deep.equal([]);
		expect(called).to.equal(false);
	});

	it("supports multiple results and special characters", async () => {
		const result = await searchSchools("äöü & Schule", async () =>
			response({
				result: {
					size: 2,
					schools: [
						{
							displayName: "Ä Schule",
							address: "Köln",
							loginName: "a",
							schoolId: 1,
							server: "one",
							serverUrl: "https://one.webuntis.com",
							mobileServiceUrl: null,
						},
						{
							displayName: "Ö Schule",
							address: "Köln",
							loginName: "b",
							schoolId: 2,
							server: "two",
							serverUrl: "https://two.webuntis.com",
							mobileServiceUrl: null,
						},
					],
				},
			}),
		);
		expect(result).to.have.length(2);
	});

	it("returns no results for a valid empty result set", async () => {
		expect(
			await searchSchools("unbekannt", async () => response({ result: { size: 0, schools: [] } })),
		).to.deep.equal([]);
	});

	it("handles the too-many-results response", async () => {
		expect(
			await searchSchools("Berlin", async () =>
				response({ error: { code: -6003, message: "too many results" } }),
			),
		).to.deep.equal([]);
	});

	it("rejects invalid responses and HTTP failures", async () => {
		try {
			await searchSchools("Schule", async () => response({ result: { size: 1, schools: [{}] } }));
			expect.fail("expected invalid response");
		} catch (error) {
			expect(error).to.be.instanceOf(WebUntisError);
			expect((error as WebUntisError).code).to.equal("INVALID_RESPONSE");
		}
		try {
			await searchSchools("Schule", async () => response({}, 503));
			expect.fail("expected HTTP failure");
		} catch (error) {
			expect((error as WebUntisError).code).to.equal("SERVER_UNREACHABLE");
		}
	});
});

describe("WebUntis username/password authentication", () => {
	const config = { server: "https://example.webuntis.com", schoolName: "my school" };

	it("accepts a successful login without logging credentials", async () => {
		let requestBody = "";
		let requestUrl = "";
		await new WebUntisClient(
			{ ...config, server: "https://example.webuntis.com/WebUntis/?school=other" },
			async (url, init) => {
				requestUrl = String(url);
				requestBody = String(init?.body);
				return response({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } });
			},
		).authenticate("alice", "secret");
		expect(requestUrl).to.equal("https://example.webuntis.com/WebUntis/jsonrpc.do?school=my%20school");
		expect(requestBody).to.contain('"user":"alice"');
	});

	it("classifies invalid credentials", async () => {
		try {
			await new WebUntisClient(config, async () => response({ error: { code: -8504 } })).authenticate(
				"alice",
				"wrong",
			);
			expect.fail("expected authentication failure");
		} catch (error) {
			expect((error as WebUntisError).code).to.equal("INVALID_CREDENTIALS");
			expect((error as Error).message).not.to.contain("wrong");
		}
	});

	it("forwards the login session cookie to timetable requests", async () => {
		let call = 0;
		let timetableHeaders: unknown;
		const client = new WebUntisClient(config, async (_url, init) => {
			call++;
			if (call === 1) {
				return new Response(
					JSON.stringify({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } }),
					{
						status: 200,
						headers: { "content-type": "application/json", "set-cookie": "JSESSIONID=session" },
					},
				);
			}
			timetableHeaders = init?.headers;
			return response({ result: [] });
		});
		const session = await client.authenticate("alice", "secret");
		await client.getTimetable(session, {
			startDate: 20260907,
			endDate: 20260911,
			element: { id: 1, type: 5 },
			onlyBaseTimetable: false,
			showBooking: true,
			showInfo: true,
			showSubstText: true,
			showLsText: true,
			showLsNumber: true,
			showStudentgroup: true,
		});
		expect((timetableHeaders as Record<string, string>).cookie).to.equal("JSESSIONID=session");
	});

	it("merges and updates cookies received from timetable responses", async () => {
		let call = 0;
		const followUpHeaders: unknown[] = [];
		const client = new WebUntisClient(config, async (_url, init) => {
			call++;
			if (call === 1) {
				const headers = new Headers({ "content-type": "application/json" });
				headers.append("set-cookie", "JSESSIONID=session; Path=/");
				headers.append("set-cookie", "ROUTE=one; Path=/");
				return new Response(
					JSON.stringify({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } }),
					{ status: 200, headers },
				);
			}
			followUpHeaders.push(init?.headers);
			if (call === 2) {
				const headers = new Headers({ "content-type": "application/json" });
				headers.append("set-cookie", "JSESSIONID=next; Path=/");
				return new Response(JSON.stringify({ result: [] }), { status: 200, headers });
			}
			return response({ result: [] });
		});
		const session = await client.authenticate("alice", "secret");
		const query = {
			startDate: 20260907,
			endDate: 20260911,
			element: { id: 1, type: 5 },
			onlyBaseTimetable: false,
			showBooking: true,
			showInfo: true,
			showSubstText: true,
			showLsText: true,
			showLsNumber: true,
			showStudentgroup: true,
		};
		await client.getTimetable(session, query);
		await client.getTimetable(session, query);
		expect((followUpHeaders[0] as Record<string, string>).cookie).to.equal("JSESSIONID=session; ROUTE=one");
		expect((followUpHeaders[1] as Record<string, string>).cookie).to.equal("JSESSIONID=next; ROUTE=one");
	});

	it("classifies a redirected person request as an expired session", async () => {
		const client = new WebUntisClient(config, async url => {
			expect(String(url)).to.contain("/api/daytimetable/config");
			return response({ loginError: true, state: "LOGIN" });
		});
		try {
			await client.getClassId({ sessionId: "session", personType: 12, personId: 4700, klasseId: 0 });
			expect.fail("expected expired session");
		} catch (error) {
			expect((error as WebUntisError).code).to.equal("SESSION_EXPIRED");
		}
	});

	it("removes stale lesson numbers and IDs when an updated lesson no longer has them", async () => {
		const existing = new Set([
			"timetable.today.lessons.01.lessonNumber",
			"timetable.today.lessons.01.lessonId",
			"timetable.today.lessons.01.periodId",
		]);
		const deleted: string[] = [];
		await removeStaleLessonStates(
			"timetable.today.lessons.01",
			{ subject: { value: "Mathematics" } },
			async id => (existing.has(id) ? {} : null),
			async id => {
				deleted.push(id);
			},
		);
		expect(deleted).to.have.members([
			"timetable.today.lessons.01.lessonNumber",
			"timetable.today.lessons.01.lessonId",
			"timetable.today.lessons.01.periodId",
		]);
	});

	it("uses the local calendar date for public timetables", async () => {
		const previousTimezone = process.env.TZ;
		process.env.TZ = "Europe/Berlin";
		try {
			let requestUrl = "";
			const client = new WebUntisClient(config, async url => {
				requestUrl = String(url);
				return response({ data: { result: { data: { elementPeriods: { 1: [] } } } } });
			});
			await client.getPublicTimetable(
				{ sessionId: "session", personType: 5, personId: 1, klasseId: 2 },
				new Date(2026, 8, 10, 0, 30),
			);
			expect(new URL(requestUrl).searchParams.get("date")).to.equal("2026-09-10");
		} finally {
			if (previousTimezone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = previousTimezone;
			}
		}
	});

	it("classifies timeouts", async () => {
		try {
			await new WebUntisClient(
				config,
				async (_url, init) =>
					await new Promise<Response>((_resolve, reject) =>
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("Aborted", "AbortError")),
						),
					),
				20,
			).authenticate("alice", "secret");
			expect.fail("expected timeout");
		} catch (error) {
			expect((error as WebUntisError).code).to.equal("TIMEOUT");
		}
	});

	it("classifies TimeoutError as a timeout", async () => {
		try {
			await new WebUntisClient(config, async () => {
				throw new DOMException("Timed out", "TimeoutError");
			}).authenticate("alice", "secret");
			expect.fail("expected timeout");
		} catch (error) {
			expect((error as WebUntisError).code).to.equal("TIMEOUT");
		}
	});
});

describe("WebUntis connection configuration", () => {
	const service = new WebUntisService();
	const base = {
		server: "https://example.webuntis.com",
		schoolName: "my school",
		schoolDisplayName: "My School",
		schoolAddress: "Example",
		schoolId: 1,
		username: "alice",
		password: "secret",
	};

	it("validates school selection before login", async () => {
		expect(await service.testConnection({ ...base, schoolId: null })).to.deep.equal({
			ok: false,
			code: "SCHOOL_NOT_SELECTED",
		});
	});

	it("validates username and password before login", async () => {
		expect(await service.testConnection({ ...base, username: " " })).to.deep.equal({
			ok: false,
			code: "USERNAME_REQUIRED",
		});
		expect(await service.testConnection({ ...base, password: "" })).to.deep.equal({
			ok: false,
			code: "PASSWORD_REQUIRED",
		});
	});
});
