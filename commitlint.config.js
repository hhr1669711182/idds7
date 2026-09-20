/*
 * @Author: hhr
 * @Date: 2026-09-14 16:37:16
 * @LastEditTime: 2026-09-14 16:39:58
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\commitlint.config.js
 */
/**
 * commitlint 配置文件
 * 基于 @commitlint/config-conventional 规范
 * 
 * 格式: <type>(<scope>): <subject>
 * 示例: feat(component): 添加用户登录组件
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 类型列表
    'type-enum': [
      2,
      'always',
      [
        'feat',     // 新功能
        'fix',      // 修复 bug
        'docs',     // 文档变更
        'style',    // 代码格式（不影响功能）
        'refactor', // 重构（不是修复也不是新功能）
        'perf',     // 性能优化
        'test',     // 测试相关
        'build',    // 构建系统或依赖变化
        'ci',       // CI 配置
        'chore',    // 其他修改（不涉及 src 文件）
        'revert',   // 回滚
        'wip',      // 开发中（工作进行中）
        'hotfix',   // 热修复
      ],
    ],
    // type 大小写
    'type-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    // type 为空
    'type-empty': [2, 'never'],
    // subject 为空
    'subject-empty': [2, 'never'],
    // subject 末尾不包含句号
    'subject-full-stop': [2, 'never', '.'],
    // scope 为空
    'scope-empty': [0, 'never'],
    // header 最大长度
    'header-max-length': [2, 'always', 72],
    // body 最大行数
    'body-max-line-length': [2, 'always', 100],
  },
  prompt: {
    messages: {
      type: '选择提交类型:',
      scope: '选择影响范围 (可选):',
      customScope: '请输入自定义范围:',
      subject: '简短描述 (必填):',
      body: '详细描述 (可选，使用 | 换行):',
      breaking: 'Breaking Changes (可选):',
      footerPrefixesSelect: '选择关联的 issue (可选):',
      customFooterPrefix: '输入自定义的前缀:',
      footer: '关联的 issue (例如: #123, #456):',
      generatingByAI: 'AI 正在生成你的提交信息...',
      generatedSelectByAI: '选择 AI 生成的提交信息:',
      confirmCommit: '确认提交?',
    },
    types: [
      { value: 'feat', name: 'feat:     新功能', description: '新功能' },
      { value: 'fix', name: 'fix:      修复 bug', description: '修复 bug' },
      { value: 'docs', name: 'docs:     文档变更', description: '文档变更' },
      { value: 'style', name: 'style:    代码格式', description: '不影响代码运行的格式变更' },
      { value: 'refactor', name: 'refactor: 重构', description: '既不是修复也不是新功能的代码变更' },
      { value: 'perf', name: 'perf:     性能优化', description: '性能优化' },
      { value: 'test', name: 'test:     测试', description: '添加或修改测试' },
      { value: 'build', name: 'build:    构建', description: '影响构建系统或依赖' },
      { value: 'ci', name: 'ci:       CI', description: 'CI 配置' },
      { value: 'chore', name: 'chore:    其他', description: '不涉及 src 的变更' },
      { value: 'revert', name: 'revert:   回滚', description: '回滚之前的提交' },
    ],
    useEmoji: false,
    customScopesAlign: 'bottom',
    customScopesAlias: 'custom',
    emptyScopesAlias: 'empty',
    upperCaseSubject: false,
    markBreakingChangeMode: false,
    allowCustomScopes: true,
    allowEmptyScopes: true,
    customFooterPrefixes: ['Fixes:', 'Refs:', 'Related to:'],
    footerPrefixes: ['Fixes:', 'Refs:', 'Related to:'],
    allowFooterPrefix: true,
    allowCustomFooterPrefix: true,
    allowSubjectPrefix: false,
    commitParserOpts: undefined,
    helpMessageAndFooter: true,
  },
}
