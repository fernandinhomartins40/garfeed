// O seed só abre ter–dom 11–15h e 18–23h: os testes rodam com "sempre aberto" e o teardown devolve o horário original.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeTable, getSettings, setOpeningHours, setSoldOut, token, USERS } from './api';

export const STATE_FILE = join(tmpdir(), 'garfeed-e2e-opening-hours.json');

export default async function globalSetup() {
  const owner = await token(USERS.owner);
  const { openingHours } = await getSettings(owner);
  writeFileSync(STATE_FILE, JSON.stringify({ openingHours }));
  await setOpeningHours(owner, null);
  await closeTable(owner, 'Mesa 7');
  await setSoldOut(owner, 'Batata Rústica com Bacon', false);
}
