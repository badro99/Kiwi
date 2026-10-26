/* Bound transport and body reads even when a transport ignores abort. */
export async function deadlineFetch(url, options, timeout = 15000) {
  const controller = new AbortController();
  const expires = Date.now() + timeout;
  async function bounded(work) {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = Object.assign(new Error('request-timeout'), { code: 'request-timeout' });
        reject(error);
        controller.abort();
      }, Math.max(0, expires - Date.now()));
    });
    try { return await Promise.race([Promise.resolve().then(work), deadline]); }
    finally { clearTimeout(timer); }
  }
  const response = await bounded(() => fetch(url, { ...options, signal: controller.signal }));
  const json = response.json.bind(response);
  response.json = () => bounded(json);
  return response;
}
