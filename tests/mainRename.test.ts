import { describe, expect, it, vi } from 'vitest';
import BasesTweaksPlugin from '../src/main';

describe('main plugin rename handling', () => {
    it('migrates perPageOpenModes and perBaseSplitSizes when a file is renamed or moved', async () => {
        const mockApp = {
            vault: {
                on: vi.fn(),
            },
            workspace: {
                on: vi.fn(),
                onLayoutReady: vi.fn(),
            },
        } as any;

        const plugin = new BasesTweaksPlugin(mockApp, {} as any);
        plugin.settings = {
            baseOpenMode: 'split',
            defaultNoteTitlePrefix: 'Neuer Eintrag',
            perPageOpenModes: {
                'Alle Seiten/Uni/📂 Uni-Notizen.base': 'tab',
                'Alle Seiten/Uni/Sub/Note.md': 'current',
            },
            splitSizeScope: 'per-base',
            globalSplitSize: null,
            perBaseSplitSizes: {
                'Alle Seiten/Uni/📂 Uni-Notizen.base': 65,
                'Alle Seiten/Uni/Sub/Note.md': 45,
            },
        };
        plugin.saveSettings = vi.fn().mockResolvedValue(undefined);
        plugin.openModeButtonManager = { updateAllButtons: vi.fn() } as any;

        // Move a single file
        await plugin.handleFileRename(
            'Alle Seiten/Archiv/📂 Uni-Notizen.base',
            'Alle Seiten/Uni/📂 Uni-Notizen.base'
        );

        expect(plugin.settings.perPageOpenModes['Alle Seiten/Archiv/📂 Uni-Notizen.base']).toBe('tab');
        expect(plugin.settings.perPageOpenModes['Alle Seiten/Uni/📂 Uni-Notizen.base']).toBeUndefined();
        expect(plugin.settings.perBaseSplitSizes['Alle Seiten/Archiv/📂 Uni-Notizen.base']).toBe(65);
        expect(plugin.settings.perBaseSplitSizes['Alle Seiten/Uni/📂 Uni-Notizen.base']).toBeUndefined();
        expect(plugin.saveSettings).toHaveBeenCalled();

        // Move an entire folder
        await plugin.handleFileRename('Alle Seiten/Studium', 'Alle Seiten/Uni');
        expect(plugin.settings.perPageOpenModes['Alle Seiten/Studium/Sub/Note.md']).toBe('current');
        expect(plugin.settings.perPageOpenModes['Alle Seiten/Uni/Sub/Note.md']).toBeUndefined();
        expect(plugin.settings.perBaseSplitSizes['Alle Seiten/Studium/Sub/Note.md']).toBe(45);
        expect(plugin.settings.perBaseSplitSizes['Alle Seiten/Uni/Sub/Note.md']).toBeUndefined();
    });

    it('cleans up deleted files from perPageOpenModes and perBaseSplitSizes', async () => {
        const plugin = new BasesTweaksPlugin({} as any, {} as any);
        plugin.settings = {
            baseOpenMode: 'split',
            defaultNoteTitlePrefix: 'Neuer Eintrag',
            perPageOpenModes: {
                'Notes/Deleted.md': 'split',
                'Notes/Kept.md': 'tab',
            },
            splitSizeScope: 'per-base',
            globalSplitSize: null,
            perBaseSplitSizes: {
                'Notes/Deleted.md': 60,
                'Notes/Kept.md': 40,
            },
        };
        plugin.saveSettings = vi.fn().mockResolvedValue(undefined);

        await plugin.handleFileDelete('Notes/Deleted.md');
        expect(plugin.settings.perPageOpenModes['Notes/Deleted.md']).toBeUndefined();
        expect(plugin.settings.perPageOpenModes['Notes/Kept.md']).toBe('tab');
        expect(plugin.settings.perBaseSplitSizes['Notes/Deleted.md']).toBeUndefined();
        expect(plugin.settings.perBaseSplitSizes['Notes/Kept.md']).toBe(40);
    });
});
