const { App } = require('@slack/bolt');
const path = require('path');
require('dotenv').config();

const {
  handleReactionRegister,
  handleReactionDelete,
  handleReactionList,
  handleMessage,
  REGISTER_PATTERNS
} = require('./handlers/reactionHandler');

const omikujiService = require('./services/omikujiService');
const reactionService = require('./services/reactionService');
const adminService = require('./services/adminService');
const { loadJsonFile, saveJsonFile } = require('./utils/fileUtils');
const { isMessageProcessed, createErrorMessage, createSuccessMessage } = require('./utils/messageUtils');

// Slack Botの初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  // 接続オプションを追加
  customRoutes: [
    {
      path: '/health-check',
      method: ['GET'],
      handler: (req, res) => {
        res.writeHead(200);
        res.end('Health check passed');
      },
    },
  ],
  // 再接続の設定
  retryConfig: {
    retries: 10,
    factor: 1.5,
    minTimeout: 3000,
    maxTimeout: 60000,
  }
});

// 接続状態の監視
app.error(async (error) => {
  console.error('エラーが発生しました:', error);
  // エラーに応じた再接続処理
  if (error.code === 'slack_connect_error' || error.code === 'slack_connection_closed') {
    console.log('接続エラーが発生しました。再接続を試みます...');
    try {
      await app.start();
      console.log('再接続に成功しました');
    } catch (reconnectError) {
      console.error('再接続に失敗しました:', reconnectError);
    }
  }
});

// ユーザー情報のキャッシュ
const userCache = {};

// ユーザー情報を取得する関数
async function getUserInfo(userId) {
  try {
    // キャッシュにあればそれを返す
    if (userCache[userId]) {
      return userCache[userId];
    }

    // Slack APIでユーザー情報を取得
    const result = await app.client.users.info({
      user: userId
    });

    if (result.ok && result.user) {
      // 表示名を優先、なければ実名を使用
      const userName = result.user.profile.display_name || result.user.profile.real_name || result.user.name;
      userCache[userId] = userName;
      return userName;
    }
    return userId; // 取得できない場合はIDを返す
  } catch (error) {
    console.error('ユーザー情報の取得に失敗:', error);
    return userId; // エラーの場合はIDを返す
  }
}

// おみくじの結果を生成する関数
function drawOmikuji() {
  // おみくじの確率設定（合計100）
  const fortunes = [
    { result: ':自爆:自爆:自爆:', probability: 5 },   // 5%
    { result: '大吉！！！', probability: 10 },    // 10%
    { result: '吉！', probability: 30 },      // 30%
    { result: '中吉！！', probability: 20 },    // 20%
    { result: '小吉', probability: 15 },    // 15%
    { result: '末吉', probability: 10 },    // 10%
    { result: '凶', probability: 8 },       // 8%
    { result: '大凶', probability: 2 }      // 2%
  ];

  // 1から100までの乱数を生成
  const rand = Math.floor(Math.random() * 100) + 1;
  let cumulative = 0;

  // 確率に基づいて結果を決定
  for (const fortune of fortunes) {
    cumulative += fortune.probability;
    if (rand <= cumulative) {
      return fortune.result;
    }
  }

  // 万が一の場合のフォールバック
  return '吉！';
}

// 今日の日付を取得する関数
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

// 時刻を「HH:mm:ss」形式で取得する関数
function getTimeString() {
  const now = new Date();
  return now.toLocaleTimeString('ja-JP', { hour12: false });
}

// ユーザーが今日すでにおみくじを引いているか確認する関数
function hasDrawnToday(channelId, userId) {
  const today = getTodayKey();
  return omikujiService.hasDrawnToday(channelId, userId);
}

// 管理者かどうかをチェックする関数
function isAdmin(channelId, userId) {
  // 固定管理者は常にtrue
  if (userId === adminService.FIXED_ADMIN) {
    return true;
  }
  // チャンネルの管理者リストをチェック
  return adminService.isAdmin(channelId, userId);
}

// 管理者リストを整形する関数
async function formatAdminList(channelId) {
  // 固定管理者の情報を取得
  const fixedAdminName = await getUserInfo(adminService.FIXED_ADMIN);
  const adminList = [`• ${fixedAdminName} (${adminService.FIXED_ADMIN}) [固定管理者]`];

  // チャンネルの管理者を追加
  const channelAdmins = await adminService.getChannelAdmins(channelId);
  if (channelAdmins && channelAdmins.size > 0) {
    const channelAdminList = await Promise.all(
      Array.from(channelAdmins).map(async (adminId) => {
        const adminName = await getUserInfo(adminId);
        return `• ${adminName} (${adminId})`;
      })
    );
    adminList.push(...channelAdminList);
  }

  return adminList.join('\n');
}

