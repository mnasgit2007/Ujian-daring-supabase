import { handler, authSiswa, norm } from './_lib/auth.js';
import { getQuestions, attemptForImage, MAX_GAMBAR } from './_lib/exam.js';
import { SHEETS, preload, nowMs } from './_lib/store.js';

import { supabaseAdmin } from './_lib/supabase.js';
import { validateImagePath, imageMime, downloadPrivateFile } from './_lib/storage.js';

// Gambar soal praktis tidak pernah berubah selama ujian berlangsung, sedangkan
// satu gambar bisa diminta oleh 35 siswa. Salinannya disimpan sebentar di
// memori instance supaya Storage tidak diunduh berulang kali. Batasnya kecil
// (12 × maks 220 KB) agar aman untuk memori fungsi Vercel.
const IMAGE_CACHE_MS = 10 * 60 * 1000;
const IMAGE_CACHE_MAX = 12;
const imageCache = new Map();

function cachedImage(fileId) {
  const hit = imageCache.get(fileId);
  if (!hit) return null;
  if (Date.now() - hit.at > IMAGE_CACHE_MS) { imageCache.delete(fileId); return null; }
  return hit.dataUrl;
}

function cacheImage(fileId, dataUrl) {
  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
  imageCache.set(fileId, { dataUrl, at: Date.now() });
}

export default handler(async (body) => {
  const studentId = authSiswa(body.token);
  const examId = norm(body.examId);
  const questionId = norm(body.questionId);

  // Preload sesi dan soal untuk pemeriksaan izin gambar.
  await preload([SHEETS.SESI, SHEETS.SOAL]);

  const a = await attemptForImage(studentId, examId);
  if (!a || a.status !== 'SEDANG' || nowMs() > a.deadline) throw new Error('Akses gambar ujian sudah berakhir.');

  const questions = await getQuestions(examId);
  const q = questions.find(x => x.id === questionId);
  if (!q || !q.fileId) throw new Error('Gambar tidak ada.');
  validateImagePath(q.fileId);

  const cached = cachedImage(q.fileId);
  if (cached) return { dataUrl: cached };

  const buf = await downloadPrivateFile(supabaseAdmin(), 'exam-images', q.fileId, MAX_GAMBAR);
  const mime = imageMime(buf);

  const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
  cacheImage(q.fileId, dataUrl);
  return { dataUrl };
});
