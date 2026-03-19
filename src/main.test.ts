// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

// index.html と同じ骨格を組み立ててから main.ts を読み込み、
// 初期化がDOM配線まで含めて通ることを確かめるスモークテスト。

const SHELL = `
  <div id="file-tabs"></div>
  <button id="add-file"></button>
  <button id="open-files"></button>
  <button id="remove-file"></button>
  <input type="file" id="file-input" hidden />
  <button id="load-sample"></button>
  <input type="checkbox" id="critical-toggle" />
  <textarea id="source"></textarea>
  <section id="graph-pane"></section>
  <aside id="details" hidden></aside>
`;

beforeAll(async () => {
  document.body.innerHTML = SHELL;
  await import('./main');
});

describe('アプリ初期化', () => {
  it('初回はサンプル2ファイルのタブが並ぶ', () => {
    const tabs = document.querySelectorAll('#file-tabs .tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.textContent).toBe('ci.yml');
  });

  it('ワークフローカードとグラフSVGが描かれる', () => {
    const cards = document.querySelectorAll('#graph-pane .wf-card');
    expect(cards).toHaveLength(2);
    expect(document.querySelectorAll('#graph-pane svg.actviz-graph')).toHaveLength(2);
  });

  it('deploy には workflow_run の連鎖チップが付く', () => {
    const chips = [...document.querySelectorAll('.chip.chain')].map((c) => c.textContent);
    expect(chips.some((t) => t?.includes('CI の完了後'))).toBe(true);
  });

  it('ジョブをクリックすると詳細パネルが開く', () => {
    const node = document.querySelector<SVGGElement>('g.node[data-job="package"]');
    expect(node).not.toBeNull();
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const details = document.getElementById('details')!;
    expect(details.hidden).toBe(false);
    expect(details.textContent).toContain('package');
    expect(details.textContent).toContain('needs');
  });

  it('Escapeで詳細パネルが閉じる', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('details')!.hidden).toBe(true);
  });

  it('編集するとデバウンス後にグラフが描き直される', async () => {
    const source = document.getElementById('source') as HTMLTextAreaElement;
    source.value = 'name: Edited\njobs:\n  solo:\n    runs-on: ubuntu-latest\n';
    source.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(document.querySelector('#graph-pane .wf-card h2')!.textContent).toBe('Edited');
    expect(document.querySelector('g.node[data-job="solo"]')).not.toBeNull();
  });
});
