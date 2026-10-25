/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { normalizeUpcomingExams } from "./Exams";
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
				return new Response(JSON.stringify({ data: { exams: [] } }), {
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
		expect(examRequests).to.equal(2);
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

	it("resolves exactly one parent child from app data and sends tenant/year context", async () => {
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
				examRequests++;
				return examRequests === 1
					? new Response(JSON.stringify({ errorMessage: "forbidden" }), {
							status: 403,
							headers: { "content-type": "application/json" },
						})
					: json({ data: { exams: [{ id: 7 }] } });
			},
			undefined,
			diagnostic => diagnostics.push(diagnostic),
		);
		await client.authenticate("parent", "secret");
		const exams = await client.getExams(parentSession, 20260911, 20261210);
		const examCalls = calls.filter(call => call.path.endsWith("/api/exams"));
		const tokenCall = calls.find(call => call.path.endsWith("/api/token/new"));
		const contextCall = calls.find(call => call.path.endsWith("/api/rest/view/v1/app/data"));
		expect(exams).to.deep.equal([{ id: 7 }]);
		expect(examCalls).to.have.length(2);
		expect(examCalls[0].url.searchParams.has("studentId")).to.equal(false);
		expect(examCalls[1].url.searchParams.get("studentId")).to.equal("42");
		expect(examCalls[1].url.searchParams.get("studentId")).not.to.equal("9001");
		expect(examCalls[1].authorization).to.equal("Bearer parent-secret-token");
		expect(tokenCall?.tenantId).to.equal("cookie-tenant");
		expect(contextCall?.tenantId).to.equal("cookie-tenant");
		expect(examCalls[1].tenantId).to.equal("77");
		expect(examCalls[1].schoolYearId).to.equal("2027");
		expect(examCalls[1].cookie).to.include("ROUTE=token");
		expect(JSON.stringify(diagnostics)).not.to.include("42");
		expect(JSON.stringify(diagnostics)).not.to.include("9001");
		expect(JSON.stringify(diagnostics)).not.to.include("Private Student Name");
		expect(JSON.stringify(diagnostics)).not.to.include("parent-secret-token");
		expect(JSON.stringify(diagnostics)).not.to.include("cookie-tenant");
	});

	for (const testCase of [
		{ label: "no linked students", students: [], scope: "unresolved", count: 0 },
		{ label: "multiple linked students", students: [{ id: 41 }, { id: 42 }], scope: "ambiguous", count: 2 },
	]) {
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
