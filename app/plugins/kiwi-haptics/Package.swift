// swift-tools-version: 5.9
import PackageDescription

// The platform floor here is .v15, like the other local plugins and the
// generated CapApp-SPM package: SwiftPM refuses a dependency whose floor is
// higher than the package that imports it, and `cap sync` rewrites CapApp-SPM
// at .v15. The app's real floor (15.5) is the Xcode project's
// IPHONEOS_DEPLOYMENT_TARGET.
let package = Package(
    name: "KiwiHaptics",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "KiwiHaptics", targets: ["KiwiHaptics"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "KiwiHaptics",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")],
            path: "ios/Sources/KiwiHaptics"
        )
    ]
)
