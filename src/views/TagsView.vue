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
  // 逻辑保持不变，但现在更加健壮。
  // 进入页面时，如果笔记缓存为空，则加载数据。
  if (noteStore._allNotesCache.length === 0 && !noteStore.loading) {
    noteStore.fetchNotes()
  }
})

// --- 计算属性 ---

/**
 * 从 Store 获取处理好的标签统计列表。
 * `noteStore.allTags` getter 始终基于完整的 `_allNotesCache` 计算，
 * 保证了无论当前有何种筛选，这里显示的都是全部标签。
 */
const tagList = computed(() => noteStore.allTags)

// --- 方法 ---

/**
 * [核心修改] 点击标签后的行为。
 * @param {string} tagName - 被点击的标签名
 */
const filterByTag = (tagName) => {
  // 1. 调用 store 中新增的 action 来设置全局的“标签过滤器”。
  //    这个 action 会自动清空文本搜索查询，确保筛选模式的纯粹性。
  noteStore.setActiveTagFilter(tagName)

  // 2. 导航到主时间线页面。
  //    主时间线页面 (`StreamTimeline.vue`) 会通过 `noteStore.notes` getter
  //    响应式地获取到被新设置的 `activeTagFilter` 精确过滤后的笔记列表。
  router.push('/')
}
</script>

<style lang="scss" scoped>
/* 样式无变化 */
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