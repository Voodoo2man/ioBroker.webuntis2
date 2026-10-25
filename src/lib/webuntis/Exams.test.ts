/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { normalizeUpcomingExams } from "./Exams";
import { WebUntisClient } from "./WebUntisClient";
import type { WebUntisSession } from "./WebUntisTypes";

const session: WebUntisSession = { sessionId: "session", personType: 5, personId: 1, klasseId: 2 };

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
