/*
 * Element Plus 样式自动注册插件。
 *
 * 背景：ElementPlusResolver 只在「模板里出现 El 组件」时注入组件样式，
 * 但有三类场景拿不到样式：
 *   1. 函数式 API（ElMessage / ElMessageBox）—— 不经模板解析；
 *   2. base.css 的 --el-* 根变量 —— resolver 只引组件样式，根变量会被拆到异步 chunk；
 *   3. 后续新增的公共组件 —— 需要显式登记才不会被漏掉。
 *
 * 本插件在构建开始时扫描全量 .vue/.ts 源码，识别用到的 El 组件与函数式 API，
 * 把对应样式文件自动注入入口虚拟模块，实现「用了就有样式，不用不引入」。
 *
 * 样式清单真源：src/utils/elementStyleRegistry.ts（由 scripts/sync-element-style-registry.mjs 同步）
 */
import fs from 'node:fs'
import path from 'node:path'

const VIRTUAL_ID = 'virtual:element-styles'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/** Element Plus 组件名 → 官方样式文件 */
const ELEMENT_STYLE_REGISTRY = {
  ElAffix: 'element-plus/theme-chalk/el-affix.css',
  ElAlert: 'element-plus/theme-chalk/el-alert.css',
  ElAnchor: 'element-plus/theme-chalk/el-anchor.css',
  ElAutocomplete: 'element-plus/theme-chalk/el-autocomplete.css',
  ElAvatar: 'element-plus/theme-chalk/el-avatar.css',
  ElBacktop: 'element-plus/theme-chalk/el-backtop.css',
  ElBadge: 'element-plus/theme-chalk/el-badge.css',
  ElBase: 'element-plus/theme-chalk/base.css',
  ElBreadcrumb: 'element-plus/theme-chalk/el-breadcrumb.css',
  ElBreadcrumbItem: 'element-plus/theme-chalk/el-breadcrumb-item.css',
  ElButton: 'element-plus/theme-chalk/el-button.css',
  ElCalendar: 'element-plus/theme-chalk/el-calendar.css',
  ElCalendar_: 'element-plus/theme-chalk/el-calendar.css',
  ElCard: 'element-plus/theme-chalk/el-card.css',
  ElCarousel: 'element-plus/theme-chalk/el-carousel.css',
  ElCascader: 'element-plus/theme-chalk/el-cascader.css',
  ElCheckbox: 'element-plus/theme-chalk/el-checkbox.css',
  ElCheckboxGroup: 'element-plus/theme-chalk/el-checkbox-group.css',
  ElCollapse: 'element-plus/theme-chalk/el-collapse.css',
  ElCollapseItem: 'element-plus/theme-chalk/el-collapse-item.css',
  ElColorPicker: 'element-plus/theme-chalk/el-color-picker.css',
  ElDatePicker: 'element-plus/theme-chalk/el-date-picker.css',
  ElDescriptions: 'element-plus/theme-chalk/el-descriptions.css',
  ElDescriptionsItem: 'element-plus/theme-chalk/el-descriptions-item.css',
  ElDialog: 'element-plus/theme-chalk/el-dialog.css',
  ElDivider: 'element-plus/theme-chalk/el-divider.css',
  ElDrawer: 'element-plus/theme-chalk/el-drawer.css',
  ElDropdown: 'element-plus/theme-chalk/el-dropdown.css',
  ElDropdownItem: 'element-plus/theme-chalk/el-dropdown-item.css',
  ElDropdownMenu: 'element-plus/theme-chalk/el-dropdown-menu.css',
  ElEmpty: 'element-plus/theme-chalk/el-empty.css',
  ElForm: 'element-plus/theme-chalk/el-form.css',
  ElFormItem: 'element-plus/theme-chalk/el-form-item.css',
  ElIcon: 'element-plus/theme-chalk/el-icon.css',
  ElInput: 'element-plus/theme-chalk/el-input.css',
  ElInputNumber: 'element-plus/theme-chalk/el-input-number.css',
  ElLink: 'element-plus/theme-chalk/el-link.css',
  ElLoading: 'element-plus/theme-chalk/el-loading.css',
  ElLoadingDirective: 'element-plus/theme-chalk/el-loading.css',
  ElMention: 'element-plus/theme-chalk/el-mention.css',
  ElMenu: 'element-plus/theme-chalk/el-menu.css',
  ElMenuItem: 'element-plus/theme-chalk/el-menu-item.css',
  ElMessage: 'element-plus/theme-chalk/el-message.css',
  ElMessageBox: 'element-plus/theme-chalk/el-message-box.css',
  ElNotification: 'element-plus/theme-chalk/el-notification.css',
  ElOption: 'element-plus/theme-chalk/el-option.css',
  ElOptionGroup: 'element-plus/theme-chalk/el-option-group.css',
  ElPagination: 'element-plus/theme-chalk/el-pagination.css',
  ElPopconfirm: 'element-plus/theme-chalk/el-popconfirm.css',
  ElPopover: 'element-plus/theme-chalk/el-popover.css',
  ElProgress: 'element-plus/theme-chalk/el-progress.css',
  ElRadio: 'element-plus/theme-chalk/el-radio.css',
  ElRadioGroup: 'element-plus/theme-chalk/el-radio-group.css',
  ElRate: 'element-plus/theme-chalk/el-rate.css',
  ElResult: 'element-plus/theme-chalk/el-result.css',
  ElScrollbar: 'element-plus/theme-chalk/el-scrollbar.css',
  ElSegmented: 'element-plus/theme-chalk/el-segmented.css',
  ElSelect: 'element-plus/theme-chalk/el-select.css',
  ElSkeleton: 'element-plus/theme-chalk/el-skeleton.css',
  ElSlider: 'element-plus/theme-chalk/el-slider.css',
  ElSpace: 'element-plus/theme-chalk/el-space.css',
  ElStatistic: 'element-plus/theme-chalk/el-statistic.css',
  ElStep: 'element-plus/theme-chalk/el-step.css',
  ElSteps: 'element-plus/theme-chalk/el-steps.css',
  ElSubMenu: 'element-plus/theme-chalk/el-sub-menu.css',
  ElSwitch: 'element-plus/theme-chalk/el-switch.css',
  ElTable: 'element-plus/theme-chalk/el-table.css',
  ElTableColumn: 'element-plus/theme-chalk/el-table-column.css',
  ElTabPane: 'element-plus/theme-chalk/el-tab-pane.css',
  ElTabs: 'element-plus/theme-chalk/el-tabs.css',
  ElTag: 'element-plus/theme-chalk/el-tag.css',
  ElTimeline: 'element-plus/theme-chalk/el-timeline.css',
  ElTimelineItem: 'element-plus/theme-chalk/el-timeline-item.css',
  ElTimePicker: 'element-plus/theme-chalk/el-time-picker.css',
  ElTimeSelect: 'element-plus/theme-chalk/el-time-select.css',
  ElTooltip: 'element-plus/theme-chalk/el-tooltip.css',
  ElTour: 'element-plus/theme-chalk/el-tour.css',
  ElTransfer: 'element-plus/theme-chalk/el-transfer.css',
  ElTree: 'element-plus/theme-chalk/el-tree.css',
  ElTreeSelect: 'element-plus/theme-chalk/el-tree-select.css',
  ElUpload: 'element-plus/theme-chalk/el-upload.css',
}

