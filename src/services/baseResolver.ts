import { App, TFile } from 'obsidian';

export class BaseResolver {
    constructor(private app: App) {}

    /**
     * Resolves the corresponding .base TFile from a DOM element (or active view / embeds).
     */
    async resolveBaseFile(contextEl?: HTMLElement | null): Promise<TFile | null> {
        // A. Check if within a workspace leaf that directly has a base file
        if (contextEl) {
            const leaves = this.app.workspace.getLeavesOfType('base');
            for (const leaf of leaves) {
                if (leaf.view?.containerEl?.contains(contextEl)) {
                    // @ts-ignore leaf.view.file
                    const file = leaf.view.file;
                    if (file instanceof TFile) return file;
                }
            }

            let foundFile: TFile | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (foundFile) return;
                if (leaf.view?.containerEl?.contains(contextEl)) {
                    // @ts-ignore
                    const file = leaf.view?.file;
                    if (file instanceof TFile && (file.extension === 'base' || file.path.endsWith('.base'))) {
                        foundFile = file;
                    }
                }
            });
            if (foundFile) {
                return foundFile;
            }

            // B. Check DOM embed attributes (e.g. internal-embed, [src*=".base"], .bases-view)
            const embedContainer = contextEl.closest('.internal-embed, [src*=".base"], .bases-view');
            if (embedContainer) {
                const srcAttr = embedContainer.getAttribute('src') || embedContainer.getAttribute('alt') || embedContainer.getAttribute('data-src');
                if (srcAttr) {
                    const cleanName = srcAttr.replace(/["']/g, '').trim();
                    const resolved = this.app.metadataCache.getFirstLinkpathDest(cleanName, '');
                    if (resolved && (resolved.extension === 'base' || resolved.path.endsWith('.base'))) {
                        return resolved;
                    }
                }
            }
        }

        // C. Check active workspace file
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            if (activeFile.extension === 'base' || activeFile.path.endsWith('.base')) {
                return activeFile;
            }

            // D. Scan active file markdown for embedded .base files: ![[something.base]]
            try {
                const content = await this.app.vault.read(activeFile);
                const matches = content.match(/!\[\[(.*?\.(?:base|md))\]\]/g) || content.match(/!\[\[(.*?)\]\]/g);

                if (matches) {
                    for (const match of matches) {
                        const target = match.replace('![[', '').replace(']]', '').trim();
                        const dest = this.app.metadataCache.getFirstLinkpathDest(target, activeFile.path);
                        if (dest && (dest.extension === 'base' || dest.path.endsWith('.base'))) {
                            return dest;
                        }
                    }
                }

                // If file directly defines base filters
                if (content.includes('filters:')) {
                    return activeFile;
                }
            } catch (e) {
                console.error('[Kanban Bases Plus] Error reading active file for base resolution:', e);
            }
        }

        return null;
    }

    /**
     * Resolves the host file (the markdown file containing the embed, or the active note).
     * This represents `this.file` for filters like `file.inFolder(this.file.folder)`.
     */
    resolveHostFile(contextEl?: HTMLElement | null): TFile | null {
        if (contextEl) {
            let foundHost: TFile | null = null;
            this.app.workspace.iterateAllLeaves((leaf) => {
                if (foundHost) return;
                if (leaf.view?.containerEl?.contains(contextEl)) {
                    // @ts-ignore
                    const file = leaf.view?.file;
                    if (file instanceof TFile) {
                        foundHost = file;
                    }
                }
            });
            if (foundHost) {
                return foundHost;
            }
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            return activeFile;
        }

        return null;
    }
}
