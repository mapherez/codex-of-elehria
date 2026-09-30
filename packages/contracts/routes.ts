export function pageUrl(file: string, basePath = ''): string {
  return file === 'home.md' ? `${basePath}/` : `${basePath}/wiki/${file.split('/').map(encodeURIComponent).join('/')}`;
}

export function fileFromLocation(pathname: string, basePath = ''): string {
  const relative = pathname.slice(basePath.length);
  if (relative === '/' || relative === '') return 'home.md';
  if (!relative.startsWith('/wiki/')) return '';
  try { return decodeURIComponent(relative.slice(6)); } catch { return ''; }
}
