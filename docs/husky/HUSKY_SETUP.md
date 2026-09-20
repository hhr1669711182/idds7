# Husky + CommitLint 标准提交规范配置

## 📦 已完成的配置

### 1. 已创建的文件

| 文件 | 说明 |
|------|------|
| `.husky/commit-msg` | Git Hook：提交信息验证 |
| `.husky/_/husky.sh` | Husky 初始化脚本 |
| `commitlint.config.js` | CommitLint 规则配置 |
| `package.json` | 已添加 husky、commitlint 相关依赖 |

### 2. 已修改的 package.json

```json
{
  "scripts": {
    "prepare": "husky",  // 新增：安装后自动初始化 husky
    // ...其他脚本
  },
  "devDependencies": {
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "husky": "^9.0.0"
  }
}
```

---

## 🚀 手动安装步骤

如果自动安装失败，请按以下步骤手动完成：

### 步骤 1：安装依赖

```bash
npm install @commitlint/cli@19 @commitlint/config-conventional@19 husky@9 --save-dev
```

### 步骤 2：初始化 husky

```bash
npx husky init
```

这会创建 `.husky` 目录和 `prepare` 脚本。

### 步骤 3：创建 commit-msg hook

创建 `.husky/commit-msg` 文件，内容：

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit ${1}
```

### 步骤 4：设置执行权限（仅 Linux/Mac）

```bash
chmod +x .husky/commit-msg
```

---

## 📝 提交信息格式

### 格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### 示例

```
feat(component): 添加用户登录组件

添加了新的登录表单组件，支持：
- 用户名密码登录
- 记住登录状态
- 表单验证

Closes #123
```

### Type 类型

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(auth): 添加第三方登录` |
| `fix` | 修复 Bug | `fix(map): 修复地图缩放问题` |
| `docs` | 文档变更 | `docs: 更新 README` |
| `style` | 代码格式 | `style: 格式化代码` |
| `refactor` | 重构 | `refactor(api): 重构接口调用` |
| `perf` | 性能优化 | `perf: 优化列表渲染性能` |
| `test` | 测试 | `test: 添加单元测试` |
| `build` | 构建 | `build: 升级 Vite 版本` |
| `ci` | CI 配置 | `ci: 添加 GitHub Actions` |
| `chore` | 其他 | `chore: 更新依赖` |
| `revert` | 回滚 | `revert: 回滚上次提交` |

### Scope 范围（常用）

| Scope | 说明 |
|-------|------|
| `component` | 组件 |
| `controller` | 控制器 |
| `api` | 接口 |
| `store` | 状态管理 |
| `utils` | 工具函数 |
| `config` | 配置 |
| `types` | 类型定义 |
| `map` | 地图相关 |
| `gis` | GIS 功能 |

---

## ❌ 无效提交示例

```bash
# ❌ 错误：缺少 type
git commit -m "添加登录功能"

# ❌ 错误：type 错误
git commit -m "add: 添加登录功能"

# ❌ 错误：subject 为空
git commit -m "feat(component): "

# ❌ 错误：subject 以句号结尾
git commit -m "feat(component): 添加登录功能."

# ❌ 错误：header 超过 72 字符
git commit -m "feat(component): 这是一个超级超级超级超级超级超级超级超级长的描述"
```

## ✅ 正确提交示例

```bash
# ✅ 简单提交
git commit -m "feat(component): 添加登录组件"

# ✅ 带 scope
git commit -m "fix(map): 修复地图缩放异常"

# ✅ 带详细描述
git commit -m "feat(api): 添加用户查询接口

新增用户查询接口，支持：
- 按 ID 查询
- 按名称模糊搜索
- 分页查询

Closes #456"

# ✅ 带关联 issue
git commit -m "refactor(store): 重构用户状态管理

BREAKING CHANGE: 用户状态管理接口变更

Closes #123
Refs #456"
```

---

## 🔧 配置验证

### 本地测试提交信息

```bash
# 测试提交信息格式
echo "feat(test): 测试提交" | npx commitlint

# 或者
npx commitlint --from HEAD~1 --to HEAD
```

### 查看配置

```bash
# 查看 husky hooks
ls -la .husky/

# 查看 hook 内容
cat .husky/commit-msg
```

---

## 🎯 常用命令

```bash
# 跳过 hook（不推荐）
git commit -m "xxx" --no-verify

# 卸载 husky
npm uninstall husky
rm -rf .husky

# 更新 hook
npx husky update
```

---

## 💡 提示

1. **安装后自动生效**：运行 `npm install` 后，husky 会自动安装 hook
2. **已有项目**：如果是从已有项目克隆，需要运行 `npm install` 重新安装依赖
3. **CI 环境**：在 CI 中可能需要单独配置，可设置 `HUSKY=0` 跳过

---

## 📚 相关文档

- [Conventional Commits](https://www.conventionalcommits.org/)
- [CommitLint](https://commitlint.js.org/)
- [Husky](https://typicode.github.io/husky/)
