import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  criticalPath,
  descendantsOf,
  findCycle,
  findNeedsIssues,
  workflowRunEdges,
  workflowStats,
} from './graph';
import { parseWorkflow } from './parse';

const DIAMOND = parseWorkflow(
  [
    'name: CI',
    'jobs:',
    '  lint:',
    '    runs-on: x',
    '  test:',
    '    runs-on: x',
    '    needs: lint',
    '  build:',
    '    runs-on: x',
    '    needs: lint',
    '  package:',
    '    runs-on: x',
    '    needs: [test, build]',
  ].join('\n'),
  'ci.yml',
);

describe('findNeedsIssues', () => {
  it('存在しないジョブへの参照を報告する', () => {
    const wf = parseWorkflow('jobs:\n  a:\n    runs-on: x\n    needs: ghost', 'w.yml');
    const issues = findNeedsIssues(wf);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('ghost');
  });

  it('整合していれば空', () => {
    expect(findNeedsIssues(DIAMOND)).toEqual([]);
  });
});

describe('findCycle', () => {
  it('循環をパスとして返す', () => {
    const wf = parseWorkflow(
      'jobs:\n  a:\n    runs-on: x\n    needs: b\n  b:\n    runs-on: x\n    needs: a',
      'w.yml',
    );
    const cycle = findCycle(wf);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  it('DAGなら null', () => {
    expect(findCycle(DIAMOND)).toBeNull();
  });
});

describe('ancestorsOf / descendantsOf', () => {
  it('間接の依存まで辿る', () => {
    expect(ancestorsOf(DIAMOND, 'package')).toEqual(new Set(['test', 'build', 'lint']));
    expect(descendantsOf(DIAMOND, 'lint')).toEqual(new Set(['test', 'build', 'package']));
  });

  it('起点ジョブの祖先は空', () => {
    expect(ancestorsOf(DIAMOND, 'lint')).toEqual(new Set());
  });
});

describe('criticalPath', () => {
  it('最長のジョブ列を返す', () => {
    const path = criticalPath(DIAMOND);
    expect(path).toHaveLength(3);
    expect(path[0]).toBe('lint');
    expect(path[2]).toBe('package');
  });

  it('依存がなければ空(強調するものがない)', () => {
    const wf = parseWorkflow('jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x', 'w.yml');
    expect(criticalPath(wf)).toEqual([]);
  });

  it('循環していれば空', () => {
    const wf = parseWorkflow(
      'jobs:\n  a:\n    runs-on: x\n    needs: b\n  b:\n    runs-on: x\n    needs: a',
      'w.yml',
    );
    expect(criticalPath(wf)).toEqual([]);
  });
});

describe('workflowStats', () => {
  it('ダイヤ型の段数と並列度を数える', () => {
    const stats = workflowStats(DIAMOND);
    expect(stats.jobCount).toBe(4);
    expect(stats.stageCount).toBe(3); // lint → (test|build) → package
    expect(stats.maxParallel).toBe(2); // testとbuildが同じ段
  });

  it('依存のない並列ジョブは1段で並列度ぶん', () => {
    const wf = parseWorkflow('jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x', 'w.yml');
    const stats = workflowStats(wf);
    expect(stats.jobCount).toBe(2);
    expect(stats.stageCount).toBe(1);
    expect(stats.maxParallel).toBe(2);
  });

  it('循環があっても止まらず数える', () => {
    const wf = parseWorkflow(
      'jobs:\n  a:\n    runs-on: x\n    needs: b\n  b:\n    runs-on: x\n    needs: a',
      'w.yml',
    );
    const stats = workflowStats(wf);
    expect(stats.jobCount).toBe(2);
    expect(stats.maxParallel).toBeGreaterThanOrEqual(1);
  });
});

describe('workflowRunEdges', () => {
  it('名前の一致で先行ワークフローと結ぶ', () => {
    const ci = parseWorkflow('name: CI\njobs:\n  a:\n    runs-on: x', 'ci.yml');
    const deploy = parseWorkflow(
      'name: Deploy\non:\n  workflow_run:\n    workflows: [CI]\njobs:\n  d:\n    runs-on: x',
      'deploy.yml',
    );
    expect(workflowRunEdges([ci, deploy])).toEqual([[0, 1]]);
  });

  it('一致する名前がなければ結ばない', () => {
    const deploy = parseWorkflow(
      'name: Deploy\non:\n  workflow_run:\n    workflows: [Nightly]\njobs:\n  d:\n    runs-on: x',
      'deploy.yml',
    );
    expect(workflowRunEdges([deploy])).toEqual([]);
  });
});
