const reactionService = require('../services/reactionService');
const { isMessageProcessed, createErrorMessage, createSuccessMessage } = require('../utils/messageUtils');
const adminService = require('../services/adminService');

// 正規表現パターンを更新（マッチングタイプの指定がオプショナルに）
const REGISTER_PATTERNS = [
  /^反応登録\s+([^(]+)\(([^)]+)\)\/(.+)$/,  // マッチングタイプ指定あり
  /^反応登録\s+([^/]+)\/(.+)$/               // マッチングタイプ指定なし
];

async function handleReactionRegister({ message, context, say }) {
  if (isMessageProcessed(message.ts)) {
    console.log('重複メッセージをスキップ:', message);
    return;
  }

  try {
    let trigger, matchType, response;

    // マッチングタイプの指定有無で分岐
    if (context.matches.length === 4) {
      // マッチングタイプ指定あり
      trigger = context.matches[1].trim();
      matchType = context.matches[2].trim();
      response = context.matches[3].trim();
    } else {
      // マッチングタイプ指定なし（デフォルトは完全一致）
      trigger = context.matches[1].trim();
      matchType = '完全';
      response = context.matches[2].trim();
    }

    try {
      await reactionService.addReaction(message.channel, trigger, response, matchType);
    } catch (error) {
      if (error.message.includes('無効なマッチングタイプ')) {
        await say(createErrorMessage('マッチングタイプは「部分」または「完全」を指定してください。'));
        return;
      }
      throw error;
    }

    const matchTypeInfo = matchType === '完全' && context.matches.length === 3 
      ? `*マッチング:* ${matchType} (デフォルト)\n` 
      : `*マッチング:* ${matchType}\n`;

    await say(createSuccessMessage(
      "✨ カスタム応答を登録しました",
      `*トリガー:* \`${trigger}\`\n${matchTypeInfo}*応答:* ${response}\n*チャンネル:* <#${message.channel}>`
    ));
  } catch (error) {
    console.error('カスタム応答の登録に失敗:', error);
    await say(createErrorMessage('カスタム応答の登録中にエラーが発生しました。'));
  }
}

async function handleReactionDelete({ message, context, say }) {
  if (isMessageProcessed(message.ts)) {
    console.log('重複メッセージをスキップ:', message);
    return;
  }

  try {
    // 管理者権限チェック
    if (!adminService.isAdmin(message.channel, message.user)) {
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

    const trigger = context.matches[1].trim();

    if (!reactionService.hasReaction(message.channel, trigger)) {
      await say(createErrorMessage(`このチャンネルには「\`${trigger}\`」に対する応答は登録されていません。`));
      return;
    }

    await reactionService.removeReaction(message.channel, trigger);

    await say(createSuccessMessage(
      "🗑️ カスタム応答を削除しました",
      `トリガー「\`${trigger}\`」の応答を削除しました。\n*チャンネル:* <#${message.channel}>`
    ));
  } catch (error) {
    console.error('カスタム応答の削除に失敗:', error);
    await say(createErrorMessage('カスタム応答の削除中にエラーが発生しました。'));
  }
}

async function handleReactionList({ message, say }) {
  if (isMessageProcessed(message.ts)) {
    console.log('重複メッセージをスキップ:', message);
    return;
  }

  try {
    const reactions = reactionService.getAllReactions(message.channel);
    
    if (reactions.length === 0) {
      await say(createErrorMessage('このチャンネルには登録されているカスタム応答はありません。'));
      return;
    }

    const reactionList = reactions
      .map(({ trigger, response, matchType }) => 
        `• \`${trigger}\` (${matchType}) → ${response}`
      )
      .join('\n');

    await say({
      text: `カスタム応答一覧:\n${reactionList}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📝 カスタム応答一覧",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*チャンネル:* <#${message.channel}>\n\n${reactionList}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `合計: ${reactions.length}件`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('カスタム応答一覧の表示に失敗:', error);
    await say(createErrorMessage('カスタム応答一覧の表示中にエラーが発生しました。'));
  }
}

async function handleMessage({ message, say }) {
  if (isMessageProcessed(message.ts)) {
    console.log('重複メッセージをスキップ:', message);
    return;
  }

  try {
    const messageText = message.text.trim();
    const response = reactionService.getReaction(message.channel, messageText);
    
    if (response) {
      await say({
        text: response,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: response
            }
          }
        ]
      });
    }
  } catch (error) {
    console.error('カスタム応答の送信に失敗:', error);
  }
}

module.exports = {
  handleReactionRegister,
  handleReactionDelete,
  handleReactionList,
  handleMessage,
  REGISTER_PATTERNS
}; 