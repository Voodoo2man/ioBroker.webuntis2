/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-jsdoc, jsdoc/require-param */

import { searchSchools } from "./SchoolDiscovery";
import { HolidayCache, summarizeHolidays, type HolidaySummary } from "./Holidays";
import { WebUntisClient } from "./WebUntisClient";
import { classifyWebUntisError, WebUntisError } from "./WebUntisErrors";
import { normalizeLessons, resolveTimetableReferences, splitTimetable, weekRange } from "./Timetable";
import type {
	ConnectionResult,
	SchoolSearchResult,
	WebUntisConnectionConfig,
	WebUntisHttpDiagnostic,
	WebUntisPeriod,
	WebUntisSession,
} from "./WebUntisTypes";
import type { TimetableMasterData } from "./Timetable";

const MASTERDATA_TTL_MS = 6 * 60 * 60 * 1000;

interface MasterDataCache {
	key: string;
	data: TimetableMasterData;
	fetchedAt: number;
	loading?: Promise<TimetableMasterData>;
}

/**
 *
 */
export class WebUntisService {
	private readonly holidayCache = new HolidayCache();
	private sessionClient?: WebUntisClient;
	private session?: WebUntisSession;
	private sessionKey?: string;
	private sessionLoading?: { key: string; promise: Promise<{ client: WebUntisClient; session: WebUntisSession }> };
	private masterDataCache?: MasterDataCache;

	public constructor(
		private readonly onDiagnostic?: (diagnostic: WebUntisHttpDiagnostic) => void,
		private readonly onInfo?: (message: string) => void,
		private readonly onWarning?: (message: string) => void,
		private readonly fetchImpl: typeof fetch = fetch,
		private readonly onDebug?: (message: string) => void,
	) {}
	/**
	 *
	 */
	public searchSchools(query: string): Promise<SchoolSearchResult[]> {
		return searchSchools(query);
	}

	public async loadTimetable(
		config: WebUntisConnectionConfig,
		now = new Date(),
	): Promise<ReturnType<typeof splitTimetable> & { holidays: HolidaySummary | null }> {
		if (!config.server || !config.schoolName || config.schoolId === null) {
			throw new WebUntisError("SCHOOL_NOT_SELECTED", "School selection is missing");
		}
		if (!config.username.trim()) {
			throw new WebUntisError("USERNAME_REQUIRED", "Username is missing");
		}
		if (!config.password) {
			throw new WebUntisError("PASSWORD_REQUIRED", "Password is missing");
		}
		try {
			return await this.loadTimetableWithSession(config, now);
		} catch (error) {
			if (!(error instanceof WebUntisError) || error.code !== "SESSION_EXPIRED") {
				throw error;
			}
			this.onDebug?.("WebUntis session expired; performing one diagnostic re-authentication");
			this.sessionClient = undefined;
			this.session = undefined;
			this.sessionKey = undefined;
			return this.loadTimetableWithSession(config, now);
		}
	}

	private async loadTimetableWithSession(
		config: WebUntisConnectionConfig,
		now: Date,
	): Promise<ReturnType<typeof splitTimetable> & { holidays: HolidaySummary | null }> {
		const { client, session } = await this.getSession(config);
		let holidayEntries: Awaited<ReturnType<HolidayCache["get"]>> = null;
		try {
			holidayEntries = await this.holidayCache.get(now, async () => {
				const entries = await client.getHolidays(session);
				this.onInfo?.(`Holidays loaded: ${entries.length} entries`);
				return entries;
			});
		} catch (error) {
			if (error instanceof WebUntisError && error.code === "SESSION_EXPIRED") {
				throw error;
			}
			// Holiday failures are optional; preserve existing holiday states.
		}
		const holidays = holidayEntries ? summarizeHolidays(holidayEntries, now) : null;
		const range = weekRange(now);
		const classId = session.personType >= 1 && session.personType <= 5 ? null : await client.getClassId(session);
		const supportedPerson =
			session.personType >= 1 && session.personType <= 5 ? null : await client.getSupportedPerson(session);
		const element =
			session.personType >= 1 && session.personType <= 5
				? { id: session.personId, type: session.personType }
				: supportedPerson
					? supportedPerson
					: (classId ?? session.klasseId) > 0
						? { id: classId ?? session.klasseId, type: 1 }
						: null;
		if (!element) {
			const periods = await client.getPublicTimetable(session, now);
			return { ...splitTimetable(normalizeLessons(periods), now), holidays };
		}
		const periods: WebUntisPeriod[] = await client.getTimetable(session, {
			...range,
			element,
			onlyBaseTimetable: false,
			showBooking: true,
			showInfo: true,
			showSubstText: true,
			showLsText: true,
			showLsNumber: true,
			showStudentgroup: true,
		});
		const { subjects, teachers, rooms, klassen } = await this.getMasterData(
			client,
			session,
			this.configKey(config),
			now,
		);
		return {
			...splitTimetable(
				normalizeLessons(resolveTimetableReferences(periods, { subjects, teachers, rooms, klassen })),
				now,
			),
			holidays,
		};
	}

