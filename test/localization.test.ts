import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'svelte/compiler';
import { createTranslator, english } from '../packages/i18n';

test('all visible Svelte copy is supplied through localization or configuration', async () => {
  const violations: string[] = [];
  async function inspect(directory: string): Promise<void> {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await inspect(file);
      else if (item.name.endsWith('.svelte')) {
        const ast = parse(await fs.readFile(file, 'utf8'), { modern: true });
        function visit(value: unknown): void {
          if (!value || typeof value !== 'object') return;
          if (Array.isArray(value)) { value.forEach(visit); return; }
          const node = value as Record<string, unknown>;
          if (node.type === 'Text' && typeof node.data === 'string' && /[a-zA-Z]/.test(node.data)) violations.push(`${file}: ${node.data.trim()}`);
          // Attribute values are structural (classes, IDs, URLs), not visible copy.
          for (const [key, child] of Object.entries(node)) if (!['attributes', 'css', 'instance', 'module'].includes(key)) visit(child);
        }
        visit(ast.fragment);
      }
    }
  }
  await inspect('apps/web/src');
  assert.deepEqual(violations, []);
});

test('JSON dictionaries interpolate values and support locale overrides', () => {
  const translated = createTranslator('en', { ...english, 'action.save': 'Publish version' });
  assert.equal(translated('action.save'), 'Publish version');
  assert.equal(translated('git.move', { from: 'a.md', path: 'b.md' }), 'Move a.md to b.md');
});

test('incomplete server dictionaries retain bundled messages and supplied overrides', () => {
  for (const locale of ['en', 'fr']) {
    const translated = createTranslator(locale, { 'action.save': 'Custom save' });
    assert.equal(translated('action.save'), 'Custom save');
    assert.equal(translated('nox.stateUnchanged'), english['nox.stateUnchanged']);
    assert.equal(translated('nox.stateProblem'), english['nox.stateProblem']);
    assert.equal(translated('nox.stateAvailable'), english['nox.stateAvailable']);
    assert.equal(translated('nox.settings'), english['nox.settings']);
  }
});
