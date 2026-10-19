export const WORKSPACE_THEME_STORAGE_KEY = 'synkro.workspace.theme.v1';
export const DEFAULT_WORKSPACE_THEME = 'default-dark';

export const WORKSPACE_THEMES = Object.freeze([
  { id: 'default-dark', name: 'Default Dark', description: 'The calm, familiar Synkro look.' },
  { id: 'light', name: 'Light', description: 'A clear, softly tinted light workspace.' },
  { id: 'amoled', name: 'AMOLED / Pure Black', description: 'Deep black surfaces with crisp contrast.' },
  { id: 'soft-gradient-dark', name: 'Soft Gradient Dark', description: 'A subtle dusk gradient with lilac accents.' },
  { id: 'ocean-blue', name: 'Ocean Blue', description: 'A deep blue palette with cool highlights.' },
  { id: 'violet', name: 'Violet', description: 'A dark plum palette with gentle violet glows.' },
]);

const themeIds = new Set(WORKSPACE_THEMES.map(({ id }) => id));

export function isWorkspaceTheme(theme) {
  return themeIds.has(theme);
}

export function readWorkspaceTheme(storage = globalThis.localStorage) {
  try {
    const savedTheme = storage?.getItem(WORKSPACE_THEME_STORAGE_KEY);
    return isWorkspaceTheme(savedTheme) ? savedTheme : DEFAULT_WORKSPACE_THEME;
  } catch {
    return DEFAULT_WORKSPACE_THEME;
  }
}

export function persistWorkspaceTheme(theme, storage = globalThis.localStorage) {
  if (!isWorkspaceTheme(theme)) throw new RangeError(`Unknown workspace theme: ${theme}`);
  if (!storage) throw new Error('Workspace theme storage is unavailable.');
  storage.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
}
