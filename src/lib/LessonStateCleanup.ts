/**
 * Remove optional lesson states that were present in an earlier update but are
 * missing from the current lesson.
 *
 * @param base Lesson state base path.
 * @param values Current lesson values.
 * @param getObject Reads an existing object.
 * @param deleteObject Deletes an existing object.
 */
export async function removeStaleLessonStates(
	base: string,
	values: Readonly<Record<string, unknown>>,
	getObject: (id: string) => Promise<unknown>,
	deleteObject: (id: string) => Promise<unknown>,
): Promise<void> {
	const optional = ["lessonId", "periodId", "substitution", "originalTeacher", "originalRoom", "originalSubject"];
	for (const name of optional) {
		if (!(name in values) && (await getObject(`${base}.${name}`))) {
			await deleteObject(`${base}.${name}`);
		}
	}
}
