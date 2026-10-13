import Capacitor
import SafariServices
import SwiftUI
import UIKit
import UserNotifications
import WebKit

private let kiwiLaunchGround = Color(red: 10 / 255, green: 22 / 255, blue: 18 / 255)
private let kiwiInk = Color(red: 10 / 255, green: 15 / 255, blue: 13 / 255)
private let kiwiMint = Color(red: 125 / 255, green: 242 / 255, blue: 176 / 255)
private let kiwiPaper = Color(red: 247 / 255, green: 245 / 255, blue: 240 / 255)
private let kiwiAtlas = Color(red: 11 / 255, green: 110 / 255, blue: 79 / 255)

extension Notification.Name {
    /// Posted by AppDelegate with userInfo["token"] (hex) on success, or an empty userInfo on failure.
    static let kiwiPushToken = Notification.Name("kiwi.push.token")
}

// JSON is already a JavaScript expression. Keep its UTF-8 intact: atob() yields
// byte-valued characters, not Unicode, and used to corrupt non-ASCII passwords.
func kiwiNativeActionScript(_ payload: [String: String]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let json = String(data: data, encoding: .utf8) else { return nil }
    return "window.KiwiNativeHostAction&&window.KiwiNativeHostAction(\(json))"
}

private struct KiwiHostField: Codable, Identifiable {
    let id: String
    let label: String
    let value: String
    let input: String
    let secure: Bool
}

private struct KiwiHostChoice: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let selected: Bool
    let group: String
}

private struct KiwiHostAction: Codable, Identifiable {
    let id: String
    let label: String
    let style: String
    let enabled: Bool
}

private struct KiwiHostSummary: Codable, Identifiable {
    var id: String { label }
    let label: String
    let value: String
    let muted: Bool
}

private struct KiwiHostTab: Codable, Identifiable {
    let id: String
    let label: String
}

private struct KiwiHostContext: Codable {
    var version = 1
    var screen = "launch"
    var locale = "fr"
    var rtl = false
    var kind = "account"
    var progress = 0
    var progressTotal = 0
    var eyebrow = ""
    var title = ""
    var message = ""
    var status = ""
    var statusKind = ""
    var accountLabel = ""
    var role = ""
    var selected = ""
    var fields: [KiwiHostField] = []
    var choices: [KiwiHostChoice] = []
    var summary: [KiwiHostSummary] = []
    var actions: [KiwiHostAction] = []
    var tabs: [KiwiHostTab] = []
    /// Width (pt) of a panel docked at the trailing edge (the till's bill on an
    /// upright iPad). The capsule centres over what is left, not the screen.
    var trailingInset: Double = 0

    private enum CodingKeys: String, CodingKey {
        case version, screen, locale, rtl, kind, progress, progressTotal, eyebrow, title, message
        case status, statusKind, accountLabel, role, selected, fields, choices, summary, actions, tabs, trailingInset
    }

    init() {}

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
        screen = try values.decodeIfPresent(String.self, forKey: .screen) ?? "launch"
        locale = try values.decodeIfPresent(String.self, forKey: .locale) ?? "fr"
        rtl = try values.decodeIfPresent(Bool.self, forKey: .rtl) ?? false
        kind = try values.decodeIfPresent(String.self, forKey: .kind) ?? "account"
        progress = try values.decodeIfPresent(Int.self, forKey: .progress) ?? 0
        progressTotal = try values.decodeIfPresent(Int.self, forKey: .progressTotal) ?? 0
        eyebrow = try values.decodeIfPresent(String.self, forKey: .eyebrow) ?? ""
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
        message = try values.decodeIfPresent(String.self, forKey: .message) ?? ""
        status = try values.decodeIfPresent(String.self, forKey: .status) ?? ""
        statusKind = try values.decodeIfPresent(String.self, forKey: .statusKind) ?? ""
        accountLabel = try values.decodeIfPresent(String.self, forKey: .accountLabel) ?? ""
        role = try values.decodeIfPresent(String.self, forKey: .role) ?? ""
        selected = try values.decodeIfPresent(String.self, forKey: .selected) ?? ""
        fields = try values.decodeIfPresent([KiwiHostField].self, forKey: .fields) ?? []
        choices = try values.decodeIfPresent([KiwiHostChoice].self, forKey: .choices) ?? []
        summary = try values.decodeIfPresent([KiwiHostSummary].self, forKey: .summary) ?? []
        actions = try values.decodeIfPresent([KiwiHostAction].self, forKey: .actions) ?? []
        tabs = try values.decodeIfPresent([KiwiHostTab].self, forKey: .tabs) ?? []
        trailingInset = max(0, try values.decodeIfPresent(Double.self, forKey: .trailingInset) ?? 0)
    }
}

private final class KiwiNativeShellModel: ObservableObject {
    @Published var context = KiwiHostContext()
    @Published var revision = 0
    weak var bridge: CAPBridgeViewController?
    var didChangeLayout: ((KiwiHostContext) -> Void)?
    private var lastContextData: Data?

    func accept(_ value: Any) {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let next = try? JSONDecoder().decode(KiwiHostContext.self, from: data) else { return }
        DispatchQueue.main.async {
            guard data != self.lastContextData else { return }
            self.lastContextData = data
            self.context = next
            self.revision += 1
            self.didChangeLayout?(next)
        }
    }

    /// The setup flow's way back, if the current step has one.
    var backAction: KiwiHostAction? {
        context.actions.first { ($0.id == "back" || $0.id == "manual-return") && $0.enabled }
    }

