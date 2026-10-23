import { App } from 'obsidian';
import { BaseResolver } from '../services/baseResolver';
import { BaseViewService } from '../services/baseViewService';
import { parseBaseFiltersFromYaml } from '../services/filterParser';
import { BasesTweaksSettings } from '../types';

/**
 * Normalizes and formats a group folder path relative to a base folder.
 * For example:
 *   groupValue: "Alle Seiten/Uni/Alle Kurse/NetSec/Klausur"
 *   baseFolder: "Alle Seiten/Uni/Alle Kurse/NetSec"
 *   returns: "Klausur"
 *
 * If groupValue exactly equals baseFolder, returns "/".
 * If groupValue is not a subfolder of baseFolder, returns groupValue unchanged.
 */
export function formatFolderGroupValue(groupValue: string, baseFolder: string): string {
    const cleanGroup = groupValue.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const cleanBase = baseFolder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

    if (!cleanBase || cleanBase === '/') {
        return groupValue;
    }

    if (cleanGroup.toLowerCase() === cleanBase.toLowerCase()) {
        return '/';
    }

    const basePrefix = cleanBase.toLowerCase() + '/';
    if (cleanGroup.toLowerCase().startsWith(basePrefix)) {
        return cleanGroup.slice(cleanBase.length + 1);
    }

    return groupValue;
}

export class FolderGroupManager {
    private isUpdating = false;

    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private baseViewService: BaseViewService,
        private getSettings: () => BasesTweaksSettings
    ) {}

    /**
     * Scans all .bases-view elements in the DOM and shortens .bases-group-value elements
     * if the view is grouped by folder.
     */
    async updateAllGroupValues(): Promise<void> {
        if (this.isUpdating) return;
        if (this.getSettings().shortenFolderGroupNames === false) {
            this.restoreAllGroupValues();
            return;
        }

        this.isUpdating = true;
        try {
            const baseViews = Array.from(document.querySelectorAll<HTMLElement>('.bases-view'));
            for (const baseViewEl of baseViews) {
                await this.updateGroupValuesForBaseView(baseViewEl);
            }
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Updates folder group values for a single .bases-view container.
     */
    async updateGroupValuesForBaseView(baseViewEl: HTMLElement): Promise<void> {
        const baseFile = await this.baseResolver.resolveBaseFile(baseViewEl);
        if (!baseFile) return;

        const grouping = await this.baseViewService.detectGrouping(baseFile, baseViewEl);
        if (!grouping.isGrouped || !this.baseViewService.isFolderGrouping(grouping.groupProperty)) {
            return;
        }

        // Determine candidate base folders to strip:
        // 1. Host file folder (the note where the base is embedded)
        const hostFile = this.baseResolver.resolveHostFile(baseViewEl);
        const hostFolder =
            hostFile?.parent?.path && hostFile.parent.path !== '/'
                ? hostFile.parent.path
                : '';

        // 2. Base file folder
        const baseFolder =
            baseFile.parent?.path && baseFile.parent.path !== '/'
                ? baseFile.parent.path
                : '';

        // 3. Filter target folder (if specified in base YAML)
        let filterFolder = '';
        try {
            const rawContent = await this.app.vault.read(baseFile);
            const { targetFolder } = parseBaseFiltersFromYaml(
                rawContent,
                grouping.activeView?.name || grouping.activeView?.type || 'kanban',
                hostFolder || baseFolder
            );
            if (targetFolder && targetFolder !== '/') {
                filterFolder = targetFolder;
            }
        } catch {
            // Ignore vault read or parsing errors
        }

        // Deduplicate and sort candidate folders longest first (most specific path matches first)
        const candidateFolders = Array.from(
            new Set([hostFolder, filterFolder, baseFolder].filter((f): f is string => Boolean(f && f !== '/')))
        ).sort((a, b) => b.length - a.length);

        if (candidateFolders.length === 0) return;

        const groupValueEls = Array.from(
            baseViewEl.querySelectorAll<HTMLElement>('.bases-group-value')
        );

        for (const groupValEl of groupValueEls) {
            this.shortenElementGroupValue(groupValEl, candidateFolders);
        }
    }

    /**
     * Shortens a single .bases-group-value element if matching candidate folders.
     */
    shortenElementGroupValue(groupValEl: HTMLElement, candidateFolders: string[]): void {
        const currentText = groupValEl.textContent?.trim() || '';
        const savedShortened = groupValEl.getAttribute('data-shortened-group-value');
        const savedOriginal = groupValEl.getAttribute('data-original-group-value');

        let originalValue = currentText;
        if (savedOriginal) {
            if (currentText === savedShortened || currentText === savedOriginal) {
                originalValue = savedOriginal;
            } else {
                // If text was modified externally (e.g. view change or data reload), adopt new value
                originalValue = currentText;
            }
        }

        if (!originalValue) return;

        let formatted = originalValue;
        for (const folder of candidateFolders) {
            const result = formatFolderGroupValue(originalValue, folder);
            if (result !== originalValue) {
                formatted = result;
                break;
            }
        }

        if (formatted !== originalValue) {
            groupValEl.setAttribute('data-original-group-value', originalValue);
            groupValEl.setAttribute('data-shortened-group-value', formatted);
            if (!groupValEl.hasAttribute('title')) {
                groupValEl.setAttribute('title', originalValue);
            }
            if (groupValEl.textContent !== formatted) {
                groupValEl.textContent = formatted;
            }
        }
    }

    /**
     * Restores all modified .bases-group-value elements to their original text.
     */
    restoreAllGroupValues(): void {
        const elements = Array.from(
            document.querySelectorAll<HTMLElement>('.bases-group-value[data-original-group-value]')
        );
        for (const el of elements) {
            const original = el.getAttribute('data-original-group-value');
            if (original) {
                el.textContent = original;
            }
            el.removeAttribute('data-original-group-value');
            el.removeAttribute('data-shortened-group-value');
            el.removeAttribute('title');
        }
    }

    cleanup(): void {
        this.restoreAllGroupValues();
    }
}
