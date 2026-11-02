/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { WebUntisClient } from "./WebUntisClient";
import type { WebUntisMessageOfDay } from "./WebUntisTypes";

const config = { server: "https://example.webuntis.com", schoolName: "sample" };
const session = { sessionId: "sid", personType: 5, personId: 10, klasseId: 2 };

describe("WebUntis messages", () => {
	it("returns read status, prefers unread full details, and falls back to previews", async () => {
		const requests: { url: string; headers: Record<string, string> }[] = [];
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const headers = (init?.headers || {}) as Record<string, string>;
			requests.push({ url, headers });
			if (url.includes("/api/token/new")) {
				return new Response("jwt-token", { status: 200, headers: { "content-type": "text/plain" } });
			}
			if (url.endsWith("/api/rest/view/v1/messages")) {
				return new Response(
					JSON.stringify({
						incomingMessages: [
							{
								id: 1,
								isMessageRead: true,
								contentPreview: "read preview",
							},
							{
								id: 2,
								isMessageRead: false,
								contentPreview: "short preview",
								subject: "Full message",
								sentDateTime: "2026-10-15T10:00:00",
								sender: { displayName: "Teacher" },
								hasAttachments: true,
							},
							{
								id: 3,
								isMessageRead: false,
								contentPreview: "preview only",
								subject: "Limited message",
								sender: { displayName: "Office" },
								hasAttachments: false,
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.endsWith("/messages/2")) {
				return new Response(JSON.stringify({ data: { content: "Full body" } }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			return new Response("unavailable", { status: 403 });
		});

		const result = await client.getUnreadMessages(session);

		expect(result).to.deep.equal([
			{
				id: 1,
				readInWebUntis: true,
				dateTime: "",
				sender: "",
				subject: "",
				content: "read preview",
				contentIsPreview: true,
				hasAttachments: false,
			},
			{
				id: 2,
				readInWebUntis: false,
				dateTime: "2026-10-15T10:00:00",
				sender: "Teacher",
				subject: "Full message",
				content: "Full body",
				contentIsPreview: false,
				hasAttachments: true,
			},
			{
				id: 3,
				readInWebUntis: false,
				dateTime: "",
				sender: "Office",
				subject: "Limited message",
				content: "preview only",
				contentIsPreview: true,
				hasAttachments: false,
			},
		]);
		expect(requests.some(request => request.url.endsWith("/messages/1"))).to.equal(false);
		expect(requests.find(request => request.url.endsWith("/api/rest/view/v1/messages"))?.headers).to.deep.include({
			Authorization: "Bearer jwt-token",
		});
		expect(requests[0].headers).to.deep.include({
			accept: "application/json",
			cookie: `JSESSIONID=sid; schoolname=_${Buffer.from("sample").toString("base64")}`,
		});
	});

	it("retries a 406 token response with the plain school cookie", async () => {
		const tokenCookies: string[] = [];
		let messagesCookie = "";
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const headers = (init?.headers || {}) as Record<string, string>;
			if (url.includes("/api/token/new")) {
				tokenCookies.push(headers.cookie);
				if (headers.cookie.includes("schoolname=_")) {
					return new Response("not acceptable", { status: 406 });
				}
				return new Response("jwt-token", { status: 200, headers: { "content-type": "text/plain" } });
			}
			messagesCookie = headers.cookie;
			return new Response(JSON.stringify({ incomingMessages: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});

		expect(await client.getUnreadMessages(session)).to.deep.equal([]);
		expect(tokenCookies).to.have.length(2);
		expect(tokenCookies[0]).to.contain(`schoolname=_${Buffer.from("sample").toString("base64")}`);
		expect(tokenCookies[1]).to.contain("schoolname=sample");
		expect(messagesCookie).to.contain("schoolname=sample");
	});

	it("reports the HTTP status when both token cookie formats are rejected", async () => {
		let attempts = 0;
		const client = new WebUntisClient(config, async () => {
			attempts++;
			return new Response("not acceptable", { status: 406 });
		});

		let failure: unknown;
		try {
			await client.getUnreadMessages(session);
		} catch (error) {
			failure = error;
		}

		expect(attempts).to.equal(2);
		expect(failure).to.have.property("code", "API_REQUEST");
		expect(failure).to.have.property("message").that.includes("HTTP 406");
	});

	it("loads and normalizes messages of day using the authenticated REST request", async () => {
		const requests: Array<{ url: string; headers: Record<string, string> }> = [];
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const headers = (init?.headers || {}) as Record<string, string>;
			requests.push({ url, headers });
			if (url.includes("/api/token/new")) {
				return new Response("day-token");
			}
			return new Response(
				JSON.stringify({
					data: {
						messagesOfDay: [
							{ id: 123, subject: "Assembly", text: "<b>Bring books</b>", attachments: [{}] },
							{ id: "note-2", subject: "Notice", text: "Plain text", attachments: [] },
							{ id: null, subject: null, text: null, attachments: null },
						],
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});

		expect(await client.getMessagesOfDay(session, 20261102)).to.deep.equal([
			{ id: "123", subject: "Assembly", text: "<b>Bring books</b>", hasAttachments: true },
			{ id: "note-2", subject: "Notice", text: "Plain text", hasAttachments: false },
			{ id: "", subject: "", text: "", hasAttachments: false },
		]);
		const apiRequest = requests[1];
		expect(new URL(apiRequest.url).pathname).to.equal("/WebUntis/api/public/news/newsWidgetData");
		expect(new URL(apiRequest.url).searchParams.get("date")).to.equal("20261102");
		expect(apiRequest.headers).to.deep.include({
			Authorization: "Bearer day-token",
			cookie: `JSESSIONID=sid; schoolname=_${Buffer.from("sample").toString("base64")}`,
		});
	});

	it("accepts an empty day and rejects malformed payloads and entries", async () => {
		let response: unknown = { data: { messagesOfDay: [] } };
		const client = new WebUntisClient(config, async input => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return url.includes("/api/token/new")
				? new Response("token")
				: new Response(JSON.stringify(response), { status: 200 });
		});
		const getResult = (): Promise<WebUntisMessageOfDay[]> => client.getMessagesOfDay(session, 20261102);
		expect(await getResult()).to.deep.equal([]);
		for (const invalid of [
			null,
			{},
			{ data: {} },
			{ data: { messagesOfDay: {} } },
			{ data: { messagesOfDay: [null] } },
			{ data: { messagesOfDay: [{ id: true }] } },
			{ data: { messagesOfDay: [{ attachments: "no" }] } },
		]) {
			response = invalid;
			try {
				await getResult();
				expect.fail("expected invalid response");
			} catch (error) {
				expect(error).to.have.property("code", "INVALID_RESPONSE");
			}
		}
	});

	it("loads and validates the current school year through the session JSON-RPC endpoint", async () => {
		const requests: string[] = [];
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			requests.push(url);
			const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
				method?: string;
				params?: unknown;
			};
			expect(body.method).to.equal("getCurrentSchoolyear");
			expect(body.params).to.deep.equal({});
			return new Response(
				JSON.stringify({ result: { id: 9, name: "2026/27", startDate: 20260831, endDate: "2027-07-31" } }),
			);
		});
		expect(await client.getCurrentSchoolyear(session)).to.deep.equal({
			id: 9,
			name: "2026/27",
			startDate: "2026-08-31",
			endDate: "2027-07-31",
		});
		expect(requests[0]).to.contain("/jsonrpc.do;jsessionid=sid?");

		const invalidClient = new WebUntisClient(
			config,
			async () =>
				new Response(
					JSON.stringify({ result: { id: 9, name: "2026/27", startDate: 20260230, endDate: 20270731 } }),
				),
		);
		try {
			await invalidClient.getCurrentSchoolyear(session);
			expect.fail("expected invalid school-year dates");
		} catch (error) {
			expect(error).to.have.property("code", "INVALID_RESPONSE");
		}
	});

	it("validates homework envelopes and associates students only by explicit IDs", async () => {
		const requests: string[] = [];
		let payload: unknown = {
			data: {
				records: [],
				homeworks: [
					{
						id: 4,
						lessonId: 12,
						dueDate: "2026-10-12",
						completed: false,
						text: "<p>Read <script>alert(1)</script><em>now</em></p>",
						remark: "<b>Note</b>",
					},
				],
				teachers: [],
				lessons: [{ id: 12, studentId: 41, su: [{ name: "Math" }], te: [{ name: "T" }] }],
			},
		};
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			requests.push(url);
			if (url.includes("/api/token/new")) {
				return new Response("token");
			}
			expect((init?.headers as Record<string, string>).Authorization).to.contain("Bearer");
			return new Response(JSON.stringify(payload));
		});
		expect(await client.getHomeworks(session, 20260831, 20270731)).to.deep.equal([
			{
				id: 4,
				dueDate: "2026-10-12",
				lessonId: 12,
				studentId: 41,
				text: "Read now",
				remark: "Note",
				subject: "Math",
				teacher: "T",
				status: false,
			},
		]);
		const homeworkUrl = new URL(requests[1]);
		expect(homeworkUrl.pathname).to.equal("/WebUntis/api/homeworks/lessons");
		expect(homeworkUrl.searchParams.get("startDate")).to.equal("20260831");
		expect(homeworkUrl.searchParams.get("endDate")).to.equal("20270731");
		payload = { data: { records: [], homeworks: [], teachers: [], lessons: [] } };
		expect(await client.getHomeworks(session, 20260831, 20270731)).to.deep.equal([]);
		for (const invalid of [
			null,
			{},
			{ data: { lessons: [], teachers: [] } },
			{ data: { records: [], homeworks: [{}], lessons: [], teachers: [] } },
		]) {
			payload = invalid;
			try {
				await client.getHomeworks(session, 20260831, 20270731);
				expect.fail("expected invalid homework response");
			} catch (error) {
				expect(error).to.have.property("code", "INVALID_RESPONSE");
			}
		}
	});

	it("requests absences for an exact student and preserves unknown excuse status", async () => {
		let requestUrl = "";
		let absencePayload: unknown = {
			data: {
				absences: [
					{
						id: 7,
						startDate: 20260911,
						endDate: "2026-09-11",
						startTime: 750,
						endTime: 915,
						reason: "",
						text: "",
						createDate: 1790870400000,
						lastUpdate: 1790870401000,
						createdUser: "teacher",
						updatedUser: "admin",
						reasonId: 12,
						interruptions: [{ start: 800, end: 900 }],
						canEdit: true,
						studentName: "Alex",
						excuseId: 18,
						excuseUserId: 4,
						excuseUsername: "parent",
						isExcused: false,
						excuseStatus: null,
					},
				],
				absenceReasons: [],
				excuseStatuses: null,
				showAbsenceReasonChange: false,
				showCreateAbsence: false,
			},
		};
		const client = new WebUntisClient(config, async (input, init) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/token/new")) {
				return new Response("token");
			}
			requestUrl = url;
			expect((init?.headers as Record<string, string>).Authorization).to.contain("Bearer");
			return new Response(JSON.stringify(absencePayload));
		});
		expect(await client.getAbsences(session, 41, 20260901, 20260930)).to.deep.equal({
			absences: [
				{
					id: 7,
					studentId: 41,
					startDate: "2026-09-11",
					endDate: "2026-09-11",
					startTime: 750,
					endTime: 915,
					reason: "",
					text: "",
					createDate: 1790870400000,
					lastUpdate: 1790870401000,
					createdUser: "teacher",
					updatedUser: "admin",
					reasonId: 12,
					interruptions: [{ start: 800, end: 900 }],
					canEdit: true,
					studentName: "Alex",
					excuseId: 18,
					excuseUserId: 4,
					excuseUsername: "parent",
					isExcused: false,
					excuseStatus: "unexcused",
				},
			],
			absenceReasons: [],
			excuseStatuses: [],
			showAbsenceReasonChange: false,
			showCreateAbsence: false,
		});
		const url = new URL(requestUrl);
		expect(url.pathname).to.equal("/WebUntis/api/classreg/absences/students");
		expect(Object.fromEntries(url.searchParams)).to.deep.equal({
			startDate: "20260901",
			endDate: "20260930",
			studentId: "41",
			excuseStatusId: "-1",
		});
		absencePayload = {
			data: {
				absences: [],
				absenceReasons: [],
				excuseStatuses: null,
				showAbsenceReasonChange: false,
				showCreateAbsence: false,
			},
		};
		expect(await client.getAbsences(session, 41, 20260901, 20260930)).to.deep.equal({
			absences: [],
			absenceReasons: [],
			excuseStatuses: [],
			showAbsenceReasonChange: false,
			showCreateAbsence: false,
		});
		for (const invalid of [
			{ data: {} },
			{
				data: {
					absences: [{ id: 1, startDate: 20260911, isExcused: false }],
					absenceReasons: [],
					excuseStatuses: null,
					showAbsenceReasonChange: false,
					showCreateAbsence: false,
				},
			},
		]) {
			absencePayload = invalid;
			try {
				await client.getAbsences(session, 41, 20260901, 20260930);
				expect.fail("expected invalid absence response");
			} catch (error) {
				expect(error).to.have.property("code", "INVALID_RESPONSE");
			}
		}
	});

	it("maps HTTP 401 to session expiry but keeps 403 as an API error", async () => {
		let status = 401;
		const client = new WebUntisClient(config, async input => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			return url.includes("/api/token/new") ? new Response("token") : new Response("failure", { status });
		});
		try {
			await client.getMessagesOfDay(session, 20261102);
			expect.fail("expected expired session");
		} catch (error) {
			expect(error).to.have.property("code", "SESSION_EXPIRED");
		}
		status = 403;
		try {
			await client.getMessagesOfDay(session, 20261102);
			expect.fail("expected API error");
		} catch (error) {
			expect(error).to.have.property("code", "FORBIDDEN");
		}
	});
});
