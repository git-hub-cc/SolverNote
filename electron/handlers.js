// electron/handlers.js

const fs = require('fs-extra');
const path = require('path');
const matter = require('gray-matter');
const { shell } = require('electron');
const Store = require('electron-store');

const store = new Store();

// --- 辅助函数 ---

/**
 * 获取并确保笔记目录存在。
 * @returns {string} 笔记目录的绝对路径。
 */
const getNotesDir = () => {
    // 从配置中读取路径，如果未配置，则使用当前工作目录下的 'notes' 文件夹作为默认值
    const configuredPath = store.get('notesPath', path.join(process.cwd(), 'notes'));
    // 检查目录是否存在
    if (!fs.existsSync(configuredPath)) {
        try {
            // 如果不存在，则递归创建目录
            fs.mkdirSync(configuredPath, { recursive: true });
        } catch (err) {
            console.error(`创建笔记目录失败，路径: ${configuredPath}:`, err);
            // 如果创建失败，回退到默认路径
            return path.join(process.cwd(), 'notes');
        }
    }
    return configuredPath;
};

/**
 * [新增] 递归获取目录结构。
 * 此函数用于构建前端所需的文件树，包含文件夹和 Markdown 文件。
 * @param {string} dir - 当前要扫描的目录。
 * @param {string} rootDir - 笔记的根目录，用于计算相对路径ID。
 * @returns {Promise<Array<Object>>} 文件树节点数组。
 */
async function getFileTreeRecursively(dir, rootDir) {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of list) {
            // 忽略隐藏文件 (如 .DS_Store) 和系统文件
            if (dirent.name.startsWith('.') || dirent.name === 'Icon\r') continue;

            const fullPath = path.join(dir, dirent.name);
            // 将绝对路径转换为相对于根目录的、使用斜杠'/'分隔的ID
            const relativeId = path.relative(rootDir, fullPath).split(path.sep).join('/');

            if (dirent.isDirectory()) {
                // 如果是目录，则递归扫描
                results.push({
                    id: relativeId,
                    name: dirent.name,
                    type: 'folder',
                    children: await getFileTreeRecursively(fullPath, rootDir)
                });
            } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
                // 如果是 Markdown 文件，则添加到结果中
                results.push({
                    id: relativeId,
                    name: dirent.name,
                    type: 'file'
                });
            }
        }
    } catch (error) {
        console.error(`扫描目录时出错 ${dir}:`, error);
    }
    return results;
}


// --- IPC 处理函数 ---

/**
 * [新增] 获取完整的文件树结构。
 * @returns {Promise<Array<Object>>} 供前端渲染的完整文件树。
 */
async function handleGetFileTree() {
    const notesDir = getNotesDir();
    return await getFileTreeRecursively(notesDir, notesDir);
}

/**
 * 读取所有笔记的元数据和内容。
 * 这个函数主要用于搜索索引和AI上下文分析，返回一个扁平化的笔记列表。
 * @returns {Promise<Array<Object>>} 包含所有笔记详细信息的数组。
 */
async function handleLoadNotes() {
    try {
        const notesDir = getNotesDir();

        // 内部辅助函数：将树形结构扁平化，只提取文件节点
        const flatten = (nodes) => {
            let files = [];
            for (const node of nodes) {
                if (node.type === 'file') files.push(node);
                if (node.type === 'folder' && node.children) files = files.concat(flatten(node.children));
            }
            return files;
        };

        const tree = await getFileTreeRecursively(notesDir, notesDir);
        const allFiles = flatten(tree);

        const notes = [];
        for (const fileNode of allFiles) {
            const filePath = path.join(notesDir, fileNode.id);
            try {
                const stats = await fs.stat(filePath);
                const rawContent = await fs.readFile(filePath, 'utf-8');
                // 使用 gray-matter 解析 Markdown front-matter
                const { data, content } = matter(rawContent);

                notes.push({
                    id: fileNode.id,
                    content: content,
                    rawContent: rawContent, // 包含 front-matter 的原始内容
                    timestamp: data.date ? new Date(data.date).toISOString() : stats.mtime.toISOString(),
                    tags: data.tags || [],
                    title: data.title || '',
                    hasWeakHint: false, // (遗留属性，可根据未来需求使用)
                    hintCount: 0      // (遗留属性)
                });
            } catch (readError) {
                // 如果某个文件读取失败，则跳过，以保证应用的健壮性
            }
        }
        // 按时间戳降序排序，最新的笔记排在最前面
        return notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
        console.error('读取笔记列表时出错:', error);
        return [];
    }
}

