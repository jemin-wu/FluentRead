# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome 沉浸式双语翻译扩展（MV3）。基于 WXT 框架，TypeScript，Vite 构建。

## Development Setup

```bash
npm install          # 安装依赖
npm run dev          # 启动 WXT 开发模式（自动打开 Chrome）
npm run build        # 生产构建 → .output/chrome-mv3/
npm run zip          # 打包 .zip（Chrome Web Store 发布）
npm test             # 运行 vitest 测试
npm run test:watch   # 监听模式
npm run typecheck    # TypeScript 类型检查（tsc --noEmit）
npm run lint         # ESLint 检查
npm run lint:fix     # ESLint 自动修复
npm run format       # Prettier 格式化
```

## Architecture

- **WXT 框架** — 自动生成 manifest，HMR 热更新，Vite 打包
- Chrome MV3 Service Worker 架构
- TypeScript，路径别名 `@/` → `src/`
- **Tailwind CSS v4** — 通过 `@tailwindcss/vite` 插件集成
- Content script 匹配 `<all_urls>`，被动等待消息激活
- Storage: `chrome.storage.local`（本地设置）+ `chrome.storage.sync`（跨设备同步）
- 翻译 API: Google Translate 非官方端点（有频率限制，429 → 30s 等待）
- 快捷键: `Alt+T`（切换翻译）、`Alt+M`（切换模式）

## Git Hooks

- **Pre-commit**（husky + lint-staged）: 提交时自动运行 `eslint --fix` + `prettier --write`（TS 文件）和 `prettier --write`（CSS/HTML/JSON），然后运行 `npm test`
- 测试不通过会阻止提交

## Code Conventions

- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- TypeScript strict mode, camelCase 函数名，UPPERCASE 常量
- async/await 优于 .then()
- CSS 使用 custom properties（--color-*，--spacing-*）
- 深色模式通过 `@media (prefers-color-scheme: dark)` 自动切换

## Known Issues

- @TODOS.md 中有完整的待办列表
