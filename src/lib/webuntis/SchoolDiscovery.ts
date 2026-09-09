/* eslint-disable jsdoc/no-blank-blocks, jsdoc/require-param */

import { WebUntisError } from "./WebUntisErrors";
import type { SchoolSearchResponse, SchoolSearchResult, WebUntisSchoolConfig } from "./WebUntisTypes";

const SEARCH_URL = "https://mobile.webuntis.com/ms/schoolquery2";
const REQUEST_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new WebUntisError("INVALID_RESPONSE", `Missing school field: ${field}`);
	}
	return value;
}

function mapSchool(value: unknown): SchoolSearchResult {
	if (!isRecord(value)) {
		throw new WebUntisError("INVALID_RESPONSE", "Invalid school search result");
	}
	if (typeof value.schoolId !== "number") {
		throw new WebUntisError("INVALID_RESPONSE", "Missing school field: schoolId");
	}
	return {
		displayName: asString(value.displayName, "displayName"),
		address: asString(value.address, "address"),
		loginName: asString(value.loginName, "loginName"),
		schoolId: value.schoolId,
		server: asString(value.server, "server"),
		serverUrl: asString(value.serverUrl, "serverUrl"),
		mobileServiceUrl: value.mobileServiceUrl === null ? null : asString(value.mobileServiceUrl, "mobileServiceUrl"),
	};
}

function isSchoolSearchResponse(value: unknown): value is SchoolSearchResponse {
	return isRecord(value) && typeof value.size === "number" && Array.isArray(value.schools);
}

/**
 *
 */
export async function searchSchools(query: string, fetchImpl: typeof fetch = fetch): Promise<SchoolSearchResult[]> {
	const normalizedQuery = query.trim();
	if (normalizedQuery.length < 2) {
		return [];
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetchImpl(SEARCH_URL, {
			method: "POST",
			headers: { "content-type": "application/json", accept: "application/json" },
			body: JSON.stringify({
				id: Date.now().toString(),
				method: "searchSchool",
				params: [{ schoolid: 0, search: normalizedQuery }],
				jsonrpc: "2.0",
			}),
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new WebUntisError("SERVER_UNREACHABLE", `School search HTTP ${response.status}`);
		}
		const payload: unknown = await response.json();
		if (isRecord(payload) && isRecord(payload.error) && payload.error.code === -6003) {
			return [];
		}
		if (!isRecord(payload) || !isSchoolSearchResponse(payload.result)) {
			throw new WebUntisError("INVALID_RESPONSE", "Invalid school search response");
		}
		return payload.result.schools.map(mapSchool);
	} catch (error) {
		if (error instanceof WebUntisError) {
			throw error;
		}
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new WebUntisError("TIMEOUT", "School search timed out");
		}
		throw new WebUntisError("SERVER_UNREACHABLE", "School search failed", { cause: error });
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Sorts search results by their match with the entered free-text query.
 */
export function rankSchoolResults(results: SchoolSearchResult[], query: string): SchoolSearchResult[] {
	const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const collator = new Intl.Collator("de", { sensitivity: "base" });

	const score = (school: SchoolSearchResult): number => {
		const fields = [school.displayName, school.address, school.loginName, school.server].map(value =>
			value.toLocaleLowerCase(),
		);
		return tokens.reduce((total, token) => {
			if (fields.some(field => field === token)) {
				return total + 100;
			}
			if (fields.some(field => field.startsWith(token))) {
				return total + 20;
			}
			if (fields.some(field => field.includes(token))) {
				return total + 10;
			}
			return total;
		}, 0);
	};

	return [...results].sort((left, right) => {
		const scoreDifference = score(right) - score(left);
		return scoreDifference || collator.compare(left.displayName, right.displayName);
	});
}

/**
 * Converts one search result into the native school configuration fields.
 */
export function schoolResultToConfig(school: SchoolSearchResult): WebUntisSchoolConfig {
	return {
		server: school.serverUrl,
		schoolName: school.loginName,
		schoolDisplayName: school.displayName,
		schoolAddress: school.address,
		schoolId: school.schoolId,
	};
}

/**
 * Replaces the selected school atomically while preserving credentials and other native values.
 */
export function mergeSchoolSelection(
	native: Record<string, unknown>,
	school: SchoolSearchResult,
): Record<string, unknown> {
	return { ...native, ...schoolResultToConfig(school) };
}
