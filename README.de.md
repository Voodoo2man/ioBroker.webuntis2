![WebUntis2](docs/webuntis2-readme-banner.png)

# ioBroker.webuntis2

[![NPM-Version](https://img.shields.io/npm/v/iobroker.webuntis2.svg)](https://www.npmjs.com/package/iobroker.webuntis2)

[English](README.md) | [Deutsch](README.de.md)

WebUntis2 verbindet ioBroker mit WebUntis. Der Adapter ruft Stundenpläne für
ein Schüler- oder Familienkonto ab und stellt sie in ioBroker für
Visualisierungen, Benachrichtigungen und Automatisierungen bereit.

## Funktionen

- Schulsuche nach Schulname, Stadt oder Ort
- Einfache Auswahl der richtigen Schule bei der Einrichtung
- Geschützte Eingabe von Benutzername und Passwort
- Verbindungstest vor dem Speichern
- Stundenpläne für heute, morgen und die aktuelle Woche
- Unterrichtsdaten wie Fach, Lehrer, Raum, Klasse, Uhrzeit und Status; verfügbare Langnamen stehen zusätzlich in eigenen Datenpunkten
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

## Administrationsoberfläche

Der Adapter verwendet eine React-Oberfläche, weil die Einrichtung zwei
interaktive Abläufe enthält: Die Schulsuche fragt WebUntis anhand einer
Benutzereingabe ab und zeigt die Treffer zur Auswahl an. Außerdem prüft der
Verbindungstest die eingegebenen Zugangsdaten für die ausgewählte Schule,
bevor die Einstellungen gespeichert werden. Beide Abläufe kommunizieren
asynchron mit dem Adapter und müssen Lade-, Leer- und Fehlerzustände direkt im
Formular anzeigen. Die Standardfelder von `jsonConfig` bilden Suche und
Auswahl nicht allein ab; dafür wäre weiterhin eine eigene
Komponente oder vergleichbarer Oberflächencode nötig. React hält diese
Einrichtungsschritte zusammen; WebUntis-Anfragen und deren Prüfung bleiben
Aufgabe des Adapters.

## Daten in ioBroker

Die Stundenpläne stehen unter `timetable.today`, `timetable.tomorrow` und
`timetable.week` zur Verfügung. Jede Unterrichtsstunde enthält verständliche
Werte für Fach, Lehrer, Raum, Klasse, Beginn, Ende und Status.

Die Tagesübersicht zeigt, ob Schule stattfindet, die Anzahl und Dauer der
Stunden, die erste und letzte Stunde, die Fächer in Stundenplanreihenfolge
sowie Änderungen und Ausfälle. Jeder Tages-Channel enthält außerdem das
JSON-Array `lessonComparison` mit Stundennummer, ursprünglichem und
aktuellem Fach, Lehrer, Raum und Status. Die Stundennummer entspricht der
Position in der Tagesliste. Ursprüngliche und tatsächliche Beginn- und
Endzeiten sind vorerst identisch.
Im Bereich `info` befinden sich Verbindungsstatus und Aktualisierungsinformationen.
Ferientermine stehen unter `holidays`.

Ungelesene Mitteilungen stehen unter `inbox`. `unreadCount` enthält ihre
Anzahl; `unread` ist ein JSON-Array mit Datum/Uhrzeit, Absender, Betreff, Inhalt
und Anhang-Indikator. Wenn WebUntis den vollständigen Inhalt bereitstellt, wird
er verwendet, andernfalls die verfügbare Vorschau. `contentIsPreview` zeigt an,
wenn nur die Vorschau vorliegt.

## Voraussetzungen und Hinweise

- Für die ausgewählte Schule wird ein WebUntis-Konto mit ausreichenden Rechten
  benötigt.
- Unterstützt wird die Anmeldung mit Benutzername und Passwort.
- QR-Code-, Microsoft-365-, SAML- und OAuth-Anmeldung werden nicht unterstützt.
- Prüfungen und Hausaufgaben werden nicht bereitgestellt.
- [WebUntis](https://webuntis.com/) ist ein externer Dienst. Dieses Projekt ist
  unabhängig und nicht mit der Untis GmbH verbunden.

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

## Änderungsverlauf

### **WORK IN PROGRESS**

- (Voodoo2man) Rückmeldungen in der Konfiguration, Feiertagsnamen und Verbindungsstatus verbessert sowie routinemäßige Login-Meldungen reduziert.

### 0.1.9 (2026-10-15)

- (Voodoo2man) Stundenplandaten und Zuverlässigkeit mit Gegenüberstellungen, Langnamen und automatischer Neuanmeldung bei abgelaufenen Sitzungen verbessert
- (Voodoo2man) Postfach für Mitteilungen hinzugefügt.

### 0.1.8 (2026-10-14)

- (Voodoo2man) Dynamische Unterrichtsnamen aktualisiert, Metadaten bestehender Objekte migriert und alte i18n-Namen korrigiert.

### 0.1.7 (2026-10-14)

- (Voodoo2man) ioBroker-Konformität, mehrsprachige Objektnamen, Beenden des Adapters und Statusaktualisierungen verbessert.
- (Voodoo2man) Regressionstests ergänzt und den historischen Object-Dump mit Adapterdaten entfernt.

### 0.1.6 (2026-10-08)

- (Voodoo2man) Rückmeldungen bei der Schulsuche, mobile Darstellung und Buttonverhalten in der Admin-Oberfläche verbessert.
- (Voodoo2man) Ukrainische Admin-Übersetzungen ergänzt und die technische Begründung für die React-Konfigurationsoberfläche dokumentiert.

### 0.1.5 (2026-10-06)

- (Voodoo2man) Leere Adapter-Konfigurationsseite in ioBroker Admin behoben.

### 0.1.3 (2026-10-05)

- (Voodoo2man) Adapter-Testabhängigkeit für die Repository-Prüfung aktualisiert.

### 0.1.2 (2026-10-05)

- (Voodoo2man) WebUntis-Timeouts und Zuverlässigkeit der Aktualisierungen verbessert.

### 0.1.1 (2026-09-12)

- (Voodoo2man) Verbesserte rollierende Sieben-Tage-Ansicht und Wochentagszusammenfassungen ergänzt. Datumsfelder enthalten jetzt reine Datumswerte sowie zusätzliche Unix-Zeitstempel in Millisekunden.

### 0.1.0 (2026-09-11)

- (Voodoo2man) Vollständige Funktionsveröffentlichung mit Stundenplandaten, Ferienterminen, verständlichen Stundennamen, Tagesübersichten, Informationen zur aktuellen und nächsten Stunde sowie React-Administrationsoberfläche.

### 0.0.2 (2026-09-11)

- (Voodoo2man) Erste Veröffentlichung mit Trusted Publishing für npm vorbereitet.

### 0.0.1 (2026-09-11)

- (Voodoo2man) Erste Veröffentlichung mit Schulsuche, geschützter Anmeldung,
  Stundenplan, Tagesübersichten, Informationen zur aktuellen und nächsten
  Stunde, Ferienterminen, verständlichen Stammdatennamen und der Bereinigung
  nicht unterstützter alter Bereiche.

## Lizenz

Copyright (c) 2026 Voodoo2man <Voodoo2man@outlook.de>

MIT-Lizenz. Siehe [LICENSE](LICENSE).
