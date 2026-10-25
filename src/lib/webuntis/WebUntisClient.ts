/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-param */

import { normalizeGuardianTimetableExams } from "./Exams";
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

function guardianTimetableResponseShape(value: unknown): string {
	const shape: Record<string, unknown> = {
		rootType: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
	};
	if (!isRecord(value)) {
		return JSON.stringify(shape);
	}
	shape.rootKeys = Object.keys(value).sort();
	const timetable = isRecord(value.data) ? value.data : value;
	shape.dataType = Array.isArray(value.data) ? "array" : value.data === undefined ? "missing" : typeof value.data;
	if (isRecord(timetable)) {
		shape.dataKeys = Object.keys(timetable).sort();
	}
	if (Array.isArray(timetable.days)) {
		shape.dayCount = timetable.days.length;
		const entryTypes = new Map<string, number>();
		const examShapes: Array<Record<string, unknown>> = [];
		for (const day of timetable.days) {
			if (!isRecord(day) || !Array.isArray(day.gridEntries)) {
				continue;
			}
			for (const entry of day.gridEntries) {
				if (!isRecord(entry)) {
					continue;
				}
				const entryType = typeof entry.type === "string" ? entry.type : typeof entry.type;
				entryTypes.set(entryType, (entryTypes.get(entryType) ?? 0) + 1);
				if (
					typeof entry.type !== "string" ||
					!entry.type.toUpperCase().includes("EXAM") ||
					examShapes.length >= 5
				) {
					continue;
				}
				const duration = entry.duration;
				const positions = Object.entries(entry).filter(([key]) => /^position\d+$/i.test(key));
				examShapes.push({
					keys: Object.keys(entry).sort(),
					duration: isRecord(duration)
						? Object.fromEntries(Object.entries(duration).map(([key, field]) => [key, typeof field]))
						: typeof duration,
					positions: positions.map(([key, position]) => ({
						key,
						shape: (Array.isArray(position) ? position : [position]).map(item => {
							if (!isRecord(item)) {
								return { type: typeof item };
							}
							const current = item.current;
							const original = item.original;
							return {
								keys: Object.keys(item).sort(),
								current: isRecord(current)
									? {
											keys: Object.keys(current).sort(),
											fieldTypes: Object.fromEntries(
												Object.entries(current).map(([field, value]) => [field, typeof value]),
											),
										}
									: typeof current,
								original: isRecord(original)
									? {
											keys: Object.keys(original).sort(),
											fieldTypes: Object.fromEntries(
												Object.entries(original).map(([field, value]) => [field, typeof value]),
											),
										}
									: typeof original,
							};
						}),
					})),
				});
			}
		}
		shape.entryTypes = Object.fromEntries([...entryTypes.entries()].sort(([a], [b]) => a.localeCompare(b)));
		shape.examShapes = examShapes;
	}
	return JSON.stringify(shape);
}

interface ParentExamContext {
	students: Array<{ id: number; name: string }>;
	tenantId?: string;
	schoolYearId?: number;
}

