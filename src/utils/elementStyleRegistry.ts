/**
 * Element Plus 样式自动注册清单。
 *
 * Element PlusResolver 只负责按需引入「组件样式」，不含 base.css 根变量，
 * 且函数式 API（ElMessage / ElMessageBox 等）不经模板解析、不会触发 resolver。
 * 本清单是样式引入的唯一真源，由两处消费：
 *
 * 1. vite.config.ts 的 elementStyleRegistry 插件：把清单里的样式自动注入入口；
 * 2. scripts/verify-element-styles.mjs：构建后校验「用了组件但样式未进产物」。
 *
 * 新增规则：用到未登记的 El 组件时，构建校验会直接报出组件名与应补的样式文件。
 */

/** 组件名 → Element Plus 官方样式文件（相对 node_modules 的包路径） */
export const ELEMENT_STYLE_REGISTRY: Record<string, string> = {
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
  ElRadioButton: 'element-plus/theme-chalk/el-radio-button.css',
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

/**
 * 需要「整包引入」的样式（组件级样式无法拆分的场景）。
 * base.css 含全部 --el-* 根变量与过渡动画，必须整包引入。
 */
export const ELEMENT_STYLE_BUNDLES: string[] = ['element-plus/theme-chalk/base.css']

/** 组件名 → 样式文件路径；未登记返回 undefined */
export const resolveElementStyle = (componentName: string): string | undefined => ELEMENT_STYLE_REGISTRY[componentName]
