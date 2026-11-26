package com.kiwios.printbridge;

/* 1.0.7 · Le service se surveille lui-même.
 *
 * La 1.0.6 borne chaque écriture vers l'imprimante, mais un blocage qu'on n'a
 * pas encore vu (pilote réseau, appel qui ne rend jamais la main) figerait de
 * nouveau tickets et tiroir, comme à Pasta Corner le 26 novembre 2026 (douze
 * minutes). Le tour du service « bat » à chaque relevé et après chaque ticket ;
 * un tour normal, même avec une imprimante en panne, bat en moins de 40 s.
 *
 *   75 s sans battement  → on coupe la prise de l'imprimante (débloque une
 *                          écriture ou une lecture en cours) ;
 *   150 s sans battement → on relance le processus : le service redémarre seul.
 *
 * Classe pure, sans Android, pour être testée sur la JVM
 * (tools/android-bridge-jvm-test.mjs). */
final class LoopWatchdog {
    static final long ABORT_AFTER_MS = 75_000L;
    static final long RESTART_AFTER_MS = 150_000L;

    enum Action { NONE, ABORT_IO, RESTART }

    private long lastBeat;
    private boolean aborted;

    LoopWatchdog(long now) { lastBeat = now; }

    synchronized void beat(long now) {
        lastBeat = now;
        aborted = false;
    }

    synchronized long idleMs(long now) { return Math.max(0, now - lastBeat); }

    synchronized Action check(long now) {
        long idle = now - lastBeat;
        if (idle >= RESTART_AFTER_MS) return Action.RESTART;
        if (idle >= ABORT_AFTER_MS && !aborted) { aborted = true; return Action.ABORT_IO; }
        return Action.NONE;
    }
}
