import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setCrf(16);

/* 10 cores here. 8 tabs each decoding seven woff2 faces while compositing
 * full-frame blur starved the font load past the 28s default and killed the
 * render with "delayRender was called but not cleared" — the fonts were fine,
 * they were queued behind the compositor. Six tabs plus a generous ceiling
 * costs a little wall-clock and removes the whole class of failure. */
Config.setConcurrency(6);
Config.setDelayRenderTimeoutInMilliseconds(120000);
