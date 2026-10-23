import { describe, expect, it, vi } from 'vitest';
import { CardCreator } from '../src/services/cardCreator';
import { TFile } from './mocks/obsidian';

describe('cardCreator', () => {
    it('applies frontmatter properties without overwriting existing non-empty values', async () => {
        const mockFrontMatter: Record<string, any> = {
            existingProp: 'originalValue',
            emptyProp: '',
        };

        const mockApp = {
            fileManager: {
                processFrontMatter: vi.fn(async (_file: any, cb: (fm: any) => void) => {
                    cb(mockFrontMatter);
                }),
            },
        } as any;

        const cardCreator = new CardCreator(mockApp, {} as any, {} as any);
        const testFile = new TFile('Test.md');

        await cardCreator.applyFrontMatter(testFile as any, {
            existingProp: 'newValue',
            emptyProp: 'filledValue',
            newProp: 'brandNew',
        });

        expect(mockFrontMatter.existingProp).toBe('originalValue'); // Preserved!
        expect(mockFrontMatter.emptyProp).toBe('filledValue');     // Filled because empty
        expect(mockFrontMatter.newProp).toBe('brandNew');          // Added
    });
});
