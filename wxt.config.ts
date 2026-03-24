import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'FluentRead',
    description: '沉浸式双语翻译 Chrome 插件',
    permissions: ['activeTab', 'storage', 'commands', 'scripting'],
    host_permissions: ['https://translate.googleapis.com/*'],
    commands: {
      'toggle-translate': {
        suggested_key: { default: 'Alt+T' },
        description: '翻译/取消翻译',
      },
      'toggle-mode': {
        suggested_key: { default: 'Alt+M' },
        description: '切换翻译模式',
      },
    },
  },
});
