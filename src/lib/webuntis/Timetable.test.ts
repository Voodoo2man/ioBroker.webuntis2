import { expect } from "chai";
import {
	dateNumber,
	lessonChannelName,
	normalizeLesson,
	normalizeLessons,
	resolveTimetableReferences,
	splitTimetable,
	summarizeTimetable,
	weekRange,
	nextWeekday,
} from "./Timetable";

describe("WebUntis timetable normalization", () => {
	it("normalizes a complete period and preserves a stable source id", () => {
		const lesson = normalizeLesson({
			id: 42,
			date: 20260909,
			startTime: 800,
			endTime: 850,
			activityType: "Unterricht",
			kl: [{ id: 1, name: "10A", longname: "Klasse 10A" }],
			te: [{ id: 2, name: "Mu", longname: "Muster" }],
			su: [{ id: 3, name: "D", longname: "Deutsch" }],
			ro: [{ id: 4, name: "101", longname: "Raum 101" }],
			substText: "Vertretung",
		});
		expect(lesson).to.deep.include({
			id: "period-42",
			date: "2026-09-09",
			startTime: "08:00",
			endTime: "08:50",
			subject: "D",
			subjectLong: "Deutsch",
			teacher: "Mu",
			room: "101",
			class: "10A",
			changed: true,
			cancelled: false,
			substitution: "Vertretung",
		});
	});

	it("handles missing teacher and room without failing", () => {
		const lesson = normalizeLesson({ id: 7, date: 20260909, startTime: 900, endTime: 945, su: [] });
		expect(lesson.teacher).to.equal("");
		expect(lesson.room).to.equal("");
	});

	it("creates stable daily summary values and excludes cancelled duration", () => {
		const lessons = normalizeLessons([
			{
				id: 2,
				date: 20260909,
				startTime: 900,
				endTime: 945,
				su: [{ name: "Math", longname: "Mathematics" }],
				cancelled: true,
			},
			{
				id: 1,
				date: 20260909,
				startTime: 800,
				endTime: 850,
				su: [{ name: "D", longname: "Deutsch" }],
				substText: "Vertretung",
			},
		]);
		const summary = summarizeTimetable(lessons);
		expect(summary).to.deep.equal({
			hasSchool: true,
			lessonCount: 2,
			lessonDurationMinutes: 50,
			schoolStart: "08:00",
			schoolEnd: "09:45",
			subjects: "Deutsch, Mathematics",
			subjectCount: 2,
			firstSubject: "Deutsch",
			lastSubject: "Mathematics",
			hasChanges: true,
			changeCount: 2,
			cancellationCount: 1,
		});
	});

	it("uses defined defaults for a school-free day", () => {
		expect(summarizeTimetable([])).to.deep.equal({
			hasSchool: false,
			lessonCount: 0,
			lessonDurationMinutes: 0,
			schoolStart: "",
			schoolEnd: "",
			subjects: "",
			subjectCount: 0,
			firstSubject: "",
			lastSubject: "",
			hasChanges: false,
			changeCount: 0,
			cancellationCount: 0,
		});
	});

	it("builds a readable lesson channel name from resolved values", () => {
		const lesson = normalizeLesson({
			date: 20260909,
			startTime: 750,
			endTime: 835,
			su: [{ name: "Ma", longname: "Mathematics" }],
			te: [{ name: "Mü" }],
			ro: [{ name: "R204" }],
		});
		expect(lessonChannelName(lesson)).to.equal("07:50–08:35 · Mathematics · Mü · R204");
		expect(lessonChannelName({ ...lesson, teacher: "", room: "" })).to.equal("07:50–08:35 · Mathematics");
		expect(lessonChannelName({ ...lesson, subject: "", subjectLong: "", teacher: "", room: "" })).to.equal(
			"07:50–08:35",
		);
	});

	it("resolves timetable resource ids using master data", () => {
		const [period] = resolveTimetableReferences(
			[{ id: 1, kl: [{ id: 10 }], te: [{ id: 20 }], su: [{ id: 30 }], ro: [{ id: 40 }] }],
			{
				klassen: [{ id: 10, name: "5A", longname: "Klasse 5A" }],
				teachers: [{ id: 20, name: "MUE", longname: "Müller" }],
				subjects: [{ id: 30, name: "MA", longname: "Mathematik" }],
				rooms: [{ id: 40, name: "R204", longname: "Raum 204" }],
			},
		);
		expect(period.su).to.deep.equal([{ id: 30, name: "MA", longname: "Mathematik" }]);
		expect(period.te).to.deep.equal([{ id: 20, name: "MUE", longname: "Müller" }]);
		expect(period.ro).to.deep.equal([{ id: 40, name: "R204", longname: "Raum 204" }]);
	});

	it("uses a deterministic fallback id when the API has no period id", () => {
		const period = { date: 20260909, startTime: 800, endTime: 850, su: [{ name: "D" }], kl: [{ name: "10A" }] };
		expect(normalizeLesson(period).id).to.equal(normalizeLesson(period).id);
	});

	it("sorts periods and splits today and tomorrow from the week", () => {
		const today = new Date(2026, 8, 9);
		const lessons = normalizeLessons([
			{ id: 2, date: 20260910, startTime: 800, endTime: 850 },
			{ id: 1, date: 20260909, startTime: 800, endTime: 850 },
		]);
		const result = splitTimetable(lessons, today);
		expect(result.today).to.have.length(1);
		expect(result.tomorrow).to.have.length(1);
		expect(result.week[0].id).to.equal("period-1");
	});

	it("calculates the rolling seven-day range and next weekdays", () => {
		const range = weekRange(new Date(2026, 8, 9));
		expect(range).to.deep.equal({ startDate: 20260909, endDate: 20260915 });
		expect(weekRange(new Date(2026, 8, 15))).to.deep.equal({ startDate: 20260915, endDate: 20260921 });
		expect(nextWeekday(new Date(2026, 8, 15), 0)).to.deep.equal(new Date(2026, 8, 21, 12));
		expect(nextWeekday(new Date(2026, 8, 15), 1)).to.deep.equal(new Date(2026, 8, 15, 12));
		expect(dateNumber(new Date(2026, 8, 9))).to.equal(20260909);
	});
});
