import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FolderGroupManager, formatFolderGroupValue } from '../src/ui/folderGroupManager';
import { TFile } from './mocks/obsidian';

describe('formatFolderGroupValue', () => {
    it('strips base folder prefix to show only subfolder', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/NetSec/Klausur',
            'Alle Seiten/Uni/Alle Kurse/NetSec'
        );
        expect(result).toBe('Klausur');
    });

    it('handles nested subfolders', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/NetSec/Klausur/2024',
            'Alle Seiten/Uni/Alle Kurse/NetSec'
        );
        expect(result).toBe('Klausur/2024');
    });

    it('returns / when group value matches base folder exactly', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/NetSec',
            'Alle Seiten/Uni/Alle Kurse/NetSec'
        );
        expect(result).toBe('/');
    });

    it('handles case insensitivity while preserving subfolder casing', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/NetSec/Klausur',
            'alle seiten/uni/alle kurse/netsec'
        );
        expect(result).toBe('Klausur');
    });

    it('does not strip if group value is not within base folder', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/WebSec/Klausur',
            'Alle Seiten/Uni/Alle Kurse/NetSec'
        );
        expect(result).toBe('Alle Seiten/Uni/Alle Kurse/WebSec/Klausur');
    });

    it('does not match partial folder names', () => {
        const result = formatFolderGroupValue(
            'Alle Seiten/Uni/Alle Kurse/NetSecAdvanced/Klausur',
            'Alle Seiten/Uni/Alle Kurse/NetSec'
        );
        expect(result).toBe('Alle Seiten/Uni/Alle Kurse/NetSecAdvanced/Klausur');
    });

    it('handles leading and trailing slashes and backslashes gracefully', () => {
        const result = formatFolderGroupValue(
            '\\Alle Seiten\\Uni\\Alle Kurse\\NetSec\\Klausur\\',
            '/Alle Seiten/Uni/Alle Kurse/NetSec/'
        );
        expect(result).toBe('Klausur');
    });

    it('returns original value if base folder is empty or root', () => {
        expect(formatFolderGroupValue('Uni/NetSec/Klausur', '')).toBe('Uni/NetSec/Klausur');
        expect(formatFolderGroupValue('Uni/NetSec/Klausur', '/')).toBe('Uni/NetSec/Klausur');
    });
});

class MockElement {
    attributes: Map<string, string> = new Map();
    textContent: string = '';
    className: string = '';
    classList = {
        contains: (cls: string) => this.className.split(' ').includes(cls),
    };
    children: MockElement[] = [];

    getAttribute(name: string): string | null {
        return this.attributes.has(name) ? this.attributes.get(name)! : null;
    }
    setAttribute(name: string, val: string): void {
        this.attributes.set(name, val);
    }
    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }
    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }
    querySelectorAll(selector: string): MockElement[] {
        const matches: MockElement[] = [];
        const check = (el: MockElement) => {
            if (selector.startsWith('.') && el.classList.contains(selector.slice(1).split('[')[0])) {
                if (selector.includes('[data-original-group-value]')) {
                    if (el.hasAttribute('data-original-group-value')) {
                        matches.push(el);
                    }
                } else {
                    matches.push(el);
                }
            }
            for (const child of el.children) {
                check(child);
            }
        };
        for (const child of this.children) {
            check(child);
        }
        return matches;
    }
    appendChild(child: MockElement): void {
        this.children.push(child);
    }
    remove(): void {
        // no-op in mock
    }
}

