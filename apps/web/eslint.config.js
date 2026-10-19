import react from '@sim/config/eslint/react';

export default [
  ...react,
  {
    // Rotas do TanStack Router exportam `Route`, e componentes shadcn exportam variantes junto do componente.
    files: ['src/routes/**', 'src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
