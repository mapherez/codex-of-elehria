import type { RepairImageInput } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';
import { ApiClientError } from '../lib/api';

interface DirectoryHandle extends FileSystemDirectoryHandle {
  resolve(handle: FileSystemHandle): Promise<string[] | null>;
}
interface PickerWindow extends Window {
  showDirectoryPicker?: (options: { id: string; mode: 'read' }) => Promise<DirectoryHandle>;
  showOpenFilePicker?: (options: { id: string; startIn: DirectoryHandle; multiple: false;
    types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]>;
}
type Selection = Pick<RepairImageInput, 'path' | 'name' | 'sha256'>;
const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];

export class ImagePicker {
  private directory?: DirectoryHandle;
  async choose(t: Translator, notice: (text: string) => void): Promise<Selection | null> {
    const picker = window as PickerWindow;
    try {
      let file: File;
      let relative: string | undefined;
      if (picker.showDirectoryPicker && picker.showOpenFilePicker) {
        if (!this.directory) {
          notice(t('image.selectFolder'));
          const directory = await picker.showDirectoryPicker({ id: 'codex-images', mode: 'read' });
          if (directory.name !== '_images') throw new ApiClientError({ code: 'error.imageFolder' }, 400);
          this.directory = directory;
          notice(t('image.folderReady'));
          return null;
        }
        const [handle] = await picker.showOpenFilePicker({ id: 'codex-image', startIn: this.directory, multiple: false,
          types: [{ description: t('image.fileType'), accept: { 'image/*': extensions } }] });
        if (!handle) return null;
        const segments = await this.directory.resolve(handle);
        if (!segments?.length) throw new ApiClientError({ code: 'error.imageOutside' }, 400);
        relative = segments.join('/');
        file = await handle.getFile();
      } else {
        // Standard native picker fallback: the server identifies the existing file
        // by name and content hash. No upload or fabricated browser path is used.
        const selected = await new Promise<File | null>(resolve => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = extensions.join(','); input.hidden = true;
          const finish = (value: File | null) => { input.remove(); resolve(value); };
          input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
          input.addEventListener('cancel', () => finish(null), { once: true });
          document.body.append(input); input.click();
        });
        if (!selected) return null;
        file = selected;
      }
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      return { ...(relative ? { path: relative } : {}), name: file.name, sha256 };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') { notice(''); return null; }
      if (error instanceof ApiClientError) throw error;
      this.directory = undefined;
      throw new ApiClientError({ code: 'error.imagePicker' }, 400);
    }
  }
}
