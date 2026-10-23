import { describe, expect, it } from 'vitest';
import { BaseViewService } from '../src/services/baseViewService';
import { TFile } from './mocks/obsidian';

describe('baseViewService', () => {
    const mockApp = {
        vault: {
            read: async (_file: any) => `
filters:
  and:
    - type == ["todo"]
views:
  - type: kanban
    name: Tasks Board
    groupBy:
      property: Status
      direction: ASC
  - type: table
    name: All Tasks
`,
        },
    } as any;

    const baseViewService = new BaseViewService(mockApp);

    it('detects grouping by property for kanban view', async () => {
        const file = new TFile('Tasks.base', 'base');
        const result = await baseViewService.detectGrouping(file as any);

        expect(result.isGrouped).toBe(true);
        expect(result.groupProperty).toBe('Status');
        expect(result.activeView?.type).toBe('kanban');
    });

    it('returns isGrouped: false when view is not grouped', async () => {
        const ungroupedApp = {
            vault: {
                read: async (_file: any) => `
views:
  - type: kanban
    name: Plain Board
`,
            },
        } as any;

        const ungroupedService = new BaseViewService(ungroupedApp);
        const file = new TFile('Plain.base', 'base');
        const result = await ungroupedService.detectGrouping(file as any);

        expect(result.isGrouped).toBe(false);
        expect(result.groupProperty).toBeNull();
    });

    it('detects string groupBy and folder grouping', async () => {
        const folderApp = {
            vault: {
                read: async (_file: any) => `
views:
  - type: kanban
    name: Folder Board
    groupBy: file.folder
`,
            },
        } as any;

        const folderService = new BaseViewService(folderApp);
        const file = new TFile('Folders.base', 'base');
        const result = await folderService.detectGrouping(file as any);

        expect(result.isGrouped).toBe(true);
        expect(result.groupProperty).toBe('file.folder');
        expect(folderService.isFolderGrouping(result.groupProperty)).toBe(true);
        expect(folderService.isFolderGrouping('folder')).toBe(true);
        expect(folderService.isFolderGrouping('Status')).toBe(false);
    });
});
