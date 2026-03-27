# slack-utils-iot

IoT デバイス運用を Slack 上で支援する custom step / Function
集です。主に「SORACOM」サービスを利用する現場運用を想定しています。

## 商標について

本リポジトリは「SORACOM」関連サービスを利用するための参考実装であり、株式会社ソラコムまたはその関連会社による提携、支援、後援を示すものではありません。

「SORACOM」「ソラコム」「ソラカメ」および関連する商品・サービス名称は、株式会社ソラコムまたはその関連会社の商標または登録商標です。

## 概要

- SIM 状態監視、通信量レポート、Harvest Data 活用、クラウドカメラ連携を Slack
  に統合します。
- 単純な API
  実行だけでなく、定時確認、状況共有、現場確認、定期レポートといった運用ユースケースを中心に設計します。
- 再利用可能な custom step / Function を中心に、必要に応じて Workflow
  を組み合わせられます。
- Slack Deno SDK v2.x を利用し、Function と Workflow を一貫して管理します。

## 設計方針

このリポジトリでは、Slack
上で実際に使われる運用シナリオを中心に機能を整理します。

- `Function`: custom step として再利用する中心的な部品
- `Workflow`: Function を組み合わせたサンプルや推奨フロー
- `lib/`: 「SORACOM」API クライアントや共通ロジック

単純な API ラッパーは基盤部品として扱い、Slack から見える機能は
「確認する」「報告する」「振り返る」といった運用行為に寄せていきます。
また、リアルタイム性が必要な通知処理は「SORACOM」
起点の別システムに分離し、このリポジトリでは定時実行での確認、要約、現場共有に向いた
Function / Workflow を優先します。「SORACOM」サービス側が直接提供する Slack
通知機能ですでに代替できるものは、原則としてそのまま再実装しません。ここでの比較対象に
「SORACOM Flux」は含めません。 Trigger
はこのリポジトリの主役ではなく、必要に応じて利用者が作成するものとして扱います。

## 前提条件

- **Deno 1.37+** がインストールされていること
- **Slack CLI** が利用可能で、ワークスペースにログイン済みであること
- **Slack App** を作成できる権限を持っていること
- **Git** がインストールされていること（Git Hooks使用時）

