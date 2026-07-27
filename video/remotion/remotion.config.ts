import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
/* 10 cores on this machine; leave headroom so the box stays usable. */
Config.setConcurrency(8);
Config.setCodec('h264');
Config.setCrf(16);
