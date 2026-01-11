#!/usr/bin/env swift

import Foundation
import UserNotifications

// MARK: - Notification Delegate
class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    var response: String?
    let semaphore = DispatchSemaphore(value: 0)

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               didReceive response: UNNotificationResponse,
                               withCompletionHandler completionHandler: @escaping () -> Void) {
        self.response = response.actionIdentifier
        semaphore.signal()
        completionHandler()
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                               willPresent notification: UNNotification,
                               withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }
}

// MARK: - Main Program
func main() {
    // Parse command line arguments
    let args = CommandLine.arguments
    guard args.count >= 4 else {
        print("Usage: claude-notifier <tool> <details> <cwd> [timeout]")
        exit(1)
    }

    let tool = args[1]
    let details = args[2]
    let cwd = args[3]
    let timeout = args.count >= 5 ? Double(args[4]) ?? 120.0 : 120.0

    // Set up notification center
    let center = UNUserNotificationCenter.current()
    let delegate = NotificationDelegate()
    center.delegate = delegate

    // Request authorization
    let semaphore = DispatchSemaphore(value: 0)
    var authorized = false

    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
        authorized = granted
        semaphore.signal()
    }

    semaphore.wait()

    guard authorized else {
        print("ERROR: Notification permission denied")
        exit(1)
    }

    // Define notification actions
    let approveOnce = UNNotificationAction(
        identifier: "APPROVE_ONCE",
        title: "Approve Once",
        options: []
    )

    let approveSession = UNNotificationAction(
        identifier: "APPROVE_SESSION",
        title: "Approve Session",
        options: []
    )

    let deny = UNNotificationAction(
        identifier: "DENY",
        title: "Deny",
        options: [.destructive]
    )

    // Define notification category
    let category = UNNotificationCategory(
        identifier: "CLAUDE_APPROVAL",
        actions: [approveOnce, approveSession, deny],
        intentIdentifiers: [],
        options: []
    )

    center.setNotificationCategories([category])

    // Create notification content
    let content = UNMutableNotificationContent()
    content.title = "Claude Code Approval"
    content.subtitle = "Tool: \(tool)"
    content.body = details
    content.sound = .default
    content.categoryIdentifier = "CLAUDE_APPROVAL"
    content.userInfo = ["cwd": cwd]

    // Create trigger (immediate)
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)

    // Create request
    let requestID = UUID().uuidString
    let request = UNNotificationRequest(identifier: requestID, content: content, trigger: trigger)

    // Add notification
    center.add(request) { error in
        if let error = error {
            print("ERROR: Failed to add notification: \(error)")
            exit(1)
        }
    }

    // Wait for response with timeout
    let result = delegate.semaphore.wait(timeout: .now() + timeout)

    // Process result
    if result == .timedOut {
        print("TIMEOUT")
        exit(1)
    }

    guard let actionID = delegate.response else {
        print("DENIED")
        exit(1)
    }

    switch actionID {
    case "APPROVE_ONCE":
        print("APPROVED:once")
        exit(0)
    case "APPROVE_SESSION":
        print("APPROVED:session-tool")
        exit(0)
    case "DENY", UNNotificationDismissActionIdentifier, UNNotificationDefaultActionIdentifier:
        print("DENIED")
        exit(1)
    default:
        print("DENIED")
        exit(1)
    }
}

// Run the program
main()
RunLoop.main.run()
