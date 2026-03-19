# actviz

[![CI](https://github.com/miruky/actviz/actions/workflows/ci.yml/badge.svg)](https://github.com/miruky/actviz/actions/workflows/ci.yml)
[![Deploy](https://github.com/miruky/actviz/actions/workflows/deploy.yml/badge.svg)](https://github.com/miruky/actviz/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**GitHub Actionsのワークフローを貼り付けると、ジョブの依存関係(needs)をSVGグラフとして描くブラウザツール。**

[https://miruky.github.io/actviz/](https://miruky.github.io/actviz/) で動いている。

![CIワークフローの依存グラフの例。クリティカルパスが強調されている](docs/sample-graph.svg)

## 概要

actviz は `.github/workflows` のYAMLを読み込み、ジョブを `needs` の依存で結んだDAGとして左から右へ並べて描く。複数ファイルを同時に扱え、`workflow_run` で連鎖するワークフロー同士の関係もカード上に表示する。ジョブをクリックすると runs-on・if・environment・matrix・ステップ一覧が見られ、ホバーすると上流・下流のジョブだけが浮かび上がる。解析はすべてブラウザ内で完結し、YAMLが外部に送られることはない。

### なぜ作ったのか

GitHubのActionsタブでも実行後のグラフは見られるが、それは「実行してから」の話で、ワークフローを書いている最中に依存の形を確かめる手段がない。レビューで「このジョブはどれを待つのか」を口頭で追うのも辛い。書きかけのYAMLを貼るだけで形が見え、循環や存在しないジョブへの参照をその場で指摘してくれる道具が欲しかった。クリティカルパス表示は「どの直列を縮めればパイプラインが速くなるか」の当たりを付けるためにある。

## アーキテクチャ

![actviz の処理の流れ](docs/architecture.svg)

パーサがYAMLから可視化に必要な情報(jobs・needs・matrix・トリガー)だけを抜き出し、グラフ解析が循環・到達可能性・最長経路を計算する。レイアウトは needs の最長距離をレイヤーとし、前段の重心で並び順を整える古典的なレイヤード手法。描画はSVG文字列の純粋関数で、UIを介さずテストでき、そのまま「SVGを書き出す」のファイル出力にもなる。

## 技術スタック

| カテゴリ             | 技術                          |
| :------------------- | :---------------------------- |
| 言語                 | TypeScript(strict)            |
| ビルド               | Vite                          |
| YAML解析             | yaml(実行時依存はこの1つ)     |
| テスト               | Vitest + jsdom                |
| リンタ・フォーマッタ | ESLint + Prettier             |
| CI / 配信            | GitHub Actions / GitHub Pages |

## 使い方

1. 左のエディタにワークフローYAMLを貼り付ける(またはヘッダの「開く」で `.yml` を選ぶ)。
2. 右に依存グラフが即座に描かれる。「追加」で複数ワークフローを並べられる。
3. ジョブのノードをクリックすると詳細パネルが開く。ホバーで依存の流れを強調表示。
4. カード見出しには規模の指標(ジョブ数・直列の段数・同じ段に並ぶ最大ジョブ数=並列度)が出る。段数が多ければ直列が長く、並列度が低ければ詰まりやすい、という当たりが付く。
5. 「クリティカルパスを強調」を入れると、最長の直列ジョブ列に色が付く。
6. 「SVGを書き出す」でグラフを単体のSVGファイルとして保存できる。ライト・ダーク両テーマに追従するスタイルが埋め込まれる。

### 検出できる問題

- `needs` が存在しないジョブを指している参照切れ
- 依存の循環(GitHub側ではエラーになる構成)
- これらはグラフ上部に赤字で列挙され、描けるところまでは描く

### 制約

- ジョブ間の `needs` 依存を対象とする。step単位の依存や、`${{ }}` 式の評価はしない。
- matrix の並列数は静的に列挙された軸だけを数える。式で渡される軸は数えない。
- `workflow_run` の連鎖はワークフローの `name` の一致で判定する。別リポジトリのワークフローは辿れない。

## プロジェクト構成

- `src/parse.ts` — YAMLからジョブ・依存・トリガーを抽出
- `src/graph.ts` — 循環検出・祖先子孫・クリティカルパス・workflow_run連鎖
- `src/layout.ts` — レイヤードDAG配置
- `src/render.ts` — グラフのSVG文字列生成(書き出し兼用)
- `src/details.ts` — ジョブ詳細パネル
- `src/store.ts` — localStorageへの保存と復元
- `src/main.ts` — UI制御とイベント配線
- `src/samples.ts` — 初期表示用のサンプルワークフロー
- `docs/` — アーキテクチャ図とサンプル出力

## はじめ方

### 前提条件

Node.js 22 以上。

### セットアップ

```bash
git clone https://github.com/miruky/actviz.git
cd actviz
npm ci
npm run dev
```

### テストの実行

```bash
npm test
```

### Lintの実行

```bash
npm run lint
```

### デプロイ

main への push で `deploy.yml` が GitHub Pages に配信する。Pages のサブパス配信に合わせて、ビルド時に環境変数 `ACTVIZ_BASE` で Vite の `base` を切り替えている。

## 設計方針

- **解析・配置・描画の分離** — parse / graph / layout / render はDOMに触れない純粋関数で、50件のテストの大半がここに向いている。UI層(main.ts)は配線だけを受け持つ。
- **ブラウザ内で完結** — ワークフローには内部の事情が写り込みがちなので、入力はネットワークに出さない。保存先もlocalStorageだけで、使えない環境ではメモリ保持に自動で切り替わる。
- **書き出しと画面表示の一体化** — 画面に出ているSVGがそのまま書き出される。書き出したファイルにもライト・ダーク追従のスタイルと aria 属性が含まれ、READMEやドキュメントに直接貼れる。
- **壊れた入力にも形を返す** — 参照切れや循環はエラーで止めずに警告として列挙し、レイアウトできる範囲で描く。書きかけのYAMLを相手にする道具だから。

## ライセンス

[MIT](LICENSE)
