import { describe, expect, it } from 'vitest';
import { WorkflowParseError, parseWorkflow } from './parse';
import { SAMPLE_FILES } from './samples';

describe('parseWorkflow', () => {
  it('名前・トリガー・ジョブを読み取る', () => {
    const wf = parseWorkflow(
      [
        'name: CI',
        'on: [push, pull_request]',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
      ].join('\n'),
      'ci.yml',
    );
    expect(wf.label).toBe('CI');
    expect(wf.triggers).toEqual(['push', 'pull_request']);
    expect(wf.jobs).toHaveLength(1);
    expect(wf.jobs[0]!.runsOn).toBe('ubuntu-latest');
  });

  it('name がなければファイル名を表示名にする', () => {
    const wf = parseWorkflow('on: push\njobs:\n  a:\n    runs-on: x', 'nightly.yml');
    expect(wf.label).toBe('nightly.yml');
    expect(wf.triggers).toEqual(['push']);
  });

  it('on がマッピングでもイベント名を拾う', () => {
    const wf = parseWorkflow(
      'on:\n  push:\n    branches: [main]\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  a:\n    runs-on: x',
      'w.yml',
    );
    expect(wf.triggers).toEqual(['push', 'schedule']);
  });

  it('needs は文字列でも配列でも受け付ける', () => {
    const wf = parseWorkflow(
      'jobs:\n  a:\n    runs-on: x\n  b:\n    runs-on: x\n    needs: a\n  c:\n    runs-on: x\n    needs: [a, b]',
      'w.yml',
    );
    expect(wf.jobs[1]!.needs).toEqual(['a']);
    expect(wf.jobs[2]!.needs).toEqual(['a', 'b']);
  });

  it('matrix の静的な軸を数える', () => {
    const wf = parseWorkflow(
      [
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    strategy:',
        '      matrix:',
        '        node: [20, 22]',
        '        os: [linux, mac, windows]',
        '        include:',
        '          - node: 23',
      ].join('\n'),
      'w.yml',
    );
    expect(wf.jobs[0]!.matrix).toEqual({ node: 2, os: 3 });
  });

  it('再利用ワークフロー呼び出しを区別する', () => {
    const wf = parseWorkflow(
      'jobs:\n  call:\n    uses: org/repo/.github/workflows/x.yml@main',
      'w.yml',
    );
    expect(wf.jobs[0]!.uses).toContain('x.yml');
    expect(wf.jobs[0]!.runsOn).toBe('');
  });

  it('workflow_run の先行ワークフロー名を読む', () => {
    const wf = parseWorkflow(
      'on:\n  workflow_run:\n    workflows: [CI, Nightly]\n    types: [completed]\njobs:\n  a:\n    runs-on: x',
      'deploy.yml',
    );
    expect(wf.workflowRunOf).toEqual(['CI', 'Nightly']);
  });

  it('ステップの表示名は name、uses、run の順で決まる', () => {
    const wf = parseWorkflow(
      [
        'jobs:',
        '  a:',
        '    runs-on: x',
        '    steps:',
        '      - name: 明示した名前',
        '        run: echo hi',
        '      - uses: actions/checkout@v4',
        '      - run: |',
        '          npm ci',
        '          npm test',
      ].join('\n'),
      'w.yml',
    );
    const labels = wf.jobs[0]!.steps.map((s) => s.label);
    expect(labels).toEqual(['明示した名前', 'actions/checkout@v4', 'npm ci']);
  });

  it('if と environment と timeout-minutes を読む', () => {
    const wf = parseWorkflow(
      [
        'jobs:',
        '  deploy:',
        '    runs-on: x',
        "    if: github.ref == 'refs/heads/main'",
        '    environment: production',
        '    timeout-minutes: 30',
      ].join('\n'),
      'w.yml',
    );
    const job = wf.jobs[0]!;
    expect(job.condition).toContain('github.ref');
    expect(job.environment).toBe('production');
    expect(job.timeoutMinutes).toBe(30);
  });

  it.each([
    ['壊れたYAML', 'jobs: ['],
    ['jobs がない', 'name: CI\non: push'],
    ['jobs が空', 'jobs: {}'],
    ['needs の型が不正', 'jobs:\n  a:\n    needs: 1'],
    ['トップレベルが配列', '- a\n- b'],
  ])('%s は WorkflowParseError', (_label, source) => {
    expect(() => parseWorkflow(source, 'w.yml')).toThrow(WorkflowParseError);
  });

  it('同梱サンプルは2つとも解析できる', () => {
    for (const file of SAMPLE_FILES) {
      const wf = parseWorkflow(file.source, file.name);
      expect(wf.jobs.length).toBeGreaterThan(2);
    }
  });
});
