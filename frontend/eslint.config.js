import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'Do not persist application data in browser storage.' },
        { name: 'sessionStorage', message: 'Keep client state in memory only.' },
        { name: 'indexedDB', message: 'Do not persist application data in browser storage.' },
      ],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'localStorage', message: 'Do not persist application data in browser storage.' },
        { object: 'window', property: 'sessionStorage', message: 'Keep client state in memory only.' },
        { object: 'window', property: 'indexedDB', message: 'Do not persist application data in browser storage.' },
      ],
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
