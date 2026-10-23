import { vi } from 'vitest';

export const Platform = {
    isPhone: false,
    isTablet: false,
    isDesktop: true,
    isMobile: false,
    isMacOS: false,
    isWin: true,
    isLinux: false,
    isIosApp: false,
    isAndroidApp: false,
    isSafari: false,
};

export const normalizePath = (path: string): string => {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
};

export const setIcon = vi.fn();

export class Notice {
    constructor(public message: string) {}
}

export class WorkspaceLeaf {
    parent: any = null;
    view: any = {
        getViewType: () => 'markdown',
        containerEl: {
            isConnected: true,
            contains: () => false,
            closest: () => null,
        },
    };
    openFile = vi.fn().mockResolvedValue(undefined);
    getRoot = vi.fn();
}

export class TFile {
    extension: string = 'md';
    path: string = '';
    name: string = '';
    basename: string = '';
    parent: { path: string } | null = null;

    constructor(path: string = '', extension: string = 'md') {
        this.path = path;
        this.extension = extension;
        this.name = path.split('/').pop() || '';
        this.basename = this.name.replace(/\.[^/.]+$/, '');
    }
}

export class Plugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
        this.app = app;
        this.manifest = manifest;
    }
    registerDomEvent = vi.fn();
    registerEvent = vi.fn();
    addSettingTab = vi.fn();
    loadData = vi.fn().mockResolvedValue({});
    saveData = vi.fn().mockResolvedValue(undefined);
}

export class PluginSettingTab {
    containerEl: HTMLElement = {
        empty: vi.fn(),
        createEl: vi.fn(() => ({})),
    } as unknown as HTMLElement;

    constructor(public app: any, public plugin: any) {}
    display(): void {}
    hide(): void {}
}

export class Setting {
    name = '';
    desc = '';
    settingEl: HTMLElement = {} as HTMLElement;

    constructor(public containerEl: any) {}

    setName(name: string): this {
        this.name = name;
        return this;
    }

    setDesc(desc: string): this {
        this.desc = desc;
        return this;
    }

    addDropdown(cb: (d: any) => any): this {
        cb({
            addOptions: vi.fn().mockReturnThis(),
            setValue: vi.fn().mockReturnThis(),
            onChange: vi.fn().mockReturnThis(),
        });
        return this;
    }

    addText(cb: (t: any) => any): this {
        cb({
            inputEl: { addEventListener: vi.fn(), focus: vi.fn() },
            setPlaceholder: vi.fn().mockReturnThis(),
            setValue: vi.fn().mockReturnThis(),
            onChange: vi.fn().mockReturnThis(),
        });
        return this;
    }

    addButton(cb: (b: any) => any): this {
        cb({
            setButtonText: vi.fn().mockReturnThis(),
            onClick: vi.fn().mockReturnThis(),
        });
        return this;
    }
}

export class Modal {
    contentEl: HTMLElement = {
        empty: vi.fn(),
        addClass: vi.fn(),
        createEl: vi.fn(() => ({
            addEventListener: vi.fn(),
        })),
    } as unknown as HTMLElement;

    constructor(public app: any) {}
    open(): void {}
    close(): void {}
}

/**
 * Basic YAML parser mock for tests supporting root filters, view filters, and properties.
 */
export function parseYaml(yamlString: string): any {
    const lines = yamlString.split('\n');
    const result: any = {};
    let currentSection: string | null = null;
    let currentView: any = null;
    let inFiltersAnd = false;
    let inViewFiltersAnd = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (line.startsWith('filters:')) {
            currentSection = 'filters';
            result.filters = {};
            continue;
        }

        if (line.startsWith('views:')) {
            currentSection = 'views';
            result.views = [];
            continue;
        }

        if (currentSection === 'filters') {
            if (trimmed === 'and:') {
                inFiltersAnd = true;
                result.filters.and = [];
                continue;
            }
            if (inFiltersAnd && trimmed.startsWith('- ')) {
                const itemStr = trimmed.slice(2).trim();
                result.filters.and.push(itemStr);
                continue;
            }
        }

        if (currentSection === 'views') {
            if (trimmed.startsWith('- type:')) {
                inViewFiltersAnd = false;
                const type = trimmed.replace('- type:', '').trim();
                currentView = { type };
                result.views.push(currentView);
                continue;
            }
            if (currentView) {
                if (trimmed.startsWith('name:')) {
                    currentView.name = trimmed.replace('name:', '').trim();
                } else if (trimmed.startsWith('groupBy:')) {
                    const val = trimmed.replace('groupBy:', '').trim();
                    if (val) {
                        currentView.groupBy = val;
                    } else {
                        currentView.groupBy = {};
                    }
                } else if (trimmed.startsWith('property:') && currentView.groupBy) {
                    currentView.groupBy.property = trimmed.replace('property:', '').trim();
                } else if (trimmed === 'filters:') {
                    currentView.filters = {};
                } else if (trimmed === 'and:' && currentView.filters) {
                    inViewFiltersAnd = true;
                    currentView.filters.and = [];
                } else if (inViewFiltersAnd && trimmed.startsWith('- ') && currentView.filters?.and) {
                    currentView.filters.and.push(trimmed.slice(2).trim());
                }
            }
        }
    }

    return result;
}