	private configKey(config: WebUntisConnectionConfig): string {
		return [config.server, config.schoolName, config.username, config.password].join("\u0000");
	}

	private async getSession(
		config: WebUntisConnectionConfig,
	): Promise<{ client: WebUntisClient; session: WebUntisSession }> {
		const key = this.configKey(config);
		if (this.sessionClient && this.session && this.sessionKey === key) {
			return { client: this.sessionClient, session: this.session };
		}
		if (this.sessionLoading?.key === key) {
			return this.sessionLoading.promise;
		}
		const client = new WebUntisClient(config, this.fetchImpl, undefined, this.onDiagnostic);
		const promise = client.authenticate(config.username, config.password).then(session => {
			this.sessionClient = client;
			this.session = session;
			this.sessionKey = key;
			this.onInfo?.("WebUntis login successful");
			return { client, session };
		});
		this.sessionLoading = { key, promise };
		void promise.then(
			() => {
				if (this.sessionLoading?.promise === promise) {
					this.sessionLoading = undefined;
				}
			},
			() => {
				if (this.sessionLoading?.promise === promise) {
					this.sessionLoading = undefined;
				}
			},
		);
		return promise;
	}

	private async getMasterData(
		client: WebUntisClient,
		session: WebUntisSession,
		key: string,
		now: Date,
	): Promise<TimetableMasterData> {
		const current = this.masterDataCache;
		if (current?.key === key && current.fetchedAt > 0 && now.getTime() - current.fetchedAt < MASTERDATA_TTL_MS) {
			return current.data;
		}
		if (current?.key === key && current.loading) {
			return current.loading;
		}
		const cache: MasterDataCache = {
			key,
			data: current?.key === key ? current.data : { subjects: [], teachers: [], rooms: [], klassen: [] },
			fetchedAt: current?.key === key ? current.fetchedAt : 0,
		};
		this.masterDataCache = cache;
		const loading = this.refreshMasterData(client, session, cache, now);
		cache.loading = loading;
		void loading.then(
			() => {
				if (cache.loading === loading) {
					cache.loading = undefined;
				}
			},
			() => {
				if (cache.loading === loading) {
					cache.loading = undefined;
				}
			},
		);
		return loading;
	}

	private async refreshMasterData(
		client: WebUntisClient,
		session: WebUntisSession,
		cache: MasterDataCache,
		now: Date,
	): Promise<TimetableMasterData> {
		const results = await Promise.allSettled([
			client.getSubjects(session),
			client.getTeachers(session),
			client.getRooms(session),
			client.getKlassen(session),
		]);
		const failed = results.some(result => result.status === "rejected");
		if (failed && cache.fetchedAt > 0) {
			this.onWarning?.("Master data refresh failed; existing master data is being reused");
			return cache.data;
		}
		const data: TimetableMasterData = {
			subjects: results[0].status === "fulfilled" ? results[0].value : [],
			teachers: results[1].status === "fulfilled" ? results[1].value : [],
			rooms: results[2].status === "fulfilled" ? results[2].value : [],
			klassen: results[3].status === "fulfilled" ? results[3].value : [],
		};
		cache.data = data;
		cache.fetchedAt = now.getTime();
		if (failed) {
			this.onWarning?.("Some master data could not be loaded; unavailable lookups remain empty");
		} else {
			this.onInfo?.(
				`Master data loaded: ${data.subjects.length} subjects, ${data.teachers.length} teachers, ${data.rooms.length} rooms, ${data.klassen.length} classes`,
			);
		}
		return data;
	}

	/**
	 *
	 */
	public async testConnection(config: WebUntisConnectionConfig): Promise<ConnectionResult> {
		if (!config.server || !config.schoolName || config.schoolId === null) {
			return { ok: false, code: "SCHOOL_NOT_SELECTED" };
		}
		if (!config.username.trim()) {
			return { ok: false, code: "USERNAME_REQUIRED" };
		}
		if (!config.password) {
			return { ok: false, code: "PASSWORD_REQUIRED" };
		}
		try {
			await new WebUntisClient(config, this.fetchImpl, undefined, this.onDiagnostic).authenticate(
				config.username,
				config.password,
			);
			return { ok: true };
		} catch (error) {
			return { ok: false, code: classifyWebUntisError(error) };
		}
	}
}

export { WebUntisError };
export type * from "./WebUntisTypes";
