/* Bound transport and body reads even when a transport ignores abort.
   Without AbortController (older WebKit) the deadline still holds; only the
   underlying request is left to finish on its own. */
export async function deadlineFetch(url, options, timeout = 15000, requestController) {
  const controller = requestController || (typeof AbortController === 'function' ? new AbortController() : null);
  const expires = Date.now() + timeout;
  async function bounded(work) {
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = Object.assign(new Error('request-timeout'), { code: 'request-timeout' });
        reject(error);
        if (controller) controller.abort();
      }, Math.max(0, expires - Date.now()));
    });
    try { return await Promise.race([Promise.resolve().then(work), deadline]); }
    finally { clearTimeout(timer); }
  }
  const response = await bounded(() => fetch(url, controller ? { ...options, signal: controller.signal } : { ...options }));
  const json = response.json.bind(response);
  response.json = () => bounded(json);
  return response;
}
