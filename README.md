# Bases Tweaks (Obsidian Plugin)

Ein modulares, TypeScript-basiertes Obsidian-Plugin zur automatischen Property-Vererbung aus Base-Filtern, Steuerung des Öffnungsverhaltens für Dokumente und dynamischer Spaltenerstellung.

---

## Features

1. **Automatische Property-Vererbung**:
   - Erkennt Filter aus `.base`-Dateien (sowohl Root-Filter als auch View-spezifische Filter wie z. B. `Done == false`).
   - Schreibt Filter-Properties atomar ins Frontmatter neu erstellter Kanban-Karten (ohne bestehende Werte zu überschreiben).
   - Filtert technische Systemproperties (`file.*`) automatisch heraus.

2. **Flexibler Öffnungsmodus (Desktop, Tablet & Smartphone)**:
   - Einstellung per Dropdown direkt in der Base-Toolbar oder in den Plugin-Optionen:
     - **Split-Modus**: Öffnet neu erstellte Notizen oder aus der Base angeklickte Seiten geteilt neben der Base (existierender Split wird intelligent wiederverwendet).
     - **Neuer Tab**: Öffnet Seiten in einem neuen Tab.
     - **Selber Tab**: Verwendet den aktuellen Tab.
   - **Seiten- vs. Base-Überschreibung**: Öffnungsmodus kann global, für die Base selbst oder seitenspezifisch (für Embeds) festgelegt werden.
   - **Mobile-Regel**: Auf Smartphones (`Platform.isPhone`) wird **immer** im gleichen Tab geöffnet, um das Layout auf kleinen Bildschirmen optimal zu nutzen. Auf Desktop und Tablets greift die konfigurierte Einstellung.

3. **Dynamischer "+ Spalte"-Button im Header**:
   - Erscheint automatisch im Toolbar der Base, **wenn die aktive Ansicht nach einer Eigenschaft gruppiert ist** (z. B. `Status`, `Dringlichkeit`, `Kategorie` oder Ordner).
   - Öffnet einen Dialog zur Eingabe des neuen Spaltenwerts und optionalen Notiztitels.
   - Erstellt das Dokument, weist den Spaltenwert zu und vererbt alle aktiven Base-Filter.
   - Da die Eigenschaft nun im Vault existiert, blendet Obsidian Bases die neue Spalte sofort auf dem Board ein.

---

## Architektur

```
bases-tweaks/
├── src/
│   ├── main.ts                     # Plugin-Lifecycle, Event-Registrierung & Observer
│   ├── types.ts                    # TypeScript Interfaces & Typen
│   ├── settings.ts                 # Settings Tab & Default Settings
│   ├── services/
│   │   ├── filterParser.ts         # YAML-Parsing von Root- & View-Filtern
│   │   ├── baseResolver.ts         # Auflösen von .base-Dateien (DOM, Embeds, Leaf)
│   │   ├── baseViewService.ts      # Gruppierungserkennung (groupBy.property)
│   │   ├── navigationHandler.ts    # Öffnungsmodus-Steuerung mit Phone-Erkennung & Split-Wiederverwendung
│   │   └── cardCreator.ts          # Atomares Frontmatter-Writing & Dateierstellung
│   └── ui/
│       ├── headerButtonManager.ts  # Dynamische Injektion des "+ Spalte"-Buttons in die Toolbar
│       ├── openModeButtonManager.ts# Injektion des Öffnungsmodus-Dropdowns
│       └── newColumnModal.ts       # Dialog zur Eingabe von Spaltenwert & Titel
└── tests/
    ├── mocks/obsidian.ts           # Obsidian API Mock für Tests
    ├── filterParser.test.ts        # Unit Tests für Filter-Parsing
    ├── navigationHandler.test.ts   # Tests für Phone- und Desktop-Öffnungsmodi
    ├── baseViewService.test.ts     # Tests für Gruppierungs-Erkennung
    ├── baseResolver.test.ts        # Tests für Base- und Host-File-Auflösung
    ├── cardCreator.test.ts         # Tests für atomare Frontmatter-Aktualisierung
    └── mainRename.test.ts          # Tests für Umbenennungshandling
```

---

## Entwicklung & Tests

```bash
# Abhängigkeiten installieren
npm install

# Tests ausführen (Vitest)
npm test

# Plugin kompilieren (Produktion)
npm run build

# Watch-Modus für Entwicklung
npm run dev
```
