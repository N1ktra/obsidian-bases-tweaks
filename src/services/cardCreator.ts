import { App, EventRef, normalizePath, TFile } from 'obsidian';
import { BaseOpenMode, FilterPropertyMap } from '../types';
import { BaseResolver } from './baseResolver';
import { parseBaseFiltersFromYaml } from './filterParser';
import { NavigationHandler } from './navigationHandler';

export class CardCreator {
    constructor(
        private app: App,
        private baseResolver: BaseResolver,
        private navigationHandler: NavigationHandler
    ) {}

    /**
     * Handles card creation triggered by the native kanban "+" buttons.
     */
    async handleNativeCardCreation(
        buttonEl: HTMLElement,
        targetFolder?: string
    ): Promise<TFile | null> {
        // 1. Resolve corresponding .base file and host file (for embedded bases)
        const baseFile = await this.baseResolver.resolveBaseFile(buttonEl);
        if (!baseFile) return null;

        const hostFile = this.baseResolver.resolveHostFile(buttonEl);
        const hostFolder =
            hostFile?.parent?.path && hostFile.parent.path !== '/'
                ? hostFile.parent.path
                : '';
        const baseFolder =
            baseFile.parent?.path && baseFile.parent.path !== '/'
                ? baseFile.parent.path
                : hostFolder;

        const effectiveHostFolder = hostFolder || baseFolder;

        // 2. Parse filter properties and folder
        const rawContent = await this.app.vault.read(baseFile);
        const { properties: propertiesToApply, targetFolder: filterFolder } = parseBaseFiltersFromYaml(
            rawContent,
            'kanban',
            effectiveHostFolder
        );

        let effectiveFolder = targetFolder;
        if (!effectiveFolder) {
            effectiveFolder = filterFolder !== null ? filterFolder : effectiveHostFolder;
        } else if (effectiveHostFolder && !effectiveFolder.startsWith(effectiveHostFolder)) {
            effectiveFolder = `${effectiveHostFolder}/${effectiveFolder}`;
        }

        // 3. Deterministically wait for file creation in the target folder
        const createdFile = await this.waitForFileCreation(effectiveFolder, 8000);

        // 4. Atomically write frontmatter
        if (createdFile && Object.keys(propertiesToApply).length > 0) {
            await this.applyFrontMatter(createdFile, propertiesToApply);
        }

        // 5. Ensure file is opened according to the configured mode
        if (createdFile) {
            await this.navigationHandler.openFileWithMode(createdFile, undefined, buttonEl);
        }

        return createdFile;
    }

    /**
     * Directly creates a new file with specified properties and opens it.
     */
    async createCardWithProperties(
        folderPath: string,
        fileName: string,
        properties: FilterPropertyMap,
        mode?: BaseOpenMode
    ): Promise<TFile> {
        const cleanFolder = folderPath ? normalizePath(folderPath) : '';
        if (cleanFolder) {
            const exists = await this.app.vault.adapter.exists(cleanFolder);
            if (!exists) {
                await this.app.vault.createFolder(cleanFolder);
            }
        }

        // Generate unique file path
        let baseName = fileName.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Neuer Eintrag';
        let targetPath = cleanFolder ? `${cleanFolder}/${baseName}.md` : `${baseName}.md`;
        targetPath = normalizePath(targetPath);

        let counter = 1;
        while (await this.app.vault.adapter.exists(targetPath)) {
            const numberedName = `${baseName} (${counter})`;
            targetPath = cleanFolder ? `${cleanFolder}/${numberedName}.md` : `${numberedName}.md`;
            targetPath = normalizePath(targetPath);
            counter++;
        }

        const newFile = await this.app.vault.create(targetPath, '');

        if (Object.keys(properties).length > 0) {
            await this.applyFrontMatter(newFile, properties);
        }

        await this.navigationHandler.openFileWithMode(newFile, mode);

        return newFile;
    }

    /**
     * Atomically writes properties to a file's frontmatter without overwriting existing non-empty values.
     */
    async applyFrontMatter(file: TFile, properties: FilterPropertyMap): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
            for (const [key, value] of Object.entries(properties)) {
                // Set if unset, null, empty string, or if it has an unprocessed raw link(...) string
                if (
                    fm[key] === undefined ||
                    fm[key] === null ||
                    fm[key] === '' ||
                    (typeof fm[key] === 'string' && fm[key].startsWith('link('))
                ) {
                    fm[key] = value;
                }
            }
        });
    }

    /**
     * Waits deterministically for a markdown file to be created in the target folder.
     */
    waitForFileCreation(targetFolder?: string, timeoutMs: number = 8000): Promise<TFile | null> {
        return new Promise((resolve) => {
            let eventRef: EventRef | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const cleanup = () => {
                if (eventRef) {
                    this.app.vault.offref(eventRef);
                    eventRef = null;
                }
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            eventRef = this.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    if (!targetFolder || file.path.startsWith(targetFolder)) {
                        cleanup();
                        resolve(file);
                    }
                }
            });

            timeoutId = setTimeout(() => {
                cleanup();
                resolve(null);
            }, timeoutMs);
        });
    }
}
