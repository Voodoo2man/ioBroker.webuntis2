import { expect } from "chai";
import {
	DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES,
	DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES,
	getRefreshIntervalMs,
	MAX_REFRESH_INTERVAL_MINUTES,
	MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
} from "./RefreshIntervals";

describe("refresh interval settings", () => {
	it("converts configured integer minutes to milliseconds", () => {
		expect(getRefreshIntervalMs(5, DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES)).to.equal(5 * 60_000);
		expect(getRefreshIntervalMs(12, DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES)).to.equal(12 * 60_000);
		expect(getRefreshIntervalMs(4, DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES)).to.equal(5 * 60_000);
		expect(getRefreshIntervalMs(1, DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES)).to.equal(60_000);
		expect(getRefreshIntervalMs(3, DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES)).to.equal(3 * 60_000);
		expect(getRefreshIntervalMs(0, DEFAULT_CURRENT_NEXT_REFRESH_INTERVAL_MINUTES)).to.equal(60_000);
		expect(getRefreshIntervalMs(MAX_REFRESH_INTERVAL_MINUTES, 5)).to.equal(MAX_REFRESH_INTERVAL_MINUTES * 60_000);
		expect(
			getRefreshIntervalMs(
				MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
				DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES,
				MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
			),
		).to.equal(MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES * 60_000);
	});

	it("falls back to the default when the full refresh interval exceeds six days", () => {
		expect(
			getRefreshIntervalMs(
				MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES + 1,
				DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES,
				MAX_TIMETABLE_REFRESH_INTERVAL_MINUTES,
			),
		).to.equal(DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES * 60_000);
	});

	it("uses the existing default for missing or invalid values", () => {
		const invalidValues: unknown[] = [
			undefined,
			null,
			"",
			"5",
			0,
			-1,
			1.5,
			NaN,
			Infinity,
			MAX_REFRESH_INTERVAL_MINUTES + 1,
		];

		for (const value of invalidValues) {
			expect(getRefreshIntervalMs(value, DEFAULT_TIMETABLE_REFRESH_INTERVAL_MINUTES)).to.equal(5 * 60_000);
		}
	});
});
