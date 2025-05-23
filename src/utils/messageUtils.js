// 処理済みメッセージを追跡するためのSet
const processedMessages = new Set();

// 一定時間後に処理済みメッセージをクリアする（メモリ節約のため）
setInterval(() => {
  processedMessages.clear();
}, 1000 * 60 * 60); // 1時間ごとにクリア

/**
 * メッセージが重複していないかチェック
 * @param {string} messageId - メッセージID
 * @returns {boolean} - 重複している場合はtrue
 */
function isMessageProcessed(messageId) {
  if (processedMessages.has(messageId)) {
    return true;
  }
  processedMessages.add(messageId);
  return false;
}

/**
 * Block Kit用のエラーメッセージを作成
 * @param {string} message - エラーメッセージ
 * @returns {Object} - Block Kit形式のメッセージ
 */
function createErrorMessage(message) {
  return {
    text: message,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${message} :x:`
        }
      }
    ]
  };
}

/**
 * Block Kit用の成功メッセージを作成
 * @param {string} title - タイトル
 * @param {string} message - メッセージ
 * @returns {Object} - Block Kit形式のメッセージ
 */
function createSuccessMessage(title, message) {
  return {
    text: message,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message
        }
      }
    ]
  };
}

module.exports = {
  isMessageProcessed,
  createErrorMessage,
  createSuccessMessage
}; 