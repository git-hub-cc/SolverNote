// electron/services/modelManager.js

const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const fetch = require('electron-fetch').default;
// [日志] 引入 electron-log
const log = require('electron-log');

/**
 * 获取并确保模型存储目录存在。
 * @returns {string} 模型存储目录的绝对路径。
 */
function getModelsDir() {
    const modelsPath = path.join(app.getPath('userData'), 'models');
    // 确保目录存在，如果不存在则自动创建
    fs.ensureDirSync(modelsPath);
    return modelsPath;
}

/**
 * 下载模型文件，并向渲染进程报告进度。
 * @param {BrowserWindow} win - 用于发送 IPC 消息的窗口对象。
 * @param {string} url - 模型的下载地址。
 * @param {string} fileName - 要保存的文件名。
 * @returns {Promise<string>} 成功则返回模型文件的完整路径。
 */
async function downloadModel(win, url, fileName) {
    const modelsDir = getModelsDir();
    const filePath = path.join(modelsDir, fileName);

    log.info(`[Model Manager] 收到下载请求: 文件=${fileName}, URL=${url}`);

    if (await fs.pathExists(filePath)) {
        log.info(`[Model Manager] 文件 ${fileName} 已存在，跳过下载。`);
        // 文件已存在，也应该通知前端完成
        if (win && !win.isDestroyed()) {
            const stats = await fs.stat(filePath);
            win.webContents.send('model-download-progress', { fileName, progress: 100, receivedBytes: stats.size, totalBytes: stats.size });
        }
        return filePath;
    }

    try {
        log.info(`[Model Manager] 开始从网络获取模型: ${fileName}`);
        const res = await fetch(url);
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`下载失败: 服务器响应 ${res.status} ${res.statusText}. 详情: ${errorText}`);
        }

        const totalBytes = Number(res.headers.get('content-length'));
        log.info(`[Model Manager] 文件总大小: ${totalBytes} bytes.`);
        const fileStream = fs.createWriteStream(filePath);

        let receivedBytes = 0;
        let lastProgress = -1;

        res.body.on('data', (chunk) => {
            receivedBytes += chunk.length;
            const progress = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;

            if (progress > lastProgress) {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('model-download-progress', { fileName, progress, receivedBytes, totalBytes });
                }
                lastProgress = progress;
            }
        });

        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            fileStream.on('finish', () => {
                // [日志] 确保在写入完成后记录
                log.info(`[Model Manager] 文件流写入完成: ${fileName}`);
                resolve();
            });
            fileStream.on('error', (err) => {
                // [日志] 记录流写入错误
                log.error(`[Model Manager] 文件流写入时发生错误: ${fileName}`, err);
                reject(err);
            });
        });

        log.info(`[Model Manager] 模型 ${fileName} 下载并保存成功。`);
        return filePath;
    } catch (error) {
        log.error(`[Model Manager] 下载模型 ${fileName} 时发生严重错误:`, error);
        // 清理掉不完整的下载文件
        await fs.remove(filePath).catch(err => log.error(`[Model Manager] 清理下载失败的文件时出错: ${fileName}`, err));
        throw error; // 将错误向上抛出
    }
}

/**
 * 列出本地存储的所有模型文件。
 * @returns {Promise<string[]>} 模型文件名列表。
 */
async function listLocalModels() {
    try {
        const modelsDir = getModelsDir();
        log.info(`[Model Manager] 正在列出本地模型，目录: ${modelsDir}`);
        const files = await fs.readdir(modelsDir);
        const ggufFiles = files.filter(file => file.endsWith('.gguf'));
        log.info(`[Model Manager] 发现 ${ggufFiles.length} 个本地模型文件。`);
        return ggufFiles;
    } catch (error) {
        // 如果目录不存在或读取失败，返回空数组，避免程序崩溃
        log.error('[Model Manager] 无法列出本地模型:', error);
        return [];
    }
}

module.exports = {
    getModelsDir,
    downloadModel,
    listLocalModels
};