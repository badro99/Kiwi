import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var nativeShell: KiwiNativeShellCoordinator?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeViewController = CAPBridgeViewController()
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()

        // The embedded workspaces use real text fields (notes, customer search,
        // counts). Let a downward drag dismiss the keyboard progressively, like
        // a native form, instead of trapping the merchant behind a binary Done
        // button supplied by WKWebView.
        bridgeViewController.webView?.scrollView.keyboardDismissMode = .interactive

        let nativeShell = KiwiNativeShellCoordinator()
        nativeShell.attach(to: bridgeViewController)
        self.nativeShell = nativeShell

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