// チャンネルの初期化関数
function initializeChannel(channelId) {
  adminService.initializeChannel(channelId);
}

// デバッグ用：すべてのメッセージをログに出力
app.message(async ({ message, say }) => {
  console.log('受信したメッセージ:', message);
});

// おみくじコマンド
app.message(/^おみくじ$/, async ({ message, say }) => {
  console.log('おみくじリクエストを受信:', message);
  try {
    // 今日すでに引いているかチェック
    if (omikujiService.hasDrawnToday(message.channel, message.user)) {
      await say({
        text: `<@${message.user}>さん、今日はすでにおみくじを引いています。また明日チャレンジしてください！`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "おみくじ",
              emoji: true
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${message.user}>さん、今日はすでにおみくじを引いています。\n*また明日チャレンジしてください！* :pray:`
            }
          }
        ]
      });
      return;
    }

    // おみくじを引く
    const fortune = omikujiService.drawOmikuji();

    // 結果を記録
    await omikujiService.recordOmikuji(message.channel, message.user, fortune);

    await say({
      text: `<@${message.user}>さんの運勢は${fortune}です。`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "おみくじ",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${message.user}>さんの運勢は...\n\n*${fortune}*`
          }
        }
      ]
    });
    console.log('おみくじ結果を送信しました');
  } catch (error) {
    console.error('おみくじ結果の送信に失敗:', error);
  }
});

// 管理者用：今日のおみくじ履歴確認コマンド
app.message(/^おみくじ履歴$/, async ({ message, say }) => {
  console.log('おみくじ履歴リクエストを受信:', message);
  try {
    // 管理者チェック
    if (!isAdmin(message.channel, message.user)) {
      await say({
        text: `<@${message.user}>さん、このコマンドは管理者専用です。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${message.user}>さん、このコマンドは管理者専用です。 :lock:`
            }
          }
        ]
      });
      return;
    }

    const logs = omikujiService.getChannelHistory(message.channel);

    // 履歴がない場合
    if (logs.length === 0) {
      await say({
        text: "今日はまだ誰もおみくじを引いていません。",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*今日のおみくじ履歴*\n今日はまだ誰もおみくじを引いていません :ghost:"
            }
          }
        ]
      });
      return;
    }

    // 全ユーザーの情報を取得
    const logMessages = await Promise.all(
      logs.map(async (log) => {
        const userName = await getUserInfo(log.userId);
        return `• ${log.time} - ${userName} さん: *${log.fortune}*`;
      })
    );

    await say({
      text: `今日のおみくじ履歴\n${logMessages.join('\n')}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "今日のおみくじ履歴 📝",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*チャンネル:* <#${message.channel}>\n\n${logMessages.join('\n')}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `合計: ${logs.length}件`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('おみくじ履歴の送信に失敗:', error);
  }
});

// メンションリスナー
app.event('app_mention', async ({ event, say, client }) => {
  console.log('メンションを受信:', event);
  try {
    const isAdminUser = adminService.isAdmin(event.channel, event.user);
    const messageText = event.text.toLowerCase();
    
    // 管理者用コマンドの表示要求かチェック
    if (messageText.includes('管理者用') && isAdminUser) {
      // DMで管理者用コマンドを送信
      try {
        await client.chat.postMessage({
          channel: event.user,
          text: "管理者用コマンド一覧",
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: "👑 管理者用コマンド一覧",
                emoji: true
              }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "以下のコマンドが使用できます："
              }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*管理者専用コマンド*\n" +
                      "• `管理者追加 [ユーザーID]` - 新しい管理者を追加\n" +
                      "• `管理者削除 [ユーザーID]` - 管理者を削除\n" +
                      "• `管理者一覧` - 現在の管理者一覧を表示\n" +
                      "• `おみくじ履歴` - 今日のおみくじ結果一覧を表示\n" +
                      "• `反応削除 [トリガー]` - 登録済みの応答を削除（管理者のみ）"
              }
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*一般コマンド*\n" +
                      "• `おみくじ` - 今日の運勢を占います（1日1回まで）\n" +
                      "• `反応登録 トリガー／応答` - 新しい応答を登録（完全一致）\n" +
                      "• `反応登録 トリガー(部分)／応答` - 新しい応答を登録（部分一致）\n" +
                      "• `反応登録 トリガー(完全)／応答` - 新しい応答を登録（完全一致）\n" +
                      "• `反応一覧` - 登録されている応答の一覧を表示"
              }
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "⚠️ 管理者専用コマンドは管理者のみが使用できます"
                }
              ]
            }
          ]
        });

        // 元のチャンネルには確認メッセージのみ送信
        await say({
          text: `<@${event.user}>さん、DMをご確認ください。`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `<@${event.user}>さん、DMをご確認ください。 :envelope:`
              }
            }
          ]
        });
      } catch (error) {
        console.error('DM送信に失敗:', error);
        await say({
          text: `<@${event.user}>さん、DMの送信に失敗しました。`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `<@${event.user}>さん、DMの送信に失敗しました。 :x:`
              }
            }
          ]
        });
      }
      return;
    }

    // 通常のヘルプメッセージ
    await say({
      text: `<@${event.user}>さん、呼びましたか？\n「おみくじ」と入力すると今日の運勢を占えます（1日1回まで）。`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🎯 使用可能なコマンド",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${event.user}>さん、以下のコマンドが使えます：`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*基本コマンド*\n• `おみくじ` - 今日の運勢を占います（1日1回まで）"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*カスタム応答コマンド*\n" +
                  "• `反応登録 トリガー／応答` - 新しい応答を登録（完全一致）\n" +
                  "• `反応登録 トリガー(部分)／応答` - 新しい応答を登録（部分一致）\n" +
                  "• `反応登録 トリガー(完全)／応答` - 新しい応答を登録（完全一致）\n" +
                  "• `反応削除 トリガー` - 登録済みの応答を削除（管理者のみ）\n" +
                  "• `反応一覧` - 登録されている応答の一覧を表示"
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "💡 管理者用コマンドを確認するには「管理者用」と入力してください（管理者のみ）"
            }
          ]
        }
      ]
    });
    console.log('メンションに応答しました');
  } catch (error) {
    console.error('メンション応答の送信に失敗:', error);
  }
});

