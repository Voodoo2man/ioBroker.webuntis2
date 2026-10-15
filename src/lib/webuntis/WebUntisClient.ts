/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-param */

import type { HolidayEntry } from "./Holidays";
import { WebUntisError } from "./WebUntisErrors";
import type {
	TimetableQuery,
	WebUntisConnectionConfig,
	WebUntisHttpDiagnostic,
	WebUntisInboxMessage,
	WebUntisPeriod,
	WebUntisSession,
} from "./WebUntisTypes";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Format a date using the local calendar date instead of converting it to UTC.
 */
export function localDateString(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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

function isLoginPagePayload(value: unknown): boolean {
	return isRecord(value) && Boolean(value.loginError);
}

function getEndpoint(server: string, schoolName: string): string {
	const url = new URL(server);
	const webUntisPath = url.pathname.match(/^(.*\/WebUntis)(?:\/|$)/i)?.[1] || "/WebUntis";
	return `${url.origin}${webUntisPath}/jsonrpc.do?school=${encodeURIComponent(schoolName)}`;
}

function valueText(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function extractMessageContent(value: unknown, depth = 0): string {
	if (typeof value === "string") {
		return value;
	}
	if (depth > 4 || !isRecord(value)) {
		return "";
	}
	for (const key of ["content", "text", "body", "message", "messageContent", "messageText", "fullText"]) {
		if (typeof value[key] === "string" && value[key]) {
			return value[key];
		}
	}
	for (const key of ["data", "message", "result", "item"]) {
		const content = extractMessageContent(value[key], depth + 1);
		if (content) {
			return content;
		}
	}
	return "";
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

function cookieValue(header: string | undefined, name: string): string | undefined {
	return header
		?.split(/;\s*/)
		.map(cookie => cookie.split("=", 2))
		.find(([key]) => key === name)?.[1];
}

function mergeCookieHeader(
	previous: string | undefined,
	headers: Headers,
): { value?: string; changed: boolean; sessionCookieChanged: boolean } {
	const values = new Map<string, string>();
	for (const cookie of (previous || "").split(/;\s*/)) {
		const separator = cookie.indexOf("=");
		if (separator > 0) {
			values.set(cookie.slice(0, separator), cookie);
		}
	}
	const next = getCookieHeader(headers);
	if (next) {
		for (const cookie of next.split(/;\s*/)) {
			const separator = cookie.indexOf("=");
			if (separator > 0) {
				values.set(cookie.slice(0, separator), cookie);
			}
		}
	}
	const value = values.size ? [...values.values()].join("; ") : undefined;
	return {
		value,
		changed: value !== previous,
		sessionCookieChanged: cookieValue(previous, "JSESSIONID") !== cookieValue(value, "JSESSIONID"),
	};
}

/**
 *
 */
export class WebUntisClient {
	private readonly endpoint: string;
	private readonly schoolName: string;
	private sessionCookie?: string;
	private messageSchoolCookie?: string;
	private authenticatedAt?: number;
	private requestSequence = 0;

	/**
	 *
	 */
	public constructor(
		config: Pick<WebUntisConnectionConfig, "server" | "schoolName">,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS,
		private readonly onDiagnostic?: (diagnostic: WebUntisHttpDiagnostic) => void,
		private readonly abortSignal?: AbortSignal,
	) {
		this.endpoint = getEndpoint(config.server, config.schoolName);
		this.schoolName = config.schoolName;
	}

	private getRequestSignal(): AbortSignal {
		const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
		return this.abortSignal ? AbortSignal.any([timeoutSignal, this.abortSignal]) : timeoutSignal;
	}

	/**
	 *
	 */
	public async authenticate(username: string, password: string): Promise<WebUntisSession> {
		try {
			const response = await this.fetchImpl(this.endpoint, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify({
					id: Date.now().toString(),
					method: "authenticate",
					params: { user: username, password, client: "ioBroker.webuntis2" },
					jsonrpc: "2.0",
				}),
				signal: this.getRequestSignal(),
			});
			this.sessionCookie = getCookieHeader(response.headers);
			this.authenticatedAt = Date.now();
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
			if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
				throw new WebUntisError(
					this.abortSignal?.aborted ? "ABORTED" : "TIMEOUT",
					this.abortSignal?.aborted
						? "WebUntis authentication was aborted"
						: "WebUntis authentication timed out",
				);
			}
			throw new WebUntisError("SERVER_UNREACHABLE", "WebUntis authentication failed", { cause: error });
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
	public async getHolidays(session: WebUntisSession): Promise<HolidayEntry[]> {
		return this.request<HolidayEntry[]>("getHolidays", {}, session);
	}

	/**
	 *
	 */
	public async getUnreadMessages(session: WebUntisSession): Promise<WebUntisInboxMessage[]> {
		const token = await this.getRestToken(session);
		const payload = await this.restRequest("/api/rest/view/v1/messages", session, token, "getMessages");
		const inbox = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
		if (!isRecord(inbox) || !Array.isArray(inbox.incomingMessages)) {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis messages response");
		}
		const unread = inbox.incomingMessages.filter(
			(message): message is Record<string, unknown> =>
				isRecord(message) &&
				message.isMessageRead === false &&
				(typeof message.id === "number" || typeof message.id === "string"),
		);
		const result: WebUntisInboxMessage[] = [];
		for (let index = 0; index < unread.length; index += 4) {
			const batch = await Promise.all(
				unread.slice(index, index + 4).map(async message => {
					const preview = valueText(message.contentPreview);
					let content = preview;
					let contentIsPreview = true;
					try {
						const detail = await this.restRequest(
							`/api/rest/view/v1/messages/${encodeURIComponent(String(message.id))}`,
							session,
							token,
							"getMessage",
						);
						const fullContent = extractMessageContent(detail);
						if (fullContent) {
							content = fullContent;
							contentIsPreview = false;
						}
					} catch (error) {
						if (error instanceof WebUntisError && error.code === "SESSION_EXPIRED") {
							throw error;
						}
					}
					const sender = isRecord(message.sender)
						? valueText(message.sender.displayName)
						: valueText(message.sender);
					return {
						id: message.id as number | string,
						dateTime: valueText(message.sentDateTime ?? message.dateTime),
						sender,
						subject: valueText(message.subject),
						content,
						contentIsPreview,
						hasAttachments: message.hasAttachments === true,
					};
				}),
			);
			result.push(...batch);
		}
		return result;
	}

	private restUrl(path: string): string {
		return this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, path);
	}

	private restCookie(session: WebUntisSession, schoolNameCookie?: string): string {
		const cookies = new Map<string, string>();
		for (const cookie of (this.sessionCookie || "").split(/;\s*/)) {
			const separator = cookie.indexOf("=");
			if (separator > 0) {
				cookies.set(cookie.slice(0, separator), cookie);
			}
		}
		cookies.set("JSESSIONID", `JSESSIONID=${session.sessionId}`);
		const schoolCookie =
			schoolNameCookie ?? this.messageSchoolCookie ?? `_${Buffer.from(this.schoolName).toString("base64")}`;
		cookies.set("schoolname", `schoolname=${schoolCookie}`);
		return [...cookies.values()].join("; ");
	}

	private async getRestToken(session: WebUntisSession): Promise<string> {
		const url = this.restUrl("/api/token/new");
		const schoolCookies = [...new Set([`_${Buffer.from(this.schoolName).toString("base64")}`, this.schoolName])];
		for (let index = 0; index < schoolCookies.length; index++) {
			const schoolCookie = schoolCookies[index];
			const response = await this.fetchImpl(url, {
				method: "GET",
				signal: this.getRequestSignal(),
				headers: { accept: "application/json", cookie: this.restCookie(session, schoolCookie) },
			});
			const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
			this.sessionCookie = cookie.value;
			const body = await response.text();
			this.onDiagnostic?.({
				method: "getMessageToken",
				status: response.status,
				contentType: response.headers.get("content-type") || "",
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type: getResponseType(body, response.headers.get("content-type") || ""),
				cookiePresent: Boolean(this.sessionCookie),
				cookieChanged: cookie.changed,
				sessionCookieChanged: cookie.sessionCookieChanged,
				schoolCookieFormat: index === 0 ? "base64" : "plain",
			});
			if (!response.ok || response.redirected) {
				const responseDetail = response.redirected ? "redirected" : `HTTP ${response.status}`;
				const error = new WebUntisError(
					response.status === 401 || response.redirected ? "SESSION_EXPIRED" : "API_REQUEST",
					`WebUntis message authentication failed (${responseDetail})`,
				);
				if (error.code === "SESSION_EXPIRED" || response.status !== 406 || index === schoolCookies.length - 1) {
					throw error;
				}
				continue;
			}
			let token = body.trim();
			if (token.startsWith('"') && token.endsWith('"')) {
				try {
					const parsed: unknown = JSON.parse(token);
					if (typeof parsed !== "string") {
						throw new Error("Token is not a string");
					}
					token = parsed;
				} catch {
					throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis message token response");
				}
			}
			if (!token || token.startsWith("<")) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis message token response");
			}
			this.messageSchoolCookie = schoolCookie;
			return token;
		}
		throw new WebUntisError("API_REQUEST", "WebUntis message authentication failed");
	}

	private async restRequest(path: string, session: WebUntisSession, token: string, method: string): Promise<unknown> {
		const url = this.restUrl(path);
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				Authorization: `Bearer ${token}`,
				cookie: this.restCookie(session),
			},
		});
		const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
		this.sessionCookie = cookie.value;
		const body = await response.text();
		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			payload = undefined;
		}
		this.onDiagnostic?.({
			method,
			status: response.status,
			contentType: response.headers.get("content-type") || "",
			url: redactUrl(response.url),
			redirected: response.redirected,
			length: body.length,
			type: getResponseType(body, response.headers.get("content-type") || ""),
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
			resultKeys: isRecord(payload) ? Object.keys(payload) : undefined,
		});
		if (response.status === 401 || response.redirected || (isRecord(payload) && isLoginPagePayload(payload))) {
			throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired while loading messages");
		}
		if (!response.ok) {
			throw new WebUntisError("API_REQUEST", `WebUntis ${method} request failed (HTTP ${response.status})`);
		}
		if (payload === undefined) {
			throw new WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${method} response`);
		}
		return payload;
	}

	/**
	 *
	 */
	public async getClassId(session: WebUntisSession): Promise<number | null> {
		const url = this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/daytimetable/config");
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
		this.sessionCookie = cookie.value;
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
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
			cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
			classCandidateCount:
				isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.klassen)
					? payload.data.klassen.length
					: 0,
		});
		if (response.redirected || isLoginPagePayload(payload)) {
			throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
		}
		return getClassIdFromConfig(payload);
	}

	/**
	 *
	 */
	public async getPublicTimetable(session: WebUntisSession, date: Date): Promise<WebUntisPeriod[]> {
		const url = new URL(this.endpoint.replace(/\/jsonrpc\.do\?.*$/i, "/api/public/timetable/weekly/data"));
		url.searchParams.set("elementType", String(session.personType));
		url.searchParams.set("elementId", String(session.personId));
		url.searchParams.set("date", localDateString(date));
		url.searchParams.set("formatId", "1");
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
		this.sessionCookie = cookie.value;
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
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
			cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
			errorMessage:
				isRecord(payload) && typeof payload.errorMessage === "string"
					? payload.errorMessage.slice(0, 120)
					: isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
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
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				...(this.sessionCookie
					? { cookie: this.sessionCookie }
					: { cookie: `JSESSIONID=${session.sessionId}` }),
			},
		});
		const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
		this.sessionCookie = cookie.value;
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
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
			cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
			errorMessage:
				isRecord(payload) && typeof payload.errorMessage === "string"
					? payload.errorMessage.slice(0, 120)
					: undefined,
		});
		if (response.redirected || isLoginPagePayload(payload)) {
			throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
		}
		return person;
	}

	private async request<T>(method: string, params: unknown, session: WebUntisSession): Promise<T> {
		try {
			const requestSequence = ++this.requestSequence;
			const sessionEndpoint = this.endpoint.replace(
				"/jsonrpc.do?",
				`/jsonrpc.do;jsessionid=${encodeURIComponent(session.sessionId)}?`,
			);
			const requestOptions = isRecord(params) && isRecord(params.options) ? params.options : undefined;
			const response = await this.fetchImpl(sessionEndpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
					...(this.sessionCookie ? { cookie: this.sessionCookie } : {}),
				},
				body: JSON.stringify({ id: Date.now().toString(), method, params, jsonrpc: "2.0" }),
				signal: this.getRequestSignal(),
			});
			const body = await response.text();
			const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
			this.sessionCookie = cookie.value;
			const contentType = response.headers.get("content-type") || "";
			const type = getResponseType(body, contentType);
			let payload: unknown;
			if (type === "json") {
				try {
					payload = JSON.parse(body);
				} catch {
					// Keep the safe transport diagnostic even for malformed JSON.
				}
			}
			const diagnostic: WebUntisHttpDiagnostic = {
				method,
				status: response.status,
				contentType,
				url: redactUrl(response.url),
				redirected: response.redirected,
				length: body.length,
				type,
				cookiePresent: Boolean(this.sessionCookie),
				cookieChanged: cookie.changed,
				sessionCookieChanged: cookie.sessionCookieChanged,
				cookieCount: this.sessionCookie ? this.sessionCookie.split(/;\s*/).length : 0,
				sessionAgeSeconds: this.authenticatedAt
					? Math.max(0, Math.round((Date.now() - this.authenticatedAt) / 1000))
					: undefined,
				requestSequence,
				sessionPresent: Boolean(session.sessionId),
				personIdPresent: typeof session.personId === "number",
				elementType: isRecord(requestOptions?.element)
					? typeof requestOptions.element.type === "number"
						? requestOptions.element.type
						: undefined
					: undefined,
				startDate: typeof requestOptions?.startDate === "number" ? requestOptions.startDate : undefined,
				endDate: typeof requestOptions?.endDate === "number" ? requestOptions.endDate : undefined,
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
			if (!response.ok) {
				throw new WebUntisError("SERVER_UNREACHABLE", `WebUntis HTTP ${response.status}`);
			}
			if (!isRecord(payload)) {
				throw new WebUntisError(
					type === "html" ? "HTML_RESPONSE" : "INVALID_RESPONSE",
					type === "html" ? "WebUntis returned HTML instead of JSON" : "Invalid WebUntis timetable response",
				);
			}
			if (isRecord(payload.error)) {
				if (
					payload.error.code === -7001 &&
					typeof payload.error.message === "string" &&
					payload.error.message.startsWith("invalid elementType:")
				) {
					throw new WebUntisError("API_REQUEST", "WebUntis rejected the timetable element type");
				}
				if (payload.error.code === -7001 || payload.error.code === -8520) {
					throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired");
				}
				const details = [
					typeof payload.error.code === "number" || typeof payload.error.code === "string"
						? `code ${payload.error.code}`
						: "",
					typeof payload.error.message === "string" ? payload.error.message.slice(0, 120) : "",
				].filter(Boolean);
				throw new WebUntisError(
					"UNEXPECTED_RESPONSE",
					`WebUntis timetable request failed${details.length ? ` (${details.join(": ")})` : ""}`,
				);
			}
			if (!isPeriodList(payload.result)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis timetable result");
			}
			return payload.result as T;
		} catch (error) {
			if (error instanceof WebUntisError) {
				throw error;
			}
			if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
				throw new WebUntisError(
					this.abortSignal?.aborted ? "ABORTED" : "TIMEOUT",
					this.abortSignal?.aborted
						? "WebUntis timetable request was aborted"
						: "WebUntis timetable request timed out",
				);
			}
			throw new WebUntisError("SERVER_UNREACHABLE", "WebUntis timetable request failed", { cause: error });
		}
	}
}
