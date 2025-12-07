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

### Whitelist/Blacklist-Strategie
- **Whitelist first:** Standardbefehle werden über eine serverseitige Whitelist freigeschaltet (Basis: SDCP-/Diagnosekommandos). Alles nicht gelistete wird blockiert, sofern der Betreiber keine explizite Opt-In-Whitelist hinterlegt.
- **Blacklist als Bremse:** Eine kurze Blacklist schließt riskante Befehle (z. B. Firmware-Flash, NVRAM-Reset, Achsenkalibrierung ohne Endstopp) aus, selbst wenn sie in der Whitelist stehen. Blacklist-Einträge werden per Default geladen und können nur serverseitig überschrieben werden.
- **Konfigurierbar per Env:** Whitelist/Blacklist werden über ENV-Variablen gepflegt, damit Betreiber testweise Befehle freischalten oder sperren können, ohne den Code anzupassen.
- **Feedback im UI:** Der Konsolen-Tab zeigt für eingegebene Kommandos ein Label („zulässig“, „gesperrt durch Whitelist“, „gesperrt durch Blacklist“) und verhindert das Absenden gesperrter Befehle.

### UI-Bestätigung für riskante Befehle
- Befehle mit Flag „riskant“ (z. B. Bewegungen, Löschen, Firmware/EEPROM-Operationen) triggern verpflichtend den bestehenden Modal-Dialog. Anzeige: Kurzbeschreibung des Risikos, betroffener Drucker, Command-String.
- Für wiederkehrende Eingaben wird kein „Remember“-Häkchen angeboten; jede riskante Aktion erfordert eine erneute Bestätigung.
- Der Senden-Button bleibt deaktiviert, solange die Bestätigung nicht erfolgt ist (Button erst nach Modal-Bestätigung aktivieren).
- Command-Historie markiert riskante Befehle mit einem farbigen Badge, um spätere Audits zu erleichtern.

### Rate-Limiting / Flood-Schutz
- **Hard-Limit pro Nutzer:** Maximal 10 Befehle/Minute und 2 parallele Befehle pro Drucker. Überschreitungen liefern einen klaren Fehler („Rate-Limit erreicht, bitte in 60 s erneut versuchen“).
- **Flood-Guard per Queue:** Jede Drucker-Queue nimmt nur einen neuen Eintrag an, wenn die vorherige Antwort oder ein Timeout (z. B. 5 s) vorliegt. Zusätzliche Eingaben landen im UI als „pending“ und lassen sich abbrechen.
- **Backoff-Mechanismus:** Bei drei Flood-Verstößen in Folge wird die Konsole für 1 Minute gesperrt (visualisiert durch Badge „Gesperrt bis …“).
- **Serverseitige Metriken:** Rate-Limit-Events und Flood-Sperren werden geloggt, um Fehlverhalten nachvollziehen zu können.

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
