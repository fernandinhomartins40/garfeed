import { existsSync, readFileSync } from 'node:fs';
import { setOpeningHours, token, USERS } from './api';
import { STATE_FILE } from './global-setup';

export default async function globalTeardown() {
  if (!existsSync(STATE_FILE)) return;
  const { openingHours } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  await setOpeningHours(await token(USERS.owner), openingHours);
}
