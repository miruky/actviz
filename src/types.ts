// ワークフローYAMLから抽出した、可視化に必要な情報のモデル。
// GitHub Actionsの全機能を写し取るのではなく、依存関係の理解に効く範囲に絞る。

export interface StepModel {
  /** 表示名。name がなければ uses、それもなければ run の先頭行 */
  label: string;
  uses?: string;
  run?: string;
}

export interface JobModel {
  id: string;
  /** name がなければ id */
  label: string;
  needs: string[];
  /** 実行環境。再利用ワークフロー呼び出しのジョブでは空文字 */
  runsOn: string;
  condition?: string;
  environment?: string;
  timeoutMinutes?: number;
  /** strategy.matrix のうち静的に列挙された軸 */
  matrix?: Record<string, number>;
  /** 再利用ワークフロー呼び出し(jobs.<id>.uses) */
  uses?: string;
  steps: StepModel[];
}

export interface WorkflowModel {
  /** name がなければファイル名 */
  label: string;
  fileName: string;
  /** on のイベント名一覧 */
  triggers: string[];
  /** on.workflow_run.workflows で指定された、先行ワークフロー名 */
  workflowRunOf: string[];
  jobs: JobModel[];
}

export interface WorkflowFile {
  name: string;
  source: string;
}
