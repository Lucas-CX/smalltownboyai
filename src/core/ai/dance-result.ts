function resultUrl(value: string) {
  const url = new URL(value);
  // Provider-controlled delivery hosts only. Never follow redirects to arbitrary/private addresses.
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    ![
      'tempfile.aiquickdraw.com',
      'tempfile.redpandaai.co',
      'tempfile.redpandaai.co.cn',
    ].includes(url.hostname)
  )
    throw new Error('Unapproved result host');
  return url;
}

export async function downloadDanceResultStream(
  value: string,
  timeoutMs = 120000
) {
  const response = await fetch(resultUrl(value), {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error('Result download failed');
  const byteLength = Number(response.headers.get('content-length'));
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 8 ||
    byteLength > 256 * 1024 * 1024
  ) {
    await response.body.cancel();
    throw new Error('Invalid result size');
  }
  const reader = response.body.getReader();
  const prefix: Uint8Array[] = [];
  const header = new Uint8Array(8);
  let headerLength = 0;
  let size = 0;
  try {
    while (headerLength < 8) {
      const item = await reader.read();
      if (item.done) throw new Error('Invalid MP4 result');
      size += item.value.length;
      if (size > byteLength) throw new Error('Invalid result size');
      const part = item.value.subarray(0, 8 - headerLength);
      header.set(part, headerLength);
      headerLength += part.length;
      prefix.push(item.value);
    }
    if (new TextDecoder().decode(header.subarray(4, 8)) !== 'ftyp')
      throw new Error('Invalid MP4 result');
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (prefix.length) {
          controller.enqueue(prefix.shift()!);
          return;
        }
        const item = await reader.read();
        if (item.done) {
          if (size !== byteLength) throw new Error('Truncated MP4 result');
          controller.close();
          return;
        }
        size += item.value.length;
        if (size > byteLength) throw new Error('Invalid result size');
        controller.enqueue(item.value);
      } catch (error) {
        await reader.cancel().catch(() => {});
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { body, byteLength };
}

export async function downloadDanceResult(value: string, timeoutMs = 120000) {
  const url = resultUrl(value);
  const response = await fetch(url, {
    // Workers supports manual/follow; reject 3xx via response.ok below.
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error('Result download failed');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.length;
    // Workers have a bounded memory budget; chunks and the final buffer coexist.
    if (size > 32 * 1024 * 1024) {
      await reader.cancel();
      throw new Error('Result too large');
    }
    chunks.push(item.value);
  }
  const result = Buffer.concat(chunks);
  if (result.subarray(4, 8).toString() !== 'ftyp')
    throw new Error('Invalid MP4 result');
  return result;
}
