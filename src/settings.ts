import { App, PluginSettingTab, Setting } from 'obsidian';
import type KanbanBasesPlusPlugin from './main';
import { BaseOpenMode, KanbanBasesPlusSettings } from './types';

export const DEFAULT_SETTINGS: KanbanBasesPlusSettings = {
    baseOpenMode: 'split',
    defaultNoteTitlePrefix: 'Neuer Eintrag',
    perPageOpenModes: {},
};

export class KanbanBasesPlusSettingTab extends PluginSettingTab {
    plugin: KanbanBasesPlusPlugin;

    constructor(app: App, plugin: KanbanBasesPlusPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Bases Kanban Plus Einstellungen' });

        new Setting(containerEl)
            .setName('Öffnungsmodus für Base-Dokumente')
            .setDesc(
                'Legt fest, wie neu erstellte Dokumente und Seiten aus einer Base auf Desktop & Tablet geöffnet werden. Auf Smartphones wird zur optimalen Bedienung immer im selben Tab geöffnet.'
            )
            .addDropdown((dropdown) => {
                dropdown
                    .addOptions({
                        current: 'Im gleichen Tab (überschreibt aktuellen Tab)',
                        tab: 'Im neuen Tab',
                        split: 'Im Split-Modus (geteiltes Fenster)',
                    })
                    .setValue(this.plugin.settings.baseOpenMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.baseOpenMode = value as BaseOpenMode;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Standard-Titel für neue Einträge')
            .setDesc('Vorausgewählter Titel für Notizen, die über den Spalten-Hinzufügen-Button erstellt werden.')
            .addText((text) => {
                text
                    .setPlaceholder('Neuer Eintrag')
                    .setValue(this.plugin.settings.defaultNoteTitlePrefix)
                    .onChange(async (value: string) => {
                        this.plugin.settings.defaultNoteTitlePrefix = value.trim() || 'Neuer Eintrag';
                        await this.plugin.saveSettings();
                    });
            });
    }
}
