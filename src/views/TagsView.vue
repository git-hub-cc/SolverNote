<template>
  <div class="tags-view">
    <!-- 头部：标题与统计 -->
    <div class="view-header">
      <h2>All Tags</h2>
      <!-- 统计信息现在总是基于完整的笔记列表，因此是准确的 -->
      <span class="count">{{ tagList.length }} tags found</span>
    </div>

    <!-- 空状态：无标签 -->
    <div v-if="tagList.length === 0" class="empty-state">
      <div class="empty-icon">#</div>
      <p>No tags yet.</p>
      <p class="sub-text">Add tags using the hash button in the editor!</p>
    </div>

    <!-- 网格列表：展示所有标签 -->
    <div v-else class="tags-grid">
      <div
          v-for="tag in tagList"
          :key="tag.name"
          class="tag-card"
          @click="filterByTag(tag.name)"
      >
        <div class="tag-header">
          <span class="tag-symbol">#</span>
          <span class="tag-name">{{ tag.name }}</span>
        </div>
        <div class="tag-footer">
          <span class="tag-count">{{ tag.count }} notes</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '@/stores/noteStore'

// 实例化 Store 和 Router
const noteStore = useNoteStore()
const router = useRouter()

// --- 生命周期钩子 ---
onMounted(() => {
  /*
   * [鲁棒性分析] 为什么这里的逻辑现在是健壮的：
   * 1. 检查 noteStore.notes.length：`notes` 是一个 getter，它反映的是根据 `searchQuery` 过滤后的结果。
   * 2. 首次进入应用时：`_allNotesCache` 为空，`searchQuery` 为空，所以 `notes.length` 为 0，触发 `fetchNotes()`，正确加载所有数据。
   * 3. 从搜索结果页返回时：`_allNotesCache` 已有数据，`searchQuery` 可能有值。`notes.length` 不为 0，不触发 `fetchNotes()`。
   *    这没问题，因为我们的目标是显示所有标签，而 `tagList` 计算属性会从完整的 `_allNotesCache` 中获取数据，所以页面会立即正确渲染所有标签。
   *
   * [可选优化] 如果希望每次进入 Tags 页面时都清空导航栏的搜索框，可以取消下面这行代码的注释。
   * 这会让应用行为更统一：进入“Tags”视图就等同于清空所有过滤条件。
   * noteStore.setSearchQuery('');
   */
  if (noteStore.notes.length === 0 && !noteStore.loading) {
    noteStore.fetchNotes()
  }
})

// --- 计算属性 ---

/**
 * 从 Store 获取处理好的标签统计列表。
 * [鲁棒性分析] 此 getter (`noteStore.allTags`) 已在 store 中被修改为
 * 始终从 `_allNotesCache`（完整的笔记缓存）进行计算。
 * 因此，无论用户之前的操作是什么（例如进行了搜索），
 * 这个列表返回的永远是基于所有笔记的完整、准确的标签统计。
 * 这就是问题被解决的关键。
 */
const tagList = computed(() => noteStore.allTags)

// --- 方法 ---

/**
 * 点击标签后的行为。
 * @param {string} tagName - 被点击的标签名
 */
const filterByTag = (tagName) => {
  // 1. 调用 store 的 action 来设置全局的搜索关键词。
  //    这个 action 现在只会更新 state 中的 `searchQuery` 字符串，是一个非常轻量的操作。
  noteStore.setSearchQuery(tagName)

  // 2. 导航到主时间线页面。
  //    主时间线页面 (`StreamTimeline.vue`) 会响应式地通过 `noteStore.notes` getter
  //    获取到已经被 `tagName` 过滤后的笔记列表并展示出来。
  router.push('/')
}
</script>

<style lang="scss" scoped>
/* 样式部分保持不变，它们的设计与数据逻辑解耦，无需修改 */
.tags-view {
  padding: 40px 10%;
  height: 100%;
  overflow-y: auto;
}

.view-header {
  margin-bottom: 32px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 16px;

  h2 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .count {
    color: var(--text-tertiary);
    font-size: 14px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 80px;
  color: var(--text-tertiary);

  .empty-icon {
    font-size: 48px;
    font-weight: bold;
    color: var(--text-tertiary);
    opacity: 0.5;
    margin-bottom: 16px;
  }

  p {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .sub-text {
    font-size: 13px;
    margin-top: 4px;
    color: var(--text-tertiary);
  }
}

.tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.tag-card {
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100px;

  &:hover {
    border-color: var(--color-brand);
    transform: translateY(-2px);
    box-shadow: var(--shadow-card);

    .tag-symbol {
      color: var(--color-brand);
    }
  }
}

.tag-header {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tag-symbol {
  color: var(--text-tertiary);
  margin-right: 2px;
  transition: color 0.2s;
}

.tag-footer {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  justify-content: flex-end;
}

.tag-count {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>