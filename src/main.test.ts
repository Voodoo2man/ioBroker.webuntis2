/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string */

import { expect } from "chai";
import {
	mergeSchoolSelection,
	rankSchoolResults,
	schoolResultToConfig,
	searchSchools,
} from "./lib/webuntis/SchoolDiscovery";
import { WebUntisClient } from "./lib/webuntis/WebUntisClient";
import { WebUntisError } from "./lib/webuntis/WebUntisErrors";
import { WebUntisService } from "./lib/webuntis/WebUntisService";

function response(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
