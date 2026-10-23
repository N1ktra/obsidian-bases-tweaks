import { describe, expect, it, vi } from 'vitest';
import { NavigationHandler, resolveEffectiveOpenMode } from '../src/services/navigationHandler';
import { WorkspaceLeaf } from './mocks/obsidian';

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

            const handler = new NavigationHandler(mockApp, () => ({
                baseOpenMode: 'split',
                defaultNoteTitlePrefix: 'Neuer Eintrag',
            }));

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

            const handler = new NavigationHandler(mockApp, () => ({
                baseOpenMode: 'split',
                defaultNoteTitlePrefix: 'Neuer Eintrag',
            }));

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
    });
});
