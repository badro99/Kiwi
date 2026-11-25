import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Accords du patron : les boutons Accepter / Refuser de la notification.
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([KiwiApprovalActions.category()])
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Notifications push (Le point du matin). L'enregistrement n'est demandé que
    // lorsque le propriétaire active la bascule ; le jeton est remis à la page
    // par KiwiNativeShellCoordinator, jamais journalisé.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .kiwiPushToken, object: nil, userInfo: ["token": hex])
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .kiwiPushToken, object: nil, userInfo: [:])
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// MARK: Accords du patron (functions/api/approvals.js)
//
// Une demande de la caisse arrive avec la catégorie KIWI_APPROVAL et
// userInfo["kiwiApproval"] = {id, merchant}. Accepter ou Refuser depuis l'écran
// verrouillé demande le déverrouillage (authenticationRequired), puis la
// réponse part avec la session du patron (les cookies de CapacitorHttp sont
// dans HTTPCookieStorage.shared, comme pour toute requête de l'app). Toucher la
// notification ouvre l'app : la page relit les demandes en attente.
extension AppDelegate: UNUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        guard let ask = info["kiwiApproval"] as? [String: Any],
              let id = ask["id"] as? String, let merchant = ask["merchant"] as? String else {
            completionHandler(); return
        }
        switch response.actionIdentifier {
        case KiwiApprovalActions.approve, KiwiApprovalActions.refuse:
            let verdict = response.actionIdentifier == KiwiApprovalActions.approve ? "approve" : "refuse"
            KiwiApprovalActions.decide(id: id, merchant: merchant, verdict: verdict, done: completionHandler)
        default:
            NotificationCenter.default.post(name: .kiwiApprovalOpened, object: nil, userInfo: ["id": id])
            completionHandler()
        }
    }
}

enum KiwiApprovalActions {
    static let approve = "KIWI_APPROVE"
    static let refuse = "KIWI_REFUSE"

    private static func word(_ fr: String, _ en: String, _ ar: String) -> String {
        let lang = Locale.preferredLanguages.first?.prefix(2) ?? "fr"
        return lang == "ar" ? ar : lang == "en" ? en : fr
    }

    static func category() -> UNNotificationCategory {
        let yes = UNNotificationAction(identifier: approve, title: word("Accepter", "Approve", "قبول"), options: [.authenticationRequired])
        let no = UNNotificationAction(identifier: refuse, title: word("Refuser", "Refuse", "رفض"), options: [.authenticationRequired, .destructive])
        return UNNotificationCategory(identifier: "KIWI_APPROVAL", actions: [yes, no], intentIdentifiers: [], options: [])
    }

    static func decide(id: String, merchant: String, verdict: String, done: @escaping () -> Void) {
        guard let url = URL(string: "https://kiwi-os.com/api/approvals"),
              let body = try? JSONSerialization.data(withJSONObject: ["action": "decide", "merchant": merchant, "id": id, "verdict": verdict]) else {
            done(); return
        }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            // 409 : déjà décidée ailleurs (tableau de bord, autre téléphone), rien à redire.
            if !(200..<300).contains(status) && status != 409 { notifyFailure() }
            DispatchQueue.main.async {
                done()
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
            }
        }.resume()
    }

    private static func notifyFailure() {
        let content = UNMutableNotificationContent()
        content.title = word("Réponse non envoyée", "Answer not sent", "لم يُرسل الرد")
        content.body = word("Ouvrez Kiwi Pro pour répondre à la caisse.", "Open Kiwi Pro to answer the till.", "افتح Kiwi Pro للرد على الصندوق.")
        let request = UNNotificationRequest(identifier: "kiwi-approval-failed-" + UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
}

