# Changelog

## Unreleased

- Renamed the adapter and repository to `ioBroker.webuntis2`.
- Added functional WebUntis timetable, daily summaries, holidays, and dynamic current/next lesson states.
- Added resolved subject, teacher, room, and class names to timetable lessons.
- Added the React administration interface with school discovery, configuration persistence, and connection testing.
- Removed unsupported Messages and Exams object areas and cleanly migrates existing installations.

## 0.1.0 - 2026-09-11

- First complete feature release with timetable data, holidays, readable lesson names, daily summaries, current/next lesson states, and the React administration interface.

## 0.0.1 - 2026-09-09

- WebUntis-Schulsuche über `schoolquery2` mit Treffer-Auswahl im React-Admin.
- Username-/Passwort-Verbindungstest mit klassifizierten Fehlern und `info.connection`.
- Phase-1-Grundlage für weitere WebUntis-Datenpunkte; Stundenplan-States sind noch nicht enthalten.
