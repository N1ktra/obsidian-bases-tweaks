import { App, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { BaseOpenMode, KanbanBasesPlusSettings } from '../types';

/**
 * Resolves the effective open mode based on the user's setting and device type.
 * On phones, it ALWAYS returns 'current' (same tab).
 * On desktop and tablets, it returns the user-configured setting.
 */
export function resolveEffectiveOpenMode(
    configuredMode: BaseOpenMode,
    isPhone: boolean = Platform.isPhone
): BaseOpenMode {
    if (isPhone) {
        return 'current';
    }
    return configuredMode;
}

export class NavigationHandler {
    private isInteractingWithBase = false;
    private interactionResetTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastInteractionTarget: HTMLElement | null = null;
    private lastTargetSplitLeaf: WorkspaceLeaf | null = null;
    private originalOpenLinkText: typeof App.prototype.workspace.openLinkText | null = null;
    private originalGetLeaf: typeof App.prototype.workspace.getLeaf | null = null;

    constructor(
        private app: App,
        private getSettings: () => KanbanBasesPlusSettings
    ) {}

    /**
     * Initializes monkey patching on workspace link navigation to enforce
     * the configured open mode when navigating from within a Base view.
     */
    init(): void {
        const workspace = this.app.workspace;
        this.originalOpenLinkText = workspace.openLinkText.bind(workspace);
        this.originalGetLeaf = workspace.getLeaf.bind(workspace);

        const self = this;

        // Patch openLinkText
        workspace.openLinkText = function (
            linktext: string,
            sourcePath: string,
            newLeaf?: boolean | 'tab' | 'split' | 'window',
            openViewState?: any
        ) {
            if (self.isInteractingWithBase) {
                const effectiveMode = resolveEffectiveOpenMode(
                    self.getSettings().baseOpenMode,
                    Platform.isPhone
                );
                if (effectiveMode === 'split') {
                    newLeaf = 'split';
                } else if (effectiveMode === 'tab') {
                    newLeaf = 'tab';
                } else {
                    newLeaf = false;
                }
            }
            return self.originalOpenLinkText!.call(
                this,
                linktext,
                sourcePath,
                newLeaf,
                openViewState
            );
        };

        // Patch getLeaf
        workspace.getLeaf = function (newLeaf?: any) {
            if (self.isInteractingWithBase && newLeaf !== 'window') {
                const effectiveMode = resolveEffectiveOpenMode(
                    self.getSettings().baseOpenMode,
                    Platform.isPhone
                );
                if (effectiveMode === 'split') {
                    return self.getOrCreateSplitLeaf();
                } else if (effectiveMode === 'tab') {
                    return self.originalGetLeaf!.call(this, 'tab');
                } else {
                    return self.originalGetLeaf!.call(this, false);
                }
            }
            return self.originalGetLeaf!.call(this, newLeaf);
        };
    }

    /**
     * Signals that a user interaction (click / pointerdown) happened on a base card or element.
     */
    triggerBaseInteraction(target?: HTMLElement | null, durationMs: number = 500): void {
        this.isInteractingWithBase = true;
        this.lastInteractionTarget = target || null;
        if (this.interactionResetTimeout) {
            clearTimeout(this.interactionResetTimeout);
        }
        this.interactionResetTimeout = setTimeout(() => {
            this.isInteractingWithBase = false;
            this.lastInteractionTarget = null;
            this.interactionResetTimeout = null;
        }, durationMs);
    }

    /**
     * Clears the interaction flag immediately.
     */
    clearInteraction(): void {
        this.isInteractingWithBase = false;
        this.lastInteractionTarget = null;
        if (this.interactionResetTimeout) {
            clearTimeout(this.interactionResetTimeout);
            this.interactionResetTimeout = null;
        }
    }

    /**
     * Checks if a leaf displays a Base view.
     */
    isBaseLeaf(leaf: WorkspaceLeaf): boolean {
        if (!leaf || !leaf.view) return false;
        // @ts-ignore
        const file = leaf.view.file;
        if (file && (file.extension === 'base' || file.path?.endsWith('.base'))) {
            return true;
        }
        const viewType = leaf.view.getViewType?.();
        if (viewType && (viewType === 'base' || viewType.includes('base'))) {
            return true;
        }
        const container = leaf.view.containerEl as HTMLElement;
        if (container && container.querySelector?.('.bases-view')) {
            return true;
        }
        return false;
    }

    /**
     * Checks if a leaf belongs to the central workspace area (not sidebars).
     */
    isMainWorkspaceLeaf(leaf: WorkspaceLeaf): boolean {
        if (!leaf || !leaf.view?.containerEl) return false;
        // @ts-ignore
        if (typeof leaf.getRoot === 'function' && leaf.getRoot() === this.app.workspace.rootSplit) {
            return true;
        }
        const container = leaf.view.containerEl as HTMLElement;
        if (container.closest?.('.mod-left-split, .mod-right-split, .workspace-ribbon, .workspace-drawer')) {
            return false;
        }
        return true;
    }

    /**
     * Finds an existing markdown/editor leaf in the main workspace that is NOT a base view.
     */
    findExistingSplitLeaf(): WorkspaceLeaf | null {
        // 1. If we previously targeted a split leaf and it is still valid and connected
        if (
            this.lastTargetSplitLeaf &&
            this.lastTargetSplitLeaf.view?.containerEl?.isConnected &&
            this.isMainWorkspaceLeaf(this.lastTargetSplitLeaf) &&
            !this.isBaseLeaf(this.lastTargetSplitLeaf)
        ) {
            return this.lastTargetSplitLeaf;
        }

        // 2. Scan all leaves in the main workspace for an existing editor leaf
        let candidate: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (candidate) return;
            if (!leaf.view?.containerEl?.isConnected) return;
            if (!this.isMainWorkspaceLeaf(leaf)) return;
            if (this.isBaseLeaf(leaf)) return;

            const viewType = leaf.view.getViewType?.();
            if (viewType === 'markdown' || viewType === 'empty') {
                candidate = leaf;
            }
        });

        if (candidate) {
            this.lastTargetSplitLeaf = candidate;
            return candidate;
        }

        return null;
    }

    /**
     * Gets an existing split leaf or creates a new one via originalGetLeaf('split').
     */
    getOrCreateSplitLeaf(): WorkspaceLeaf {
        const existing = this.findExistingSplitLeaf();
        if (existing) {
            return existing;
        }

        const newLeaf = this.originalGetLeaf
            ? this.originalGetLeaf.call(this.app.workspace, 'split')
            : (this.app.workspace.getLeaf as any)('split');

        this.lastTargetSplitLeaf = newLeaf;
        return newLeaf;
    }

    /**
     * Opens a given TFile using the effective open mode.
     */
    async openFileWithMode(
        file: TFile,
        mode?: BaseOpenMode,
        _contextEl?: HTMLElement | null
    ): Promise<WorkspaceLeaf> {
        const effectiveMode = mode || resolveEffectiveOpenMode(
            this.getSettings().baseOpenMode,
            Platform.isPhone
        );

        let leaf: WorkspaceLeaf;
        if (effectiveMode === 'split') {
            leaf = this.getOrCreateSplitLeaf();
        } else if (effectiveMode === 'tab') {
            // @ts-ignore Obsidian supports getLeaf('tab')
            leaf = this.app.workspace.getLeaf('tab');
        } else {
            leaf = this.app.workspace.getLeaf(false);
        }

        await leaf.openFile(file);
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        return leaf;
    }

    /**
     * Restores original methods on unload.
     */
    teardown(): void {
        if (this.originalOpenLinkText) {
            this.app.workspace.openLinkText = this.originalOpenLinkText;
            this.originalOpenLinkText = null;
        }
        if (this.originalGetLeaf) {
            this.app.workspace.getLeaf = this.originalGetLeaf;
            this.originalGetLeaf = null;
        }
        this.lastTargetSplitLeaf = null;
        this.clearInteraction();
    }
}
