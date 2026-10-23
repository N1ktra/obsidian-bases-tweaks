import { describe, expect, it } from 'vitest';
import { BaseResolver } from '../src/services/baseResolver';
import { TFile } from './mocks/obsidian';

describe('baseResolver', () => {
    it('resolves host file from containing leaf', () => {
        const hostFile = new TFile('Alle Seiten/Uni/Alle Kurse/SwSec/SwSec.md');
        hostFile.parent = { path: 'Alle Seiten/Uni/Alle Kurse/SwSec' };

        const mockLeaf = {
            view: {
                file: hostFile,
                containerEl: {
                    contains: (el: any) => el === mockEl,
                },
            },
        };

        const mockEl = {} as HTMLElement;

        const mockApp = {
            workspace: {
                iterateAllLeaves: (cb: (leaf: any) => void) => {
                    cb(mockLeaf);
                },
                getActiveFile: () => null,
            },
        } as any;

        const resolver = new BaseResolver(mockApp);
        const resolved = resolver.resolveHostFile(mockEl);
        expect(resolved).toBe(hostFile);
        expect(resolved?.parent?.path).toBe('Alle Seiten/Uni/Alle Kurse/SwSec');
    });
});
