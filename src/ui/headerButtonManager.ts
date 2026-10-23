import { App, setIcon } from 'obsidian';
import { BaseResolver } from '../services/baseResolver';
import { BaseViewService } from '../services/baseViewService';
import { CardCreator } from '../services/cardCreator';
import { parseBaseFiltersFromYaml } from '../services/filterParser';
import { KanbanBasesPlusSettings } from '../types';
import { NewColumnModal } from './newColumnModal';

export class HeaderButtonManager {
    private isUpdating = false;

    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private baseViewService: BaseViewService,
        private cardCreator: CardCreator,
        private getSettings: () => KanbanBasesPlusSettings
    ) {}

    /**
     * Scans the DOM for all .bases-toolbar containers and updates the "+ Spalte" button.
     */
    async updateAllButtons(): Promise<void> {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            // 1. Remove any stray buttons that were previously added to the Obsidian leaf header
            document
                .querySelectorAll(
                    '.view-header .bases-plus-column-button, .view-actions .bases-plus-column-button, .view-header .bases-toolbar-new-column'
                )
                .forEach((el) => el.remove());

            // 2. Find all .bases-toolbar containers
            const toolbars = Array.from(document.querySelectorAll<HTMLElement>('.bases-toolbar'));
            for (const toolbarEl of toolbars) {
                await this.updateButtonForToolbar(toolbarEl);
            }
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Updates the header button for a specific .bases-toolbar element.
     */
    async updateButtonForToolbar(toolbarEl: HTMLElement): Promise<void> {
        const existingItem = toolbarEl.querySelector<HTMLElement>('.bases-toolbar-new-column');

        // Resolve corresponding base file
        const baseFile = await this.baseResolver.resolveBaseFile(toolbarEl);
        if (!baseFile) {
            existingItem?.remove();
            return;
        }

        // Check whether this view is grouped by a property
        const grouping = await this.baseViewService.detectGrouping(baseFile, toolbarEl);

        // If not grouped, remove button if present
        if (!grouping.isGrouped || !grouping.groupProperty) {
            existingItem?.remove();
            return;
        }

        const groupProperty = grouping.groupProperty;

        // Position: directly to the left of "Sortieren" (ganz links im rechten Aktionsbereich)
        const sortMenu = toolbarEl.querySelector('.bases-toolbar-sort-menu');
        const groupMenu = toolbarEl.querySelector('.bases-toolbar-group-menu');
        const filterMenu = toolbarEl.querySelector('.bases-toolbar-filter-menu');
        const newItemMenu = toolbarEl.querySelector('.bases-toolbar-new-item-menu');

        const insertItem = (el: HTMLElement) => {
            if (sortMenu) {
                toolbarEl.insertBefore(el, sortMenu);
            } else if (groupMenu) {
                toolbarEl.insertBefore(el, groupMenu);
            } else if (filterMenu) {
                toolbarEl.insertBefore(el, filterMenu);
            } else if (newItemMenu) {
                toolbarEl.insertBefore(el, newItemMenu);
            } else {
                toolbarEl.appendChild(el);
            }
        };

        // If button already exists in this toolbar, update label/tooltip and ensure correct position
        if (existingItem) {
            const btn = existingItem.querySelector('.text-icon-button');
            btn?.setAttribute(
                'aria-label',
                `Neue Spalte hinzufügen (${groupProperty})`
            );
            if (sortMenu && sortMenu.previousElementSibling !== existingItem) {
                insertItem(existingItem);
            }
            return;
        }

        // Create the native-matching .bases-toolbar-item
        const itemEl = document.createElement('div');
        itemEl.className = 'bases-toolbar-item bases-toolbar-new-column';

        const buttonEl = document.createElement('div');
        buttonEl.className = 'text-icon-button tappable';
        buttonEl.setAttribute('tabindex', '0');
        buttonEl.setAttribute('role', 'button');
        buttonEl.setAttribute('aria-label', `Neue Spalte hinzufügen (${groupProperty})`);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-button-icon';
        setIcon(iconSpan, 'plus-square');
        buttonEl.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-button-label';
        labelSpan.textContent = '+ Spalte';
        buttonEl.appendChild(labelSpan);

        itemEl.appendChild(buttonEl);

        const triggerAction = async (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            // Resolve host file (where the base is embedded) to accurately evaluate `this.file.folder`
            const hostFile = this.baseResolver.resolveHostFile(toolbarEl);
            const hostFolder =
                hostFile?.parent?.path && hostFile.parent.path !== '/'
                    ? hostFile.parent.path
                    : '';
            const baseFolder =
                baseFile.parent?.path && baseFile.parent.path !== '/'
                    ? baseFile.parent.path
                    : hostFolder;

            const effectiveHostFolder = hostFolder || baseFolder;

            const rawContent = await this.app.vault.read(baseFile);
            const { properties: filterProperties, targetFolder: filterFolder } = parseBaseFiltersFromYaml(
                rawContent,
                grouping.activeView?.name || grouping.activeView?.type || 'kanban',
                effectiveHostFolder
            );

            // Determine target folder from filter (e.g. file.inFolder) or default to host folder
            const targetFolder = filterFolder !== null ? filterFolder : effectiveHostFolder;

            const modal = new NewColumnModal(this.app, {
                groupProperty,
                filterProperties,
                targetFolder,
                defaultTitle: this.getSettings().defaultNoteTitlePrefix,
                cardCreator: this.cardCreator,
            });

            modal.open();
        };

        buttonEl.addEventListener('click', triggerAction);
        buttonEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                triggerAction(e);
            }
        });

        // Insert item into .bases-toolbar
        insertItem(itemEl);
    }

    /**
     * Cleans up all injected buttons from the DOM.
     */
    cleanup(): void {
        const items = document.querySelectorAll(
            '.bases-toolbar-new-column, .bases-plus-column-button'
        );
        items.forEach((b) => b.remove());
    }
}
