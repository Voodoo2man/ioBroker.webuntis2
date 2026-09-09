![Logo](admin/webuntis.png)

# ioBroker.webuntis

[![NPM version](https://img.shields.io/npm/v/iobroker.webuntis.svg)](https://www.npmjs.com/package/iobroker.webuntis)
[![Downloads](https://img.shields.io/npm/dm/iobroker.webuntis.svg)](https://www.npmjs.com/package/iobroker.webuntis)
![Test and Release](https://github.com/Voodoo2man/ioBroker.webuntis/actions/workflows/test-and-release.yml/badge.svg)

ioBroker-Adapter für WebUntis. Der Adapter sucht Schulen automatisch, prüft
die Anmeldung und stellt den Stundenplan für heute, morgen und die laufende
Woche als ioBroker-States bereit.

## Funktionen

- Schulsuche nach Name, Ort oder Adresse
- Auswahl eines konkreten Treffers, auch wenn mehrere Schulen gefunden werden
- Anmeldung mit WebUntis-Benutzername und Passwort
- Verbindungstest direkt in der Adapterkonfiguration
- Stundenplan für heute, morgen und Montag bis Sonntag der laufenden Woche
- Unterrichtsdaten wie Fach, Lehrkraft, Raum, Klasse, Zeit und Status
- Erkennung von Änderungen, Vertretungen und Ausfällen
- Tageszusammenfassungen mit Unterrichtsanzahl, Zeiten, Fächern und Änderungszählern
- Aktualisierung standardmäßig alle fünf Minuten

Prüfungen, Hausaufgaben und weitere WebUntis-Datenbereiche sind derzeit nicht
implementiert.

## Einrichtung

1. Adapter installieren und eine neue `webuntis`-Instanz öffnen.
2. Im Bereich „Schule“ mindestens zwei Zeichen eingeben und die Suche starten.
3. Die gewünschte Schule aus den Treffern auswählen.
4. WebUntis-Benutzername und Passwort eingeben.
5. „Verbindung testen“ ausführen und die Konfiguration speichern.

Die Auswahl übernimmt Server, internen Schulnamen, Schul-ID, Anzeigenamen und
Adresse. Bei mehreren Treffern wird nicht automatisch der erste Treffer
verwendet.

## Unterstütztes Login

Aktuell wird ausschließlich die Anmeldung mit Benutzername und Passwort
unterstützt. QR-Code, iServ, Microsoft 365, SAML und OAuth sind nicht
implementiert.

Die Schulsuche verwendet den strukturierten öffentlichen WebUntis-Dienst
`https://mobile.webuntis.com/ms/schoolquery2`. Die Anmeldung und der Abruf des
Stundenplans erfolgen über die WebUntis-Schnittstellen der ausgewählten Schule.
WebUntis/Untis ist ein externer Dienst; dieses Projekt steht nicht mit der
Untis GmbH in Verbindung.

## States

Die Daten werden unter `timetable` angelegt:

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
│   └── substitution sowie Originalwerte, falls vorhanden
└── ... Tageszusammenfassung direkt unter timetable.today
```

`timetable.tomorrow` verwendet dieselbe Struktur. Unter `timetable.week`
liegen zusätzlich die Tageskanäle `monday` bis `sunday`, jeweils mit
chronologisch nummerierten Lesson-Slots (`01`, `02`, …).

Die Tageszusammenfassung enthält unter anderem:

- `hasSchool`, `lessonCount` und `lessonDurationMinutes`
- `schoolStart` und `schoolEnd`
- `subjects`, `subjectCount`, `firstSubject` und `lastSubject`
- `hasChanges`, `changeCount` und `cancellationCount`

Ausgefallene Stunden zählen als Lesson, werden aber nicht zur tatsächlichen
Unterrichtsdauer addiert. Bei einem fehlgeschlagenen Update bleiben bereits
vorhandene Stundenplandaten erhalten. Der Verbindungsstatus und die Zeitpunkte
der letzten, erfolgreichen und nächsten Aktualisierung stehen unter `info`.

## Sicherheit

Das Passwort wird als verschlüsseltes ioBroker-Konfigurationsfeld behandelt.
Zugangsdaten, Tokens, Cookies und Session-IDs werden weder geloggt noch in
States geschrieben. Zugangsdaten bitte niemals in Issues oder Support-Anfragen
veröffentlichen.

## Entwicklung

Voraussetzung ist Node.js 20 oder neuer.

```bash
npm install
npm run lint
npm test
npm run check
npm run build
```

Die WebUntis-Kommunikation liegt unter `src/lib/webuntis/`:

- `SchoolDiscovery` validiert und sortiert Suchergebnisse.
- `WebUntisClient` kapselt die WebUntis-Anfragen und die Session-Verwendung.
- `WebUntisService` verbindet API-Zugriff, Authentifizierung und
  Stundenplanaufbereitung.

### Testhost

Für Prüfung, Paketierung und Installation auf dem konfigurierten SSH-Ziel
`iobroker-test`:

```bash
./scripts/install-testhost.sh
```

Eine andere Instanz kann über `WEBUNTIS_INSTANCE=1` gewählt werden. Das Script
verwendet keine Zugangsdaten und nimmt keine Git-Änderungen vor.

## Lizenz

MIT License. Siehe [LICENSE](LICENSE).

Dieses Projekt ist eine unabhängige Open-Source-Integration. Die Nutzung
erfolgt auf eigenes Risiko und unter Beachtung der Nutzungsbedingungen des
externen Dienstes.