    func send(_ action: String, id: String = "", values: [String: String] = [:]) {
        var payload = values
        payload["action"] = action
        if !id.isEmpty { payload["id"] = id }
        guard let script = kiwiNativeActionScript(payload) else { return }
        // No haptic here: the page decides the class of what the action does
        // (a tab change plays Choose once through KiwiHaptics, a sheet answer
        // plays the class of the act it confirms, or nothing).
        bridge?.webView?.evaluateJavaScript(script, completionHandler: nil)
    }
}

final class KiwiNativeShellCoordinator: NSObject, WKScriptMessageHandler {
    private static let tabContentHeight: CGFloat = 72
    private let model = KiwiNativeShellModel()
    private var setupHost: UIHostingController<KiwiNativeSetupRoot>?
    private var tabHost: UIHostingController<KiwiNativeTabRoot>?
    private var tabHeightConstraint: NSLayoutConstraint?
    private var tabWidthConstraint: NSLayoutConstraint?
    private var tabCenterConstraint: NSLayoutConstraint?
    private var safeAreaInsets = UIEdgeInsets.zero
    private var uiDelegate: KiwiDialogDelegate?
    private var edgeBack: UIScreenEdgePanGestureRecognizer?

    func attach(to bridge: CAPBridgeViewController) {
        model.bridge = bridge
        bridge.loadViewIfNeeded()
        bridge.webView?.configuration.userContentController.add(self, name: "kiwiShell")
        // A long press on a link is a Safari gesture, not a till one.
        bridge.webView?.allowsLinkPreview = false
        // confirm()/alert()/prompt() in the merchant's language, not Capacitor's English.
        if let webView = bridge.webView {
            let dialogs = KiwiDialogDelegate(fallback: webView.uiDelegate) { [weak self] in self?.model.context.locale ?? "fr" }
            webView.uiDelegate = dialogs
            uiDelegate = dialogs
        }

        let setup = UIHostingController(rootView: KiwiNativeSetupRoot(model: model))
        setup.view.translatesAutoresizingMaskIntoConstraints = false
        setup.view.backgroundColor = .clear
        bridge.addChild(setup)
        bridge.view.addSubview(setup.view)
        NSLayoutConstraint.activate([
            setup.view.leadingAnchor.constraint(equalTo: bridge.view.leadingAnchor),
            setup.view.trailingAnchor.constraint(equalTo: bridge.view.trailingAnchor),
            setup.view.topAnchor.constraint(equalTo: bridge.view.topAnchor),
            setup.view.bottomAnchor.constraint(equalTo: bridge.view.bottomAnchor)
        ])
        setup.didMove(toParent: bridge)
        setupHost = setup
        // Setup steps are a stack; the edge swipe goes back a step, like every
        // iOS navigation. Recognised by UIKit, it cancels the row under the thumb.
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwipe(_:)))
        edge.edges = .left
        setup.view.addGestureRecognizer(edge)
        edgeBack = edge

        let tabs = UIHostingController(rootView: KiwiNativeTabRoot(model: model))
        tabs.view.translatesAutoresizingMaskIntoConstraints = false
        tabs.view.backgroundColor = .clear
        bridge.addChild(tabs)
        bridge.view.addSubview(tabs.view)
        let tabHeightConstraint = tabs.view.heightAnchor.constraint(equalToConstant: Self.tabContentHeight)
        let tabWidthConstraint = tabs.view.widthAnchor.constraint(equalToConstant: 350)
        tabWidthConstraint.priority = .defaultHigh
        let tabCenterConstraint = tabs.view.centerXAnchor.constraint(equalTo: bridge.view.centerXAnchor)
        self.tabCenterConstraint = tabCenterConstraint
        NSLayoutConstraint.activate([
            tabCenterConstraint,
            tabs.view.leadingAnchor.constraint(greaterThanOrEqualTo: bridge.view.leadingAnchor, constant: 12),
            tabs.view.trailingAnchor.constraint(lessThanOrEqualTo: bridge.view.trailingAnchor, constant: -12),
            tabWidthConstraint,
            tabs.view.bottomAnchor.constraint(equalTo: bridge.view.bottomAnchor),
            tabHeightConstraint
        ])
        tabs.didMove(toParent: bridge)
        tabHost = tabs
        self.tabHeightConstraint = tabHeightConstraint
        self.tabWidthConstraint = tabWidthConstraint

        NotificationCenter.default.addObserver(self, selector: #selector(pushTokenArrived(_:)), name: .kiwiPushToken, object: nil)

        model.didChangeLayout = { [weak self] context in self?.apply(context) }
        apply(model.context)
        requestState()
        #if DEBUG
        // Simulator check of the native sheet without signing in:
        // xcrun simctl launch <device> com.kiwios.pro -KiwiSheetDemo dark|light
        if let mode = UserDefaults.standard.string(forKey: "KiwiSheetDemo") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
                self?.presentNativeSheet(["id": "demo", "title": "Open Kiwi with Face ID?", "message": "Next time, a glance is enough. Your code always works too.",
                                          "icon": "faceid", "dark": mode == "dark",
                                          "actions": [["id": "enable", "label": "Use Face ID", "style": "primary"], ["id": "later", "label": "Later", "style": "plain"]]])
            }
        }
        #endif
    }

    func updateSafeAreaInsets(_ insets: UIEdgeInsets) {
        guard insets != safeAreaInsets else { return }
        safeAreaInsets = insets
        tabHeightConstraint?.constant = Self.tabContentHeight + insets.bottom
        publishSafeAreaInsets()
    }

    private func apply(_ context: KiwiHostContext) {
        // One slot per tab; the ≥12pt side margins still win on narrow phones.
        tabWidthConstraint?.constant = CGFloat(max(context.tabs.count, 1)) * 74 + 12
        tabCenterConstraint?.constant = CGFloat(context.trailingInset / 2) * (context.rtl ? 1 : -1)
        edgeBack?.edges = context.rtl ? .right : .left
        setupHost?.view.isHidden = context.screen == "workspace"
        tabHost?.view.isHidden = context.screen != "workspace" || context.tabs.isEmpty || (model.bridge?.view.bounds.width ?? 0) > 900
        if let setupView = setupHost?.view, !setupView.isHidden { setupView.superview?.bringSubviewToFront(setupView) }
        if let tabView = tabHost?.view, !tabView.isHidden { tabView.superview?.bringSubviewToFront(tabView) }
        publishSafeAreaInsets()
    }

    private func publishSafeAreaInsets() {
        let values = [safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left]
            .map { String(format: "%.2f", Double($0)) + "px" }
        let tabHeight = tabHost?.view.isHidden == false ? Self.tabContentHeight + safeAreaInsets.bottom : 0
        bridgeEvaluate("document.documentElement.style.setProperty('--kiwi-host-safe-top','\(values[0])');document.documentElement.style.setProperty('--kiwi-host-safe-right','\(values[1])');document.documentElement.style.setProperty('--kiwi-host-safe-bottom','\(values[2])');document.documentElement.style.setProperty('--kiwi-host-safe-left','\(values[3])');document.documentElement.style.setProperty('--kiwi-host-tab-height','\(String(format: "%.2f", Double(tabHeight)))px')")
    }

    @objc private func edgeSwipe(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, let view = gesture.view, !view.isHidden,
              let back = model.backAction else { return }
        let travel = gesture.translation(in: view).x * (model.context.rtl ? -1 : 1)
        let speed = gesture.velocity(in: view).x * (model.context.rtl ? -1 : 1)
        guard travel > 60 || speed > 500 else { return }
        model.send(back.id)
    }

    private func requestState() {
        bridgeEvaluate("window.KiwiNativeHostRequestState&&window.KiwiNativeHostRequestState()")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in self?.bridgeEvaluate("window.KiwiNativeHostRequestState&&window.KiwiNativeHostRequestState()") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.bridgeEvaluate("window.KiwiNativeHostRequestState&&window.KiwiNativeHostRequestState()") }
    }

    private func bridgeEvaluate(_ script: String) {
        model.bridge?.webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == "kiwiShell", message.frameInfo.isMainFrame,
              origin.host == "localhost", origin.protocol == "capacitor" else { return }
        if let body = message.body as? [String: Any], let raw = body["openURL"] as? String {
            presentSafariSheet(raw)
            return
        }
        if let body = message.body as? [String: Any], let push = body["push"] as? String {
            handlePush(push)
            return
        }
        if let body = message.body as? [String: Any], let sheet = body["sheet"] {
            presentNativeSheet(sheet)
            return
        }
        model.accept(message.body)
    }

    // MARK: Le point du matin (notifications push)

    /// True only between the owner turning the toggle on and the token (or the
    /// failure) coming back, so a token is never pushed to the page unasked.
    private var awaitingPushToken = false

    /// `status` reports the system permission without prompting. `enable` asks
    /// for permission (first time only), then registers with APNs. Nothing here
    /// runs until the page asks, and the page asks only from the owner's toggle.
    private func handlePush(_ action: String) {
        let center = UNUserNotificationCenter.current()
        switch action {
        case "status":
            center.getNotificationSettings { [weak self] settings in
                let status: String
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral: status = "authorized"
                case .denied: status = "denied"
                default: status = "notDetermined"
                }
                self?.pushResult(["kind": "status", "ok": true, "status": status])
            }
        case "enable":
            center.requestAuthorization(options: [.alert, .sound]) { [weak self] granted, _ in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if granted {
                        self.awaitingPushToken = true
                        UIApplication.shared.registerForRemoteNotifications()
                    } else {
                        self.pushResult(["kind": "enable", "ok": false, "reason": "denied"])
                    }
                }
            }
        default:
            break
        }
    }

    @objc private func pushTokenArrived(_ note: Notification) {
        guard awaitingPushToken else { return }
        awaitingPushToken = false
        if let token = note.userInfo?["token"] as? String, !token.isEmpty {
            pushResult(["kind": "enable", "ok": true, "token": token])
        } else {
            pushResult(["kind": "enable", "ok": false, "reason": "register-failed"])
        }
    }

    private func pushResult(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.bridgeEvaluate("window.KiwiNativePushResult&&window.KiwiNativePushResult(\(json))")
        }
    }

    private var sheetDelegate: KiwiSheetDelegate?

    /// A system sheet for a short choice (Face ID offer, account menu): real
    /// detent, grabber, dimming and swipe to dismiss, Liquid Glass on iOS 26.
    /// The page gets one answer back through window.KiwiNativeSheetResult:
    /// the chosen action id, or "dismiss" when the sheet is swiped away.
    private func presentNativeSheet(_ raw: Any) {
        guard JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let spec = try? JSONDecoder().decode(KiwiSheetSpec.self, from: data) else { return }
        DispatchQueue.main.async {
            guard let presenter = self.model.bridge else { return }
            guard presenter.presentedViewController == nil else { self.answerSheet(spec.id, "dismiss"); return }
            var host: UIHostingController<KiwiSheetView>?
            let view = KiwiSheetView(spec: spec) { [weak self] action in
                guard let self else { return }
                self.sheetDelegate?.answered = true
                host?.dismiss(animated: true)
                host = nil
                self.answerSheet(spec.id, action)
            }
            let controller = UIHostingController(rootView: view)
            host = controller
            controller.view.backgroundColor = .clear
            controller.overrideUserInterfaceStyle = spec.dark ? .dark : .light
            controller.view.semanticContentAttribute = spec.rtl ? .forceRightToLeft : .forceLeftToRight
            let width = presenter.view.bounds.width
            let fitted = controller.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
            if let sheet = controller.sheetPresentationController {
                if #available(iOS 16.0, *) {
                    sheet.detents = [.custom(identifier: .init("kiwi-fit")) { context in min(fitted, context.maximumDetentValue) }]
                } else {
                    sheet.detents = [.medium()]
                }
                sheet.prefersGrabberVisible = true
                sheet.prefersEdgeAttachedInCompactHeight = true
            }
            let delegate = KiwiSheetDelegate { [weak self] in self?.answerSheet(spec.id, "dismiss") }
            self.sheetDelegate = delegate
            controller.presentationController?.delegate = delegate
            // No Warning here: presenting a sheet never buzzes. The page plays
            // Caution through KiwiHaptics before it asks for a sheet that
            // confirms a destructive act, so the class is the same whether the
            // sheet is drawn by the web or by this host.
            presenter.present(controller, animated: true)
        }
    }

    private func answerSheet(_ id: String, _ action: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "action": action]),
              let json = String(data: data, encoding: .utf8) else { return }
        bridgeEvaluate("window.KiwiNativeSheetResult&&window.KiwiNativeSheetResult(\(json))")
    }

    /// Kiwi's own help pages (forgot password, support) open in an in-app
    /// Safari sheet. Only https kiwi-os.com links are accepted.
    private func presentSafariSheet(_ raw: String) {
        guard let url = URL(string: raw), url.scheme == "https",
              let host = url.host, host == "kiwi-os.com" || host.hasSuffix(".kiwi-os.com") else { return }
        DispatchQueue.main.async {
            guard let presenter = self.model.bridge, presenter.presentedViewController == nil else { return }
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(red: 11 / 255, green: 110 / 255, blue: 79 / 255, alpha: 1)
            safari.dismissButtonStyle = .close
            presenter.present(safari, animated: true)
        }
    }
}

