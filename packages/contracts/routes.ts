export function pageUrl(file: string, basePath = ''): string {
  return file === 'home.md' ? `${basePath}/` : `${basePath}/wiki/${file.replace(/\.md$/i, '').split('/').map(encodeURIComponent).join('/')}`;
}

export function fileFromLocation(pathname: string, basePath = ''): string {
  const relative = pathname.slice(basePath.length);
  if (relative === '/' || relative === '') return 'home.md';
  if (!relative.startsWith('/wiki/')) return '';
  try {
    const file = decodeURIComponent(relative.slice(6));
    return /\.md$/i.test(file) ? file : file + '.md';
  } catch { return ''; }
}
