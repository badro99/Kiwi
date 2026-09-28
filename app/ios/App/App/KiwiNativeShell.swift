import Capacitor
import SwiftUI
import UIKit
import WebKit

private let kiwiInk = Color(red: 10 / 255, green: 15 / 255, blue: 13 / 255)
private let kiwiMint = Color(red: 125 / 255, green: 242 / 255, blue: 176 / 255)
private let kiwiPaper = Color(red: 247 / 255, green: 245 / 255, blue: 240 / 255)
private let kiwiAtlas = Color(red: 11 / 255, green: 110 / 255, blue: 79 / 255)

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
    private static let tabContentHeight: CGFloat = 72
    private let model = KiwiNativeShellModel()
    private var setupHost: UIHostingController<KiwiNativeSetupRoot>?
    private var tabHost: UIHostingController<KiwiNativeTabRoot>?
    private var tabHeightConstraint: NSLayoutConstraint?
    private var tabWidthConstraint: NSLayoutConstraint?
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
        let tabWidthConstraint = tabs.view.widthAnchor.constraint(equalToConstant: 350)
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
        self.tabWidthConstraint = tabWidthConstraint

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
        // One slot per tab; the ≥12pt side margins still win on narrow phones.
        tabWidthConstraint?.constant = CGFloat(max(context.tabs.count, 1)) * 74 + 12
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

private extension View {
    @ViewBuilder func kiwiSheetDetents() -> some View {
        if #available(iOS 16.0, *) { self.presentationDetents([.medium, .large]).presentationDragIndicator(.visible) } else { self }
    }