詳細は [開発環境のセットアップ](#開発環境のセットアップ) を参照してください。

## セットアップ

```bash
# リポジトリを取得
git clone https://github.com/leaveanest/slack-utils-iot.git
cd slack-utils-iot

# 環境変数の設定
cp .env.example .env
# .env ファイルを編集して、アプリ名と「SORACOM」認証情報を設定

# 初期化
slack login

# Git hooks をセットアップ（推奨）
# macOS/Linux: bash scripts/setup-git-hooks.sh
# Windows: Git Bash または WSL で実行
```

### 環境変数の設定

`.env` ファイルで以下の変数をカスタマイズできます：

```bash
# Slack App Configuration
SLACK_APP_NAME="Slack Utils IoT"          # アプリ名
SLACK_APP_DESCRIPTION="IoT utilities for Slack"  # アプリの説明

# "SORACOM" API Authentication (required)
SORACOM_AUTH_KEY_ID=your-auth-key-id
SORACOM_AUTH_KEY=your-auth-key
SORACOM_COVERAGE_TYPE=jp                    # jp または g
```

`SORACOM_AUTH_KEY_ID` と `SORACOM_AUTH_KEY` は「SORACOM」API を使う Function
の実行に必須です。通知先チャンネルは各 Workflow / Trigger 側で `channel_id`
を明示的に指定してください。

### slack.json 設定

`slack.json` には以下の設定が含まれています：

#### 環境変数の管理

```json
"environments": {
  "local": {
    "env_file": ".env"
  }
}
```

- **`environments.local`**: `slack run`実行時に`.env`ファイルを自動読み込み
- 環境変数（API キーなど）を`.env`で管理できます

#### 本番デプロイ設定（オプション）

本番環境へデプロイする場合は、`deployments`セクションを追加してください：

```json
"deployments": {
  "production": {
    "workspace": "your-workspace-name",
    "token_alias": "production"
  }
}
```

その後、`slack deploy --env production`でデプロイできます。

#### 補足

- **`.slack/`フォルダー**: Slack CLI が自動生成・管理（手動編集不要）
- **`import_map.json`**: 依存関係の解決に使用
- **Git hooks**: セットアップすると commit/push 前に自動チェック実行

## 使い方

```bash
# フォーマット・Lint・テスト
deno task fmt
deno task lint
deno task check
deno task test

# カバレッジ付きテスト
deno test --allow-all --coverage=cov
deno coverage cov --html

# ローカル実行
slack run workflows/soracom_sim_anomaly_alert_workflow
```

- `functions/` には、「SORACOM」API や Slack 投稿を扱う再利用可能な custom step
  を配置します。
- `workflows/`
  には、運用シナリオに沿って複数の部品を組み合わせたサンプルや推奨フローを定義します。
- `triggers/` は任意です。必要な場合だけ、利用者ごとに link trigger
  や定期実行を設定します。

## Function / Workflow 一覧

このリポジトリで提供している Function と Workflow
を、運用ユースケースの観点で整理しています。最新の定義は `manifest.ts`
を参照してください。

### Functions

Functions は custom step として再利用する中心的な提供物です。

| Function                                                                                             | 役割                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`functions/soracom_get_harvest_data/mod.ts`](functions/soracom_get_harvest_data/mod.ts)             | Harvest Data 取得と表示                   |
| [`functions/soracom_list_soracam_devices/mod.ts`](functions/soracom_list_soracam_devices/mod.ts)     | ソラカメ デバイス一覧取得                 |
| [`functions/soracom_export_soracam_image/mod.ts`](functions/soracom_export_soracam_image/mod.ts)     | ソラカメ 画像スナップショット             |
| [`functions/soracom_sim_anomaly_alert/mod.ts`](functions/soracom_sim_anomaly_alert/mod.ts)           | 異常ステータスの判定と共有内容の生成      |
| [`functions/soracom_soracam_motion_capture/mod.ts`](functions/soracom_soracam_motion_capture/mod.ts) | 直近イベントの抽出と画像スナップショット  |
| [`functions/soracom_sim_usage_report/mod.ts`](functions/soracom_sim_usage_report/mod.ts)             | SIM 通信量集計とレポート生成              |
| [`functions/co2_daily_air_quality_report/mod.ts`](functions/co2_daily_air_quality_report/mod.ts)     | 空気品質サマリーとピーク時間帯の生成      |
| [`functions/co2_air_quality_anomaly_alert/mod.ts`](functions/co2_air_quality_anomaly_alert/mod.ts)   | 空気品質異常の判定と通知内容の生成        |
| [`functions/gps_multiunit_report/mod.ts`](functions/gps_multiunit_report/mod.ts)                     | GPS マルチユニットの温湿度 / 位置レポート |
| [`functions/gps_multiunit_geofence_report/mod.ts`](functions/gps_multiunit_geofence_report/mod.ts)   | GPS マルチユニットのジオフェンス確認      |

### Workflows

Workflows は Function
を組み合わせる際のサンプルや推奨フローです。利用時はこれらをそのまま使うだけでなく、Workflow
Builder や利用者独自の Workflow から Function を custom step
として組み込むことを想定しています。

#### 定時確認・共有

