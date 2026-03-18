import { describe, expect, it } from 'vitest';
import { criticalPath } from './graph';
import { parseWorkflow } from './parse';
import { escapeXml, matrixSize, renderWorkflowSvg, truncate } from './render';

const DIAMOND = parseWorkflow(
  [
    'name: CI',
    'jobs:',
    '  lint:',
    '    runs-on: ubuntu-latest',
    '  test:',
    '    name: テスト',
    '    runs-on: ubuntu-latest',
    '    needs: lint',
    '    strategy:',
    '      matrix:',
    '        node: [20, 22]',
    '  package:',
    '    runs-on: ubuntu-latest',
    '    needs: test',
  ].join('\n'),
  'ci.yml',
);

describe('renderWorkflowSvg', () => {
  it('ジョブごとにノード、needs ごとにエッジを描く', () => {
    const svg = renderWorkflowSvg(DIAMOND, 0);
    expect(svg.match(/class="node/g)).toHaveLength(3);
    expect(svg.match(/class="edge/g)).toHaveLength(2);
    expect(svg).toContain('data-job="lint"');
    expect(svg).toContain('data-from="lint"');
  });

  it('viewBoxとアクセシビリティ属性を持つ', () => {
    const svg = renderWorkflowSvg(DIAMOND, 0);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title>CI のジョブ依存グラフ</title>');
    expect(svg).toContain('prefers-color-scheme: dark');
  });

  it('matrix の並列数をバッジ表示する', () => {
    const svg = renderWorkflowSvg(DIAMOND, 0);
    expect(svg).toContain('matrix 2');
  });

  it('クリティカルパスのノードとエッジに crit が付く', () => {
    const svg = renderWorkflowSvg(DIAMOND, 0, { critical: criticalPath(DIAMOND) });
    expect(svg.match(/node crit/g)).toHaveLength(3);
    expect(svg.match(/edge crit/g)).toHaveLength(2);
  });

  it('ジョブ名のXML特殊文字をエスケープする', () => {
    const wf = parseWorkflow('jobs:\n  a:\n    name: "<b> & co"\n    runs-on: x', 'w.yml');
    const svg = renderWorkflowSvg(wf, 0);
    expect(svg).toContain('&lt;b&gt; &amp; co');
    expect(svg).not.toContain('<b> & co');
  });

  it('markerのidはワークフローごとに分かれる', () => {
    expect(renderWorkflowSvg(DIAMOND, 3)).toContain('id="arr-3"');
  });
});

describe('truncate', () => {
  it('長い名前は省略記号付きで切る', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('短い', 5)).toBe('短い');
  });
});

describe('matrixSize', () => {
  it('全軸の組み合わせ数を返す', () => {
    expect(matrixSize(DIAMOND.jobs[1]!)).toBe(2);
    expect(matrixSize(DIAMOND.jobs[0]!)).toBe(0);
  });
});

describe('escapeXml', () => {
  it('属性に使う引用符も対象', () => {
    expect(escapeXml('a"b<c>&')).toBe('a&quot;b&lt;c&gt;&amp;');
  });
});
