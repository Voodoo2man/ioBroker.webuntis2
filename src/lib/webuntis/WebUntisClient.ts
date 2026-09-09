/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-param */

import { WebUntisError } from "./WebUntisErrors";
import type {
	TimetableQuery,
	WebUntisConnectionConfig,
	WebUntisHttpDiagnostic,
	WebUntisPeriod,
	WebUntisSession,
} from "./WebUntisTypes";

const REQUEST_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isAuthenticationResponse(value: unknown): value is WebUntisSession {
	return (
		isRecord(value) &&
		typeof value.sessionId === "string" &&
		typeof value.personType === "number" &&
		typeof value.personId === "number" &&
		typeof value.klasseId === "number"
	);
}

function isPeriodList(value: unknown): value is WebUntisPeriod[] {
	return Array.isArray(value) && value.every(isRecord);
}

function getClassIdFromConfig(value: unknown): number | null {
	if (!isRecord(value) || !isRecord(value.data)) {
		return null;
	}
	const classId = value.data.klasseId;
	if (typeof classId === "number" && Number.isInteger(classId) && classId > 0) {
		return classId;
	}
	if (typeof classId === "string" && /^\d+$/.test(classId) && Number(classId) > 0) {
		return Number(classId);
	}
	if (Array.isArray(value.data.klassen)) {
		const firstClass = value.data.klassen.find(isRecord);
		const id = firstClass?.id ?? firstClass?.klasseId;
		if (typeof id === "number" && Number.isInteger(id)) {
			return id;
		}
		if (typeof id === "string" && /^\d+$/.test(id)) {
			return Number(id);
		}
	}
	return null;
}

function publicPeriods(value: unknown, personId: number): WebUntisPeriod[] {
	if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.result)) {
		return [];
	}
	const data = value.data.result.data;
	if (!isRecord(data) || !isRecord(data.elementPeriods)) {
		return [];
	}
	const periods = data.elementPeriods[String(personId)];
	if (!Array.isArray(periods)) {
		return [];
	}
	return periods.filter(isRecord).map(period => {
		const elements = Array.isArray(period.elements) ? period.elements.filter(isRecord) : [];
		const refs = (type: number): Record<string, unknown>[] =>
			elements
				.filter(element => element.type === type)
				.map(element => (isRecord(element.element) ? element.element : element));
		return { ...period, kl: refs(1), te: refs(2), su: refs(3), ro: refs(4) };
	});
}

function getSupportedPerson(value: unknown): { id: number; type: number } | null {
	if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.loginServiceConfig)) {
		return null;
	}
	const user = value.data.loginServiceConfig.user;
	if (!isRecord(user) || !Array.isArray(user.persons)) {
		return null;
	}
	for (const person of user.persons) {
		if (!isRecord(person) || typeof person.id !== "number" || typeof person.type !== "number") {
			continue;
		}
		if (person.type >= 1 && person.type <= 5) {
			return { id: person.id, type: person.type };
		}
	}
	return null;
}

function getEndpoint(server: string, schoolName: string): string {
	const url = new URL(server);
	const webUntisPath = url.pathname.match(/^(.*\/WebUntis)(?:\/|$)/i)?.[1] || "/WebUntis";
	return `${url.origin}${webUntisPath}/jsonrpc.do?school=${encodeURIComponent(schoolName)}`;
}

function getResponseType(body: string, contentType: string): WebUntisHttpDiagnostic["type"] {
	if (!body) {
		return "empty";
	}
	if (contentType.toLocaleLowerCase().includes("html") || /^\s*</.test(body)) {
		return "html";
	}
	try {
		JSON.parse(body);
		return "json";
	} catch {
		return "text";
	}
}

function redactUrl(url: string): string {
	return url.replace(/;jsessionid=[^?;]+/gi, ";jsessionid=<redacted>");
}

