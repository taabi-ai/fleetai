/**
 * @fleetai/eslint-config — Shared flat ESLint config for all workspaces.
 *
 * Rules: @typescript-eslint recommended-type-checked, import/order, and a
 * `no-restricted-syntax` rule forbidding `process.env` outside @fleetai/config
 * (AGENTS.md rule 4).
 */

/** ESLint flat config for a TypeScript service/app/library. */
export function fleetaiConfig(projectTsconfigPath = './tsconfig.json', opts: { isServer?: boolean } = {}) {
  return [
    {
      ignores: ['dist/**', 'node_modules/**', '.next/**', 'coverage/**'],
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        parser: require('@typescript-eslint/parser'),
        parserOptions: {
          project: projectTsconfigPath,
          tsconfigRootDir: process.cwd(),
        },
      },
      plugins: {
        '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      },
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/consistent-type-imports': 'error',
        'import/order': [
          'error',
          {
            alphabetize: { order: 'asc', caseInsensitive: true },
            groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
            'newlines-between': 'always',
          },
        ],
        // Only @fleetai/config may read process.env (AGENTS.md rule 4).
        ...(opts.isServer
          ? {
              'no-restricted-syntax': [
                'error',
                {
                  selector: "MemberExpression[object.name='process'][property.name='env']",
                  message: 'No process.env outside @fleetai/config — use defineConfig/getEnv.',
                },
              ],
            }
          : {}),
      },
    },
  ];
}
