# SORACOM SAM 権限設定テンプレート

このドキュメントは、SORACOM Access Management (SAM)
ユーザーやオペレーター管理ロールの権限設定を始めるときの単一テンプレートです。このリポジトリの現在の
Function / Workflow が利用する SORACOM API をひととおり許可する内容を、ひとつの
JSON にまとめています。

## 使い方

1. [sam-permission-template.json](./sam-permission-template.json)
   をコピーして、SAM ユーザーの直接指定、オペレーター管理ロール、または SAM
   デフォルト権限設定に貼り付けます。
2. このアプリだけに使う SAM ユーザーであれば、そのまま使います。
3. API / CLI 専用の SAM ユーザーで、SORACOM
   ユーザーコンソールにログインしない場合は、必要に応じて
   `User:updateUserPassword` を削除します。
4. 権限変更後は、ユーザーコンソールは再ログインし、API / CLI 用の API キーと API
   トークンは再発行します。

## テンプレート

テンプレート本体は
[sam-permission-template.json](./sam-permission-template.json) に置いています。

## このテンプレートでカバーしている機能

- SIM 一覧取得と異常検知 `Sim:listSims`
- SIM 単位 / IMSI 単位の通信量取得 `Stats:getAirStats`、`Stats:getAirStatsOfSim`
- Harvest Data の取得 `DataEntry:getDataEntries`
- ソラカメ一覧取得 `SoraCam:listSoraCamDevices`
- ソラカメの録画区間 / イベント一覧取得
  `SoraCam:listSoraCamDeviceRecordingsAndEvents`
- ソラカメ録画からの静止画エクスポート開始と結果取得
  `SoraCam:exportSoraCamDeviceRecordedImage`、`SoraCam:getSoraCamDeviceExportedImage`

## カバーしていないもの

- SIM 管理画面の検索やタグ編集
  `Query:searchSims`、`Group:listGroups`、`Sim:putSimTags`、`Sim:deleteSimTags`
  は含めていません。
- 請求閲覧 `Billing:*` は含めていません。
- ソラカメの全 API `SoraCam:*`
  ではなく、このアプリで使っているものだけに絞っています。
- SORACOM ユーザーコンソールのログインに必要な操作
  コンソール利用も前提なら、必要に応じて `OAuth2:authorize` を追加してください。

## 注意点

- `deny` は `allow` より優先されます。権限昇格につながる API
  は明示的に拒否したままにします。
- `User:updateUserPermission` を許可すると、SAM
  ユーザーが自分で広い権限を付与できるため、許可しないことが推奨されています。
- SAM では、SIM グループ単位や一部の SIM
  だけを見せるような表示制御はできません。
- このリポジトリの実装は、SIM グループで絞る画面 API を使わず、`Sim:listSims`
  の結果をアプリ側で絞り込んでいます。そのため、`Query:searchSims` や
  `Group:listGroups` は必須ではありません。
- 権限設定は、SORACOM ユーザーコンソール、SORACOM API、SORACOM CLI
  の挙動に広く影響します。必要最小権限で始めて、足りない API
  を追加する運用を前提にしてください。

## 参考

- [Users & Roles](https://developers.soracom.io/en/docs/security/users-and-roles/)
- [SAM ユーザーの権限を設定する](https://users.soracom.io/ja-jp/docs/sam/set-permissions/)
- [パーミッション構文](https://users.soracom.io/ja-jp/docs/sam/permission/)
