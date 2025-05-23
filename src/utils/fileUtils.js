const fs = require('fs').promises;
const path = require('path');

/**
 * JSONファイルを読み込む
 * @param {string} filePath - ファイルパス
 * @returns {Promise<Object>} - 読み込んだデータ
 */
async function loadJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * JSONファイルに保存
 * @param {string} filePath - ファイルパス
 * @param {Object} data - 保存するデータ
 */
async function saveJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  loadJsonFile,
  saveJsonFile
}; 