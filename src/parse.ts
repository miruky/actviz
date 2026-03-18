import { parse as parseYaml } from 'yaml';
import type { JobModel, StepModel, WorkflowModel } from './types';

/** ワークフローとして解釈できないYAMLに対する、利用者向けメッセージ付きのエラー */
export class WorkflowParseError extends Error {}

export function parseWorkflow(source: string, fileName: string): WorkflowModel {
  let doc: unknown;
  try {
    doc = parseYaml(source);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
    throw new WorkflowParseError(`YAMLとして読めない: ${detail}`);
  }
  if (!isRecord(doc)) {
    throw new WorkflowParseError('ワークフローの形をしていない(トップレベルがマッピングでない)');
  }
  const jobsRaw = doc['jobs'];
  if (!isRecord(jobsRaw)) {
    throw new WorkflowParseError('jobs がない。GitHub Actionsのワークフローには jobs が必須');
  }
  const jobs = Object.entries(jobsRaw).map(([id, body]) => parseJob(id, body));
  if (jobs.length === 0) {
    throw new WorkflowParseError('jobs が空');
  }
  return {
    label: typeof doc['name'] === 'string' ? doc['name'] : fileName,
    fileName,
    triggers: parseTriggers(doc['on']),
    workflowRunOf: parseWorkflowRunOf(doc['on']),
    jobs,
  };
}

function parseJob(id: string, body: unknown): JobModel {
  if (!isRecord(body)) {
    throw new WorkflowParseError(`ジョブ ${id} の中身がマッピングでない`);
  }
  const needs = normalizeNeeds(body['needs'], id);
  const uses = typeof body['uses'] === 'string' ? body['uses'] : undefined;
  return {
    id,
    label: typeof body['name'] === 'string' ? body['name'] : id,
    needs,
    runsOn: uses ? '' : normalizeRunsOn(body['runs-on']),
    condition: scalarToString(body['if']),
    environment: parseEnvironment(body['environment']),
    timeoutMinutes:
      typeof body['timeout-minutes'] === 'number' ? body['timeout-minutes'] : undefined,
    matrix: parseMatrix(body['strategy']),
    uses,
    steps: parseSteps(body['steps']),
  };
}

function normalizeNeeds(value: unknown, id: string): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((v): v is string => typeof v === 'string')) {
    return value;
  }
  throw new WorkflowParseError(`ジョブ ${id} の needs はジョブIDか、その配列でなければならない`);
}

function normalizeRunsOn(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(', ');
  if (isRecord(value) && typeof value['group'] === 'string') return `group: ${value['group']}`;
  return '';
}

function parseEnvironment(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value['name'] === 'string') return value['name'];
  return undefined;
}

/** matrix の各軸の名前と、静的に数えられる候補数。式参照("${{ ... }}")の軸は数えない */
function parseMatrix(strategy: unknown): Record<string, number> | undefined {
  if (!isRecord(strategy) || !isRecord(strategy['matrix'])) return undefined;
  const axes: Record<string, number> = {};
  for (const [axis, values] of Object.entries(strategy['matrix'])) {
    if (axis === 'include' || axis === 'exclude') continue;
    if (Array.isArray(values)) axes[axis] = values.length;
  }
  return Object.keys(axes).length > 0 ? axes : undefined;
}

function parseSteps(value: unknown): StepModel[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((step) => {
    const uses = typeof step['uses'] === 'string' ? step['uses'] : undefined;
    const run = typeof step['run'] === 'string' ? step['run'] : undefined;
    const name = typeof step['name'] === 'string' ? step['name'] : undefined;
    return { label: name ?? uses ?? firstLine(run) ?? '(無名のステップ)', uses, run };
  });
}

function parseTriggers(on: unknown): string[] {
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on.filter((v): v is string => typeof v === 'string');
  if (isRecord(on)) return Object.keys(on);
  return [];
}

function parseWorkflowRunOf(on: unknown): string[] {
  if (!isRecord(on) || !isRecord(on['workflow_run'])) return [];
  const workflows = on['workflow_run']['workflows'];
  if (typeof workflows === 'string') return [workflows];
  if (Array.isArray(workflows)) return workflows.filter((v): v is string => typeof v === 'string');
  return [];
}

function scalarToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function firstLine(value: string | undefined): string | undefined {
  return value
    ?.split('\n')
    .find((line) => line.trim() !== '')
    ?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
