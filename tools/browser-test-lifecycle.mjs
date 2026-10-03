// Browser test ownership boundary: use only after the launched browser exited.
// A macOS crashpad descendant can inherit stderr after Chrome itself exits.
// Closing our unused read ends prevents that descendant holding the test alive.
export function releaseExitedBrowserStreams(child) {
  if (!child || (child.exitCode === null && child.signalCode === null)) {
    throw new Error('Cannot release streams of a browser that has not exited');
  }
  for (const stream of child.stdio || []) stream?.destroy();
}
