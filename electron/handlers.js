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
    const configuredPath = store.get('notesPath', path.join(process.cwd(), 'notes'));
    if (!fs.existsSync(configuredPath)) {
        try {
            fs.mkdirSync(configuredPath, { recursive: true });
        } catch (err) {
            console.error(`[FS Handler] 创建笔记目录失败，路径: ${configuredPath}:`, err);
            return path.join(process.cwd(), 'notes');
        }
    }
    return configuredPath;
};

/**
 * 递归获取目录结构。
 * @param {string} dir - 当前要扫描的目录。
 * @param {string} rootDir - 笔记的根目录。
 * @returns {Promise<Array<Object>>} 文件树节点数组。
 */
async function getFileTreeRecursively(dir, rootDir) {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of list) {
            if (dirent.name.startsWith('.')) continue; // 忽略隐藏文件

            const fullPath = path.join(dir, dirent.name);
            const relativeId = path.relative(rootDir, fullPath).split(path.sep).join('/');

            if (dirent.isDirectory()) {
                results.push({
                    id: relativeId, name: dirent.name, type: 'folder',
                    children: await getFileTreeRecursively(fullPath, rootDir)
                });
            } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
                results.push({ id: relativeId, name: dirent.name, type: 'file' });
            }
        }
    } catch (error) {
        console.error(`[FS Handler] 扫描目录时出错 ${dir}:`, error);
    }
    return results;
}

// --- IPC 处理函数 ---

async function handleGetFileTree() {
    const notesDir = getNotesDir();
    console.info(`[IPC Handler] get-tree: 正在扫描文件树，根目录: ${notesDir}`);
    const tree = await getFileTreeRecursively(notesDir, notesDir);
    console.info(`[IPC Handler] get-tree: 文件树扫描完成，找到 ${tree.length} 个顶级节点。`);
    return tree;
}

async function handleLoadNotes() {
    console.info('[IPC Handler] notes:load: 开始加载所有笔记...');
    try {
        const notesDir = getNotesDir();
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
        console.debug(`[IPC Handler] notes:load: 发现 ${allFiles.length} 个 Markdown 文件。`);

        const notes = [];
        for (const fileNode of allFiles) {
            const filePath = path.join(notesDir, fileNode.id);
            try {
                const stats = await fs.stat(filePath);
                const rawContent = await fs.readFile(filePath, 'utf-8');
                const { data, content } = matter(rawContent);
                notes.push({
                    id: fileNode.id, content: content, rawContent: rawContent,
                    timestamp: data.date ? new Date(data.date).toISOString() : stats.mtime.toISOString(),
                    tags: data.tags || [], title: data.title || ''
                });
            } catch (readError) {
                console.warn(`[IPC Handler] notes:load: 读取文件 ${fileNode.id} 失败，已跳过。错误:`, readError);
            }
        }
        const sortedNotes = notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        console.info(`[IPC Handler] notes:load: 成功加载并解析了 ${sortedNotes.length} 篇笔记。`);
        return sortedNotes;
    } catch (error) {
        console.error('[IPC Handler] notes:load: 加载笔记列表时发生严重错误:', error);
        return [];
    }
}

async function handleSaveNote(event, noteData) {
    console.info(`[IPC Handler] notes:save: 收到保存请求, ID: ${noteData.id || 'new note'}`);
    try {
        const notesDir = getNotesDir();
        const filename = noteData.id || `note-${Date.now()}.md`;
        const filePath = path.join(notesDir, filename);

        let title = '';
        const firstLine = noteData.content.trim().split('\n')[0];
        if (firstLine && firstLine.startsWith('# ')) {
            title = firstLine.substring(2).trim();
        }

        const metadata = {
            date: noteData.timestamp || new Date().toISOString(),
            tags: noteData.tags || [],
            title: title
        };
        const fileContent = matter.stringify(noteData.content, metadata);

        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, fileContent, 'utf-8');
        console.info(`[IPC Handler] notes:save: 成功保存笔记到路径: ${filePath}`);
        return { success: true, id: filename };
    } catch (error) {
        console.error(`[IPC Handler] notes:save: 保存笔记失败, ID: ${noteData.id}:`, error);
        return { success: false, error: error.message };
    }
}

