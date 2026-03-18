import type { WorkflowFile } from './types';

// 初回表示と「サンプルを読み込む」で使う題材。
// needs の合流・matrix・workflow_run 連鎖・失敗時通知と、見せたい要素を一通り含む。

const CI = `name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx tsc --noEmit

  test:
    runs-on: \${{ matrix.os }}
    needs: lint
    strategy:
      matrix:
        node: [20, 22]
        os: [ubuntu-latest, macos-14]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
      - run: npm ci
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist

  package:
    runs-on: ubuntu-latest
    needs: [test, build]
    timeout-minutes: 15
    steps:
      - uses: actions/download-artifact@v4
      - run: npm pack

  notify-failure:
    runs-on: ubuntu-latest
    needs: [package]
    if: failure()
    steps:
      - run: echo "CI failed"
`;

const DEPLOY = `name: Deploy
on:
  workflow_run:
    workflows: [CI]
    types: [completed]

jobs:
  staging:
    runs-on: ubuntu-latest
    environment: staging
    if: \${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh staging

  smoke-test:
    runs-on: ubuntu-latest
    needs: staging
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/smoke.sh https://staging.example.com

  production:
    runs-on: ubuntu-latest
    needs: smoke-test
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/deploy.sh production

  release-notes:
    runs-on: ubuntu-latest
    needs: production
    steps:
      - uses: actions/checkout@v4
      - run: npx changelogithub
`;

export const SAMPLE_FILES: WorkflowFile[] = [
  { name: 'ci.yml', source: CI },
  { name: 'deploy.yml', source: DEPLOY },
];
