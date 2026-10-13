import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from './linkUtils.js';

test('extracts secure links and retains punctuation outside the link', () => {
  const text = 'Visit https://example.com/path?x=1, then www.example.org.';
  assert.deepEqual(extractLinks(text), [
    {
      text: 'https://example.com/path?x=1',
      start: 6,
      end: 34,
      href: 'https://example.com/path?x=1',
      hostname: 'example.com'
    },
    {
      text: 'www.example.org',
      start: 41,
      end: 56,
      href: 'https://www.example.org/',
      hostname: 'www.example.org'
    }
  ]);
});

test('keeps balanced URL parentheses and ignores non-web protocols', () => {
  const links = extractLinks('https://example.com/a_(b). javascript:alert(1)');
  assert.equal(links.length, 1);
  assert.equal(links[0].text, 'https://example.com/a_(b)');
});

test('returns no links for empty or non-text values', () => {
  assert.deepEqual(extractLinks(''), []);
  assert.deepEqual(extractLinks(null), []);
});