| Workflow                                                                                                       | 用途                                               |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`workflows/soracom_sim_anomaly_alert_workflow.ts`](workflows/soracom_sim_anomaly_alert_workflow.ts)           | 異常ステータスの SIM を定時確認して共有            |
| [`workflows/soracom_soracam_motion_capture_workflow.ts`](workflows/soracom_soracam_motion_capture_workflow.ts) | 直近の動体検知イベントを定時確認し、画像付きで共有 |
| [`workflows/co2_air_quality_anomaly_alert_workflow.ts`](workflows/co2_air_quality_anomaly_alert_workflow.ts)   | 空気品質のしきい値逸脱を定時確認して共有           |
| [`workflows/gps_multiunit_geofence_report_workflow.ts`](workflows/gps_multiunit_geofence_report_workflow.ts)   | GPS マルチユニットの範囲逸脱を定時確認して共有     |

#### 定期レポート・可視化

| Workflow                                                                                                   | 用途                                            |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`workflows/soracom_sim_usage_report_workflow.ts`](workflows/soracom_sim_usage_report_workflow.ts)         | SIM の通信量サマリーを生成                      |
| [`workflows/soracom_get_harvest_data_workflow.ts`](workflows/soracom_get_harvest_data_workflow.ts)         | Harvest Data を確認                             |
| [`workflows/soracom_list_soracam_devices_workflow.ts`](workflows/soracom_list_soracam_devices_workflow.ts) | ソラカメ デバイス一覧を確認                     |
| [`workflows/co2_daily_air_quality_report_workflow.ts`](workflows/co2_daily_air_quality_report_workflow.ts) | 空気品質レポートを生成                          |
| [`workflows/gps_multiunit_report_workflow.ts`](workflows/gps_multiunit_report_workflow.ts)                 | GPS マルチユニットの温湿度 / 位置レポートを生成 |

#### 現場確認・オペレーション

| Workflow                                                                                                   | 用途                                                |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [`workflows/soracom_export_soracam_image_workflow.ts`](workflows/soracom_export_soracam_image_workflow.ts) | ソラカメ 録画から画像スナップショットを取得して確認 |

### Triggers

このリポジトリでは、Trigger は補助的なサンプルとして扱います。

- 現時点で同梱している sample trigger はありません。
- `triggers/` 配下のファイルは、動作確認や利用例のための例です。
- 収録する sample は、基本的に手動実行しやすい link trigger
  (`TriggerTypes.Shortcut`) に寄せます。
- 定期実行の有無、実行時刻、通知先、対象デバイスは利用者ごとに異なるため、常設の
  scheduled trigger 提供は前提にしません。
- 必要な定期実行は、利用者側の運用に合わせて作成してください。

## 想定ユースケース

今後は、「SORACOM」API の単純なラッパーを増やすよりも、Slack
上での定時確認、要約、現場共有を支援する Function を強化していく方針です。

リアルタイム通知は「SORACOM」
起点の別システムに分離し、このリポジトリでは定時実行で価値が出る Function /
Workflow を優先します。「SORACOM」サービス側が直接提供する Slack
通知機能と競合する単純通知は避けます。「SORACOM Flux」は比較対象に含めません。

### ソラカメ を活用するユースケース

- `soracam_latest_event_snapshot_workflow`
  - 定時実行時点で直近イベントの画像を切り出して確認
- `soracam_daily_activity_report_workflow`
  - カメラごとのイベント件数を日次で集計
- `soracam_opening_check_workflow`
  - 始業前に現場状況を画像で確認
- `soracam_closing_check_workflow`
  - 終業後に現場状況を画像で確認

### LTE-M CO2 センサーを活用するユースケース

