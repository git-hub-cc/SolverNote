const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const fetch = require('electron-fetch').default;

/**
 * 获取并确保模型存储目录存在
 * @returns {string} 模型存储目录的绝对路径
 */
function getModelsDir() {
    const modelsPath = path.join(app.getPath('userData'), 'models');
    fs.ensureDirSync(modelsPath); // 确保目录存在，如果不存在则创建
    return modelsPath;
}

/**
 * 下载模型文件，并向渲染进程报告进度
 * @param {BrowserWindow} win - 用于发送 IPC 消息的窗口对象
 * @param {string} url - 模型的下载地址
 * @param {string} fileName - 要保存的文件名
 * @returns {Promise<string>} 成功则返回模型文件的完整路径
 */
async function downloadModel(win, url, fileName) {
    const modelsDir = getModelsDir();
    const filePath = path.join(modelsDir, fileName);

    if (await fs.pathExists(filePath)) {
        console.log(`模型文件 ${fileName} 已存在，跳过下载。`);
        return filePath;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`下载失败: ${res.statusText}`);
        }

        const totalBytes = Number(res.headers.get('content-length'));
        const fileStream = fs.createWriteStream(filePath);

        let receivedBytes = 0;
        let lastProgress = -1;

        res.body.on('data', (chunk) => {
            receivedBytes += chunk.length;
            const progress = Math.round((receivedBytes / totalBytes) * 100);

            // 避免过于频繁地发送消息，只有在进度百分比变化时才发送
            if (progress > lastProgress) {
                win.webContents.send('model-download-progress', { fileName, progress, receivedBytes, totalBytes });
                lastProgress = progress;
            }
        });

        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });

        console.log(`模型 ${fileName} 下载完成。`);
        return filePath;
    } catch (error) {
        console.error(`下载模型 ${fileName} 时出错:`, error);
        // 清理不完整的文件
        await fs.remove(filePath).catch(err => console.error('清理失败文件时出错:', err));
        throw error;
    }
}

/**
 * 列出本地存储的所有模型文件
 * @returns {Promise<string[]>} 模型文件名列表
 */
async function listLocalModels() {
    try {
        const modelsDir = getModelsDir();
        const files = await fs.readdir(modelsDir);
        // 过滤出 .gguf 格式的模型文件
        return files.filter(file => file.endsWith('.gguf'));
    } catch (error) {
        // 如果目录不存在或读取失败，返回空数组
        console.error('无法列出本地模型:', error);
        return [];
    }
}

module.exports = {
    getModelsDir,
    downloadModel,
    listLocalModels
};