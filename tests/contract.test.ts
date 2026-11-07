import { expect, test } from 'bun:test';
import { z } from 'zod';
import { canonicalJson, date, group, image, line, list, optionalParagraph, paragraph, richText } from '../src/index.ts';

const contract = z.strictObject({
  hero: group('Top of page', {
    title: line('Title'),
    intro: optionalParagraph('Introduction')
  }),
  steps: list('Steps', z.strictObject({ title: line('Title'), body: paragraph('Text') }), { count: 2 }),
  questions: list('Questions', line('Question')),
  notes: list('Notes', line('Note'), { optional: true })
});

const valid = () => ({
  hero: { title: 'Hello', intro: '' },
  steps: [
    { title: 'One', body: 'First' },
    { title: 'Two', body: 'Second' }
  ],
  questions: ['Why?'],
  notes: []
});

test('valid content passes, whatever the words are', () => {
  expect(contract.safeParse(valid()).success).toBe(true);
});

test('a blank required text is refused', () => {
  const content = valid();
  content.hero.title = '   ';
  expect(contract.safeParse(content).success).toBe(false);
});

test('an optional text may be empty', () => {
  expect(contract.parse(valid()).hero.intro).toBe('');
});

test('a misspelled or missing field is refused', () => {
  const misspelled = { ...valid(), hero: { title: 'Hello', intro: '', titel: 'x' } };
  expect(contract.safeParse(misspelled).success).toBe(false);

  const { notes: _notes, ...missing } = valid();
  expect(contract.safeParse(missing).success).toBe(false);
});

test('a list the layout depends on keeps its size', () => {
  const content = valid();
  content.steps.pop();
  expect(contract.safeParse(content).success).toBe(false);
});

test('a free list needs at least one item, unless it is optional', () => {
  expect(contract.safeParse({ ...valid(), questions: [] }).success).toBe(false);
  expect(contract.safeParse({ ...valid(), questions: ['a', 'b', 'c'] }).success).toBe(true);
  expect(contract.safeParse({ ...valid(), notes: [] }).success).toBe(true);
});

test('a list cannot be both a fixed size and optional, because the two promise different things', () => {
  expect(() => list('Steps', line('Step'), { count: 2, optional: true })).toThrow('Steps');
  expect(() => list('Steps', line('Step'), { optional: true })).not.toThrow();
});

test('a fixed list may say it is not optional, and a wrapper can pass its options through', () => {
  expect(list('Steps', line('Step'), { count: 1, optional: false }).safeParse(['One']).success).toBe(true);
  const wrapped = (options: { count?: number; optional?: boolean }) => list('Steps', line('Step'), options);
  expect(wrapped({ count: 1 }).safeParse(['One']).success).toBe(true);
});

test('a photo needs a path, unless it is optional', () => {
  expect(image('Photo').safeParse('').success).toBe(false);
  expect(image('Photo').safeParse('/images/uploads/van.webp').success).toBe(true);
  expect(image('Photo', { optional: true }).safeParse('').success).toBe(true);
});

test('a date must be a real calendar date', () => {
  expect(date('Published').safeParse('2026-11-06').success).toBe(true);
  expect(date('Published').safeParse('2026-13-40').success).toBe(false);
  expect(date('Published').safeParse('next week').success).toBe(false);
});

test('rich text cannot be blank', () => {
  expect(richText('Article').safeParse('\n ').success).toBe(false);
  expect(richText('Article').safeParse('# Hello').success).toBe(true);
});

test('canonicalJson rewrites a file in the contract order, so an editor save stays small', () => {
  const shuffled = JSON.stringify({ notes: [], questions: ['Why?'], steps: valid().steps, hero: { intro: '', title: 'Hello' } });
  expect(canonicalJson(contract, shuffled)).toBe(`${JSON.stringify(valid(), null, 2)}\n`);
});

test('canonicalJson refuses content the contract refuses', () => {
  expect(() => canonicalJson(contract, JSON.stringify({ ...valid(), extra: true }))).toThrow();
});
