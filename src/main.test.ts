/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string */

import { expect } from "chai";
import { removeStaleLessonStates } from "./lib/LessonStateCleanup";
import {
	mergeSchoolSelection,
	rankSchoolResults,
	schoolResultToConfig,
	searchSchools,
} from "./lib/webuntis/SchoolDiscovery";
import { WebUntisClient } from "./lib/webuntis/WebUntisClient";
import { WebUntisError } from "./lib/webuntis/WebUntisErrors";
import { WebUntisService } from "./lib/webuntis/WebUntisService";
import type { UpcomingExam } from "./lib/webuntis/Exams";

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
	methods: { updateTimetable(): Promise<void>; ensureUpcomingExamsRoot(): Promise<void> };
	values: Map<string, ioBroker.StateValue>;
	deleted: string[];
	objects: Record<string, ioBroker.SettableObject>;
	warnings: string[];
};

function makeAdapterHarness(examLoader: () => Promise<UpcomingExam[]>, existingSlots: number[] = []): AdapterHarness {
	const AdapterClass = loadAdapterClassForTest();
	const adapter = Object.create(AdapterClass.prototype) as object;
	const values = new Map<string, ioBroker.StateValue>([
		["exams.count", 8],
		["exams.upcoming", '[{"id":88}]'],
		["exams.upcomingText", "previous exams"],
	]);
	const deleted: string[] = [];
	const objects: Record<string, ioBroker.SettableObject> = {};
	const warnings: string[] = [];
	const allObjectRows = existingSlots.flatMap(slot => {
		const slotId = String(slot).padStart(2, "0");
		return [{ id: `webuntis2.0.exams.entries.${slotId}` }, { id: `webuntis2.0.exams.entries.${slotId}.subject` }];
	});
	const overrides: Record<string, unknown> = {
		unloaded: false,
		lastExamsWarningAt: 0,
		namespace: "webuntis2.0",
		config: { server: "https://example.webuntis.com" },
		webUntis: {
			loadTimetable: async () => ({ today: [], tomorrow: [], week: [], holidays: {} as never }),
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
		ensureTranslatedObject: async (id: string, object: ioBroker.SettableObject) => {
			objects[id] = object;
		},
		getObjectAsync: async () => null,
		getObjectListAsync: async () => ({ rows: allObjectRows }),
		delObjectAsync: async (id: string) => {
			deleted.push(id);
		},
		ensureTimetableRoot: async () => undefined,
		ensureHolidaysRoot: async () => undefined,
		writeTimetableGroup: async () => ({ updated: 0, removed: 0 }),
		writeHolidaySummary: async () => undefined,
		writeUnreadMessages: async () => undefined,
	};
	Object.assign(adapter, overrides);
	const methods = adapter as unknown as {
		updateTimetable(): Promise<void>;
		ensureUpcomingExamsRoot(): Promise<void>;
	};
	return { adapter, methods, values, deleted, objects, warnings };
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
	it("writes distinct exams on the same day and removes obsolete entries", async () => {
		const exams = [
			sampleExam(11, "08:00", "03.11.2026 08:00–10:00 Mathematics"),
			sampleExam(12, "11:00", "03.11.2026 11:00–10:00 Mathematics"),
		];
		const harness = makeAdapterHarness(async () => exams, [1, 2, 3]);
		await harness.methods.updateTimetable();

		expect(harness.values.get("exams.count")).to.equal(2);
		expect(JSON.parse(String(harness.values.get("exams.upcoming")))).to.deep.equal(exams);
		expect(harness.values.get("exams.upcomingText")).to.equal(exams.map(exam => exam.displayText).join("\n"));
		expect(harness.values.get("exams.entries.01.id")).to.equal(11);
		expect(harness.values.get("exams.entries.02.id")).to.equal(12);
		expect(harness.values.get("exams.entries.02.startTime")).to.equal("11:00");
		expect(harness.deleted).to.deep.equal(["exams.entries.03"]);
		expect(harness.values.get("info.connection")).to.equal(true);
	});

	it("preserves existing aggregate states while creating the exams objects", async () => {
		const harness = makeAdapterHarness(async () => []);
		await harness.methods.ensureUpcomingExamsRoot();

		expect(harness.values.get("exams.count")).to.equal(8);
		expect(harness.values.get("exams.upcoming")).to.equal('[{"id":88}]');
		expect(harness.values.get("exams.upcomingText")).to.equal("previous exams");
		expect(harness.objects["exams.entries"].type).to.equal("channel");
		expect((harness.objects["exams.count"].common as ioBroker.StateCommon).def).to.equal(0);
	});

	it("clears aggregate values and all entries after a successful empty result", async () => {
		const harness = makeAdapterHarness(async () => [], [1, 2]);
		await harness.methods.updateTimetable();

		expect(harness.values.get("exams.count")).to.equal(0);
		expect(harness.values.get("exams.upcoming")).to.equal("[]");
		expect(harness.values.get("exams.upcomingText")).to.equal("");
		expect(harness.deleted).to.deep.equal(["exams.entries.01", "exams.entries.02"]);
	});

	it("preserves existing exam values on optional load failure while timetable succeeds", async () => {
		const harness = makeAdapterHarness(async () => {
			throw new WebUntisError("API_REQUEST", "exam permission denied");
		}, [1]);
		await harness.methods.updateTimetable();

		expect(harness.values.get("exams.count")).to.equal(8);
		expect(harness.values.get("exams.upcoming")).to.equal('[{"id":88}]');
		expect(harness.values.get("exams.upcomingText")).to.equal("previous exams");
		expect(harness.deleted).to.deep.equal([]);
		expect(harness.values.get("info.connection")).to.equal(true);
		expect(harness.warnings).to.have.length(1);
	});

	it("updates fields for the same exam ID on later cycles", async () => {
		let loaded = [sampleExam(11, "08:00", "First text"), sampleExam(12, "11:00", "Second text")];
		const harness = makeAdapterHarness(async () => loaded, [1, 2]);
		await harness.methods.updateTimetable();
		loaded = [sampleExam(12, "09:00", "Updated text")];
		await harness.methods.updateTimetable();

		expect(harness.values.get("exams.entries.01.id")).to.equal(12);
		expect(harness.values.get("exams.entries.01.startTime")).to.equal("09:00");
		expect(harness.values.get("exams.entries.01.displayText")).to.equal("Updated text");
		expect(harness.deleted).to.deep.equal(["exams.entries.02"]);
	});

	it("does not remove stale entries if unload begins during cleanup", async () => {
		const exams = [sampleExam(11, "08:00", "Updated exam")];
		const harness = makeAdapterHarness(async () => exams, [3]);
		const adapterOverrides = harness.adapter as unknown as Record<string, unknown>;
		adapterOverrides.getObjectListAsync = async () => {
			adapterOverrides.unloaded = true;
			return { rows: [{ id: "webuntis2.0.exams.entries.03.subject" }] };
		};
		await harness.methods.updateTimetable();

		expect(harness.deleted).to.deep.equal([]);
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
