import { AppState, Platform } from 'react-native';
import { fetchProviderBookingsApi, getStoredProviderUser } from './api';

export const PENDING_BOOKINGS_NOTIFICATION_ID = 'pending-bookings-alert';
export const PENDING_BOOKINGS_CHANNEL_ID = 'pending-bookings';
export const PENDING_BOOKINGS_BG_TASK = 'serveasy-pending-bookings-bg-task';

function getNotificationsModule(): typeof import('expo-notifications') | null {
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

function getTaskManagerModule(): typeof import('expo-task-manager') | null {
  try {
    return require('expo-task-manager');
  } catch {
    return null;
  }
}

function getBackgroundTaskModule(): typeof import('expo-background-task') | null {
  try {
    return require('expo-background-task');
  } catch {
    return null;
  }
}

async function ensurePendingBookingsChannel(Notifications: typeof import('expo-notifications')): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(PENDING_BOOKINGS_CHANNEL_ID, {
      name: 'Pending Booking Alerts',
      description: 'Shows awaiting customer booking requests in the phone notification bar.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 250, 400],
      enableVibrate: true,
      showBadge: true,
      sound: 'serveasy_booking_ringtone.wav',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (err) {
    console.warn('[NotificationService] Failed to set notification channel:', err);
  }
}

/**
 * Display or update the system notification bar alert for pending bookings.
 */
export async function showPendingBookingsNotification(pendingCount: number): Promise<void> {
  if (pendingCount <= 0) {
    await clearPendingBookingsNotification();
    return;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted && perms.status !== 'granted') {
      return;
    }

    await ensurePendingBookingsChannel(Notifications);

    const plural = pendingCount > 1 ? 's' : '';
    await Notifications.scheduleNotificationAsync({
      identifier: PENDING_BOOKINGS_NOTIFICATION_ID,
      content: {
        title: `${pendingCount} Pending Booking${plural} Awaiting Action`,
        body: 'Tap to review and accept incoming requests.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        color: '#FFD60A',
        badge: pendingCount,
        data: {
          type: 'pending_bookings',
          actionTab: 'bookings',
          filter: 'pending',
          pendingCount,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: PENDING_BOOKINGS_CHANNEL_ID } : null,
    });
  } catch (err) {
    console.warn('[NotificationService] Failed to schedule pending booking notification:', err);
  }
}

/**
 * Dismiss the pending bookings notification from the system notification bar.
 */
export async function clearPendingBookingsNotification(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  try {
    await Notifications.dismissNotificationAsync(PENDING_BOOKINGS_NOTIFICATION_ID);
  } catch (err) {
    console.warn('[NotificationService] Failed to dismiss notification:', err);
  }
}

// Register global TaskManager executor at module scope for periodic background wakes when closed.
(function registerBackgroundTaskDefinition() {
  const TaskManager = getTaskManagerModule();
  const BackgroundTask = getBackgroundTaskModule();
  if (!TaskManager || !BackgroundTask) return;

  try {
    if (!TaskManager.isTaskDefined(PENDING_BOOKINGS_BG_TASK)) {
      TaskManager.defineTask(PENDING_BOOKINGS_BG_TASK, async () => {
        try {
          const user = await getStoredProviderUser();
          if (!user?.id) {
            return BackgroundTask.BackgroundTaskResult.Success;
          }

          const bookings = await fetchProviderBookingsApi(user.id);
          const pendingCount = bookings.filter((b) => b.status === 'pending').length;

          // Only show in phone notification bar when app is closed/backgrounded
          if (AppState.currentState !== 'active') {
            if (pendingCount > 0) {
              await showPendingBookingsNotification(pendingCount);
            } else {
              await clearPendingBookingsNotification();
            }
          }
          return BackgroundTask.BackgroundTaskResult.Success;
        } catch (err) {
          console.warn('[NotificationService] Background pending check error:', err);
          return BackgroundTask.BackgroundTaskResult.Failed;
        }
      });
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to define background task:', err);
  }
})();

class NotificationServiceManager {
  private isInitialized = false;

  /**
   * Configure foreground notification handler, Android channel, permissions,
   * and periodic background task for pending bookings.
   */
  public async initialize(): Promise<void> {
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    try {
      if (!this.isInitialized) {
        this.isInitialized = true;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      }

      await ensurePendingBookingsChannel(Notifications);

      const currentPerms = await Notifications.getPermissionsAsync();
      if (!currentPerms.granted && currentPerms.canAskAgain !== false) {
        await Notifications.requestPermissionsAsync();
      }

      const BackgroundTask = getBackgroundTaskModule();
      const TaskManager = getTaskManagerModule();
      if (BackgroundTask && TaskManager) {
        const status = await BackgroundTask.getStatusAsync();
        if (status === BackgroundTask.BackgroundTaskStatus.Available) {
          const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(PENDING_BOOKINGS_BG_TASK);
          if (!alreadyRegistered) {
            await BackgroundTask.registerTaskAsync(PENDING_BOOKINGS_BG_TASK, {
              minimumInterval: 15,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[NotificationService] Initialization error:', err);
    }
  }

  public showPendingBookingsNotification = showPendingBookingsNotification;
  public clearPendingBookingsNotification = clearPendingBookingsNotification;

  /**
   * Subscribe to notification taps and handle any initial notification that launched the app.
   */
  public subscribeToNotificationTap(onOpenPendingBookings: () => void): () => void {
    const Notifications = getNotificationsModule();
    if (!Notifications) return () => {};

    let isDisposed = false;
    (async () => {
      try {
        const lastResponse =
          (Notifications.getLastNotificationResponseAsync
            ? await Notifications.getLastNotificationResponseAsync()
            : Notifications.getLastNotificationResponse?.()) ?? null;
        if (!isDisposed && lastResponse?.notification?.request?.content?.data?.actionTab === 'bookings') {
          onOpenPendingBookings();
          Notifications.clearLastNotificationResponse?.();
        }
      } catch (_) {}
    })();

    let sub: { remove: () => void } | null = null;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response?.notification?.request?.content?.data;
        if (data?.actionTab === 'bookings' || data?.type === 'pending_bookings') {
          onOpenPendingBookings();
        }
      });
    } catch (err) {
      console.warn('[NotificationService] Listener setup error:', err);
    }

    return () => {
      isDisposed = true;
      try {
        sub?.remove();
      } catch (_) {}
    };
  }
}

export const NotificationService = new NotificationServiceManager();