    @ViewBuilder func scrollDismissesKeyboardIfAvailable() -> some View {
        if #available(iOS 16.0, *) { self.scrollDismissesKeyboard(.interactively) } else { self }
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
        .onChange(of: model.context.kind) { _ in
            focusedField = nil
            passwordVisible = false
            password = ""
            headingFocused = true
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
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 14) {
                        KiwiMark(size: 44)
                        progress
                    }
                    .padding(.bottom, dynamicTypeSize.isAccessibilitySize ? 24 : 36)
                    VStack(alignment: .leading, spacing: 12) {
                        if !model.context.eyebrow.isEmpty && model.context.kind != "account" {
                            Text(model.context.eyebrow).font(.subheadline.weight(.semibold)).foregroundStyle(kiwiMint.opacity(0.9))
                        }
                        Text(model.context.title).font(.system(size: titleSize, weight: .semibold)).tracking(-0.4).foregroundStyle(kiwiPaper).fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader).accessibilityFocused($headingFocused)
                        if !model.context.message.isEmpty {
                            Text(model.context.message).font(.body).foregroundStyle(kiwiPaper.opacity(0.62)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.bottom, 28)
                    VStack(alignment: .leading, spacing: 16) {
                        content
                        status
                    }
                    Spacer(minLength: 28)
                    actions
                }
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
                .frame(minHeight: geometry.size.height, alignment: .top)
                .padding(.horizontal, 22)
                .padding(.top, 12)
                .padding(.bottom, 12)
            }
            .scrollDismissesKeyboardIfAvailable()
            .id(model.context.kind)
        }
        .background(
            ZStack {
                kiwiInk
                RadialGradient(colors: [kiwiAtlas.opacity(0.55), .clear], center: .topTrailing, startRadius: 10, endRadius: 520)
                RadialGradient(colors: [kiwiMint.opacity(0.08), .clear], center: .bottomLeading, startRadius: 10, endRadius: 420)
            }.ignoresSafeArea()
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

    @ViewBuilder private var content: some View {
        if model.context.kind == "account", !model.context.fields.isEmpty {
            nativeField(id: "email", label: field("email")?.label ?? "Email", text: $email, secure: false, keyboard: .emailAddress)
            nativeField(id: "password", label: field("password")?.label ?? "Password", text: $password, secure: true, keyboard: .default)
        }
        if model.context.kind == "printer" {
            nativeField(id: "host", label: field("host")?.label ?? "IP", text: $host, secure: false, keyboard: .numbersAndPunctuation)
            nativeField(id: "port", label: field("port")?.label ?? "Port", text: $port, secure: false, keyboard: .numberPad)
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

    private func nativeField(id: String, label: String, text: Binding<String>, secure: Bool, keyboard: UIKeyboardType) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(kiwiPaper.opacity(0.58))
                .accessibilityHidden(true)
            HStack(spacing: 4) {
                Group {
                    if secure && !passwordVisible { SecureField(text: text, prompt: Text(label).foregroundColor(kiwiPaper.opacity(0.34))) { Text(label) } }
                    else { TextField(text: text, prompt: Text(label).foregroundColor(kiwiPaper.opacity(0.34))) { Text(label) } }
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
            .padding(.horizontal, 16).padding(.vertical, 8).frame(minHeight: 56)
            .background(kiwiPaper.opacity(focusedField == id ? 0.11 : 0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(model.context.statusKind == "error" ? Color(red: 1, green: 0.62, blue: 0.55) : focusedField == id ? kiwiMint.opacity(0.9) : kiwiPaper.opacity(0.06), lineWidth: focusedField == id || model.context.statusKind == "error" ? 1.5 : 1))
            .animation(.easeOut(duration: 0.15), value: focusedField)
        }
    }

    private func choiceButton(_ choice: KiwiHostChoice) -> some View {
        Button {
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
                        if choice.selected || (choice.group == "paper" && paper == choice.id) { Image(systemName: "checkmark.circle.fill").font(.title3).foregroundStyle(kiwiMint) }
                        else { Image(systemName: "chevron.forward").font(.footnote.weight(.semibold)).foregroundStyle(kiwiPaper.opacity(0.35)) }
                    }
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(kiwiPaper.opacity(choice.selected ? 0.12 : 0.06), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(choice.selected ? kiwiMint.opacity(0.55) : kiwiPaper.opacity(0.05), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }.buttonStyle(KiwiPressStyle())
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
        ["caisse":"creditcard", "equipe":"person.3", "cuisine":"fork.knife", "dashboard":"chart.bar", "80":"ticket", "58":"ticket", "salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2", "more":"ellipsis" ][id] ?? "building.2"
    }
}

private struct KiwiNativeTabRoot: View {
    @ObservedObject var model: KiwiNativeShellModel
    @Namespace private var selectionLens
    @State private var showingMore = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        capsule
            .padding(.top, 4)
            .padding(.bottom, 4)
            .environment(\.layoutDirection, model.context.rtl ? .rightToLeft : .leftToRight)
            .sheet(isPresented: $showingMore) {
                NavigationView {
                    List {
                        if model.context.role == "dashboard" {
                            Section {
                                Button { showingMore = false; model.send("open-tools") } label: {
                                    Label(copy("Tout le tableau de bord", "Full dashboard menu", "كل لوحة القيادة"), systemImage: "square.grid.2x2")
                                }
                            } footer: {
                                Text(copy("Équipe, menu, stock, réservations, terminaux, marges.", "Team, menu, stock, bookings, terminals, margins.", "الفريق، القائمة، المخزون، الحجوزات، الأجهزة، الهوامش."))
                            }
                        }
                        if model.context.role == "caisse" {
                            Section {
                                Button { showingMore = false; model.send("open-tools") } label: {
                                    Label(copy("Outils de la caisse", "Till tools", "أدوات الصندوق"), systemImage: "wrench.and.screwdriver")
                                }
                            } footer: {
                                Text(copy("Remboursement, tiroir, équipe, menu, fin de service.", "Refunds, drawer, team, menu, end of shift.", "الاسترداد، الدرج، الفريق، القائمة، نهاية الخدمة."))
                            }
                        }
                        Section {
                            Button { showingMore = false; model.send("change-role") } label: {
                                Label(copy("Changer de rôle", "Change role", "تغيير الدور"), systemImage: "arrow.left.arrow.right")
                            }
                            Button { showingMore = false; model.send("sign-out") } label: {
                                Label(copy("Se déconnecter", "Sign out", "تسجيل الخروج"), systemImage: "rectangle.portrait.and.arrow.right")
                            }
                        }
                        Section {
                            Button { showingMore = false; model.send("ai-privacy") } label: {
                                Label(copy("Confidentialité Kiwi AI", "Kiwi AI privacy", "خصوصية Kiwi AI"), systemImage: "hand.raised")
                            }
                            Button(role: .destructive) { showingMore = false; model.send("delete-account") } label: {
                                Label(copy("Supprimer mon compte", "Delete my account", "حذف حسابي"), systemImage: "trash")
                            }
                        }
                    }
                    .tint(kiwiAtlas)
                    .navigationTitle(copy("Plus", "More", "المزيد"))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button(copy("Fermer", "Close", "إغلاق")) { showingMore = false }.font(.body.weight(.semibold)) } }
                }
                .kiwiSheetDetents()
            }
    }

    private func copy(_ fr: String, _ en: String, _ ar: String) -> String {
        model.context.locale.hasPrefix("ar") ? ar : (model.context.locale.hasPrefix("en") ? en : fr)
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(model.context.tabs) { tab in
                let active = model.context.selected == tab.id
                Button { if tab.id == "more" { showingMore = true } else { model.send("navigate", id: tab.id) } } label: {
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
                            Text(tab.label).font(.system(size: 10, weight: active ? .semibold : .medium)).lineLimit(1)
                        }
                        .foregroundStyle(active ? kiwiMint : Color.white.opacity(0.85))
                    }
                    .frame(minWidth: 60, maxWidth: model.context.tabs.count == 1 ? 78 : .infinity, minHeight: 50, maxHeight: 50)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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
        ["salle":"table.furniture", "vrap":"takeoutbag.and.cup.and.straw", "waitlist":"person.2", "more":"square.grid.2x2",
         "accueil":"house", "transactions":"list.bullet.rectangle.portrait", "rapport":"doc.text", "clients":"person.2",
         "tables":"table.furniture", "menu":"menucard", "notifications":"bell", "profil":"person.crop.circle"][id] ?? "circle"
    }
}