function positiveSafeId(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function safeHeaderId(value: unknown): string | undefined {
	const text = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
	if (typeof text !== "string") {
		return undefined;
	}
	const unquoted = text.trim().replace(/^"(.*)"$/, "$1");
	return /^[A-Za-z0-9._:-]{1,128}$/.test(unquoted) ? unquoted : undefined;
}

function tenantIdFromCookie(header: string | undefined): string | undefined {
	return safeHeaderId(cookieValue(header, "Tenant-Id") ?? cookieValue(header, "tenant-id"));
}

/**
 * Read the parent account's permitted students and current tenant/year context
 * from the observed app-data shape: user.students[].id, tenant.id, and
 * currentSchoolYear.id. The frontend may wrap this object in data.
 */
function parseParentExamContext(raw: unknown): ParentExamContext {
	if (!isRecord(raw)) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
	}
	if (raw.data !== undefined && !isRecord(raw.data)) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
	}
	const data = isRecord(raw.data) ? raw.data : raw;
	const user = data.user;
	if (!isRecord(user) || !Array.isArray(user.students)) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
	}
	const students: Array<{ id: number; name: string }> = [];
	for (const student of user.students) {
		const id = isRecord(student) ? positiveSafeId(student.id) : undefined;
		if (id === undefined) {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis parent exam context response");
		}
		const name = isRecord(student)
			? valueText(student.displayName ?? student.name ?? student.longName ?? student.shortName).trim()
			: "";
		students.push({ id, name });
	}
	const tenant = isRecord(data.tenant) ? data.tenant : undefined;
	const schoolYear = isRecord(data.currentSchoolYear) ? data.currentSchoolYear : undefined;
	return {
		students: [...new Map(students.map(student => [student.id, student])).values()],
		tenantId: safeHeaderId(tenant?.id),
		schoolYearId: positiveSafeId(schoolYear?.id),
	};
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
	return url
		.replace(/;jsessionid=[^?;]+/gi, ";jsessionid=<redacted>")
		.replace(/([?&](?:studentId|resources)=)[^&]*/gi, "$1<redacted>");
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
		const messages = inbox.incomingMessages.filter(
			(message): message is Record<string, unknown> =>
				isRecord(message) &&
				typeof message.isMessageRead === "boolean" &&
				(typeof message.id === "number" || typeof message.id === "string"),
		);
		const result: WebUntisInboxMessage[] = [];
		for (let index = 0; index < messages.length; index += 4) {
			const batch = await Promise.all(
				messages.slice(index, index + 4).map(async message => {
					const preview = valueText(message.contentPreview);
					let content = preview;
					let contentIsPreview = true;
					if (message.isMessageRead === false) {
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
					}
					const sender = isRecord(message.sender)
						? valueText(message.sender.displayName)
						: valueText(message.sender);
					return {
						id: message.id as number | string,
						readInWebUntis: message.isMessageRead === true,
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

	/** Load exams from the authenticated REST endpoint. */
	public async getExams(
		session: WebUntisSession,
		startDate: number,
		endDate: number,
		klasseId = -1,
	): Promise<unknown[]> {
		const url = new URL(this.restUrl("/api/exams"));
		url.searchParams.set("startDate", String(startDate));
		url.searchParams.set("endDate", String(endDate));
		url.searchParams.set("klasseId", String(klasseId));
		url.searchParams.set("withGrades", "false");
		if (session.personType === 5 && Number.isSafeInteger(session.personId) && session.personId > 0) {
			url.searchParams.set("studentId", String(session.personId));
		}
		try {
			let authContext: "cookie" | "bearer" = "cookie";
			let childScope: WebUntisHttpDiagnostic["childScope"] =
				session.personType === 5 ? "self" : session.personType > 5 ? "unresolved" : "not-applicable";
			let linkedStudentCount: number | undefined;
			let contextLoaded = false;
			let tenantId = tenantIdFromCookie(this.sessionCookie);
			let schoolYearId: number | undefined;
			const request = async (
				options: { token?: string; studentId?: number } = {},
			): Promise<{ response: Response; payload: unknown }> => {
				const requestUrl = new URL(url.href);
				if (options.studentId) {
					requestUrl.searchParams.set("studentId", String(options.studentId));
				}
				const response = await this.fetchImpl(requestUrl, {
					method: "GET",
					signal: this.getRequestSignal(),
					headers: {
						accept: "application/json",
						cookie: this.restCookie(session),
						...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
						...(tenantId ? { "Tenant-Id": tenantId } : {}),
						...(schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}),
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
					method: "getExams",
					authContext,
					personType: session.personType,
					childScope,
					linkedStudentCount,
					contextLoaded,
					tenantIdPresent: Boolean(tenantId),
					schoolYearIdPresent: Boolean(schoolYearId),
					status: response.status,
					contentType: response.headers.get("content-type") || "",
					url: redactUrl(response.url),
					redirected: response.redirected,
					length: body.length,
					type: getResponseType(body, response.headers.get("content-type") || ""),
					cookiePresent: Boolean(this.sessionCookie),
					cookieChanged: cookie.changed,
					sessionCookieChanged: cookie.sessionCookieChanged,
				});
				return { response, payload };
			};
			let result = await request();
			if (result.response.status === 403) {
				const token = await this.getRestToken(session, "exams");
				authContext = "bearer";
				tenantId = tenantIdFromCookie(this.sessionCookie) ?? tenantId;
				let studentId: number | undefined;
				if (session.personType === 12) {
					const context = await this.getParentExamContext(session, token, tenantId);
					contextLoaded = true;
					linkedStudentCount = context.students.length;
					tenantId = context.tenantId ?? tenantId;
					schoolYearId = context.schoolYearId;
					if (linkedStudentCount === 0) {
						childScope = "unresolved";
						throw new WebUntisError(
							"API_REQUEST",
							`WebUntis parent exam scope unresolved after app-data lookup (auth=bearer, personType=${session.personType}, childScope=unresolved, linkedStudents=0)`,
						);
					}
					childScope = linkedStudentCount === 1 ? "unique" : "ambiguous";
					return this.loadLinkedStudentExams(
						session,
						context.students,
						token,
						startDate,
						endDate,
						tenantId,
						schoolYearId,
					);
				}
				result = await request({ token, studentId });
				if (result.response.status === 403 && session.personType >= 5) {
					const scopedStudentId = session.personType === 5 ? session.personId : studentId;
					if (!scopedStudentId) {
						throw new WebUntisError("API_REQUEST", "Student scope is unavailable for timetable exams");
					}
					return await this.getGuardianTimetableExams(
						session,
						token,
						startDate,
						endDate,
						scopedStudentId,
						"",
						tenantId,
						schoolYearId,
						linkedStudentCount,
					);
				}
			}
			const { response, payload } = result;
			if (response.status === 401 || response.redirected || (isRecord(payload) && isLoginPagePayload(payload))) {
				const retryDetails =
					authContext === "bearer"
						? ` after REST token retry (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})`
						: "";
				throw new WebUntisError(
					"SESSION_EXPIRED",
					`WebUntis session expired while loading exams${retryDetails}`,
				);
			}
			if (!response.ok) {
				const retryDetails =
					authContext === "bearer"
						? ` after REST token retry (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})`
						: ` (${this.examScopeDetails(authContext, session, childScope, linkedStudentCount)})`;
				throw new WebUntisError(
					"API_REQUEST",
					`WebUntis exams request failed (HTTP ${response.status})${retryDetails}`,
				);
			}
			if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.exams)) {
				throw new WebUntisError("INVALID_RESPONSE", "Invalid WebUntis exams response");
			}
			if (session.personType === 12) {
				const token = await this.getRestToken(session, "exams");
				const context = await this.getParentExamContext(session, token, tenantIdFromCookie(this.sessionCookie));
				if (context.students.length === 0) {
					throw new WebUntisError("API_REQUEST", "WebUntis parent exam scope has no linked students");
				}
				return this.loadLinkedStudentExams(
					session,
					context.students,
					token,
					startDate,
					endDate,
					context.tenantId ?? tenantIdFromCookie(this.sessionCookie),
					context.schoolYearId,
				);
			}
			if (
				payload.data.exams.length === 0 &&
				session.personType === 5 &&
				Number.isSafeInteger(session.personId) &&
				session.personId > 0
			) {
				const token = await this.getRestToken(session, "exams");
				const timetableExams = await this.getGuardianTimetableExams(
					session,
					token,
					startDate,
					endDate,
					session.personId,
					"",
					tenantIdFromCookie(this.sessionCookie),
					undefined,
					undefined,
				);
				return [...payload.data.exams, ...timetableExams];
			}
			return payload.data.exams;
		} catch (error) {
			if (error instanceof WebUntisError) {
				throw error;
			}
			if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
				throw new WebUntisError(
					this.abortSignal?.aborted ? "ABORTED" : "TIMEOUT",
					this.abortSignal?.aborted
						? "WebUntis exams request was aborted"
						: "WebUntis exams request timed out",
				);
			}
			throw new WebUntisError("SERVER_UNREACHABLE", "WebUntis exams request failed", { cause: error });
		}
	}

	/**
	 *
	 */
	public async getLinkedStudents(session: WebUntisSession): Promise<Array<{ id: number; name: string }>> {
		const token = await this.getRestToken(session, "exams");
		const context = await this.getParentExamContext(session, token, tenantIdFromCookie(this.sessionCookie));
		if (context.students.length === 0) {
			throw new WebUntisError("API_REQUEST", "WebUntis parent account has no linked students");
		}
		return context.students;
	}

	private async loadLinkedStudentExams(
		session: WebUntisSession,
		students: Array<{ id: number; name: string }>,
		token: string,
		startDate: number,
		endDate: number,
		tenantId: string | undefined,
		schoolYearId: number | undefined,
	): Promise<unknown[]> {
		const childExams = await Promise.all(
			students.map(student =>
				this.getGuardianTimetableExams(
					session,
					token,
					startDate,
					endDate,
					student.id,
					student.name,
					tenantId,
					schoolYearId,
					students.length,
				),
			),
		);
		return childExams.flat();
	}

	private async getGuardianTimetablePayload(
		session: WebUntisSession,
		token: string,
		startDate: number,
		endDate: number,
		studentId: number,
		tenantId: string | undefined,
		schoolYearId: number | undefined,
		linkedStudentCount: number,
	): Promise<unknown> {
		const formatDate = (value: number): string =>
			`${String(Math.floor(value / 10000)).padStart(4, "0")}-${String(Math.floor((value % 10000) / 100)).padStart(2, "0")}-${String(value % 100).padStart(2, "0")}`;
		const url = new URL(this.restUrl("/api/rest/view/v1/timetable/entries"));
		url.search = new URLSearchParams({
			start: formatDate(startDate),
			end: formatDate(endDate),
			format: "4",
			resourceType: "STUDENT",
			resources: String(studentId),
			periodTypes: "",
			timetableType: "MY_TIMETABLE",
		}).toString();
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				Authorization: `Bearer ${token}`,
				cookie: this.restCookie(session),
				...(tenantId ? { "Tenant-Id": tenantId } : {}),
				...(schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}),
			},
		});
		this.sessionCookie = mergeCookieHeader(this.sessionCookie, response.headers).value;
		const body = await response.text();
		let payload: unknown;
		try {
			payload = JSON.parse(body);
		} catch {
			payload = undefined;
		}
		if (response.status === 401 || response.redirected || (isRecord(payload) && isLoginPagePayload(payload))) {
			throw new WebUntisError("SESSION_EXPIRED", "WebUntis session expired while loading child timetable");
		}
		if (!response.ok) {
			throw new WebUntisError(
				"API_REQUEST",
				`WebUntis child timetable request failed (HTTP ${response.status}, linkedStudents=${linkedStudentCount})`,
			);
		}
		return payload;
	}

	private async getGuardianTimetableExams(
		session: WebUntisSession,
		token: string,
		startDate: number,
		endDate: number,
		studentId: number,
		studentName: string,
		tenantId: string | undefined,
		schoolYearId: number | undefined,
		linkedStudentCount: number | undefined,
	): Promise<unknown[]> {
		const dateString = (value: number): string => {
			const year = Math.floor(value / 10000);
			const month = Math.floor((value % 10000) / 100);
			const day = value % 100;
			return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		};
		const url = new URL(this.restUrl("/api/rest/view/v1/timetable/entries"));
		url.searchParams.set("start", dateString(startDate));
		url.searchParams.set("end", dateString(endDate));
		url.searchParams.set("format", "4");
		url.searchParams.set("resourceType", "STUDENT");
		url.searchParams.set("resources", String(studentId));
		url.searchParams.set("periodTypes", "");
		url.searchParams.set("timetableType", "MY_TIMETABLE");
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				Authorization: `Bearer ${token}`,
				cookie: this.restCookie(session),
				...(tenantId ? { "Tenant-Id": tenantId } : {}),
				...(schoolYearId ? { "X-Webuntis-Api-School-Year-Id": String(schoolYearId) } : {}),
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
		const contentType = response.headers.get("content-type") || "";
		this.onDiagnostic?.({
			method: "getGuardianTimetableExams",
			authContext: "bearer",
			personType: session.personType,
			childScope: "unique",
			linkedStudentCount,
			contextLoaded: true,
			tenantIdPresent: Boolean(tenantId),
			schoolYearIdPresent: Boolean(schoolYearId),
			status: response.status,
			contentType,
			url: redactUrl(response.url || url.href),
			redirected: response.redirected,
			length: body.length,
			type: getResponseType(body, contentType),
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
		});
		const context = `(auth=bearer, personType=${session.personType}, childScope=unique, linkedStudents=${linkedStudentCount ?? 0})`;
		if (response.status === 401 || response.redirected || (isRecord(payload) && isLoginPagePayload(payload))) {
			throw new WebUntisError("SESSION_EXPIRED", `WebUntis session expired while loading exams ${context}`);
		}
		if (!response.ok) {
			throw new WebUntisError(
				"API_REQUEST",
				`WebUntis guardian exams request failed (HTTP ${response.status}) after modern guardian route ${context}`,
			);
		}
		try {
			return normalizeGuardianTimetableExams(payload, studentId, studentName);
		} catch {
			this.onDiagnostic?.({
				method: "getGuardianTimetableExamsResponseShape",
				status: response.status,
				contentType,
				url: redactUrl(response.url || url.href),
				redirected: response.redirected,
				length: body.length,
				type: getResponseType(body, contentType),
				responseShape: payload === undefined ? "invalid-json" : guardianTimetableResponseShape(payload),
			});
			throw new WebUntisError(
				"INVALID_RESPONSE",
				`Invalid WebUntis guardian exams response after modern guardian route ${context}`,
			);
		}
	}

	private examScopeDetails(
		authContext: "cookie" | "bearer",
		session: WebUntisSession,
		childScope: WebUntisHttpDiagnostic["childScope"],
		linkedStudentCount: number | undefined,
	): string {
		return `auth=${authContext}, personType=${session.personType}, childScope=${childScope}${
			linkedStudentCount === undefined ? "" : `, linkedStudents=${linkedStudentCount}`
		}`;
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

	private async getRestToken(session: WebUntisSession, context: "message" | "exams" = "message"): Promise<string> {
		const url = this.restUrl("/api/token/new");
		const schoolCookies = [...new Set([`_${Buffer.from(this.schoolName).toString("base64")}`, this.schoolName])];
		for (let index = 0; index < schoolCookies.length; index++) {
			const schoolCookie = schoolCookies[index];
			const response = await this.fetchImpl(url, {
				method: "GET",
				signal: this.getRequestSignal(),
				headers: {
					accept: "application/json",
					cookie: this.restCookie(session, schoolCookie),
					...(context === "exams" && tenantIdFromCookie(this.sessionCookie)
						? { "Tenant-Id": tenantIdFromCookie(this.sessionCookie) }
						: {}),
				},
			});
			const cookie = mergeCookieHeader(this.sessionCookie, response.headers);
			this.sessionCookie = cookie.value;
			const body = await response.text();
			this.onDiagnostic?.({
				method: context === "exams" ? "getExamsToken" : "getMessageToken",
				...(context === "exams"
					? {
							authContext: "bearer" as const,
							personType: session.personType,
							childScope: session.personType === 5 ? ("self" as const) : ("unresolved" as const),
							tenantIdPresent: Boolean(tenantIdFromCookie(this.sessionCookie)),
						}
					: {}),
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
					`WebUntis ${context} authentication failed (${responseDetail})`,
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
					throw new WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${context} token response`);
				}
			}
			if (!token || token.startsWith("<")) {
				throw new WebUntisError("INVALID_RESPONSE", `Invalid WebUntis ${context} token response`);
			}
			this.messageSchoolCookie = schoolCookie;
			return token;
		}
		throw new WebUntisError("API_REQUEST", `WebUntis ${context} authentication failed`);
	}

	private async getParentExamContext(
		session: WebUntisSession,
		token: string,
		tenantId?: string,
	): Promise<ParentExamContext> {
		const url = this.restUrl("/api/rest/view/v1/app/data");
		const response = await this.fetchImpl(url, {
			method: "GET",
			signal: this.getRequestSignal(),
			headers: {
				accept: "application/json",
				Authorization: `Bearer ${token}`,
				cookie: this.restCookie(session),
				...(tenantId ? { "Tenant-Id": tenantId } : {}),
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
		const diagnosticBase: Pick<
			WebUntisHttpDiagnostic,
			| "method"
			| "authContext"
			| "personType"
			| "childScope"
			| "tenantIdPresent"
			| "contextLoaded"
			| "status"
			| "contentType"
			| "url"
			| "redirected"
			| "length"
			| "type"
			| "cookiePresent"
			| "cookieChanged"
			| "sessionCookieChanged"
		> = {
			method: "getExamContext",
			authContext: "bearer",
			personType: session.personType,
			childScope: "unresolved",
			tenantIdPresent: Boolean(tenantId),
			contextLoaded: false,
			status: response.status,
			contentType: response.headers.get("content-type") || "",
			url: redactUrl(response.url),
			redirected: response.redirected,
			length: body.length,
			type: getResponseType(body, response.headers.get("content-type") || ""),
			cookiePresent: Boolean(this.sessionCookie),
			cookieChanged: cookie.changed,
			sessionCookieChanged: cookie.sessionCookieChanged,
		};
		if (response.status === 401 || response.redirected || (isRecord(payload) && isLoginPagePayload(payload))) {
			this.onDiagnostic?.(diagnosticBase);
			throw new WebUntisError("SESSION_EXPIRED", "WebUntis parent exam context session expired");
		}
		if (!response.ok) {
			this.onDiagnostic?.(diagnosticBase);
			throw new WebUntisError(
				"API_REQUEST",
				`WebUntis parent exam context request failed (HTTP ${response.status}, auth=bearer, personType=${session.personType}, childScope=unresolved)`,
			);
		}
		let context: ParentExamContext;
		try {
			context = parseParentExamContext(payload);
		} catch {
			this.onDiagnostic?.(diagnosticBase);
			throw new WebUntisError(
				"INVALID_RESPONSE",
				`Invalid WebUntis parent exam context response (auth=bearer, personType=${session.personType}, childScope=unresolved)`,
			);
		}
		const childScope =
			context.students.length === 1 ? "unique" : context.students.length > 1 ? "ambiguous" : "unresolved";
		this.onDiagnostic?.({
			...diagnosticBase,
			childScope,
			linkedStudentCount: context.students.length,
			tenantIdPresent: Boolean(context.tenantId ?? tenantId),
			schoolYearIdPresent: Boolean(context.schoolYearId),
			contextLoaded: true,
		});
		return context;
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
