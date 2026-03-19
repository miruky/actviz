import { describe, expect, it } from 'vitest';
import { loadFiles, saveFiles } from './store';
import type { WorkflowFile } from './types';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

describe('store', () => {
  it('保存して読み戻せる', () => {
    const storage = memoryStorage();
    const files: WorkflowFile[] = [{ name: 'ci.yml', source: 'jobs: {}' }];
    saveFiles(storage, files);
    expect(loadFiles(storage)).toEqual(files);
  });

  it('保存がなければ null', () => {
    expect(loadFiles(memoryStorage())).toBeNull();
  });

  it('壊れたJSONや形の違うデータは null(初期状態に戻す)', () => {
    const storage = memoryStorage();
    storage.data.set('actviz:files:v1', '{broken');
    expect(loadFiles(storage)).toBeNull();
    storage.data.set('actviz:files:v1', '[{"name": 1}]');
    expect(loadFiles(storage)).toBeNull();
    storage.data.set('actviz:files:v1', '[]');
    expect(loadFiles(storage)).toBeNull();
  });
});