async function handleDeleteNote(event, id) {
    console.info(`[IPC Handler] notes:delete: 收到删除请求, ID: ${id}`);
    try {
        if (!id) throw new Error('必须提供笔记 ID');
        const notesDir = getNotesDir();
        const filePath = path.join(notesDir, id);

        if (!(await fs.pathExists(filePath))) {
            console.warn(`[IPC Handler] notes:delete: 目标路径不存在，无法删除: ${filePath}`);
            return { success: false, error: '文件未找到' };
        }

        const deleteMode = store.get('deleteMode', 'trash');
        console.info(`[IPC Handler] notes:delete: 删除模式: ${deleteMode}`);
        if (deleteMode === 'trash') {
            await shell.trashItem(filePath);
        } else {
            await fs.remove(filePath);
        }
        console.info(`[IPC Handler] notes:delete: 成功删除: ${id}`);
        return { success: true };
    } catch (error) {
        console.error(`[IPC Handler] notes:delete: 删除失败, ID: ${id}:`, error);
        return { success: false, error: error.message };
    }
}

async function handleCreateFolder(event, folderPath) {
    console.info(`[IPC Handler] fs:create-folder: 收到创建文件夹请求, 路径: ${folderPath}`);
    try {
        const notesDir = getNotesDir();
        const fullPath = path.join(notesDir, folderPath);
        await fs.ensureDir(fullPath);
        console.info(`[IPC Handler] fs:create-folder: 成功创建或确认文件夹存在: ${fullPath}`);
        return { success: true };
    } catch (error) {
        console.error(`[IPC Handler] fs:create-folder: 创建文件夹失败:`, error);
        return { success: false, error: error.message };
    }
}

async function handleRenamePath(event, oldPath, newPath) {
    console.info(`[IPC Handler] fs:rename: 收到重命名请求, 从 '${oldPath}' 到 '${newPath}'`);
    try {
        const notesDir = getNotesDir();
        const fullOld = path.join(notesDir, oldPath);
        const fullNew = path.join(notesDir, newPath);

        if (await fs.pathExists(fullNew)) {
            console.warn(`[IPC Handler] fs:rename: 目标路径已存在，操作中止: ${fullNew}`);
            return { success: false, error: '目标路径已存在' };
        }
        await fs.rename(fullOld, fullNew);
        console.info(`[IPC Handler] fs:rename: 重命名成功。`);
        return { success: true };
    } catch (error) {
        console.error(`[IPC Handler] fs:rename: 重命名失败:`, error);
        return { success: false, error: error.message };
    }
}

async function handleMovePath(event, sourcePath, targetDir) {
    console.info(`[IPC Handler] fs:move: 收到移动请求, 源: '${sourcePath}', 目标目录: '${targetDir || '根目录'}'`);
    try {
        const notesDir = getNotesDir();
        const fullSource = path.join(notesDir, sourcePath);
        const fileName = path.basename(sourcePath);
        const fullTargetDir = targetDir ? path.join(notesDir, targetDir) : notesDir;
        const fullDest = path.join(fullTargetDir, fileName);

        if (fullSource === fullDest) {
            console.info(`[IPC Handler] fs:move: 源路径与目标路径相同，无需移动。`);
            return { success: true };
        }

        if (targetDir && targetDir.startsWith(sourcePath + '/')) {
            const errorMsg = '不能将文件夹移动到其自身内部';
            console.warn(`[IPC Handler] fs:move: 非法操作: ${errorMsg}`);
            return { success: false, error: errorMsg };
        }

        await fs.move(fullSource, fullDest, { overwrite: false });
        console.info(`[IPC Handler] fs:move: 移动成功, 新路径: ${fullDest}`);
        return { success: true };
    } catch (error) {
        console.error(`[IPC Handler] fs:move: 移动失败:`, error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    handleLoadNotes,
    handleSaveNote,
    handleDeleteNote,
    handleGetFileTree,
    handleCreateFolder,
    handleRenamePath,
    handleMovePath
};