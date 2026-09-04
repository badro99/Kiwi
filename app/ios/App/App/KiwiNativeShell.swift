import Capacitor
import SwiftUI
import UIKit
import WebKit

private let kiwiInk = Color(red: 10 / 255, green: 15 / 255, blue: 13 / 255)
private let kiwiMint = Color(red: 0, green: 1, blue: 174 / 255)
private let kiwiPaper = Color(red: 247 / 255, green: 245 / 255, blue: 240 / 255)

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

    private enum CodingKeys: String, CodingKey {
        case version, screen, locale, rtl, kind, progress, progressTotal, eyebrow, title, message
        case status, statusKind, accountLabel, role, selected, fields, choices, summary, actions, tabs
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
    }
}

private final class KiwiNativeShellModel: ObservableObject {
    @Published var context = KiwiHostContext()
    @Published var revision = 0
    weak var bridge: CAPBridgeViewController?
    var didChangeLayout: ((KiwiHostContext) -> Void)?

    func accept(_ value: Any) {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value),
              let next = try? JSONDecoder().decode(KiwiHostContext.self, from: data) else { return }
        DispatchQueue.main.async {
            self.context = next
            self.revision += 1
            self.didChangeLayout?(next)
        }
    }

    func send(_ action: String, id: String = "", values: [String: String] = [:]) {
        var payload = values
        payload["action"] = action
        if !id.isEmpty { payload["id"] = id }
        guard let script = kiwiNativeActionScript(payload) else { return }
        bridge?.webView?.evaluateJavaScript(script, completionHandler: nil)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}

final class KiwiNativeShellCoordinator: NSObject, WKScriptMessageHandler {
    private static let tabContentHeight: CGFloat = 66
    private let model = KiwiNativeShellModel()
    private var setupHost: UIHostingController<KiwiNativeSetupRoot>?
    private var tabHost: UIHostingController<KiwiNativeTabRoot>?
    private var tabHeightConstraint: NSLayoutConstraint?
    private var safeAreaInsets = UIEdgeInsets.zero

    func attach(to bridge: CAPBridgeViewController) {
        model.bridge = bridge
        bridge.loadViewIfNeeded()
        bridge.webView?.configuration.userContentController.add(self, name: "kiwiShell")

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

        let tabs = UIHostingController(rootView: KiwiNativeTabRoot(model: model))
        tabs.view.translatesAutoresizingMaskIntoConstraints = false
        tabs.view.backgroundColor = .clear
        bridge.addChild(tabs)
        bridge.view.addSubview(tabs.view)
        let tabHeightConstraint = tabs.view.heightAnchor.constraint(equalToConstant: Self.tabContentHeight)
        let tabWidthConstraint = tabs.view.widthAnchor.constraint(equalToConstant: 264)
        tabWidthConstraint.priority = .defaultHigh
        NSLayoutConstraint.activate([
            tabs.view.centerXAnchor.constraint(equalTo: bridge.view.centerXAnchor),
            tabs.view.leadingAnchor.constraint(greaterThanOrEqualTo: bridge.view.leadingAnchor, constant: 12),
            tabs.view.trailingAnchor.constraint(lessThanOrEqualTo: bridge.view.trailingAnchor, constant: -12),
            tabWidthConstraint,
            tabs.view.bottomAnchor.constraint(equalTo: bridge.view.bottomAnchor),
            tabHeightConstraint
        ])
        tabs.didMove(toParent: bridge)
        tabHost = tabs
        self.tabHeightConstraint = tabHeightConstraint

        model.didChangeLayout = { [weak self] context in self?.apply(context) }
        apply(model.context)
        requestState()
    }

    func updateSafeAreaInsets(_ insets: UIEdgeInsets) {
        guard insets != safeAreaInsets else { return }
        safeAreaInsets = insets
        tabHeightConstraint?.constant = Self.tabContentHeight + insets.bottom
        publishSafeAreaInsets()
    }

    private func apply(_ context: KiwiHostContext) {
        setupHost?.view.isHidden = context.screen == "workspace"
        tabHost?.view.isHidden = context.screen != "workspace" || context.tabs.isEmpty
        if let setupView = setupHost?.view, !setupView.isHidden { setupView.superview?.bringSubviewToFront(setupView) }
        if let tabView = tabHost?.view, !tabView.isHidden { tabView.superview?.bringSubviewToFront(tabView) }
        publishSafeAreaInsets()
    }