private struct KiwiSheetAction: Codable, Identifiable {
    let id: String
    let label: String
    /// "primary" (filled), "destructive" (red), anything else plain.
    let style: String
}

private struct KiwiSheetSpec: Codable {
    var id = ""
    var title = ""
    var message = ""
    /// An SF Symbol name for the icon above the title, or empty.
    var icon = ""
    var dark = false
    var rtl = false
    var actions: [KiwiSheetAction] = []

    private enum CodingKeys: String, CodingKey { case id, title, message, icon, dark, rtl, actions }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decodeIfPresent(String.self, forKey: .id) ?? ""
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
        message = try values.decodeIfPresent(String.self, forKey: .message) ?? ""
        icon = try values.decodeIfPresent(String.self, forKey: .icon) ?? ""
        dark = try values.decodeIfPresent(Bool.self, forKey: .dark) ?? false
        rtl = try values.decodeIfPresent(Bool.self, forKey: .rtl) ?? false
        actions = try values.decodeIfPresent([KiwiSheetAction].self, forKey: .actions) ?? []
    }
}

private final class KiwiSheetDelegate: NSObject, UIAdaptivePresentationControllerDelegate {
    var answered = false
    private let onDismiss: () -> Void
    init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        if !answered { onDismiss() }
    }
}

