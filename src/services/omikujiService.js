const path = require('path');
const { loadJsonFile, saveJsonFile } = require('../utils/fileUtils');

const OMIKUJI_FILE_PATH = path.join(__dirname, '../config/omikuji_history.json');

class OmikujiService {
  constructor() {
    this.history = {};
    this.loadHistory();
  }

  async loadHistory() {
    try {
      const data = await loadJsonFile(OMIKUJI_FILE_PATH);
      this.history = data?.channels || {};
      this.cleanupOldHistory();
      console.log('おみくじ履歴を読み込みました');
    } catch (error) {
      console.error('おみくじ履歴の読み込みに失敗:', error);
      this.history = {};
    }
  }

  async saveHistory() {
    try {
      await saveJsonFile(OMIKUJI_FILE_PATH, { channels: this.history });
      console.log('おみくじ履歴を保存しました');
    } catch (error) {
      console.error('おみくじ履歴の保存に失敗:', error);
      throw error;
    }
  }

  // 日付が変わった履歴を削除
  cleanupOldHistory() {
    const today = this.getTodayKey();
    let hasChanges = false;

    // 各チャンネルの履歴をチェック
    for (const channelId in this.history) {
      const channelHistory = this.history[channelId];
      
      // 日付が異なる場合、チャンネルの履歴を削除
      if (channelHistory.date !== today) {
        delete this.history[channelId];
        hasChanges = true;
        continue;
      }

      // ユーザーの履歴もチェック
      for (const userId in channelHistory.users) {
        if (channelHistory.users[userId].date !== today) {
          delete channelHistory.users[userId];
          hasChanges = true;
        }
      }

      // ログも日付チェック
      channelHistory.logs = channelHistory.logs.filter(log => log.date === today);
    }

    // 変更があった場合は保存
    if (hasChanges) {
      this.saveHistory().catch(console.error);
    }
  }

  getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString('ja-JP', { hour12: false });
  }

  // おみくじの結果を生成
  drawOmikuji() {
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

    const rand = Math.floor(Math.random() * 100) + 1;
    let cumulative = 0;

    for (const fortune of fortunes) {
      cumulative += fortune.probability;
      if (rand <= cumulative) {
        return fortune.result;
      }
    }

    return '吉！';
  }

  // ユーザーが今日すでにおみくじを引いているか確認
  hasDrawnToday(channelId, userId) {
    const today = this.getTodayKey();
    return this.history[channelId]?.users[userId]?.date === today;
  }

  // おみくじの結果を記録
  async recordOmikuji(channelId, userId, fortune) {
    const now = new Date();
    const today = this.getTodayKey();
    const timeStr = this.getTimeString();

    // チャンネルの初期化
    if (!this.history[channelId]) {
      this.history[channelId] = {
        date: today,
        users: {},
        logs: []
      };
    }

    // ユーザーの結果を記録
    this.history[channelId].users[userId] = {
      date: today,
      fortune: fortune,
      time: timeStr
    };

    // ログに追加
    this.history[channelId].logs.push({
      date: today,
      time: timeStr,
      userId: userId,
      fortune: fortune
    });

    await this.saveHistory();
  }

  // チャンネルの今日のおみくじ履歴を取得
  getChannelHistory(channelId) {
    const today = this.getTodayKey();
    if (!this.history[channelId] || this.history[channelId].date !== today) {
      return [];
    }
    return this.history[channelId].logs;
  }
}

module.exports = new OmikujiService(); 