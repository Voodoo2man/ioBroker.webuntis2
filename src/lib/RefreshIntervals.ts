export const DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES = 5;
export const DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES = 1;

const MILLISECONDS_PER_MINUTE = 60_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;
export const MAX_REFRESH_INTERVAL_MINUTES = Math.floor(MAX_TIMEOUT_DELAY_MS / MILLISECONDS_PER_MINUTE);
export const MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES = 6 * 24 * 60;

/**
 * Converts configured minimum-safe refresh minutes to milliseconds, falling back for legacy values.
 *
 * @param value - Configured interval value.
 * @param defaultMinutes - Minimum accepted interval and fallback value.
 * @param maximumMinutes - Maximum accepted interval value.
 */
export function getRefreshIntervalMs(
	value: unknown,
	defaultMinutes: number,
	maximumMinutes = MAX_REFRESH_INTERVAL_MINUTES,
): number {
	const minutes =
		typeof value === "number" && Number.isSafeInteger(value) && value >= defaultMinutes && value <= maximumMinutes
			? value
			: defaultMinutes;
	return minutes * MILLISECONDS_PER_MINUTE;
}
