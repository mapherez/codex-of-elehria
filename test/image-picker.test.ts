import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ImagePicker } from '../apps/web/src/admin/image-picker';
import { createTranslator } from '../packages/i18n';

function browser(t: TestContext, value: object): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
}

test('directory picker authorization is followed by an exact relative file selection', async t => {
  const handle = { getFile: async () => new File(['pixels'], 'portrait.png') };
  const directory = { name: '_images', resolve: async (selected: unknown) => { assert.equal(selected, handle); return ['characters', 'portrait.png']; } };
  let foldersOpened = 0;
  browser(t, {
    showDirectoryPicker: async () => { foldersOpened++; return directory; },
    showOpenFilePicker: async (options: { startIn: unknown }) => { assert.equal(options.startIn, directory); return [handle]; }
  });
  const picker = new ImagePicker();
  const notices: string[] = [];
  assert.equal(await picker.choose(createTranslator(), text => notices.push(text)), null);
  assert.match(notices.at(-1)!, /Click the image icon again/);
  const selected = await picker.choose(createTranslator(), text => notices.push(text));
  assert.deepEqual(selected, { path: 'characters/portrait.png', name: 'portrait.png', sha256: createHash('sha256').update('pixels').digest('hex') });
  assert.equal(foldersOpened, 1);
});

test('canceling native selection and choosing outside _images never returns a repair', async t => {
  let cancel = true;
  browser(t, {
    showDirectoryPicker: async () => {
      if (cancel) throw new DOMException('Canceled', 'AbortError');
      return { name: '_images', resolve: async () => null };
    },
    showOpenFilePicker: async () => [{ getFile: async () => new File([], 'outside.png') }]
  });
  const picker = new ImagePicker();
  assert.equal(await picker.choose(createTranslator(), () => {}), null);
  cancel = false;
  assert.equal(await picker.choose(createTranslator(), () => {}), null);
  await assert.rejects(picker.choose(createTranslator(), () => {}), error =>
    typeof error === 'object' && error !== null && 'detail' in error && (error.detail as { code: string }).code === 'error.imageOutside');
});