    private func publishSafeAreaInsets() {
        let values = [safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left]
            .map { String(format: "%.2f", Double($0)) + "px" }
        bridgeEvaluate("document.documentElement.style.setProperty('--kiwi-host-safe-top','\(values[0])');document.documentElement.style.setProperty('--kiwi-host-safe-right','\(values[1])');document.documentElement.style.setProperty('--kiwi-host-safe-bottom','\(values[2])');document.documentElement.style.setProperty('--kiwi-host-safe-left','\(values[3])')")
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
        model.accept(message.body)
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
            .clipShape(RoundedRectangle(cornerRadius: size * 0.23, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Kiwi Pro")
    }
}

private struct KiwiNativeSetupRoot: View {
    @ObservedObject var model: KiwiNativeShellModel
    @State private var email = ""
    @State private var password = ""
    @State private var host = ""
    @State private var port = "9100"
    @State private var paper = "80"

    var body: some View {
        ZStack {
            kiwiInk.ignoresSafeArea()
            if model.context.screen == "launch" {
                KiwiMark()
            } else {
                setup
            }
        }
        .environment(\.layoutDirection, model.context.rtl ? .rightToLeft : .leftToRight)
        .onReceive(model.$revision) { _ in hydrateFields() }
    }

    private var setup: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                KiwiMark(size: 76)
                progress
                VStack(alignment: .leading, spacing: 18) {
                    if !model.context.eyebrow.isEmpty { Text(model.context.eyebrow.uppercased()).font(.caption.weight(.bold)).tracking(1.6).foregroundStyle(kiwiInk.opacity(0.58)) }
                    Text(model.context.title).font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(kiwiInk).fixedSize(horizontal: false, vertical: true)
                    if !model.context.message.isEmpty { Text(model.context.message).font(.body).foregroundStyle(kiwiInk.opacity(0.66)).fixedSize(horizontal: false, vertical: true) }
                    content
                    status
                    actions
                }
                .padding(24)
                .background(kiwiPaper, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 28)
        }
    }

    @ViewBuilder private var progress: some View {
        if model.context.progressTotal > 0 {
            HStack(spacing: 7) {
                ForEach(1...model.context.progressTotal, id: \.self) { index in
                    Capsule().fill(index <= model.context.progress ? kiwiMint : kiwiPaper.opacity(0.2)).frame(maxWidth: .infinity).frame(height: 4)
                }
            }.accessibilityLabel("\(model.context.progress) / \(model.context.progressTotal)")
        }
    }

    @ViewBuilder private var content: some View {
        if model.context.kind == "account", !model.context.fields.isEmpty {
            nativeField(label: field("email")?.label ?? "Email", text: $email, secure: false, keyboard: .emailAddress)
            nativeField(label: field("password")?.label ?? "Password", text: $password, secure: true, keyboard: .default)
        }
        if model.context.kind == "printer" {
            nativeField(label: field("host")?.label ?? "IP", text: $host, secure: false, keyboard: .numbersAndPunctuation)
            nativeField(label: field("port")?.label ?? "Port", text: $port, secure: false, keyboard: .numberPad)
        }
        VStack(spacing: 10) {
            ForEach(model.context.choices) { choice in choiceButton(choice) }
        }
        if !model.context.summary.isEmpty {
            VStack(spacing: 0) {
                ForEach(model.context.summary) { item in
                    HStack { Text(item.label).fontWeight(.semibold); Spacer(); Text(item.value).foregroundStyle(kiwiInk.opacity(item.muted ? 0.42 : 0.72)) }
                        .padding(.vertical, 13)
                    if item.id != model.context.summary.last?.id { Divider().overlay(kiwiInk.opacity(0.08)) }
                }
            }.padding(.horizontal, 16).background(kiwiInk.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private func field(_ id: String) -> KiwiHostField? { model.context.fields.first { $0.id == id } }

    private func hydrateFields() {
        if let value = field("email")?.value, email.isEmpty { email = value }
        if let value = field("host")?.value, !value.isEmpty { host = value }
        if let value = field("port")?.value, !value.isEmpty { port = value }
        if let selectedPaper = model.context.choices.first(where: { $0.group == "paper" && $0.selected })?.id { paper = selectedPaper }
    }

    private func nativeField(label: String, text: Binding<String>, secure: Bool, keyboard: UIKeyboardType) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).font(.subheadline.weight(.semibold)).foregroundStyle(kiwiInk.opacity(0.65))
            Group {
                if secure { SecureField(label, text: text) } else { TextField(label, text: text) }
            }
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .padding(.horizontal, 16).frame(minHeight: 54)
            .background(Color.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(kiwiInk.opacity(0.12), lineWidth: 1))
        }
    }

