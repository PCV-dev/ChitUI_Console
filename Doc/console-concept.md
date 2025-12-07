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

## Kritische Befehle & Governance
- **Kritische Befehle identifizieren:**
  - *M8513* ist der einzige als kritisch einzustufende SDCP-Befehl und verlangt eine explizite Bestätigung.
  - Alle anderen aktuell vorgesehenen SDCP-Kommandos gelten als unkritisch und werden regulär verarbeitet.
- **Whitelist/Blacklist-Strategie:**
  - Whitelist pro SDCP-Command (z. B. Status/Attribute lesen, File-Listing, moderates Log-Level) wird ohne Rückfrage ausgeführt.
  - Blacklist für hochriskante Kommandos (Firmware-Write, Raw-GCode, Massendateilöschung) wird komplett geblockt.
  - Grauzone („needs confirm“) reduziert sich faktisch auf M8513; UI fordert eine modale Bestätigung (inkl. Ziel-Drucker, Kommando-Bezeichnung, ggf. Parameter). Ohne explizite Zustimmung kein Versand.
- **UI-Bestätigung:**
  - Bestehender Bestätigungsdialog wird für M8513 genutzt; Schaltfläche „Risiko verstanden“ + Sicherheits-Hint (z. B. „Bauraum frei?“) werden eingeblendet.
  - Dialog listet den genauen SDCP-Command und Parameter auf und verweist auf die zu erwartende Aktion.
  - Die Konsole zeigt ein gut sichtbares Badge („kritisch“) neben dem Senden-Button, wenn M8513 versendet werden soll.

## Rate-Limiting & Flood-Schutz
- **Globales Limit pro Benutzer:** 10 Befehle pro 60 Sekunden (Rollierendes Fenster) auf API-Ebene; UI deaktiviert den Senden-Button temporär und zeigt verbleibende Sperrzeit.
- **Per-Drucker-Burstschutz:** Maximal 3 kritische Befehle pro Drucker in 30 Sekunden, ansonsten Backoff + Hinweis „Flood-Schutz aktiv“.
- **Serverseitige Ablehnung:** Überschreitungen liefern HTTP 429/Socket-Error mit Restwartezeit; Einträge wandern ins Konsolen-Log.
- **Client-Telemetrie:** Zeitstempel der letzten N Befehle werden clientseitig getrackt, um offensichtliche Flooding-Versuche früh abzufangen.

## UI-Ort
- Neuer Tab „Konsole“ in `web/index.html` innerhalb der bestehenden Tab-Navigation (`navTabs`/`navPanes`), auf gleicher Ebene wie Upload/Status-Panes.
- Tab-Inhalt: Eingabefeld mit Senden-Button, History-Panel (scrollbar), Status-Badge für Queue/Verbindung und optional ein Dropdown zur Auswahl des verbundenen Druckers.
