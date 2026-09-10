import { expect } from "chai";
import { HolidayCache, normalizeHolidayEntries, summarizeHolidays } from "./Holidays";

const holiday = (
	startDate: number,
	endDate: number,
	name = "Break",
	longName = "Long break",
): { id: number; name: string; longName: string; startDate: number; endDate: number } => ({
	id: startDate,
	name,
	longName,
	startDate,
	endDate,
});

describe("WebUntis holidays", () => {
	it("returns empty current and next values when there are no holidays", () => {
		const result = summarizeHolidays([], new Date(2026, 8, 11, 23));
		expect(result.current).to.deep.equal({ active: false, name: "", longName: "", startDate: "", endDate: "" });
		expect(result.next).to.deep.equal({ daysUntil: 0, name: "", longName: "", startDate: "", endDate: "" });
	});

	it("treats the first and last holiday day as active", () => {
		const entries = normalizeHolidayEntries([holiday(20260910, 20260912)]);
		expect(summarizeHolidays(entries, new Date(2026, 8, 10)).current.active).to.equal(true);
		expect(summarizeHolidays(entries, new Date(2026, 8, 12)).current.active).to.equal(true);
		expect(summarizeHolidays(entries, new Date(2026, 8, 13)).current.active).to.equal(false);
	});

	it("selects the next holiday from unsorted future entries", () => {
		const entries = normalizeHolidayEntries([
			holiday(20261220, 20261231, "Later"),
			holiday(20261005, 20261016, "Soon"),
		]);
		expect(summarizeHolidays(entries, new Date(2026, 8, 10)).next).to.deep.equal({
			name: "Soon",
			longName: "Long break",
			startDate: "2026-10-05",
			endDate: "2026-10-16",
			daysUntil: 25,
		});
	});

	it("falls back from empty longName to name", () => {
		const entries = normalizeHolidayEntries([holiday(20260910, 20260912, "Break", "")]);
		expect(summarizeHolidays(entries, new Date(2026, 8, 10)).current.longName).to.equal("Break");
	});

	it("uses calendar days across DST changes", () => {
		const entries = normalizeHolidayEntries([holiday(20260406, 20260410)]);
		expect(summarizeHolidays(entries, new Date(2026, 2, 27)).next.daysUntil).to.equal(10);
	});

	it("does not select an entry that starts today as next", () => {
		const entries = normalizeHolidayEntries([holiday(20260911, 20260912)]);
		expect(summarizeHolidays(entries, new Date(2026, 8, 11)).next.daysUntil).to.equal(0);
	});

	it("caches successful results and refreshes after expiry", async () => {
		const cache = new HolidayCache(60_000);
		let calls = 0;
		const loader = (): Promise<ReturnType<typeof holiday>[]> => {
			calls += 1;
			return Promise.resolve([holiday(20261005, 20261016)]);
		};
		await cache.get(new Date(2026, 8, 10), loader);
		await cache.get(new Date(2026, 8, 10, 0, 0, 30), loader);
		await cache.get(new Date(2026, 8, 10, 1), loader);
		expect(calls).to.equal(2);
	});

	it("rejects a failed refresh so the caller can preserve existing states", async () => {
		const cache = new HolidayCache(0);
		const entries = [holiday(20261005, 20261016)];
		await cache.get(new Date(2026, 8, 10), () => Promise.resolve(entries));
		let failed = false;
		try {
			await cache.get(new Date(2026, 8, 11), () => Promise.reject(new Error("temporary failure")));
		} catch {
			failed = true;
		}
		expect(failed).to.equal(true);
	});
});
