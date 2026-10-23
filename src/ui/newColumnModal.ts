import { App, Modal, Notice, Setting } from 'obsidian';
import { CardCreator } from '../services/cardCreator';
import { FilterPropertyMap } from '../types';

export interface NewColumnModalOptions {
    groupProperty: string;
    filterProperties: FilterPropertyMap;
    targetFolder?: string;
    defaultTitle?: string;
    cardCreator: CardCreator;
}

export class NewColumnModal extends Modal {
    private groupProperty: string;
    private filterProperties: FilterPropertyMap;
    private targetFolder: string;
    private defaultTitle: string;
    private cardCreator: CardCreator;

    private columnValue: string = '';
    private noteTitle: string = '';

    constructor(app: App, options: NewColumnModalOptions) {
        super(app);
        this.groupProperty = options.groupProperty;
        this.filterProperties = options.filterProperties;
        this.targetFolder = options.targetFolder || '';
        this.defaultTitle = options.defaultTitle || 'Neuer Eintrag';
        this.cardCreator = options.cardCreator;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('bases-plus-modal-content');

        contentEl.createEl('h2', { text: 'Neue Spalte / Eintrag erstellen' });

        const descEl = contentEl.createEl('p', { cls: 'bases-plus-modal-desc' });
        descEl.innerHTML = `Das Board ist nach <strong>${this.groupProperty}</strong> gruppiert. Durch das Erstellen dieses Dokuments wird die entsprechende Spalte im Board erzeugt.`;

        // 1. Spaltenwert Input
        new Setting(contentEl)
            .setName(`Wert für "${this.groupProperty}"`)
            .setDesc('Der Name bzw. Wert der neuen Spalte')
            .addText((text) => {
                text.setPlaceholder(`z. B. Neuer Status, Kategorie...`);
                text.onChange((val) => {
                    this.columnValue = val;
                });
                // Focus the column value input
                window.setTimeout(() => text.inputEl.focus(), 50);

                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.handleSubmit();
                    }
                });
            });

        // 2. Dokumentenname Input
        new Setting(contentEl)
            .setName('Dokumentenname (optional)')
            .setDesc('Name der ersten Notiz in dieser neuen Spalte')
            .addText((text) => {
                text.setPlaceholder(this.defaultTitle);
                text.setValue(this.defaultTitle);
                this.noteTitle = this.defaultTitle;
                text.onChange((val) => {
                    this.noteTitle = val;
                });

                text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.handleSubmit();
                    }
                });
            });

        // Info about inherited filter properties
        const filterKeys = Object.keys(this.filterProperties);
        if (filterKeys.length > 0) {
            const filterInfoEl = contentEl.createEl('div', { cls: 'bases-plus-modal-desc' });
            const filterSummary = filterKeys
                .map((k) => `${k}: ${JSON.stringify(this.filterProperties[k])}`)
                .join(', ');
            filterInfoEl.innerHTML = `Automatisch übernommene Filter-Properties: <em>${filterSummary}</em>`;
        }

        // Action buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'bases-plus-modal-buttons' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Abbrechen' });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Spalte & Dokument erstellen',
        });
        submitBtn.addEventListener('click', () => this.handleSubmit());
    }

    private async handleSubmit(): Promise<void> {
        const trimmedValue = this.columnValue.trim();
        if (!trimmedValue) {
            new Notice('Bitte gib einen Wert für die Spalte ein.');
            return;
        }

        const fileName = this.noteTitle.trim() || this.defaultTitle || 'Neuer Eintrag';

        // Prepare combined properties
        const propertiesToApply: FilterPropertyMap = {
            ...this.filterProperties,
        };

        let targetFolder = this.targetFolder;

        // If grouped by file.folder, the column value defines the folder path inside targetFolder!
        if (this.groupProperty === 'file.folder' || this.groupProperty === 'folder') {
            if (targetFolder && !trimmedValue.startsWith(targetFolder)) {
                targetFolder = `${targetFolder}/${trimmedValue}`;
            } else {
                targetFolder = trimmedValue;
            }
        } else {
            // Group property is a frontmatter property
            propertiesToApply[this.groupProperty] = trimmedValue;
        }

        try {
            this.close();
            const createdFile = await this.cardCreator.createCardWithProperties(
                targetFolder,
                fileName,
                propertiesToApply
            );
            new Notice(`Spalte "${trimmedValue}" mit Notiz "${createdFile.basename}" erstellt.`);
        } catch (err) {
            console.error('[Kanban Bases Plus] Failed to create column document:', err);
            new Notice(`Fehler beim Erstellen der Spalte: ${err}`);
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
