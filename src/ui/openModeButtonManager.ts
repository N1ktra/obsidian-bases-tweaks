import { App, Menu, setIcon } from 'obsidian';
import { BaseResolver } from '../services/baseResolver';
import { BaseOpenMode, BasesTweaksSettings } from '../types';

export class OpenModeButtonManager {
    private isUpdating = false;

    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private getSettings: () => BasesTweaksSettings,
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

        // Resolve host file (where embed is displayed) and underlying base file
        const hostFile = this.baseResolver.resolveHostFile(toolbarEl);
        const baseFile = await this.baseResolver.resolveBaseFile(toolbarEl);

        const pageKey = hostFile?.path;
        const baseKey = baseFile?.path;

        if (!pageKey && !baseKey) {
            existingItem?.remove();
            return;
        }

        const settings = this.getSettings();
        const perPageModes = settings.perPageOpenModes || {};

        const pageOverride = pageKey ? perPageModes[pageKey] : undefined;
        const baseOverride = baseKey ? perPageModes[baseKey] : undefined;
        const globalMode = settings.baseOpenMode;

        // If item already exists, update its display
        if (existingItem) {
            this.updateButtonDisplay(existingItem, pageOverride, baseOverride, globalMode);
            return;
        }

        // Create the native-matching .bases-toolbar-item
        const itemEl = document.createElement('div');
        itemEl.className = 'bases-toolbar-item bases-toolbar-open-mode-menu';

        const buttonEl = document.createElement('div');
        buttonEl.className = 'text-icon-button tappable';
        buttonEl.setAttribute('tabindex', '0');
        buttonEl.setAttribute('role', 'button');
        buttonEl.setAttribute('aria-label', 'Öffnungsmodus anpassen');

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

        this.updateButtonDisplay(itemEl, pageOverride, baseOverride, globalMode);

        const showMenu = (e: MouseEvent | KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const menu = new Menu();
            const currentSettings = this.getSettings();
            const currentModes = currentSettings.perPageOpenModes || {};

            const currentPageOverride = pageKey ? currentModes[pageKey] : undefined;
            const currentBaseOverride = baseKey ? currentModes[baseKey] : undefined;
            const currentGlobalMode = currentSettings.baseOpenMode;

            const isEmbedded = hostFile && baseFile && hostFile.path !== baseFile.path;
            const effectiveBaseMode = currentBaseOverride || currentGlobalMode;

            // Section 1: For this host page (if embedded)
            if (isEmbedded && pageKey && hostFile) {
                menu.addItem((item) => {
                    item.setTitle(`📌 Diese Seite: ${hostFile.basename}`).setDisabled(true);
                });

                menu.addItem((item) => {
                    item.setTitle(`Standard (von Base erben: ${this.getModeName(effectiveBaseMode)})`)
                        .setIcon('rotate-ccw')
                        .setChecked(!currentPageOverride)
                        .onClick(async () => {
                            delete this.getSettings().perPageOpenModes[pageKey];
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                undefined,
                                this.getSettings().perPageOpenModes[baseKey || ''],
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im Split-Modus')
                        .setIcon('columns')
                        .setChecked(currentPageOverride === 'split')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[pageKey] = 'split';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                'split',
                                this.getSettings().perPageOpenModes[baseKey || ''],
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im neuen Tab')
                        .setIcon('file-plus')
                        .setChecked(currentPageOverride === 'tab')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[pageKey] = 'tab';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                'tab',
                                this.getSettings().perPageOpenModes[baseKey || ''],
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im selben Tab')
                        .setIcon('file-text')
                        .setChecked(currentPageOverride === 'current')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[pageKey] = 'current';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                'current',
                                this.getSettings().perPageOpenModes[baseKey || ''],
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addSeparator();
            }

            // Section 2: For the underlying base file
            if (baseKey && baseFile) {
                const baseHeaderTitle = isEmbedded
                    ? `🗄️ Dahinterliegende Base: ${baseFile.basename}`
                    : `🗄️ Für diese Base: ${baseFile.basename}`;

                menu.addItem((item) => {
                    item.setTitle(baseHeaderTitle).setDisabled(true);
                });

                menu.addItem((item) => {
                    item.setTitle(`Standard (Global: ${this.getModeName(currentGlobalMode)})`)
                        .setIcon('rotate-ccw')
                        .setChecked(!currentBaseOverride)
                        .onClick(async () => {
                            delete this.getSettings().perPageOpenModes[baseKey];
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                pageKey ? this.getSettings().perPageOpenModes[pageKey] : undefined,
                                undefined,
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im Split-Modus')
                        .setIcon('columns')
                        .setChecked(currentBaseOverride === 'split')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[baseKey] = 'split';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                pageKey ? this.getSettings().perPageOpenModes[pageKey] : undefined,
                                'split',
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im neuen Tab')
                        .setIcon('file-plus')
                        .setChecked(currentBaseOverride === 'tab')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[baseKey] = 'tab';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                pageKey ? this.getSettings().perPageOpenModes[pageKey] : undefined,
                                'tab',
                                this.getSettings().baseOpenMode
                            );
                        });
                });

                menu.addItem((item) => {
                    item.setTitle('Im selben Tab')
                        .setIcon('file-text')
                        .setChecked(currentBaseOverride === 'current')
                        .onClick(async () => {
                            this.getSettings().perPageOpenModes[baseKey] = 'current';
                            await this.saveSettings();
                            this.updateButtonDisplay(
                                itemEl,
                                pageKey ? this.getSettings().perPageOpenModes[pageKey] : undefined,
                                'current',
                                this.getSettings().baseOpenMode
                            );
                        });
                });
            }

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
        pageOverride: BaseOpenMode | undefined,
        baseOverride: BaseOpenMode | undefined,
        globalMode: BaseOpenMode
    ): void {
        const iconSpan = container.querySelector<HTMLElement>('.text-button-icon:not(.mod-aux)');
        const labelSpan = container.querySelector<HTMLElement>('.text-button-label');

        // Active mode priority: Page > Base > Global
        const activeMode = pageOverride || baseOverride || globalMode;

        let scopeSuffix = '(Std)';
        let scopeTooltip = 'globaler Standard';

        if (pageOverride) {
            scopeSuffix = '(Seite)';
            scopeTooltip = 'für diese Seite festgelegt';
        } else if (baseOverride) {
            scopeSuffix = '(Base)';
            scopeTooltip = 'von der Base übernommen';
        }

        let iconName = 'columns';
        let baseText = 'Split';

        if (activeMode === 'split') {
            iconName = 'columns';
            baseText = 'Split';
        } else if (activeMode === 'tab') {
            iconName = 'file-plus';
            baseText = 'Tab';
        } else if (activeMode === 'current') {
            iconName = 'file-text';
            baseText = 'Selber Tab';
        }

        if (iconSpan) {
            iconSpan.innerHTML = '';
            setIcon(iconSpan, iconName);
        }
        if (labelSpan) {
            labelSpan.textContent = `${baseText} ${scopeSuffix}`;
        }

        const buttonEl = container.querySelector('.text-icon-button');
        buttonEl?.setAttribute(
            'aria-label',
            `Öffnungsmodus: ${baseText} (${scopeTooltip})`
        );
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
