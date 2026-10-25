import { expect } from "chai";
import {
	hasObjectValueChanged,
	isGeneratedLessonName,
	needsNameMigration,
	shouldMigrateDynamicName,
	SUPPORTED_LANGUAGES,
	translatedLessonFallback,
	translatedName,
	translatedStateName,
	translatedTimetableGroup,
	translatedWeekday,
} from "./ObjectTranslations";

describe("object translations", () => {
	it("provides every supported language with an English fallback", () => {
		const name = translatedName("lessonCount");
		expect(SUPPORTED_LANGUAGES).to.have.length(11);
		for (const language of SUPPORTED_LANGUAGES) {
			expect(name[language]).to.be.a("string");
		}
		expect(name.en).to.equal("Lesson count");
		expect(translatedName("hasSchool").de).to.equal("Hat Schule");
		for (const key of ["exams", "upcomingExamCount", "upcomingExams", "upcomingExamsText"] as const) {
			const translated = translatedName(key);
			for (const language of SUPPORTED_LANGUAGES) {
				expect(translated[language]).to.be.a("string");
			}
		}
		expect(translatedName("upcomingExamCount").de).to.equal("Anzahl bevorstehender Prüfungen");
		expect(translatedStateName("Exam ID").de).to.equal("Prüfungs-ID");
		expect(translatedStateName("Exam start time").de).to.equal("Prüfungsbeginn");
		for (const label of [
			"Content",
			"Content is preview",
			"Date and time",
			"Has attachments",
			"Message ID",
			"Read",
			"Read in WebUntis",
			"Sender",
			"Subject",
		]) {
			const translated = translatedStateName(label);
			for (const language of SUPPORTED_LANGUAGES) {
				expect(translated[language], `${label} (${language})`).to.be.a("string").and.not.empty;
			}
		}
		expect(translatedStateName("Content").de).to.equal("Inhalt");
		expect(translatedName("refresh").de).to.equal("Jetzt aktualisieren");
	});

	it("translates dynamic timetable and weekday names", () => {
		expect(translatedTimetableGroup("tomorrow").de).to.equal("Stundenplan morgen");
		expect(translatedWeekday("monday")["zh-cn"]).to.equal("星期一");
		expect(translatedLessonFallback("03").fr).to.equal("Cours 03");
		expect(translatedStateName("Teacher").de).to.equal("Lehrkraft");
		expect(translatedStateName("Lesson comparison (JSON)").de).to.equal("Stundenplanvergleich (JSON)");
	});

	it("migrates only the old default name and preserves custom names", () => {
		expect(needsNameMigration("Lesson count", "Lesson count")).to.equal(true);
		expect(needsNameMigration("My custom label", "Lesson count")).to.equal(false);
		expect(needsNameMigration({ en: "Lesson count" }, "Lesson count")).to.equal(true);
		expect(needsNameMigration({ en: "My custom label" }, "Lesson count")).to.equal(false);
		expect(isGeneratedLessonName("08:00–08:45 · Mathematics · Miller · R101")).to.equal(true);
		expect(isGeneratedLessonName("My custom lesson name")).to.equal(false);
		expect(shouldMigrateDynamicName("08:00–08:45 · Mathematics", "08:00–08:45 · Mathematics")).to.equal(true);
		expect(shouldMigrateDynamicName("08:00–08:45 · Mathematics", "My custom label")).to.equal(false);
		expect(shouldMigrateDynamicName("08:00–08:45 · Mathematics")).to.equal(true);
		expect(hasObjectValueChanged({ en: "Lesson" }, { en: "Lesson" })).to.equal(false);
		expect(hasObjectValueChanged({ en: "Lesson" }, { en: "Updated lesson" })).to.equal(true);
	});
});
