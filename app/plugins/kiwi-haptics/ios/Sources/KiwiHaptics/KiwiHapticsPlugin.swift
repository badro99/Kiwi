import Capacitor
import Foundation
#if canImport(UIKit)
import UIKit
#endif
import QuartzCore

/// Kiwi's haptics plugin (spec §15). Two modes behind one `play` call:
///
/// - `stock` reproduces `@capacitor/haptics` 8.0.2 (`Haptics.swift`) exactly:
///   a NEW feedback generator for every impact and notification, no
///   `prepare()`, and a selection generator created by `selectionStart`
///   (with `prepare()`), re-prepared after each `selectionChanged`, dropped by
///   `selectionEnd`. A bare `selectionChanged` is silent, as it is there.
/// - `prepared` keeps one long-lived generator per impact style (including
///   `.soft`), one notification generator and one selection generator, and
///   `prepare` warms them.
///
/// `play` resolves with `{t: CACurrentMediaTime()}` read on the main thread
/// immediately after the generator call returned, which the stock plugin never
/// reports (`call.resolve()` with no data). The actuator's own delay after that
/// call belongs to the device and is the same in both modes.
@objc(KiwiHapticsPlugin)
public class KiwiHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KiwiHapticsPlugin"
    public let jsName = "KiwiHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise)
    ]

    #if canImport(UIKit)
    private let engine = KiwiHapticsEngine()
    #endif

    @objc public func play(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "impact"
        let style = (call.getString("style") ?? "").uppercased()
        let prepared = call.getString("mode") == "prepared"
        DispatchQueue.main.async {
            #if canImport(UIKit)
            self.engine.play(kind: kind, style: style, prepared: prepared)
            #endif
            call.resolve(["t": CACurrentMediaTime()])
        }
    }

    @objc public func clock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["t": CACurrentMediaTime()])
        }
    }

    @objc public func prepare(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "impact"
        let style = (call.getString("style") ?? "").uppercased()
        let prepared = call.getString("mode") == "prepared"
        DispatchQueue.main.async {
            #if canImport(UIKit)
            // Stock mode never warms a generator: it makes a new one per call.
            if prepared { self.engine.prepare(kind: kind, style: style) }
            #endif
            call.resolve()
        }
    }
}

#if canImport(UIKit)
/// Main-thread only. Every method is called from `DispatchQueue.main`.
final class KiwiHapticsEngine {
    // stock mode: the one selection generator `selectionStart` creates.
    private var stockSelection: UISelectionFeedbackGenerator?

    // prepared mode: long-lived generators.
    private var impacts: [Int: UIImpactFeedbackGenerator] = [:]
    private lazy var notifications = UINotificationFeedbackGenerator()
    private lazy var selection = UISelectionFeedbackGenerator()

    // MARK: styles

    /// The stock plugin knows MEDIUM and LIGHT and falls back to HEAVY for
    /// anything else. `.soft` and `.rigid` do not exist there, so in stock mode
    /// they play LIGHT (Grab's documented fallback) instead of a surprise Heavy.
    private func stockImpactStyle(_ style: String) -> UIImpactFeedbackGenerator.FeedbackStyle {
        switch style {
        case "MEDIUM": return .medium
        case "LIGHT", "SOFT", "RIGID": return .light
        default: return .heavy
        }
    }

    private func preparedImpactStyle(_ style: String) -> UIImpactFeedbackGenerator.FeedbackStyle {
        switch style {
        case "MEDIUM": return .medium
        case "LIGHT": return .light
        case "SOFT": return .soft
        case "RIGID": return .rigid
        default: return .heavy
        }
    }

    private func notificationType(_ style: String) -> UINotificationFeedbackGenerator.FeedbackType {
        switch style {
        case "WARNING": return .warning
        case "ERROR": return .error
        default: return .success
        }
    }

    private func impactGenerator(_ style: UIImpactFeedbackGenerator.FeedbackStyle) -> UIImpactFeedbackGenerator {
        if let existing = impacts[style.rawValue] { return existing }
        let generator = UIImpactFeedbackGenerator(style: style)
        impacts[style.rawValue] = generator
        return generator
    }

    // MARK: play

    func play(kind: String, style: String, prepared: Bool) {
        switch kind {
        case "notification":
            if prepared {
                notifications.notificationOccurred(notificationType(style))
            } else {
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(notificationType(style))
            }
        case "selection":
            playSelection(style.lowercased(), prepared: prepared)
        default:
            if prepared {
                impactGenerator(preparedImpactStyle(style)).impactOccurred()
            } else {
                let generator = UIImpactFeedbackGenerator(style: stockImpactStyle(style))
                generator.impactOccurred()
            }
        }
    }

    private func playSelection(_ phase: String, prepared: Bool) {
        if prepared {
            switch phase {
            case "start": selection.prepare()
            case "changed":
                selection.selectionChanged()
                selection.prepare()
            default: break // "end": the generator stays alive.
            }
            return
        }
        switch phase {
        case "start":
            stockSelection = UISelectionFeedbackGenerator()
            stockSelection?.prepare()
        case "changed":
            if let generator = stockSelection {
                generator.selectionChanged()
                generator.prepare()
            }
        default: // "end"
            stockSelection = nil
        }
    }

    // MARK: prepare (prepared mode only; stock mode never calls it)

    func prepare(kind: String, style: String) {
        switch kind {
        case "notification": notifications.prepare()
        case "selection": selection.prepare()
        default: impactGenerator(preparedImpactStyle(style)).prepare()
        }
    }
}
#endif
