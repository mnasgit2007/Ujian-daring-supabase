import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssignmentFiles, validateUploads, MAX_UPLOAD_BYTES } from '../api/_lib/learning-files.js';
import { downloadPrivateFile, validateImagePath, imageMime } from '../api/_lib/storage.js';
import { normalizeQuestionInput } from '../api/_lib/exam.js';

function fixture() {
  const objects = new Map();
  const state = { public: false, requests: 0 };
  const client = { storage: {
    async getBucket(id) { return { data: { id, public: state.public } }; },
    from(bucket) {
      assert.equal(bucket, 'assignment-submissions');
      return {
        async upload(id, bytes, options) { state.requests++; assert.equal(options.upsert, false); objects.set(id, new Blob([bytes])); return { data: { path: id } }; },
        async download(id) { state.requests++; return objects.has(id) ? { data: objects.get(id) } : { error: { code: '404' } }; },
        async remove(ids) { ids.forEach(id => objects.delete(id)); return { data: ids }; }
      };
    }
  } };
  return { objects, state, client, files: createAssignmentFiles(() => client) };
}
const upload = { name: 'jawaban.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4\nexample').toString('base64') };

test('assignment Storage adapter uploads and downloads exact validated bytes with opaque object paths', async () => {
  const { files, objects } = fixture();
  await files.checkFolder();
  const file = await files.put(validateUploads([upload])[0], 'submit-123');
  assert.match(file.id, /^submit-123\/[a-f0-9-]+\.pdf$/);
  assert.deepEqual(await files.get(file), upload);
  await files.remove(file.id);
  assert.equal(objects.size, 0);
});

test('a public bucket blocks both upload and download before object access', async () => {
  const { files, state } = fixture();
  const file = await files.put(validateUploads([upload])[0], 'submit-123');
  state.public = true; state.requests = 0;
  await assert.rejects(files.put(validateUploads([upload])[0], 'submit-123'), /privat/);
  await assert.rejects(files.get(file), /privat/);
  assert.equal(state.requests, 0);
});

test('Storage downloads reject altered metadata, oversized data, invalid signatures and traversal', async () => {
  const { files, objects, client } = fixture();
  const file = await files.put(validateUploads([upload])[0], 'submit-123');
  await assert.rejects(files.get({ ...file, size: file.size + 1 }), /Ukuran/);
  await assert.rejects(files.get({ ...file, id: '../secret.pdf' }), /valid/);
  objects.set(file.id, new Blob([Buffer.alloc(MAX_UPLOAD_BYTES + 1)]));
  await assert.rejects(downloadPrivateFile(client, 'assignment-submissions', file.id, MAX_UPLOAD_BYTES), /batas/);
  objects.set(file.id, new Blob([Buffer.alloc(file.size)]));
  await assert.rejects(files.get(file), /format/);
});

test('exam images accept object paths, validate magic bytes and reject Drive IDs or URLs', () => {
  assert.equal(validateImagePath('P01/gambar-1.jpg'), 'P01/gambar-1.jpg');
  for (const path of ['../secret.jpg', 'a//b.jpg', 'https://example.org/a.jpg', 'drive-file-id', 'a.svg']) assert.throws(() => validateImagePath(path), /Path/);
  assert.equal(imageMime(Buffer.from([255,216,255,0])), 'image/jpeg');
  assert.throws(() => imageMime(Buffer.from('<html>')), /valid/);
  assert.throws(() => normalizeQuestionInput({ examId:'P01', questionId:'Q1', text:'Question', a:'A', b:'B', c:'C', d:'D', key:'A', weight:1, fileId:'old-drive-id' }), /Path/);
});
