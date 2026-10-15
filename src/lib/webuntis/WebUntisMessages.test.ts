/* eslint-disable @typescript-eslint/require-await */

import { expect } from "chai";
import { WebUntisClient } from "./WebUntisClient";

const config = { server: "https://example.webuntis.com", schoolName: "sample" };
const session = { sessionId: "sid", personType: 5, personId: 10, klasseId: 2 };

describe("WebUntis unread messages", () => {
	it("returns unread messages, prefers full details, and falls back to previews", async () => {
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
				id: 2,
				dateTime: "2026-10-15T10:00:00",
				sender: "Teacher",
				subject: "Full message",
				content: "Full body",
				contentIsPreview: false,
				hasAttachments: true,
			},
			{
				id: 3,
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
});
