**IN ARBEIT**

![WebUntis2](docs/webuntis2-readme-banner.png)

# ioBroker.webuntis2

[![NPM-Version](https://img.shields.io/npm/v/iobroker.webuntis2.svg)](https://www.npmjs.com/package/iobroker.webuntis2)

WebUntis2 verbindet ioBroker mit WebUntis. Der Adapter ruft Stundenpläne für
ein Schüler- oder Familienkonto ab und stellt sie in ioBroker für
Visualisierungen, Benachrichtigungen und Automatisierungen bereit.

## Funktionen

- Schulsuche nach Schulname, Stadt oder Ort
- Einfache Auswahl der richtigen Schule bei der Einrichtung
- Geschützte Eingabe von Benutzername und Passwort
- Verbindungstest vor dem Speichern
- Stundenpläne für heute, morgen und die aktuelle Woche
- Unterrichtsdaten wie Fach, Lehrer, Raum, Klasse, Uhrzeit und Status
- Erkennung von Änderungen, Vertretungen und ausgefallenen Stunden
- Tagesübersichten mit Stundenanzahl, Unterrichtszeiten, Fächern und Änderungen
- Informationen zur aktuellen und nächsten Stunde inklusive Restzeit
- Aktuelle und nächste Schulferien
- Automatische Aktualisierung standardmäßig alle fünf Minuten

## Installation und Einrichtung

1. Installiere **WebUntis2** über die ioBroker-Adapterliste.
2. Lege eine neue Instanz `webuntis2` an.
3. Suche nach deiner Schule, indem du einen Teil des Namens oder einen Ort
   eingibst.
4. Wähle die passende Schule aus den Ergebnissen aus.
5. Gib Benutzername und Passwort deines WebUntis-Kontos ein.
6. Führe den **Verbindungstest** aus und speichere die Einstellungen.

Die ausgewählte Schule wird zusammen mit den für die Verbindung benötigten
Daten gespeichert. Eine Serveradresse muss nicht manuell eingetragen werden,
wenn sie über die Schulsuche ermittelt wurde.

## Daten in ioBroker

Die Stundenpläne stehen unter `timetable.today`, `timetable.tomorrow` und
`timetable.week` zur Verfügung. Jede Unterrichtsstunde enthält verständliche
Werte für Fach, Lehrer, Raum, Klasse, Beginn, Ende und Status.

Die Tagesübersicht zeigt, ob Schule stattfindet, die Anzahl und Dauer der
Stunden, die erste und letzte Stunde, die Fächer in Stundenplanreihenfolge
sowie Änderungen und Ausfälle. Im Bereich `info` befinden sich der
Verbindungsstatus und Aktualisierungsinformationen. Ferientermine stehen unter
`holidays`.

## Voraussetzungen und Hinweise

- Für die ausgewählte Schule wird ein WebUntis-Konto mit ausreichenden Rechten
  benötigt.
- Unterstützt wird die Anmeldung mit Benutzername und Passwort.
- QR-Code-, Microsoft-365-, SAML- und OAuth-Anmeldung werden nicht unterstützt.
- Prüfungen, Hausaufgaben und Mitteilungen werden nicht bereitgestellt.
- WebUntis ist ein externer Dienst. Dieses Projekt ist unabhängig und nicht
  mit der Untis GmbH verbunden.

## Datenschutz und Sicherheit

Das Passwort wird über die geschützte ioBroker-Konfiguration gespeichert.
Zugangsdaten, Cookies und Sitzungsinformationen werden weder in Logs angezeigt
noch als States veröffentlicht. Teile deine Zugangsdaten niemals in Issues
oder Supportanfragen.

## Hilfe bei Problemen

Prüfe zuerst, ob die ausgewählte Schule und der WebUntis-Login im Browser
funktionieren. Führe anschließend den Verbindungstest in der
Adapterkonfiguration aus. Teile bei einer Supportanfrage nur relevante,
nicht vertrauliche Logmeldungen.

## Lizenz

MIT-Lizenz. Siehe [LICENSE](LICENSE).
