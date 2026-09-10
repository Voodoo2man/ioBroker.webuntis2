/* eslint-disable jsdoc/require-jsdoc */

import { lessonChannelName, type TimetableLesson } from "./Timetable";

export interface CurrentNextLessonSummary {
	currentLesson: string;
	currentSubject: string;
	currentRoom: string;
	currentTeacher: string;
	nextLesson: string;
	nextSubject: string;
	nextRoom: string;
	nextTeacher: string;
	nextLessonStart: string;
	minutesUntilNextLesson: number;
	schoolRunning: boolean;
	minutesUntilSchoolEnd: number;
}

const EMPTY_SUMMARY: CurrentNextLessonSummary = {
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
};

interface TimedLesson {
	lesson: TimetableLesson;
	start: number;
	end: number;
}

function localDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function lessonTime(date: Date, time: string): number | null {
	const match = /^(\d{2}):(\d{2})$/.exec(time);
	if (!match) {
		return null;
	}
	const result = new Date(date);
	result.setHours(Number(match[1]), Number(match[2]), 0, 0);
	return Number.isNaN(result.getTime()) ? null : result.getTime();
}

function details(
	lesson: TimetableLesson,
): Pick<CurrentNextLessonSummary, "currentLesson" | "currentSubject" | "currentRoom" | "currentTeacher"> {
	return {
		currentLesson: lessonChannelName(lesson),
		currentSubject: lesson.subjectLong || lesson.subject || "",
		currentRoom: lesson.room || "",
		currentTeacher: lesson.teacher || "",
	};
}

function nextDetails(
	lesson: TimetableLesson,
): Pick<CurrentNextLessonSummary, "nextLesson" | "nextSubject" | "nextRoom" | "nextTeacher" | "nextLessonStart"> {
	return {
		nextLesson: lessonChannelName(lesson),
		nextSubject: lesson.subjectLong || lesson.subject || "",
		nextRoom: lesson.room || "",
		nextTeacher: lesson.teacher || "",
		nextLessonStart: lesson.startTime || "",
	};
}

export function deriveCurrentNextLesson(lessons: TimetableLesson[], now: Date): CurrentNextLessonSummary {
	const nowMs = now.getTime();
	const activeLessons: TimedLesson[] = lessons
		.filter(lesson => lesson.date === localDate(now) && !lesson.cancelled)
		.flatMap(lesson => {
			const start = lessonTime(now, lesson.startTime);
			const end = lessonTime(now, lesson.endTime);
			return start === null || end === null ? [] : [{ lesson, start, end }];
		})
		.sort((a, b) => a.start - b.start || a.end - b.end || a.lesson.id.localeCompare(b.lesson.id));

	if (!activeLessons.length) {
		return { ...EMPTY_SUMMARY };
	}

	const current = activeLessons.find(item => item.start <= nowMs && nowMs < item.end);
	const next = activeLessons.find(item => item.start > nowMs);
	const first = activeLessons[0];
	const last = activeLessons.at(-1)!;
	const schoolRunning = nowMs >= first.start && nowMs < last.end;

	return {
		...EMPTY_SUMMARY,
		...(current ? details(current.lesson) : {}),
		...(next
			? {
					...nextDetails(next.lesson),
					minutesUntilNextLesson: Math.ceil((next.start - nowMs) / 60000),
				}
			: {}),
		schoolRunning,
		minutesUntilSchoolEnd: schoolRunning ? Math.ceil((last.end - nowMs) / 60000) : 0,
	};
}
