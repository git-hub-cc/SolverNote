// electron/handlers.js

const fs = require('fs-extra');
const path = require('path');
const matter = require('gray-matter');
const { shell } = require('electron');
const Store = require('electron-store');

const store = new Store();

// --- 辅助函数 ---

const getNotesDir = () => {
    const configuredPath = store.get('notesPath', path.join(process.cwd(), 'notes'));
    if (!fs.existsSync(configuredPath)) {
        try {
            fs.mkdirSync(configuredPath, { recursive: true });
        } catch (err) {
            console.error(`Failed to create notes dir at ${configuredPath}:`, err);
            return path.join(process.cwd(), 'notes');
        }
    }
    return configuredPath;
};

/**
 * [新增] 递归获取目录结构（轻量级，包含文件夹）
 * 用于前端构建完整的文件树，包括空文件夹
 */
async function getFileTreeRecursively(dir, rootDir) {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const dirent of list) {
            // 忽略隐藏文件和系统文件
            if (dirent.name.startsWith('.') || dirent.name === 'Icon\r') continue;

            const fullPath = path.join(dir, dirent.name);
            const relativeId = path.relative(rootDir, fullPath).split(path.sep).join('/');

            if (dirent.isDirectory()) {
                results.push({
                    id: relativeId,
                    name: dirent.name,
                    type: 'folder',
                    children: await getFileTreeRecursively(fullPath, rootDir)
                });
            } else if (dirent.isFile() && dirent.name.endsWith('.md')) {
                results.push({
                    id: relativeId,
                    name: dirent.name,
                    type: 'file'
                });
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
    }
    return results;
}

// --- IPC 处理函数 ---

/**
 * [新增] 获取纯文件树结构
 */
async function handleGetFileTree() {
    const notesDir = getNotesDir();
    return await getFileTreeRecursively(notesDir, notesDir);
}

// [保留 Phase 1] 读取所有笔记内容 (仅扁平列表，用于搜索和AI索引)
// 这里我们稍微修改一下，复用递归逻辑，但只提取文件
async function handleLoadNotes() {
    try {
        const notesDir = getNotesDir();

        // 内部辅助：扁平化树结构获取所有文件
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
                const { data, content } = matter(rawContent);

                notes.push({
                    id: fileNode.id,
                    content: content,
                    rawContent: rawContent,
                    timestamp: data.date ? new Date(data.date).toISOString() : stats.mtime.toISOString(),
                    tags: data.tags || [],
                    title: data.title || '',
                    hasWeakHint: false,
                    hintCount: 0
                });
            } catch (readError) {
                // 忽略读取错误的文件
            }
        }
        return notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
        console.error('Error reading notes:', error);
        return [];
    }
}

async function handleSaveNote(event, noteData) {
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
        return { success: true, id: filename };
    } catch (error) {
        console.error('Save failed:', error);
        return { success: false, error: error.message };
    }
}

async function handleDeleteNote(event, id) {
    try {
        if (!id) throw new Error('Note ID is required');
        const notesDir = getNotesDir();
        const filePath = path.join(notesDir, id);

        if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };

        const deleteMode = store.get('deleteMode', 'trash');
        if (deleteMode === 'trash') {
            await shell.trashItem(filePath);
        } else {
            // 如果是文件夹，使用 remove (相当于 rm -rf)
            await fs.remove(filePath);
        }
        return { success: true };
    } catch (error) {
        console.error('Delete failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 创建文件夹
 */
async function handleCreateFolder(event, folderPath) {
    try {
        const notesDir = getNotesDir();
        const fullPath = path.join(notesDir, folderPath);
        await fs.ensureDir(fullPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 重命名文件或文件夹
 */
async function handleRenamePath(event, oldPath, newPath) {
    try {
        const notesDir = getNotesDir();
        const fullOld = path.join(notesDir, oldPath);
        const fullNew = path.join(notesDir, newPath);

        if (await fs.pathExists(fullNew)) {
            return { success: false, error: 'Target path already exists' };
        }
        await fs.rename(fullOld, fullNew);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * [新增] 移动文件或文件夹 (用于拖拽)
 */
async function handleMovePath(event, sourcePath, targetDir) {
    try {
        const notesDir = getNotesDir();
        const fullSource = path.join(notesDir, sourcePath);
        const fileName = path.basename(sourcePath);

        // 目标路径：根目录或子目录
        const fullTargetDir = targetDir ? path.join(notesDir, targetDir) : notesDir;
        const fullDest = path.join(fullTargetDir, fileName);

        if (fullSource === fullDest) return { success: true }; // 原地不动

        // 防止将父文件夹拖入子文件夹
        if (targetDir && targetDir.startsWith(sourcePath + '/')) {
            return { success: false, error: 'Cannot move folder into itself' };
        }

        // 使用 fs-extra 的 move 防止跨设备移动错误
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