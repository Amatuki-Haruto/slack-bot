# Slack おみくじBot

Slackワークスペース用のおみくじBotです。一日一回おみくじを引くことができ、運勢を占うことができます。

## 機能

- 一日一回のおみくじ機能
- 複数の運勢（大大吉、大吉、吉、中吉、小吉、末吉、凶、大凶）
- 管理者機能（管理者の追加・削除、一覧表示）
- 履歴機能

## 確率設定

- 大大吉: 5%
- 大吉: 10%
- 吉: 30%
- 中吉: 20%
- 小吉: 15%
- 末吉: 10%
- 凶: 8%
- 大凶: 2%

## セットアップ

1. リポジトリをクローン
```bash
git clone [リポジトリURL]
cd [リポジトリ名]
```

2. 依存関係のインストール
```bash
npm install
```

3. 環境変数の設定
以下の環境変数を`.env`ファイルに設定してください：
```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
```

4. Botの起動
```bash
npm start
```

## Slack側の設定

1. [Slack API](https://api.slack.com/apps)でアプリを作成
2. 以下の権限を付与：
   - `chat:write`
   - `commands`
   - `users:read`
3. Socket Modeを有効化
4. アプリをワークスペースにインストール

## コマンド一覧

- `/omikuji` - おみくじを引く
- `/admin_add @ユーザー名` - 管理者を追加（管理者のみ）
- `/admin_remove @ユーザー名` - 管理者を削除（管理者のみ）
- `/admin_list` - 管理者一覧を表示

## 注意事項

- おみくじは一日一回までです
- 管理者コマンドは管理者のみが使用できます
- Socket Mode接続のエラーが発生した場合は自動的に再接続を試みます 