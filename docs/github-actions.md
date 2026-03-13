# GitHub Actions ワークフロー一覧

プロジェクト内の GitHub Actions
ワークフローを以下に整理しました。トリガーと主目的をまず表形式でまとめ、続いて詳細を記載しています。

| ファイル                                 | ワークフロー名           | 主なトリガー                                                   | 主な役割                                                            |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `.github/workflows/ci.yml`               | CI                       | `push`(main), `pull_request`(main)                             | Deno プロジェクトのフォーマット、Lint、型チェック、テストを実行     |
| `.github/workflows/deno-ci.yml`          | Deno CI                  | `push`(main), `pull_request`                                   | 複数 OS での Deno テスト、カバレッジ収集と Codecov 連携             |
| `.github/workflows/release.yml`          | Release                  | `push`(main)                                                   | release-please によるリリース生成、npm/JSR 公開、リリースノート更新 |
| `.github/workflows/security.yml`         | Security Scan            | `push`(main), `pull_request`, `schedule`(毎週月曜)             | TruffleHog と Trivy による秘密情報・脆弱性スキャン                  |
| `.github/workflows/slack-notify.yml`     | Slack Notifications      | `issues`, `pull_request`, `release`, `workflow_run`            | Issue/PR/Release/CI 完了時に Slack へ通知                           |
| `.github/workflows/pr-size.yml`          | PR Size Check            | `pull_request`                                                 | 変更行数に応じた PR ラベル付与                                      |
| `.github/workflows/issue-automation.yml` | Issue Automation         | `issues`(labeled)                                              | ラベル付与時にコメント・ラベル整備（※将来実装予定）                 |
| `.github/workflows/welcome.yml`          | Welcome New Contributors | `issues`(opened), `pull_request_target`(opened)                | 初回投稿者への歓迎メッセージ送信                                    |
| `.github/workflows/issue-to-pr.yml`      | Issue to PR with Claude  | `issues`(labeled/assigned), `issue_comment`                    | `claude-ready`ラベル or `@claude`メンションでIssueを自動実装        |
| `.github/workflows/claude-pr-review.yml` | Claude PR Review         | `pull_request`, `pull_request_review_comment`, `issue_comment` | PR自動レビュー、`@claude`メンションで質問・修正依頼に対応           |
| `.github/workflows/i18n-check.yml`       | I18n Check               | `pull_request`                                                 | locales/配下の翻訳キー整合性チェック                                |

## 各ワークフローの詳細

### CI (`.github/workflows/ci.yml`)

- Deno v2
  系をセットアップし、`deno fmt --check`、`deno task lint`、`deno task check`、`deno task test`
  を順に実行します。
- シンプルな単一ジョブ構成で、メインブランチ向けの基本的な品質ゲートとして機能します。

### Deno CI (`.github/workflows/deno-ci.yml`)

- マトリクス戦略で `ubuntu-latest`、`macos-latest`、`windows-latest`
  をカバーし、クロスプラットフォームでの動作確認を行います。
- 依存キャッシュ、カバレッジ生成、Codecov へのアップロードまで含む包括的な CI
  パイプラインです。

### Release (`.github/workflows/release.yml`)

- `google-github-actions/release-please-action`
  を用いてタグ生成とリリースノート作成を自動化します。
- 条件付きで Node.js / Deno をセットアップし、npm・JSR 公開、Semantic Release
  ベースの多言語リリースノート生成、リリースアセットの ZIP
  化とアップロードまでを行います。

### Security Scan (`.github/workflows/security.yml`)

- TruffleHog による秘密情報検出と Trivy
  によるファイルシステムスキャンを実施し、検出結果を SARIF
  としてアップロードします。
- 定期実行 (毎週月曜) と PR トリガーにより継続的なセキュリティ監視を実現します。

### Slack Notifications (`.github/workflows/slack-notify.yml`)

- Issue/PR/Release/ワークフロー完了イベントを検知し、Slack Webhook
  が設定されている場合のみ通知を送信します。
- イベント種別や状態に応じた日本語メッセージを組み立て、`8398a7/action-slack`
  を使って送信します。

### PR Size Check (`.github/workflows/pr-size.yml`)

- `codelytv/pr-size-labeler` により PR の差分行数に応じたサイズラベル (XS〜XL)
  を自動付与します。
- 1000 行超の PR に対しては対応の分割などを促すメッセージを投稿します。

### Issue Automation (`.github/workflows/issue-automation.yml`)

**※ 注意:
この機能は将来的な実装予定です。現時点ではワークフローの準備のみ完了しています。**

- Issue に `ready-for-development` ラベルが付いたタイミングで `backlog`
  ラベルを付与し、開始準備完了を通知するコメントを残す計画です。
- `actions/github-script` を用いて GitHub API を直接操作する予定です。
- 実際の運用フローが確立した段階で有効化します。

### Welcome New Contributors (`.github/workflows/welcome.yml`)

- 初めて Issue や PR
  を投稿したコントリビューターに向け、日英併記の歓迎メッセージを送信します。
- `actions/first-interaction` を利用し、`CONTRIBUTING.md` への導線も提供します。

### Issue to PR with Claude (`.github/workflows/issue-to-pr.yml`)

[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)
を使用して、Issue から自動的にPRを生成します。

**トリガー条件:**

- Issue に `claude-ready` ラベルが付与された場合
- Issue コメントで `@claude` とメンションした場合

**機能:**

- Issue の内容を読み取り、実装コードを自動生成
- `claude/` プレフィックスのブランチを自動作成
- `CLAUDE.md` のルールに従ってコードを実装
- `deno task fmt`, `deno task lint`, `deno task test` を実行して品質を確認
- 全てのチェックがパスした後にPRを作成
- コミットメッセージ・PRは日本語で記述

**設定:**

- `ANTHROPIC_API_KEY` シークレットが必要
- `contents: write`, `pull-requests: write`, `issues: write` 権限が必要

### Claude PR Review (`.github/workflows/claude-pr-review.yml`)

PR に対する自動レビューと、`@claude` メンションへの応答を行います。

**トリガー条件:**

- PR が作成または更新された場合（自動レビュー）
- PR コメントで `@claude` とメンションした場合
- レビューコメントで `@claude` とメンションした場合

**機能:**

- `CLAUDE.md` のルールに基づいた自動コードレビュー
- チェック項目（JSDoc、テスト、i18n、バリデーション、例外処理、型安全性）の確認
- セキュリティ・パフォーマンスの追加チェック
- 問題が見つかった場合は修正・コミット・プッシュまで実行
- `@claude` メンションで質問や追加の修正依頼に対応

**レビュー観点:**

| 項目           | 内容                                               |
| -------------- | -------------------------------------------------- |
| JSDoc          | 新しい公開関数にJSDocコメントがあるか              |
| テスト         | 新しい関数にテストファイルがあるか                 |
| i18n           | エラーメッセージが `t()` 関数でi18n化されているか  |
| バリデーション | 入力値が Zod でバリデーションされているか          |
| 例外処理       | API呼び出しで `response.ok` がチェックされているか |
| 型安全性       | TypeScriptの型が適切に定義されているか             |

**設定:**

- `ANTHROPIC_API_KEY` シークレットが必要
- `contents: write` 権限が必要（修正・コミット用）

### I18n Check (`.github/workflows/i18n-check.yml`)

PR で `locales/`
配下のファイルが変更された場合、翻訳キーの整合性をチェックします。

- `en.json` と `ja.json` のキー構造が一致しているか確認
- 不足しているキーや余分なキーを検出
- `deno task i18n:check` を実行
