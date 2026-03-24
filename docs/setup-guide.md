# セットアップ手順

## デバイスセットアップ

このリポジトリで想定しているデバイスのセットアップ手順は、以下の SORACOM
公式ページを参照してください。

- ソラカメ対応カメラ:
  [STEP 1: ソラカメ対応カメラを設置する (追加する)](https://users.soracom.io/ja-jp/docs/soracom-cloud-camera-services/install-camera/)
- LTE-M CO2 センサー RS-LTECO2:
  [IoTで、CO2と温湿度を計測し換気促進](https://soracom.jp/recipes_index/9972/)
- LTE-M CO2 センサー RS-LTECO2 ユーザーガイド:
  [RS-LTECO2_UG_v1.pdf](https://soracom.jp/wp-content/uploads/2021/06/RS-LTECO2_UG_v1.pdf)

## このガイドで作るもの

このガイドでは、Slack 上で次の 2 つを使える状態まで進めます。

- ソラカメ全台画像スナップショット
  - 指定チャンネルに、全ソラカメデバイスの最新スナップショットを順番に投稿する
- 空気品質レポート
  - 指定した SIM グループ配下の active SIM を対象に、CO2 / 温度 /
    湿度の要約を投稿する

このリポジトリには Deno SDK の `Workflow`
定義も含まれていますが、運用時の時刻や投稿先はワークスペースごとに異なるため、このガイドでは
Slack の Workflow Builder から定期実行ワークフローを作る手順で説明します。

## 事前に用意するもの

- Slack CLI が使えること
- Slack App を作成、または更新できる権限
- SORACOM API の AuthKey ID / AuthKey
- ワークフローの投稿先にする Slack チャンネル
- ソラカメ全台画像スナップショット用:
  - ソラカメデバイスが登録済みで、直近の録画が存在すること
- 空気品質レポート用:
  - 対象センサーの SIM が同じグループに入っていること
  - Harvest Data に CO2 / 温度 / 湿度が記録されていること

空気品質レポートでは、Harvest Data
のキーとして次のいずれかが使われていれば集計できます。

- CO2: `co2`, `co2ppm`, `co2_ppm`
- 温度: `temperature`, `temp`
- 湿度: `humidity`, `hum`, `humid`

## 1. リポジトリを準備する

```bash
git clone https://github.com/leaveanest/slack-utils-soracom.git
cd slack-utils-soracom

cp .env.example .env
```

`.env` を開いて、少なくとも次を設定します。

```bash
SLACK_APP_NAME="Slack Utils SORACOM"
SLACK_APP_DESCRIPTION="SORACOM utilities for Slack"
LOCALE=ja

SORACOM_AUTH_KEY_ID=your-auth-key-id
SORACOM_AUTH_KEY=your-auth-key
SORACOM_COVERAGE_TYPE=jp
```

必要ならチャンネル ID 用の変数も設定できますが、このガイドでは Workflow Builder
側で `channel_id` を指定する前提で進めます。

```bash
slack login
```

## 2. Slack App をデプロイする

Slack の Workflow Builder から custom step
を使うには、アプリをワークスペースへデプロイしておく必要があります。`slack run`
だけでは、Slack 本体の Workflow Builder には出てきません。

`slack.json` に本番デプロイ用の `deployments`
をまだ書いていない場合は追加します。

```json
{
  "deployments": {
    "production": {
      "workspace": "your-workspace-name",
      "token_alias": "production"
    }
  }
}
```

そのうえで、アプリをデプロイします。

```bash
deno task check
deno task test
slack deploy --env production
```

デプロイ後に確認すること:

- Slack App が対象ワークスペースにインストールされている
- 投稿先チャンネルにアプリを追加済みである
- private channel に投稿する場合も、そのチャンネルへ明示的に参加させている

このリポジトリのマニフェストでは、投稿とファイル共有に必要な `chat:write` と
`files:write`、継続処理に使う `triggers:write` などを要求します。

## 3. Slack 側でワークフローを作る

このガイドでは、Slack の Workflow Builder で「定期実行 + custom step 1
個」のシンプルな構成を作ります。定期実行の間隔は運用に合わせて調整してください。

### 3-1. ソラカメ全台画像スナップショット

1. Slack で Workflow Builder を開く
2. `新しいワークフロー` を作成する
3. 開始条件は `スケジュール` を選ぶ
4. 実行したい時刻を設定する
5. ステップ追加で、このアプリが提供する `ソラカメ全台画像スナップショット`
   を選ぶ
6. `channel_id` に投稿先チャンネルを指定する
7. ワークフローを公開する

補足:

- この step は、最初に進捗メッセージを 1
  件投稿し、その後に各カメラの画像を順番に投稿します
- 台数が多い場合は、内部で一時的な scheduled trigger を作って継続処理します
- `job_key` と `task_key` は内部用なので、Workflow Builder で通常は指定しません
- カメラに直近の録画がない場合、そのデバイスの画像は取得できません

### 3-2. 空気品質レポート

1. Workflow Builder で別の新しいワークフローを作成する
2. 開始条件は `スケジュール` を選ぶ
3. 実行したい時刻を設定する
4. ステップ追加で `空気品質レポート` を選ぶ
5. 各入力を設定する

設定する主な入力:

- `sim_group_id`
  - 対象センサー SIM をまとめた SORACOM のグループ ID
- `channel_id`
  - レポートの投稿先チャンネル
- `period`
  - `1h`, `1d`, `1m` から選択
- `co2_threshold`
  - 既定値は `1000`
- `temperature_min`
  - 既定値は `18`
- `temperature_max`
  - 既定値は `28`
- `humidity_min`
  - 既定値は `40`
- `humidity_max`
  - 既定値は `70`

設定後にワークフローを公開します。

補足:

- 対象は指定グループ配下の `active` SIM のみです
- 実行時には、最初にグループ全体の要約を 1
  件投稿し、その後でセンサーごとのレポートを投稿します
- グループ内に active SIM がない場合や、Harvest Data
  が取れない場合はエラーになります

## 4. 動作確認する

公開後は、まず手動で 1 回流して期待通りに投稿されるか確認してください。

### ソラカメ全台画像スナップショットの確認ポイント

- 進捗メッセージが最初に出ること
- 各カメラの JPEG がチャンネルに投稿されること
- カメラ台数が多い場合でも、途中で止まらず継続されること

### 空気品質レポートの確認ポイント

- グループ全体の要約が最初に出ること
- センサーごとに CO2 / 温度 / 湿度の集計が投稿されること
- 想定したしきい値で注意喚起が出ること

## よくある詰まりどころ

### Workflow Builder に step が出てこない

- `slack deploy --env production` が完了しているか確認してください
- アプリを更新後、Slack 側で再読込して確認してください
- 対象ワークスペースにそのアプリが入っているか確認してください

### チャンネルに投稿できない

- アプリが投稿先チャンネルに参加しているか確認してください
- private channel の場合は招待漏れがないか確認してください

### ソラカメ画像が取れない

- デバイスが登録済みか確認してください
- 直近の録画があるか確認してください
- SORACOM 認証情報が `.env` に入っているか確認してください

### 空気品質レポートが空になる

- `sim_group_id` が正しいか確認してください
- グループ内に active SIM があるか確認してください
- Harvest Data のキー名がこのガイドの対応範囲に入っているか確認してください
