import { z } from 'zod';

// Mensagens de validação padrão do Zod em português (API, painel e cardápio).
z.config(z.locales.pt());

export * from './enums';
export * from './money';
export * from './tag-code';
export * from './schemas';
export * from './contract';
export * from './socket';
