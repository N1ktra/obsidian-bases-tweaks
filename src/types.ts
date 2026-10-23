import { TFile } from 'obsidian';

export type BaseOpenMode = 'current' | 'tab' | 'split';

export interface KanbanBasesPlusSettings {
    baseOpenMode: BaseOpenMode;
    defaultNoteTitlePrefix: string;
    perPageOpenModes: Record<string, BaseOpenMode>;
}

export interface FilterPropertyMap {
    [key: string]: string | number | boolean | any[];
}

export interface BaseViewGroupBy {
    property?: string;
    direction?: 'ASC' | 'DESC' | string;
}

export interface BaseViewConfig {
    type?: string;
    name?: string;
    groupBy?: BaseViewGroupBy;
    filters?: {
        and?: any[];
        [key: string]: any;
    } | any[];
    [key: string]: any;
}

export interface BaseConfigFile {
    filters?: {
        and?: any[];
        [key: string]: any;
    } | any[];
    views?: BaseViewConfig[];
    [key: string]: any;
}

export interface BaseResolutionResult {
    baseFile: TFile | null;
    activeView?: BaseViewConfig | null;
    groupProperty?: string | null;
}
