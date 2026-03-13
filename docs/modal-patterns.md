# モーダル実装パターン

このドキュメントでは、Slack Deno
SDKでモーダル（ダイアログ）を使用する際の実装パターンを説明します。

## 目次

- [概要](#概要)
- [基本的なモーダル表示](#基本的なモーダル表示)
- [interactivityの使用](#interactivityの使用)
- [モーダル更新パターン](#モーダル更新パターン)
- [フォーム送信の処理](#フォーム送信の処理)
- [ベストプラクティス](#ベストプラクティス)

## 概要

Slackのモーダルは、ユーザーとの対話的なフォーム入力や確認ダイアログを実現する機能です。Slack
Deno SDKでは、`views.open`と`views.update`を使用してモーダルを操作します。

### モーダルの特徴

- **3秒タイムアウト**: `views.open`は3秒以内に呼び出す必要がある
- **interactivity必須**: モーダルを開くにはユーザーのインタラクションが必要
- **状態管理**: `private_metadata`でモーダル間のデータを保持

## 基本的なモーダル表示

### ワークフロー定義

```typescript
import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ShowFormDefinition } from "../functions/show_form/mod.ts";

const MyWorkflow = DefineWorkflow({
  callback_id: "my_workflow",
  title: "フォーム表示ワークフロー",
  input_parameters: {
    properties: {
      // interactivityは必須（モーダル表示に必要）
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      user_id: {
        type: Schema.slack.types.user_id,
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["interactivity", "user_id"],
  },
});

MyWorkflow.addStep(ShowFormDefinition, {
  interactivity: MyWorkflow.inputs.interactivity,
  user_id: MyWorkflow.inputs.user_id,
  channel_id: MyWorkflow.inputs.channel_id,
});

export default MyWorkflow;
```

### 関数定義

```typescript
import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const ShowFormDefinition = DefineFunction({
  callback_id: "show_form",
  title: "フォームを表示",
  source_file: "functions/show_form/mod.ts",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      user_id: {
        type: Schema.slack.types.user_id,
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["interactivity", "user_id"],
  },
  output_parameters: {
    properties: {
      result: {
        type: Schema.types.string,
      },
    },
    required: [],
  },
});
```

## interactivityの使用

### interactivity_pointerの取得

```typescript
export default SlackFunction(ShowFormDefinition, async ({ inputs, client }) => {
  const { interactivity, user_id, channel_id } = inputs;

  // interactivity_pointerを使用してモーダルを開く
  const result = await client.views.open({
    trigger_id: interactivity.interactivity_pointer,
    view: {
      type: "modal",
      callback_id: "my_form_modal",
      title: {
        type: "plain_text",
        text: "入力フォーム",
      },
      submit: {
        type: "plain_text",
        text: "送信",
      },
      close: {
        type: "plain_text",
        text: "キャンセル",
      },
      blocks: [
        {
          type: "input",
          block_id: "name_block",
          element: {
            type: "plain_text_input",
            action_id: "name_input",
          },
          label: {
            type: "plain_text",
            text: "名前",
          },
        },
      ],
    },
  });

  if (!result.ok) {
    return { error: `モーダルを開けませんでした: ${result.error}` };
  }

  // モーダルが開いた後、ユーザーの操作を待機
  return {
    completed: false,
  };
});
```

### 重要: 3秒タイムアウト対策

`views.open`は3秒以内に呼び出す必要があります。データ取得などに時間がかかる場合は、先にローディング画面を表示します。

```typescript
export default SlackFunction(ShowFormDefinition, async ({ inputs, client }) => {
  const { interactivity, user_id } = inputs;

  // 1. 即座にローディングモーダルを表示（3秒タイムアウト対策）
  const loadingResult = await client.views.open({
    trigger_id: interactivity.interactivity_pointer,
    view: buildLoadingView(),
  });

  if (!loadingResult.ok) {
    return { error: `モーダルを開けませんでした: ${loadingResult.error}` };
  }

  // 2. データを取得（時間がかかる処理）
  const userData = await fetchUserData(client, user_id);

  // 3. モーダルを本来のフォームに更新
  await client.views.update({
    view_id: loadingResult.view?.id,
    view: buildFormView(userData),
  });

  return { completed: false };
});

function buildLoadingView() {
  return {
    type: "modal" as const,
    callback_id: "loading_modal",
    title: {
      type: "plain_text" as const,
      text: "読み込み中...",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":hourglass_flowing_sand: データを読み込んでいます...",
        },
      },
    ],
  };
}
```

## モーダル更新パターン

### private_metadataでデータを保持

モーダル間でデータを保持するには、`private_metadata`を使用します。

```typescript
function buildFormView(userData: UserData) {
  return {
    type: "modal" as const,
    callback_id: "user_form_modal",
    // メタデータをJSON文字列で保持
    private_metadata: JSON.stringify({
      user_id: userData.id,
      original_name: userData.name,
    }),
    title: {
      type: "plain_text" as const,
      text: "ユーザー編集",
    },
    submit: {
      type: "plain_text" as const,
      text: "保存",
    },
    blocks: [
      // フォームブロック
    ],
  };
}
```

### 選択変更時のモーダル更新

ユーザーの選択に応じてモーダルを動的に更新できます。

```typescript
// block_actionsハンドラで選択変更を検知
.addBlockActionsHandler(
  ["user_select_action"],
  async ({ body, client, inputs }) => {
    const selectedUser = body.actions[0].selected_user;

    // 選択されたユーザーの情報を取得
    const userInfo = await client.users.info({ user: selectedUser });

    // モーダルを更新
    await client.views.update({
      view_id: body.view?.id,
      view: buildUpdatedFormView(userInfo.user),
    });
  }
);
```

## フォーム送信の処理

### view_submissionハンドラ

```typescript
export default SlackFunction(ShowFormDefinition, async ({ inputs, client }) => {
  // モーダルを開く処理
  // ...
  return { completed: false };
})
  // フォーム送信を処理
  .addViewSubmissionHandler(
    ["user_form_modal"],
    async ({ view, client, inputs }) => {
      // private_metadataからデータを取得
      const metadata = JSON.parse(view.private_metadata || "{}");

      // フォームの値を取得
      const values = view.state.values;
      const newName = values.name_block.name_input.value;

      // 処理を実行
      try {
        await updateUserName(client, metadata.user_id, newName);

        // 成功: モーダルを閉じる
        return {
          response_action: "clear",
        };
      } catch (error) {
        // エラー: モーダルにエラーを表示
        return {
          response_action: "errors",
          errors: {
            name_block: `更新に失敗しました: ${error.message}`,
          },
        };
      }
    },
  )
  // モーダルが閉じられた時の処理
  .addViewClosedHandler(
    ["user_form_modal"],
    async ({ view, inputs }) => {
      // キャンセル時の処理
      return { outputs: { result: "cancelled" }, completed: true };
    },
  );
```

## ベストプラクティス

### 1. ローディング画面の即時表示

```typescript
// ✅ 良い例: 即座にモーダルを開いてからデータを取得
const loadingResult = await client.views.open({
  trigger_id: interactivity.interactivity_pointer,
  view: buildLoadingView(),
});
const data = await fetchData();
await client.views.update({ view_id: loadingResult.view?.id, view: buildFormView(data) });

// ❌ 悪い例: データ取得後にモーダルを開く（タイムアウトの可能性）
const data = await fetchData(); // 3秒以上かかるとタイムアウト
await client.views.open({ ... });
```

### 2. エラーハンドリング

```typescript
// views.openの結果を確認
const result = await client.views.open({ ... });
if (!result.ok) {
  console.error("モーダルオープン失敗:", result.error);
  return { error: t("errors.modal_open_failed", { error: result.error }) };
}
```

### 3. private_metadataの活用

```typescript
// メタデータでコンテキストを保持
private_metadata: JSON.stringify({
  user_id: inputs.user_id,
  channel_id: inputs.channel_id,
  timestamp: Date.now(),
}),
```

### 4. 単一関数での処理統合

モーダルを開いた関数が送信イベントを受け取るため、関連処理を1つの関数にまとめます。

```typescript
export default SlackFunction(
  MyFunctionDefinition,
  async ({ inputs, client }) => {
    // モーダルを開く
    return { completed: false };
  },
)
  .addViewSubmissionHandler(["modal_id"], async ({ view, client }) => {
    // 送信処理
  })
  .addBlockActionsHandler(["action_id"], async ({ body, client }) => {
    // ブロックアクション処理
  })
  .addViewClosedHandler(["modal_id"], async ({ view }) => {
    // クローズ処理
  });
```

## 参考リソース

- [Slack API - Modals](https://api.slack.com/surfaces/modals)
- [Slack API - Block Kit](https://api.slack.com/block-kit)
- [Deno Slack SDK](https://api.slack.com/automation/functions/custom-bolt)
- [プロジェクトのテストガイド](./testing-guide.md)
