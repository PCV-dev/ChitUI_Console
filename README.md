# ChitUI

A web UI for Chitubox SDCP 3.0 resin printers. Now with a little "CHITU Console" => Work in Progress!!!!

## Setup

* Linux:
  
`bash`
```bash
python -mvenv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

* Windows:

Install Python  *[Pyton for Windows](https://www.python.org/downloads/windows/)*

*With PowerShell:*

`ps`
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

*With CMD.exe*

`cmd`
```cmd
python -m venv .venv
.\.venv\Scripts\activate.bat
pip install -r requirements.txt
```



## Usage
After creating the virtual environment and installing the requirements, you can run ChitUI like this:

`cmd`
```cmd
python main.py
```
and then access the web interface on port 54780, e.g. http://127.0.0.1:54780/

to close:

`cmd`
```cmd
deactivate
```

## Gcode-Konsole
Die Gcode-Konsole ermöglicht es, einzelne Befehle direkt an den Drucker zu schicken.

### Voraussetzungen
* Der Drucker muss sich im selben Netzwerksegment befinden und den UDP-Broadcast auf Port `3000` zulassen, damit die automatische Suche funktioniert.
* Die Websocket-Verbindung des Druckers auf Port `3030` darf nicht durch eine Firewall blockiert werden.
* Eine aktive Verbindung zum Drucker ist zwingend erforderlich – ohne ausgewählten Drucker bleibt der **Send**-Button deaktiviert.

### Nutzung
1. ChitUI wie oben beschrieben starten und im linken Seitenbereich einen gefundenen Drucker auswählen.
2. Den Tab **G-code** öffnen.
3. Den gewünschten Befehl im Feld **G-code command** eintragen (z. B. `M115`).
4. Mit **Send** absenden.
5. Der Status-Badge unter dem Eingabefeld zeigt den Versandstatus; Rückmeldungen oder Fehler erscheinen zusätzlich in der Liste **History**.
6. Über **Copy last**, **Resend last** und **Clear** lässt sich der Verlauf weiterverwenden bzw. löschen.

### Beispielbefehle
* `M115` – Firmware- und Geräteinformationen abrufen.
* `M503` – Aktuelle Konfiguration anzeigen (nützlich zur Fehlersuche).
* `M106 S0` / `M106 S255` – Lüfter ausschalten bzw. mit voller Leistung einschalten.
* `G28` – Achsen referenzieren (nur wenn der Bauraum frei ist).
* `M140 S0` – Heizbett deaktivieren (falls unterstützt).

### Sicherheits-Hinweise
* Gcode-Befehle wirken direkt auf die Hardware. Prüfen Sie vor jedem Bewegungsbefehl (z. B. `G0`, `G1`, `G28`), ob sich keine Gegenstände im Weg befinden und das Harz-Becken entfernt ist.
* Kein Gcode senden, während ein Druck läuft, sofern der Hersteller dies nicht ausdrücklich erlaubt – unbeabsichtigte Stopps oder Kollisionen sind sonst möglich.
* Die Statusmeldungen in der History sorgfältig prüfen. Wiederholen Sie fehlgeschlagene Befehle nur, wenn die Ursache verstanden und behoben ist.
* Netzwerk-Sicherheit beachten: Die Gcode-Konsole ermöglicht vollständige Kontrolle über den Drucker; verwenden Sie sie nur in einem vertrauenswürdigen, abgeschirmten Netzwerk.

## Docker
As ChitUI needs to broadcast UDP messages on your network segment, running ChitUI in a Docker container requires host networking to be enabled for the container:

```
docker build -t chitui:latest .
docker run --rm --name chitui --net=host chitui:latest
```

## Configuration

Configuration is done via environment variables:
* `PORT` to set the HTTP port of the web interface (default: `54780`)
* `DEBUG` to enable debug logging, log colorization and code reloading (default: `False`)
* `COMMAND_HISTORY_LIMIT` maximale Anzahl der gespeicherten Konsolen-Befehle pro Drucker (default: `50`)

### Vordefinierte Whitelist/Blacklist
Unter `Doc/` liegen zwei vorkonfigurierte Listen, die ohne weitere Schritte beim Start geladen werden:

* `Doc/FIRMWARE_COMMAND_WHITELIST` enthält eine konservative Auswahl freigegebener Befehle.
* `Doc/FIRMWARE_COMMAND_BLACKLIST` enthält gesperrte Befehle wie `M8513` und `M112`.

Wenn du weitere Befehle (z. B. `M8513`) senden möchtest, entferne sie aus der Blacklist und füge sie der Whitelist hinzu. Dadurch ist das Senden solcher Befehle möglich, aber nicht ohne bewusste Anpassung.
