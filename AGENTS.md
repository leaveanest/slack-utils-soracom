# AGENTS.md

このファイルは、`slack-utils-soracom`
リポジトリで作業するコーディングエージェント向けの実務ガイドです。実装前に全体像を確認し、既存パターンに合わせて最小差分で変更してください。

## 目的

- このリポジトリは、SORACOM を利用した現場運用を Slack 上で支援する custom step
  / Function 集です。
- 技術スタックは TypeScript + Deno + Slack Deno SDK v2.x です。
- 単純な API ラッパーを増やすより、Slack 上の運用行為
  「確認する」「報告する」「振り返る」 に寄せた Function / Workflow
  を優先します。
- リアルタイム通知は主戦場ではありません。定時確認、要約、共有に向く機能を優先してください。

## 主要ディレクトリ

- `functions/`: Slack custom step の実装。各機能は `functions/<name>/mod.ts` と
  `functions/<name>/test.ts` を基本にします。
- `workflows/`: Function を組み合わせた推奨フローやサンプル。
- `triggers/`: 任意のサンプル。主役ではありません。
- `lib/soracom/`: SORACOM API クライアント、Datastore、型、共通ユーティリティ。
- `lib/i18n/`: 多言語対応。
- `lib/validation/`: バリデーション共通処理。
- `datastores/`: Slack Datastore 定義。
- `locales/`: 翻訳ファイル。`en.json` が基準、`ja.json` が追従します。
- `manifest.ts`: Function / Workflow / Datastore
  の登録点。追加・削除時は更新漏れに注意してください。

## 変更時の基本方針

- 既存の命名規則とディレクトリ構成を維持してください。
- 変更は局所的に行い、無関係なリファクタは避けてください。
- Deno の `strict` 設定を前提に、暗黙の `any` は入れないでください。
- import は既存パターンに合わせ、`import_map.json` を優先してください。
- ユーザー向けメッセージやエラーメッセージをハードコードしないでください。`t()`
  を使って i18n 化してください。
- 例外は `Error` オブジェクトで投げてください。文字列の直接 `throw` は禁止です。
- 外部 API レスポンスは成功前提で扱わず、`ok`
  や必須データの有無を明示的に確認してください。

## Function / Workflow の作り方

- 新しい Slack Function を追加する場合は、`functions/<function_name>/mod.ts` と
  `functions/<function_name>/test.ts` をセットで作成してください。
- Function 定義は `DefineFunction(...)`、実装は `SlackFunction(...)`
  の既存パターンに合わせてください。
- ワークフローを追加した場合は、必要な Function 定義とあわせて `manifest.ts`
  に登録してください。
- Trigger
  は補助的なサンプルです。新規追加は、本当にこのリポジトリに置く価値がある場合に限ってください。
- SORACOM 設定値や通知先などの永続設定が必要なら、既存の Datastore /
  `lib/soracom/datastore.ts` の流れに寄せてください。

## テスト

- 変更した実装には対応するテストを追加または更新してください。
- テストは各 Function 配下の `test.ts` に置く既存構成を優先してください。
- 正常系と異常系の両方をカバーしてください。
- Slack API や外部通信はモック化し、テストを不安定にしないでください。
- テスト名は内容がわかる日本語を優先してください。

よく使うコマンド:

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task i18n:check
deno task i18n:test
```

単体で確認したい場合:

```bash
deno test --allow-env --allow-read --allow-net functions/<name>/test.ts
```

## i18n

- 翻訳キー追加時は `locales/en.json` を先に更新し、対応する `locales/ja.json`
  も同時に更新してください。
- プレースホルダー名は言語間で一致させてください。
- 文字列追加後は `deno task i18n:check` を実行してください。
- 言語切り替えや翻訳処理は `lib/i18n/mod.ts` の既存 API に従ってください。

## 例外処理

- API 呼び出し結果は `response.ok` を確認してから使ってください。
- 必須フィールドが存在しない場合は、その場で明示的にエラーにしてください。
- エラーを握りつぶさず、ログと利用者向けエラー返却を分けて扱ってください。
- Slack Function の catch 節では、既存実装と同様に `Error`
  由来のメッセージへ正規化して返す方針を優先してください。

## 開発・実行メモ

- ローカル実行の既定タスクは `deno task dev` です。
- Slack CLI を使った実行例:

```bash
slack run workflows/soracom_sim_anomaly_alert_workflow
```

- `slack.json` の `local` 環境は `.env` を読む前提です。
- `manifest.ts` では `SLACK_APP_NAME` と `SLACK_APP_DESCRIPTION`
  を環境変数から読んでいます。名称や説明に関わる変更時はこの挙動を壊さないでください。
- SORACOM 向け外向き通信先は `manifest.ts` の `outgoingDomains`
  に定義されています。新しい外部通信先が必要なら、理由を明確にしたうえで更新してください。

## 変更前後のチェックリスト

- 変更対象に対応するテストを更新したか
- `manifest.ts` の登録漏れがないか
- i18n キー追加時に `en.json` と `ja.json` の両方を更新したか
- ユーザー向け文言を直接書いていないか
- `deno task fmt` / `lint` / `check` / `test` を必要に応じて実行したか

## 参考ドキュメント

- `README.md`
- `docs/testing-guide.md`
- `docs/i18n-guide.md`
- `docs/exception-handling-guide.md`
- `CLAUDE.md`

## Repo Local Skills

- `.agents/skills/soracom-feature-development`
  - `functions/` `workflows/` `triggers/` `datastores/` `lib/soracom/`
    `manifest.ts` を触る実装作業向け
- `.agents/skills/soracom-quality-checks`
  - テスト、i18n、例外処理、`manifest.ts` 登録漏れ、CI 前の確認向け
