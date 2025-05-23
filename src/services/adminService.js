const path = require('path');
const { loadJsonFile, saveJsonFile } = require('../utils/fileUtils');

// 固定管理者のユーザーID
const FIXED_ADMIN = 'U08UCCC0W4Q';

// 管理者リストのファイルパス
const ADMIN_FILE_PATH = path.join(__dirname, '../config/admin_users.json');

// チャンネルごとの管理者のユーザーIDセット
let channelAdmins = {};

// 管理者リストをファイルから読み込む
async function loadAdminUsers() {
  try {
    const data = await loadJsonFile(ADMIN_FILE_PATH);
    channelAdmins = data?.channels || {};
    console.log('管理者リストを読み込みました');
  } catch (error) {
    if (error.code === 'ENOENT') {
      // ファイルが存在しない場合は、現在のリストを保存
      await saveAdminUsers();
      console.log('管理者リストのファイルを新規作成しました');
    } else {
      console.error('管理者リストの読み込みに失敗:', error);
    }
  }
}

// 管理者リストをファイルに保存
async function saveAdminUsers() {
  try {
    await saveJsonFile(ADMIN_FILE_PATH, { channels: channelAdmins });
    console.log('管理者リストを保存しました');
  } catch (error) {
    console.error('管理者リストの保存に失敗:', error);
  }
}

// 管理者かどうかをチェックする関数
function isAdmin(channelId, userId) {
  // 固定管理者は常にtrue
  if (userId === FIXED_ADMIN) {
    return true;
  }
  // チャンネルの管理者リストをチェック
  return channelAdmins[channelId]?.has(userId) || false;
}

// チャンネルの初期化関数
function initializeChannel(channelId) {
  if (!channelAdmins[channelId]) {
    channelAdmins[channelId] = new Set();
  }
}

// 起動時に管理者リストを読み込む
loadAdminUsers();

module.exports = {
  isAdmin,
  initializeChannel,
  loadAdminUsers,
  saveAdminUsers,
  FIXED_ADMIN
}; 