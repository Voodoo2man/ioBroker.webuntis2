import { expect } from "chai";
import {
	needsNameMigration,
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
	});

	it("translates dynamic timetable and weekday names", () => {
		expect(translatedTimetableGroup("tomorrow").de).to.equal("Stundenplan morgen");
		expect(translatedWeekday("monday")["zh-cn"]).to.equal("星期一");
		expect(translatedLessonFallback("03").fr).to.equal("Cours 03");
		expect(translatedStateName("Teacher").de).to.equal("Lehrkraft");
		expect(translatedStateName("Start date (Unix timestamp ms)").de).to.equal("Startdatum (Unix-Zeitstempel ms)");
		expect(translatedStateName("End date (Unix timestamp ms)").de).to.equal("Enddatum (Unix-Zeitstempel ms)");
	});

	it("migrates only the old default name and preserves custom names", () => {
		expect(needsNameMigration("Lesson count", "Lesson count")).to.equal(true);
		expect(needsNameMigration("My custom label", "Lesson count")).to.equal(false);
		expect(needsNameMigration({ en: "Lesson count" }, "Lesson count")).to.equal(false);
	});
});