function getCookieHeader(headers: Headers): string | undefined {
	const cookieHeaders = headers as Headers & { getSetCookie?: () => string[] };
	const values = cookieHeaders.getSetCookie?.() ?? [headers.get("set-cookie") || ""];
	const cookies = values
		.flatMap(value => value.split(/,(?=[^;,]+=)/))
		.map(value => value.split(";", 1)[0].trim())
		.filter(Boolean);
	return cookies.length ? cookies.join("; ") : undefined;
}

/**
 *
 */
export class WebUntisClient {
	private readonly endpoint: string;
	private sessionCookie?: string;

	/**
	 *
	 */
	public constructor(
		config: Pick<WebUntisConnectionConfig, "server" | "schoolName">,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS,
		private readonly onDiagnostic?: (diagnostic: WebUntisHttpDiagnostic) => void,
	) {
		this.endpoint = getEndpoint(config.server, config.schoolName);
	}

	/**
	 *
	 */
	public async authenticate(username: string, password: string): Promise<WebUntisSession> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
		try {
			const response = await this.fetchImpl(this.endpoint, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify({
					id: Date.now().toString(),
					method: "authenticate",
					params: { user: username, password, client: "ioBroker.webuntis" },
					jsonrpc: "2.0",
				}),
				signal: controller.signal,
			});
			this.sessionCookie = getCookieHeader(response.headers);
			const contentType = response.headers.get("content-type") || "";
			const body = await response.text();
			const type = getResponseType(body, contentType);
			let payload: unknown;
			if (type === "json") {
				try {
					payload = JSON.parse(body);
				} catch {
					throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis JSON response");
				}
			}
			const diagnostic: WebUntisHttpDiagnostic = {
				method: "authenticate",
				status: response.status,
				contentType,
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type,
				cookiePresent: Boolean(this.sessionCookie),
				responseHeaders: Array.from(response.headers.keys()).sort(),
			};
			if (isRecord(payload)) {
				diagnostic.keys = Object.keys(payload);
				if (isRecord(payload.error)) {
					diagnostic.errorKeys = Object.keys(payload.error);
					if (typeof payload.error.code === "number") {
						diagnostic.errorCode = payload.error.code;
					}
					if (typeof payload.error.message === "string") {
						diagnostic.errorMessage = payload.error.message.slice(0, 120);
					}
				}
				if (isRecord(payload.result)) {
					diagnostic.resultKeys = Object.keys(payload.result);
					if (typeof payload.result.personType === "number") {
						diagnostic.personType = payload.result.personType;
					}
					diagnostic.personIdPresent = typeof payload.result.personId === "number";
					diagnostic.klasseIdPresent = typeof payload.result.klasseId === "number";
				}
				diagnostic.resultType = Array.isArray(payload.result)
					? "array"
					: payload.result === undefined
						? "missing"
						: isRecord(payload.result)
							? "object"
							: "primitive";
				if (Array.isArray(payload.result)) {
					diagnostic.resultLength = payload.result.length;
				}
			}
			this.onDiagnostic?.(diagnostic);
			if (!response.ok) {
				throw new WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
			}
			if (response.redirected) {
				throw new WebUntisError("REDIRECTED", "WebUntis redirected the authentication request");
			}
			if (type === "html") {
				throw new WebUntisError("HTML_RESPONSE", "WebUntis returned HTML instead of JSON");
			}
			if (!isRecord(payload)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis response");
			}
			if (isRecord(payload.error)) {
				const code = payload.error.code;
				if (code === -8504 || code === -8520 || code === -8521) {
					throw new WebUntisError("INVALID_CREDENTIALS", "WebUntis rejected the credentials");
				}
				if (code === -8522) {
					throw new WebUntisError("USER_BLOCKED", "WebUntis user is blocked");
				}
				if (code === -8500) {
					throw new WebUntisError("INVALID_SCHOOL", "WebUntis rejected the school");
				}
				throw new WebUntisError("UNEXPECTED_RESPONSE", "WebUntis authentication failed");
			}
			if (!isAuthenticationResponse(payload.result)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid authentication response");
			}
			return payload.result;
		} catch (error) {
			if (error instanceof WebUntisError) {
				throw error;
			}
			if (error instanceof DOMException && error.name === "AbortError") {
				throw new WebUntisError("TIMEOUT", "WebUntis authentication timed out");
			}
			throw new WebUntisError("SERVER_UNREACHABLE", "WebUntis authentication failed", { cause: error });
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 *
	 */
	public async getTimetable(session: WebUntisSession, options: TimetableQuery): Promise<WebUntisPeriod[]> {
		return this.request<WebUntisPeriod[]>("getTimetable", { options }, session);
	}

	/**
	 *
	 */
	public async getSubjects(session: WebUntisSession): Promise<WebUntisPeriod[]> {
		return this.request<WebUntisPeriod[]>("getSubjects", {}, session);
	}

	/**
	 *
	 */
	public async getTeachers(session: WebUntisSession): Promise<WebUntisPeriod[]> {
		return this.request<WebUntisPeriod[]>("getTeachers", {}, session);
	}

	/**
	 *
	 */
	public async getRooms(session: WebUntisSession): Promise<WebUntisPeriod[]> {
		return this.request<WebUntisPeriod[]>("getRooms", {}, session);
	}

	/**
	 *
	 */
	public async getKlassen(session: WebUntisSession): Promise<WebUntisPeriod[]> {
		return this.request<WebUntisPeriod[]>("getKlassen", {}, session);
	}

	/**
	 *
	 */
	public async getClassId(session: WebUntisSession): Promise<number | null> {
		const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/daytimetable/config");
		const response = await this.fetchImpl(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const contentType = response.headers.get("content-type") || "";
		const body = await response.text();
		const type = getResponseType(body, contentType);
		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			this.onDiagnostic?.({
				method: "getClassId",
				status: response.status,
				contentType,
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type,
			});
			return null;
		}
		this.onDiagnostic?.({
			method: "getClassId",
			status: response.status,
			contentType,
			url: redactUrl(response.url),
			redirected: response.redirected,
			length: body.length,
			type,
			resultType: "object",
			resultKeys: isRecord(payload) ? Object.keys(payload) : undefined,
			dataType: isRecord(payload) ? typeof payload.data : typeof payload,
			dataKeys: isRecord(payload) && isRecord(payload.data) ? Object.keys(payload.data) : [],
			classIdType: isRecord(payload) && isRecord(payload.data) ? typeof payload.data.klasseId : "missing",
			classIdPresent: getClassIdFromConfig(payload) !== null,
			classCandidateCount:
				isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.klassen)
					? payload.data.klassen.length
					: 0,
		});
		return getClassIdFromConfig(payload);
	}

	/**
	 *
	 */
	public async getPublicTimetable(session: WebUntisSession, date: Date): Promise<WebUntisPeriod[]> {
		const url = new URL(this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/public/timetable/weekly/data"));
		url.searchParams.set("elementType", String(session.personType));
		url.searchParams.set("elementId", String(session.personId));
		url.searchParams.set("date", date.toISOString().slice(0, 10));
		url.searchParams.set("formatId", "1");
		const response = await this.fetchImpl(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const contentType = response.headers.get("content-type") || "";
		const body = await response.text();
		const type = getResponseType(body, contentType);
		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis public timetable response");
		}
		const periods = publicPeriods(payload, session.personId);
		this.onDiagnostic?.({
			method: "getPublicTimetable",
			status: response.status,
			contentType,
			url: redactUrl(response.url),
			redirected: response.redirected,
			length: body.length,
			type,
			resultType: "array",
			resultLength: periods.length,
			resultKeys: isRecord(payload) ? Object.keys(payload) : undefined,
			errorMessage:
				isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
					? payload.error.message.slice(0, 120)
					: undefined,
		});
		if (!response.ok) {
			throw new WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
		}
		return periods;
	}

	/**
	 *
	 */
	public async getSupportedPerson(session: WebUntisSession): Promise<{ id: number; type: number } | null> {
		const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/app/config");
		const response = await this.fetchImpl(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const contentType = response.headers.get("content-type") || "";
		const body = await response.text();
		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			this.onDiagnostic?.({
				method: "getSupportedPerson",
				status: response.status,
				contentType,
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type: getResponseType(body, contentType),
			});
			return null;
		}
		const person = getSupportedPerson(payload);
		this.onDiagnostic?.({
			method: "getSupportedPerson",
			status: response.status,
			contentType,
			url: redactUrl(response.url),
			redirected: response.redirected,
			length: body.length,
			type: getResponseType(body, contentType),
			resultType: person ? "object" : "missing",
			personCandidate: Boolean(person),
			resultKeys: isRecord(payload) ? Object.keys(payload) : undefined,
			errorMessage:
				isRecord(payload) && typeof payload.errorMessage === "string"
					? payload.errorMessage.slice(0, 120)
					: undefined,
		});
		return person;
	}

	private async request<T>(method: string, params: unknown, session: WebUntisSession): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
		try {
			const sessionEndpoint = this.endpoint.replace(
				"/jsonrpc.do?",
				`/jsonrpc.do;jsessionid=${encodeURIComponent(session.sessionId)}?`,
			);
			const response = await this.fetchImpl(sessionEndpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					...(this.sessionCookie ? { cookie: this.sessionCookie } : {}),
				},
				body: JSON.stringify({ id: Date.now().toString(), method, params, jsonrpc: "2.0" }),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
			}
			const body = await response.text();
			let payload: unknown;
			try {
				payload = JSON.parse(body);
			} catch {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable JSON response");
			}
			const diagnostic: WebUntisHttpDiagnostic = {
				method,
				status: response.status,
				contentType: response.headers.get("content-type") || "",
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type: "json",
				cookiePresent: Boolean(this.sessionCookie),
				elementType:
					isRecord(params) && isRecord(params.options) && isRecord(params.options.element)
						? typeof params.options.element.type === "number"
							? params.options.element.type
							: undefined
						: undefined,
			};
			if (isRecord(payload)) {
				diagnostic.keys = Object.keys(payload);
				if (isRecord(payload.error)) {
					diagnostic.errorKeys = Object.keys(payload.error);
					if (typeof payload.error.code === "number") {
						diagnostic.errorCode = payload.error.code;
					}
					if (typeof payload.error.message === "string") {
						diagnostic.errorMessage = payload.error.message.slice(0, 120);
					}
				}
				if (Array.isArray(payload.result)) {
					diagnostic.resultType = "array";
					diagnostic.resultLength = payload.result.length;
				} else if (isRecord(payload.result)) {
					diagnostic.resultType = "object";
					diagnostic.resultKeys = Object.keys(payload.result);
				} else {
					diagnostic.resultType = payload.result === undefined ? "missing" : "primitive";
				}
			}
			this.onDiagnostic?.(diagnostic);
			if (!isRecord(payload)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable response");
			}
			if (isRecord(payload.error)) {
				if (
					payload.error.code === -7001 &&
					typeof payload.error.message === "string" &&
					payload.error.message.startsWith("invalid elementType:")
				) {
					throw new WebUntisError("API_REQUEST", "WebUntis rejected the timetable element type");
				}
				if (payload.error.code === -7001) {
					throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
				}
				throw new WebUntisError("UNEXPECTED_RESPONSE", "WebUntis timetable request failed");
			}
			if (!isPeriodList(payload.result)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
			}
			return payload.result as T;
		} catch (error) {
			if (error instanceof WebUntisError) {
				throw error;
			}
			if (error instanceof DOMException && error.name === "AbortError") {
				throw new WebUntisError("TIMEOUT", "WebUntis timetable request timed out");
			}
			throw new WebUntisError("SERVER_UNREACHABLE", "WebUntis timetable request failed", { cause: error });
		} finally {
			clearTimeout(timer);
		}
	}
}
