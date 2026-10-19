import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_WORKSPACE_THEME,
  isWorkspaceTheme,
  persistWorkspaceTheme,
  readWorkspaceTheme,
  WORKSPACE_THEMES,
  WORKSPACE_THEME_STORAGE_KEY,
} from '../src/workspace-theme.js';

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem(key) {
      assert.equal(key, WORKSPACE_THEME_STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, WORKSPACE_THEME_STORAGE_KEY);
      value = nextValue;
    },
  };
}

test('provides the six workspace theme presets', () => {
  assert.deepEqual(WORKSPACE_THEMES.map(({ name }) => name), [
    'Default Dark',
    'Light',
    'AMOLED / Pure Black',
    'Soft Gradient Dark',
    'Ocean Blue',
    'Violet',
  ]);
  assert.equal(new Set(WORKSPACE_THEMES.map(({ id }) => id)).size, 6);
  assert.equal(isWorkspaceTheme(DEFAULT_WORKSPACE_THEME), true);
});

test('persists and restores a selected workspace theme', () => {
  const storage = createStorage();
  persistWorkspaceTheme('ocean-blue', storage);
  assert.equal(readWorkspaceTheme(storage), 'ocean-blue');
});

test('uses the default for an invalid or unavailable stored preference', () => {
  assert.equal(readWorkspaceTheme(createStorage('unknown-theme')), DEFAULT_WORKSPACE_THEME);
  assert.equal(readWorkspaceTheme({
    getItem() { throw new Error('storage unavailable'); },
  }), DEFAULT_WORKSPACE_THEME);
  assert.throws(() => persistWorkspaceTheme('unknown-theme', createStorage()), RangeError);
});

test('defines palettes and responsive theme picker styling for every preset', () => {
  const css = readFileSync(new URL('../src/workspace.css', import.meta.url), 'utf8');
  for (const { id } of WORKSPACE_THEMES) {
    assert.ok(css.includes(`.app-shell[data-theme="${id}"]`), `missing palette for ${id}`);
    assert.ok(css.includes(`.theme-swatch-${id}`), `missing theme swatch for ${id}`);
  }
  assert.match(css, /\.theme-option\[aria-pressed="true"\]/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*theme-picker-panel/);
});
