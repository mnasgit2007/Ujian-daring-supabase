// Reads the password locally; never sends it to a service or prints it.
import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

async function main() {
  const secret = process.env.APP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Isi APP_HASH_SECRET (minimal 32 karakter) pada .env.local dahulu.');
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
  process.stdout.write('Kata sandi admin baru (minimal 12 karakter, tidak ditampilkan): ');
  const password = await rl.question('');
  rl.close();
  process.stdout.write('\n');
  if (password.length < 12) throw new Error('Kata sandi admin minimal 12 karakter.');
  if (password !== password.trim()) throw new Error('Kata sandi tidak boleh diawali/diakhiri spasi.');
  const hash = crypto.createHash('sha256').update(secret + '|ADMIN:' + password, 'utf8').digest('hex');
  console.log('APP_ADMIN_HASH=' + hash);
}
main().catch(error => { console.error('Gagal:', error.message); process.exitCode = 1; });
