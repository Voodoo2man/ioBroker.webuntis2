/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string, curly */

import { expect } from "chai";
import { WebUntisService } from "./WebUntisService";

const config = {
	server: "https://example.webuntis.com",
	schoolName: "example",
	schoolDisplayName: "Example",
	schoolAddress: "Example",
	schoolId: 1,
	username: "parent",
	password: "secret",
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fetchFor(calls: string[], failingMasterdata = false): typeof fetch {
	return async (_input, init) => {
		const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
		const method = body.method || "http";
		calls.push(method);
		if (method === "authenticate") {
			return json({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } });
		}
		if (method === "getHolidays") return json({ result: [] });
		if (method === "getTimetable") return json({ result: [] });
		if (failingMasterdata) return json({ error: { code: -1, message: "temporary failure" } });
		return json({ result: [{ id: 1, name: method }] });
	};
}

describe("WebUntis service session and master data caching", () => {
	it("authenticates and loads master data only once within the cache TTL", async () => {
		const calls: string[] = [];
		const info: string[] = [];
		const debug: string[] = [];
		const service = new WebUntisService(
			undefined,
			message => info.push(message),
			undefined,
			fetchFor(calls),
			message => debug.push(message),
		);
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		await service.loadTimetable(config, new Date("2026-09-11T08:05:00"));
		expect(calls.filter(method => method === "authenticate")).to.have.length(1);
		expect(calls.filter(method => method === "getTimetable")).to.have.length(2);
		for (const method of ["getSubjects", "getTeachers", "getRooms", "getKlassen", "getHolidays"]) {
			expect(
				calls.filter(item => item === method),
				method,
			).to.have.length(1);
		}
		expect(info.filter(message => message.startsWith("Master data loaded"))).to.have.length(1);
		expect(info.filter(message => message.startsWith("Holidays loaded"))).to.have.length(1);
		expect(info.filter(message => message === "WebUntis login successful")).to.have.length(0);
		expect(debug.filter(message => message === "WebUntis login successful")).to.have.length(0);
	});

	it("deduplicates a concurrent authentication and master data load", async () => {
		const calls: string[] = [];
		const service = new WebUntisService(undefined, undefined, undefined, fetchFor(calls));
		await Promise.all([
			service.loadTimetable(config, new Date("2026-09-11T08:00:00")),
			service.loadTimetable(config, new Date("2026-09-11T08:00:00")),
		]);
		expect(calls.filter(method => method === "authenticate")).to.have.length(1);
		expect(calls.filter(method => method === "getSubjects")).to.have.length(1);
		expect(calls.filter(method => method === "getTeachers")).to.have.length(1);
		expect(calls.filter(method => method === "getRooms")).to.have.length(1);
		expect(calls.filter(method => method === "getKlassen")).to.have.length(1);
	});

	it("refreshes master data after expiry", async () => {
		const calls: string[] = [];
		const service = new WebUntisService(undefined, undefined, undefined, fetchFor(calls));
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		await service.loadTimetable(config, new Date("2026-09-11T14:01:00"));
		expect(calls.filter(method => method === "getSubjects")).to.have.length(2);
		expect(calls.filter(method => method === "getTeachers")).to.have.length(2);
	});

	it("keeps cached master data and throttles retries when an expired refresh fails", async () => {
		const calls: string[] = [];
		const warnings: string[] = [];
		let failing = false;
		const service = new WebUntisService(
			undefined,
			undefined,
			message => warnings.push(message),
			async (_input, init) => {
				const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
				calls.push(body.method || "http");
				if (body.method === "authenticate") {
					return json({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } });
				}
				if (body.method === "getHolidays" || body.method === "getTimetable") return json({ result: [] });
				return failing ? json({ error: { code: -1 } }) : json({ result: [{ id: 1, name: body.method }] });
			},
		);
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		failing = true;
		await service.loadTimetable(config, new Date("2026-09-11T14:01:00"));
		await service.loadTimetable(config, new Date("2026-09-11T14:06:00"));
		expect(calls.filter(method => method === "getSubjects")).to.have.length(2);
		expect(warnings).to.deep.equal(["Master data refresh failed; existing master data is being reused"]);
	});

	it("includes WebUntis JSON-RPC error details in timetable failures", async () => {
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
			if (body.method === "authenticate") {
				return json({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } });
			}
			if (body.method === "getHolidays") return json({ result: [] });
			return json({ error: { code: -1, message: "Temporary timetable error" } });
		});
		try {
			await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
			expect.fail("expected timetable request to fail");
		} catch (error) {
			expect((error as Error).message).to.include("code -1: Temporary timetable error");
		}
	});

	it("reauthenticates once when the cached session expires", async () => {
		const calls: string[] = [];
		let timetableRequests = 0;
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
			const method = body.method || "http";
			calls.push(method);
			if (method === "authenticate") {
				return json({
					result: { sessionId: `session-${calls.length}`, personType: 5, personId: 1, klasseId: 2 },
				});
			}
			if (method === "getHolidays") return json({ result: [] });
			if (method === "getTimetable" && timetableRequests++ === 0) {
				return json({ error: { code: -7001, message: "session expired" } });
			}
			return json({ result: [] });
		});
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		expect(calls.filter(method => method === "authenticate")).to.have.length(2);
		expect(calls.filter(method => method === "getTimetable")).to.have.length(2);
	});

	it("reauthenticates when WebUntis rejects a stale session with code -8520", async () => {
		const calls: string[] = [];
		let expiredSession = true;
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
			const method = body.method || "http";
			calls.push(method);
			if (method === "authenticate") {
				return json({
					result: { sessionId: `session-${calls.length}`, personType: 5, personId: 1, klasseId: 2 },
				});
			}
			if (method === "getHolidays") return json({ result: [] });
			if (method === "getTimetable" && expiredSession) {
				expiredSession = false;
				return json({ error: { code: -8520, message: "not authenticated" } });
			}
			return json({ result: [] });
		});
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		expect(calls.filter(method => method === "authenticate")).to.have.length(2);
		expect(calls.filter(method => method === "getTimetable")).to.have.length(2);
	});

	it("loads the inclusive 90-day exam range and reauthenticates once after expiry", async () => {
		let authCount = 0;
		let examCount = 0;
		let examsUrl = "";
		const service = new WebUntisService(undefined, undefined, undefined, async (input, init) => {
			if (new URL(String(input)).pathname.endsWith("/api/exams")) {
				examsUrl = String(input);
				examCount++;
				if (examCount === 1) return json({ loginError: "expired" }, 401);
				return json({
					data: {
						exams: [
							{ id: 2, subject: "Deutsch", examDate: 20261210, startTime: 1000, endTime: 1045 },
							{ id: 1, subject: "Mathe", examDate: 20260911, startTime: 800, endTime: 845 },
						],
					},
				});
			}
			const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
			if (body.method === "authenticate") {
				authCount++;
				return json({ result: { sessionId: `session-${authCount}`, personType: 5, personId: 1, klasseId: 2 } });
			}
			return json({ result: [] });
		});
		const exams = await service.loadUpcomingExams(config, new Date(2026, 8, 11, 17));
		const url = new URL(examsUrl);
		expect(url.searchParams.get("startDate")).to.equal("20260911");
		expect(url.searchParams.get("endDate")).to.equal("20261210");
		expect(url.searchParams.get("klasseId")).to.equal("-1");
		expect(authCount).to.equal(2);
		expect(examCount).to.equal(2);
		expect(exams.map(exam => exam.id)).to.deep.equal([1, 2]);
	});

	it("reauthenticates when the exams token request expires the WebUntis session", async () => {
		let authCount = 0;
		let examCount = 0;
		let tokenCount = 0;
		const service = new WebUntisService(undefined, undefined, undefined, async (input, init) => {
			const url = new URL(typeof input === "string" ? input : (input as URL).href);
			if (url.pathname.endsWith("/api/exams")) {
				examCount++;
				return examCount === 1 ? json({ errorMessage: "forbidden" }, 403) : json({ data: { exams: [] } });
			}
			if (url.pathname.endsWith("/api/token/new")) {
				tokenCount++;
				return json({ loginError: "expired" }, 401);
			}
			const requestBody = JSON.parse(String(init?.body || "{}")) as { method?: string };
			if (requestBody.method === "authenticate") {
				authCount++;
				return json({ result: { sessionId: `session-${authCount}`, personType: 5, personId: 1, klasseId: 2 } });
			}
			return json({ result: [] });
		});
		const exams = await service.loadUpcomingExams(config, new Date(2026, 8, 11));
		expect(exams).to.deep.equal([]);
		expect(authCount).to.equal(2);
		expect(examCount).to.equal(2);
		expect(tokenCount).to.equal(1);
	});

	it("aborts an in-flight request during shutdown", async () => {
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			await new Promise<never>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			});
			throw new Error("request did not abort");
		});
		const loading = service.loadTimetable(config);
		await Promise.resolve();
		service.shutdown();
		try {
			await loading;
			expect.fail("expected shutdown abort");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("ABORTED");
		}
	});

	it("aborts an in-flight school search during shutdown", async () => {
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			await new Promise<never>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			});
			throw new Error("request did not abort");
		});
		const searching = service.searchSchools("Berlin");
		await Promise.resolve();
		service.shutdown();
		try {
			await searching;
			expect.fail("expected shutdown abort");
		} catch (error) {
			expect((error as { code: string }).code).to.equal("ABORTED");
		}
	});
});
