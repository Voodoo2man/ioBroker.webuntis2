/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { normalizeGuardianTimetableExams, normalizeModernGuardianExams, normalizeUpcomingExams } from "./Exams";
import { WebUntisClient } from "./WebUntisClient";
import type { WebUntisSession } from "./WebUntisTypes";

const session: WebUntisSession = { sessionId: "session", personType: 5, personId: 1, klasseId: 2 };

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function requestUrl(input: unknown): URL {
	if (input instanceof URL) {
		return input;
	}
	if (typeof input === "string") {
		return new URL(input);
	}
	if (input instanceof Request) {
		return new URL(input.url);
	}
	throw new Error("Unexpected request URL input");
}

describe("upcoming exams", () => {
	it("extracts exam entries from each child's REST timetable", () => {
		const exams = normalizeGuardianTimetableExams(
			{
				days: [
					{
						gridEntries: [
							{
								type: "EXAM",
								duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
								position1: [{ type: "SUBJECT", current: "Mathematik" }],
								lessonInfo: "Kapitel 2",
							},
						],
					},
				],
			},
			42,
			"Kind Eins",
		);
		expect(exams).to.have.length(1);
		expect(exams[0]).to.include({
			subject: "Mathematik",
			text: "Mathematik · Kapitel 2",
			studentId: 42,
			studentName: "Kind Eins",
		});
		expect(normalizeGuardianTimetableExams({ days: [] }, 42)).to.deep.equal([]);
		expect(normalizeGuardianTimetableExams({ data: { days: [] } }, 42)).to.deep.equal([]);
		expect(
			normalizeGuardianTimetableExams(
				{
					days: [
						{
							gridEntries: [
								{
									type: "EXAM",
									duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
									positions: [
										{
											type: "SUBJECT",
											value: { shortName: "Ma", longName: "Mathematik" },
										},
									],
								},
							],
						},
					],
				},
				42,
			),
		).to.have.length(1);
		expect(() => normalizeGuardianTimetableExams({ records: [] }, 42)).to.throw(
			"Invalid WebUntis guardian timetable response",
		);
	});

	it("uses the full subject name in the subject and exam description", () => {
		const exams = normalizeGuardianTimetableExams(
			{
				days: [
					{
						gridEntries: [
							{
								type: "EXAM",
								duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
								position1: {
									current: {
										type: "SUBJECT",
										displayName: "E",
										longName: "Englisch",
										shortName: "E",
										status: "CURRENT",
									},
									removed: false,
								},
							},
						],
					},
				],
			},
			42,
		);
		expect(exams).to.have.length(1);
		expect(exams[0]).to.include({ subject: "Englisch", text: "Englisch", studentId: 42 });
	});

	it("keeps identical exams distinct for siblings", () => {
		const timetable = {
			days: [
				{
					gridEntries: [
						{
							type: "EXAM",
							duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
							position1: [{ type: "SUBJECT", current: "Mathematik" }],
							lessonInfo: "Kapitel 2",
						},
					],
				},
			],
		};
		const first = normalizeGuardianTimetableExams(timetable, 41, "Kind A")[0] as { id: number };
		const second = normalizeGuardianTimetableExams(timetable, 42, "Kind B")[0] as { id: number };
		expect(first.id).not.to.equal(second.id);
	});

	it("loads linked students from the parent account context", async () => {
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-token");
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({
						data: {
							user: {
								students: [
									{ id: 41, displayName: "Kind A" },
									{ id: 42, displayName: "Kind B" },
								],
							},
						},
					});
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
		);
		const result = await client.getLinkedStudents(parentSession);
		expect(result.map(child => [child.id, child.name])).to.deep.equal([
			[41, "Kind A"],
			[42, "Kind B"],
		]);
	});

	it("combines exams from all linked children instead of rejecting ambiguous scope", async () => {
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-token");
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({
						data: {
							user: {
								students: [
									{ id: 41, name: "Kind A" },
									{ id: 42, name: "Kind B" },
								],
							},
						},
					});
				}
				if (url.pathname.endsWith("/api/exams")) {
					return json({}, 403);
				}
				if (url.pathname.endsWith("/api/rest/view/v1/timetable/entries")) {
					const id = Number(url.searchParams.get("resources"));
					return json({
						days: [
							{
								gridEntries: [
									{
										type: "EXAM",
										duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
										position1: [{ type: "SUBJECT", current: `Subject ${id}` }],
									},
								],
							},
						],
					});
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
		);
		const exams = await client.getExams(parentSession, 20260911, 20261210);
		expect(exams.map(exam => (exam as { studentId: number }).studentId)).to.have.members([41, 42]);
		expect(exams.map(exam => (exam as { studentName: string }).studentName)).to.have.members(["Kind A", "Kind B"]);
	});

	it("normalizes only explicit modern guardian exam envelope shapes", () => {
		const exam = {
			examId: 4,
			examStart: "2026-09-11T09:10:00",
			examEnd: "2026-09-11T10:00:00",
			examName: "Klausur",
			examText: "Kapitel 2",
			subject: { displayName: "Mathematik" },
		};
		const normalized = normalizeModernGuardianExams({
			data: {
				examsDone: [],
				examsUpcoming: [{ exam, grade: null }],
				examsFuture: [
					{
						exam: { ...exam, examId: 5, examStart: "2026-09-11T11:00:00", examEnd: "2026-09-11T11:45:00" },
						grade: null,
					},
				],
			},
		});
		expect(normalized).to.deep.equal([
			{
				id: 4,
				subject: "Mathematik",
				examDate: 20260911,
				startTime: 910,
				endTime: 1000,
				name: "Klausur",
				text: "Kapitel 2",
			},
			{
				id: 5,
				subject: "Mathematik",
				examDate: 20260911,
				startTime: 1100,
				endTime: 1145,
				name: "Klausur",
				text: "Kapitel 2",
			},
		]);
		expect(normalizeModernGuardianExams({ exams: [] })).to.deep.equal([]);
		expect(normalizeModernGuardianExams({ examsDone: [], examsUpcoming: [], examsFuture: [] })).to.deep.equal([]);
	});

	it("rejects unknown guardian response envelopes and timezone-ambiguous timestamps", () => {
		expect(() => normalizeModernGuardianExams({ records: [] })).to.throw(
			"Invalid WebUntis guardian exams response",
		);
		expect(() => normalizeModernGuardianExams({ examsDone: [], examsUpcoming: [] })).to.throw(
			"Invalid WebUntis guardian exams response",
		);
		expect(() => normalizeModernGuardianExams({ exams: [{ examId: 1 }] })).to.throw(
			"Invalid WebUntis guardian exam entry",
		);
		expect(() =>
			normalizeModernGuardianExams({
				exams: [
					{
						examId: 1,
						examStart: "2026-09-11T09:10:00",
						examEnd: "2026-09-11T10:00:00",
						examName: 7,
						subject: { displayName: "Mathematik" },
					},
				],
			}),
		).to.throw("Invalid WebUntis guardian exam entry");
		expect(() =>
			normalizeModernGuardianExams({
				exams: [
					{
						examId: 1,
						examStart: "2026-09-11T09:10:00Z",
						examEnd: "2026-09-11T10:00:00Z",
						subject: { displayName: "Mathematik" },
					},
				],
			}),
		).to.throw("Invalid WebUntis guardian exam entry");
	});

	it("normalizes and sorts exams while retaining multiple same-day exams", () => {
		const exams = normalizeUpcomingExams(
			[
				{
					id: 3,
					subject: "Mathe",
					examDate: 20260912,
					startTime: 1100,
					endTime: 1145,
					name: "Test",
					text: "Kapitel 2",
				},
				{
					id: 2,
					subject: "Deutsch",
					examDate: 20260911,
					startTime: 900,
					endTime: 945,
					name: "Aufsatz",
					text: "",
				},
				{
					id: 1,
					subject: "Englisch",
					examDate: 20260911,
					startTime: 800,
					endTime: 845,
					name: "Vokabeltest",
					text: "",
				},
				{
					id: 2,
					subject: "Deutsch",
					examDate: 20260911,
					startTime: 900,
					endTime: 945,
					name: "Duplikat",
					text: "",
				},
				{ id: 4, subject: "Physik", examDate: 20260910, startTime: 800, endTime: 845 },
				{ id: 5, subject: "Chemie", examDate: 20261211, startTime: 800, endTime: 845 },
			],
			new Date(2026, 8, 11, 18),
		);
		expect(exams.map(exam => exam.id)).to.deep.equal([1, 2, 3]);
		expect(exams[0].date).to.equal("2026-09-11");
		expect(exams[0].startTime).to.equal("08:00");
		expect(exams[0].displayText).to.equal("11.09.2026 · 08:00–08:45 · Englisch · Vokabeltest");
		expect(exams[2].displayText).to.equal("12.09.2026 · 11:00–11:45 · Mathe · Kapitel 2");
	});

	it("maps examName into the normalized exam name when name is blank", () => {
		const exams = normalizeUpcomingExams(
			[
				{
					id: 9,
					subject: "Mathematik",
					examDate: 20260911,
					startTime: 900,
					endTime: 945,
					name: "",
					examName: "Geometrie-Test",
				},
			],
			new Date(2026, 8, 11),
		);

		expect(exams[0].name).to.equal("Geometrie-Test");
		expect(exams[0].displayText).to.contain("Geometrie-Test");
	});

	it("rejects malformed payloads and malformed exam entries", () => {
		expect(() => normalizeUpcomingExams({ data: {} }, new Date(2026, 8, 11))).to.throw(
			"Invalid WebUntis exams response",
		);
		expect(() =>
			normalizeUpcomingExams(
				[{ id: 1, examDate: 20260230, startTime: 900, endTime: 945 }],
				new Date(2026, 8, 11),
			),
		).to.throw("Invalid WebUntis exam entry");
	});

	it("requests the cookie-authenticated exams endpoint with date range parameters", async () => {
		let requestUrl = "";
		let cookie = "";
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async (input, init) => {
				requestUrl = (input as URL).href;
				cookie = new Headers(init?.headers).get("cookie") || "";
				return json({ data: { exams: [{ id: 7, examDate: 20260911, startTime: 900, endTime: 945 }] } });
			},
		);
		const result = await client.getExams(session, 20260911, 20261210);
		const url = new URL(requestUrl);
		expect(url.pathname).to.equal("/WebUntis/api/exams");
		expect(url.searchParams.get("startDate")).to.equal("20260911");
		expect(url.searchParams.get("endDate")).to.equal("20261210");
		expect(url.searchParams.get("klasseId")).to.equal("-1");
		expect(url.searchParams.get("withGrades")).to.equal("false");
		expect(url.searchParams.get("studentId")).to.equal("1");
		expect(cookie).to.include("JSESSIONID=session");
		expect(cookie).to.include("schoolname=");
		expect(result).to.have.length(1);
	});

	it("preserves authentication cookies and carries updated cookies into later exam requests", async () => {
		const requestCookies: string[] = [];
		let call = 0;
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async (_input, init) => {
				call++;
				if (call === 1) {
					return new Response(
						JSON.stringify({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } }),
						{
							headers: {
								"content-type": "application/json",
								"set-cookie": "JSESSIONID=session; Path=/, ROUTE=auth; Path=/",
							},
						},
					);
				}
				requestCookies.push(new Headers(init?.headers).get("cookie") || "");
				return new Response(JSON.stringify({ data: { exams: [{ id: 1, examDate: 20260911 }] } }), {
					headers: { "content-type": "application/json", "set-cookie": "ROUTE=updated; Path=/" },
				});
			},
		);
		await client.authenticate("parent", "secret");
		await client.getExams(session, 20260911, 20261210);
		await client.getExams(session, 20260911, 20261210);
		expect(requestCookies[0]).to.include("ROUTE=auth");
		expect(requestCookies[1]).to.include("ROUTE=updated");
		expect(requestCookies[1]).to.include("JSESSIONID=session");
	});

	it("retries one forbidden cookie request with a bearer token and the updated cookies", async () => {
		const calls: Array<{ path: string; authorization: string | null; cookie: string }> = [];
		const diagnostics: unknown[] = [];
		let examRequests = 0;
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async (input, init) => {
				const url = requestUrl(input);
				const headers = new Headers(init?.headers);
				calls.push({
					path: url.pathname,
					authorization: headers.get("authorization"),
					cookie: headers.get("cookie") || "",
				});
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("secret-token", {
						headers: { "set-cookie": "ROUTE=token; Path=/" },
					});
				}
				examRequests++;
				if (examRequests === 1) {
					return new Response(JSON.stringify({ errorMessage: "forbidden" }), {
						status: 403,
						headers: { "content-type": "application/json", "set-cookie": "ROUTE=initial; Path=/" },
					});
				}
				return json({ data: { exams: [{ id: 7 }] } });
			},
			undefined,
			diagnostic => diagnostics.push(diagnostic),
		);
		const exams = await client.getExams(session, 20260911, 20261210);
		const examCalls = calls.filter(call => call.path.endsWith("/api/exams"));
		const tokenCalls = calls.filter(call => call.path.endsWith("/api/token/new"));
		expect(exams).to.deep.equal([{ id: 7 }]);
		expect(examCalls).to.have.length(2);
		expect(tokenCalls).to.have.length(1);
		expect(examCalls[0].authorization).to.equal(null);
		expect(examCalls[1].authorization).to.equal("Bearer secret-token");
		expect(tokenCalls[0].cookie).to.include("ROUTE=initial");
		expect(examCalls[1].cookie).to.include("ROUTE=token");
		expect(JSON.stringify(diagnostics)).not.to.include("secret-token");
		expect(JSON.stringify(diagnostics)).not.to.include("ROUTE=");
	});

	it("does not add a studentId for non-student accounts", async () => {
		let requestUrl = "";
		const parentSession = { ...session, personType: 6, personId: 99 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				requestUrl = (input as URL).href;
				return json({ data: { exams: [] } });
			},
		);
		await client.getExams(parentSession, 20260911, 20261210);
		expect(new URL(requestUrl).searchParams.has("studentId")).to.equal(false);
	});

	it("does not loop after a bearer retry is forbidden", async () => {
		let examRequests = 0;
		let tokenRequests = 0;
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					tokenRequests++;
					return new Response("secret-token");
				}
				examRequests++;
				return json({ errorMessage: "forbidden" }, 403);
			},
		);
		try {
			await client.getExams(session, 20260911, 20261210);
			expect.fail("expected forbidden exams request");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("API_REQUEST");
			expect((error as Error).message).to.include("HTTP 403");
		}
		expect(examRequests).to.equal(3);
		expect(tokenRequests).to.equal(1);
	});

	it("propagates an expired token session for the service to reauthenticate", async () => {
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				return url.pathname.endsWith("/api/token/new") ? json({ loginError: "expired" }, 401) : json({}, 403);
			},
		);
		try {
			await client.getExams(session, 20260911, 20261210);
			expect.fail("expected expired token session");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("SESSION_EXPIRED");
			expect((error as Error).message).to.include("exams authentication failed");
		}
	});

	it("loads a parent's exams from the linked child's timetable with tenant/year context", async () => {
		const calls: Array<{
			path: string;
			url: URL;
			authorization: string | null;
			tenantId: string | null;
			schoolYearId: string | null;
			cookie: string;
		}> = [];
		const diagnostics: unknown[] = [];
		let examRequests = 0;
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async (input, init) => {
				const url = requestUrl(input);
				const headers = new Headers(init?.headers);
				calls.push({
					path: url.pathname,
					url,
					authorization: headers.get("authorization"),
					tenantId: headers.get("tenant-id"),
					schoolYearId: headers.get("x-webuntis-api-school-year-id"),
					cookie: headers.get("cookie") || "",
				});
				if (url.pathname.endsWith("/jsonrpc.do")) {
					return new Response(
						JSON.stringify({
							result: { sessionId: "parent-session", personType: 12, personId: 9001, klasseId: 0 },
						}),
						{
							headers: {
								"content-type": "application/json",
								"set-cookie": 'JSESSIONID=parent-session; Path=/, Tenant-Id="cookie-tenant"; Path=/',
							},
						},
					);
				}
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-secret-token", { headers: { "set-cookie": "ROUTE=token; Path=/" } });
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({
						data: {
							user: { students: [{ id: 42, displayName: "Private Student Name" }] },
							tenant: { id: 77 },
							currentSchoolYear: { id: 2027 },
						},
					});
				}
				if (url.pathname.endsWith("/api/exams")) {
					examRequests++;
					return json({ errorMessage: "forbidden" }, 403);
				}
				if (url.pathname.endsWith("/api/rest/view/v1/timetable/entries")) {
					return json({
						days: [
							{
								gridEntries: [
									{
										type: "EXAM",
										duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
										position1: [{ type: "SUBJECT", current: "Mathematik" }],
										lessonInfo: "Kapitel 2",
									},
								],
							},
						],
					});
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
			undefined,
			diagnostic => diagnostics.push(diagnostic),
		);
		await client.authenticate("parent", "secret");
		const exams = await client.getExams(parentSession, 20260911, 20261210);
		const examCalls = calls.filter(call => call.path.endsWith("/api/exams"));
		const timetableCall = calls.find(call => call.path.endsWith("/api/rest/view/v1/timetable/entries"));
		const tokenCall = calls.find(call => call.path.endsWith("/api/token/new"));
		const contextCall = calls.find(call => call.path.endsWith("/api/rest/view/v1/app/data"));
		expect(exams).to.have.length(1);
		expect(exams[0]).to.include({ studentId: 42, studentName: "Private Student Name", subject: "Mathematik" });
		expect(examRequests).to.equal(1);
		expect(examCalls).to.have.length(1);
		expect(examCalls[0].url.searchParams.has("studentId")).to.equal(false);
		expect(timetableCall?.url.searchParams.get("resources")).to.equal("42");
		expect(timetableCall?.authorization).to.equal("Bearer parent-secret-token");
		expect(tokenCall?.tenantId).to.equal("cookie-tenant");
		expect(contextCall?.tenantId).to.equal("cookie-tenant");
		expect(timetableCall?.tenantId).to.equal("77");
		expect(timetableCall?.schoolYearId).to.equal("2027");
		expect(timetableCall?.cookie).to.include("ROUTE=token");
		expect(JSON.stringify(diagnostics)).not.to.include("9001");
		expect(JSON.stringify(diagnostics)).not.to.include("Private Student Name");
		expect(JSON.stringify(diagnostics)).not.to.include("parent-secret-token");
		expect(JSON.stringify(diagnostics)).not.to.include("cookie-tenant");
	});

	it("uses the child timetable REST route after the Exams endpoint is forbidden", async () => {
		const calls: Array<{ path: string; url: URL; headers: Headers }> = [];
		let legacyRequests = 0;
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async (input, init) => {
				const url = requestUrl(input);
				const headers = new Headers(init?.headers);
				calls.push({ path: url.pathname, url, headers });
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-secret-token", { headers: { "set-cookie": "ROUTE=token; Path=/" } });
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({
						data: {
							user: { students: [{ id: 42, displayName: "Private Student Name" }] },
							tenant: { id: 77 },
							currentSchoolYear: { id: 2027 },
						},
					});
				}
				if (url.pathname.endsWith("/api/exams")) {
					legacyRequests++;
					return json({ errorMessage: "forbidden" }, 403);
				}
				if (url.pathname.endsWith("/api/rest/view/v1/timetable/entries")) {
					return json({
						days: [
							{
								gridEntries: [
									{
										type: "EXAM",
										duration: { start: "2026-09-11T09:10:00", end: "2026-09-11T10:00:00" },
										position1: [{ type: "SUBJECT", current: "Mathematik" }],
										lessonInfo: "Kapitel 2",
									},
								],
							},
						],
					});
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
			undefined,
		);
		const exams = await client.getExams(parentSession, 20260911, 20261210);
		const timetableCall = calls.find(call => call.path.endsWith("/api/rest/view/v1/timetable/entries"));
		expect(exams).to.have.length(1);
		expect(exams[0]).to.include({
			studentId: 42,
			subject: "Mathematik",
			text: "Mathematik · Kapitel 2",
		});
		expect(legacyRequests).to.equal(1);
		expect(timetableCall).to.exist;
		expect(timetableCall?.url.searchParams.get("start")).to.equal("2026-09-11");
		expect(timetableCall?.url.searchParams.get("end")).to.equal("2026-12-10");
		expect(timetableCall?.url.searchParams.get("resources")).to.equal("42");
		expect(timetableCall?.headers.get("authorization")).to.equal("Bearer parent-secret-token");
		expect(timetableCall?.headers.get("tenant-id")).to.equal("77");
		expect(timetableCall?.headers.get("x-webuntis-api-school-year-id")).to.equal("2027");
		expect(timetableCall?.headers.get("cookie")).to.include("ROUTE=token");
	});

	it("fails boundedly when a linked child's timetable is forbidden", async () => {
		let legacyRequests = 0;
		let guardianRequests = 0;
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-secret-token");
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({ data: { user: { students: [{ id: 42 }] } } });
				}
				if (url.pathname.endsWith("/api/exams")) {
					legacyRequests++;
					return json({}, 403);
				}
				if (url.pathname.endsWith("/api/rest/view/v1/timetable/entries")) {
					guardianRequests++;
					return json({}, 403);
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
		);
		try {
			await client.getExams(parentSession, 20260911, 20261210);
			expect.fail("expected guardian endpoint forbidden error");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("API_REQUEST");
			expect((error as Error).message).to.include("HTTP 403");
			expect((error as Error).message).to.include("modern guardian route");
			expect((error as Error).message).not.to.include("9001");
		}
		expect(legacyRequests).to.equal(1);
		expect(guardianRequests).to.equal(1);
	});

	it("does not treat an unknown successful guardian response as an empty exam list", async () => {
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const diagnostics: Array<{ method?: string; responseShape?: string }> = [];
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-secret-token");
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({ data: { user: { students: [{ id: 42 }] } } });
				}
				if (url.pathname.endsWith("/api/exams")) {
					return json({}, 403);
				}
				if (url.pathname.endsWith("/api/rest/view/v1/timetable/entries")) {
					return json({ records: [{ studentName: "Private Student Name", examText: "Private exam text" }] });
				}
				throw new Error(`Unexpected endpoint ${url.pathname}`);
			},
			undefined,
			diagnostic => diagnostics.push(diagnostic),
		);
		try {
			await client.getExams(parentSession, 20260911, 20261210);
			expect.fail("expected malformed guardian response");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("INVALID_RESPONSE");
			expect((error as Error).message).to.include("modern guardian route");
		}
		const shapeDiagnostic = diagnostics.find(item => item.method === "getGuardianTimetableExamsResponseShape");
		expect(shapeDiagnostic?.responseShape).to.include("records");
		expect(shapeDiagnostic?.responseShape).not.to.include("Private Student Name");
		expect(shapeDiagnostic?.responseShape).not.to.include("Private exam text");
	});

	for (const testCase of [{ label: "no linked students", students: [], scope: "unresolved", count: 0 }]) {
		it(`does not guess a child when the parent has ${testCase.label}`, async () => {
			let examRequests = 0;
			let tokenRequests = 0;
			let contextRequests = 0;
			const parentSession = { ...session, personType: 12, personId: 9001 };
			const client = new WebUntisClient(
				{ server: "https://example.webuntis.com", schoolName: "example" },
				async input => {
					const url = requestUrl(input);
					if (url.pathname.endsWith("/api/token/new")) {
						tokenRequests++;
						return new Response("parent-secret-token");
					}
					if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
						contextRequests++;
						return json({ data: { user: { students: testCase.students } } });
					}
					examRequests++;
					return json({ errorMessage: "forbidden" }, 403);
				},
			);
			try {
				await client.getExams(parentSession, 20260911, 20261210);
				expect.fail("expected unresolved parent student scope");
			} catch (error) {
				expect((error as { code: string }).code).to.equal("API_REQUEST");
				expect((error as Error).message).to.include(`childScope=${testCase.scope}`);
				expect((error as Error).message).to.include(`linkedStudents=${testCase.count}`);
				expect((error as Error).message).not.to.include("9001");
			}
			expect(examRequests).to.equal(1);
			expect(tokenRequests).to.equal(1);
			expect(contextRequests).to.equal(1);
		});
	}

	it("rejects malformed parent app data instead of treating it as empty exams", async () => {
		const parentSession = { ...session, personType: 12, personId: 9001 };
		const client = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async input => {
				const url = requestUrl(input);
				if (url.pathname.endsWith("/api/token/new")) {
					return new Response("parent-secret-token");
				}
				if (url.pathname.endsWith("/api/rest/view/v1/app/data")) {
					return json({ data: { user: { students: [{ id: 41 }, { id: "not-a-valid-id" }] } } });
				}
				return json({}, 403);
			},
		);
		try {
			await client.getExams(parentSession, 20260911, 20261210);
			expect.fail("expected malformed parent context");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("INVALID_RESPONSE");
			expect((error as Error).message).to.include("parent exam context");
		}
	});

	it("marks expired sessions and malformed REST responses as errors", async () => {
		const expired = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async () => json({ loginError: "expired" }, 401),
		);
		try {
			await expired.getExams(session, 20260911, 20261210);
			expect.fail("expected expired session");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("SESSION_EXPIRED");
		}
		const invalid = new WebUntisClient(
			{ server: "https://example.webuntis.com", schoolName: "example" },
			async () => json({ data: {} }),
		);
		try {
			await invalid.getExams(session, 20260911, 20261210);
			expect.fail("expected invalid response");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("INVALID_RESPONSE");
		}
	});
});
