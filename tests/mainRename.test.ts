import { describe, expect, it, vi } from 'vitest';
import KanbanBasesPlusPlugin from '../src/main';

describe('main plugin rename handling', () => {
    it('migrates perPageOpenModes when a file is renamed or moved', async () => {
        const mockApp = {
            vault: {
                on: vi.fn(),
            },
            workspace: {
                on: vi.fn(),
                onLayoutReady: vi.fn(),
            },
        } as any;

        const plugin = new KanbanBasesPlusPlugin(mockApp, {} as any);
        plugin.settings = {
            baseOpenMode: 'split',
            defaultNoteTitlePrefix: 'Neuer Eintrag',
            perPageOpenModes: {
                'Alle Seiten/Uni/📂 Uni-Notizen.base': 'tab',
                'Alle Seiten/Uni/Sub/Note.md': 'current',
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
        expect(plugin.saveSettings).toHaveBeenCalled();

        // Move an entire folder
        await plugin.handleFileRename('Alle Seiten/Studium', 'Alle Seiten/Uni');
        expect(plugin.settings.perPageOpenModes['Alle Seiten/Studium/Sub/Note.md']).toBe('current');
        expect(plugin.settings.perPageOpenModes['Alle Seiten/Uni/Sub/Note.md']).toBeUndefined();
    });

    it('cleans up deleted files from perPageOpenModes', async () => {
        const plugin = new KanbanBasesPlusPlugin({} as any, {} as any);
        plugin.settings = {
            baseOpenMode: 'split',
            defaultNoteTitlePrefix: 'Neuer Eintrag',
            perPageOpenModes: {
                'Notes/Deleted.md': 'split',
                'Notes/Kept.md': 'tab',
            },
        };
        plugin.saveSettings = vi.fn().mockResolvedValue(undefined);

        await plugin.handleFileDelete('Notes/Deleted.md');
        expect(plugin.settings.perPageOpenModes['Notes/Deleted.md']).toBeUndefined();
        expect(plugin.settings.perPageOpenModes['Notes/Kept.md']).toBe('tab');
    });
});