describe('FolderGroupManager', () => {
    let mockRoot: MockElement;
    const originalDocument = (globalThis as any).document;

    beforeEach(() => {
        mockRoot = new MockElement();
        (globalThis as any).document = {
            querySelectorAll: (sel: string) => mockRoot.querySelectorAll(sel),
        };
    });

    afterEach(() => {
        (globalThis as any).document = originalDocument;
    });

    it('shortens .bases-group-value in DOM when view is grouped by folder', async () => {
        const baseViewEl = new MockElement();
        baseViewEl.className = 'bases-view';

        const groupVal1 = new MockElement();
        groupVal1.className = 'bases-group-value';
        groupVal1.textContent = 'Alle Seiten/Uni/Alle Kurse/NetSec/Klausur';

        const groupVal2 = new MockElement();
        groupVal2.className = 'bases-group-value';
        groupVal2.textContent = 'Alle Seiten/Uni/Alle Kurse/NetSec/Übungen';

        const groupVal3 = new MockElement();
        groupVal3.className = 'bases-group-value';
        groupVal3.textContent = 'Alle Seiten/Uni/Alle Kurse/NetSec';

        baseViewEl.appendChild(groupVal1);
        baseViewEl.appendChild(groupVal2);
        baseViewEl.appendChild(groupVal3);
        mockRoot.appendChild(baseViewEl);

        const hostFile = new TFile('Alle Seiten/Uni/Alle Kurse/NetSec/NetSec.md');
        hostFile.parent = { path: 'Alle Seiten/Uni/Alle Kurse/NetSec' };

        const baseFile = new TFile('Alle Seiten/Uni/Alle Kurse/NetSec/NetSec.base', 'base');
        baseFile.parent = { path: 'Alle Seiten/Uni/Alle Kurse/NetSec' };

        const mockApp = {
            vault: {
                read: async () => `
views:
  - type: kanban
    name: Board
    groupBy:
      property: file.folder
`,
            },
        } as any;

        const mockResolver = {
            resolveBaseFile: async () => baseFile,
            resolveHostFile: () => hostFile,
        } as any;

        const mockViewService = {
            detectGrouping: async () => ({
                isGrouped: true,
                groupProperty: 'file.folder',
                activeView: { type: 'kanban', groupBy: { property: 'file.folder' } },
            }),
            isFolderGrouping: (prop: string) => prop === 'file.folder' || prop === 'folder',
        } as any;

        const settings = { shortenFolderGroupNames: true };

        const manager = new FolderGroupManager(
            mockApp,
            mockResolver,
            mockViewService,
            () => settings as any
        );

        await manager.updateAllGroupValues();

        expect(groupVal1.textContent).toBe('Klausur');
        expect(groupVal1.getAttribute('data-original-group-value')).toBe('Alle Seiten/Uni/Alle Kurse/NetSec/Klausur');
        expect(groupVal1.getAttribute('data-shortened-group-value')).toBe('Klausur');
        expect(groupVal1.getAttribute('title')).toBe('Alle Seiten/Uni/Alle Kurse/NetSec/Klausur');

        expect(groupVal2.textContent).toBe('Übungen');
        expect(groupVal3.textContent).toBe('/');

        // Test restoring values
        manager.restoreAllGroupValues();
        expect(groupVal1.textContent).toBe('Alle Seiten/Uni/Alle Kurse/NetSec/Klausur');
        expect(groupVal1.hasAttribute('data-original-group-value')).toBe(false);
        expect(groupVal2.textContent).toBe('Alle Seiten/Uni/Alle Kurse/NetSec/Übungen');
        expect(groupVal3.textContent).toBe('Alle Seiten/Uni/Alle Kurse/NetSec');
    });

    it('does not modify group values if base is grouped by another property', async () => {
        const baseViewEl = new MockElement();
        baseViewEl.className = 'bases-view';

        const groupVal = new MockElement();
        groupVal.className = 'bases-group-value';
        groupVal.textContent = 'In Bearbeitung';
        baseViewEl.appendChild(groupVal);
        mockRoot.appendChild(baseViewEl);

        const baseFile = new TFile('Tasks.base', 'base');

        const mockApp = {
            vault: {
                read: async () => '',
            },
        } as any;

        const mockResolver = {
            resolveBaseFile: async () => baseFile,
            resolveHostFile: () => null,
        } as any;

        const mockViewService = {
            detectGrouping: async () => ({
                isGrouped: true,
                groupProperty: 'Status',
                activeView: { type: 'kanban', groupBy: { property: 'Status' } },
            }),
            isFolderGrouping: () => false,
        } as any;

        const manager = new FolderGroupManager(
            mockApp,
            mockResolver,
            mockViewService,
            () => ({ shortenFolderGroupNames: true } as any)
        );

        await manager.updateAllGroupValues();

        expect(groupVal.textContent).toBe('In Bearbeitung');
        expect(groupVal.hasAttribute('data-original-group-value')).toBe(false);
    });
});