// 管理者一覧表示コマンド
app.message(/^管理者一覧$/, async ({ message, say }) => {
  try {
    // 管理者権限チェック
    if (!isAdmin(message.channel, message.user)) {
      await say({
        text: `<@${message.user}>さん、このコマンドは管理者専用です。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${message.user}>さん、このコマンドは管理者専用です。 :lock:`
            }
          }
        ]
      });
      return;
    }

    const adminList = await formatAdminList(message.channel);
    const totalAdmins = (channelAdmins[message.channel]?.size || 0) + 1; // 固定管理者を含む

    await say({
      text: `現在の管理者一覧:\n${adminList}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "👥 管理者一覧",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*チャンネル:* <#${message.channel}>\n\n${adminList}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `合計: ${totalAdmins}名`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('管理者一覧の表示に失敗:', error);
    await say('管理者一覧の表示中にエラーが発生しました。');
  }
});

// 管理者追加コマンド
app.message(/^管理者追加\s+([UW][A-Z0-9]+)$/, async ({ message, context, say }) => {
  const targetUserId = context.matches[1];
  
  try {
    // 管理者権限チェック
    if (!isAdmin(message.channel, message.user)) {
      await say({
        text: `<@${message.user}>さん、このコマンドは管理者専用です。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${message.user}>さん、このコマンドは管理者専用です。 :lock:`
            }
          }
        ]
      });
      return;
    }

    // 固定管理者は追加できない
    if (targetUserId === FIXED_ADMIN) {
      await say({
        text: "固定管理者は追加できません。",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "指定されたユーザーは固定管理者のため、追加できません。 :information_source:"
            }
          }
        ]
      });
      return;
    }

    // ユーザーの存在確認
    try {
      await app.client.users.info({ user: targetUserId });
    } catch (error) {
      await say({
        text: `指定されたユーザーID ${targetUserId} は存在しません。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `指定されたユーザーID \`${targetUserId}\` は存在しません。 :x:`
            }
          }
        ]
      });
      return;
    }

    // チャンネルの初期化
    initializeChannel(message.channel);

    // 既に管理者の場合
    if (channelAdmins[message.channel].has(targetUserId)) {
      const userName = await getUserInfo(targetUserId);
      await say({
        text: `${userName}さんは既にこのチャンネルの管理者です。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${userName}さんは既にこのチャンネルの管理者です。 :information_source:`
            }
          }
        ]
      });
      return;
    }

    // 管理者として追加
    channelAdmins[message.channel].add(targetUserId);
    await saveAdminUsers();
    const userName = await getUserInfo(targetUserId);
    const adminList = await formatAdminList(message.channel);

    await say({
      text: `${userName}さんをこのチャンネルの管理者に追加しました。\n現在の管理者一覧:\n${adminList}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${userName}さんをこのチャンネルの管理者に追加しました。 :white_check_mark:`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*チャンネル:* <#${message.channel}>\n\n*現在の管理者一覧:*\n${adminList}`
          }
        }
      ]
    });
  } catch (error) {
    console.error('管理者追加処理でエラー:', error);
    await say('管理者の追加中にエラーが発生しました。');
  }
});

