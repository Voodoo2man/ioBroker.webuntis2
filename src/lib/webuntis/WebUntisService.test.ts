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

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
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
		const service = new WebUntisService(undefined, message => info.push(message), undefined, fetchFor(calls));
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

	it("keeps existing master data when an expired refresh fails", async () => {
		const calls: string[] = [];
		let failing = false;
		const service = new WebUntisService(undefined, undefined, undefined, async (_input, init) => {
			const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
			calls.push(body.method || "http");
			if (body.method === "authenticate") {
				return json({ result: { sessionId: "session", personType: 5, personId: 1, klasseId: 2 } });
			}
			if (body.method === "getHolidays" || body.method === "getTimetable") return json({ result: [] });
			return failing ? json({ error: { code: -1 } }) : json({ result: [{ id: 1, name: body.method }] });
		});
		await service.loadTimetable(config, new Date("2026-09-11T08:00:00"));
		failing = true;
		await service.loadTimetable(config, new Date("2026-09-11T14:01:00"));
		expect(calls.filter(method => method === "getSubjects")).to.have.length(2);
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
});
