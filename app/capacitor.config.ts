import type { CapacitorConfig } from '@capacitor/cli';

/* Kiwi Pro — configuration Capacitor.
 *
 * Décisions (docs/roadmaps/KIWI_APP_PLAN.md §1 et §8.1) :
 *  · une seule app marchande, identifiant `com.kiwios.pro` (l'app consommateur
 *    « Kiwi » prendra `com.kiwios.app`) — irréversible une fois publié (P7/P10) ;
 *  · le web est EMBARQUÉ (`www/`, sortie de tools/build-app-www.mjs), jamais chargé
 *    depuis kiwi-os.com : règle 4.2 d'Apple et caisse hors ligne ;
 *  · CapacitorHttp + CapacitorCookies : fetch/XHR passent par URLSession/OkHttp
 *    et leur pot à cookies natif, donc le cookie de session HttpOnly de
 *    kiwi-os.com est « same-site » vu du natif (§1.4, point 2). */
const config: CapacitorConfig = {
  appId: 'com.kiwios.pro',
  appName: 'Kiwi Pro',
  webDir: 'www',
  // Android : origine https://localhost (et non http://) — cookies Secure et
  // APIs « secure context » disponibles. iOS reste capacitor://localhost.
  server: {
    androidScheme: 'https',
  },
  ios: {
    // La caisse gère elle-même les zones sûres (viewport-fit=cover déjà posé).
    contentInset: 'never',
    // Pas de rebond élastique derrière une caisse : le contenu est une app.
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    // The OS launch screen now hands off to the native SwiftUI/Compose shell,
    // which stays above the WebView until setup or the remembered workspace is
    // ready. Auto-hide must remain enabled: otherwise the system splash masks
    // that native shell and can strand the merchant on the launch artwork.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 350,
      launchFadeOutDuration: 120,
      backgroundColor: '#0A0F0D',
      showSpinner: false,
    },
  },
};

export default config;
