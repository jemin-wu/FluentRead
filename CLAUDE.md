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
npm run lint         # ESLint 检查
npm run lint:fix     # ESLint 自动修复
npm run format       # Prettier 格式化
```

## Architecture

- **WXT 框架** — 自动生成 manifest，HMR 热更新，Vite 打包
- Chrome MV3 Service Worker 架构
- TypeScript，路径别名 `@/` → `src/`
- Content script 匹配 `<all_urls>`，被动等待消息激活
- Storage: `chrome.storage.local`（本地设置）+ `chrome.storage.sync`（跨设备同步）
- 翻译 API: Google Translate 非官方端点（有频率限制，429 → 30s 等待）

## Project Structure (WXT)

```
src/
├── entrypoints/           # WXT 入口点（自动发现）
│   ├── background.ts      # Service Worker
│   ├── content/           # Content Script + CSS
│   │   ├── index.ts       # defineContentScript 入口
│   │   ├── translator.ts  # 翻译控制器
│   │   ├── renderer.ts    # DOM 渲染
│   │   ├── selection.ts   # 划词翻译
│   │   └── style.css      # 注入样式
│   ├── popup/             # 弹出窗口
│   └── options/           # 设置页面
├── services/              # 业务服务
│   └── translate.ts       # Google Translate API
└── utils/                 # 工具函数（WXT 自动导入）
    ├── dom-utils.ts       # DOM 元素选择/过滤
    └── storage.ts         # 翻译缓存
```

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Code Conventions

- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- TypeScript strict mode, camelCase 函数名，UPPERCASE 常量
- async/await 优于 .then()
- CSS 使用 custom properties（--color-*，--spacing-*）
- 深色模式通过 `@media (prefers-color-scheme: dark)` 自动切换

## Known Issues

- @TODOS.md 中有完整的待办列表
