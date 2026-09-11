![WebUntis2](docs/webuntis2-readme-banner.png)

# ioBroker.webuntis2

[![NPM version](https://img.shields.io/npm/v/iobroker.webuntis2.svg)](https://www.npmjs.com/package/iobroker.webuntis2)

WebUntis2 connects ioBroker with WebUntis. It retrieves timetables for a
student or family account and makes them available in ioBroker for
visualizations, notifications, and automations.

## What the adapter provides

- School search by school name, city, or address
- Simple school selection during setup
- Secure username and password configuration
- A connection test before saving
- Timetables for today, tomorrow, and the current week
- Lesson details such as subject, teacher, room, class, time, and status
- Information about changes, substitutions, and cancelled lessons
- Daily summaries with lesson counts, school times, subjects, and changes
- Current and next lesson information, including the remaining time
- Current and upcoming school holidays
- Automatic updates every five minutes by default

## Installation and setup

1. Install **WebUntis2** from the ioBroker adapter list.
2. Create a new `webuntis2` instance.
3. Search for your school by entering part of its name or a city.
4. Select the matching school from the results.
5. Enter the WebUntis username and password.
6. Use **Test connection** and save the settings.

The adapter stores the selected school together with the information required
for the connection. No server address needs to be entered manually when it is
provided by the school search.

## Data in ioBroker

The timetable is available below `timetable.today`, `timetable.tomorrow`, and
`timetable.week`. Each lesson contains readable values for the subject,
teacher, room, class, start and end time, and lesson status.

Daily summaries show whether there is school, the number and duration of
lessons, the first and last lesson, the subjects in timetable order, and
changes or cancellations. The `info` section contains the connection status
and update information. Holiday information is available below `holidays`.

## Requirements and notes

- A WebUntis account with access to the selected school is required.
- Username-and-password login is supported.
- QR-code, Microsoft 365, SAML, and OAuth login are not supported.
- Exams, homework, and messages are not provided.
- [WebUntis](https://webuntis.com/) is an external service. This project is
  independent and is not affiliated with Untis GmbH.

## Privacy and security

The password is stored using ioBroker's protected configuration mechanism.
Credentials, cookies, and session information are not shown in logs or
published as states. Do not share login details in issues or support requests.

## Support

If the connection does not work, check the selected school and WebUntis login
in a browser first. Then run the connection test in the adapter configuration
and include only relevant, non-sensitive log messages when asking for help.

## Changelog

### 0.1.1 (2026-09-12)

- (@Voodoo2man) Improved the rolling seven-day timetable and added weekly summary states. Date fields now contain date-only values and companion Unix timestamps in milliseconds.

### 0.1.0 (2026-09-11)

- (@Voodoo2man) Complete feature release with timetable data, holidays, readable lesson names, daily summaries, current and next lesson information, and the React administration interface.

### 0.0.2 (2026-09-11)

- (@Voodoo2man) Prepared the first Trusted Publishing release for npm.

### 0.0.1 (2026-09-11)

- (@Voodoo2man) Initial release with school search, secure login, timetable
  data, daily summaries, current and next lesson information, holidays,
  readable master-data names, and cleanup of unsupported legacy namespaces.

## License

Copyright (c) 2026 Voodoo2man <Voodoo2man@outlook.de>

MIT License. See [LICENSE](LICENSE).
