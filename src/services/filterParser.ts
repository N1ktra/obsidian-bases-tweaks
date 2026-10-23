import { parseYaml } from 'obsidian';
import { BaseConfigFile, BaseViewConfig, FilterPropertyMap } from '../types';

/**
 * Splits comma-separated array items while respecting quotes and parentheses.
 */
function splitArrayItems(inner: string): string[] {
    const results: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let parenDepth = 0;

    for (let i = 0; i < inner.length; i++) {
        const char = inner[i];
        if ((char === '"' || char === "'") && parenDepth === 0) {
            if (inQuote === char) {
                inQuote = null;
            } else if (!inQuote) {
                inQuote = char;
            }
        } else if (char === '(' && !inQuote) {
            parenDepth++;
        } else if (char === ')' && !inQuote) {
            parenDepth = Math.max(0, parenDepth - 1);
        }

        if (char === ',' && !inQuote && parenDepth === 0) {
            results.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) {
        results.push(current.trim());
    }
    return results;
}

/**
 * Parses a raw value string into its appropriate primitive or link type.
 * Converts Bases link("Page.base") or link("Page") into standard Obsidian wikilinks: "[[Page.base]]".
 */
export function parseFilterValue(rawVal: string): any {
    const trimmed = rawVal.trim();

    // 1. Wikilink format: [[target]] or "[[target]]"
    const wikilinkMatch = trimmed.match(/^["']?(\[\[[^\]]+\]\])["']?$/);
    if (wikilinkMatch) {
        return wikilinkMatch[1];
    }

    // 2. Link format: link("target") or link('target')
    const linkMatch = trimmed.match(/^link\(\s*["']?([^"')]+)["']?\s*\)$/i);
    if (linkMatch) {
        let target = linkMatch[1].trim();
        if (target.endsWith('.md')) {
            target = target.slice(0, -3);
        }
        return `[[${target}]]`;
    }

    // 3. Array format: [ ... ] (exclude double bracket [[wikilink]])
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[[')) {
        const inner = trimmed.slice(1, -1).trim();
        if (!inner) return [];

        const items = splitArrayItems(inner);
        const parsedItems = items.map((it) => parseFilterValue(it));
        return parsedItems.length === 1 ? parsedItems[0] : parsedItems;
    }

    // 4. Date format: date("YYYY-MM-DD")
    const dateMatch = trimmed.match(/^date\(\s*["']?([^"')]+)["']?\s*\)$/i);
    if (dateMatch) {
        return dateMatch[1].trim();
    }

    // 5. Booleans
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    // 6. Numbers
    if (trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.startsWith('0x')) {
        return Number(trimmed);
    }

    // 7. Quoted string
    const quoteMatch = trimmed.match(/^["'](.*)["']$/);
    if (quoteMatch) {
        return quoteMatch[1];
    }

    return trimmed;
}

export const parsePrimitiveValue = parseFilterValue;

/**
 * Parses an individual filter item (either string expression like `key == value` or object `{ property, value }`).
 */
export function parseFilterExpression(item: unknown): { property: string; value: any } | null {
    if (typeof item === 'string') {
        const match = item.match(/^\s*([a-zA-Z0-9_\-\.]+)\s*==\s*(.+)$/);
        if (!match) return null;

        const property = match[1].trim();
        if (property.startsWith('file.')) return null;

        const rawVal = match[2].trim();
        return {
            property,
            value: parseFilterValue(rawVal),
        };
    }

    if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, any>;
        if (obj.property && obj.value !== undefined) {
            const property = String(obj.property).trim();
            if (property.startsWith('file.')) return null;

            let value = obj.value;
            if (typeof value === 'string') {
                value = parseFilterValue(value);
            } else if (Array.isArray(value)) {
                value = value.map((v) => (typeof v === 'string' ? parseFilterValue(v) : v));
                if (value.length === 1) {
                    value = value[0];
                }
            }
            return { property, value };
        }
    }

    return null;
}

/**
 * Extracts a target folder from filter expressions like:
 * - file.inFolder(this.file.folder)
 * - file.inFolder("Some/Folder")
 * - file.folder == "Some/Folder"
 * - file.folder == this.file.folder
 */
export function extractFolderFromFilterList(
    filters: unknown,
    baseFolderPath: string = ''
): string | null {
    if (!filters) return null;

    let filterArray: unknown[] = [];
    if (Array.isArray(filters)) {
        filterArray = filters;
    } else if (typeof filters === 'object' && filters !== null) {
        const obj = filters as Record<string, any>;
        if (Array.isArray(obj.and)) {
            filterArray = obj.and;
        } else if (Array.isArray(obj.or)) {
            filterArray = obj.or;
        }
    }

    for (const item of filterArray) {
        if (typeof item === 'string') {
            const trimmed = item.trim();

            // 1. file.inFolder(...)
            const inFolderMatch = trimmed.match(/^file\.inFolder\(\s*(.+?)\s*\)$/i);
            if (inFolderMatch) {
                const arg = inFolderMatch[1].trim();
                if (arg === 'this.file.folder' || arg === 'this.folder') {
                    return baseFolderPath;
                }
                const quoteMatch = arg.match(/^["'](.*)["']$/);
                if (quoteMatch) {
                    return quoteMatch[1].trim();
                }
                return arg;
            }

            // 2. file.folder == ...
            const folderEqualMatch = trimmed.match(/^file\.folder\s*==\s*(.+)$/i);
            if (folderEqualMatch) {
                const arg = folderEqualMatch[1].trim();
                if (arg === 'this.file.folder' || arg === 'this.folder') {
                    return baseFolderPath;
                }
                const quoteMatch = arg.match(/^["'](.*)["']$/);
                if (quoteMatch) {
                    return quoteMatch[1].trim();
                }
                return arg;
            }
        } else if (typeof item === 'object' && item !== null) {
            // Nested or block
            if (Array.isArray((item as any).or)) {
                const res = extractFolderFromFilterList((item as any).or, baseFolderPath);
                if (res) return res;
            }
        }
    }

    return null;
}

/**
 * Parses filter lists (e.g. filters.and or filters array), including nested or-blocks.
 */
export function extractPropertiesFromFilterList(filters: unknown): FilterPropertyMap {
    const props: FilterPropertyMap = {};
    if (!filters) return props;

    let filterArray: unknown[] = [];
    if (Array.isArray(filters)) {
        filterArray = filters;
    } else if (typeof filters === 'object' && filters !== null) {
        const obj = filters as Record<string, any>;
        if (Array.isArray(obj.and)) {
            filterArray = obj.and;
        } else if (Array.isArray(obj.or)) {
            filterArray = obj.or;
        }
    }

    for (const item of filterArray) {
        if (typeof item === 'object' && item !== null && Array.isArray((item as any).or)) {
            for (const orItem of (item as any).or) {
                const parsedOr = parseFilterExpression(orItem);
                if (parsedOr && props[parsedOr.property] === undefined) {
                    props[parsedOr.property] = parsedOr.value;
                }
            }
            continue;
        }

        const parsed = parseFilterExpression(item);
        if (parsed) {
            props[parsed.property] = parsed.value;
        }
    }

    return props;
}

export interface ParsedBaseFilterResult {
    properties: FilterPropertyMap;
    targetFolder: string | null;
    parsedConfig: BaseConfigFile | null;
}

/**
 * Parses a complete .base YAML content string and returns all applicable filter properties
 * and folder destination, merging root filters and active view filters.
 */
export function parseBaseFiltersFromYaml(
    yamlContent: string,
    viewMatcher?: string | { name?: string; type?: string },
    baseFolderPath: string = ''
): ParsedBaseFilterResult {
    const props: FilterPropertyMap = {};
    let targetFolder: string | null = null;
    let parsedConfig: BaseConfigFile | null = null;

    try {
        parsedConfig = parseYaml(yamlContent) as BaseConfigFile;
        if (!parsedConfig || typeof parsedConfig !== 'object') {
            return { properties: props, targetFolder, parsedConfig: null };
        }

        // 1. Root level filters
        const rootProps = extractPropertiesFromFilterList(parsedConfig.filters);
        Object.assign(props, rootProps);

        const rootFolder = extractFolderFromFilterList(parsedConfig.filters, baseFolderPath);
        if (rootFolder !== null) {
            targetFolder = rootFolder;
        }

        // 2. View specific filters
        if (Array.isArray(parsedConfig.views) && parsedConfig.views.length > 0) {
            let targetView: BaseViewConfig | undefined;

            if (typeof viewMatcher === 'string') {
                targetView = parsedConfig.views.find(
                    (v) => v.name === viewMatcher || v.type === viewMatcher
                );
            } else if (viewMatcher && typeof viewMatcher === 'object') {
                targetView = parsedConfig.views.find((v) => {
                    if (viewMatcher.name && v.name === viewMatcher.name) return true;
                    if (viewMatcher.type && v.type === viewMatcher.type) return true;
                    return false;
                });
            }

            if (!targetView) {
                targetView = parsedConfig.views.find((v) => v.type === 'kanban') || parsedConfig.views[0];
            }

            if (targetView?.filters) {
                const viewProps = extractPropertiesFromFilterList(targetView.filters);
                Object.assign(props, viewProps);

                const viewFolder = extractFolderFromFilterList(targetView.filters, baseFolderPath);
                if (viewFolder !== null) {
                    targetFolder = viewFolder;
                }
            }
        }
    } catch (err) {
        console.error('[Bases Tweaks] YAML parsing failed:', err);
    }

    return { properties: props, targetFolder, parsedConfig };
}
