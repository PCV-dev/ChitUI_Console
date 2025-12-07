# Konsolenfunktion: Kurzkonzept

## Verwendungszweck
- Interaktive Eingabe von SDCP/Diagnosebefehlen direkt aus der Web-Konsole, um Drucker zu testen, Firmware zu inspizieren oder manuelle Aktionen (z. B. Lampentest, Achsen-Referenzfahrt) auszuführen.
- Ergänzt bestehende Upload/Status-Funktionen um einen manuellen Kanal für Power-User, ohne separate Tools (z. B. netcat) starten zu müssen.

## Sicherheitsregeln
- Zugriff nur für authentifizierte Sessions; keine anonyme Nutzung (gleiche Session-Guards wie Upload/Status).
- Befehle werden nur an aktuell verbundene Drucker zugelassen; bei Verbindungsverlust wird die Eingabe gesperrt und ein Hinweis angezeigt.
- Sensible Befehle (Bewegung, Firmware-Update, Löschen) erfordern eine zusätzliche Bestätigung über den bestehenden Bestätigungsdialog.
- Eingaben werden clientseitig validiert (Format/Länge) und serverseitig auf zulässige Kommando-Whitelist geprüft; rohe Passthroughs sind nicht erlaubt.
- Pro Nutzer wird eine Rate-Limitierung eingeführt (z. B. 10 Befehle/Minute) und jede Ausführung wird mit Zeitstempel und Benutzer-ID protokolliert.

## Fehlermeldungen
- **Verbindungsfehler:** „Keine aktive Verbindung zum Drucker. Bitte erneut verbinden.“
- **Validierungsfehler:** „Befehl unvollständig oder unzulässig. Prüfe Syntax/Whitelist.“
- **Queue gesperrt:** „Es läuft bereits ein Befehl. Bitte nach Abschluss erneut senden.“
- **Serverfehler:** „Kommando konnte nicht ausgeführt werden. Details im Log.“
- Meldungen erscheinen als Toast und in einer Konsolen-Historie unter dem Eingabefeld.

## Architekturentscheidungen
- **Drucker-Zulassung:** Die Konsole akzeptiert ausschließlich aktiv verbundene Drucker; offline oder unbekannte Geräte werden ausgeblendet und können nicht ausgewählt werden.
- **Queue-Gating:** Jeder Drucker besitzt eine serielle Befehls-Queue; ein neuer Befehl wird erst gesendet, wenn der vorherige quittiert ist (Queue-Gating). Parallel-Befehle pro Drucker sind nicht erlaubt.

## UI-Ort
- Neuer Tab „Konsole“ in `web/index.html` innerhalb der bestehenden Tab-Navigation (`navTabs`/`navPanes`), auf gleicher Ebene wie Upload/Status-Panes.
- Tab-Inhalt: Eingabefeld mit Senden-Button, History-Panel (scrollbar), Status-Badge für Queue/Verbindung und optional ein Dropdown zur Auswahl des verbundenen Druckers.
