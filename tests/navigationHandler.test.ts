import { describe, expect, it, vi } from 'vitest';
import {
    NavigationHandler,
    resolveEffectiveOpenMode,
    areLeavesInSameTabsGroup,
    isLeafActiveInTabs,
} from '../src/services/navigationHandler';
import { BasesTweaksSettings } from '../src/types';
import { WorkspaceLeaf } from './mocks/obsidian';

function createMockSettings(overrides: Partial<BasesTweaksSettings> = {}): BasesTweaksSettings {
    return {
        baseOpenMode: 'split',
        defaultNoteTitlePrefix: 'Neuer Eintrag',
        perPageOpenModes: {},
        splitSizeScope: 'per-base',
        globalSplitSize: null,
        perBaseSplitSizes: {},
        ...overrides,
    };
}

describe('navigationHandler', () => {
    describe('resolveEffectiveOpenMode', () => {
        it('always returns current on phone regardless of setting', () => {
            expect(resolveEffectiveOpenMode('split', true)).toBe('current');
            expect(resolveEffectiveOpenMode('tab', true)).toBe('current');
            expect(resolveEffectiveOpenMode('current', true)).toBe('current');
        });

        it('respects split setting on desktop and tablet (non-phone)', () => {
            expect(resolveEffectiveOpenMode('split', false)).toBe('split');
        });

        it('respects tab setting on desktop and tablet (non-phone)', () => {
            expect(resolveEffectiveOpenMode('tab', false)).toBe('tab');
        });

        it('respects current setting on desktop and tablet (non-phone)', () => {
            expect(resolveEffectiveOpenMode('current', false)).toBe('current');
        });
    });

    describe('split leaf reuse', () => {
        it('creates a new split leaf if no other split leaf exists', () => {
            const sourceBaseLeaf = new WorkspaceLeaf();
            sourceBaseLeaf.view.getViewType = () => 'base';

            const newSplitLeaf = new WorkspaceLeaf();
            newSplitLeaf.view.getViewType = () => 'markdown';

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    openLinkText: vi.fn(),
                    getLeaf: vi.fn((type: string) => {
                        if (type === 'split') return newSplitLeaf;
                        return new WorkspaceLeaf();
                    }),
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(sourceBaseLeaf);
                    },
                    getLeavesOfType: () => [sourceBaseLeaf],
                },
            } as any;

            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => null,
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => createMockSettings()
            );

            const resultLeaf = handler.getOrCreateSplitLeaf();
            expect(resultLeaf).toBe(newSplitLeaf);
            expect(mockApp.workspace.getLeaf).toHaveBeenCalledWith('split');
        });

        it('reuses existing split leaf instead of creating another split', () => {
            const sourceBaseLeaf = new WorkspaceLeaf();
            sourceBaseLeaf.view.getViewType = () => 'base';

            const existingSplitLeaf = new WorkspaceLeaf();
            existingSplitLeaf.view.getViewType = () => 'markdown';

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    openLinkText: vi.fn(),
                    getLeaf: vi.fn(),
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(sourceBaseLeaf);
                        cb(existingSplitLeaf);
                    },
                    getLeavesOfType: () => [sourceBaseLeaf],
                },
            } as any;

            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => null,
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => createMockSettings()
            );

            // First call finds existing leaf
            const result1 = handler.getOrCreateSplitLeaf();
            expect(result1).toBe(existingSplitLeaf);

            // getLeaf('split') should NOT have been called!
            expect(mockApp.workspace.getLeaf).not.toHaveBeenCalled();

            // Subsequent calls also reuse the same leaf
            const result2 = handler.getOrCreateSplitLeaf();
            expect(result2).toBe(existingSplitLeaf);
            expect(mockApp.workspace.getLeaf).not.toHaveBeenCalled();
        });

        it('does NOT overwrite a background tab in the same tab group, but creates a new split', () => {
            const tabGroup1 = {
                children: [] as any[],
                currentTab: 0,
            };

            const baseLeaf = new WorkspaceLeaf();
            baseLeaf.view.getViewType = () => 'base';
            baseLeaf.parent = tabGroup1;

            const backgroundNoteLeaf = new WorkspaceLeaf();
            backgroundNoteLeaf.view.getViewType = () => 'markdown';
            backgroundNoteLeaf.parent = tabGroup1;

            tabGroup1.children = [baseLeaf, backgroundNoteLeaf];
            // baseLeaf is active (currentTab = 0), backgroundNoteLeaf is in background

            const newlyCreatedSplitLeaf = new WorkspaceLeaf();
            newlyCreatedSplitLeaf.view.getViewType = () => 'markdown';
            const tabGroup2 = {
                children: [newlyCreatedSplitLeaf],
                currentTab: 0,
            };
            newlyCreatedSplitLeaf.parent = tabGroup2;

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    openLinkText: vi.fn(),
                    getLeaf: vi.fn((type: string) => {
                        if (type === 'split') return newlyCreatedSplitLeaf;
                        return new WorkspaceLeaf();
                    }),
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(baseLeaf);
                        cb(backgroundNoteLeaf);
                    },
                    getLeavesOfType: () => [baseLeaf],
                },
            } as any;

            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => null,
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => createMockSettings({ baseOpenMode: 'split' })
            );

            // Trigger base interaction with baseLeaf's container
            handler.triggerBaseInteraction(baseLeaf.view.containerEl);

            const result = handler.getOrCreateSplitLeaf(baseLeaf.view.containerEl);

            // It MUST create a new split instead of reusing the background tab in the same tab group!
            expect(mockApp.workspace.getLeaf).toHaveBeenCalledWith('split');
            expect(result).toBe(newlyCreatedSplitLeaf);
            expect(result).not.toBe(backgroundNoteLeaf);
        });

        it('reuses the active tab in an existing split pane, leaving background tabs in that split untouched', () => {
            const tabGroup1 = {
                children: [] as any[],
                currentTab: 0,
            };

            const baseLeaf = new WorkspaceLeaf();
            baseLeaf.view.getViewType = () => 'base';
            baseLeaf.parent = tabGroup1;
            tabGroup1.children = [baseLeaf];

            const tabGroup2 = {
                children: [] as any[],
                currentTab: 1, // active tab is index 1
            };

            const splitBackgroundNote = new WorkspaceLeaf();
            splitBackgroundNote.view.getViewType = () => 'markdown';
            splitBackgroundNote.parent = tabGroup2;

            const splitActiveNote = new WorkspaceLeaf();
            splitActiveNote.view.getViewType = () => 'markdown';
            splitActiveNote.parent = tabGroup2;

            tabGroup2.children = [splitBackgroundNote, splitActiveNote];

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    openLinkText: vi.fn(),
                    getLeaf: vi.fn(),
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(baseLeaf);
                        cb(splitBackgroundNote);
                        cb(splitActiveNote);
                    },
                    getLeavesOfType: () => [baseLeaf],
                },
            } as any;

            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => null,
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => createMockSettings({ baseOpenMode: 'split' })
            );

            handler.triggerBaseInteraction(baseLeaf.view.containerEl);
            const result = handler.getOrCreateSplitLeaf(baseLeaf.view.containerEl);

            // It should reuse splitActiveNote (the active tab in the split), NOT create a new split or use background tab
            expect(mockApp.workspace.getLeaf).not.toHaveBeenCalled();
            expect(result).toBe(splitActiveNote);
            expect(result).not.toBe(splitBackgroundNote);
        });

        it('helper functions areLeavesInSameTabsGroup and isLeafActiveInTabs work accurately', () => {
            const tabs1 = { children: [] as any[], currentTab: 0 };
            const tabs2 = { children: [] as any[], currentTab: 0 };

            const leaf1 = new WorkspaceLeaf();
            leaf1.parent = tabs1;

            const leaf2 = new WorkspaceLeaf();
            leaf2.parent = tabs1;

            const leaf3 = new WorkspaceLeaf();
            leaf3.parent = tabs2;

            tabs1.children = [leaf1, leaf2];
            tabs2.children = [leaf3];

            expect(areLeavesInSameTabsGroup(leaf1 as any, leaf2 as any)).toBe(true);
            expect(areLeavesInSameTabsGroup(leaf1 as any, leaf3 as any)).toBe(false);

            expect(isLeafActiveInTabs(leaf1 as any)).toBe(true);
            expect(isLeafActiveInTabs(leaf2 as any)).toBe(false);
            expect(isLeafActiveInTabs(leaf3 as any)).toBe(true);
        });

        it('respects per-page open mode override if defined', () => {
            const hostNote = { path: 'Uni/SwSec.md' } as any;
            const baseFile = { path: 'Uni/Uni-Notizen.base' } as any;
            const mockBaseResolver = {
                resolveHostFile: () => hostNote,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const mockApp = {
                workspace: { rootSplit: {} },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () =>
                    createMockSettings({
                        perPageOpenModes: {
                            'Uni/SwSec.md': 'tab',
                        },
                    })
            );

            const mode = handler.getEffectiveModeForContext({} as any);
            expect(mode).toBe('tab');
        });

        it('inherits open mode from underlying base file when host note has no setting', () => {
            const hostNote = { path: 'Uni/SwSec.md' } as any;
            const baseFile = { path: 'Uni/Uni-Notizen.base' } as any;
            const mockBaseResolver = {
                resolveHostFile: () => hostNote,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const mockApp = {
                workspace: { rootSplit: {} },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () =>
                    createMockSettings({
                        perPageOpenModes: {
                            'Uni/Uni-Notizen.base': 'current',
                        },
                    })
            );

            const mode = handler.getEffectiveModeForContext({} as any);
            expect(mode).toBe('current'); // Inherited from base!
        });

        it('prefers host note override over base file setting', () => {
            const hostNote = { path: 'Uni/SwSec.md' } as any;
            const baseFile = { path: 'Uni/Uni-Notizen.base' } as any;
            const mockBaseResolver = {
                resolveHostFile: () => hostNote,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const mockApp = {
                workspace: { rootSplit: {} },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () =>
                    createMockSettings({
                        perPageOpenModes: {
                            'Uni/SwSec.md': 'tab',
                            'Uni/Uni-Notizen.base': 'current',
                        },
                    })
            );

            const mode = handler.getEffectiveModeForContext({} as any);
            expect(mode).toBe('tab'); // Host note override takes precedence
        });
    });

    describe('split size memory and restoration', () => {
        it('restores saved split ratio when creating split leaf', () => {
            const baseTabs = {
                containerEl: { style: {} as any },
                setDimension: vi.fn(),
                parent: null as any,
            };
            const noteTabs = {
                containerEl: { style: {} as any },
                setDimension: vi.fn(),
                parent: null as any,
            };
            const parentSplit = {
                children: [baseTabs, noteTabs],
                recomputeChildrenDimensions: vi.fn(),
            };
            baseTabs.parent = parentSplit;
            noteTabs.parent = parentSplit;

            const baseLeaf = new WorkspaceLeaf();
            baseLeaf.view.getViewType = () => 'base';
            baseLeaf.parent = baseTabs as any;

            const newSplitLeaf = new WorkspaceLeaf();
            newSplitLeaf.view.getViewType = () => 'markdown';
            newSplitLeaf.parent = noteTabs as any;

            const baseFile = { path: 'Projects.base' };
            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    getLeaf: vi.fn((type: string) => newSplitLeaf),
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(baseLeaf);
                        cb(newSplitLeaf);
                    },
                    requestResize: vi.fn(),
                },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () =>
                    createMockSettings({
                        perBaseSplitSizes: {
                            'Projects.base': 70,
                        },
                    })
            );

            handler.getOrCreateSplitLeaf();

            expect(baseTabs.setDimension).toHaveBeenCalledWith(70);
            expect(noteTabs.setDimension).toHaveBeenCalledWith(30);
            expect(baseTabs.containerEl.style.flexGrow).toBe('70');
            expect(noteTabs.containerEl.style.flexGrow).toBe('30');
            expect(parentSplit.recomputeChildrenDimensions).toHaveBeenCalled();
            expect(mockApp.workspace.requestResize).toHaveBeenCalled();
        });

        it('saves current split ratio on workspace resize', () => {
            const baseTabs = {
                containerEl: { offsetWidth: 700, style: {} as any },
                parent: null as any,
            };
            const noteTabs = {
                containerEl: { offsetWidth: 300, style: {} as any },
                children: [new WorkspaceLeaf()],
                parent: null as any,
            };
            const parentSplit = {
                direction: 'vertical',
                children: [baseTabs, noteTabs],
            };
            baseTabs.parent = parentSplit;
            noteTabs.parent = parentSplit;

            const baseLeaf = new WorkspaceLeaf();
            baseLeaf.view.getViewType = () => 'base';
            baseLeaf.parent = baseTabs as any;

            const baseFile = { path: 'Board.base' };
            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const settings = createMockSettings({
                perBaseSplitSizes: {},
            });
            const saveSettingsMock = vi.fn().mockResolvedValue(undefined);

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(baseLeaf);
                    },
                },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => settings,
                saveSettingsMock
            );

            handler.checkAndSaveCurrentSplitSize();

            expect(settings.perBaseSplitSizes['Board.base']).toBe(70);
            expect(saveSettingsMock).toHaveBeenCalled();
        });

        it('saves and restores globally when splitSizeScope is global', () => {
            const baseTabs = {
                containerEl: { offsetWidth: 600, style: {} as any },
                setDimension: vi.fn(),
                parent: null as any,
            };
            const noteTabs = {
                containerEl: { offsetWidth: 400, style: {} as any },
                setDimension: vi.fn(),
                children: [new WorkspaceLeaf()],
                parent: null as any,
            };
            const parentSplit = {
                direction: 'vertical',
                children: [baseTabs, noteTabs],
                recomputeChildrenDimensions: vi.fn(),
            };
            baseTabs.parent = parentSplit;
            noteTabs.parent = parentSplit;

            const baseLeaf = new WorkspaceLeaf();
            baseLeaf.view.getViewType = () => 'base';
            baseLeaf.parent = baseTabs as any;

            const baseFile = { path: 'AnyBoard.base' };
            const mockBaseResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => baseFile,
            } as any;

            const settings = createMockSettings({
                splitSizeScope: 'global',
                globalSplitSize: null,
                perBaseSplitSizes: {},
            });
            const saveSettingsMock = vi.fn().mockResolvedValue(undefined);

            const mockApp = {
                workspace: {
                    rootSplit: {},
                    iterateAllLeaves: (cb: (leaf: any) => void) => {
                        cb(baseLeaf);
                    },
                    requestResize: vi.fn(),
                },
            } as any;

            const handler = new NavigationHandler(
                mockApp,
                mockBaseResolver,
                () => settings,
                saveSettingsMock
            );

            // 1. Resizing saves only into globalSplitSize
            handler.checkAndSaveCurrentSplitSize();
            expect(settings.globalSplitSize).toBe(60);
            expect((settings.perBaseSplitSizes as any)['AnyBoard.base']).toBeUndefined();
            expect(saveSettingsMock).toHaveBeenCalled();

            // 2. Restoring for a completely different base uses globalSplitSize
            const otherBaseFile = { path: 'OtherBoard.base' };
            const otherResolver = {
                resolveHostFile: () => null,
                resolveBaseFileSync: () => otherBaseFile,
            } as any;
            const handler2 = new NavigationHandler(
                mockApp,
                otherResolver,
                () => settings
            );

            const restoredSize = handler2.getSavedSplitSize(null, baseLeaf as any);
            expect(restoredSize).toBe(60);
        });
    });
});
