import Capacitor
import Foundation
import LocalAuthentication
import Network
import Security

#if canImport(Darwin)
import Darwin
#endif

private struct SocketOutcome {
    let ok: Bool
    let code: String?
    let message: String?
    let bytes: Int
    let ms: Int
}

private final class SocketAttempt {
    private let queue = DispatchQueue(label: "com.kiwios.printer-socket.connection")
    private var connection: NWConnection?
    private var finished = false
    private var sawWaiting = false
    private var waitingOutcome: (String, String)?
    private let started = DispatchTime.now().uptimeNanoseconds

    func start(host: String, port: UInt16, data: Data?, timeoutMs: Int, completion: @escaping (SocketOutcome) -> Void) {
        let connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!, using: .tcp)
        self.connection = connection

        func finish(ok: Bool, code: String? = nil, message: String? = nil, bytes: Int = 0) {
            guard !self.finished else { return }
            self.finished = true
            let elapsed = Int((DispatchTime.now().uptimeNanoseconds - self.started) / 1_000_000)
            connection.stateUpdateHandler = nil
            connection.cancel()
            completion(SocketOutcome(ok: ok, code: code, message: message, bytes: bytes, ms: elapsed))
        }

        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                guard let payload = data else {
                    finish(ok: true)
                    return
                }
                connection.send(content: payload, completion: .contentProcessed { error in
                    if let error {
                        let mapped = KiwiPrinterSocketPlugin.map(error)
                        finish(ok: false, code: mapped.0, message: mapped.1)
                    } else {
                        finish(ok: true, bytes: payload.count)
                    }
                })
            case .waiting(let error):
                self.sawWaiting = true
                let mapped = KiwiPrinterSocketPlugin.map(error)
                self.waitingOutcome = mapped
                if mapped.0 == "local-network-denied" {
                    finish(ok: false, code: mapped.0, message: mapped.1)
                }
            case .failed(let error):
                let mapped = KiwiPrinterSocketPlugin.map(error)
                finish(ok: false, code: mapped.0, message: mapped.1)
            default:
                break
            }
        }

        queue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) {
            if let waiting = self.waitingOutcome, waiting.0 != "unreachable" {
                finish(ok: false, code: waiting.0, message: waiting.1)
            } else if self.sawWaiting {
                finish(ok: false, code: "local-network-denied", message: "Accès au réseau local non autorisé.")
            } else {
                finish(ok: false, code: "timeout", message: "Connexion à l'imprimante expirée.")
            }
        }
        connection.start(queue: queue)
    }
}

