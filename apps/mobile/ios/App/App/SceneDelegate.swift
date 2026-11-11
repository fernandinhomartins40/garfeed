import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GarfeedViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Barra de status legível sobre o topo do painel (que desenha sob ela, viewport-fit=cover): a cor do texto segue
/// o <meta name="theme-color"> da página — fundo escuro (marinho) → texto branco; fundo claro → texto escuro.
class GarfeedViewController: CAPBridgeViewController {
    private var themeObserver: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        themeObserver = webView?.observe(\.themeColor, options: [.initial, .new]) { [weak self] web, _ in
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
            let light = web.themeColor?.getRed(&r, green: &g, blue: &b, alpha: nil) == true && 0.299 * r + 0.587 * g + 0.114 * b > 0.6
            DispatchQueue.main.async { self?.setStatusBarStyle(light ? .darkContent : .lightContent) }
        }
    }
}