一部の Workflow
は、[LTE-M CO2センサー RS-LTECO2 スターターキット](https://soracom.jp/store/12112/)
の利用を想定しています。このデバイスは CO2 濃度、温度、湿度を LTE-M
で定期送信でき、通知間隔の初期値は 5 分で、SIM タグ `interval`
による変更にも対応しています。

- `co2_daily_air_quality_report_workflow`
  - CO2 / 温度 / 湿度の推移を指定期間で要約し、CO2 ピーク時間帯も示す
- `co2_air_quality_anomaly_alert_workflow`
  - CO2 / 温度 / 湿度のしきい値逸脱を指定期間で検知して共有

### GPS マルチユニットを活用するユースケース

一部の Workflow は、 [GPS マルチユニット](https://soracom.jp/store/5235/)
の利用を想定しています。このデバイスは Harvest Data に `lat`, `lon`, `temp`,
`humi`, `type` などを記録できます。

- `gps_multiunit_report_workflow`
  - 指定した SIM グループ配下の active SIM について、直近 `1h` または `1d`
    の最新位置または時間帯別平均を共有する
- `gps_multiunit_geofence_report_workflow`
  - 指定した中心緯度経度と半径に対して、最新位置が範囲内かどうかを確認する

## テスト

### テストの実行

```bash
# 全テストを実行
deno task test

# カバレッジを測定
deno test --allow-all --coverage=cov
deno coverage cov --html  # HTML形式で確認
```

### 新規関数作成時の要件

新しい関数を作成する際は、以下を必ず実施してください：

1. **JSDocコメント**: 関数の説明、パラメータ、戻り値、エラーを記載
2. **テストファイル**: 正常系と異常系のテストを作成
3. **テストカバレッジ**: 主要な処理パスをカバー

詳細は [`docs/testing-guide.md`](docs/testing-guide.md) を参照してください。

### テストの例

```typescript
/**
 * Slackチャンネルの情報を取得します
 *
 * @param client - Slack APIクライアント
 * @param channelId - 取得対象のチャンネルID
 * @returns チャンネルの概要情報
 * @throws {Error} チャンネル情報の取得に失敗した場合
 */
export async function retrieveChannelSummary(
  client: SlackAPIClient,
  channelId: string,
): Promise<ChannelSummary> {
  // 実装
}
```

参考実装: [`functions/soracom_get_air_usage/`](functions/soracom_get_air_usage/)

## 多言語対応（I18n）

このプロジェクトは、英語と日本語の多言語対応をサポートしています。

### サポート言語

- **English (en)** - ベース言語
- **日本語 (ja)**

### 言語の切り替え

環境変数で言語を指定できます：

```bash
# 英語で実行
export LOCALE=en
deno run your_script.ts

# 日本語で実行（デフォルト）
export LOCALE=ja
deno run your_script.ts
```

### コード内での使用

```typescript
import { t } from "../../lib/i18n/mod.ts";

// シンプルなメッセージ
const message = t("errors.unknown_error");

// プレースホルダー付きメッセージ
const error = t("errors.channel_not_found", { error: "not_found" });
```

詳細は [`docs/i18n-guide.md`](docs/i18n-guide.md) を参照してください。

## 例外処理

このプロジェクトでは、統一的な例外処理パターンを採用しています。

### 基本ルール

1. **API通信**: 必ず`response.ok`をチェック
2. **バリデーション**: 入力値の型チェック・空文字チェック必須
3. **エラーメッセージ**: 必ず`t()`関数で多言語化
4. **Slack関数**: try-catchで全体をラップ

### コード例

```typescript
import { t } from "../../lib/i18n/mod.ts";

// API通信の例外処理
const response = await client.conversations.info({ channel: channelId });
if (!response.ok) {
  throw new Error(t("errors.api_call_failed", { error: response.error }));
}

// バリデーション
if (typeof input !== "string") {
  throw new Error(t("errors.invalid_type", {
    expected: "string",
    actual: typeof input,
  }));
}

// Slack関数
export default SlackFunction(MyFunction, async ({ inputs, client }) => {
  try {
    // 処理
    return { outputs: { result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Function error:", message);
    return { error: message };
  }
});
```

詳細は [`docs/exception-handling-guide.md`](docs/exception-handling-guide.md)
を参照してください。

## バリデーション（Zod）

このプロジェクトでは、型安全なバリデーションのために**Zod**を使用しています。

### 利用可能なスキーマ

`lib/validation/schemas.ts` に以下の共通スキーマが定義されています：

- **`channelIdSchema`**: Slackチャンネル ID（`C12345678` 形式）
- **`userIdSchema`**: Slackユーザー ID（`U0812GLUZD2` または `W1234567890`
  形式）
- **`nonEmptyStringSchema`**: 空でない文字列

### 使用例

```typescript
import { channelIdSchema } from "../../lib/validation/schemas.ts";

// パース（エラー時は例外をthrow）
const channelId = channelIdSchema.parse(inputs.channel_id);

// 安全なパース（エラー時は結果オブジェクトを返す）
const result = channelIdSchema.safeParse(inputs.channel_id);
if (!result.success) {
  console.error(result.error);
}
```

### エラーメッセージの多言語化

Zodのバリデーションエラーメッセージは**動的に多言語化**されます。
`.superRefine()`を使用しているため、バリデーション実行時に現在のロケールに応じたエラーメッセージが表示されます：

```typescript
import { channelIdSchema } from "../../lib/validation/schemas.ts";
import { setLocale } from "../../lib/i18n/mod.ts";

// 英語でバリデーション実行
setLocale("en");
const result1 = channelIdSchema.safeParse("invalid");
// エラー: "Channel ID must start with 'C' followed by uppercase alphanumeric characters"

// 同じスキーマインスタンスで日本語に切り替え
setLocale("ja");
const result2 = channelIdSchema.safeParse("invalid");
// エラー: "チャンネルIDは'C'で始まり、その後に大文字の英数字が続く必要があります"

// 英語に戻す
setLocale("en");
const result3 = channelIdSchema.safeParse("invalid");
// エラー: "Channel ID must start with 'C' followed by uppercase alphanumeric characters"
```

**ポイント：**

- デフォルトスキーマ（`channelIdSchema`等）もロケール変更に**動的に対応**します
- スキーマを再作成する必要はありません
- このリポジトリの既定ロケールは日本語です
- 英語で実行したい場合は `LOCALE=en` を明示してください
- `LANG` は日本語環境の自動検出に利用されます

詳細は [`CONTRIBUTING.md`](CONTRIBUTING.md)
の「バリデーション（Zod）」セクションを参照してください。

## 開発環境のセットアップ

### Deno のインストール

#### Deno: macOS / Linux

```bash
# インストールスクリプトを使用
curl -fsSL https://deno.land/install.sh | sh

# Homebrewを使用（macOS）
brew install deno
```

#### Deno: Windows

```powershell
# PowerShellでインストール
irm https://deno.land/install.ps1 | iex

# Chocolateyを使用
choco install deno

# Scoopを使用
scoop install deno
```

#### Deno: 動作確認

```bash
deno --version
```

### Slack CLI のインストール

#### Slack CLI: macOS / Linux

```bash
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
slack login
```

#### Slack CLI: Windows

#### Slack CLI: 方法1 - インストーラーを使用

1. [Slack CLI リリースページ](https://api.slack.com/automation/cli/install)
   から最新のインストーラーをダウンロード
2. ダウンロードした `.msi` ファイルを実行
3. PowerShellまたはコマンドプロンプトで `slack login` を実行

#### Slack CLI: 方法2 - WSL を使用

```bash
# WSL内で実行
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
slack login
```

#### Slack CLI: 動作確認

```bash
slack version
slack login
```

### Git のインストール

#### macOS

```bash
# Xcodeコマンドラインツールと一緒にインストール
xcode-select --install

# Homebrewを使用
brew install git
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install git

# CentOS/RHEL
sudo yum install git

# Fedora
sudo dnf install git
```

#### Git: Windows

1. [Git for Windows](https://git-scm.com/download/win)
   から公式インストーラーをダウンロード
2. インストール時に「Git Bash」を含めることを推奨（スクリプト実行に必要）
3. インストール完了後、Git Bashまたは PowerShellで動作確認

```bash
git --version
```

### 推奨エディタ

- **[Visual Studio Code](https://code.visualstudio.com/)** -
  公式Deno拡張機能が利用可能
- **[Cursor](https://cursor.sh/)** - AI統合エディタ（このプロジェクトでは
  `.cursor/rules/` でルールを設定済み）

#### Deno拡張機能の設定（VSCode/Cursor）

このプロジェクトには `.vscode/`
ディレクトリが用意されており、以下の設定が自動的に適用されます：

#### 含まれる設定ファイル

- `settings.json` - Deno LSP、エディタ、フォーマッター設定
- `extensions.json` - 推奨拡張機能のリスト
- `tasks.json` - Denoタスクのショートカット
- `launch.json` - デバッグ設定（Slack Function、テスト、翻訳スクリプト等）

#### 推奨拡張機能

- `denoland.vscode-deno` - Deno公式拡張（必須）
- `github.copilot` - AI支援コーディング
- `eamodio.gitlens` - Git履歴可視化
- `usernamehw.errorlens` - エラー行内表示

初回起動時に「推奨拡張機能をインストールしますか？」と表示されたら、「すべてインストール」を選択してください。

#### デバッグ機能

`F5` キーまたは「実行とデバッグ」パネルから、以下のデバッグ設定を使用できます：

- **Debug Slack Function** - Slack関数のデバッグ
- **Debug Deno Tests** - 全テストのデバッグ
- **Debug Current File** - 現在開いているファイルのデバッグ
- **Debug i18n Tests** - i18nテストのデバッグ
- **Debug Translation Script** - 翻訳スクリプトのデバッグ

## GitHub Secrets の設定

GitHub Actionsを使用するため、以下のシークレットを設定してください：

```text
Settings → Secrets and variables → Actions
```

必須のシークレット：

- `SLACK_WEBHOOK` - Slack通知用のIncoming Webhook URL
- `ANTHROPIC_API_KEY` - Claude Code Action
  用のAPIキー（Issue自動実装・PRレビュー）

オプションのシークレット：

- `CODECOV_TOKEN` - コードカバレッジレポート用（プライベートリポジトリの場合）
- `NPM_TOKEN` - npm公開用（npmパッケージとして公開する場合）
- `JSR_TOKEN` - JSR公開用（JSRパッケージとして公開する場合）

## Claude Code Action（GitHub自動化）

このプロジェクトには、Claude Code を使ったGitHub自動化が組み込まれています。

### 機能一覧

| 機能                  | トリガー              | 説明                                            |
| --------------------- | --------------------- | ----------------------------------------------- |
| Issue → PR 自動実装   | `claude-ready` ラベル | Issueの内容を分析し、コードを実装してPRを作成   |
| @claude メンション    | コメントで `@claude`  | 質問への回答、コード実装、レビュー依頼など      |
| PR 自動コードレビュー | PR作成・更新時        | CLAUDE.md準拠、型安全性、i18n対応などをチェック |

### Claude Code Action の使い方

#### Issue から自動でPRを作成

1. Issueを作成（実装してほしい内容を詳しく記述）
2. `claude-ready` ラベルを付与
3. Claudeが自動でブランチを作成し、実装してPRを提出

#### コメントでClaudeに依頼

IssueやPRのコメントで `@claude` とメンションすると、Claudeが応答します：

```text
@claude このエラーの原因を調べてください
@claude テストを追加してください
@claude コードレビューをお願いします
```

### Claude Code Action のセットアップ

1. [Anthropic Console](https://console.anthropic.com/) でAPIキーを取得
2. リポジトリの Settings → Secrets → Actions に `ANTHROPIC_API_KEY` を追加
3. ワークフローは既に設定済み（追加設定不要）

詳細:
[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)

## デプロイ手順

### ローカル開発

```bash
# ローカルで実行（開発環境）
slack run workflows/soracom_sim_anomaly_alert_workflow

# .envファイルは自動的に読み込まれます
```

### 本番環境へのデプロイ

本番環境へデプロイする場合は、以下の手順を実行してください：

```bash
# 1. slack.jsonにdeploymentsセクションを追加
# slack.jsonに以下を追加：
# "deployments": {
#   "production": {
#     "workspace": "your-workspace-name",
#     "token_alias": "production"
#   }
# }

# 2. テストと型チェックを完了させる
deno task test
deno task check

# 3. Slack CLI でデプロイ
slack deploy --env production
```

**注意:**

- `deployments`セクションはデフォルトでは含まれていません（開発専用テンプレートのため）
- 本番デプロイ時に必要に応じて追加してください
- Trigger は運用に合わせて任意で作成してください
- 詳細は「slack.json 設定」セクションを参照

## プロジェクト構成

```text
slack-utils-iot/
├── functions/         # Slack Functions（各関数にtest.tsを配置）
├── workflows/         # 推奨構成やサンプルの Slack Workflows
├── triggers/          # 任意のサンプル Trigger
├── docs/              # ドキュメント（テストガイド等）
├── assets/            # アイコンなどの静的アセット
├── .github/           # CI/CD と Issue テンプレート
├── .cursor/           # Cursor AI エディタのルール設定
├── .gitattributes     # 改行コード統一設定 (LF)
└── deno.jsonc         # Deno設定（CHANGELOG.md除外含む）
```

## 開発時の注意事項

### 改行コード

- **全ファイルでLF（Unix形式）に統一されています**
- `.gitattributes` で自動的に設定されます
- Windows環境では Git が自動変換するため、特別な設定は不要です

### エディタ設定

- **Cursor AI**: `.cursor/rules/push_rules.mdc`
  でpush前チェックが自動実行されます
- **Deno**: `deno.jsonc` で設定を管理（フォーマッター、リンターなど）
- **VSCode/Cursor**: Deno拡張機能を有効化してください

### 自動生成ファイル

- **CHANGELOG.md**: release-please/semantic-release
  が自動生成するため、フォーマットチェックから除外されています
- 手動で編集しないでください（自動更新されます）

### OS固有の注意点

#### Windows

- **Git Bash の使用**: スクリプト実行時は Git Bash または WSL を使用
- **改行コード**: `.gitattributes` が自動的にLFに変換します
- **パス区切り**: スラッシュ（`/`）を使用（バックスラッシュ不要）

#### OS固有の注意点: macOS

- **Xcode Command Line Tools**: Gitインストールに必要
- **Homebrew**: 各種ツールのインストールに推奨

#### OS固有の注意点: Linux

- **権限**: スクリプト実行時に `chmod +x` が必要な場合があります
- **パッケージマネージャー**: ディストリビューションに応じて選択

## Git Hooks による品質チェック（推奨）

Git hooksを設定すると、commit/push時に自動的に品質チェックが実行されます。

### Git Hooks のセットアップ

#### Git Hooks: macOS / Linux

```bash
bash scripts/setup-git-hooks.sh
```

#### Git Hooks: Windows

#### Git Hooks: PowerShell を使用

```powershell
# Git Bashがインストールされている場合
bash scripts/setup-git-hooks.sh

# または、WSL内で実行
wsl bash scripts/setup-git-hooks.sh
```

#### Git Hooks: Git Bash を使用

```bash
bash scripts/setup-git-hooks.sh
```

### 自動実行される内容

#### pre-commit（コミット前）

- ✅ フォーマットチェック
- ✅ リントチェック

#### pre-push（プッシュ前）

- ✅ フォーマットチェック
- ✅ リントチェック
- ✅ テスト実行

### メリット

- CI/CDのエラーを事前に防止
- ローカルで即座にフィードバック
- 品質の自動保証

### 緊急時のスキップ（非推奨）

```bash
git commit --no-verify  # pre-commitをスキップ
git push --no-verify    # pre-pushをスキップ
```

詳細は `docs/git-hooks-setup.md` を参照してください。

## ライセンス

本テンプレートは MIT ライセンスで提供されています。詳細は `LICENSE`
を参照してください。