/**
 * 保存单个笔记文件。
 * @param {Event} event - IPC 事件对象。
 * @param {Object} noteData - 包含笔记内容、ID、标签等信息的对象。
 * @returns {Promise<Object>} 操作结果，包含 success 状态和笔记ID。
 */
async function handleSaveNote(event, noteData) {
    try {
        const notesDir = getNotesDir();
        // 如果没有ID，则创建一个基于时间戳的新文件名
        const filename = noteData.id || `note-${Date.now()}.md`;
        const filePath = path.join(notesDir, filename);

        // 自动从内容的第一行提取标题 (如果以 '# ' 开头)
        let title = '';
        const firstLine = noteData.content.trim().split('\n')[0];
        if (firstLine && firstLine.startsWith('# ')) {
            title = firstLine.substring(2).trim();
        }

        // 准备 front-matter 元数据
        const metadata = {
            date: noteData.timestamp || new Date().toISOString(),
            tags: noteData.tags || [],
            title: title
        };

        // 将元数据和内容合并为标准的 Markdown 文件内容
        const fileContent = matter.stringify(noteData.content, metadata);

        // 确保文件所在的目录存在
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, fileContent, 'utf-8');
        return { success: true, id: filename };
    } catch (error) {
        console.error('保存失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 删除一个文件或文件夹。
 * @param {Event} event - IPC 事件对象。
 * @param {string} id - 要删除的文件或文件夹的相对路径ID。
 * @returns {Promise<Object>} 操作结果。
 */
async function handleDeleteNote(event, id) {
    try {
        if (!id) throw new Error('必须提供笔记 ID');
        const notesDir = getNotesDir();
        const filePath = path.join(notesDir, id);

        if (!fs.existsSync(filePath)) return { success: false, error: '文件未找到' };

        // 根据用户设置决定是移入回收站还是永久删除
        const deleteMode = store.get('deleteMode', 'trash');
        if (deleteMode === 'trash') {
            await shell.trashItem(filePath); // 移入系统回收站
        } else {
            await fs.remove(filePath); // 永久删除 (fs-extra 的 remove 支持文件和文件夹)
        }
        return { success: true };
    } catch (error) {
        console.error('删除失败:', error);
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 创建一个新文件夹。
 * @param {Event} event - IPC 事件对象。
 * @param {string} folderPath - 要创建的文件夹的相对路径。
 * @returns {Promise<Object>} 操作结果。
 */
async function handleCreateFolder(event, folderPath) {
    try {
        const notesDir = getNotesDir();
        const fullPath = path.join(notesDir, folderPath);
        await fs.ensureDir(fullPath); // ensureDir 会创建所有不存在的父目录
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 重命名文件或文件夹。
 * @param {Event} event - IPC 事件对象。
 * @param {string} oldPath - 旧的相对路径。
 * @param {string} newPath - 新的相对路径。
 * @returns {Promise<Object>} 操作结果。
 */
async function handleRenamePath(event, oldPath, newPath) {
    try {
        const notesDir = getNotesDir();
        const fullOld = path.join(notesDir, oldPath);
        const fullNew = path.join(notesDir, newPath);

        // 防止覆盖现有文件
        if (await fs.pathExists(fullNew)) {
            return { success: false, error: '目标路径已存在' };
        }
        await fs.rename(fullOld, fullNew);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 移动文件或文件夹（主要用于拖拽功能）。
 * @param {Event} event - IPC 事件对象。
 * @param {string} sourcePath - 要移动的源相对路径。
 * @param {string} targetDir - 目标文件夹的相对路径 (如果为空字符串，则表示根目录)。
 * @returns {Promise<Object>} 操作结果。
 */
async function handleMovePath(event, sourcePath, targetDir) {
    try {
        const notesDir = getNotesDir();
        const fullSource = path.join(notesDir, sourcePath);
        const fileName = path.basename(sourcePath);

        // 确定目标目录的绝对路径
        const fullTargetDir = targetDir ? path.join(notesDir, targetDir) : notesDir;
        const fullDest = path.join(fullTargetDir, fileName);

        if (fullSource === fullDest) return { success: true }; // 没有移动

        // 关键检查：防止将父文件夹拖入其子文件夹
        if (targetDir && targetDir.startsWith(sourcePath + '/')) {
            return { success: false, error: '不能将文件夹移动到其自身内部' };
        }

        // 使用 fs-extra 的 move 函数，它能处理跨设备移动等复杂情况
        await fs.move(fullSource, fullDest, { overwrite: false });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleLoadNotes,
    handleSaveNote,
    handleDeleteNote,
    // [新增导出]
    handleGetFileTree,
    handleCreateFolder,
    handleRenamePath,
    handleMovePath
};