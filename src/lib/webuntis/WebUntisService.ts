/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-jsdoc, jsdoc/require-param */

import { searchSchools } from "./SchoolDiscovery";
import { WebUntisClient } from "./WebUntisClient";
import { classifyWebUntisError, WebUntisError } from "./WebUntisErrors";
import { normalizeLessons, resolveTimetableReferences, splitTimetable, weekRange } from "./Timetable";
import type {
	ConnectionResult,
	SchoolSearchResult,
	WebUntisConnectionConfig,
	WebUntisHttpDiagnostic,
	WebUntisPeriod,
} from "./WebUntisTypes";

/**
 *
 */
export class WebUntisService {
	public constructor(private readonly onDiagnostic?: (diagnostic: WebUntisHttpDiagnostic) => void) {}
	/**
	 *
	 */
	public searchSchools(query: string): Promise<SchoolSearchResult[]> {
		return searchSchools(query);
	}

	public async loadTimetable(
		config: WebUntisConnectionConfig,
		now = new Date(),
	): Promise<ReturnType<typeof splitTimetable>> {
		if (!config.server || !config.schoolName || config.schoolId === null) {
			throw new WebUntisError("SCHOOL_NOT_SELECTED", "School selection is missing");
		}
		if (!config.username.trim()) {
			throw new WebUntisError("USERNAME_REQUIRED", "Username is missing");
		}
		if (!config.password) {
			throw new WebUntisError("PASSWORD_REQUIRED", "Password is missing");
		}
		const client = new WebUntisClient(config, fetch, undefined, this.onDiagnostic);
		const session = await client.authenticate(config.username, config.password);
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
			return splitTimetable(normalizeLessons(periods), now);
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
		const [subjects, teachers, rooms, klassen] = await Promise.all([
			client.getSubjects(session).catch(() => []),
			client.getTeachers(session).catch(() => []),
			client.getRooms(session).catch(() => []),
			client.getKlassen(session).catch(() => []),
		]);
		return splitTimetable(
			normalizeLessons(resolveTimetableReferences(periods, { subjects, teachers, rooms, klassen })),
			now,
		);
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
			await new WebUntisClient(config, fetch, undefined, this.onDiagnostic).authenticate(
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
