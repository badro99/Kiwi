import UIKit
import Capacitor

final class KiwiBridgeViewController: CAPBridgeViewController {
    var safeAreaInsetsDidChange: ((UIEdgeInsets) -> Void)?
    private var publishedSafeAreaInsets = UIEdgeInsets.zero

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let insets = view.safeAreaInsets
        guard insets != publishedSafeAreaInsets else { return }
        publishedSafeAreaInsets = insets
        safeAreaInsetsDidChange?(insets)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var nativeShell: KiwiNativeShellCoordinator?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeViewController = KiwiBridgeViewController()
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()

        // The embedded workspaces use real text fields (notes, customer search,
        // counts). Let a downward drag dismiss the keyboard progressively, like
        // a native form, instead of trapping the merchant behind a binary Done
        // button supplied by WKWebView.
        bridgeViewController.webView?.scrollView.keyboardDismissMode = .interactive

        let nativeShell = KiwiNativeShellCoordinator()
        bridgeViewController.safeAreaInsetsDidChange = { [weak nativeShell] in nativeShell?.updateSafeAreaInsets($0) }
        nativeShell.attach(to: bridgeViewController)
        nativeShell.updateSafeAreaInsets(bridgeViewController.view.safeAreaInsets)
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
