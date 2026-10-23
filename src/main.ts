import { Plugin } from 'obsidian';
import { BaseResolver } from './services/baseResolver';
import { BaseViewService } from './services/baseViewService';
import { CardCreator } from './services/cardCreator';
import { NavigationHandler } from './services/navigationHandler';
import { DEFAULT_SETTINGS, BasesTweaksSettingTab } from './settings';
import { BasesTweaksSettings } from './types';
import { HeaderButtonManager } from './ui/headerButtonManager';
import { OpenModeButtonManager } from './ui/openModeButtonManager';

export default class BasesTweaksPlugin extends Plugin {
    settings: BasesTweaksSettings = DEFAULT_SETTINGS;
    baseResolver!: BaseResolver;
    baseViewService!: BaseViewService;
    navigationHandler!: NavigationHandler;
    cardCreator!: CardCreator;
    headerButtonManager!: HeaderButtonManager;
    openModeButtonManager!: OpenModeButtonManager;

    private mutationObserver: MutationObserver | null = null;
    private debouncedUpdateTimeout: ReturnType<typeof setTimeout> | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        // 1. Initialize services
        this.baseResolver = new BaseResolver(this.app);
        this.baseViewService = new BaseViewService(this.app);
        this.navigationHandler = new NavigationHandler(
            this.app,
            this.baseResolver,
            () => this.settings,
            () => this.saveSettings()
        );
        this.navigationHandler.init();
        this.cardCreator = new CardCreator(
            this.app,
            this.baseResolver,
            this.navigationHandler
        );
        this.headerButtonManager = new HeaderButtonManager(
            this.app,
            this.baseResolver,
            this.baseViewService,
            this.cardCreator,
            () => this.settings
        );
        this.openModeButtonManager = new OpenModeButtonManager(
            this.app,
            this.baseResolver,
            () => this.settings,
            () => this.saveSettings()
        );

        // 2. Settings tab
        this.addSettingTab(new BasesTweaksSettingTab(this.app, this));

        // 3. Register DOM pointerdown listener
        this.registerDomEvent(
            document,
            'pointerdown',
            (evt: PointerEvent) => {
                if (evt.button !== 0) return;

                const target = evt.target as HTMLElement | null;
                if (!target) return;

                // Handle general clicks in bases-view to apply the configured open mode
                const baseViewEl = target.closest('.bases-view');
                if (baseViewEl) {
                    const isToolbar = target.closest('.bases-toolbar, .bases-view-toolbar');
                    if (!isToolbar) {
                        this.navigationHandler.triggerBaseInteraction(target);
                    }
                }

                // Check for native column card creation buttons
                const button = target.closest<HTMLElement>(
                    '.bases-kanban-column-create, .bases-kanban-column-footer .text-icon-button'
                );
                if (!button) return;

                this.navigationHandler.triggerBaseInteraction(button);

                const columnEl = button.closest('.bases-kanban-column');
                const targetFolder = columnEl?.querySelector('.bases-group-value')?.textContent?.trim();

                // Trigger background card creation handler
                this.cardCreator.handleNativeCardCreation(button, targetFolder);
            },
            true
        );

        // 4. Workspace & Vault events
        this.registerEvent(
            this.app.workspace.on('layout-change', () => this.scheduleButtonUpdate())
        );
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.scheduleButtonUpdate())
        );
        this.registerEvent(
            this.app.workspace.on('resize', () => {
                this.navigationHandler.handleWorkspaceResize();
            })
        );
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.handleFileRename(file.path, oldPath);
            })
        );
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                this.handleFileDelete(file.path);
            })
        );

        // 5. MutationObserver to catch base view rendering and tab switches
        this.mutationObserver = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node instanceof HTMLElement) {
                            if (
                                node.classList.contains('bases-view') ||
                                node.querySelector?.('.bases-view, .bases-kanban')
                            ) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldUpdate) break;
            }
            if (shouldUpdate) {
                this.scheduleButtonUpdate();
            }
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });

        // 6. Initial update when layout is ready
        this.app.workspace.onLayoutReady(() => {
            this.scheduleButtonUpdate();
        });
    }

    private scheduleButtonUpdate(delayMs: number = 100): void {
        if (this.debouncedUpdateTimeout) {
            clearTimeout(this.debouncedUpdateTimeout);
        }
        this.debouncedUpdateTimeout = setTimeout(() => {
            this.headerButtonManager.updateAllButtons();
            this.openModeButtonManager.updateAllButtons();
            this.debouncedUpdateTimeout = null;
        }, delayMs);
    }

    onunload(): void {
        if (this.debouncedUpdateTimeout) {
            clearTimeout(this.debouncedUpdateTimeout);
            this.debouncedUpdateTimeout = null;
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        this.navigationHandler.teardown();
        this.headerButtonManager.cleanup();
        this.openModeButtonManager.cleanup();
    }

    async handleFileRename(newPath: string, oldPath: string): Promise<void> {
        let hasChanges = false;
        const modes = this.settings.perPageOpenModes;
        if (modes) {
            for (const key of Object.keys(modes)) {
                if (key === oldPath) {
                    modes[newPath] = modes[key];
                    delete modes[key];
                    hasChanges = true;
                } else if (key.startsWith(oldPath + '/')) {
                    const subPath = key.slice(oldPath.length);
                    const updatedKey = newPath + subPath;
                    modes[updatedKey] = modes[key];
                    delete modes[key];
                    hasChanges = true;
                }
            }
        }

        const splitSizes = this.settings.perBaseSplitSizes;
        if (splitSizes) {
            for (const key of Object.keys(splitSizes)) {
                if (key === oldPath) {
                    splitSizes[newPath] = splitSizes[key];
                    delete splitSizes[key];
                    hasChanges = true;
                } else if (key.startsWith(oldPath + '/')) {
                    const subPath = key.slice(oldPath.length);
                    const updatedKey = newPath + subPath;
                    splitSizes[updatedKey] = splitSizes[key];
                    delete splitSizes[key];
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await this.saveSettings();
            this.openModeButtonManager.updateAllButtons();
        }
    }

    async handleFileDelete(deletedPath: string): Promise<void> {
        let hasChanges = false;
        const modes = this.settings.perPageOpenModes;
        if (modes) {
            for (const key of Object.keys(modes)) {
                if (key === deletedPath || key.startsWith(deletedPath + '/')) {
                    delete modes[key];
                    hasChanges = true;
                }
            }
        }

        const splitSizes = this.settings.perBaseSplitSizes;
        if (splitSizes) {
            for (const key of Object.keys(splitSizes)) {
                if (key === deletedPath || key.startsWith(deletedPath + '/')) {
                    delete splitSizes[key];
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            await this.saveSettings();
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
