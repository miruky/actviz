import { describe, expect, it } from 'vitest';
import { GAP_X, NODE_W, PADDING, layoutWorkflow } from './layout';
import { parseWorkflow } from './parse';

const wf = (yaml: string) => parseWorkflow(yaml, 'w.yml');

describe('layoutWorkflow', () => {
  it('needs の深さがレイヤーになる', () => {
    const layout = layoutWorkflow(
      wf(
        [
          'jobs:',
          '  a:',
          '    runs-on: x',
          '  b:',
          '    runs-on: x',
          '    needs: a',
          '  c:',
          '    runs-on: x',
          '    needs: b',
        ].join('\n'),
      ),
    );
    expect(layout.placed.get('a')!.layer).toBe(0);
    expect(layout.placed.get('b')!.layer).toBe(1);
    expect(layout.placed.get('c')!.layer).toBe(2);
  });

  it('合流するジョブは最長距離のレイヤーに置かれる', () => {
    const layout = layoutWorkflow(
      wf(
        [
          'jobs:',
          '  a:',
          '    runs-on: x',
          '  b:',
          '    runs-on: x',
          '    needs: a',
          '  c:',
          '    runs-on: x',
          '    needs: [a, b]',
        ].join('\n'),
      ),
    );
    expect(layout.placed.get('c')!.layer).toBe(2);
  });

  it('x座標はレイヤーに比例し、全ジョブが配置される', () => {
    const layout = layoutWorkflow(
      wf('jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n    needs: a'),
    );
    expect(layout.placed.size).toBe(2);
    expect(layout.placed.get('a')!.x).toBe(PADDING);
    expect(layout.placed.get('b')!.x).toBe(PADDING + NODE_W + GAP_X);
  });

  it('同一レイヤーのジョブは重ならない', () => {
    const layout = layoutWorkflow(
      wf('jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n  c:\n    runs-on: x'),
    );
    const ys = [...layout.placed.values()].map((p) => p.y);
    expect(new Set(ys).size).toBe(3);
  });

  it('循環していても全ジョブを配置する(壊れずに描ける)', () => {
    const layout = layoutWorkflow(
      wf('jobs:\n  a:\n    runs-on: x\n    needs: b\n  b:\n    runs-on: x\n    needs: a'),
    );
    expect(layout.placed.size).toBe(2);
    expect(layout.width).toBeGreaterThan(0);
  });

  it('存在しない needs 参照は無視して配置する', () => {
    const layout = layoutWorkflow(wf('jobs:\n  a:\n    runs-on: x\n    needs: ghost'));
    expect(layout.placed.get('a')!.layer).toBe(0);
  });
});
