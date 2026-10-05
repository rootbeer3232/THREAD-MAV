export interface Location {
  route: string;
  params: URLSearchParams;
}

export function parseHash(hash: string): Location {
  const h = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = h.split('?');
  return { route: path.replace(/\/+$/, ''), params: new URLSearchParams(query) };
}

export function buildHash(route: string, params?: Record<string, string>): string {
  const q = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${route}${q}`;
}