// 管理者削除コマンド
app.message(/^管理者削除\s+([UW][A-Z0-9]+)$/, async ({ message, context, say }) => {
  const targetUserId = context.matches[1];
  
  try {
    // 管理者権限チェック
    if (!isAdmin(message.channel, message.user)) {
      await say({
        text: `<@${message.user}>さん、このコマンドは管理者専用です。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${message.user}>さん、このコマンドは管理者専用です。 :lock:`
            }
          }
        ]
      });
      return;
    }

    // 固定管理者は削除できない
    if (targetUserId === FIXED_ADMIN) {
      await say({
        text: "固定管理者は削除できません。",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "固定管理者は削除できません。 :warning:"
            }
          }
        ]
      });
      return;
    }

    // チャンネルの初期化
    initializeChannel(message.channel);

    // 管理者でない場合
    if (!channelAdmins[message.channel].has(targetUserId)) {
      const userName = await getUserInfo(targetUserId);
      await say({
        text: `${userName}さんはこのチャンネルの管理者ではありません。`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${userName}さんはこのチャンネルの管理者ではありません。 :information_source:`
            }
          }
        ]
      });
      return;
    }

    // 管理者から削除
    channelAdmins[message.channel].delete(targetUserId);
    
    // チャンネルの管理者リストが空になった場合、チャンネル自体を削除
    if (channelAdmins[message.channel].size === 0) {
      delete channelAdmins[message.channel];
    }
    
    await saveAdminUsers();
    const userName = await getUserInfo(targetUserId);
    const adminList = await formatAdminList(message.channel);

    await say({
      text: `${userName}さんをこのチャンネルの管理者から削除しました。\n現在の管理者一覧:\n${adminList}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${userName}さんをこのチャンネルの管理者から削除しました。 :white_check_mark:`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*チャンネル:* <#${message.channel}>\n\n*現在の管理者一覧:*\n${adminList}`
          }
        }
      ]
    });
  } catch (error) {
    console.error('管理者削除処理でエラー:', error);
    await say('管理者の削除中にエラーが発生しました。');
  }
});

// カスタム応答登録コマンド
REGISTER_PATTERNS.forEach(pattern => {
  app.message(pattern, handleReactionRegister);
});

// カスタム応答削除コマンド
app.message(/^反応削除\s+(.+)$/, handleReactionDelete);

// カスタム応答一覧表示コマンド
app.message(/^反応一覧$/, handleReactionList);

// 全てのメッセージに対するリスナー（カスタム応答用）
app.message(/.*/, handleMessage);

// アプリケーションの起動処理を関数化
async function startApp() {
  try {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log('⚡️ Bolt app is running!');
    console.log('Bot Token:', process.env.SLACK_BOT_TOKEN ? '設定されています' : '未設定です');
    console.log('Signing Secret:', process.env.SLACK_SIGNING_SECRET ? '設定されています' : '未設定です');
    console.log('App Token:', process.env.SLACK_APP_TOKEN ? '設定されています' : '未設定です');
    console.log(`サーバーポート: ${port}`);
  } catch (error) {
    console.error('アプリケーションの起動に失敗:', error);
    // 致命的なエラーの場合は、プロセスを終了
    process.exit(1);
  }
}

// アプリケーションの起動
startApp();

// 管理者チェック関数をエクスポート
module.exports = {
  isAdmin
}; 