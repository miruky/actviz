import type { WorkflowFile } from './types';

// 編集中のファイル一式をlocalStorageに残し、再訪時に続きから使えるようにする。

const KEY = 'actviz:files:v1';

export function loadFiles(storage: Pick<Storage, 'getItem'>): WorkflowFile[] | null {
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (f): f is WorkflowFile =>
          typeof f === 'object' &&
          f !== null &&
          typeof (f as WorkflowFile).name === 'string' &&
          typeof (f as WorkflowFile).source === 'string',
      )
    ) {
      return parsed;
    }
  } catch {
    // 壊れた保存内容は捨てて初期状態に戻す
  }
  return null;
}

export function saveFiles(storage: Pick<Storage, 'setItem'>, files: WorkflowFile[]): void {
  storage.setItem(KEY, JSON.stringify(files));
}
