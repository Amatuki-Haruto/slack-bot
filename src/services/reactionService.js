const path = require('path');
const { loadJsonFile, saveJsonFile } = require('../utils/fileUtils');

const REACTIONS_FILE_PATH = path.join(__dirname, '../config/reactions.json');

// マッチングタイプの定義
const MATCH_TYPES = {
  PARTIAL: '部分',
  EXACT: '完全'
};

class ReactionService {
  constructor() {
    this.reactions = {};
    this.loadReactions();
  }

  async loadReactions() {
    try {
      const data = await loadJsonFile(REACTIONS_FILE_PATH);
      this.reactions = data?.channels || {};
      console.log('カスタム応答設定を読み込みました');
    } catch (error) {
      console.error('カスタム応答設定の読み込みに失敗:', error);
      this.reactions = {};
    }
  }

  async saveReactions() {
    try {
      await saveJsonFile(REACTIONS_FILE_PATH, { channels: this.reactions });
      console.log('カスタム応答設定を保存しました');
    } catch (error) {
      console.error('カスタム応答設定の保存に失敗:', error);
      throw error;
    }
  }

  async addReaction(channelId, trigger, response, matchType) {
    // マッチングタイプのバリデーション
    if (!Object.values(MATCH_TYPES).includes(matchType)) {
      throw new Error('無効なマッチングタイプです。「部分」または「完全」を指定してください。');
    }

    // チャンネルの応答リストを初期化（存在しない場合）
    if (!this.reactions[channelId]) {
      this.reactions[channelId] = {};
    }

    this.reactions[channelId][trigger] = {
      response,
      matchType
    };
    await this.saveReactions();
  }

  async removeReaction(channelId, trigger) {
    if (!this.reactions[channelId] || !this.reactions[channelId][trigger]) {
      return false;
    }
    delete this.reactions[channelId][trigger];
    
    // チャンネルの応答リストが空になった場合、チャンネル自体を削除
    if (Object.keys(this.reactions[channelId]).length === 0) {
      delete this.reactions[channelId];
    }
    
    await this.saveReactions();
    return true;
  }

  getReaction(channelId, messageText) {
    // チャンネルに登録がない場合
    if (!this.reactions[channelId]) {
      return null;
    }

    // 完全一致のチェック
    const exactMatch = Object.entries(this.reactions[channelId]).find(([trigger, config]) => 
      config.matchType === MATCH_TYPES.EXACT && trigger === messageText
    );
    if (exactMatch) {
      return exactMatch[1].response;
    }

    // 部分一致のチェック
    const partialMatch = Object.entries(this.reactions[channelId]).find(([trigger, config]) => 
      config.matchType === MATCH_TYPES.PARTIAL && messageText.includes(trigger)
    );
    if (partialMatch) {
      return partialMatch[1].response;
    }

    return null;
  }

  getAllReactions(channelId) {
    if (!this.reactions[channelId]) {
      return [];
    }

    return Object.entries(this.reactions[channelId]).map(([trigger, config]) => ({
      trigger,
      response: config.response,
      matchType: config.matchType
    }));
  }

  hasReaction(channelId, trigger) {
    return this.reactions[channelId] && trigger in this.reactions[channelId];
  }

  getChannelStats() {
    return Object.entries(this.reactions).map(([channelId, reactions]) => ({
      channelId,
      count: Object.keys(reactions).length
    }));
  }

  static get MATCH_TYPES() {
    return MATCH_TYPES;
  }
}

module.exports = new ReactionService(); 