private struct KiwiSheetView: View {
    let spec: KiwiSheetSpec
    let onAction: (String) -> Void
    @Environment(\.colorScheme) private var scheme

    private var accent: Color { scheme == .dark ? kiwiMint : kiwiAtlas }
    private var danger: Color { scheme == .dark ? Color(red: 1, green: 0.55, blue: 0.48) : Color(red: 0.62, green: 0.19, blue: 0.16) }

    var body: some View {
        VStack(spacing: 0) {
            if !spec.icon.isEmpty {
                Image(systemName: spec.icon)
                    .font(.system(size: 30, weight: .regular))
                    .foregroundStyle(accent)
                    .frame(width: 64, height: 64)
                    .background(accent.opacity(0.12), in: Circle())
                    .padding(.bottom, 16)
                    .accessibilityHidden(true)
            }
            if !spec.title.isEmpty {
                Text(spec.title).font(.title3.weight(.semibold)).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
            if !spec.message.isEmpty {
                Text(spec.message).font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            }
            VStack(spacing: 8) {
                ForEach(spec.actions) { action in
                    Button { onAction(action.id) } label: {
                        Text(action.label).font(.headline).multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 18).padding(.vertical, 12)
                            .frame(maxWidth: .infinity).frame(minHeight: action.style == "primary" ? 54 : 48)
                            .foregroundStyle(action.style == "primary" ? (scheme == .dark ? kiwiInk : kiwiPaper) : (action.style == "destructive" ? danger : Color.primary))
                            .background(action.style == "primary" ? accent : Color.primary.opacity(0.06), in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(KiwiPressStyle())
                    .accessibilityIdentifier("kiwi-sheet-\(action.id)")
                }
            }
            .padding(.top, spec.title.isEmpty && spec.message.isEmpty ? 0 : 24)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 12)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .environment(\.layoutDirection, spec.rtl ? .rightToLeft : .leftToRight)
    }
}

private struct KiwiMark: View {
    var size: CGFloat = 132

    var body: some View {
        Image("KiwiBrandIcon")
            .resizable()
            .interpolation(.high)
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .clipped() // Match the unmasked LaunchScreen asset, including its corners.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Kiwi Pro")
    }
}

private extension View {
    @ViewBuilder func scrollDismissesKeyboardIfAvailable() -> some View {
        if #available(iOS 16.0, *) { self.scrollDismissesKeyboard(.interactively) } else { self }
    }
}

/// Fades a block in (with an 8 pt rise unless Reduce Motion is on). The mark
/// never uses it: it is already where the launch screen drew it.
private struct KiwiArrive: ViewModifier {
    let shown: Bool
    let rise: Bool
    func body(content: Content) -> some View {
        content.opacity(shown ? 1 : 0).offset(y: shown || !rise ? 0 : 8)
    }
}

private struct KiwiPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.28, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

private struct KiwiNativeSetupRoot: View {
    @ObservedObject var model: KiwiNativeShellModel
    @State private var email = ""
    @State private var password = ""
    @State private var host = ""
    @State private var port = "9100"
    @State private var paper = "80"
    @State private var passwordVisible = false
    @FocusState private var focusedField: String?
    @AccessibilityFocusState private var headingFocused: Bool
    @ScaledMetric(relativeTo: .largeTitle) private var titleSize = 32
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var contentShown = false
    /// The row just tapped while the next screen loads (1 to 2 s on a till):
    /// it shows progress instead of looking dead, and no second row can fire.
    @State private var pendingChoice: String?

    var body: some View {
        ZStack {
            kiwiLaunchGround.ignoresSafeArea()
            // Both branches draw the mark where LaunchScreen.storyboard does, so
            // the swap is invisible; only the text and controls fade in (setup).
            if model.context.screen == "launch" {
                VStack { KiwiMark(size: 88); Spacer(minLength: 0) }
                    .frame(maxWidth: .infinity).padding(.top, 20)
            } else {
                setup
            }
        }
        .environment(\.layoutDirection, model.context.rtl ? .rightToLeft : .leftToRight)
        .onReceive(model.$revision) { _ in hydrateFields() }
        .onChange(of: model.context.kind) { _ in
            focusedField = nil
            passwordVisible = false
            password = ""
            pendingChoice = nil
            headingFocused = true
        }
        .onChange(of: model.revision) { _ in
            // A new context that still lists the tapped row as unselected means
            // the tap was answered without leaving (an error, a toggle).
            if let pending = pendingChoice, model.context.choices.contains(where: { $0.id == pending && !$0.selected }) == false { pendingChoice = nil }
        }
        .onChange(of: model.context.status) { value in
            if !value.isEmpty { UIAccessibility.post(notification: .announcement, argument: value) }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if focusedField == "host" || focusedField == "port" {
                    Spacer()
                    Button(copy("Terminé", "Done", "تم")) { focusedField = nil }
                }
            }
        }
    }

    private var setup: some View {
        GeometryReader { geometry in
            // Compact empty-field setup on short phones; accessibility text and
            // the keyboard retain the scrollable layout, never clipped controls.
            let compact = geometry.size.height < 720 && !dynamicTypeSize.isAccessibilitySize
            // iPad: the form and its button stay together in the middle of the
            // screen instead of the button waiting half a screen below.
            let regular = sizeClass == .regular && !dynamicTypeSize.isAccessibilitySize
            ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(spacing: compact ? 8 : 16) {
                        KiwiMark(size: 88).frame(maxWidth: .infinity)
                        progress.modifier(KiwiArrive(shown: contentShown, rise: !reduceMotion))
                    }
                    .padding(.bottom, compact ? 12 : (dynamicTypeSize.isAccessibilitySize ? 24 : 36))
                    VStack(alignment: .leading, spacing: compact ? 8 : 12) {
                        if !model.context.eyebrow.isEmpty && model.context.kind != "account" {
                            Text(model.context.eyebrow).font(.subheadline.weight(.semibold)).foregroundStyle(kiwiMint.opacity(0.9))
                        }
                        Text(model.context.title).font(.system(size: compact ? titleSize * 0.8125 : titleSize, weight: .semibold)).tracking(-0.4).foregroundStyle(kiwiPaper).fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader).accessibilityFocused($headingFocused)
                        if !model.context.message.isEmpty {
                            Text(model.context.message).font(compact ? .subheadline : .body).foregroundStyle(kiwiPaper.opacity(0.62)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.bottom, compact ? 12 : 28)
                    .modifier(KiwiArrive(shown: contentShown, rise: !reduceMotion))
                    VStack(alignment: .leading, spacing: compact ? 12 : 16) {
                        content(compact: compact)
                        status
                    }
                    .modifier(KiwiArrive(shown: contentShown, rise: !reduceMotion))
                    if regular { Color.clear.frame(height: 32) } else { Spacer(minLength: compact ? 12 : 28) }
                    actions.modifier(KiwiArrive(shown: contentShown, rise: !reduceMotion)).id("kiwi-actions")
                }
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 22)
                .padding(.top, 20)
                .padding(.bottom, 12)
                .frame(minHeight: geometry.size.height, alignment: regular ? .center : .top)
            }
            .scrollDismissesKeyboardIfAvailable()
            .id(model.context.kind)
            .onChange(of: focusedField) { field in
                // Keep the primary action above the keyboard while typing.
                guard field != nil else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { proxy.scrollTo("kiwi-actions", anchor: .bottom) }
                }
            }
            }
        }
        .onAppear {
            // The mark is already on screen from the launch; the rest arrives.
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .timingCurve(0.22, 0.9, 0.24, 1, duration: 0.42)) { contentShown = true }
        }
        .background(
            kiwiLaunchGround.ignoresSafeArea()
        )
    }

    @ViewBuilder private var progress: some View {
        if model.context.progressTotal > 0 && model.context.kind != "account" {
            HStack(spacing: 5) {
                ForEach(1...model.context.progressTotal, id: \.self) { index in
                    Capsule().fill(index <= model.context.progress ? kiwiMint : kiwiPaper.opacity(0.16)).frame(maxWidth: .infinity).frame(height: 4)
                }
            }
            .frame(maxWidth: 180)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: model.context.progress)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(copy("Étape", "Step", "الخطوة"))
            .accessibilityValue("\(model.context.progress) / \(model.context.progressTotal)")
        }
    }

    @ViewBuilder private func content(compact: Bool) -> some View {
        if model.context.kind == "account", !model.context.fields.isEmpty {
            nativeField(id: "email", label: field("email")?.label ?? "Email", placeholder: copy("nom@commerce.ma", "name@business.com", "name@business.com"), text: $email, secure: false, keyboard: .emailAddress, compact: compact)
            nativeField(id: "password", label: field("password")?.label ?? "Password", placeholder: "", text: $password, secure: true, keyboard: .default, compact: compact)
        }
        if model.context.kind == "printer" {
            nativeField(id: "host", label: field("host")?.label ?? "IP", placeholder: "192.168.1.50", text: $host, secure: false, keyboard: .numbersAndPunctuation)
            nativeField(id: "port", label: field("port")?.label ?? "Port", placeholder: "9100", text: $port, secure: false, keyboard: .numberPad)
        }
        VStack(spacing: 10) {
            ForEach(model.context.choices) { choice in choiceButton(choice) }
        }
        if !model.context.summary.isEmpty {
            VStack(spacing: 0) {
                ForEach(model.context.summary) { item in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(item.label).font(.subheadline).foregroundStyle(kiwiPaper.opacity(0.58))
                        Text(item.value).font(.body.weight(.medium)).foregroundStyle(kiwiPaper).fixedSize(horizontal: false, vertical: true)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 13).accessibilityElement(children: .combine)
                    if item.id != model.context.summary.last?.id { Rectangle().fill(kiwiPaper.opacity(0.08)).frame(height: 0.5) }
                }
            }.padding(.horizontal, 16).background(kiwiPaper.opacity(0.06), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func field(_ id: String) -> KiwiHostField? { model.context.fields.first { $0.id == id } }

    private func hydrateFields() {
        if let value = field("email")?.value, email.isEmpty { email = value }
        if let value = field("host")?.value, !value.isEmpty, focusedField != "host" { host = value }
        if let value = field("port")?.value, !value.isEmpty, focusedField != "port" { port = value }
        if model.context.fields.isEmpty { password = ""; passwordVisible = false }
        if let selectedPaper = model.context.choices.first(where: { $0.group == "paper" && $0.selected })?.id { paper = selectedPaper }
    }

    private func copy(_ fr: String, _ en: String, _ ar: String) -> String {
        model.context.locale.hasPrefix("ar") ? ar : (model.context.locale.hasPrefix("en") ? en : fr)
    }

    private func nativeField(id: String, label: String, placeholder: String, text: Binding<String>, secure: Bool, keyboard: UIKeyboardType, compact: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(kiwiPaper.opacity(0.58))
                .accessibilityHidden(true)
            HStack(spacing: 4) {
                Group {
                    // The label above names the field; the placeholder shows an example.
                    if secure && !passwordVisible { SecureField(text: text, prompt: Text(placeholder).foregroundColor(kiwiPaper.opacity(0.34))) { Text(label) } }
                    else { TextField(text: text, prompt: Text(placeholder).foregroundColor(kiwiPaper.opacity(0.34))) { Text(label) } }
                }
                .foregroundStyle(kiwiPaper)
                .tint(kiwiMint)
                .focused($focusedField, equals: id)
                .textContentType(id == "email" ? .username : (secure ? .password : nil))
                .submitLabel(id == "email" || id == "host" ? .next : .go)
                .onSubmit {
                    if id == "email" { focusedField = "password" }
                    else if id == "host" { focusedField = "port" }
                    else if let action = model.context.actions.first(where: { $0.id == (secure ? "login" : "printer-test") && $0.enabled }) { perform(action) }
                }
                .accessibilityIdentifier("kiwi-field-\(id)")
                .environment(\.layoutDirection, .leftToRight)
                if secure {
                    Button {
                        passwordVisible.toggle()
                        focusedField = id
                    } label: {
                        Image(systemName: passwordVisible ? "eye.slash" : "eye")
                            .frame(minWidth: 44, minHeight: 44)
                    }.buttonStyle(.plain).foregroundStyle(kiwiPaper.opacity(0.7))
                        .accessibilityLabel(passwordVisible ? copy("Masquer le mot de passe", "Hide password", "إخفاء كلمة المرور") : copy("Afficher le mot de passe", "Show password", "إظهار كلمة المرور"))
                        .accessibilityIdentifier("kiwi-password-toggle")
                }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .padding(.horizontal, 16).padding(.vertical, compact ? 4 : 8).frame(minHeight: compact ? 52 : 56)
            .background(kiwiPaper.opacity(focusedField == id ? 0.11 : 0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(model.context.statusKind == "error" ? Color(red: 1, green: 0.62, blue: 0.55) : focusedField == id ? kiwiMint.opacity(0.9) : kiwiPaper.opacity(0.06), lineWidth: focusedField == id || model.context.statusKind == "error" ? 1.5 : 1))
            .animation(.easeOut(duration: 0.15), value: focusedField)
        }
    }

    private func choiceButton(_ choice: KiwiHostChoice) -> some View {
        Button {
            guard pendingChoice == nil else { return }
            if choice.group == "role" || choice.group == "store" {
                pendingChoice = choice.id
                DispatchQueue.main.asyncAfter(deadline: .now() + 8) { if pendingChoice == choice.id { pendingChoice = nil } }
            }
            if choice.group == "role" { model.send("select-role", id: choice.id) }
            else if choice.group == "store" { model.send("select-store", id: choice.id) }
            else if choice.group == "paper" { paper = choice.id; model.send("select-paper", id: choice.id) }
            else if choice.group == "printer" { host = choice.id; model.send("select-printer", id: choice.id) }
        } label: {
            Group {
                if dynamicTypeSize.isAccessibilitySize && choice.group == "role" {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: symbol(choice.id)).font(.title3.weight(.semibold)).foregroundStyle(kiwiMint).accessibilityHidden(true)
                        Text(choice.title).font(.headline).foregroundStyle(kiwiPaper)
                        if !choice.subtitle.isEmpty { Text(choice.subtitle).font(.subheadline).foregroundStyle(kiwiPaper.opacity(0.6)) }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    HStack(spacing: 14) {
                        Image(systemName: symbol(choice.id)).font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(choice.selected ? kiwiInk : kiwiMint)
                            .frame(width: 44, height: 44)
                            .background(choice.selected ? kiwiMint : kiwiMint.opacity(0.12), in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(choice.title).font(.headline).foregroundStyle(kiwiPaper).fixedSize(horizontal: false, vertical: true)
                            if !choice.subtitle.isEmpty { Text(choice.subtitle).font(.subheadline).foregroundStyle(kiwiPaper.opacity(0.58)).fixedSize(horizontal: false, vertical: true) }
                        }
                        Spacer(minLength: 8)
                        if pendingChoice == choice.id { ProgressView().tint(kiwiMint).accessibilityHidden(true) }
                        else if choice.selected || (choice.group == "paper" && paper == choice.id) { Image(systemName: "checkmark.circle.fill").font(.title3).foregroundStyle(kiwiMint) }
                        else { Image(systemName: "chevron.forward").font(.footnote.weight(.semibold)).foregroundStyle(kiwiPaper.opacity(0.35)) }
                    }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(kiwiPaper.opacity(choice.selected ? 0.12 : 0.06), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(choice.selected ? kiwiMint.opacity(0.55) : kiwiPaper.opacity(0.05), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }.buttonStyle(KiwiPressStyle())
            .opacity(pendingChoice != nil && pendingChoice != choice.id ? 0.5 : 1)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(choice.selected ? .isSelected : [])
    }

    @ViewBuilder private var status: some View {
        if !model.context.status.isEmpty {
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: model.context.statusKind == "ok" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                Text(model.context.status).fixedSize(horizontal: false, vertical: true)
            }
            .font(.subheadline.weight(.medium)).foregroundStyle(model.context.statusKind == "ok" ? kiwiMint : Color(red: 1, green: 0.62, blue: 0.55))
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background((model.context.statusKind == "ok" ? kiwiMint : Color(red: 1, green: 0.42, blue: 0.34)).opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    private var actions: some View {
        VStack(spacing: 6) {
            ForEach(model.context.actions) { action in
                Button { perform(action) } label: {
                    Text(action.label).font(.headline).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18).padding(.vertical, 12).frame(maxWidth: .infinity).frame(minHeight: action.style == "primary" ? 56 : 48)
                        .foregroundStyle(!action.enabled ? kiwiPaper.opacity(0.4) : (action.style == "primary" ? kiwiInk : kiwiPaper))
                        .background(!action.enabled ? kiwiPaper.opacity(0.08) : (action.style == "primary" ? kiwiPaper : Color.clear), in: Capsule())
                        .contentShape(Capsule())
                }.buttonStyle(KiwiPressStyle()).disabled(!action.enabled).accessibilityIdentifier("kiwi-action-\(action.id)")
            }
        }
    }

    private func perform(_ action: KiwiHostAction) {
        focusedField = nil
        if action.id == "login" { passwordVisible = false; model.send(action.id, values: ["email": email, "password": password]) }
        else if action.id == "printer-test" { model.send(action.id, values: ["host": host, "port": port, "paper": paper]) }
        else { model.send(action.id) }
    }

    private func symbol(_ id: String) -> String {
        ["caisse":"creditcard", "equipe":"person.3", "cuisine":"fork.knife", "dashboard":"chart.bar", "80":"ticket", "58":"ticket", "salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2"][id] ?? "building.2"
    }
}

private struct KiwiNativeTabRoot: View {
    @ObservedObject var model: KiwiNativeShellModel
    @Namespace private var selectionLens
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        capsule
            .padding(.top, 4)
            .padding(.bottom, 4)
            .environment(\.layoutDirection, model.context.rtl ? .rightToLeft : .leftToRight)
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(model.context.tabs) { tab in
                let active = model.context.selected == tab.id
                Button { model.send("navigate", id: tab.id) } label: {
                    ZStack {
                        if active {
                            Capsule()
                                .fill(Color.white.opacity(0.17))
                                .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 0.75))
                                .matchedGeometryEffect(id: "kiwi-tab-selection", in: selectionLens)
                        }
                        VStack(spacing: 2) {
                            Image(systemName: symbol(tab.id))
                                .font(.system(size: 19, weight: .semibold))
                                .symbolVariant(active ? .fill : .none)
                                .frame(height: 24)
                            Text(tab.label).font(.caption2.weight(active ? .semibold : .medium)).lineLimit(1)
                        }
                        .foregroundStyle(active ? kiwiMint : Color.white.opacity(0.85))
                    }
                    .frame(minWidth: 60, maxWidth: model.context.tabs.count == 1 ? 78 : .infinity, minHeight: 50, maxHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // A tab bar does not grow with the text size; like UITabBar it
                // shows the item large on a long press instead.
                .dynamicTypeSize(...DynamicTypeSize.large)
                .accessibilityShowsLargeContentViewer {
                    Image(systemName: symbol(tab.id))
                    Text(tab.label)
                }
                .accessibilityLabel(Text(tab.label))
                .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(6)
        .animation(reduceMotion ? nil : .spring(response: 0.31, dampingFraction: 0.76), value: model.context.selected)
    }

    @ViewBuilder private var capsule: some View {
        if #available(iOS 26.0, *) {
            tabs
                // A light till sits behind the capsule: 0.42 read as grey and washed out the labels.
                .glassEffect(.regular.tint(kiwiInk.opacity(0.78)).interactive(), in: Capsule())
                .shadow(color: kiwiInk.opacity(0.24), radius: 18, x: 0, y: 8)
        } else {
            tabs
                .background(.ultraThinMaterial, in: Capsule())
                .background(kiwiInk.opacity(0.78), in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 0.75))
                .shadow(color: kiwiInk.opacity(0.24), radius: 18, x: 0, y: 8)
        }
    }

    private func symbol(_ id: String) -> String {
        ["salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2",
         "accueil":"house", "transactions":"list.bullet.rectangle.portrait", "rapport":"doc.text", "clients":"person.2",
         "tables":"table.furniture", "menu":"menucard", "notifications":"bell", "profil":"person.crop.circle"][id] ?? "circle"
    }
}

/// Answers the page's alert(), confirm() and prompt() with system alerts in the
/// merchant's language. Capacitor's own handler hard-codes "Cancel" / "Ok", so a
/// French waiter read « Annuler toute la table ? » over an English "Cancel" that
/// meant the opposite. Everything else (new windows, permissions) is forwarded
/// to the handler Capacitor installed.
private final class KiwiDialogDelegate: NSObject, WKUIDelegate {
    private weak var fallback: WKUIDelegate?
    private let locale: () -> String

    init(fallback: WKUIDelegate?, locale: @escaping () -> String) {
        self.fallback = fallback
        self.locale = locale
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (fallback?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if fallback?.responds(to: aSelector) == true { return fallback }
        return super.forwardingTarget(for: aSelector)
    }

    private func copy(_ fr: String, _ en: String, _ ar: String) -> String {
        let lang = locale().lowercased()
        return lang.hasPrefix("ar") ? ar : (lang.hasPrefix("en") ? en : fr)
    }
    private var ok: String { copy("OK", "OK", "موافق") }
    private var cancel: String { copy("Annuler", "Cancel", "إلغاء") }

    /// A confirm that removes, cancels or deletes something gets the system's
    /// destructive colour on the button that does it.
    private func isDestructive(_ message: String) -> Bool {
        let lower = message.lowercased()
        return ["annuler", "supprimer", "retirer", "effacer", "cancel", "delete", "remove", "إلغاء", "حذف"].contains { lower.contains($0) }
    }
    /// A prompt that asks for a code is a secret, typed on the number pad.
    private func asksForCode(_ message: String) -> Bool {
        let lower = message.lowercased()
        return ["code", "pin", "رمز"].contains { lower.contains($0) }
    }

    private func present(_ alert: UIAlertController, from webView: WKWebView, otherwise fail: () -> Void) {
        var presenter = webView.window?.rootViewController
        while let presented = presenter?.presentedViewController { presenter = presented }
        guard let presenter, !presenter.isBeingDismissed else { fail(); return }
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: ok, style: .default) { _ in completionHandler() })
        present(alert, from: webView) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: cancel, style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: ok, style: isDestructive(message) ? .destructive : .default) { _ in completionHandler(true) })
        present(alert, from: webView) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        // Capacitor runs its synchronous bridge (CapacitorCookies, CapacitorHttp)
        // through prompt() with a JSON payload carrying a "type". Those are not
        // dialogs: they go back to Capacitor's own handler untouched, or the
        // first launch shows a raw {"type":"CapacitorCookies.isEnabled"} box.
        if let data = prompt.data(using: .utf8),
           let payload = try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed) as? [String: Any],
           payload["type"] is String {
            if let fallback, fallback.responds(to: #selector(WKUIDelegate.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))) {
                fallback.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt, defaultText: defaultText, initiatedByFrame: frame, completionHandler: completionHandler)
            } else {
                completionHandler(nil)
            }
            return
        }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        let secret = asksForCode(prompt)
        alert.addTextField { field in
            field.text = defaultText
            if secret {
                field.isSecureTextEntry = true
                field.keyboardType = .numberPad
            }
        }
        alert.addAction(UIAlertAction(title: cancel, style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: ok, style: .default) { _ in completionHandler(alert.textFields?.first?.text ?? "") })
        present(alert, from: webView) { completionHandler(nil) }
    }
}
