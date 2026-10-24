import { App, Platform, TFile, WorkspaceLeaf } from 'obsidian';
import { BaseOpenMode, BasesTweaksSettings } from '../types';
import { BaseResolver } from './baseResolver';

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

/**
 * Checks if two leaves belong to the same WorkspaceTabs group.
 */
export function areLeavesInSameTabsGroup(leafA: WorkspaceLeaf, leafB: WorkspaceLeaf): boolean {
    if (leafA === leafB) return true;

    // 1. Check parent reference (WorkspaceTabs in Obsidian)
    const parentA = (leafA as any).parent;
    const parentB = (leafB as any).parent;
    if (parentA && parentB) {
        return parentA === parentB;
    }

    // 2. Check DOM container (.workspace-tabs)
    const elA = (leafA as any).containerEl || leafA.view?.containerEl;
    const elB = (leafB as any).containerEl || leafB.view?.containerEl;
    if (elA && elB && typeof elA.closest === 'function' && typeof elB.closest === 'function') {
        const tabsA = elA.closest('.workspace-tabs');
        const tabsB = elB.closest('.workspace-tabs');
        if (tabsA && tabsB) {
            return tabsA === tabsB;
        }
    }

    return false;
}

/**
 * Checks if a leaf is the currently active/visible tab within its parent WorkspaceTabs.
 */
export function isLeafActiveInTabs(leaf: WorkspaceLeaf): boolean {
    const parent = (leaf as any).parent;
    if (parent) {
        if (Array.isArray(parent.children)) {
            // Only child in its tab group is always active
            if (parent.children.length === 1 && parent.children[0] === leaf) {
                return true;
            }
            // Check parent.currentTab index
            if (typeof parent.currentTab === 'number') {
                return parent.children[parent.currentTab] === leaf;
            }
        }
    }

    // Check tabHeaderEl class
    const tabHeaderEl = (leaf as any).tabHeaderEl as HTMLElement | undefined;
    if (tabHeaderEl?.classList) {
        if (tabHeaderEl.classList.contains('is-active')) {
            return true;
        }
    }

    // Check DOM display style on leaf container
    const container = ((leaf as any).containerEl || leaf.view?.containerEl) as HTMLElement | undefined;
    if (container?.style?.display === 'none') {
        return false;
    }
    if (container?.classList?.contains('is-hidden')) {
        return false;
    }

    return true;
}

