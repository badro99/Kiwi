// Test-only loader: mutate one target without rewriting the working tree.
export async function load(url, context, next) {
  const result = await next(url, context);
  if (url === process.env.KIWI_PROVENANCE_TARGET) {
    const source = String(result.source);
    const from = process.env.KIWI_PROVENANCE_FROM;
    if (!from || !source.includes(from)) throw Error('provenance mutation did not match');
    return {...result, source: source.replaceAll(from, process.env.KIWI_PROVENANCE_TO)};
  }
  return result;
}
