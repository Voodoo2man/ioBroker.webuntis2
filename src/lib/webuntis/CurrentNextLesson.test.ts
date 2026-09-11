import { expect } from "chai";
import { deriveCurrentNextLesson } from "./CurrentNextLesson";
import { lessonChannelName, type TimetableLesson } from "./Timetable";

function lesson(startTime: string, endTime: string, changes: Partial<TimetableLesson> = {}): TimetableLesson {
	return {
		id: `${startTime}-${endTime}`,
		date: "2026-09-11",
		startTime,
		endTime,
		subject: "MA",
		subjectLong: "Mathematics",
		teacher: "Müller",
		room: "R204",
		class: "5A",
		lessonId: 1,
		periodId: 1,
		status: "Unterricht",
		changed: false,
		cancelled: false,
		substitution: "",
		originalTeacher: "",
		originalRoom: "",
		originalSubject: "",
		...changes,
	};
}

const at = (time: string): Date => new Date(`2026-09-11T${time}${time.length === 5 ? ":00" : ""}`);

describe("Current and next lesson states", () => {
	const lessons = [
		lesson("07:50", "08:35"),
		lesson("08:40", "09:25", { id: "second" }),
		lesson("09:30", "10:15", { id: "third" }),
	];

	it("returns the first lesson before school and rounds remaining minutes up", () => {
		const result = deriveCurrentNextLesson(lessons, at("07:30"));
		expect(result.currentLesson).to.equal("");
		expect(result.nextLesson).to.equal(lessonChannelName(lessons[0]));
		expect(result.nextLessonStart).to.equal("07:50");
		expect(result.minutesUntilNextLesson).to.equal(20);
		expect(result.schoolRunning).to.equal(false);
	});

	it("includes the lesson at its exact start and exposes the next lesson simultaneously", () => {
		const result = deriveCurrentNextLesson(lessons, at("07:50"));
		expect(result.currentLesson).to.equal(lessonChannelName(lessons[0]));
		expect(result.currentSubject).to.equal("Mathematics");
		expect(result.currentRoom).to.equal("R204");
		expect(result.currentTeacher).to.equal("Müller");
		expect(result.nextLesson).to.equal(lessonChannelName(lessons[1]));
		expect(result.schoolRunning).to.equal(true);
	});

	it("does not count the exact end as current and finds the next lesson", () => {
		const result = deriveCurrentNextLesson(lessons, at("08:35"));
		expect(result.currentLesson).to.equal("");
		expect(result.nextLessonStart).to.equal("08:40");
		expect(result.minutesUntilNextLesson).to.equal(5);
		expect(result.schoolRunning).to.equal(true);
	});

	it("keeps schoolRunning true during a break and rounds seconds upward", () => {
		const result = deriveCurrentNextLesson(lessons, at("08:37:20"));
		expect(result.currentLesson).to.equal("");
		expect(result.nextLesson).to.equal(lessonChannelName(lessons[1]));
		expect(result.minutesUntilNextLesson).to.equal(3);
		expect(result.minutesUntilSchoolEnd).to.equal(98);
	});

	it("ends school at the exact end of the last active lesson", () => {
		const result = deriveCurrentNextLesson(lessons, at("10:15"));
		expect(result.nextLesson).to.equal("");
		expect(result.schoolRunning).to.equal(false);
		expect(result.minutesUntilSchoolEnd).to.equal(0);
	});

	it("skips cancelled lessons for current, next, and school end", () => {
		const result = deriveCurrentNextLesson(
			[
				lesson("07:50", "08:35", { cancelled: true }),
				lesson("08:40", "09:25", { id: "active" }),
				lesson("10:00", "11:00", { id: "cancelled", cancelled: true }),
			],
			at("08:00"),
		);
		expect(result.currentLesson).to.equal("");
		expect(result.nextLessonStart).to.equal("08:40");
		expect(result.minutesUntilSchoolEnd).to.equal(0);
	});

	it("uses subjectLong first and falls back to subject", () => {
		const result = deriveCurrentNextLesson(
			[lesson("08:00", "09:00", { subjectLong: "", subject: "MA" })],
			at("08:15"),
		);
		expect(result.currentSubject).to.equal("MA");
	});

	it("returns defined empty values for no lessons, all cancelled lessons, and another date", () => {
		for (const input of [
			[],
			[lesson("08:00", "09:00", { cancelled: true })],
			[lesson("08:00", "09:00", { date: "2026-09-10" })],
		]) {
			const result = deriveCurrentNextLesson(input, at("08:15"));
			expect(result).to.deep.equal({
				currentLesson: "",
				currentSubject: "",
				currentRoom: "",
				currentTeacher: "",
				nextLesson: "",
				nextSubject: "",
				nextRoom: "",
				nextTeacher: "",
				nextLessonStart: "",
				minutesUntilNextLesson: 0,
				schoolRunning: false,
				minutesUntilSchoolEnd: 0,
			});
		}
	});

	it("does not perform any network operation because it only derives local values", () => {
		const requests = 0;
		const result = deriveCurrentNextLesson(lessons, at("08:15"));
		expect(result.currentLesson).to.not.equal("");
		expect(requests).to.equal(0);
	});
});
