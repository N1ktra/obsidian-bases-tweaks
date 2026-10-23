import { App, TFile } from 'obsidian';
import { BaseConfigFile, BaseViewConfig } from '../types';
import { parseBaseFiltersFromYaml } from './filterParser';

export interface GroupDetectionResult {
    isGrouped: boolean;
    groupProperty: string | null;
    activeView: BaseViewConfig | null;
    config: BaseConfigFile | null;
}

export class BaseViewService {
    constructor(private app: App) {}

    /**
     * Determines whether the base view for a given element is grouped by a property.
     */
    async detectGrouping(
        baseFile: TFile,
        contextEl?: HTMLElement | null
    ): Promise<GroupDetectionResult> {
        try {
            const rawContent = await this.app.vault.read(baseFile);
            const { parsedConfig } = parseBaseFiltersFromYaml(rawContent);

            if (!parsedConfig || !Array.isArray(parsedConfig.views) || parsedConfig.views.length === 0) {
                return {
                    isGrouped: false,
                    groupProperty: null,
                    activeView: null,
                    config: parsedConfig,
                };
            }

            // Determine active view:
            // Check if contextEl indicates kanban view or a specific view name
            let activeViewName: string | undefined;
            let activeViewType: string | undefined;

            if (contextEl) {
                const activeTabEl = contextEl.closest('.bases-view')?.querySelector(
                    '.bases-view-tab.is-active, .bases-tab.is-active, [aria-selected="true"], .bases-view-switcher-item.is-active, [data-active="true"]'
                );
                if (activeTabEl) {
                    activeViewName = activeTabEl.textContent?.trim();
                }

                const baseViewEl = contextEl.closest('.bases-view') || (contextEl.classList.contains('bases-view') ? contextEl : null);
                if (baseViewEl?.querySelector('.bases-kanban-column, .bases-kanban')) {
                    activeViewType = 'kanban';
                } else if (baseViewEl?.querySelector('.bases-table')) {
                    activeViewType = 'table';
                } else if (baseViewEl?.querySelector('.bases-list')) {
                    activeViewType = 'list';
                }
            }

            let view: BaseViewConfig | undefined;
            if (activeViewName) {
                view = parsedConfig.views.find((v) => v.name === activeViewName);
            }
            if (!view && activeViewType) {
                view = parsedConfig.views.find((v) => v.type === activeViewType);
            }
            if (!view) {
                // Default to kanban view if exists, otherwise first view
                view = parsedConfig.views.find((v) => v.type === 'kanban') || parsedConfig.views[0];
            }

            let prop: string | undefined;
            if (typeof view?.groupBy === 'string') {
                prop = (view.groupBy as string).trim();
            } else if (view?.groupBy && typeof view.groupBy === 'object' && 'property' in view.groupBy) {
                prop = (view.groupBy as any).property?.trim();
            }

            if (prop) {
                return {
                    isGrouped: true,
                    groupProperty: prop,
                    activeView: view,
                    config: parsedConfig,
                };
            }

            return {
                isGrouped: false,
                groupProperty: null,
                activeView: view || null,
                config: parsedConfig,
            };
        } catch (e) {
            console.error('[Bases Tweaks] Error detecting grouping:', e);
            return {
                isGrouped: false,
                groupProperty: null,
                activeView: null,
                config: null,
            };
        }
    }

    /**
     * Checks whether a groupProperty represents a folder grouping (e.g. 'file.folder' or 'folder').
     */
    isFolderGrouping(groupProperty: string | null | undefined): boolean {
        if (!groupProperty) return false;
        const clean = groupProperty.toLowerCase().trim();
        return clean === 'file.folder' || clean === 'folder' || clean.endsWith('.folder');
    }
}
