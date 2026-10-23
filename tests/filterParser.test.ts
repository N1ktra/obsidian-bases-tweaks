import { describe, expect, it } from 'vitest';
import {
    extractPropertiesFromFilterList,
    parseBaseFiltersFromYaml,
    parseFilterExpression,
    parseFilterValue,
} from '../src/services/filterParser';

describe('filterParser', () => {
    describe('parseFilterValue', () => {
        it('parses boolean values', () => {
            expect(parseFilterValue('true')).toBe(true);
            expect(parseFilterValue('false')).toBe(false);
            expect(parseFilterValue('TRUE')).toBe(true);
            expect(parseFilterValue('FALSE')).toBe(false);
        });

        it('parses number values', () => {
            expect(parseFilterValue('123')).toBe(123);
            expect(parseFilterValue('0')).toBe(0);
            expect(parseFilterValue('-42')).toBe(-42);
        });

        it('parses quoted strings', () => {
            expect(parseFilterValue('"hello world"')).toBe('hello world');
            expect(parseFilterValue("'single quoted'")).toBe('single quoted');
        });

        it('parses unquoted strings', () => {
            expect(parseFilterValue('active')).toBe('active');
        });

        it('converts link("Page.base") to [[Page.base]]', () => {
            expect(parseFilterValue('link("PG Meetings.base")')).toBe('[[PG Meetings.base]]');
            expect(parseFilterValue("link('PG Meetings.base')")).toBe('[[PG Meetings.base]]');
            expect(parseFilterValue('link("SwSec.md")')).toBe('[[SwSec]]');
        });

        it('preserves existing wikilinks [[Target]]', () => {
            expect(parseFilterValue('[[PG Meetings.base]]')).toBe('[[PG Meetings.base]]');
            expect(parseFilterValue('"[[PG Meetings.base]]"')).toBe('[[PG Meetings.base]]');
        });

        it('parses date("YYYY-MM-DD")', () => {
            expect(parseFilterValue('date("2026-10-23")')).toBe('2026-10-23');
        });

        it('parses arrays of links and primitives', () => {
            expect(parseFilterValue('[link("A.base"), link("B.base")]')).toEqual([
                '[[A.base]]',
                '[[B.base]]',
            ]);
            expect(parseFilterValue('["uni-notiz"]')).toBe('uni-notiz');
            expect(parseFilterValue('["tag1", "tag2"]')).toEqual(['tag1', 'tag2']);
        });
    });

    describe('parseFilterExpression', () => {
        it('parses array expression type == ["uni-notiz"]', () => {
            const result = parseFilterExpression('type == ["uni-notiz"]');
            expect(result).toEqual({ property: 'type', value: 'uni-notiz' });
        });

        it('parses link expression base == link("PG Meetings.base")', () => {
            const result = parseFilterExpression('base == link("PG Meetings.base")');
            expect(result).toEqual({ property: 'base', value: '[[PG Meetings.base]]' });
        });

        it('parses string expression Status == "In Bearbeitung"', () => {
            const result = parseFilterExpression('Status == "In Bearbeitung"');
            expect(result).toEqual({ property: 'Status', value: 'In Bearbeitung' });
        });

        it('parses boolean expression Done == false', () => {
            const result = parseFilterExpression('Done == false');
            expect(result).toEqual({ property: 'Done', value: false });
        });

        it('ignores file.* properties like file.folder', () => {
            expect(parseFilterExpression('file.folder == "Alle Notizen"')).toBeNull();
            expect(parseFilterExpression('file.inFolder(this.file.folder)')).toBeNull();
        });

        it('parses object filter format { property, value }', () => {
            const result = parseFilterExpression({ property: 'priority', value: 1 });
            expect(result).toEqual({ property: 'priority', value: 1 });

            const linkResult = parseFilterExpression({
                property: 'base',
                value: 'link("PG Meetings.base")',
            });
            expect(linkResult).toEqual({ property: 'base', value: '[[PG Meetings.base]]' });
        });
    });

    describe('extractPropertiesFromFilterList', () => {
        it('extracts properties from and array including nested or blocks', () => {
            const filters = {
                and: [
                    'type == ["uni-notiz"]',
                    'file.inFolder(this.file.folder)',
                    'Done == false',
                    {
                        or: [
                            'base == link("PG Meetings.base")',
                            'file.folder == "Alle Seiten"',
                        ],
                    },
                ],
            };
            const props = extractPropertiesFromFilterList(filters);
            expect(props).toEqual({
                type: 'uni-notiz',
                Done: false,
                base: '[[PG Meetings.base]]',
            });
        });
    });

    describe('parseBaseFiltersFromYaml', () => {
        const sampleYaml = `
filters:
  and:
    - type == ["todo"]
    - base == link("PG Meetings.base")
    - file.folder == "Alle Seiten/Persönliches/To-Do"
views:
  - type: kanban
    name: Kanban Board
    filters:
      and:
        - Done == false
        - Status == "Offen"
    groupBy:
      property: Dringlichkeit
      direction: DESC
`;

        it('merges root and active view filters with proper link syntax and extracts target folder', () => {
            const { properties, targetFolder } = parseBaseFiltersFromYaml(
                sampleYaml,
                'kanban',
                'Alle Seiten/Persönliches'
            );
            expect(properties).toEqual({
                type: 'todo',
                base: '[[PG Meetings.base]]',
                Done: false,
                Status: 'Offen',
            });
            expect(targetFolder).toBe('Alle Seiten/Persönliches/To-Do');
        });

        it('extracts file.inFolder(this.file.folder) resolving to base folder', () => {
            const uniYaml = `
filters:
  and:
    - type == ["uni-notiz"]
    - file.inFolder(this.file.folder)
views:
  - type: kanban
    name: Übersicht
    groupBy:
      property: file.folder
`;
            const { properties, targetFolder } = parseBaseFiltersFromYaml(
                uniYaml,
                'kanban',
                'Alle Seiten/Uni'
            );
            expect(properties).toEqual({
                type: 'uni-notiz',
            });
            expect(targetFolder).toBe('Alle Seiten/Uni');
        });
    });
});
