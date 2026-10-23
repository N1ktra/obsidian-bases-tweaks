import { App, Menu, setIcon } from 'obsidian';
import { BaseResolver } from '../services/baseResolver';
import { BaseOpenMode, KanbanBasesPlusSettings } from '../types';

export class OpenModeButtonManager {
    private isUpdating = false;

    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private getSettings: () => KanbanBasesPlusSettings,
        private saveSettings: () => Promise<void>
    ) {}

    /**
     * Updates or injects the open mode dropdown button into all .bases-toolbar elements.
     */
    async updateAllButtons(): Promise<void> {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            const toolbars = Array.from(document.querySelectorAll<HTMLElement>('.bases-toolbar'));
            for (const toolbarEl of toolbars) {
                await this.updateButtonForToolbar(toolbarEl);
            }
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Updates or injects the open mode dropdown button for a specific toolbar.
     */
    async updateButtonForToolbar(toolbarEl: HTMLElement): Promise<void> {
        const existingItem = toolbarEl.querySelector<HTMLElement>('.bases-toolbar-open-mode-menu');

        // Resolve host file (or base file) to identify the storage key for this page
        const hostFile = this.baseResolver.resolveHostFile(toolbarEl);
        const baseFile = await this.baseResolver.resolveBaseFile(toolbarEl);
        const pageKey = hostFile?.path || baseFile?.path;

        if (!pageKey) {
            existingItem?.remove();
            return;
        }

        const settings = this.getSettings();
        const perPageModes = settings.perPageOpenModes || {};
        const currentOverride = perPageModes[pageKey];
        const globalMode = settings.baseOpenMode;

        // If item already exists, just update its display text & icon
        if (existingItem) {
            this.updateButtonDisplay(existingItem, currentOverride, globalMode);
            return;
        }

        // Create the native-matching .bases-toolbar-item
        const itemEl = document.createElement('div');
        itemEl.className = 'bases-toolbar-item bases-toolbar-open-mode-menu';

        const buttonEl = document.createElement('div');
        buttonEl.className = 'text-icon-button tappable';
        buttonEl.setAttribute('tabindex', '0');
        buttonEl.setAttribute('role', 'button');
        buttonEl.setAttribute('aria-label', 'Öffnungsmodus für diese Seite ändern');

        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-button-icon';
        buttonEl.appendChild(iconSpan);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-button-label';
        buttonEl.appendChild(labelSpan);

        const auxSpan = document.createElement('span');
        auxSpan.className = 'text-button-icon mod-aux';
        setIcon(auxSpan, 'chevrons-up-down');
        buttonEl.appendChild(auxSpan);

        itemEl.appendChild(buttonEl);

        this.updateButtonDisplay(itemEl, currentOverride, globalMode);

        const showMenu = (e: MouseEvent | KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const menu = new Menu();
            const currentSettings = this.getSettings();
            const currentModes = currentSettings.perPageOpenModes || {};
            const activeOverride = currentModes[pageKey];
            const currentGlobalMode = currentSettings.baseOpenMode;

            menu.addItem((item) => {
                item.setTitle(`Standard (${this.getModeName(currentGlobalMode)})`)
                    .setIcon('rotate-ccw')
                    .setChecked(!activeOverride)
                    .onClick(async () => {
                        delete this.getSettings().perPageOpenModes[pageKey];
                        await this.saveSettings();
                        this.updateButtonDisplay(itemEl, undefined, this.getSettings().baseOpenMode);
                    });
            });

            menu.addSeparator();

            menu.addItem((item) => {
                item.setTitle('Im Split-Modus')
                    .setIcon('columns')
                    .setChecked(activeOverride === 'split')
                    .onClick(async () => {
                        this.getSettings().perPageOpenModes[pageKey] = 'split';
                        await this.saveSettings();
                        this.updateButtonDisplay(itemEl, 'split', this.getSettings().baseOpenMode);
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Im neuen Tab')
                    .setIcon('file-plus')
                    .setChecked(activeOverride === 'tab')
                    .onClick(async () => {
                        this.getSettings().perPageOpenModes[pageKey] = 'tab';
                        await this.saveSettings();
                        this.updateButtonDisplay(itemEl, 'tab', this.getSettings().baseOpenMode);
                    });
            });

            menu.addItem((item) => {
                item.setTitle('Im selben Tab')
                    .setIcon('file-text')
                    .setChecked(activeOverride === 'current')
                    .onClick(async () => {
                        this.getSettings().perPageOpenModes[pageKey] = 'current';
                        await this.saveSettings();
                        this.updateButtonDisplay(itemEl, 'current', this.getSettings().baseOpenMode);
                    });
            });

            if (e instanceof MouseEvent) {
                menu.showAtMouseEvent(e);
            } else {
                const rect = buttonEl.getBoundingClientRect();
                menu.showAtPosition({ x: rect.left, y: rect.bottom });
            }
        };

        buttonEl.addEventListener('click', showMenu);
        buttonEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                showMenu(e);
            }
        });

        // Insert directly after .bases-toolbar-views-menu (auf der linken Gruppe)
        const viewsMenu = toolbarEl.querySelector('.bases-toolbar-views-menu');
        if (viewsMenu) {
            viewsMenu.insertAdjacentElement('afterend', itemEl);
        } else {
            toolbarEl.insertBefore(itemEl, toolbarEl.firstChild);
        }
    }

    private updateButtonDisplay(
        container: HTMLElement,
        overrideMode: BaseOpenMode | undefined,
        globalMode: BaseOpenMode
    ): void {
        const iconSpan = container.querySelector<HTMLElement>('.text-button-icon:not(.mod-aux)');
        const labelSpan = container.querySelector<HTMLElement>('.text-button-label');

        const activeMode = overrideMode || globalMode;
        const isCustom = !!overrideMode;

        let iconName = 'columns';
        let labelText = 'Split';

        if (activeMode === 'split') {
            iconName = 'columns';
            labelText = isCustom ? 'Split' : 'Split (Std)';
        } else if (activeMode === 'tab') {
            iconName = 'file-plus';
            labelText = isCustom ? 'Tab' : 'Tab (Std)';
        } else if (activeMode === 'current') {
            iconName = 'file-text';
            labelText = isCustom ? 'Selber Tab' : 'Selber Tab (Std)';
        }

        if (iconSpan) {
            iconSpan.innerHTML = '';
            setIcon(iconSpan, iconName);
        }
        if (labelSpan) {
            labelSpan.textContent = labelText;
        }
    }

    private getModeName(mode: BaseOpenMode): string {
        switch (mode) {
            case 'split':
                return 'Split';
            case 'tab':
                return 'Neuer Tab';
            case 'current':
                return 'Selber Tab';
        }
    }

    /**
     * Cleans up all injected open mode buttons.
     */
    cleanup(): void {
        document.querySelectorAll('.bases-toolbar-open-mode-menu').forEach((el) => el.remove());
    }
}
