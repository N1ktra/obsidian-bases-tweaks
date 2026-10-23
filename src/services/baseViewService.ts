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
                    '.bases-view-tab.is-active, .bases-tab.is-active, [aria-selected="true"]'
                );
                if (activeTabEl) {
                    activeViewName = activeTabEl.textContent?.trim();
                }

                // If kanban column is present in the DOM, preferred type is kanban
                if (contextEl.closest('.bases-view')?.querySelector('.bases-kanban-column, .bases-kanban')) {
                    activeViewType = 'kanban';
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

            if (view?.groupBy?.property) {
                const prop = view.groupBy.property.trim();
                if (prop) {
                    return {
                        isGrouped: true,
                        groupProperty: prop,
                        activeView: view,
                        config: parsedConfig,
                    };
                }
            }

            return {
                isGrouped: false,
                groupProperty: null,
                activeView: view || null,
                config: parsedConfig,
            };
        } catch (e) {
            console.error('[Kanban Bases Plus] Error detecting grouping:', e);
            return {
                isGrouped: false,
                groupProperty: null,
                activeView: null,
                config: null,
            };
        }
    }
}
