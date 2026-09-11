**WORK IN PROGRESS**

![Logo](admin/webuntis.png)

# ioBroker.webuntis2

[![NPM version](https://img.shields.io/npm/v/iobroker.webuntis2.svg)](https://www.npmjs.com/package/iobroker.webuntis2)
<!-- [![Downloads](https://img.shields.io/npm/dm/iobroker.webuntis2.svg)](https://www.npmjs.com/package/iobroker.webuntis2) -->
<!-- ![Test and Release](https://github.com/Voodoo2man/ioBroker.webuntis2/actions/workflows/test-and-release.yml/badge.svg) -->

ioBroker adapter for WebUntis. The adapter discovers schools automatically,
tests the login, and provides the timetable for today, tomorrow, and the
current week as ioBroker states.

## Features

- Search for schools by name, city, or address
- Select a specific result when multiple schools are found
- Log in with a WebUntis username and password
- Test the connection directly in the adapter configuration
- Timetables for today, tomorrow, and Monday through Sunday of the current week
- Lesson data such as subject, teacher, room, class, time, and status
- Detection of changes, substitutions, and cancellations
- Daily summaries with lesson counts, times, subjects, and change counters
- Updates every five minutes by default
- Dynamic current/next lesson information below `timetable.today`, including
  minutes until the next lesson and whether school is currently running

Exams, homework, and other WebUntis data areas are not implemented yet.

## Setup

1. Install the adapter and open a new `webuntis2` instance.
2. In the “School” section, enter at least two characters and start the search.
3. Select the desired school from the results.
4. Enter the WebUntis username and password.
5. Run “Test connection” and save the configuration.

The selection stores the server, internal school name, school ID, display name,
and address. When multiple results are found, the first result is not selected
automatically.

## Supported login

Only username-and-password authentication is currently supported. QR code,
iServ, Microsoft 365, SAML, and OAuth authentication are not implemented.

School discovery uses the structured public WebUntis service
`https://mobile.webuntis.com/ms/schoolquery2`. Login and timetable requests are
sent to the WebUntis interfaces of the selected school. WebUntis/Untis is an
external service; this project is not affiliated with Untis GmbH.

## States

The adapter creates its data below `timetable`:

```text
timetable.today
├── date
├── lessonCount
├── lessons.01
│   ├── date
│   ├── startTime / endTime
│   ├── subject / subjectLong
│   ├── teacher / room / class
│   ├── status / changed / cancelled
│   └── substitution and original values, where available
└── ... daily summary states directly below timetable.today
```

`timetable.tomorrow` uses the same structure. `timetable.week` additionally
contains the day channels `monday` through `sunday`, each with chronologically
numbered lesson slots (`01`, `02`, …).

The daily summary includes:

- `hasSchool`, `lessonCount`, and `lessonDurationMinutes`
- `schoolStart` and `schoolEnd`
- `subjects`, `subjectCount`, `firstSubject`, and `lastSubject`
- `hasChanges`, `changeCount`, and `cancellationCount`

The today channel also provides time-dependent states for `currentLesson` and
`nextLesson`, their subject/room/teacher details, `nextLessonStart`,
`minutesUntilNextLesson`, `schoolRunning`, and `minutesUntilSchoolEnd`. These
states are recalculated locally every 60 seconds from the already loaded
today timetable; the local timer does not perform WebUntis requests.

Cancelled lessons count as lessons but are not included in the actual lesson
duration. If an update fails, existing timetable data is preserved. The
connection status and the timestamps of the last, successful, and next update
are available below `info`.

Holiday information is available below `holidays`. The adapter exposes the
currently active holiday below `holidays.current` and the next future holiday
below `holidays.next`, including `daysUntil`. Holiday data is loaded from
WebUntis and cached in memory for several hours; no complete holiday history
is created in the object tree.

## Security

The password is handled as an encrypted ioBroker configuration field.
Credentials, tokens, cookies, and session IDs are never logged or written to
states. Never publish credentials in issues or support requests.

## Development

Node.js 20 or newer is required.

```bash
npm install
npm run lint
npm test
npm run check
npm run build
```

WebUntis communication is implemented in `src/lib/webuntis/`:

- `SchoolDiscovery` validates and ranks search results.
- `WebUntisClient` encapsulates WebUntis requests and session handling.
- `WebUntisService` combines API access, authentication, and timetable
  processing.

### Test host

To test, package, and install the adapter on the configured SSH target
`iobroker-test`:

```bash
./scripts/install-testhost.sh
```

Use `WEBUNTIS_INSTANCE=1` to select a different instance. The script stores no
credentials and does not perform Git operations.

## License

MIT License. See [LICENSE](LICENSE).

This project is an independent open-source integration. Use it at your own
risk and in accordance with the terms of use of the external service.