    private func choiceButton(_ choice: KiwiHostChoice) -> some View {
        Button {
            if choice.group == "role" { model.send("select-role", id: choice.id) }
            else if choice.group == "store" { model.send("select-store", id: choice.id) }
            else if choice.group == "paper" { paper = choice.id; model.send("select-paper", id: choice.id) }
            else if choice.group == "printer" { host = choice.id; model.send("select-printer", id: choice.id) }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol(choice.id)).font(.title3.weight(.semibold)).frame(width: 28).foregroundStyle(choice.selected ? kiwiMint : kiwiInk.opacity(0.62))
                VStack(alignment: .leading, spacing: 3) {
                    Text(choice.title).font(.headline).foregroundStyle(kiwiInk)
                    if !choice.subtitle.isEmpty { Text(choice.subtitle).font(.subheadline).foregroundStyle(kiwiInk.opacity(0.56)) }
                }
                Spacer()
                if choice.selected || (choice.group == "paper" && paper == choice.id) { Image(systemName: "checkmark.circle.fill").foregroundStyle(kiwiInk) }
            }
            .padding(15).background(choice.selected ? kiwiMint.opacity(0.12) : Color.white.opacity(0.55), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(choice.selected ? kiwiMint.opacity(0.8) : kiwiInk.opacity(0.08), lineWidth: 1))
        }.buttonStyle(.plain)
    }

    @ViewBuilder private var status: some View {
        if !model.context.status.isEmpty {
            HStack(alignment: .top, spacing: 9) {
                Image(systemName: model.context.statusKind == "ok" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                Text(model.context.status).fixedSize(horizontal: false, vertical: true)
            }
            .font(.subheadline.weight(.medium)).foregroundStyle(kiwiInk.opacity(0.72))
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(kiwiInk.opacity(0.05), in: RoundedRectangle(cornerRadius: 15))
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            ForEach(model.context.actions) { action in
                Button { perform(action) } label: {
                    Text(action.label).font(.headline).frame(maxWidth: .infinity).frame(minHeight: 54)
                        .foregroundStyle(action.style == "primary" ? kiwiPaper : kiwiInk)
                        .background(action.style == "primary" ? kiwiInk : Color.clear, in: RoundedRectangle(cornerRadius: 17))
                        .overlay(RoundedRectangle(cornerRadius: 17).stroke(kiwiInk.opacity(action.style == "primary" ? 0 : 0.18), lineWidth: 1))
                }.buttonStyle(.plain).disabled(!action.enabled).opacity(action.enabled ? 1 : 0.42)
            }
        }
    }

    private func perform(_ action: KiwiHostAction) {
        if action.id == "login" { model.send(action.id, values: ["email": email, "password": password]); password = "" }
        else if action.id == "printer-test" { model.send(action.id, values: ["host": host, "port": port, "paper": paper]) }
        else { model.send(action.id) }
    }

    private func symbol(_ id: String) -> String {
        ["caisse":"creditcard", "equipe":"person.3", "cuisine":"fork.knife", "dashboard":"chart.bar", "80":"ticket", "58":"ticket", "salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2", "more":"ellipsis" ][id] ?? "building.2"
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
                        Image(systemName: symbol(tab.id))
                            .font(.system(size: 21, weight: .semibold))
                            .symbolVariant(active ? .fill : .none)
                            .foregroundStyle(active ? kiwiMint : Color.white.opacity(0.70))
                    }
                    .frame(width: 56, height: 46)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(tab.label))
                .accessibilityAddTraits(active ? .isSelected : [])
            }
        }
        .padding(6)
        .animation(reduceMotion ? nil : .spring(response: 0.31, dampingFraction: 0.76), value: model.context.selected)
    }

    @ViewBuilder private var capsule: some View {
        if #available(iOS 26.0, *) {
            tabs
                .glassEffect(.regular.tint(kiwiInk.opacity(0.42)).interactive(), in: Capsule())
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
        ["salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2", "more":"ellipsis"][id] ?? "circle"
    }
}
