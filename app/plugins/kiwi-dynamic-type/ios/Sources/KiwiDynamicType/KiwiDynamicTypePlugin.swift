import Capacitor
import Foundation
#if canImport(UIKit)
import UIKit
#endif

@objc(KiwiDynamicTypePlugin)
public class KiwiDynamicTypePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KiwiDynamicTypePlugin"
    public let jsName = "KiwiDynamicType"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDynamicTypeScale", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        super.load()
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(self, selector: #selector(contentSizeCategoryChanged), name: UIContentSizeCategory.didChangeNotification, object: nil)
        #endif
    }

    deinit {
        #if canImport(UIKit)
        NotificationCenter.default.removeObserver(self)
        #endif
    }

    #if canImport(UIKit)
    @objc private func contentSizeCategoryChanged() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let category = UIApplication.shared.preferredContentSizeCategory
            let scale = Self.scaleForCategory(category)
            self.notifyListeners("dynamicTypeChange", data: [
                "scale": scale,
                "category": category.rawValue
            ])
        }
    }
    #endif

    @objc func getDynamicTypeScale(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            #if canImport(UIKit)
            let category = UIApplication.shared.preferredContentSizeCategory
            let scale = Self.scaleForCategory(category)
            call.resolve([
                "scale": scale,
                "category": category.rawValue
            ])
            #else
            call.resolve([
                "scale": 1.0,
                "category": "unsupported"
            ])
            #endif
        }
    }

    #if canImport(UIKit)
    public static func scaleForCategory(_ category: UIContentSizeCategory) -> Double {
        switch category {
        case .extraSmall: return 0.85
        case .small: return 0.90
        case .medium: return 0.95
        case .large: return 1.00
        case .extraLarge: return 1.12
        case .extraExtraLarge: return 1.24
        case .extraExtraExtraLarge,
             .accessibilityMedium,
             .accessibilityLarge,
             .accessibilityExtraLarge,
             .accessibilityExtraExtraLarge,
             .accessibilityExtraExtraExtraLarge:
            return 1.35
        default:
            return 1.00
        }
    }
    #endif
}