/** 必须整包引入的样式（base.css 含全部 --el-* 根变量与过渡动画） */
const ELEMENT_STYLE_BUNDLES = ['element-plus/theme-chalk/base.css']

/** 扫描源码目录，收集用到的 El 组件名 */
const collectUsedComponents = (root) => {
  const used = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-lib') continue
        walk(full)
        continue
      }
      if (!/\.(vue|ts|tsx|js)$/.test(entry.name)) continue
      // 排除样式清单自身：它列出了全部组件名，扫描会自我放大
      if (entry.name === 'elementStyleRegistry.ts') continue
      const content = fs.readFileSync(full, 'utf8')
      for (const m of content.matchAll(/<\s*([Ee]l[A-Z][A-Za-z0-9]*)/g)) {
        used.add('El' + m[1].slice(2))
      }
      for (const m of content.matchAll(/\b(El[A-Z][A-Za-z0-9]*)\b/g)) {
        used.add(m[1])
      }
    }
  }
  walk(root)
  return used
}

export const elementStyleRegistry = () => {
  let root = process.cwd()

  return {
    name: 'element-style-registry',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const used = collectUsedComponents(path.join(root, 'src'))
      const files = new Set(ELEMENT_STYLE_BUNDLES)
      for (const name of used) {
        const style = ELEMENT_STYLE_REGISTRY[name]
        if (style) files.add(style)
      }
      const imports = [...files].map((f) => `import '${f}'`).join('\n')
      return `/* 自动生成：扫描源码后注入的 Element Plus 样式清单 */\n${imports}\n`
    },
  }
}
