# セットアップ手順

本ガイドは「SORACOM」関連サービスを利用するための参考手順です。株式会社ソラコムまたはその関連会社による提携、支援、後援を示すものではありません。

「SORACOM」「ソラコム」「ソラカメ」および関連する商品・サービス名称は、株式会社ソラコムまたはその関連会社の商標または登録商標です。

## デバイスセットアップ

このリポジトリで想定しているデバイスのセットアップ手順は、以下の「SORACOM」
公式ページを参照してください。

- 「ソラカメ」対応カメラ:
  [STEP 1: ソラカメ対応カメラを設置する (追加する)](https://users.soracom.io/ja-jp/docs/soracom-cloud-camera-services/install-camera/)
- LTE-M CO2 センサー RS-LTECO2:
  [IoTで、CO2と温湿度を計測し換気促進](https://soracom.jp/recipes_index/9972/)
- LTE-M CO2 センサー RS-LTECO2 ユーザーガイド:
  [RS-LTECO2_UG_v1.pdf](https://soracom.jp/wp-content/uploads/2021/06/RS-LTECO2_UG_v1.pdf)
- GPS マルチユニット: [GPS マルチユニット](https://soracom.jp/store/5235/)
- GPS マルチユニット Harvest Data フォーマット:
  [データフォーマット](https://users.soracom.io/ja-jp/guides/iot-devices/gps-multiunit/format/)

## このガイドで作るもの

このガイドでは、Slack 上で次の 4 つを使える状態まで進めます。

- 全カメラ画像スナップショット
  - 指定チャンネルに、対象カメラデバイスの最新スナップショットを順番に投稿する
- 空気品質レポート
  - 指定した SIM グループ配下の active SIM を対象に、CO2 / 温度 /
    湿度の要約を投稿する
- GPSマルチユニットレポート
  - 指定した SIM グループ配下の active SIM
    を対象に、温湿度と位置情報の要約を投稿する
- GPSマルチユニット ジオフェンス確認
  - 指定した中心緯度経度と半径に対して、最新位置が範囲内かどうかを投稿する

このリポジトリには Deno SDK の `Workflow`
定義も含まれていますが、運用時の時刻や投稿先はワークスペースごとに異なるため、このガイドでは
Slack の Workflow Builder から定期実行ワークフローを作る手順で説明します。

## 事前に用意するもの

- Slack の Workflow app を使える有料プランのワークスペース
  - 無料で試す場合は Slack Developer Program の sandbox を使ってください
- Deno 1.37+ が使えること
- Slack CLI が使えること
- Slack App を作成、更新、デプロイできる権限
- 「SORACOM」API の AuthKey ID / AuthKey
- ワークフローの投稿先にする Slack チャンネル
- 空気品質レポート / GPSマルチユニットレポート / GPSマルチユニット
  ジオフェンス確認用:
  - 対象 SIM が同じグループに入っていること
  - `sim_group_id` を「SORACOM」ユーザーコンソールで事前に控えていること
  - 対象はそのグループ配下の `active` SIM のみであること
- 全カメラ画像スナップショット用:
  - 「ソラカメ」デバイスが登録済みで、直近の録画が存在すること
- 空気品質レポート用:
  - Harvest Data に CO2 / 温度 / 湿度が記録されていること
- GPSマルチユニットレポート / ジオフェンス確認用:
  - Harvest Data に温度 / 湿度 / 緯度 / 経度が記録されていること

事前確認コマンド:

```bash
deno --version
slack --version
slack auth list
```

`slack auth list` では、このあと deploy
したいワークスペースにログイン済みであることを確認してください。

空気品質レポートでは、Harvest Data
のキーとして次のいずれかが使われていれば集計できます。

- CO2: `co2`, `co2ppm`, `co2_ppm`
- 温度: `temperature`, `temp`
- 湿度: `humidity`, `hum`, `humid`

GPSマルチユニットレポート / ジオフェンス確認では、Harvest Data のキーとして
`lat`, `lon`, `temp`, `humi`, `type` を使います。`lat` / `lon` が
`null`、範囲外、非数値のときは GPS 未取得として扱います。

## 1. リポジトリを準備する

```bash
git clone https://github.com/leaveanest/slack-utils-iot.git
cd slack-utils-iot

cp .env.example .env
```

`.env` はローカルでの `slack run` と、ローカルで manifest
を生成するときに使います。 deployed custom function の実行時には `.env`
は使われません。

`.env` には少なくとも次を設定します。

```bash
SLACK_APP_NAME="Slack Utils IoT"
SLACK_APP_DESCRIPTION="IoT utilities for Slack"
LOCALE=ja
```

このガイドでは Workflow Builder 側で `channel_id` を指定する前提で進めるため、
チャンネル ID 用の環境変数は必須ではありません。

Slack CLI にログインし、対象ワークスペースを確認します。

```bash
slack login
slack auth list
```

既存の Slack App を流用する場合は、先にその app をこのリポジトリへ紐付けます。

```bash
slack app link --app <APP_ID> --team <TEAM_ID> --environment deployed
```

既存 app を流用しない場合は、次の `slack deploy` 時のプロンプトに従って deployed
app を作成または選択してください。

## 2. Slack App をデプロイする

Slack の Workflow Builder から custom step を使うには、アプリをワークスペースへ
deploy しておく必要があります。`slack run` だけでは、Slack 本体の Workflow
Builder には出てきません。`slack run` で作られる local app と `slack deploy`
で作られる deployed app は別物です。

まず、ローカルで manifest とテストを確認します。

```bash
deno task check
deno task test
```

そのうえで deployed app を作成または更新します。

```bash
slack deploy
```

deployed custom function が使う「SORACOM」認証情報は `.env`
ではなく、`slack env add` で登録します。`SORACOM_COVERAGE_TYPE`
は日本カバレッジなら `jp`、グローバルカバレッジなら `g` を使ってください。

```bash
slack env add SORACOM_AUTH_KEY_ID your-auth-key-id
slack env add SORACOM_AUTH_KEY "your-auth-key"
slack env add SORACOM_COVERAGE_TYPE jp

slack env list
```

`slack env list` では少なくとも `SORACOM_AUTH_KEY_ID`, `SORACOM_AUTH_KEY`,
`SORACOM_COVERAGE_TYPE` が見えることを確認してください。

新しい function は既定で app collaborator のみが Workflow Builder
から使えます。運用担当者が app collaborator 以外なら、function
ごとにアクセスを設定し、 その後にもう一度 `slack deploy` します。

```bash
slack function access --name soracom_export_all_soracam_images --everyone
slack function access --name co2_daily_air_quality_report --everyone
slack function access --name gps_multiunit_report --everyone
slack function access --name gps_multiunit_geofence_report --everyone

slack deploy
```

`--everyone`
はワークスペース全体へ公開する例です。特定ユーザーのみにしたい場合は、
`slack function access` を対話モードで実行して対象を選んでください。

デプロイ後に確認すること:

- Slack で `Apps > Manage > Browse apps` にアプリが表示される
- Slack App が対象ワークスペースにインストールされている
- 投稿先チャンネルにアプリを追加済みである
- private channel に投稿する場合も、そのチャンネルへ明示的に参加させている

このリポジトリのマニフェストでは、投稿とファイル共有に必要な `chat:write` と
`files:write` に加えて、Datastore 利用の `datastore:read` /
`datastore:write`、継続処理に使う `triggers:write` などを要求します。

## 3. Slack 側でワークフローを作る

このガイドでは、Slack の Workflow Builder で「定期実行 + custom step 1
個」のシンプルな構成を作ります。定期実行の間隔は運用に合わせて調整してください。

### 3-1. 全カメラ画像スナップショット

1. Slack で Workflow Builder を開く
2. `新しいワークフロー` を作成する
3. 開始条件は `スケジュール` を選ぶ
4. 実行したい時刻を設定する
5. ステップ追加で、このアプリが提供する `全カメラ画像スナップショット`
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
  - 対象センサー SIM をまとめた「SORACOM」のグループ ID
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

### 3-3. GPSマルチユニットレポート

1. Workflow Builder で別の新しいワークフローを作成する
2. 開始条件は `スケジュール` を選ぶ
3. 実行したい時刻を設定する
4. ステップ追加で `GPSマルチユニットレポート` を選ぶ
5. 各入力を設定する

設定する主な入力:

- `sim_group_id`
  - 対象デバイスの SIM をまとめた「SORACOM」のグループ ID
- `channel_id`
  - レポートの投稿先チャンネル
- `period`
  - `1h`, `1d` から選択
- `sample_count`
  - `1〜24` の整数
  - `1` のときは期間内の最新 1 点を表示
  - `2` 以上のときは、期間を等分した時間帯ごとに温度 / 湿度の平均を表示

設定後にワークフローを公開します。

補足:

- 対象は指定グループ配下の `active` SIM のみです
- 実行時には、最初にグループ全体の要約を 1
  件投稿し、その後でデバイスごとのレポートを投稿します
- `sample_count` が `2`
  以上のとき、各時間帯の位置情報はその時間帯で最後に取れた有効な GPS
  を表示します
- GPS が取れていない場合は Google Maps URL を出さず、警告文を表示します
- `type = -1` のサンプルは、デバイス異常として警告を添えます

### 3-4. GPSマルチユニット ジオフェンス確認

1. Workflow Builder で別の新しいワークフローを作成する
2. 開始条件は `スケジュール` を選ぶ
3. 実行したい時刻を設定する
4. ステップ追加で `GPSマルチユニット ジオフェンス確認` を選ぶ
5. 各入力を設定する

設定する主な入力:

- `sim_group_id`
  - 対象デバイスの SIM をまとめた「SORACOM」のグループ ID
- `channel_id`
  - レポートの投稿先チャンネル
- `period`
  - `1h`, `1d` から選択
- `center_latitude`
  - 判定の中心にする緯度
  - `-90` 以上 `90` 以下の数
- `center_longitude`
  - 判定の中心にする経度
  - `-180` 以上 `180` 以下の数
- `radius_meters`
  - 判定半径。メートル単位で指定
  - `0` より大きい数

設定後にワークフローを公開します。

補足:

- 対象は指定グループ配下の `active` SIM のみです
- 判定には期間内の最新サンプルだけを使います
- 境界上の位置は範囲内として扱います
- GPS が取れていない場合は `no_gps` 扱いになり、地図 URL は表示しません

## 4. 動作確認する

公開後は、まず手動で 1 回流して期待通りに投稿されるか確認してください。

### 全カメラ画像スナップショットの確認ポイント

- 進捗メッセージが最初に出ること
- 各カメラの JPEG がチャンネルに投稿されること
- カメラ台数が多い場合でも、途中で止まらず継続されること

### 空気品質レポートの確認ポイント

- グループ全体の要約が最初に出ること
- センサーごとに CO2 / 温度 / 湿度の集計が投稿されること
- 想定したしきい値で注意喚起が出ること

### GPSマルチユニットレポートの確認ポイント

- グループ全体の要約が最初に出ること
- `sample_count = 1` のとき、期間内の最新 1 点が表示されること
- `sample_count > 1` のとき、指定した件数ぶんの時間帯が表示されること
- GPS が取れているデータでは Google Maps URL が表示されること
- GPS が取れていないデータでは警告文が表示されること

### GPSマルチユニット ジオフェンス確認の確認ポイント

- 指定グループ内の全デバイスが 1 件の集約メッセージに含まれること
- 各デバイスで `inside`, `outside`, `no_gps` のいずれかが表示されること
- GPS が取れているデバイスでは距離と Google Maps URL が表示されること
- 境界上のデバイスが範囲内として扱われること

## よくある詰まりどころ

### Workflow Builder に step が出てこない

- `slack deploy` が完了しているか確認してください
- アプリを更新後、Slack 側で再読込して確認してください
- 対象ワークスペースにそのアプリが入っているか確認してください
- step を使いたい人が app collaborator 以外なら `slack function access`
  を実行し、その後に `slack deploy` し直してください

### deployed app で「SORACOM」認証エラーになる

- `.env` ではなく `slack env add` で認証情報を登録しているか確認してください
- `slack env list` で `SORACOM_AUTH_KEY_ID`, `SORACOM_AUTH_KEY`,
  `SORACOM_COVERAGE_TYPE` が見えるか確認してください
- グローバルカバレッジ利用時に `SORACOM_COVERAGE_TYPE=g`
  を設定しているか確認してください

### `sim_group_id` がわからない

- 「SORACOM」ユーザーコンソールで対象グループを開き、グループ ID を確認してください
- 対象の SIM がそのグループに属しているか確認してください

### チャンネルに投稿できない

- アプリが投稿先チャンネルに参加しているか確認してください
- private channel の場合は招待漏れがないか確認してください
- private channel 固有の `channel_id`
  バリデーションエラーが出る場合は、現状の実装フォロー候補として別途切り分けてください

### 「ソラカメ」画像が取れない

- デバイスが登録済みか確認してください
- 直近の録画があるか確認してください
- `slack env list` で「SORACOM」認証情報が deploy 済み app
  に設定されているか確認してください

### 空気品質レポートが空になる

- `sim_group_id` が正しいか確認してください
- グループ内に `active` SIM があるか確認してください
- Harvest Data のキー名がこのガイドの対応範囲に入っているか確認してください

### GPSマルチユニットレポートで位置が出ない

- `lat` と `lon` が Harvest Data に入っているか確認してください
- 直近データの `lat` / `lon` が
  `null`、範囲外、非数値になっていないか確認してください
- `sample_count = 1` のときは、最新サンプルだけを表示するため、古い有効 GPS
  にはフォールバックしません

### GPSマルチユニット ジオフェンス確認がすべて `no_gps` になる

- `period` 内に GPS を含む最新サンプルが存在するか確認してください
- デバイスが位置情報送信を有効にしているか確認してください
- 中心緯度経度と半径の入力値が正しいか確認してください

### 入力値のバリデーションで失敗する

- `sample_count` は `1〜24` の整数にしてください
- `center_latitude` は `-90` 以上 `90` 以下にしてください
- `center_longitude` は `-180` 以上 `180` 以下にしてください
- `radius_meters` は `0` より大きい数にしてください
