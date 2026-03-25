import { deflateSync } from 'node:zlib';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';

const SIZE = 400;

function generatePng(): Buffer {
  const r = 74, g = 134, b = 232; // friendly blue
  const rowBytes = 1 + SIZE * 3;
  const raw = Buffer.alloc(SIZE * rowBytes);
  for (let y = 0; y < SIZE; y++) {
    const offset = y * rowBytes;
    raw[offset] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      const px = offset + 1 + x * 3;
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b;
    }
  }
  const compressed = deflateSync(raw);

  const chunks: Buffer[] = [];
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  chunks.push(sig);

  function writeChunk(type: string, data: Buffer): void {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeB, data]);
    const crc = crc32(crcInput);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0);
    chunks.push(len, typeB, data, crcB);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeChunk('IHDR', ihdr);
  writeChunk('IDAT', compressed);
  writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat(chunks);
}

function crc32(buf: Buffer): number {
  let table: number[] | undefined;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

let cachedPng: Buffer | null = null;

export async function uploadPhoto(
  client: ApiClient,
  ctx: ProviderContext
): Promise<void> {
  if (!cachedPng) cachedPng = generatePng();
  const blob = new globalThis.Blob([cachedPng as unknown as BlobPart], { type: 'image/png' });

  const formData = new FormData();
  formData.append('formPhoto', blob, 'profile-photo.png');

  const result = await client.restPostMultipartSpi(
    'photo/upload',
    ctx.authToken,
    formData
  );

  if (result?.statusCode === 200) {
    console.log('  ✓ Profile photo uploaded');
  } else {
    console.warn('  ⚠ Photo upload response:', JSON.stringify(result).slice(0, 300));
  }
}
