import type { NavigationNode } from '../../../../packages/contracts';

export function buildNavigation(files: string[], locale: string): NavigationNode[] {
  const root: NavigationNode[] = [];
  for (const file of files) {
    if (file === 'home.md') continue;
    const segments = file.split('/');
    const filename = segments.pop()!;
    let children = root;
    for (let index = 0; index < segments.length; index++) {
      const folderPath = segments.slice(0, index + 1).join('/');
      let folder = children.find(node => node.type === 'folder' && node.path === folderPath);
      if (!folder) { folder = { type: 'folder', path: folderPath, name: segments[index]!, children: [] }; children.push(folder); }
      if (folder.type === 'folder') children = folder.children;
    }
    children.push({ type: 'page', path: file, name: filename.replace(/\.md$/i, '') });
  }
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  function sort(nodes: NavigationNode[]): void {
    nodes.sort((a, b) => a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : collator.compare(a.name, b.name) || a.name.localeCompare(b.name));
    for (const node of nodes) if (node.type === 'folder') sort(node.children);
  }
  sort(root);
  return root;
}
