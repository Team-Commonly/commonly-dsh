import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

// One process owns a journal for its lifetime. Ambiguous turns/posts stop for review.
export async function openJournal(path, bindingKey) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = await open(`${path}.lock`, 'wx', 0o600);
  try {
    let data;
    try { data = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (data && (data.version !== 1 || data.bindingKey !== bindingKey || !Array.isArray(data.entries))) {
      throw new Error('Commonly journal belongs to another binding or has an unsupported format');
    }
    const records = new Map(data?.entries || []);
    const save = async () => {
      const temp = `${path}.tmp`;
      await open(temp, 'w', 0o600).then(async (file) => {
        try { await file.writeFile(JSON.stringify({ version: 1, bindingKey, entries: [...records] })); await file.sync(); }
        finally { await file.close(); }
      });
      await rename(temp, path);
    };
    return { records, save, close: async () => { await lock.close(); await unlink(`${path}.lock`); } };
  } catch (error) { await lock.close(); await unlink(`${path}.lock`); throw error; }
}