export class NavigationHandler {
    private isInteractingWithBase = false;
    private interactionResetTimeout: ReturnType<typeof setTimeout> | null = null;
    private lastInteractionTarget: HTMLElement | null = null;
    private lastTargetSplitLeaf: WorkspaceLeaf | null = null;
    private originalOpenLinkText: typeof App.prototype.workspace.openLinkText | null = null;
    private originalGetLeaf: typeof App.prototype.workspace.getLeaf | null = null;
    private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private getSettings: () => BasesTweaksSettings,
        private saveSettings?: () => Promise<void>
    ) {}

    /**
     * Resolves the effective open mode, taking into account:
     * 1. Phone platform (always 'current')
     * 2. Per-page host override (highest priority)
     * 3. Underlying Base file override (inherited by embeds)
     * 4. Global configured setting (settings.baseOpenMode)
     */
    getEffectiveModeForContext(contextEl?: HTMLElement | null): BaseOpenMode {
        if (Platform.isPhone) {
            return 'current';
        }

        const targetEl = contextEl || this.lastInteractionTarget;
        const hostFile = this.baseResolver.resolveHostFile(targetEl);
        const baseFile = this.baseResolver.resolveBaseFileSync(targetEl);
        const perPageModes = this.getSettings().perPageOpenModes || {};

        // 1. Specific host note override
        if (hostFile && perPageModes[hostFile.path]) {
            return perPageModes[hostFile.path];
        }

        // 2. Underlying Base file override (inherited)
        if (baseFile && perPageModes[baseFile.path]) {
            return perPageModes[baseFile.path];
        }

        // 3. Fallback to global plugin setting
        return this.getSettings().baseOpenMode;
    }

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
            let isSplit = false;
            if (self.isInteractingWithBase) {
                const effectiveMode = self.getEffectiveModeForContext(self.lastInteractionTarget);
                if (effectiveMode === 'split') {
                    newLeaf = 'split';
                    isSplit = true;
                } else if (effectiveMode === 'tab') {
                    newLeaf = 'tab';
                } else {
                    newLeaf = false;
                }
            }
            const res = self.originalOpenLinkText!.call(
                this,
                linktext,
                sourcePath,
                newLeaf,
                openViewState
            );
            if (isSplit) {
                self.restoreSplitSizeForContext(self.lastInteractionTarget);
            }
            return res;
        };

        // Patch getLeaf
        workspace.getLeaf = function (newLeaf?: any) {
            if (self.isInteractingWithBase && newLeaf !== 'window') {
                const effectiveMode = self.getEffectiveModeForContext(self.lastInteractionTarget);
                if (effectiveMode === 'split') {
                    return self.getOrCreateSplitLeaf(self.lastInteractionTarget);
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
     * Finds an existing markdown/editor leaf in an active split pane that is NOT
     * in the same tab group as the base leaf and NOT a background tab.
     */
    findExistingSplitLeaf(contextEl?: HTMLElement | null): WorkspaceLeaf | null {
        const baseLeaf = this.findBaseLeafForContext(contextEl);

        // Check how many tab groups exist in the main workspace
        const tabGroups = new Set<any>();
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!this.isMainWorkspaceLeaf(leaf)) return;
            const parent = (leaf as any).parent;
            if (parent) {
                tabGroups.add(parent);
            } else {
                const tabsEl = (leaf.view?.containerEl || (leaf as any).containerEl)?.closest?.('.workspace-tabs');
                if (tabsEl) {
                    tabGroups.add(tabsEl);
                }
            }
        });

        // If at least one tab group was detected and only 1 exists in the main workspace,
        // no split pane is open at all (all tabs are in the same tab group).
        if (tabGroups.size === 1) {
            return null;
        }

        // 1. If we previously targeted a split leaf, check if it is still a valid active split
        if (
            this.lastTargetSplitLeaf &&
            this.lastTargetSplitLeaf.view?.containerEl?.isConnected &&
            this.isMainWorkspaceLeaf(this.lastTargetSplitLeaf) &&
            !this.isBaseLeaf(this.lastTargetSplitLeaf) &&
            (!baseLeaf || !areLeavesInSameTabsGroup(baseLeaf, this.lastTargetSplitLeaf))
        ) {
            // If the last target leaf itself is active in its tab group, reuse it
            if (isLeafActiveInTabs(this.lastTargetSplitLeaf)) {
                return this.lastTargetSplitLeaf;
            }

            // If another tab became active in that same split tab group, use that active tab
            const targetParent = (this.lastTargetSplitLeaf as any).parent;
            if (targetParent && Array.isArray(targetParent.children) && typeof targetParent.currentTab === 'number') {
                const activeInSameGroup = targetParent.children[targetParent.currentTab];
                if (
                    activeInSameGroup &&
                    !this.isBaseLeaf(activeInSameGroup) &&
                    activeInSameGroup.view?.containerEl?.isConnected
                ) {
                    this.lastTargetSplitLeaf = activeInSameGroup;
                    return activeInSameGroup;
                }
            }
        }

        // 2. Scan all leaves in the main workspace for an active editor leaf in a different tab group
        let candidate: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (candidate) return;
            if (!leaf.view?.containerEl?.isConnected) return;
            if (!this.isMainWorkspaceLeaf(leaf)) return;
            if (this.isBaseLeaf(leaf)) return;

            // Must NOT be in the same tab group as the base leaf
            if (baseLeaf && areLeavesInSameTabsGroup(baseLeaf, leaf)) {
                return;
            }

            // Must be the active/visible tab in its tab group (not a background tab)
            if (!isLeafActiveInTabs(leaf)) {
                return;
            }

            const viewType = leaf.view.getViewType?.();
            if (viewType === 'markdown' || viewType === 'empty' || viewType === 'canvas') {
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
     * Finds the base leaf matching the context element or active base in workspace.
     */
    findBaseLeafForContext(contextEl?: HTMLElement | null): WorkspaceLeaf | null {
        const target = contextEl || this.lastInteractionTarget;
        if (target) {
            let matched: WorkspaceLeaf | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (!matched && leaf.view?.containerEl?.contains(target)) {
                    matched = leaf;
                }
            });
            if (matched) return matched;
        }

        let fallback: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (!fallback && this.isMainWorkspaceLeaf(leaf) && this.isBaseLeaf(leaf)) {
                fallback = leaf;
            }
        });
        return fallback;
    }

    /**
     * Resolves the saved split size (dimension percentage) for the current base.
     */
    getSavedSplitSize(contextEl?: HTMLElement | null, baseLeaf?: WorkspaceLeaf | null): number | null {
        const settings = this.getSettings();

        if (settings.splitSizeScope === 'global') {
            return typeof settings.globalSplitSize === 'number' ? settings.globalSplitSize : null;
        }

        const el = contextEl || this.lastInteractionTarget || baseLeaf?.view?.containerEl;
        const hostFile = this.baseResolver?.resolveHostFile ? this.baseResolver.resolveHostFile(el) : null;
        const baseFile = this.baseResolver?.resolveBaseFileSync ? this.baseResolver.resolveBaseFileSync(el) : null;

        const perBaseSizes = settings.perBaseSplitSizes || {};

        if (hostFile && typeof perBaseSizes[hostFile.path] === 'number') {
            return perBaseSizes[hostFile.path];
        }
        if (baseFile && typeof perBaseSizes[baseFile.path] === 'number') {
            return perBaseSizes[baseFile.path];
        }

        if (typeof settings.globalSplitSize === 'number') {
            return settings.globalSplitSize;
        }

        return null;
    }

    /**
     * Restores the saved split size between the base view and target note leaf.
     */
    restoreSplitSizeForContext(contextEl?: HTMLElement | null, targetLeaf?: WorkspaceLeaf | null): void {
        const baseLeaf = this.findBaseLeafForContext(contextEl);
        if (!baseLeaf) return;

        const target = targetLeaf || this.lastTargetSplitLeaf || this.findExistingSplitLeaf();
        if (!target) return;

        const savedRatio = this.getSavedSplitSize(contextEl, baseLeaf);
        if (!savedRatio || savedRatio < 15 || savedRatio > 85) return;

        const baseTabs = (baseLeaf as any).parent;
        const noteTabs = (target as any).parent;
        if (!baseTabs || !noteTabs || baseTabs.parent !== noteTabs.parent) return;

        const parentSplit = baseTabs.parent;
        this.applySplitRatio(baseTabs, noteTabs, parentSplit, savedRatio);
    }

    /**
     * Applies the split ratio to both tabs containers.
     */
    applySplitRatio(baseTabs: any, noteTabs: any, parentSplit: any, savedRatio: number): void {
        const apply = () => {
            const baseRatio = savedRatio;
            const noteRatio = 100 - savedRatio;

            if (typeof baseTabs.setDimension === 'function') {
                baseTabs.setDimension(baseRatio);
            }
            if (typeof noteTabs.setDimension === 'function') {
                noteTabs.setDimension(noteRatio);
            }
            if (baseTabs.containerEl) {
                baseTabs.containerEl.style.flexGrow = String(baseRatio);
            }
            if (noteTabs.containerEl) {
                noteTabs.containerEl.style.flexGrow = String(noteRatio);
            }
            if (typeof parentSplit?.recomputeChildrenDimensions === 'function') {
                parentSplit.recomputeChildrenDimensions();
            }
            if (typeof (this.app.workspace as any).requestResize === 'function') {
                (this.app.workspace as any).requestResize();
            }
        };

        apply();
        setTimeout(apply, 50);
        setTimeout(apply, 150);
    }

    /**
     * Debounced handler for workspace resize events to record user-adjusted split ratios.
     */
    handleWorkspaceResize(): void {
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
        }
        this.resizeDebounceTimer = setTimeout(() => {
            this.checkAndSaveCurrentSplitSize();
            this.resizeDebounceTimer = null;
        }, 300);
    }

    /**
     * Checks if a base split is currently open and saves the user-adjusted ratio.
     */
    checkAndSaveCurrentSplitSize(): void {
        let foundPair: any = null;

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (foundPair) return;
            if (!this.isMainWorkspaceLeaf(leaf) || !this.isBaseLeaf(leaf)) return;

            const baseTabs = (leaf as any).parent;
            const parentSplit = baseTabs?.parent;
            if (!parentSplit || !Array.isArray(parentSplit.children) || parentSplit.children.length < 2) return;

            for (const sibling of parentSplit.children) {
                if (sibling === baseTabs) continue;
                const hasEditorLeaf = sibling.children?.some(
                    (l: WorkspaceLeaf) => !this.isBaseLeaf(l) && l.view?.getViewType?.() !== 'empty'
                );
                if (hasEditorLeaf) {
                    foundPair = { baseLeaf: leaf, baseTabs, noteTabs: sibling, parentSplit };
                    break;
                }
            }
        });

        if (!foundPair) return;

        const { baseLeaf, baseTabs, noteTabs, parentSplit } = foundPair;
        const isVertical = parentSplit.direction === 'vertical';
        const baseSize = isVertical ? baseTabs.containerEl?.offsetWidth : baseTabs.containerEl?.offsetHeight;
        const noteSize = isVertical ? noteTabs.containerEl?.offsetWidth : noteTabs.containerEl?.offsetHeight;

        if (!baseSize || !noteSize || baseSize + noteSize === 0) return;

        const ratio = Math.round((baseSize / (baseSize + noteSize)) * 100);
        if (ratio < 15 || ratio > 85) return;

        const hostFile = this.baseResolver?.resolveHostFile ? this.baseResolver.resolveHostFile(baseLeaf.view?.containerEl) : null;
        const baseFile = this.baseResolver?.resolveBaseFileSync ? this.baseResolver.resolveBaseFileSync(baseLeaf.view?.containerEl) : null;

        const settings = this.getSettings();

        // If global scope is selected, save just one single global entry
        if (settings.splitSizeScope === 'global') {
            if (settings.globalSplitSize !== ratio) {
                settings.globalSplitSize = ratio;
                if (this.saveSettings) {
                    this.saveSettings();
                }
            }
            return;
        }

        if (!settings.perBaseSplitSizes) {
            settings.perBaseSplitSizes = {};
        }

        let hasChanges = false;
        if (baseFile && settings.perBaseSplitSizes[baseFile.path] !== ratio) {
            settings.perBaseSplitSizes[baseFile.path] = ratio;
            hasChanges = true;
        }
        if (hostFile && hostFile !== baseFile && settings.perBaseSplitSizes[hostFile.path] !== ratio) {
            settings.perBaseSplitSizes[hostFile.path] = ratio;
            hasChanges = true;
        }

        if (hasChanges && this.saveSettings) {
            this.saveSettings();
        }
    }

    /**
     * Gets an existing split leaf or creates a new one via originalGetLeaf('split').
     */
    getOrCreateSplitLeaf(contextEl?: HTMLElement | null): WorkspaceLeaf {
        const targetContext = contextEl || this.lastInteractionTarget;
        const existing = this.findExistingSplitLeaf(targetContext);
        if (existing) {
            this.restoreSplitSizeForContext(targetContext, existing);
            return existing;
        }

        const newLeaf = this.originalGetLeaf
            ? this.originalGetLeaf.call(this.app.workspace, 'split')
            : (this.app.workspace.getLeaf as any)('split');

        this.lastTargetSplitLeaf = newLeaf;
        this.restoreSplitSizeForContext(targetContext, newLeaf);
        return newLeaf;
    }

    /**
     * Opens a given TFile using the effective open mode.
     */
    async openFileWithMode(
        file: TFile,
        mode?: BaseOpenMode,
        contextEl?: HTMLElement | null
    ): Promise<WorkspaceLeaf> {
        const effectiveMode = mode || this.getEffectiveModeForContext(contextEl || this.lastInteractionTarget);

        let leaf: WorkspaceLeaf;
        if (effectiveMode === 'split') {
            leaf = this.getOrCreateSplitLeaf(contextEl || this.lastInteractionTarget);
            this.restoreSplitSizeForContext(contextEl || this.lastInteractionTarget, leaf);
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
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
            this.resizeDebounceTimer = null;
        }
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