@objc(KiwiPrinterSocketPlugin)
public class KiwiPrinterSocketPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KiwiPrinterSocketPlugin"
    public let jsName = "KiwiPrinterSocket"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deviceIdentity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ledgerRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ledgerWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkBiometrics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticateBiometric", returnType: CAPPluginReturnPromise)
    ]

    @objc func send(_ call: CAPPluginCall) {
        guard let args = endpointArgs(call), let encoded = call.getString("data"), let data = Data(base64Encoded: encoded) else {
            resolveError(call, code: "bad-args", message: "Hôte, port ou données invalides.")
            return
        }
        SocketAttempt().start(host: args.host, port: args.port, data: data, timeoutMs: args.timeoutMs) { outcome in
            self.resolve(call, outcome: outcome)
        }
    }

    @objc func probe(_ call: CAPPluginCall) {
        guard let args = endpointArgs(call) else {
            resolveError(call, code: "bad-args", message: "Hôte ou port invalide.")
            return
        }
        SocketAttempt().start(host: args.host, port: args.port, data: nil, timeoutMs: args.timeoutMs) { outcome in
            self.resolve(call, outcome: outcome, includeBytes: false)
        }
    }

    @objc func scan(_ call: CAPPluginCall) {
        let portValue = call.getInt("port") ?? 9100
        let timeoutMs = boundedTimeout(call.getInt("timeoutMs"), defaultValue: 600)
        guard (1...65535).contains(portValue),
              let prefix = Self.subnetPrefix(call.getString("subnet") ?? Self.wifiIPv4()) else {
            resolveError(call, code: "bad-args", message: "Sous-réseau ou port invalide.")
            return
        }

        scan(prefix: prefix, port: UInt16(portValue), timeoutMs: timeoutMs) { hosts in
            call.resolve(["ok": true, "hosts": hosts])
        }
    }

    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = secureKey(call) else { resolveError(call, code: "bad-args", message: "Clé sécurisée invalide."); return }
        call.resolve(["value": keychainRead(key) ?? NSNull()])
    }

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = secureKey(call), let value = call.getString("value") else { resolveError(call, code: "bad-args", message: "Valeur sécurisée invalide."); return }
        guard keychainWrite(key, value: value) else { resolveError(call, code: "secure-store", message: "Stockage sécurisé indisponible."); return }
        call.resolve()
    }

    @objc func secureRemove(_ call: CAPPluginCall) {
        guard let key = secureKey(call) else { resolveError(call, code: "bad-args", message: "Clé sécurisée invalide."); return }
        SecItemDelete(keychainQuery(key) as CFDictionary)
        call.resolve()
    }

    @objc func deviceIdentity(_ call: CAPPluginCall) {
        let key = "device-id"
        if let current = keychainRead(key), current.hasPrefix("kid_") { call.resolve(["id": current]); return }
        let value = "kid_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        guard keychainWrite(key, value: value) else { resolveError(call, code: "secure-store", message: "Identité appareil indisponible."); return }
        call.resolve(["id": value])
    }

    @objc func ledgerRead(_ call: CAPPluginCall) {
        guard let url = ledgerURL(call) else { resolveError(call, code: "bad-args", message: "Registre invalide."); return }
        let value = (try? String(contentsOf: url, encoding: .utf8))
        call.resolve(["value": value ?? NSNull()])
    }

    @objc func ledgerWrite(_ call: CAPPluginCall) {
        guard let url = ledgerURL(call), let value = call.getString("value"), value.utf8.count <= 5_000_000 else { resolveError(call, code: "bad-args", message: "Registre invalide."); return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try value.write(to: url, atomically: true, encoding: .utf8)
            call.resolve()
        } catch { resolveError(call, code: "ledger-write", message: "Registre d’impression indisponible.") }
    }

    @objc func checkBiometrics(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let isAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let biometryType: String
        if #available(iOS 11.0, *) {
            switch context.biometryType {
            case .faceID: biometryType = "faceId"
            case .touchID: biometryType = "touchId"
            case .opticID: biometryType = "opticId"
            default: biometryType = "none"
            }
        } else {
            biometryType = isAvailable ? "touchId" : "none"
        }
        call.resolve([
            "isAvailable": isAvailable,
            "biometryType": biometryType,
            "errorCode": error != nil ? error!.code : NSNull()
        ])
    }

    @objc func authenticateBiometric(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Déverrouiller Kiwi Pro"
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            let code = error != nil ? "\(error!.code)" : "unavailable"
            call.resolve(["authenticated": false, "errorCode": code, "fallback": true])
            return
        }
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["authenticated": true])
                } else {
                    let errCode = (evalError as? NSError)?.code ?? -1
                    call.resolve(["authenticated": false, "errorCode": errCode, "fallback": true])
                }
            }
        }
    }

    private func ledgerURL(_ call: CAPPluginCall) -> URL? {
        guard let name = call.getString("name"), name.range(of: "^[a-z0-9-]{1,96}$", options: .regularExpression) != nil,
              let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return base.appendingPathComponent("KiwiPrint", isDirectory: true).appendingPathComponent(name + ".json")
    }

    private func secureKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"), key.range(of: "^[a-z0-9-]{1,64}$", options: .regularExpression) != nil else { return nil }
        return key
    }

    private func keychainQuery(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.kiwios.pro.secure", kSecAttrAccount as String: key]
    }

    private func keychainRead(_ key: String) -> String? {
        var query = keychainQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func keychainWrite(_ key: String, value: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let query = keychainQuery(key)
        let attrs = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as [String: Any]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecSuccess { return true }
        if status != errSecItemNotFound { return false }
        return SecItemAdd(query.merging(attrs) { _, new in new } as CFDictionary, nil) == errSecSuccess
    }

    private func endpointArgs(_ call: CAPPluginCall) -> (host: String, port: UInt16, timeoutMs: Int)? {
        guard let rawHost = call.getString("host")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !rawHost.isEmpty, !rawHost.contains(where: { $0.isWhitespace }),
              let port = call.getInt("port"), (1...65535).contains(port) else { return nil }
        return (rawHost, UInt16(port), boundedTimeout(call.getInt("timeoutMs"), defaultValue: 4000))
    }

    private func boundedTimeout(_ value: Int?, defaultValue: Int) -> Int {
        min(max(value ?? defaultValue, 100), 30_000)
    }

    private func resolve(_ call: CAPPluginCall, outcome: SocketOutcome, includeBytes: Bool = true) {
        if outcome.ok {
            var result: JSObject = ["ok": true, "ms": outcome.ms]
            if includeBytes { result["bytes"] = outcome.bytes }
            call.resolve(result)
        } else {
            resolveError(call, code: outcome.code ?? "unreachable", message: outcome.message ?? "Imprimante injoignable.")
        }
    }

    private func resolveError(_ call: CAPPluginCall, code: String, message: String) {
        call.resolve(["ok": false, "code": code, "message": message])
    }

    private func scan(prefix: String, port: UInt16, timeoutMs: Int, completion: @escaping ([JSObject]) -> Void) {
        let state = DispatchQueue(label: "com.kiwios.printer-socket.scan")
        var nextHost = 1
        var active = 0
        var found: [JSObject] = []
        var launch: (() -> Void)!
        launch = {
            while active < 32 && nextHost <= 254 {
                let host = "\(prefix).\(nextHost)"
                nextHost += 1
                active += 1
                SocketAttempt().start(host: host, port: port, data: nil, timeoutMs: timeoutMs) { outcome in
                    state.async {
                        active -= 1
                        if outcome.ok { found.append(["host": host, "ms": outcome.ms]) }
                        if nextHost > 254 && active == 0 {
                            completion(found.sorted { ($0["host"] as? String ?? "") < ($1["host"] as? String ?? "") })
                        } else {
                            launch()
                        }
                    }
                }
            }
        }
        state.async { launch() }
    }

    fileprivate static func map(_ error: NWError) -> (String, String) {
        if case .posix(let code) = error {
            switch code {
            case .ETIMEDOUT: return ("timeout", "Connexion à l'imprimante expirée.")
            case .ECONNREFUSED: return ("refused", "Connexion refusée par l'imprimante.")
            case .EACCES, .EPERM: return ("local-network-denied", "Accès au réseau local non autorisé.")
            case .ENETUNREACH, .EHOSTUNREACH, .EHOSTDOWN: return ("unreachable", "Imprimante inaccessible sur ce réseau.")
            default: return ("unreachable", "Connexion réseau impossible.")
            }
        }
        return ("unreachable", "Connexion réseau impossible.")
    }

    private static func subnetPrefix(_ value: String?) -> String? {
        guard var value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        if value.hasSuffix("/24") { value.removeLast(3) }
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 || parts.count == 4 else { return nil }
        let octets = parts.compactMap { Int($0) }
        guard octets.count == parts.count, octets.allSatisfy({ (0...255).contains($0) }) else { return nil }
        if parts.count == 4 && octets[3] != 0 { return nil }
        return octets.prefix(3).map(String.init).joined(separator: ".")
    }

    private static func wifiIPv4() -> String? {
        var address: String?
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else { return nil }
        defer { freeifaddrs(interfaces) }
        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let interface = pointer.pointee
            guard let socketAddress = interface.ifa_addr,
                  socketAddress.pointee.sa_family == UInt8(AF_INET),
                  String(cString: interface.ifa_name) == "en0" else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(socketAddress, socklen_t(socketAddress.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                address = String(cString: host)
                break
            }
        }
        return address
    }
}
