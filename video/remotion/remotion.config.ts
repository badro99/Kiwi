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
/* The 2-minute film loads eleven photographs on top of the seven faces, and a
 * second session's studio may share the machine — five tabs and a 5-minute
 * ceiling keep the long render out of the timeout class entirely. */
Config.setConcurrency(5);
Config.setDelayRenderTimeoutInMilliseconds(300000);
