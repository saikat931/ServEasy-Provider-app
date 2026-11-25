import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Image,
  Platform,
  StyleProp,
  ViewStyle,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Animated,
  Vibration,
  AppState,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Updates from 'expo-updates';

// Import our custom reusable components
import { GlassCard } from './src/components/GlassCard';
import { Splash } from './src/components/Splash';
import { ProviderAuthModal } from './src/components/ProviderAuthModal';
import { RingtoneSettingsModal } from './src/components/RingtoneSettingsModal';
import { RingtoneService } from './src/services/RingtoneService';
import { NotificationService } from './src/services/NotificationService';
import {
  ProviderBooking,
  ProviderServiceItem,
  ProviderUser,
  ProviderProfileData,
  ProviderBankAccount,
  ProviderBranchItem,
  ProviderStats,
  fetchProviderBookingsApi,
  fetchProviderServicesApi,
  fetchProviderStatsApi,
  updateProviderBookingStatusApi,
  pollProviderLiveEventsApi,
  fetchProviderProfileApi,
  saveProviderProfileApi,
  saveProviderBankAccountApi,
  registerCompanyApi,
  addBranchApi,
  getStoredProviderUser,
  clearStoredProviderUser,
  LiveProviderEvent,
  markBookingPaidApi,
  payProviderServiceChargeApi,
  getProviderServiceChargesApi,
  createProviderServiceApi,
  updateProviderLiveLocationApi,
  fetchProviderLiveLocationApi,
} from './src/services/api';
import { reverseGeocodeCoords, acquireDeviceLocation, getGoogleMapTileUrl, DoorstepAddressResult } from './src/services/locationHelper';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Android optimization wrapper to bypass expensive BlurView screenshots on Android
interface GlassWrapperProps {
  intensity: number;
  tint: 'light' | 'dark' | 'default';
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const GlassWrapper: React.FC<GlassWrapperProps> = ({ intensity, tint, style, children }) => {
  if (Platform.OS === 'android') {
    const fallbackBg = tint === 'dark' ? 'rgba(15, 17, 20, 0.88)' : 'rgba(240, 246, 255, 0.90)';
    return <View style={[{ backgroundColor: fallbackBg }, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
};

// Responsive check (tablet/large screen vs mobile phone)
const isMobile = SCREEN_WIDTH < 768;

interface ToastNotice {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'info' | 'warning';
  actionTab?: 'dashboard' | 'services' | 'bookings' | 'wallet' | 'profile' | 'verification';
  isLiveBooking?: boolean;
  bookingId?: number;
}

interface CustomAlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertData {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger' | 'start';
  icon: string;
  iconColor: string;
  buttons: CustomAlertButton[];
}

function ProviderAppContent() {
  const insets = useSafeAreaInsets();
  // Splash Screen Visibility State
  const [showSplash, setShowSplash] = useState(true);

  // Authentication State
  const [providerUser, setProviderUser] = useState<ProviderUser | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Theme Toggle: 'dark' (Pure Dark Theme) or 'light' (Bright Blue & White Theme)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Sidebar state: collapsed or expanded (only used on tablet/desktop)
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // Active navigation section: 'dashboard', 'services', 'bookings', 'wallet', 'profile', 'verification'
  const [activeSection, setActiveSection] = useState<'dashboard' | 'services' | 'bookings' | 'wallet' | 'profile' | 'verification'>('dashboard');

  // Mobile Right Sidebar Drawer State & Smooth Slide Animation
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false);
  const drawerSlideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  useEffect(() => {
    if (rightSidebarVisible) {
      Animated.spring(drawerSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        mass: 0.8,
        stiffness: 180,
      }).start();
    } else {
      Animated.timing(drawerSlideAnim, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [rightSidebarVisible]);

  // Instantly apply the latest OTA update on launch so stale bundles with gray screens are automatically purged
  useEffect(() => {
    let isMounted = true;
    async function syncOta() {
      try {
        if (__DEV__) return;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable && isMounted) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (_) {}
    }
    syncOta();
    return () => {
      isMounted = false;
    };
  }, []);

  // Smoothly slide out right drawer before setting visible to false
  const closeRightDrawer = () => {
    Animated.timing(drawerSlideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setRightSidebarVisible(false);
    });
  };

  // Bookings filter for Bookings Manager tab
  const [bookingFilter, setBookingFilter] = useState<'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'>('all');

  // Live Booking Ringtone & Alert Settings States
  const [ringtoneSettingsModalVisible, setRingtoneSettingsModalVisible] = useState<boolean>(false);
  const activeRingingBookingIdRef = useRef<number | string | null>(null);
  const handledBookingIdsRef = useRef<Set<number>>(new Set());

  // Site Service Charge Dues State
  const [serviceChargeDue, setServiceChargeDue] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [showPayDuesModal, setShowPayDuesModal] = useState(false);
  const [isPayingDues, setIsPayingDues] = useState(false);

  // Add Service Modal state
  const [addServiceModalVisible, setAddServiceModalVisible] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceSub, setNewServiceSub] = useState('');
  const [newServiceRate, setNewServiceRate] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('');

  // Quick View Modal state
  const [quickViewBooking, setQuickViewBooking] = useState<ProviderBooking | null>(null);
  const [quickViewService, setQuickViewService] = useState<ProviderServiceItem | null>(null);
  const [qrModalBooking, setQrModalBooking] = useState<ProviderBooking | null>(null);

  // Edit Service Modal state
  const [editingService, setEditingService] = useState<ProviderServiceItem | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceSub, setEditServiceSub] = useState('');
  const [editServiceRate, setEditServiceRate] = useState('');
  const [editServiceDuration, setEditServiceDuration] = useState('');
  const [editServiceIsActive, setEditServiceIsActive] = useState(true);

  // Stylish Custom Alert / Confirmation Modal State
  const [customAlert, setCustomAlert] = useState<CustomAlertData | null>(null);

  const showCustomAlert = (
    title: string,
    message?: string,
    buttons?: CustomAlertButton[]
  ) => {
    const lowerTitle = (title || '').toLowerCase();
    const lowerMsg = (message || '').toLowerCase();

    let type: 'info' | 'success' | 'warning' | 'danger' | 'start' = 'info';
    let icon = 'information-outline';
    let iconColor = '#0084FF';

    if (lowerTitle.includes('start') || lowerTitle.includes('begin')) {
      type = 'start';
      icon = 'play-circle-outline';
      iconColor = '#0084FF';
    } else if (
      lowerTitle.includes('decline') ||
      lowerTitle.includes('reject') ||
      lowerTitle.includes('delete') ||
      lowerTitle.includes('cancel') ||
      lowerTitle.includes('failed') ||
      lowerTitle.includes('error')
    ) {
      type = 'danger';
      icon = lowerTitle.includes('delete') ? 'trash-can-outline' : 'close-circle-outline';
      iconColor = '#FF453A';
    } else if (
      lowerTitle.includes('complete') ||
      lowerTitle.includes('completed') ||
      lowerTitle.includes('accepted') ||
      lowerTitle.includes('success') ||
      lowerTitle.includes('saved') ||
      lowerTitle.includes('added') ||
      lowerTitle.includes('registered')
    ) {
      type = 'success';
      icon = 'check-circle-outline';
      iconColor = '#30D158';
    } else if (
      lowerTitle.includes('missing') ||
      lowerTitle.includes('incomplete') ||
      lowerTitle.includes('required') ||
      lowerTitle.includes('sign in')
    ) {
      type = 'warning';
      icon = 'alert-circle-outline';
      iconColor = '#FF9500';
    }

    setCustomAlert({
      title,
      message: message || '',
      type,
      icon,
      iconColor,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }],
    });
  };

  // Shadow native Alert to use our stylish glassmorphic custom alert dialog
  const Alert = {
    alert: (title: string, message?: string, buttons?: CustomAlertButton[]) => {
      showCustomAlert(title, message, buttons);
    },
  };

  // Toast Notification state for Live Events
  const [liveToast, setLiveToast] = useState<ToastNotice | null>(null);
  const hasNotified100Ref = useRef(false);

  // Live Data States
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [bookings, setBookings] = useState<ProviderBooking[]>([]);
  const [profileData, setProfileData] = useState<ProviderProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);

  // Profile Form Edit States
  const [formFullName, setFormFullName] = useState('');
  const [formCompanyName, setFormCompanyName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formLandmark, setFormLandmark] = useState('');
  const [formPincode, setFormPincode] = useState('');
  const [formRangeKm, setFormRangeKm] = useState('10');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Map Pinning & Location States (Toggleable inline map)
  const [showProfileMap, setShowProfileMap] = useState(false);
  const [mapLatitude, setMapLatitude] = useState(22.6231);
  const [mapLongitude, setMapLongitude] = useState(88.4348);
  const [mapZoom, setMapZoom] = useState(16);
  const [mapLayer, setMapLayer] = useState<'roadmap' | 'satellite'>('roadmap');
  const [showMapPopup, setShowMapPopup] = useState(true);
  const [isLocating, setIsLocating] = useState(false);

  // Live GPS Tracking & Broadcaster States for In-Progress Jobs
  const [liveGpsActive, setLiveGpsActive] = useState(false);
  const [liveGpsCoords, setLiveGpsCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [liveGpsLastSent, setLiveGpsLastSent] = useState<string | null>(null);
  const [isBroadcastingGps, setIsBroadcastingGps] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef<number>(0);

  // Bank Account Modal & Edit States
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [bankHolderName, setBankHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankUpi, setBankUpi] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);

  // Register Company Modal States
  const [companyModalVisible, setCompanyModalVisible] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isRegisteringCompany, setIsRegisteringCompany] = useState(false);

  // Add Branch Modal States
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchLandmark, setNewBranchLandmark] = useState('');
  const [newBranchPincode, setNewBranchPincode] = useState('');
  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [isLocatingBranch, setIsLocatingBranch] = useState(false);

  // Active navigation section & open modal tracker refs for real-time async callbacks
  const activeSectionRef = useRef(activeSection);
  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const hasActiveModalRef = useRef(false);
  useEffect(() => {
    hasActiveModalRef.current =
      authModalVisible ||
      logoutModalVisible ||
      ringtoneSettingsModalVisible ||
      addServiceModalVisible ||
      bankModalVisible ||
      companyModalVisible ||
      branchModalVisible;
  }, [
    authModalVisible,
    logoutModalVisible,
    ringtoneSettingsModalVisible,
    addServiceModalVisible,
    bankModalVisible,
    companyModalVisible,
    branchModalVisible,
  ]);

  // Reference to track last SSE event ID to avoid duplicate alerts
  const lastEventIdRef = useRef<number>(0);
  const pollerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active Provider ID in use (null if not logged in)
  const activeProviderId = providerUser?.id || null;

  // Check stored login on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredProviderUser();
        if (stored) {
          setProviderUser(stored);
          loadLiveData(false, stored.id);
        } else {
          // If not logged in, show benefits and prompt provider to log in via OTP
          setAuthModalVisible(true);
        }
      } catch (e) {
        console.log('Error checking stored provider:', e);
      }
    })();
  }, []);

  // Server live statistics state
  const [serverStats, setServerStats] = useState<ProviderStats | null>(null);

  // Load Live Data from Database
  const loadLiveData = useCallback(async (isPullRefresh: boolean = false, overrideProviderId?: number) => {
    const targetProviderId = overrideProviderId || activeProviderId;
    if (!targetProviderId) {
      setBookings([]);
      setServices([]);
      setProfileData(null);
      setServerStats(null);
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    if (isPullRefresh) {
      setRefreshing(true);
      // Auto-check for OTA app updates on pull-to-refresh
      if (!__DEV__) {
        Updates.checkForUpdateAsync()
          .then(async (u) => {
            if (u.isAvailable) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            }
          })
          .catch(() => {});
      }
    }
    try {
      const [fetchedBookings, fetchedServices, fetchedProfile, fetchedCharges, fetchedStats] = await Promise.all([
        fetchProviderBookingsApi(targetProviderId),
        fetchProviderServicesApi(targetProviderId),
        fetchProviderProfileApi(targetProviderId),
        getProviderServiceChargesApi(targetProviderId),
        fetchProviderStatsApi(targetProviderId),
      ]);

      if (fetchedStats) {
        setServerStats(fetchedStats);
      }

      if (fetchedCharges && fetchedCharges.success) {
        setServiceChargeDue(fetchedCharges.totalDue);
        setWalletBalance(fetchedCharges.availableBalance);
      }

      if (fetchedBookings && Array.isArray(fetchedBookings)) {
        setBookings(fetchedBookings);
      } else {
        setBookings([]);
      }
      if (fetchedServices && Array.isArray(fetchedServices)) {
        setServices(fetchedServices);
      } else {
        setServices([]);
      }
      if (fetchedProfile) {
        setProfileData(fetchedProfile);
        setFormFullName(fetchedProfile.full_name || '');
        setFormCompanyName(fetchedProfile.company_name || '');
        setFormEmail(fetchedProfile.email || '');
        setFormPhone(fetchedProfile.phone || '');
        setFormAddress(fetchedProfile.location_address || '');
        setFormLandmark(fetchedProfile.landmark || '');
        setFormPincode(fetchedProfile.pincode || '');
        setFormRangeKm(String(fetchedProfile.service_range_km || 10));
        if (fetchedProfile.latitude) setMapLatitude(parseFloat(fetchedProfile.latitude) || 22.6231);
        if (fetchedProfile.longitude) setMapLongitude(parseFloat(fetchedProfile.longitude) || 88.4348);

        if (fetchedProfile.bank_account) {
          setBankHolderName(fetchedProfile.bank_account.account_holder_name || '');
          setBankName(fetchedProfile.bank_account.bank_name || '');
          setBankAccountNumber(fetchedProfile.bank_account.account_number || '');
          setBankIfsc(fetchedProfile.bank_account.ifsc_code || '');
          setBankUpi(fetchedProfile.bank_account.upi_id || '');
        }
      } else if (providerUser) {
        setFormFullName(`${providerUser.first_name || ''} ${providerUser.last_name || ''}`.trim());
        setFormEmail(providerUser.email || '');
        setFormPhone(providerUser.phone || '');
      }
    } catch (e) {
      console.log('Error loading provider data:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [activeProviderId, providerUser]);

  // Initial Data Load
  useEffect(() => {
    loadLiveData();
  }, [loadLiveData]);

  // Real-Time SSE Poller (matching Service Provider Web Portal index.php SSE listener)
  useEffect(() => {
    if (!activeProviderId) return;
    let isActive = true;

    const runPoll = async () => {
      try {
        const result = await pollProviderLiveEventsApi(activeProviderId, lastEventIdRef.current);
        if (!isActive) return;

        if (result.success && result.events && result.events.length > 0) {
          lastEventIdRef.current = result.lastEventId;

          const latestEvent: LiveProviderEvent = result.events[result.events.length - 1];
          const bNumber = latestEvent.payload?.booking_number || `#${latestEvent.booking_id}`;

          let toastTitle = '⚡ Live Booking Update';
          let toastMsg = `Booking ${bNumber} was updated`;
          let toastType: 'success' | 'info' | 'warning' = 'info';

          if (latestEvent.event_name === 'booking.created') {
            toastTitle = '🔔 New Booking Alert!';
            toastMsg = `New booking ${bNumber} received from ${latestEvent.payload?.customer_name || 'Customer'}!`;
            toastType = 'success';

            // Continuous ringtone and phone vibration alert (NO gray modal overlay)
            const bId = Number(latestEvent.booking_id || latestEvent.payload?.booking_id);
            if (bId && !handledBookingIdsRef.current.has(bId)) {
              handledBookingIdsRef.current.add(bId);
              activeRingingBookingIdRef.current = bId;

              // 1. Immediately trigger repeating vibration pattern on device
              try {
                Vibration.vibrate([0, 800, 400, 800, 400, 800], true);
              } catch (vErr) {
                console.warn('Vibration error:', vErr);
              }

              // 2. Play ringtone audio
              try {
                RingtoneService.startRinging(bId);
              } catch (rErr) {
                console.warn('Ringtone error:', rErr);
              }

              // 3. SMART AUTO-REDIRECT:
              // If provider is idle on Overview dashboard (and not in an open modal),
              // immediately auto-navigate to Bookings page with 'pending' filter!
              if (activeSectionRef.current === 'dashboard' && !hasActiveModalRef.current) {
                setBookingFilter('pending');
                setActiveSection('bookings');
              }
            }
          } else if (latestEvent.event_name === 'booking.accepted') {
            toastTitle = '✅ Booking Accepted';
            toastMsg = `Booking ${bNumber} has been accepted.`;
            toastType = 'info';
          } else if (latestEvent.event_name === 'booking.rejected') {
            toastTitle = '❌ Booking Rejected';
            toastMsg = `Booking ${bNumber} was declined.`;
            toastType = 'warning';
          } else if (latestEvent.event_name === 'booking.cancelled') {
            toastTitle = '❌ Booking Cancelled';
            toastMsg = `Booking ${bNumber} was cancelled by the customer.`;
            toastType = 'warning';

            // If cancelled booking is currently ringing, halt sound and vibration immediately
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            activeRingingBookingIdRef.current = null;
          }

          setLiveToast({
            id: Date.now(),
            title: toastTitle,
            message: toastMsg,
            type: toastType,
            actionTab: 'bookings',
            isLiveBooking: latestEvent.event_name === 'booking.created',
            bookingId: Number(latestEvent.booking_id || latestEvent.payload?.booking_id),
          });

          loadLiveData(false);
        } else if (result.lastEventId > 0) {
          lastEventIdRef.current = result.lastEventId;
        }
      } catch (e) {
        // Silent catch
      } finally {
        if (isActive) {
          pollerTimerRef.current = setTimeout(runPoll, 3500);
        }
      }
    };

    pollerTimerRef.current = setTimeout(runPoll, 2000);

    return () => {
      isActive = false;
      if (pollerTimerRef.current) clearTimeout(pollerTimerRef.current);
    };
  }, [activeProviderId, loadLiveData]);

  // Auto-dismiss live toast after 5 seconds (except for live incoming bookings which require provider action)
  useEffect(() => {
    if (!liveToast) return;
    if (liveToast.isLiveBooking) return;
    const t = setTimeout(() => {
      setLiveToast(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [liveToast]);

  // Surface 100% Profile Completion notice as a sleek top notification banner instead of taking up page space
  const isProfile100 = Boolean(
    (profileData?.progress?.is_100 ?? ((profileData?.progress?.percentage ?? 0) >= 100)) ||
    (profileData?.progress?.percentage ?? 0) >= 100
  );
  const completionPercent = profileData?.progress?.percentage ?? (isProfile100 ? 100 : 0);

  useEffect(() => {
    if (providerUser && isProfile100 && !hasNotified100Ref.current) {
      hasNotified100Ref.current = true;
      setLiveToast({
        id: Date.now(),
        title: '✅ Profile 100% Complete!',
        message: 'All 4 verification pillars are approved! You are eligible to add and offer services freely.',
        type: 'success',
        actionTab: 'services',
      });
    }
  }, [providerUser, isProfile100]);

  // Dynamic Stats calculated from database live statistics
  const totalServices = profileData?.stats?.total_services ?? serverStats?.total_services ?? serverStats?.products ?? services.length;
  const totalBookings = profileData?.stats?.total_bookings ?? serverStats?.total_bookings ?? serverStats?.orders ?? bookings.length;
  const completedBookings = bookings.filter((b) => b.status === 'completed');
  const totalRevenue = profileData?.stats?.total_sales ?? serverStats?.total_sales ?? (serverStats?.sales ? parseFloat(String(serverStats.sales).replace(/[^0-9.]/g, '')) : completedBookings.reduce((sum, b) => sum + (Number(b.price) || 0), 0));
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;

  // ─── Phone Notification Bar Alerts for Pending Bookings (When App Closed/Backgrounded) ─
  const pendingCountRef = useRef(pendingCount);
  pendingCountRef.current = pendingCount;
  const activeProviderIdRef = useRef(activeProviderId);
  activeProviderIdRef.current = activeProviderId;

  useEffect(() => {
    NotificationService.initialize();

    const unsubscribeTap = NotificationService.subscribeToNotificationTap(() => {
      setBookingFilter('pending');
      setActiveSection('bookings');
      NotificationService.clearPendingBookingsNotification();
    });

    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        if (activeProviderIdRef.current && pendingCountRef.current > 0) {
          NotificationService.showPendingBookingsNotification(pendingCountRef.current);
        }
      } else if (nextAppState === 'active') {
        NotificationService.clearPendingBookingsNotification();
      }
    });

    return () => {
      unsubscribeTap();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!activeProviderId || pendingCount <= 0) {
      NotificationService.clearPendingBookingsNotification();
    } else if (AppState.currentState === 'background') {
      NotificationService.showPendingBookingsNotification(pendingCount);
    }
  }, [activeProviderId, pendingCount]);

  // ─── Real-Time Live GPS Location Streaming for In-Progress Jobs ────────────
  const activeInProgressJob = bookings.find((b) => b.status === 'in_progress');

  useEffect(() => {
    const geo = (globalThis as any)?.navigator?.geolocation;
    if (!geo || !activeProviderId) {
      if (watchIdRef.current !== null) {
        try { geo?.clearWatch?.(watchIdRef.current); } catch (e) {}
        watchIdRef.current = null;
        setLiveGpsActive(false);
      }
      return;
    }

    if (activeInProgressJob) {
      setLiveGpsActive(true);
      const targetBookingId = activeInProgressJob.numericId;

      const handlePos = (pos: any) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = Number(pos.coords.accuracy?.toFixed(1) || 0);
        const heading = Number(pos.coords.heading?.toFixed(1) || 0);
        const speed = Number(pos.coords.speed?.toFixed(1) || 0);

        setLiveGpsCoords({ latitude: lat, longitude: lng, accuracy });
        setMapLatitude(lat);
        setMapLongitude(lng);

        // Throttle updates: send at most once every 6 seconds
        const now = Date.now();
        if (now - lastSendTimeRef.current >= 6000) {
          lastSendTimeRef.current = now;
          updateProviderLiveLocationApi({
            provider_id: activeProviderId,
            booking_id: targetBookingId,
            latitude: lat,
            longitude: lng,
            heading,
            speed,
            accuracy,
            status: 'in_progress',
          }).then((res) => {
            if (res.success) {
              setLiveGpsLastSent(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            }
          }).catch(() => {});
        }
      };

      try {
        if (watchIdRef.current === null) {
          watchIdRef.current = geo.watchPosition(
            handlePos,
            (err: any) => {
              console.log('[GPS Watcher] Geolocation watch error:', err);
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 2000 }
          );
        }
      } catch (e) {
        console.log('[GPS Watcher] Error starting watchPosition:', e);
      }
    } else {
      if (watchIdRef.current !== null) {
        try { geo.clearWatch(watchIdRef.current); } catch (e) {}
        watchIdRef.current = null;
      }
      setLiveGpsActive(false);
    }

    return () => {
      if (watchIdRef.current !== null && !activeInProgressJob) {
        try { geo?.clearWatch?.(watchIdRef.current); } catch (e) {}
        watchIdRef.current = null;
      }
    };
  }, [activeProviderId, activeInProgressJob?.numericId, activeInProgressJob?.status]);

  const handleManualBroadcastLocation = async () => {
    if (!activeProviderId) return;
    setIsBroadcastingGps(true);
    try {
      const loc = await acquireDeviceLocation();
      const lat = loc.latitude;
      const lng = loc.longitude;
      setLiveGpsCoords({ latitude: lat, longitude: lng, accuracy: 10 });
      setMapLatitude(lat);
      setMapLongitude(lng);

      const res = await updateProviderLiveLocationApi({
        provider_id: activeProviderId,
        booking_id: activeInProgressJob?.numericId,
        latitude: lat,
        longitude: lng,
        heading: 0,
        speed: 0,
        accuracy: 10,
        status: activeInProgressJob ? 'in_progress' : 'online',
      });

      if (res.success) {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLiveGpsLastSent(timeStr);
        showCustomAlert('Live GPS Synced 📍', `Location broadcasted to customer:\nLat: ${lat}\nLng: ${lng}\nTime: ${timeStr}`);
      } else {
        showCustomAlert('Broadcast Failed', res.message);
      }
    } catch (err) {
      showCustomAlert('GPS Notice', 'Unable to acquire current location.');
    } finally {
      setIsBroadcastingGps(false);
    }
  };

  // Theme Constants mapping
  const activeTheme = {
    gradientColors: theme === 'dark' ? (['#08090C', '#121417'] as const) : (['#D6ECFF', '#EBF5FF'] as const),
    circleGradient1: theme === 'dark' ? (['rgba(0, 132, 255, 0.22)', 'rgba(138, 43, 226, 0.05)'] as const) : (['#9AD0FF', '#E1F0FF'] as const),
    circleGradient2: theme === 'dark' ? (['rgba(213, 0, 249, 0.18)', 'rgba(0, 0, 0, 0)'] as const) : (['#BFE3FF', '#F2F9FF'] as const),
    cardBorder: theme === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.4)',
    statsCardBg: theme === 'dark' ? 'rgba(20, 22, 26, 0.22)' : 'rgba(0, 132, 255, 0.07)',
    statsCardBorder: theme === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 132, 255, 0.2)',
    textPrimary: theme === 'dark' ? '#FFFFFF' : '#1E293B',
    textSecondary: theme === 'dark' ? '#A0A5AD' : '#64748B',
    iconColor: theme === 'dark' ? '#FFFFFF' : '#0084FF',
    tableHeaderBg: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,132,255,0.06)',
    activeNavBg: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 132, 255, 0.15)',
    activeNavText: theme === 'dark' ? '#FFFFFF' : '#0084FF',
    statusPendingText: theme === 'dark' ? '#FFD60A' : '#B28600',
    statusPendingBg: theme === 'dark' ? 'rgba(255, 214, 10, 0.15)' : 'rgba(255, 214, 10, 0.25)',
    statusApprovedText: theme === 'dark' ? '#30D158' : '#1E873C',
    statusApprovedBg: theme === 'dark' ? 'rgba(48, 209, 88, 0.15)' : 'rgba(48, 209, 88, 0.25)',
    statusInProgressText: '#AF52DE',
    statusInProgressBg: 'rgba(175, 82, 222, 0.15)',
    statusCancelledText: '#FF453A',
    statusCancelledBg: 'rgba(255, 69, 58, 0.15)',
    glassIntensity: theme === 'dark' ? 25 : 30,
    accentBtnBg: theme === 'dark' ? 'rgba(25, 27, 30, 0.4)' : '#0084FF',
    accentBtnText: '#FFFFFF',
    inputBg: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 132, 255, 0.04)',
    inputBorder: theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 132, 255, 0.2)',
    pillInactiveBg: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 132, 255, 0.06)',
    pillInactiveText: theme === 'dark' ? '#A0A5AD' : '#64748B',
    navBg: Platform.OS === 'android'
      ? (theme === 'dark' ? 'rgba(15, 17, 20, 0.82)' : 'rgba(240, 246, 255, 0.85)')
      : (theme === 'dark' ? 'rgba(8, 9, 12, 0.22)' : 'rgba(255, 255, 255, 0.35)'),
  };

  const formatCurrency = (amt: number) => `₹${amt.toFixed(2)}`;

  const getStatusBadgeStyle = (status: ProviderBooking['status']) => {
    switch (status) {
      case 'pending':
        return { bg: activeTheme.statusPendingBg, text: activeTheme.statusPendingText, label: 'PENDING' };
      case 'accepted':
        return { bg: 'rgba(0, 132, 255, 0.15)', text: '#0084FF', label: 'ACCEPTED' };
      case 'in_progress':
        return { bg: activeTheme.statusInProgressBg, text: activeTheme.statusInProgressText, label: 'IN PROGRESS' };
      case 'completed':
        return { bg: activeTheme.statusApprovedBg, text: activeTheme.statusApprovedText, label: 'COMPLETED' };
      case 'rejected':
        return { bg: activeTheme.statusCancelledBg, text: activeTheme.statusCancelledText, label: 'REJECTED' };
      case 'cancelled':
      default:
        return { bg: activeTheme.statusCancelledBg, text: activeTheme.statusCancelledText, label: 'CANCELLED' };
    }
  };

  // Handle Logout (Triggers Pretty Confirmation Modal)
  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    try {
      Vibration.cancel();
      RingtoneService.stopRinging();
      NotificationService.clearPendingBookingsNotification();
    } catch (_) {}
    activeRingingBookingIdRef.current = null;
    setLogoutModalVisible(false);
    await clearStoredProviderUser();
    setProviderUser(null);
    setBookings([]);
    setServices([]);
    setProfileData(null);
    setActiveSection('dashboard');
    setAuthModalVisible(true);
    setLiveToast({
      id: Date.now(),
      title: '🔒 Signed Out',
      message: 'You have been safely signed out.',
      type: 'info',
    });
  };

  // ─── Booking Status Actions ──────────────────────────────────────────────────
  const handleAcceptBooking = async (booking: ProviderBooking) => {
    try {
      Vibration.cancel();
      RingtoneService.stopRinging();
      NotificationService.clearPendingBookingsNotification();
    } catch (_) {}
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to accept bookings.');
      return;
    }
    try {
      setActionInProgressId(booking.numericId);
      const res = await updateProviderBookingStatusApi(booking.numericId, 'accepted', activeProviderId);
      if (res.success) {
        setBookings((prev) =>
          prev.map((b) => (b.numericId === booking.numericId ? { ...b, status: 'accepted' } : b))
        );
        if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
          setQuickViewBooking({ ...quickViewBooking, status: 'accepted' });
        }
        showCustomAlert('Booking Accepted', `Booking ${booking.bookingNumber} is now confirmed.`);
      } else {
        const msg = res.message || '';
        if (msg.includes('OUTSTANDING_SERVICE_CHARGE')) {
          showCustomAlert(
            'Cannot Accept Booking',
            msg.replace('OUTSTANDING_SERVICE_CHARGE:', '').trim() + '\n\nPlease pay your site service charge to accept new customer bookings.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Pay Service Charge', onPress: () => setShowPayDuesModal(true) }
            ]
          );
        } else {
          showCustomAlert('Update Failed', msg);
        }
      }
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleRejectBooking = (booking: ProviderBooking) => {
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to decline bookings.');
      return;
    }
    showCustomAlert(
      'Decline Booking',
      `Are you sure you want to decline booking ${booking.bookingNumber}? This will notify the customer.`,
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Decline Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            try {
              setActionInProgressId(booking.numericId);
              const res = await updateProviderBookingStatusApi(booking.numericId, 'rejected', activeProviderId, 'Declined by provider');
              if (res.success) {
                setBookings((prev) =>
                  prev.map((b) => (b.numericId === booking.numericId ? { ...b, status: 'rejected' } : b))
                );
                if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
                  setQuickViewBooking({ ...quickViewBooking, status: 'rejected' });
                }
                showCustomAlert('Booking Declined', `Booking ${booking.bookingNumber} has been rejected.`);
              } else {
                showCustomAlert('Update Failed', res.message);
              }
            } finally {
              setActionInProgressId(null);
            }
          },
        },
      ]
    );
  };

  const handleCancelBooking = (booking: ProviderBooking) => {
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to cancel bookings.');
      return;
    }
    showCustomAlert(
      'Cancel Booking',
      `Are you sure you want to cancel booking ${booking.bookingNumber}? The customer will be notified immediately.`,
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            try {
              setActionInProgressId(booking.numericId);
              const res = await updateProviderBookingStatusApi(booking.numericId, 'cancelled', activeProviderId, 'Cancelled by provider');
              if (res.success) {
                setBookings((prev) =>
                  prev.map((b) => (b.numericId === booking.numericId ? { ...b, status: 'cancelled' } : b))
                );
                if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
                  setQuickViewBooking({ ...quickViewBooking, status: 'cancelled' });
                }
                showCustomAlert('Booking Cancelled', `Booking ${booking.bookingNumber} has been cancelled.`);
              } else {
                showCustomAlert('Update Failed', res.message);
              }
            } finally {
              setActionInProgressId(null);
            }
          },
        },
      ]
    );
  };

  const handleStartJob = (booking: ProviderBooking) => {
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to start jobs.');
      return;
    }
    showCustomAlert(
      'Start Service Job',
      `Begin service for booking ${booking.bookingNumber}? This marks the status as IN PROGRESS.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Job',
          onPress: async () => {
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            try {
              setActionInProgressId(booking.numericId);
              const res = await updateProviderBookingStatusApi(booking.numericId, 'in_progress', activeProviderId);
              if (res.success) {
                setBookings((prev) =>
                  prev.map((b) => (b.numericId === booking.numericId ? { ...b, status: 'in_progress' } : b))
                );
                if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
                  setQuickViewBooking({ ...quickViewBooking, status: 'in_progress' });
                }
                showCustomAlert('Job Started', `Booking ${booking.bookingNumber} is now In Progress.`);
              } else {
                showCustomAlert('Update Failed', res.message);
              }
            } finally {
              setActionInProgressId(null);
            }
          },
        },
      ]
    );
  };

  const fetchServiceChargeDues = async () => {
    if (!activeProviderId) return;
    const res = await getProviderServiceChargesApi(activeProviderId);
    if (res.success) {
      setServiceChargeDue(res.totalDue);
      setWalletBalance(res.availableBalance);
    }
  };

  const handleShowQrModal = (booking: ProviderBooking) => {
    setQrModalBooking(booking);
  };

  const handleMarkBookingPaid = (booking: ProviderBooking) => {
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to record payments.');
      return;
    }
    showCustomAlert(
      'Confirm Cash Payment',
      `Did you collect ₹${booking.price.toFixed(2)} in cash from the customer for booking ${booking.bookingNumber}?\n\nThis marks the booking as PAID and records ₹20.00 site service charge due to your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cash Collected',
          onPress: async () => {
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            try {
              setActionInProgressId(booking.numericId);
              const res = await markBookingPaidApi(booking.numericId, activeProviderId);
              if (res.success) {
                setBookings((prev) =>
                  prev.map((b) =>
                    b.numericId === booking.numericId
                      ? { ...b, paymentStatus: 'PAID', paymentMethod: 'COD' }
                      : b
                  )
                );
                if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
                  setQuickViewBooking({ ...quickViewBooking, paymentStatus: 'PAID', paymentMethod: 'COD' });
                }
                fetchServiceChargeDues();
                showCustomAlert(
                  'Payment Marked as PAID! 🎉',
                  res.message + '\n\nNote: Please clear your site service charge to accept future bookings.'
                );
              } else {
                showCustomAlert('Payment Failed', res.message);
              }
            } finally {
              setActionInProgressId(null);
            }
          },
        },
      ]
    );
  };

  const handlePayServiceCharge = async (method: 'wallet' | 'online') => {
    if (!activeProviderId) return;
    setIsPayingDues(true);
    try {
      const res = await payProviderServiceChargeApi(activeProviderId, method);
      if (res.success) {
        setShowPayDuesModal(false);
        fetchServiceChargeDues();
        showCustomAlert('Dues Cleared! 🎉', res.message);
      } else {
        showCustomAlert('Payment Failed', res.message);
      }
    } finally {
      setIsPayingDues(false);
    }
  };

  const handleCompleteJob = (booking: ProviderBooking) => {
    if (!activeProviderId) {
      showCustomAlert('Sign In Required', 'Please sign in to complete jobs.');
      return;
    }
    showCustomAlert(
      'Complete Service',
      `Confirm service completion for booking ${booking.bookingNumber}? This will record revenue and conclude the booking.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete Job',
          onPress: async () => {
            try {
              Vibration.cancel();
              RingtoneService.stopRinging();
            } catch (_) {}
            try {
              setActionInProgressId(booking.numericId);
              const res = await updateProviderBookingStatusApi(booking.numericId, 'completed', activeProviderId);
              if (res.success) {
                setBookings((prev) =>
                  prev.map((b) => (b.numericId === booking.numericId ? { ...b, status: 'completed' } : b))
                );
                if (quickViewBooking && quickViewBooking.numericId === booking.numericId) {
                  setQuickViewBooking({ ...quickViewBooking, status: 'completed' });
                }
                showCustomAlert('Job Completed! 🎉', `Booking ${booking.bookingNumber} marked as completed.`);
              } else {
                showCustomAlert('Update Failed', res.message);
              }
            } finally {
              setActionInProgressId(null);
            }
          },
        },
      ]
    );
  };

  // ─── Save Profile Handler (Matching Service Provider index.php) ─────────────
  const handleSaveProfile = async () => {
    if (!activeProviderId) {
      Alert.alert('Sign In Required', 'Please sign in to save your profile.');
      return;
    }
    if (!formFullName || !formEmail || !formPhone) {
      Alert.alert('Missing Fields', 'Full Name, Email, and Phone Number are required.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await saveProviderProfileApi(activeProviderId, {
        full_name: formFullName,
        company_name: formCompanyName,
        email: formEmail,
        phone: formPhone,
        location_address: formAddress,
        landmark: formLandmark,
        pincode: formPincode,
        service_range_km: parseFloat(formRangeKm) || 10,
        latitude: String(mapLatitude),
        longitude: String(mapLongitude),
      });

      if (res.success) {
        Alert.alert('Profile Saved', 'Your provider account details and completion progress have been updated!');
        loadLiveData(false);
      } else {
        Alert.alert('Save Failed', res.message);
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ─── Map Pinning Handlers (Matching toggleProfileMap & useProfileLiveLocation) ─
  const handleUseLiveLocation = async () => {
    setIsLocating(true);
    try {
      const res = await acquireDeviceLocation();
      const lat = res.latitude;
      const lng = res.longitude;
      setMapLatitude(lat);
      setMapLongitude(lng);
      setShowMapPopup(true);

      if (res.address) setFormAddress(res.address);
      if (res.landmark) setFormLandmark(res.landmark);
      if (res.pincode) setFormPincode(res.pincode);

      if (activeProviderId) {
        updateProviderLiveLocationApi({
          provider_id: activeProviderId,
          latitude: lat,
          longitude: lng,
          accuracy: 10,
          status: 'online',
        }).catch(() => {});
      }

      Alert.alert(
        '📍 Live Location Pinned',
        `Doorstep location set:\n\n${res.address}\n\nLandmark: ${res.landmark || 'Nearby'}\nPincode: ${res.pincode || '6-digit'}`
      );
    } catch (e) {
      Alert.alert('Live Location Set 📍', `Pin coordinates updated.`);
    } finally {
      setIsLocating(false);
    }
  };

  const handleNudgeCoords = async (dLat: number, dLng: number) => {
    const newLat = Number((mapLatitude + dLat).toFixed(6));
    const newLng = Number((mapLongitude + dLng).toFixed(6));
    setMapLatitude(newLat);
    setMapLongitude(newLng);
    setShowMapPopup(true);

    try {
      const res = await reverseGeocodeCoords(newLat, newLng);
      if (res.address) setFormAddress(res.address);
      if (res.landmark) setFormLandmark(res.landmark);
      if (res.pincode) setFormPincode(res.pincode);
    } catch (e) {}
  };

  const handleZoomIn = () => setMapZoom((prev) => Math.min(prev + 1, 19));
  const handleZoomOut = () => setMapZoom((prev) => Math.max(prev - 1, 12));
  const handleToggleLayer = () => setMapLayer((prev) => (prev === 'roadmap' ? 'satellite' : 'roadmap'));

  const handleSyncPinDetails = async () => {
    setIsLocating(true);
    try {
      const res = await reverseGeocodeCoords(mapLatitude, mapLongitude);
      if (res.address) setFormAddress(res.address);
      if (res.landmark) setFormLandmark(res.landmark);
      if (res.pincode) setFormPincode(res.pincode);
      setShowMapPopup(true);
      Alert.alert('Pin Synced 📍', `Address updated from pin:\n\n${res.address}`);
    } catch (e) {
      // ignore
    } finally {
      setIsLocating(false);
    }
  };

  const handleOpenExternalMap = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${mapLatitude},${mapLongitude}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Unable to open Google Maps app.');
    });
  };

  // ─── Save Bank Account Handler ──────────────────────────────────────────────
  const handleSaveBankAccount = async () => {
    if (!activeProviderId) {
      Alert.alert('Sign In Required', 'Please sign in to save bank details.');
      return;
    }
    if (!bankHolderName || !bankName || !bankAccountNumber || !bankIfsc) {
      Alert.alert('Incomplete Bank Details', 'Account Holder Name, Bank Name, Account Number and IFSC Code are required.');
      return;
    }

    setIsSavingBank(true);
    try {
      const res = await saveProviderBankAccountApi(activeProviderId, {
        account_holder_name: bankHolderName,
        bank_name: bankName,
        account_number: bankAccountNumber,
        ifsc_code: bankIfsc,
        upi_id: bankUpi,
      });

      if (res.success) {
        Alert.alert('Bank Account Saved', 'Payout details saved successfully!');
        setBankModalVisible(false);
        loadLiveData(false);
      } else {
        Alert.alert('Update Failed', res.message);
      }
    } finally {
      setIsSavingBank(false);
    }
  };

  // ─── Register Company Handler ──────────────────────────────────────────────
  const handleRegisterCompany = async () => {
    if (!activeProviderId) return;
    if (!newCompanyName.trim()) {
      Alert.alert('Missing Name', 'Please enter your company or organization name.');
      return;
    }

    setIsRegisteringCompany(true);
    try {
      const res = await registerCompanyApi(activeProviderId, newCompanyName.trim());
      if (res.success) {
        Alert.alert('Company Registered! 🎉', res.message || 'Company name registered and branches unlocked.');
        setCompanyModalVisible(false);
        setNewCompanyName('');
        loadLiveData(false);
      } else {
        Alert.alert('Registration Failed', res.message);
      }
    } finally {
      setIsRegisteringCompany(false);
    }
  };

  // ─── Pin Branch Location Handler ───────────────────────────────────────────
  const handlePinBranchLocation = async () => {
    setIsLocatingBranch(true);
    try {
      const res = await acquireDeviceLocation();
      if (res.address) setNewBranchAddress(res.address);
      if (res.landmark) setNewBranchLandmark(res.landmark);
      if (res.pincode) setNewBranchPincode(res.pincode);
      Alert.alert('Branch Location Pinned 📍', `Branch doorstep address detected:\n\n${res.address}`);
    } catch (e) {
      Alert.alert('Location Notice', 'Could not resolve branch location.');
    } finally {
      setIsLocatingBranch(false);
    }
  };

  // ─── Add Branch Handler ────────────────────────────────────────────────────
  const handleAddBranch = async () => {
    if (!activeProviderId) return;
    if (!newBranchName.trim()) {
      Alert.alert('Missing Branch Name', 'Please enter a name for this branch.');
      return;
    }

    setIsAddingBranch(true);
    try {
      const res = await addBranchApi(activeProviderId, {
        branch_name: newBranchName.trim(),
        phone: newBranchPhone.trim(),
        address: newBranchAddress.trim(),
        landmark: newBranchLandmark.trim(),
        pincode: newBranchPincode.trim(),
      });

      if (res.success) {
        Alert.alert('Branch Added! 📍', res.message || 'Branch location added successfully.');
        setBranchModalVisible(false);
        setNewBranchName('');
        setNewBranchPhone('');
        setNewBranchAddress('');
        setNewBranchLandmark('');
        setNewBranchPincode('');
        loadLiveData(false);
      } else {
        Alert.alert('Failed to Add Branch', res.message);
      }
    } finally {
      setIsAddingBranch(false);
    }
  };

  const handleAddService = async () => {
    if (!newServiceName || !newServiceSub || !newServiceRate || !newServiceDuration) {
      Alert.alert('Missing Info', 'Please fill in all service details.');
      return;
    }
    const priceNum = parseFloat(newServiceRate) || 0;
    const durNum = parseInt(newServiceDuration) || 60;
    const idNum = Math.floor(100 + Math.random() * 900);
    const newService: ProviderServiceItem = {
      id: `#${idNum}`,
      numericId: idNum,
      name: newServiceName.trim(),
      subcategory: newServiceSub.trim(),
      rate: `₹${priceNum.toFixed(2)}`,
      duration: newServiceDuration.trim(),
      price: priceNum,
      isActive: true,
      approvalStatus: 'approved',
    };
    setServices((prev) => [newService, ...prev]);
    setNewServiceName('');
    setNewServiceSub('');
    setNewServiceRate('');
    setNewServiceDuration('');
    setAddServiceModalVisible(false);

    if (activeProviderId) {
      try {
        await createProviderServiceApi(activeProviderId, {
          name: newService.name,
          base_price: priceNum,
          duration_minutes: durNum,
          subcategory_name: newService.subcategory,
        });
        loadLiveData(false);
      } catch (e) {
        // Local state preserved
      }
    }
    Alert.alert('Success', 'New service added successfully!');
  };

  const handleDeleteService = (id: string) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setServices(services.filter((s) => s.id !== id));
        },
      },
    ]);
  };

  const handleOpenEditService = (service: ProviderServiceItem) => {
    setEditingService(service);
    setEditServiceName(service.name);
    setEditServiceSub(service.subcategory);
    const rawRate = service.rate ? service.rate.replace(/[^0-9.]/g, '') : String(service.price || '');
    setEditServiceRate(rawRate);
    setEditServiceDuration(service.duration);
    setEditServiceIsActive(service.isActive !== false);
  };

  const handleSaveEditService = () => {
    if (!editingService) return;
    if (!editServiceName.trim() || !editServiceSub.trim() || !editServiceRate.trim() || !editServiceDuration.trim()) {
      Alert.alert('Missing Info', 'Please fill in all service details.');
      return;
    }

    const priceNum = parseFloat(editServiceRate) || 0;
    const updatedServices = services.map((s) => {
      if (s.id === editingService.id) {
        return {
          ...s,
          name: editServiceName.trim(),
          subcategory: editServiceSub.trim(),
          rate: `₹${priceNum.toFixed(2)}`,
          duration: editServiceDuration.trim(),
          price: priceNum,
          isActive: editServiceIsActive,
        };
      }
      return s;
    });

    setServices(updatedServices);
    setEditingService(null);
    Alert.alert('Service Updated', `"${editServiceName.trim()}" details have been updated.`);
  };

  if (showSplash) {
    return <Splash onAnimationEnd={() => setShowSplash(false)} />;
  }

  // ─── Render Booking Card (Reusable & Distinct Card) ──────────────────────────
  const renderBookingCard = (booking: ProviderBooking, isCompact: boolean = false) => {
    const statusStyle = getStatusBadgeStyle(booking.status);
    const isBusy = actionInProgressId === booking.numericId;

    return (
      <View
        key={booking.id}
        style={[
          styles.distinctBookingCard,
          {
            backgroundColor: theme === 'dark' ? '#171B24' : '#FFFFFF',
            borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)',
          },
        ]}
      >
        {/* Status Accent Bar at top edge */}
        <View
          style={[
            styles.cardStatusAccentBar,
            { backgroundColor: statusStyle.text || '#0084FF' },
          ]}
        />

        {/* Top Header: ID Pill + Doorstep/Shop Badge + Status Badge */}
        <View style={styles.bookingCardHeaderRow}>
          <View style={styles.bookingCardIdGroup}>
            <View style={[styles.bookingIdPill, { backgroundColor: activeTheme.tableHeaderBg }]}>
              <MaterialCommunityIcons name="ticket-outline" size={12} color={activeTheme.textSecondary} />
              <Text style={[styles.bookingIdPillText, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                {booking.bookingNumber}
              </Text>
            </View>

            <View
              style={[
                styles.locationTypePillNew,
                {
                  backgroundColor: booking.locationType === 'doorstep' ? 'rgba(0,132,255,0.12)' : 'rgba(175,82,222,0.12)',
                  borderColor: booking.locationType === 'doorstep' ? 'rgba(0,132,255,0.25)' : 'rgba(175,82,222,0.25)',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={booking.locationType === 'doorstep' ? 'home-map-marker' : 'storefront-outline'}
                size={11}
                color={booking.locationType === 'doorstep' ? '#0084FF' : '#AF52DE'}
              />
              <Text
                style={[
                  styles.locationTypePillTextNew,
                  { color: booking.locationType === 'doorstep' ? '#0084FF' : '#AF52DE' },
                ]}
              >
                {booking.locationType === 'doorstep' ? 'Doorstep' : 'At Shop'}
              </Text>
            </View>
          </View>

          <View style={[styles.bookingStatusBadgeNew, { backgroundColor: statusStyle.bg }]}>
            <View style={[styles.statusDotSmall, { backgroundColor: statusStyle.text }]} />
            <Text style={[styles.bookingStatusTextNew, { color: statusStyle.text }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        {/* Customer Row */}
        <View style={styles.customerRow}>
          <View style={[styles.customerAvatar, { backgroundColor: activeTheme.activeNavBg }]}>
            <MaterialCommunityIcons name="account" size={18} color={activeTheme.activeNavText} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.customerNameTitle, { color: activeTheme.textPrimary }]} numberOfLines={1}>
              {booking.customerName}
            </Text>
            {booking.customerPhone ? (
              <Text style={[styles.customerSubText, { color: activeTheme.textSecondary }]}>
                {booking.customerPhone}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Inset Service & Price Box */}
        <View
          style={[
            styles.serviceInsetBox,
            {
              backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.32)' : '#F8FAFC',
              borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            },
          ]}
        >
          {/* Service Name & Price Row */}
          <View style={styles.servicePriceHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
              <MaterialCommunityIcons name="car-wash" size={16} color="#0084FF" />
              <Text style={[styles.serviceNameBold, { color: activeTheme.textPrimary }]} numberOfLines={1}>
                {booking.serviceName}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.priceHighlightText}>
                {formatCurrency(booking.price)}
              </Text>
              <View
                style={[
                  styles.paymentStatusBadge,
                  {
                    backgroundColor:
                      booking.paymentStatus === 'PAID'
                        ? 'rgba(48,209,88,0.16)'
                        : booking.paymentStatus === 'COD'
                        ? 'rgba(255,149,0,0.16)'
                        : 'rgba(255,214,10,0.16)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.paymentStatusBadgeText,
                    {
                      color:
                        booking.paymentStatus === 'PAID'
                          ? '#30D158'
                          : booking.paymentStatus === 'COD'
                          ? '#FF9500'
                          : activeTheme.statusPendingText,
                    },
                  ]}
                >
                  {booking.paymentStatus}
                </Text>
              </View>
            </View>
          </View>

          {/* Schedule Date & Time Row */}
          <View style={styles.scheduleRow}>
            <MaterialCommunityIcons name="calendar-clock" size={14} color={activeTheme.textSecondary} />
            <Text style={[styles.scheduleDateText, { color: activeTheme.textSecondary }]} numberOfLines={1}>
              {booking.date || 'TBD'} {booking.time ? `• ${booking.time}` : ''}
            </Text>
          </View>
        </View>

        {/* Card Actions Row */}
        <View style={styles.distinctCardActionsRow}>
          <TouchableOpacity
            onPress={() => setQuickViewBooking(booking)}
            style={[styles.quickViewButtonNew, { borderColor: activeTheme.cardBorder }]}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="eye-outline" size={15} color={activeTheme.textSecondary} />
            <Text style={[styles.quickViewButtonTextNew, { color: activeTheme.textSecondary }]}>Details</Text>
          </TouchableOpacity>

          {isBusy ? (
            <ActivityIndicator size="small" color="#0084FF" style={{ marginLeft: 12 }} />
          ) : (
            <View style={styles.actionButtonsGroupNew}>
              {booking.status === 'pending' && (
                <>
                  <TouchableOpacity
                    onPress={() => handleRejectBooking(booking)}
                    style={[styles.distinctActionBtn, styles.declineBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="close" size={15} color="#FF453A" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FF453A' }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAcceptBooking(booking)}
                    style={[styles.distinctActionBtn, styles.acceptBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FFFFFF' }]}>Accept</Text>
                  </TouchableOpacity>
                </>
              )}

              {booking.status === 'accepted' && (
                <>
                  <TouchableOpacity
                    onPress={() => handleRejectBooking(booking)}
                    style={[styles.distinctActionBtn, styles.declineBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="close" size={15} color="#FF453A" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FF453A' }]}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleStartJob(booking)}
                    style={[styles.distinctActionBtn, styles.startJobBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="play" size={15} color="#FFFFFF" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FFFFFF' }]}>Start Job</Text>
                  </TouchableOpacity>
                </>
              )}

              {booking.status === 'in_progress' && (
                <>
                  <TouchableOpacity
                    onPress={() => handleCancelBooking(booking)}
                    style={[styles.distinctActionBtn, styles.declineBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="close" size={15} color="#FF453A" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FF453A' }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleCompleteJob(booking)}
                    style={[styles.distinctActionBtn, styles.completeBtnNew]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="check-all" size={15} color="#FFFFFF" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FFFFFF' }]}>Complete</Text>
                  </TouchableOpacity>
                </>
              )}

              {booking.status === 'completed' && booking.paymentStatus !== 'PAID' && (
                <>
                  <TouchableOpacity
                    onPress={() => handleShowQrModal(booking)}
                    style={[styles.distinctActionBtn, { backgroundColor: '#0084FF', marginRight: 6 }]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="qrcode-scan" size={15} color="#FFFFFF" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FFFFFF' }]}>Show QR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleMarkBookingPaid(booking)}
                    style={[styles.distinctActionBtn, { backgroundColor: '#10B981', marginRight: 6 }]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="cash-check" size={15} color="#FFFFFF" />
                    <Text style={[styles.distinctActionBtnText, { color: '#FFFFFF' }]}>Mark Paid</Text>
                  </TouchableOpacity>
                </>
              )}

              {(booking.status === 'completed' || booking.status === 'rejected' || booking.status === 'cancelled') && (
                <View style={[styles.doneTagNew, { backgroundColor: activeTheme.tableHeaderBg }]}>
                  <MaterialCommunityIcons
                    name={booking.status === 'completed' ? 'check-decagram' : 'close-circle-outline'}
                    size={14}
                    color={booking.status === 'completed' ? '#30D158' : '#FF453A'}
                  />
                  <Text
                    style={[
                      styles.doneTagTextNew,
                      { color: booking.status === 'completed' ? '#30D158' : '#FF453A' },
                    ]}
                  >
                    {booking.status === 'completed' ? 'Fulfilled' : 'Closed'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── SECTION 1: DASHBOARD (OVERVIEW) ─────────────────────────────────────────
  const renderDashboardOverview = () => {
    return (
      <View style={styles.dashboardView}>
        {/* Stats Row */}
        <View style={isMobile ? styles.statsContainerMobile : styles.statsContainer}>
          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                {isMobile ? 'SERVICES' : 'TOTAL SERVICES'}
              </Text>
              <MaterialCommunityIcons name="layers-outline" size={isMobile ? 14 : 20} color={activeTheme.iconColor} />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: activeTheme.textPrimary }]} numberOfLines={1}>
              {totalServices}
            </Text>
          </GlassCard>

          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                BOOKINGS
              </Text>
              <MaterialCommunityIcons name="calendar-check-outline" size={isMobile ? 14 : 20} color="#30D158" />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: activeTheme.textPrimary }]} numberOfLines={1}>
              {totalBookings}
            </Text>
          </GlassCard>

          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                {isMobile ? 'REVENUE' : 'TOTAL REVENUE'}
              </Text>
              <MaterialCommunityIcons name="currency-inr" size={isMobile ? 14 : 20} color="#30D158" />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: '#30D158' }]} numberOfLines={1}>
              {formatCurrency(totalRevenue)}
            </Text>
          </GlassCard>
        </View>

        {/* Live GPS Broadcasting Card for In-Progress Jobs */}
        {activeInProgressJob && (
          <GlassCard
            theme={theme}
            style={[
              styles.liveGpsBroadcasterCard,
              { backgroundColor: 'rgba(48, 209, 88, 0.08)', borderColor: 'rgba(48, 209, 88, 0.35)' },
            ]}
            intensity={activeTheme.glassIntensity}
          >
            <View style={styles.liveGpsBroadcasterRow}>
              <View style={[styles.liveGpsPulseIcon, { backgroundColor: 'rgba(48, 209, 88, 0.2)' }]}>
                <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#30D158" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.liveGpsTitle, { color: activeTheme.textPrimary }]}>
                    Live GPS Broadcaster Active
                  </Text>
                  <View style={[styles.liveIndicatorBadge, { backgroundColor: 'rgba(48, 209, 88, 0.2)' }]}>
                    <View style={[styles.liveDot, { backgroundColor: '#30D158' }]} />
                    <Text style={[styles.liveIndicatorText, { color: '#30D158' }]}>STREAMING</Text>
                  </View>
                </View>
                <Text style={[styles.liveGpsSubtitle, { color: activeTheme.textSecondary }]}>
                  En route for #{activeInProgressJob.bookingNumber} ({activeInProgressJob.customerName || 'Customer'})
                </Text>
                <Text style={[styles.liveGpsCoordsText, { color: activeTheme.textSecondary }]}>
                  📍 {liveGpsCoords ? `${liveGpsCoords.latitude}, ${liveGpsCoords.longitude}` : `${mapLatitude}, ${mapLongitude}`}
                  {liveGpsLastSent ? ` • Sent ${liveGpsLastSent}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.liveGpsPingBtn, isBroadcastingGps && { opacity: 0.6 }]}
                onPress={handleManualBroadcastLocation}
                disabled={isBroadcastingGps}
                activeOpacity={0.7}
              >
                {isBroadcastingGps ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={14} color="#FFFFFF" />
                    <Text style={styles.liveGpsPingBtnText}>Broadcast</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}
      </View>
    );
  };

  // ─── SECTION 2: BOOKINGS MANAGER TAB ─────────────────────────────────────────
  const renderBookingsManager = () => {
    const filteredBookings = bookings.filter((b) => {
      if (bookingFilter === 'all') return true;
      if (bookingFilter === 'cancelled') return b.status === 'cancelled' || b.status === 'rejected';
      return b.status === bookingFilter;
    });

    const filterChips: Array<{ key: typeof bookingFilter; label: string; count: number }> = [
      { key: 'all', label: 'All', count: bookings.length },
      { key: 'pending', label: 'Pending', count: bookings.filter((b) => b.status === 'pending').length },
      { key: 'accepted', label: 'Accepted', count: bookings.filter((b) => b.status === 'accepted').length },
      { key: 'in_progress', label: 'In Progress', count: bookings.filter((b) => b.status === 'in_progress').length },
      { key: 'completed', label: 'Completed', count: bookings.filter((b) => b.status === 'completed').length },
      { key: 'cancelled', label: 'Closed/Rejected', count: bookings.filter((b) => b.status === 'cancelled' || b.status === 'rejected').length },
    ];

    return (
      <View style={styles.fullWidthSection}>
        <View style={[styles.sectionHeaderRow, isMobile && styles.sectionHeaderRowMobile]}>
          <Text style={[styles.sectionSubtitle, isMobile && styles.sectionSubtitleMobile, { color: activeTheme.textSecondary }]}>
            Live service bookings with instant Accept, Reject, Start, and Complete controls.
          </Text>
          <TouchableOpacity onPress={() => loadLiveData(true)} style={[styles.refreshIconButton, { backgroundColor: activeTheme.activeNavBg }]}>
            <MaterialCommunityIcons name="refresh" size={16} color={activeTheme.activeNavText} />
            <Text style={[styles.refreshIconText, { color: activeTheme.activeNavText }]}>Sync Live</Text>
          </TouchableOpacity>
        </View>

        {serviceChargeDue > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              borderWidth: 1,
              borderColor: 'rgba(245, 158, 11, 0.35)',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#F59E0B" style={{ marginRight: 5 }} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#F59E0B' }}>
                  Outstanding Service Charge: ₹{serviceChargeDue.toFixed(2)}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: activeTheme.textSecondary }}>
                You have collected offline cash. Clear dues to accept new bookings.
              </Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
              onPress={() => setShowPayDuesModal(true)}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#000000', fontWeight: '800', fontSize: 12 }}>PAY NOW</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsContainer} contentContainerStyle={{ paddingRight: 16 }}>
          {filterChips.map((chip) => {
            const isSelected = bookingFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setBookingFilter(chip.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? '#0084FF' : activeTheme.tableHeaderBg,
                    borderColor: isSelected ? '#0084FF' : activeTheme.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.filterChipText, { color: isSelected ? '#FFFFFF' : activeTheme.textPrimary }]}>
                  {chip.label}
                </Text>
                <View style={[styles.filterChipBadge, { backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,132,255,0.15)' }]}>
                  <Text style={[styles.filterChipBadgeText, { color: isSelected ? '#FFFFFF' : activeTheme.iconColor }]}>
                    {chip.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.bookingsList}>
          {filteredBookings.length === 0 ? (
            <GlassCard theme={theme} style={[styles.emptyCard, { borderColor: activeTheme.cardBorder }]} intensity={activeTheme.glassIntensity}>
              <MaterialCommunityIcons name="filter-remove-outline" size={42} color={activeTheme.textSecondary} />
              <Text style={[styles.emptyTableTitle, { color: activeTheme.textPrimary }]}>No Bookings Matching Filter</Text>
              <Text style={[styles.emptyTableSub, { color: activeTheme.textSecondary }]}>
                Switch filters above or pull down to check for updates.
              </Text>
            </GlassCard>
          ) : (
            filteredBookings.map((booking) => renderBookingCard(booking, false))
          )}
        </View>
      </View>
    );
  };

  // ─── SECTION 3: MY ACCOUNT / PROVIDER PROFILE TAB ────────────────────────────
  // (Identical logic matching Frontend/Service Provider pages/profile.php)
  const renderProviderAccountProfile = () => {
    const progress = profileData?.progress;
    const completionPercent = progress?.percentage ?? 100;
    const is100 = (progress?.is_100 ?? (completionPercent >= 100)) || completionPercent >= 100;
    const missingItems = progress?.missing ?? [];
    const bank = profileData?.bank_account;
    const branches = profileData?.branches || [];

    const displayName = profileData?.company_name || profileData?.full_name || providerUser?.first_name || 'Service Provider';
    const hasCompany = Boolean(profileData?.company_name && profileData.company_name.trim() !== '');
    const verStatus = (profileData?.verified_status || 'approved').toLowerCase();
    const accountActive = (profileData?.status || 'ACTIVE') === 'ACTIVE';

    const formatSinceDate = (dateStr?: string) => {
      if (!dateStr) return 'Oct 26';
      try {
        const d = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      } catch (e) {
        return 'Oct 26';
      }
    };

    return (
      <View style={styles.fullWidthSection}>
        {/* Profile Completion Status Card: Only shown when profile is incomplete (< 100%) */}
        {!is100 && (
          <GlassCard theme={theme} style={[styles.progressCard, { borderColor: '#FFD60A' }]} intensity={activeTheme.glassIntensity}>
            <View style={styles.progressHeaderRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons
                    name="alert-decagram-outline"
                    size={20}
                    color="#FFD60A"
                  />
                  <Text style={[styles.progressTitleText, { color: activeTheme.textPrimary, marginLeft: 6 }]}>
                    Profile Completion: {completionPercent}%
                  </Text>
                </View>
                <Text style={[styles.progressSubText, { color: activeTheme.textSecondary }]}>
                  Profile must reach 100% and Government ID Proof must be Approved.
                </Text>
              </View>

              <View style={[styles.progressPillBadge, { backgroundColor: 'rgba(255,214,10,0.2)' }]}>
                <Text style={[styles.progressPillBadgeText, { color: activeTheme.statusPendingText }]}>
                  {completionPercent}% Done
                </Text>
              </View>
            </View>

            {/* Visual Progress Bar Track */}
            <View style={[styles.progressBarTrack, { backgroundColor: activeTheme.tableHeaderBg }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${completionPercent}%`,
                    backgroundColor: '#0084FF',
                  },
                ]}
              />
            </View>

            {/* Incomplete Missing Items Warning */}
            {missingItems.length > 0 && (
              <View style={styles.missingItemsBox}>
                <Text style={styles.missingItemsTitle}>Incomplete Pillars:</Text>
                {missingItems.map((item, idx) => (
                  <View key={idx} style={styles.missingItemRow}>
                    <MaterialCommunityIcons name="close-circle-outline" size={13} color="#FF453A" />
                    <Text style={styles.missingItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 4 Pillars Grid (Phone, Email, Address, Government ID Proof) */}
            <View style={styles.pillarsGrid}>
              {/* Pillar 1: Phone */}
              <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
                <View style={styles.pillarHeaderRow}>
                  <MaterialCommunityIcons name="phone" size={16} color={progress?.pillars?.phone?.done ? '#30D158' : '#FF453A'} />
                  <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Phone (25%)</Text>
                </View>
                <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.phone?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
                  <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.phone?.done ? '#30D158' : '#FF453A' }]}>
                    {progress?.pillars?.phone?.badge || 'Verified'}
                  </Text>
                </View>
                <Text style={[styles.pillarVal, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                  {progress?.pillars?.phone?.val || formPhone || 'Missing'}
                </Text>
              </View>

              {/* Pillar 2: Email */}
              <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
                <View style={styles.pillarHeaderRow}>
                  <MaterialCommunityIcons name="email" size={16} color={progress?.pillars?.email?.done ? '#30D158' : '#FF453A'} />
                  <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Email (25%)</Text>
                </View>
                <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.email?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
                  <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.email?.done ? '#30D158' : '#FF453A' }]}>
                    {progress?.pillars?.email?.badge || 'Verified'}
                  </Text>
                </View>
                <Text style={[styles.pillarVal, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                  {progress?.pillars?.email?.val || formEmail || 'Missing'}
                </Text>
              </View>

              {/* Pillar 3: Address */}
              <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
                <View style={styles.pillarHeaderRow}>
                  <MaterialCommunityIcons name="map-marker" size={16} color={progress?.pillars?.address?.done ? '#30D158' : '#FF453A'} />
                  <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Address (25%)</Text>
                </View>
                <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.address?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
                  <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.address?.done ? '#30D158' : '#FF453A' }]}>
                    {progress?.pillars?.address?.badge || 'Completed'}
                  </Text>
                </View>
                <Text style={[styles.pillarVal, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                  {formAddress || 'Missing'}
                </Text>
              </View>

              {/* Pillar 4: ID Proof */}
              <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
                <View style={styles.pillarHeaderRow}>
                  <MaterialCommunityIcons name="shield-account" size={16} color={progress?.pillars?.id_proof?.done ? '#30D158' : '#FFD60A'} />
                  <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Govt ID (25%)</Text>
                </View>
                <View
                  style={[
                    styles.pillarBadge,
                    {
                      backgroundColor: progress?.pillars?.id_proof?.done
                        ? 'rgba(48,209,88,0.15)'
                        : progress?.pillars?.id_proof?.badge === 'Under Review'
                        ? 'rgba(255,214,10,0.15)'
                        : 'rgba(255,69,58,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillarBadgeText,
                      {
                        color: progress?.pillars?.id_proof?.done
                          ? '#30D158'
                          : progress?.pillars?.id_proof?.badge === 'Under Review'
                          ? activeTheme.statusPendingText
                          : '#FF453A',
                      },
                    ]}
                  >
                    {progress?.pillars?.id_proof?.badge || 'Approved'}
                  </Text>
                </View>
                <Text style={[styles.pillarVal, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                  {progress?.pillars?.id_proof?.val || 'Aadhaar Verified'}
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* 2. Provider Identity Card (Matches Web Left Card in profile.php) */}
        <GlassCard theme={theme} style={styles.webProfileCard} intensity={activeTheme.glassIntensity}>
          <View style={styles.webAvatarContainer}>
            <View style={styles.webAvatarWrap}>
              <Image
                source={{
                  uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=05c279&color=fff&size=160&bold=true`,
                }}
                style={styles.webAvatarImg}
              />
            </View>

            <Text style={[styles.webAvatarName, { color: activeTheme.textPrimary }]}>
              {displayName}
            </Text>

            <View style={styles.webAvatarSubtitleRow}>
              <MaterialCommunityIcons
                name={hasCompany ? 'office-building' : 'account'}
                size={14}
                color={hasCompany ? '#05c279' : activeTheme.textSecondary}
              />
              <Text style={[styles.webAvatarSubtitleText, { color: hasCompany ? '#05c279' : activeTheme.textSecondary }]}>
                {hasCompany ? (profileData?.company_name || 'Company Provider') : 'Individual Provider'}
              </Text>
            </View>

            <View style={styles.webTypePill}>
              <MaterialCommunityIcons
                name={hasCompany ? 'office-building' : 'card-account-details-outline'}
                size={12}
                color={hasCompany ? '#0084FF' : '#8E8E93'}
              />
              <Text style={[styles.webTypePillText, { color: hasCompany ? '#0084FF' : '#8E8E93' }]}>
                {hasCompany ? 'Company Provider' : 'Individual Provider'}
              </Text>
            </View>

            {/* Divider */}
            <View style={[styles.webDivider, { backgroundColor: activeTheme.cardBorder }]} />

            {/* 3 Columns Stats Row (ID, STATUS, SINCE) */}
            <View style={styles.webStatsRow}>
              <View style={styles.webStatCol}>
                <Text style={styles.webStatValueGreen}>#{activeProviderId}</Text>
                <Text style={[styles.webStatLabel, { color: activeTheme.textSecondary }]}>ID</Text>
              </View>

              <View style={[styles.webStatDivider, { backgroundColor: activeTheme.cardBorder }]} />

              <View style={styles.webStatCol}>
                <View style={[styles.webStatusBadge, { backgroundColor: accountActive ? 'rgba(48,209,88,0.18)' : 'rgba(255,69,58,0.18)' }]}>
                  <Text style={[styles.webStatusBadgeText, { color: accountActive ? '#30D158' : '#FF453A' }]}>
                    {accountActive ? 'ACTIVE' : 'SUSPENDED'}
                  </Text>
                </View>
                <Text style={[styles.webStatLabel, { color: activeTheme.textSecondary }]}>STATUS</Text>
              </View>

              <View style={[styles.webStatDivider, { backgroundColor: activeTheme.cardBorder }]} />

              <View style={styles.webStatCol}>
                <Text style={[styles.webStatValueSince, { color: activeTheme.textPrimary }]}>
                  {formatSinceDate(profileData?.created_at)}
                </Text>
                <Text style={[styles.webStatLabel, { color: activeTheme.textSecondary }]}>SINCE</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* 3. Account & Location Details Card (Matches Web Right Card in profile.php) */}
        <GlassCard theme={theme} style={styles.webProfileCard} intensity={activeTheme.glassIntensity}>
          <View style={styles.webCardHeader}>
            <Text style={styles.webCardHeaderTitle}>
              Account & Location Details
            </Text>
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={isSavingProfile}
              style={[styles.saveProfileBtnTop, { backgroundColor: '#05c279' }]}
            >
              {isSavingProfile ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.saveProfileBtnTopText}>Save Profile</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.formContainer}>
            {/* Full Name */}
            <View style={styles.webFormRow}>
              <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Full Name:</Text>
              <TextInput
                style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                value={formFullName}
                onChangeText={setFormFullName}
                placeholder="Enter your name"
                placeholderTextColor={activeTheme.textSecondary}
              />
            </View>

            {/* Company Name (Shown only if registered company) */}
            {hasCompany && (
              <View style={styles.webFormRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Company Name:</Text>
                  <View style={styles.regBadgePill}>
                    <Text style={styles.regBadgePillText}>Registered</Text>
                  </View>
                </View>
                <TextInput
                  style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                  value={formCompanyName}
                  onChangeText={setFormCompanyName}
                  placeholder="e.g. Apex Electricals Pvt. Ltd."
                  placeholderTextColor={activeTheme.textSecondary}
                />
              </View>
            )}

            {/* Email Address */}
            <View style={styles.webFormRow}>
              <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Email Address:</Text>
              <TextInput
                style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                value={formEmail}
                onChangeText={setFormEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="email@example.com"
                placeholderTextColor={activeTheme.textSecondary}
              />
            </View>

            {/* Phone Number */}
            <View style={styles.webFormRow}>
              <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Phone Number:</Text>
              <TextInput
                style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                value={formPhone}
                onChangeText={setFormPhone}
                keyboardType="phone-pad"
                placeholder="+91 XXXXX XXXXX"
                placeholderTextColor={activeTheme.textSecondary}
              />
            </View>

            {/* Location Details Subheader */}
            <View style={styles.webSubheaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="map-marker" size={16} color="#05c279" />
                <Text style={styles.webSubheaderTitle}>Location Details</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowProfileMap((prev) => !prev)}
                style={[
                  styles.pinOnMapBtn,
                  { backgroundColor: showProfileMap ? '#FF453A' : '#05c279' },
                ]}
              >
                <MaterialCommunityIcons
                  name={showProfileMap ? 'eye-off-outline' : 'map-marker-radius'}
                  size={13}
                  color="#FFFFFF"
                />
                <Text style={styles.pinOnMapBtnText}>
                  {showProfileMap ? 'Hide Map' : 'Pin on Map'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline Map Section (Toggled by Pin on Map button) */}
            {showProfileMap && (
              <View style={[styles.inlineMapContainer, { borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}>
                {/* Map Top Action Controls - Single Clean Button */}
                <View style={styles.mapActionRow}>
                  <TouchableOpacity
                    onPress={handleUseLiveLocation}
                    disabled={isLocating}
                    style={[styles.singlePinLocationBtn, isLocating && { opacity: 0.75 }]}
                    activeOpacity={0.8}
                  >
                    {isLocating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons name="crosshairs-gps" size={15} color="#FFFFFF" />
                    )}
                    <Text style={styles.singlePinLocationBtnText}>
                      {isLocating ? 'Locating Doorstep...' : 'Pin Current Location'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Map Viewport Canvas with Authentic Google Roadmap / Satellite Tiles and Pop-Up Bubble */}
                <View style={[styles.leafletMapCanvas, { borderColor: activeTheme.cardBorder }]}>
                  {/* Real Google Maps Tile Background */}
                  <Image
                    source={{ uri: getGoogleMapTileUrl(mapLatitude, mapLongitude, mapZoom, mapLayer) }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />

                  {/* Top Left: Leaflet Style Zoom Controls (+ / -) */}
                  <View style={styles.leafletZoomControl}>
                    <TouchableOpacity onPress={handleZoomIn} style={styles.leafletZoomBtn} activeOpacity={0.8}>
                      <Text style={styles.leafletZoomText}>+</Text>
                    </TouchableOpacity>
                    <View style={styles.leafletZoomDivider} />
                    <TouchableOpacity onPress={handleZoomOut} style={styles.leafletZoomBtn} activeOpacity={0.8}>
                      <Text style={styles.leafletZoomText}>−</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Top Right: Layer Switcher (Google Roadmap / Satellite) */}
                  <TouchableOpacity onPress={handleToggleLayer} style={styles.leafletLayerBtn} activeOpacity={0.8}>
                    <MaterialCommunityIcons
                      name={mapLayer === 'roadmap' ? 'layers-outline' : 'earth'}
                      size={18}
                      color="#1E293B"
                    />
                  </TouchableOpacity>

                  {/* Center Leaflet Blue Marker Pin with Floating Pop-Up Callout Bubble */}
                  <View style={styles.leafletCenterPinContainer} pointerEvents="box-none">
                    {/* Pop-Up Style Callout Bubble (Matching Web Screenshot) */}
                    {showMapPopup && (
                      <View style={styles.leafletPopupWrapper} pointerEvents="box-none">
                        <View style={styles.leafletPopupCard}>
                          <Text style={{ fontSize: 11, marginRight: 4 }}>📍</Text>
                          <Text style={styles.leafletPopupText} numberOfLines={2}>
                            {formAddress ? formAddress : `${mapLatitude.toFixed(5)}, ${mapLongitude.toFixed(5)}`}
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowMapPopup(false)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginLeft: 6 }}
                          >
                            <MaterialCommunityIcons name="close" size={13} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                        {/* Downward triangle beak pointing directly to pin head */}
                        <View style={styles.leafletPopupBeak} />
                      </View>
                    )}

                    {/* Leaflet Blue Pin Marker */}
                    <TouchableOpacity onPress={() => setShowMapPopup(prev => !prev)} activeOpacity={0.9} style={styles.leafletPinTouch}>
                      <View style={styles.mapPinPulseRing} />
                      <MaterialCommunityIcons name="map-marker" size={38} color="#0084FF" />
                      <View style={styles.leafletPinShadow} />
                    </TouchableOpacity>
                  </View>

                  {/* Fine-Tuning Nudge Controls Pad (Floating Bottom Right) */}
                  <View style={styles.leafletNudgePad}>
                    <TouchableOpacity
                      onPress={() => handleNudgeCoords(0.0005, 0)}
                      style={styles.leafletNudgeBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="chevron-up" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => handleNudgeCoords(0, -0.0005)}
                        style={styles.leafletNudgeBtn}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="chevron-left" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleNudgeCoords(0, 0.0005)}
                        style={styles.leafletNudgeBtn}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleNudgeCoords(-0.0005, 0)}
                      style={styles.leafletNudgeBtn}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <MaterialCommunityIcons name="chevron-down" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {/* Bottom Bar: Watermark & Coordinates (Matching Web Version) */}
                  <View style={styles.leafletBottomBar}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                      <MaterialCommunityIcons name="information" size={11} color="#94A3B8" />
                      <Text style={styles.leafletStatusText} numberOfLines={1}>Doorstep location pinned on map</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.leafletCoordsText}>
                        📍 {mapLatitude.toFixed(7)}, {mapLongitude.toFixed(7)}
                      </Text>
                      <Text style={styles.leafletWatermarkText}>Leaflet | © Google Maps</Text>
                    </View>
                  </View>
                </View>

                {/* Map Guidance Footer with Quick Sync */}
                <View style={styles.mapFooterNote}>
                  <MaterialCommunityIcons name="pin" size={13} color="#05c279" />
                  <Text style={[styles.mapFooterNoteText, { color: activeTheme.textSecondary, flex: 1 }]}>
                    Drag the pin or use nudge arrows to fine-tune your exact doorstep location
                  </Text>
                  <TouchableOpacity onPress={handleSyncPinDetails} style={styles.syncPinBtn}>
                    <MaterialCommunityIcons name="sync" size={12} color="#05c279" />
                    <Text style={styles.syncPinBtnText}>Sync Address</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Full Address */}
            <View style={styles.webFormRow}>
              <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Full Address: <Text style={{ color: '#FF453A' }}>*</Text></Text>
              <TextInput
                style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                value={formAddress}
                onChangeText={setFormAddress}
                placeholder="Enter street address, area or building name..."
                placeholderTextColor={activeTheme.textSecondary}
              />
            </View>

            {/* Landmark */}
            <View style={styles.webFormRow}>
              <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Landmark: <Text style={{ color: '#FF453A' }}>*</Text></Text>
              <TextInput
                style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                value={formLandmark}
                onChangeText={setFormLandmark}
                placeholder="Enter nearby landmark..."
                placeholderTextColor={activeTheme.textSecondary}
              />
            </View>

            {/* Pincode & Service Range */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.webFormRow, { flex: 1 }]}>
                <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Pincode: <Text style={{ color: '#FF453A' }}>*</Text></Text>
                <TextInput
                  style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                  value={formPincode}
                  onChangeText={setFormPincode}
                  keyboardType="numeric"
                  placeholder="6-digit pincode"
                  placeholderTextColor={activeTheme.textSecondary}
                />
              </View>

              <View style={[styles.webFormRow, { flex: 1 }]}>
                <Text style={[styles.webFormLabel, { color: activeTheme.textPrimary }]}>Service Range (KM):</Text>
                <TextInput
                  style={[styles.webFormInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}
                  value={formRangeKm}
                  onChangeText={setFormRangeKm}
                  keyboardType="numeric"
                  placeholder="e.g. 10"
                  placeholderTextColor={activeTheme.textSecondary}
                />
              </View>
            </View>

            {/* Account & Verification Status Subheader */}
            <View style={styles.webSubheaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name="shield-check" size={16} color="#05c279" />
                <Text style={[styles.webStatusSectionTitle, { color: activeTheme.textSecondary }]}>
                  ACCOUNT & VERIFICATION STATUS
                </Text>
              </View>
            </View>

            {/* Status Badges List */}
            <View style={styles.webStatusTable}>
              <View style={styles.webStatusItemRow}>
                <Text style={[styles.webStatusItemLabel, { color: activeTheme.textPrimary }]}>Role:</Text>
                <View style={[styles.webBadgeGreenPill, { backgroundColor: 'rgba(5, 194, 121, 0.15)' }]}>
                  <Text style={[styles.webBadgeGreenPillText, { color: '#05c279' }]}>Service Provider</Text>
                </View>
              </View>

              <View style={styles.webStatusItemRow}>
                <Text style={[styles.webStatusItemLabel, { color: activeTheme.textPrimary }]}>Verified Status:</Text>
                <View
                  style={[
                    styles.webBadgeGreenPill,
                    {
                      backgroundColor:
                        verStatus === 'approved'
                          ? 'rgba(5, 194, 121, 0.15)'
                          : verStatus === 'under_review'
                          ? 'rgba(255, 214, 10, 0.15)'
                          : 'rgba(255, 69, 58, 0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.webBadgeGreenPillText,
                      {
                        color:
                          verStatus === 'approved'
                            ? '#05c279'
                            : verStatus === 'under_review'
                            ? activeTheme.statusPendingText
                            : '#FF453A',
                      },
                    ]}
                  >
                    {verStatus.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.webStatusItemRow}>
                <Text style={[styles.webStatusItemLabel, { color: activeTheme.textPrimary }]}>Account Status:</Text>
                <View style={[styles.webBadgeGreenPill, { backgroundColor: accountActive ? 'rgba(5, 194, 121, 0.15)' : 'rgba(255, 69, 58, 0.15)' }]}>
                  <Text style={[styles.webBadgeGreenPillText, { color: accountActive ? '#05c279' : '#FF453A' }]}>
                    {accountActive ? 'ACTIVE' : 'SUSPENDED'}
                  </Text>
                </View>
              </View>

              <View style={styles.webStatusItemRow}>
                <Text style={[styles.webStatusItemLabel, { color: activeTheme.textPrimary }]}>ID Verification:</Text>
                <View
                  style={[
                    styles.webBadgeGreenPill,
                    {
                      backgroundColor:
                        verStatus === 'approved'
                          ? 'rgba(5, 194, 121, 0.15)'
                          : verStatus === 'under_review'
                          ? 'rgba(255, 214, 10, 0.15)'
                          : 'rgba(255, 69, 58, 0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.webBadgeGreenPillText,
                      {
                        color:
                          verStatus === 'approved'
                            ? '#05c279'
                            : verStatus === 'under_review'
                            ? activeTheme.statusPendingText
                            : '#FF453A',
                      },
                    ]}
                  >
                    {verStatus.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Operating as Individual Provider Box */}
            {!hasCompany && (
              <View style={[styles.webIndividualBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <MaterialCommunityIcons name="account-circle-outline" size={26} color="#8E8E93" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.webIndividualBoxTitle, { color: activeTheme.textPrimary }]}>
                      Operating as Individual Provider
                    </Text>
                    <Text style={[styles.webIndividualBoxSubtitle, { color: activeTheme.textSecondary }]}>
                      Company name is not displayed for individual providers. Want to add branches? Register a company name.
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setCompanyModalVisible(true)}
                  style={[styles.webRegisterCompanyBtn, { borderColor: '#05c279' }]}
                >
                  <MaterialCommunityIcons name="office-building" size={14} color="#05c279" />
                  <Text style={styles.webRegisterCompanyBtnText}>Register Company</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom Save Profile Button */}
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={isSavingProfile}
              style={[styles.webSaveProfileBtnBottom, { backgroundColor: '#05c279' }]}
            >
              {isSavingProfile ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.webSaveProfileBtnBottomText}>Save Profile</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* 4. Branch Locations Card (Matches Web Branch Locations in profile.php) */}
        <GlassCard theme={theme} style={styles.webProfileCard} intensity={activeTheme.glassIntensity}>
          <View style={styles.webCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="source-branch" size={18} color="#05c279" />
              <Text style={styles.webCardHeaderTitle}>Branch Locations</Text>
              <View style={styles.webBranchCountBadge}>
                <Text style={styles.webBranchCountBadgeText}>{branches.length}</Text>
              </View>
            </View>

            {hasCompany ? (
              <TouchableOpacity
                onPress={() => setBranchModalVisible(true)}
                style={[styles.webAddBranchBtn, { backgroundColor: '#05c279' }]}
              >
                <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
                <Text style={styles.webAddBranchBtnText}>Add Branch</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setCompanyModalVisible(true)}
                style={[styles.webRegCompanyToBranchBtn, { borderColor: '#f6c23e' }]}
              >
                <MaterialCommunityIcons name="lock" size={12} color="#f6c23e" />
                <Text style={styles.webRegCompanyToBranchBtnText}>Register Company to Add Branches</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Yellow Alert Box when Company Not Registered */}
          {!hasCompany && (
            <View style={styles.webBranchLockAlert}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                <MaterialCommunityIcons name="lock" size={24} color="#f6c23e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.webBranchLockAlertTitle}>
                    Company Registration Required to Add Branches
                  </Text>
                  <Text style={styles.webBranchLockAlertDesc}>
                    Normal service providers do not have a company name and cannot add branches. You must register a company first to create and manage branch locations.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setCompanyModalVisible(true)}
                style={styles.webBranchLockAlertBtn}
              >
                <MaterialCommunityIcons name="office-building" size={14} color="#000000" />
                <Text style={styles.webBranchLockAlertBtnText}>Register Company Now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Branches Table / List */}
          <View style={styles.webBranchTable}>
            <View style={[styles.webBranchTableHeaderRow, { backgroundColor: activeTheme.tableHeaderBg }]}>
              <Text style={[styles.webBranchTableTh, { width: 30, color: activeTheme.textSecondary }]}>#</Text>
              <Text style={[styles.webBranchTableTh, { flex: 2, color: activeTheme.textSecondary }]}>BRANCH NAME</Text>
              <Text style={[styles.webBranchTableTh, { flex: 3, color: activeTheme.textSecondary }]}>ADDRESS</Text>
              <Text style={[styles.webBranchTableTh, { flex: 2, color: activeTheme.textSecondary }]}>PHONE</Text>
            </View>

            {branches.length === 0 ? (
              <View style={styles.webBranchEmptyBox}>
                <MaterialCommunityIcons name="source-branch" size={24} color={activeTheme.textSecondary} />
                <Text style={[styles.webBranchEmptyText, { color: activeTheme.textSecondary }]}>
                  No branches added yet.
                </Text>
              </View>
            ) : (
              branches.map((b, idx) => (
                <View key={b.id || idx} style={[styles.webBranchTableRow, { borderColor: activeTheme.cardBorder }]}>
                  <Text style={[styles.webBranchTableCell, { width: 30, color: activeTheme.textPrimary }]}>{idx + 1}</Text>
                  <Text style={[styles.webBranchTableCell, { flex: 2, color: activeTheme.textPrimary, fontWeight: '700' }]}>{b.branch_name}</Text>
                  <Text style={[styles.webBranchTableCell, { flex: 3, color: activeTheme.textSecondary }]} numberOfLines={2}>{b.address}</Text>
                  <Text style={[styles.webBranchTableCell, { flex: 2, color: activeTheme.textSecondary }]}>{b.phone || 'N/A'}</Text>
                </View>
              ))
            )}
          </View>
        </GlassCard>

        {/* 5. Linked Payout Bank Account Card */}
        <GlassCard theme={theme} style={styles.webProfileCard} intensity={activeTheme.glassIntensity}>
          <View style={styles.webCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="bank" size={18} color="#05c279" />
              <Text style={styles.webCardHeaderTitle}>Linked Payout Bank Account</Text>
            </View>
            <TouchableOpacity onPress={() => setBankModalVisible(true)} style={[styles.editBankBtn, { backgroundColor: activeTheme.tableHeaderBg }]}>
              <Text style={[styles.editBankBtnText, { color: '#05c279' }]}>{bank ? 'Edit Bank' : 'Add Bank'}</Text>
            </TouchableOpacity>
          </View>

          {bank ? (
            <View style={styles.bankDetailsBox}>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Account Holder:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.account_holder_name}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Bank Name:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.bank_name}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Account Number:</Text>
                <Text style={[styles.bankValue, { color: '#05c279', fontWeight: '800' }]}>{bank.masked_account_number || bank.account_number}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>IFSC Code:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.ifsc_code}</Text>
              </View>
              {bank.upi_id ? (
                <View style={styles.bankInfoRow}>
                  <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>UPI ID:</Text>
                  <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.upi_id}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.noBankBox}>
              <Text style={[styles.noBankText, { color: activeTheme.textSecondary }]}>
                No bank account linked yet. Link your bank account to receive service payout settlements.
              </Text>
              <TouchableOpacity onPress={() => setBankModalVisible(true)} style={[styles.addBankBtn, { backgroundColor: '#05c279' }]}>
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addBankBtnText}>Link Bank Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>

        {/* 6. Live Booking Ringtone & Sound Alert Card */}
        <GlassCard theme={theme} style={styles.webProfileCard} intensity={activeTheme.glassIntensity}>
          <View style={styles.webCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#0084FF" />
              <Text style={styles.webCardHeaderTitle}>Live Booking Ringtone & Sound Alert</Text>
            </View>
            <TouchableOpacity
              onPress={() => setRingtoneSettingsModalVisible(true)}
              style={[styles.editBankBtn, { backgroundColor: 'rgba(0, 132, 255, 0.15)' }]}
            >
              <Text style={[styles.editBankBtnText, { color: '#0084FF' }]}>Change Ringtone</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, color: activeTheme.textSecondary, marginBottom: 12 }}>
              Customize your continuous ringtone and device sound for new incoming service bookings.
            </Text>
            <TouchableOpacity
              onPress={() => setRingtoneSettingsModalVisible(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 10,
                backgroundColor: activeTheme.tableHeaderBg,
                borderWidth: 1,
                borderColor: activeTheme.cardBorder,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name="music-note" size={20} color="#0084FF" />
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: activeTheme.textPrimary }}>
                    Configure Live Ringtone
                  </Text>
                  <Text style={{ fontSize: 11, color: activeTheme.textSecondary }}>
                    ServEasy Default or Custom Device Music
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={activeTheme.textSecondary} />
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* 7. Logout Button */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <MaterialCommunityIcons name="logout" size={18} color="#FF453A" />
          <Text style={styles.logoutBtnText}>Log Out from Provider Portal</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ─── Render My Wallet & Payouts Section ─────────────────────────────────────
  const renderWalletPayoutsSection = () => {
    const bank = profileData?.bank_account;

    return (
      <View style={styles.fullWidthSection}>
        <Text style={[styles.sectionSubtitle, isMobile && styles.sectionSubtitleMobile, { color: activeTheme.textSecondary, marginBottom: 16 }]}>
          Track your wallet balance, platform commission settlements, and linked bank account for payouts.
        </Text>

        {/* 3 Metric Cards: Wallet, Dues, Total Sales */}
        <View style={isMobile ? styles.statsContainerMobile : styles.statsContainer}>
          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                WALLET BALANCE
              </Text>
              <MaterialCommunityIcons name="wallet-outline" size={isMobile ? 14 : 20} color="#30D158" />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: '#30D158' }]} numberOfLines={1}>
              ₹{walletBalance.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 4, color: activeTheme.textSecondary }}>Available for payout</Text>
          </GlassCard>

          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                SERVICE CHARGES
              </Text>
              <MaterialCommunityIcons name="cash-multiple" size={isMobile ? 14 : 20} color={serviceChargeDue > 0 ? '#FF453A' : '#30D158'} />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: serviceChargeDue > 0 ? '#FF453A' : '#30D158' }]} numberOfLines={1}>
              ₹{serviceChargeDue.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 4, color: activeTheme.textSecondary }}>
              {serviceChargeDue > 0 ? 'Dues outstanding' : 'All dues clear'}
            </Text>
          </GlassCard>

          <GlassCard theme={theme} style={[styles.statCard, isMobile ? styles.statCardMobile : null]} intensity={activeTheme.glassIntensity}>
            <View style={styles.statHeader}>
              <Text style={[styles.statTitle, isMobile && styles.statTitleMobile, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                TOTAL SALES
              </Text>
              <MaterialCommunityIcons name="currency-inr" size={isMobile ? 14 : 20} color="#0084FF" />
            </View>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: '#0084FF' }]} numberOfLines={1}>
              ₹{typeof totalRevenue === 'number' ? totalRevenue.toFixed(2) : totalRevenue}
            </Text>
            <Text style={{ fontSize: 11, marginTop: 4, color: activeTheme.textSecondary }}>Gross completed orders</Text>
          </GlassCard>
        </View>

        {/* Outstanding Service Charge Warning Banner */}
        {serviceChargeDue > 0 && (
          <GlassCard
            theme={theme}
            style={[styles.webProfileCard, { borderColor: '#FF453A', backgroundColor: 'rgba(255, 69, 58, 0.08)', marginBottom: 16 }]}
            intensity={activeTheme.glassIntensity}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <MaterialCommunityIcons name="alert-circle" size={18} color="#FF453A" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: activeTheme.textPrimary }}>
                    Outstanding Service Charge: ₹{serviceChargeDue.toFixed(2)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: activeTheme.textSecondary }}>
                  Clear your outstanding site commission dues to keep accepting new customer wash requests.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPayDuesModal(true)}
                style={{ backgroundColor: '#FF453A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <MaterialCommunityIcons name="credit-card-outline" size={16} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Pay Dues</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {/* Linked Payout Bank Details */}
        <GlassCard theme={theme} style={[styles.webProfileCard, { borderColor: activeTheme.cardBorder, marginBottom: 16 }]} intensity={activeTheme.glassIntensity}>
          <View style={styles.webCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="bank" size={20} color={activeTheme.iconColor} />
              <Text style={[styles.webCardHeaderTitle, { color: activeTheme.textPrimary }]}>Linked Payout Bank Account</Text>
            </View>
            {bank ? (
              <TouchableOpacity
                onPress={() => setBankModalVisible(true)}
                style={[styles.editBankBtn, { backgroundColor: activeTheme.tableHeaderBg }]}
              >
                <MaterialCommunityIcons name="pencil-outline" size={13} color="#0084FF" />
                <Text style={styles.editBankBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {bank ? (
            <View style={styles.bankDetailsBox}>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Account Holder:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.account_holder_name || profileData?.full_name || 'N/A'}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Bank Name:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.bank_name || 'N/A'}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>Account Number:</Text>
                <Text style={[styles.bankValue, { color: '#05c279', fontWeight: '800' }]}>{bank.masked_account_number || bank.account_number}</Text>
              </View>
              <View style={styles.bankInfoRow}>
                <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>IFSC Code:</Text>
                <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.ifsc_code}</Text>
              </View>
              {bank.upi_id ? (
                <View style={styles.bankInfoRow}>
                  <Text style={[styles.bankLabel, { color: activeTheme.textSecondary }]}>UPI ID:</Text>
                  <Text style={[styles.bankValue, { color: activeTheme.textPrimary }]}>{bank.upi_id}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.noBankBox}>
              <Text style={[styles.noBankText, { color: activeTheme.textSecondary }]}>
                No bank account linked yet. Link your bank account to receive service payout settlements.
              </Text>
              <TouchableOpacity onPress={() => setBankModalVisible(true)} style={[styles.addBankBtn, { backgroundColor: '#05c279' }]}>
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addBankBtnText}>Link Bank Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>

        {/* Platform Commission Fee Policy Card */}
        <GlassCard theme={theme} style={[styles.webProfileCard, { borderColor: activeTheme.cardBorder }]} intensity={activeTheme.glassIntensity}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#0084FF" />
            <Text style={[styles.webCardHeaderTitle, { fontSize: 14, color: activeTheme.textPrimary }]}>Platform Service Charge Policy</Text>
          </View>
          <Text style={{ fontSize: 12, color: activeTheme.textSecondary, lineHeight: 18 }}>
            ServEasy applies a transparent 9% site platform fee on completed service bookings. When settled online, customer payments are transferred into your wallet minus the fee. For cash-on-delivery (COD) jobs, site charges are recorded under your Service Charge Dues balance.
          </Text>
        </GlassCard>
      </View>
    );
  };

  // ─── Render ID Verification & 4 Pillars Section ─────────────────────────────
  const renderVerificationSection = () => {
    const progress = profileData?.progress;
    const is100 = (progress?.is_100 ?? (completionPercent >= 100)) || completionPercent >= 100;
    const verStatus = (profileData?.verified_status || 'approved').toLowerCase();

    return (
      <View style={styles.fullWidthSection}>
        <Text style={[styles.sectionSubtitle, isMobile && styles.sectionSubtitleMobile, { color: activeTheme.textSecondary, marginBottom: 16 }]}>
          Complete all 4 verification pillars to unlock full platform features, live booking acceptance, and payout settlements.
        </Text>

        {/* Verification Status Card */}
        <GlassCard
          theme={theme}
          style={[styles.webProfileCard, { borderColor: is100 ? '#30D158' : '#FF9500', marginBottom: 16 }]}
          intensity={activeTheme.glassIntensity}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name={is100 ? 'shield-check' : 'shield-alert'} size={28} color={is100 ? '#30D158' : '#FF9500'} />
              <View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: activeTheme.textPrimary }}>
                  {is100 ? 'Profile 100% Verified!' : `Profile ${completionPercent}% Complete`}
                </Text>
                <Text style={{ fontSize: 12, color: activeTheme.textSecondary }}>
                  Status: <Text style={{ fontWeight: '700', color: is100 ? '#30D158' : '#FF9500', textTransform: 'uppercase' }}>{verStatus}</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* Progress Bar Track */}
          <View style={[styles.progressBarTrack, { backgroundColor: activeTheme.tableHeaderBg, marginVertical: 8 }]}>
            <View style={[styles.progressBarFill, { width: `${completionPercent}%`, backgroundColor: is100 ? '#30D158' : '#0084FF' }]} />
          </View>
        </GlassCard>

        {/* 4 Pillars Grid */}
        <View style={styles.pillarsGrid}>
          {/* Pillar 1: Phone */}
          <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
            <View style={styles.pillarHeaderRow}>
              <MaterialCommunityIcons name="phone" size={16} color={progress?.pillars?.phone?.done ? '#30D158' : '#FF453A'} />
              <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Phone (25%)</Text>
            </View>
            <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.phone?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
              <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.phone?.done ? '#30D158' : '#FF453A' }]}>
                {progress?.pillars?.phone?.done ? 'Verified' : 'Missing'}
              </Text>
            </View>
          </View>

          {/* Pillar 2: Email */}
          <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
            <View style={styles.pillarHeaderRow}>
              <MaterialCommunityIcons name="email" size={16} color={progress?.pillars?.email?.done ? '#30D158' : '#FF453A'} />
              <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Email (25%)</Text>
            </View>
            <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.email?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
              <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.email?.done ? '#30D158' : '#FF453A' }]}>
                {progress?.pillars?.email?.done ? 'Verified' : 'Missing'}
              </Text>
            </View>
          </View>

          {/* Pillar 3: Address */}
          <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
            <View style={styles.pillarHeaderRow}>
              <MaterialCommunityIcons name="map-marker" size={16} color={progress?.pillars?.address?.done ? '#30D158' : '#FF453A'} />
              <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>Address (25%)</Text>
            </View>
            <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.address?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
              <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.address?.done ? '#30D158' : '#FF453A' }]}>
                {progress?.pillars?.address?.done ? 'Verified' : 'Missing'}
              </Text>
            </View>
          </View>

          {/* Pillar 4: ID Proof */}
          <View style={[styles.pillarBox, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}>
            <View style={styles.pillarHeaderRow}>
              <MaterialCommunityIcons name="card-account-details" size={16} color={progress?.pillars?.id_proof?.done ? '#30D158' : '#FF453A'} />
              <Text style={[styles.pillarName, { color: activeTheme.textPrimary }]}>ID Proof (25%)</Text>
            </View>
            <View style={[styles.pillarBadge, { backgroundColor: progress?.pillars?.id_proof?.done ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)' }]}>
              <Text style={[styles.pillarBadgeText, { color: progress?.pillars?.id_proof?.done ? '#30D158' : '#FF453A' }]}>
                {progress?.pillars?.id_proof?.done ? 'Approved' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action card to edit/manage profile & ID proof */}
        <GlassCard theme={theme} style={[styles.webProfileCard, { borderColor: activeTheme.cardBorder, marginTop: 16 }]} intensity={activeTheme.glassIntensity}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={[styles.webCardHeaderTitle, { color: activeTheme.textPrimary, marginBottom: 4 }]}>Official ID Proof Document</Text>
              <Text style={{ fontSize: 12, color: activeTheme.textSecondary }}>
                Accepted proofs: Aadhaar Card, Trade License, PAN Card, or Voter ID.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setActiveSection('profile');
                setLiveToast({ id: Date.now(), title: 'ID Proof Document', message: 'You can manage and upload your ID proof document under your profile details.', type: 'info' });
              }}
              style={{ backgroundColor: activeTheme.activeNavBg, borderColor: activeTheme.cardBorder, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <MaterialCommunityIcons name="file-upload-outline" size={16} color={activeTheme.activeNavText} />
              <Text style={{ color: activeTheme.activeNavText, fontSize: 12, fontWeight: '700' }}>Manage in Profile</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>
    );
  };

  // ─── Render Provider Benefits (Shown on Index/Home when Logged Out) ────────
  const renderProviderBenefits = () => {
    const benefitsList = [
      {
        icon: 'lightning-bolt',
        color: '#FF9500',
        title: 'Instant Live Bookings',
        desc: 'Receive immediate customer requests within your selected coverage radius with sound and push alerts.',
      },
      {
        icon: 'bank-transfer',
        color: '#30D158',
        title: 'Guaranteed Direct Payouts',
        desc: 'Fast, secure payouts directly into your linked bank account or UPI ID with 0% hidden deductions.',
      },
      {
        icon: 'map-marker-radius',
        color: '#0084FF',
        title: 'Custom Coverage Radius',
        desc: 'Define your operating perimeter from 5 km up to 30 km. You only get jobs within your comfort zone.',
      },
      {
        icon: 'shield-check',
        color: '#AF52DE',
        title: '4-Pillar Trust Badge',
        desc: 'Build customer credibility with verified phone, email, registered address, and official ID badges.',
      },
      {
        icon: 'tag-off',
        color: '#FF2D55',
        title: '0% Joining Fee',
        desc: 'Zero registration fee or monthly membership lock-in. Keep maximum earnings from your hard work.',
      },
      {
        icon: 'headphones',
        color: '#5856D6',
        title: '24/7 Dedicated Support',
        desc: 'Direct hotline and in-app priority assistance for all ServEasy verified service partners.',
      },
    ];

    const steps = [
      { num: '1', title: 'Sign In via OTP', desc: 'Instant 1-minute email verification, no passwords to remember.' },
      { num: '2', title: 'Complete 4 Pillars', desc: 'Link your phone, verify address, and upload official ID proof.' },
      { num: '3', title: 'Start Earning', desc: 'Go live, accept vehicle detailing jobs, and receive instant payouts.' },
    ];

    return (
      <View style={styles.benefitsContainer}>
        {/* Hero Card */}
        <GlassCard
          theme={theme}
          intensity={activeTheme.glassIntensity}
          style={[styles.benefitsHeroCard, { borderColor: activeTheme.cardBorder }]}
        >
          <View style={styles.benefitsHeroBadge}>
            <MaterialCommunityIcons name="star-shooting" size={14} color="#FFD60A" />
            <Text style={styles.benefitsHeroBadgeText}>SERVEASY PARTNER NETWORK</Text>
          </View>
          <Text style={[styles.benefitsHeroTitle, { color: activeTheme.textPrimary }]}>
            Grow Your Vehicle Care Business
          </Text>
          <Text style={[styles.benefitsHeroSubtitle, { color: activeTheme.textSecondary }]}>
            Connect with thousands of car and bike owners seeking doorstep & workshop detailing services across your city.
          </Text>

          <TouchableOpacity
            onPress={() => setAuthModalVisible(true)}
            style={[styles.benefitsHeroCtaBtn, { backgroundColor: '#0084FF' }]}
          >
            <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" />
            <Text style={styles.benefitsHeroCtaBtnText}>Sign In / Join as Service Provider</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </GlassCard>

        {/* Benefits Grid Header */}
        <View style={styles.benefitsSectionHeader}>
          <Text style={[styles.benefitsSectionTitle, { color: activeTheme.textPrimary }]}>
            Why Partner with ServEasy?
          </Text>
          <Text style={[styles.benefitsSectionSub, { color: activeTheme.textSecondary }]}>
            Everything you need to scale your vehicle care services seamlessly
          </Text>
        </View>

        {/* 6 Benefits Cards */}
        <View style={styles.benefitsGrid}>
          {benefitsList.map((b, idx) => (
            <GlassCard
              key={idx}
              theme={theme}
              intensity={20}
              style={[
                styles.benefitCard,
                {
                  borderColor: activeTheme.cardBorder,
                  backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.65)',
                },
              ]}
            >
              <View style={[styles.benefitIconWrap, { backgroundColor: `${b.color}22` }]}>
                <MaterialCommunityIcons name={b.icon as any} size={24} color={b.color} />
              </View>
              <Text style={[styles.benefitCardTitle, { color: activeTheme.textPrimary }]}>{b.title}</Text>
              <Text style={[styles.benefitCardDesc, { color: activeTheme.textSecondary }]}>{b.desc}</Text>
            </GlassCard>
          ))}
        </View>

        {/* 3 Step "How it works" */}
        <GlassCard
          theme={theme}
          intensity={activeTheme.glassIntensity}
          style={[styles.stepsCard, { borderColor: activeTheme.cardBorder }]}
        >
          <Text style={[styles.stepsTitle, { color: activeTheme.textPrimary }]}>How to Get Started</Text>
          <View style={styles.stepsRow}>
            {steps.map((s, idx) => (
              <View key={idx} style={styles.stepItem}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>{s.num}</Text>
                </View>
                <Text style={[styles.stepItemTitle, { color: activeTheme.textPrimary }]}>{s.title}</Text>
                <Text style={[styles.stepItemDesc, { color: activeTheme.textSecondary }]}>{s.desc}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        {/* Bottom CTA Card */}
        <GlassCard
          theme={theme}
          intensity={30}
          style={[
            styles.bottomCtaCard,
            {
              borderColor: '#0084FF',
              backgroundColor: theme === 'dark' ? 'rgba(0, 132, 255, 0.08)' : 'rgba(0, 132, 255, 0.06)',
            },
          ]}
        >
          <Text style={[styles.bottomCtaTitle, { color: activeTheme.textPrimary }]}>
            Ready to accept bookings today?
          </Text>
          <Text style={[styles.bottomCtaSubtitle, { color: activeTheme.textSecondary }]}>
            Sign in with your email to unlock your live dispatch dashboard.
          </Text>
          <TouchableOpacity
            onPress={() => setAuthModalVisible(true)}
            style={[styles.bottomCtaBtn, { backgroundColor: '#0084FF' }]}
          >
            <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" />
            <Text style={styles.bottomCtaBtnText}>Sign In Now</Text>
          </TouchableOpacity>
        </GlassCard>
      </View>
    );
  };

  // ─── Render Locked State (For Services, Bookings, Account when Logged Out) ──
  const renderLockedState = (tabTitle: string, tabDesc: string) => {
    return (
      <View style={styles.lockedContainer}>
        <GlassCard
          theme={theme}
          intensity={activeTheme.glassIntensity}
          style={[
            styles.lockedCard,
            {
              borderColor: activeTheme.cardBorder,
              backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.7)',
            },
          ]}
        >
          <View style={[styles.lockedIconCircle, { backgroundColor: 'rgba(0, 132, 255, 0.12)' }]}>
            <MaterialCommunityIcons name="lock-outline" size={40} color="#0084FF" />
          </View>
          <Text style={[styles.lockedTitle, { color: activeTheme.textPrimary }]}>
            {tabTitle} is Locked
          </Text>
          <Text style={[styles.lockedSubtitle, { color: activeTheme.textSecondary }]}>
            {tabDesc}
          </Text>

          <TouchableOpacity
            onPress={() => setAuthModalVisible(true)}
            style={[styles.lockedSignInBtn, { backgroundColor: '#0084FF' }]}
          >
            <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" />
            <Text style={styles.lockedSignInBtnText}>Sign In as Service Provider</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveSection('dashboard')}
            style={styles.lockedBackBtn}
          >
            <Text style={[styles.lockedBackBtnText, { color: activeTheme.iconColor }]}>
              ← View Partner Benefits
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </View>
    );
  };

  return (
    <View style={styles.appContainer}>
        {/* Fullscreen Gradient Background */}
        <LinearGradient colors={activeTheme.gradientColors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

        {/* Ambient Glass Blur Circles */}
        <View style={styles.ambientCirclesContainer}>
          <LinearGradient colors={activeTheme.circleGradient1} style={[styles.ambientCircle, styles.circleLeft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
          <LinearGradient colors={activeTheme.circleGradient2} style={[styles.ambientCircle, styles.circleRight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        </View>

        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} {...({ translucent: true } as any)} backgroundColor="transparent" />

          {/* FLOATING REAL-TIME TOAST NOTIFICATION */}
          {liveToast && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                try {
                  Vibration.cancel();
                  RingtoneService.stopRinging();
                } catch (_) {}
                if (liveToast.isLiveBooking) {
                  setBookingFilter('pending');
                  setActiveSection('bookings');
                } else if (liveToast.actionTab) {
                  setActiveSection(liveToast.actionTab);
                } else {
                  setActiveSection('bookings');
                }
                setLiveToast(null);
              }}
              style={styles.floatingToastWrap}
            >
              <GlassWrapper
                intensity={35}
                tint={theme === 'dark' ? 'dark' : 'light'}
                style={[
                  styles.floatingToastCard,
                  {
                    borderColor:
                      liveToast.isLiveBooking
                        ? '#30D158'
                        : liveToast.type === 'success'
                        ? '#30D158'
                        : liveToast.type === 'warning'
                        ? '#FF453A'
                        : '#0084FF',
                  },
                ]}
              >
                <View
                  style={[
                    styles.toastIconBox,
                    {
                      backgroundColor:
                        liveToast.isLiveBooking || liveToast.type === 'success'
                          ? 'rgba(48,209,88,0.2)'
                          : liveToast.type === 'warning'
                          ? 'rgba(255,69,58,0.2)'
                          : 'rgba(0,132,255,0.2)',
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      liveToast.isLiveBooking || liveToast.type === 'success'
                        ? 'bell-ring'
                        : liveToast.type === 'warning'
                        ? 'alert-circle'
                        : 'information'
                    }
                    size={20}
                    color={
                      liveToast.isLiveBooking || liveToast.type === 'success'
                        ? '#30D158'
                        : liveToast.type === 'warning'
                        ? '#FF453A'
                        : '#0084FF'
                    }
                  />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.toastTitle, { color: activeTheme.textPrimary }]}>
                    {liveToast.title}
                  </Text>
                  <Text style={[styles.toastMessage, { color: activeTheme.textSecondary }]} numberOfLines={2}>
                    {liveToast.message}
                  </Text>
                  {liveToast.isLiveBooking && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          try {
                            Vibration.cancel();
                            RingtoneService.stopRinging();
                          } catch (_) {}
                          setBookingFilter('pending');
                          setActiveSection('bookings');
                          setLiveToast(null);
                        }}
                        style={{
                          backgroundColor: '#30D158',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="arrow-right-circle" size={14} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>View & Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          try {
                            Vibration.cancel();
                            RingtoneService.stopRinging();
                          } catch (_) {}
                          setLiveToast(null);
                        }}
                        style={{
                          backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons name="volume-off" size={14} color={activeTheme.textSecondary} />
                        <Text style={{ color: activeTheme.textSecondary, fontSize: 11, fontWeight: '600' }}>Mute</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => {
                    try {
                      Vibration.cancel();
                      RingtoneService.stopRinging();
                    } catch (_) {}
                    setLiveToast(null);
                  }}
                  style={styles.toastCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>
              </GlassWrapper>
            </TouchableOpacity>
          )}

          {/* TOP BAR / HEADER */}
          <View style={[styles.headerContainer, { borderBottomWidth: 0, backgroundColor: 'transparent' }]}>
            <View style={[styles.headerLeft, { marginLeft: isMobile ? 0 : (sidebarExpanded ? 180 : 64) }]}>
              <Image source={require('./assets/logo.png')} style={styles.headerLogoImage} />
            </View>

            <View style={styles.headerRight}>
              {/* Theme Toggle Button */}
              <TouchableOpacity
                onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                style={[styles.themeToggleButton, { backgroundColor: activeTheme.activeNavBg }]}
              >
                <MaterialCommunityIcons
                  name={theme === 'dark' ? 'weather-sunny' : 'weather-night'}
                  size={16}
                  color={activeTheme.iconColor}
                />
                {!isMobile && (
                  <Text style={[styles.themeToggleText, { color: activeTheme.activeNavText }]}>
                    {theme === 'dark' ? 'Light' : 'Dark'}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Global Profile Button: Always links to My Account */}
              <TouchableOpacity
                onPress={() => setActiveSection('profile')}
                style={styles.profileBadge}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="My Account"
              >
                {!isMobile && (
                  <View style={styles.profileBadgeTextContainer}>
                    <Text style={[styles.profileBadgeLabel, { color: activeTheme.textSecondary }]}>
                      {providerUser ? 'Service Provider' : 'My Account'}
                    </Text>
                    <Text style={[styles.profileBadgeName, { color: activeTheme.textPrimary }]}>
                      {profileData?.company_name || profileData?.full_name || providerUser?.first_name || 'My Account'}
                    </Text>
                  </View>
                )}
                {providerUser ? (
                  <Image
                    source={{
                      uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        profileData?.company_name || profileData?.full_name || providerUser?.first_name || 'SP'
                      )}&background=0084FF&color=fff&size=100&bold=true`,
                    }}
                    style={styles.headerAvatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.headerAvatar,
                      {
                        backgroundColor: activeTheme.activeNavBg,
                        borderColor: activeTheme.cardBorder,
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="account" size={20} color={activeTheme.activeNavText} />
                  </View>
                )}
              </TouchableOpacity>

              {/* Hamburger Menu Button (AFTER User Icon on Mobile Header) */}
              <TouchableOpacity
                onPress={() => setRightSidebarVisible(true)}
                style={[
                  styles.headerHamburgerBtn,
                  {
                    backgroundColor: activeTheme.activeNavBg,
                    borderColor: activeTheme.cardBorder,
                  },
                ]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Open Provider Navigation Menu"
              >
                <MaterialCommunityIcons name="menu" size={22} color={activeTheme.activeNavText} />
                {pendingCount > 0 && <View style={styles.hamburgerAlertDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* MAIN CONTAINER */}
          <View style={[styles.mainLayout, isMobile && styles.mainLayoutMobile]}>
            {/* SIDEBAR NAVIGATION (Tablet / Desktop) */}
            {!isMobile && (
              <GlassWrapper
                intensity={activeTheme.glassIntensity}
                tint={theme === 'dark' ? 'dark' : 'light'}
                style={[
                  styles.sidebar,
                  { width: sidebarExpanded ? 180 : 64, borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.navBg },
                ]}
              >
                <ScrollView contentContainerStyle={styles.sidebarContent}>
                  <TouchableOpacity
                    onPress={() => setActiveSection('dashboard')}
                    style={[styles.navItem, activeSection === 'dashboard' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="view-dashboard-outline"
                      size={22}
                      color={activeSection === 'dashboard' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'dashboard' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        Overview
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveSection('services')}
                    style={[styles.navItem, activeSection === 'services' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="briefcase-outline"
                      size={22}
                      color={activeSection === 'services' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'services' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        Services
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveSection('bookings')}
                    style={[styles.navItem, activeSection === 'bookings' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-check-outline"
                      size={22}
                      color={activeSection === 'bookings' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'bookings' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        Bookings ({bookings.length})
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveSection('wallet')}
                    style={[styles.navItem, activeSection === 'wallet' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="wallet-outline"
                      size={22}
                      color={activeSection === 'wallet' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'wallet' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        Wallet
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveSection('profile')}
                    style={[styles.navItem, activeSection === 'profile' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="account-outline"
                      size={22}
                      color={activeSection === 'profile' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'profile' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        My Account
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setActiveSection('verification')}
                    style={[styles.navItem, activeSection === 'verification' && { backgroundColor: activeTheme.activeNavBg }]}
                  >
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={22}
                      color={activeSection === 'verification' ? activeTheme.activeNavText : activeTheme.textSecondary}
                    />
                    {sidebarExpanded && (
                      <Text style={[styles.navText, { color: activeSection === 'verification' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                        Verification
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>

                {/* Sidebar Collapse Toggle Button */}
                <TouchableOpacity
                  onPress={() => setSidebarExpanded(!sidebarExpanded)}
                  style={[styles.sidebarToggleBtn, { backgroundColor: activeTheme.activeNavBg }]}
                >
                  <MaterialCommunityIcons
                    name={sidebarExpanded ? 'chevron-left' : 'chevron-right'}
                    size={18}
                    color={activeTheme.iconColor}
                  />
                </TouchableOpacity>
              </GlassWrapper>
            )}

            {/* SCREEN VIEW SECTION */}
            <ScrollView
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollContentContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadLiveData(true)}
                  tintColor="#0084FF"
                  colors={['#0084FF']}
                />
              }
            >
              <View style={styles.sectionHeaderRow}>
                <View>
                  <Text style={[styles.sectionTitle, { color: activeTheme.textPrimary }]}>
                    {activeSection === 'dashboard' && (providerUser ? 'Provider Dashboard' : 'Partner Benefits')}
                    {activeSection === 'services' && 'My Services'}
                    {activeSection === 'bookings' && 'Live Bookings Manager'}
                    {activeSection === 'wallet' && 'My Wallet & Payouts'}
                    {activeSection === 'profile' && 'My Account & Profile'}
                    {activeSection === 'verification' && 'ID Verification'}
                  </Text>
                  <Text style={[styles.providerSubHeader, { color: activeTheme.textSecondary }]}>
                    {providerUser
                      ? `${profileData?.company_name || profileData?.full_name || providerUser.first_name} • Provider #${activeProviderId}`
                      : 'Join the ServEasy Service Provider Network'}
                  </Text>
                </View>

                {/* Fast Sync Button if logged in, or Sign In button if logged out */}
                {providerUser ? (
                  <TouchableOpacity
                    onPress={() => loadLiveData(true)}
                    style={[styles.syncButtonTop, { backgroundColor: activeTheme.tableHeaderBg, borderColor: activeTheme.cardBorder }]}
                  >
                    <MaterialCommunityIcons name="sync" size={16} color={activeTheme.iconColor} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setAuthModalVisible(true)}
                    style={[styles.topHeaderSignInBtn, { backgroundColor: '#0084FF' }]}
                  >
                    <MaterialCommunityIcons name="login" size={14} color="#FFFFFF" />
                    <Text style={styles.topHeaderSignInBtnText}>Sign In</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* SECTION: DASHBOARD */}
              {activeSection === 'dashboard' && (
                providerUser ? renderDashboardOverview() : renderProviderBenefits()
              )}

              {/* SECTION: SERVICES MANAGER */}
              {activeSection === 'services' && (
                providerUser ? (
                  <View style={styles.fullWidthSection}>
                    <View style={[styles.sectionHeaderRow, isMobile && styles.sectionHeaderRowMobile]}>
                      <Text style={[styles.sectionSubtitle, isMobile && styles.sectionSubtitleMobile, { color: activeTheme.textSecondary }]}>
                        Add, update and configure your offered cleaning services.
                      </Text>
                      <TouchableOpacity
                        onPress={() => setAddServiceModalVisible(true)}
                        style={[styles.sectionAddBtn, { backgroundColor: activeTheme.accentBtnBg }]}
                      >
                        <MaterialCommunityIcons name="plus" size={18} color={activeTheme.accentBtnText} />
                        <Text style={[styles.sectionAddBtnText, { color: activeTheme.accentBtnText }]}>Add Service</Text>
                      </TouchableOpacity>
                    </View>

                    {services.length === 0 ? (
                      <GlassCard
                        theme={theme}
                        style={[styles.emptyCard, { borderColor: activeTheme.cardBorder, marginTop: 16 }]}
                        intensity={activeTheme.glassIntensity}
                      >
                        <MaterialCommunityIcons name="layers-outline" size={42} color={activeTheme.textSecondary} />
                        <Text style={[styles.emptyTableTitle, { color: activeTheme.textPrimary }]}>No Services Registered</Text>
                        <Text style={[styles.emptyTableSub, { color: activeTheme.textSecondary, textAlign: 'center' }]}>
                          You have not added any services to your profile yet.{'\n'}Tap "+ Add Service" above to register your service offerings.
                        </Text>
                      </GlassCard>
                    ) : (
                      <View style={styles.servicesGrid}>
                        {services.map((item) => (
                          <GlassCard
                            key={item.id}
                            theme={theme}
                            style={[styles.serviceDetailCard, isMobile && styles.serviceDetailCardMobile]}
                            intensity={activeTheme.glassIntensity}
                          >
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => setQuickViewService(item)}
                              style={{ flex: 1 }}
                            >
                              <View style={styles.serviceDetailHeader}>
                                <View style={styles.serviceDetailIconContainer}>
                                  <MaterialCommunityIcons
                                    name={
                                      item.subcategory === 'Car Wash'
                                        ? 'car-wash'
                                        : item.subcategory.toLowerCase().includes('bike')
                                        ? 'motorbike'
                                        : 'layers-outline'
                                    }
                                    size={22}
                                    color={activeTheme.iconColor}
                                  />
                                </View>
                                <View style={[styles.serviceIdPill, { backgroundColor: activeTheme.tableHeaderBg }]}>
                                  <Text style={[styles.serviceDetailId, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                                    {item.id}
                                  </Text>
                                </View>
                              </View>

                              <Text style={[styles.serviceDetailName, { color: activeTheme.textPrimary }]} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={[styles.serviceDetailSub, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                                {item.subcategory}
                              </Text>

                              <View style={[styles.serviceDetailMetaRow, { borderTopColor: activeTheme.cardBorder }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.metaLabel}>RATE</Text>
                                  <Text style={[styles.metaValue, { color: '#30D158' }]} numberOfLines={1}>
                                    {item.rate}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={styles.metaLabel}>DURATION</Text>
                                  <Text style={[styles.metaValue, { color: activeTheme.textPrimary }]} numberOfLines={1}>
                                    {item.duration}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>

                            {/* Quick View and Edit Action Buttons */}
                            <View style={styles.serviceCardActionRow}>
                              <TouchableOpacity
                                onPress={() => setQuickViewService(item)}
                                style={[
                                  styles.serviceQuickViewBtn,
                                  { backgroundColor: activeTheme.activeNavBg, borderColor: activeTheme.cardBorder },
                                ]}
                              >
                                <MaterialCommunityIcons name="eye-outline" size={13} color={activeTheme.activeNavText} />
                                <Text style={[styles.serviceQuickViewBtnText, { color: activeTheme.activeNavText }]}>
                                  View
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleOpenEditService(item)}
                                style={styles.serviceCardEditBtnCompact}
                              >
                                <MaterialCommunityIcons name="pencil-outline" size={14} color="#0084FF" />
                              </TouchableOpacity>
                            </View>
                          </GlassCard>
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  renderLockedState('My Services', 'Sign in to configure your offered services, pricing, and availability.')
                )
              )}

              {/* SECTION: BOOKINGS MANAGER */}
              {activeSection === 'bookings' && (
                providerUser ? renderBookingsManager() : renderLockedState('Live Bookings Manager', 'Sign in to view, accept, and manage real-time customer bookings.')
              )}

              {/* SECTION: MY WALLET & PAYOUTS */}
              {activeSection === 'wallet' && (
                providerUser ? renderWalletPayoutsSection() : renderLockedState('My Wallet & Payouts', 'Sign in to access your earnings, wallet balance, and payout bank account.')
              )}

              {/* SECTION: MY ACCOUNT & PROFILE */}
              {activeSection === 'profile' && (
                providerUser ? renderProviderAccountProfile() : renderLockedState('My Account & Profile', 'Sign in to access your 4-pillar verification, profile settings, and linked bank account.')
              )}

              {/* SECTION: ID VERIFICATION */}
              {activeSection === 'verification' && (
                providerUser ? renderVerificationSection() : renderLockedState('ID Verification', 'Sign in to check your 4-pillar verification progress.')
              )}
            </ScrollView>
          </View>

          {/* FLOATING BOTTOM NAVIGATION TAB BAR (Only shown on mobile phones) */}
          {isMobile && (
            <GlassWrapper
              intensity={activeTheme.glassIntensity}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[styles.bottomNav, { borderColor: activeTheme.cardBorder, backgroundColor: activeTheme.navBg }]}
            >
              <TouchableOpacity onPress={() => setActiveSection('dashboard')} style={styles.bottomNavItem}>
                <MaterialCommunityIcons
                  name="view-dashboard-outline"
                  size={20}
                  color={activeSection === 'dashboard' ? activeTheme.activeNavText : activeTheme.textSecondary}
                />
                <Text style={[styles.bottomNavText, { color: activeSection === 'dashboard' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                  Overview
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setActiveSection('services')} style={styles.bottomNavItem}>
                <MaterialCommunityIcons
                  name="briefcase-outline"
                  size={20}
                  color={activeSection === 'services' ? activeTheme.activeNavText : activeTheme.textSecondary}
                />
                <Text style={[styles.bottomNavText, { color: activeSection === 'services' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                  Services
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setActiveSection('bookings')} style={styles.bottomNavItem}>
                <View>
                  <MaterialCommunityIcons
                    name="calendar-check-outline"
                    size={20}
                    color={activeSection === 'bookings' ? activeTheme.activeNavText : activeTheme.textSecondary}
                  />
                  {pendingCount > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.bottomNavText, { color: activeSection === 'bookings' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                  Bookings
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setActiveSection('profile')} style={styles.bottomNavItem}>
                <MaterialCommunityIcons
                  name="account-outline"
                  size={20}
                  color={activeSection === 'profile' ? activeTheme.activeNavText : activeTheme.textSecondary}
                />
                <Text style={[styles.bottomNavText, { color: activeSection === 'profile' ? activeTheme.activeNavText : activeTheme.textSecondary }]}>
                  My Account
                </Text>
              </TouchableOpacity>
            </GlassWrapper>
          )}

        {/* RIGHT SIDEBAR DRAWER (PROVIDER PAGES & QUICK SHORTCUTS) */}
        <Modal
          animationType="none"
          transparent={true}
          visible={rightSidebarVisible}
          onRequestClose={closeRightDrawer}
        >
          <View style={styles.rightDrawerBackdrop}>
            {/* Tap outside to close backdrop */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeRightDrawer}
            />

            {/* Sliding Drawer Container positioned strictly within safe area */}
            <Animated.View
              style={[
                styles.rightDrawerContainer,
                {
                  backgroundColor: theme === 'dark' ? '#14171C' : '#FFFFFF',
                  borderLeftColor: activeTheme.cardBorder,
                  transform: [{ translateX: drawerSlideAnim }],
                  top: insets.top,
                  bottom: insets.bottom,
                  right: insets.right,
                  borderTopRightRadius: insets.top > 0 ? 18 : 0,
                  borderBottomRightRadius: insets.bottom > 0 ? 18 : 0,
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              {/* Drawer Header with Provider Info & Close */}
              <View style={[styles.rightDrawerHeader, { borderBottomColor: activeTheme.cardBorder }]}>
                <View style={styles.drawerHeaderProfile}>
                  {providerUser ? (
                    <Image
                      source={{
                        uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          profileData?.company_name || profileData?.full_name || providerUser?.first_name || 'SP'
                        )}&background=0084FF&color=fff&size=100&bold=true`,
                      }}
                      style={styles.drawerAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.drawerAvatar,
                        {
                          backgroundColor: activeTheme.activeNavBg,
                          borderColor: activeTheme.cardBorder,
                          justifyContent: 'center',
                          alignItems: 'center',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons name="account" size={24} color={activeTheme.activeNavText} />
                    </View>
                  )}
                  <View style={styles.drawerProfileInfo}>
                    <Text style={[styles.drawerProviderName, { color: activeTheme.textPrimary }]} numberOfLines={1}>
                      {profileData?.company_name || profileData?.full_name || providerUser?.first_name || 'ServEasy Provider'}
                    </Text>
                    <View style={styles.drawerBadgeRow}>
                      <View
                        style={[
                          styles.drawerBadgePill,
                          {
                            backgroundColor: providerUser
                              ? completionPercent >= 100
                                ? 'rgba(48, 209, 88, 0.15)'
                                : 'rgba(0, 132, 255, 0.15)'
                              : 'rgba(142, 142, 147, 0.15)',
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={providerUser ? (completionPercent >= 100 ? 'shield-check' : 'shield-account') : 'account-question'}
                          size={12}
                          color={providerUser ? (completionPercent >= 100 ? '#30D158' : '#0084FF') : activeTheme.textSecondary}
                        />
                        <Text
                          style={[
                            styles.drawerBadgePillText,
                            {
                              color: providerUser
                                ? (completionPercent >= 100 ? '#30D158' : '#0084FF')
                                : activeTheme.textSecondary,
                            },
                          ]}
                        >
                          {providerUser
                            ? completionPercent >= 100
                              ? '100% Verified'
                              : `${completionPercent}% Complete`
                            : 'Guest'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Close Button */}
                <TouchableOpacity
                  onPress={closeRightDrawer}
                  style={[styles.drawerCloseBtn, { backgroundColor: activeTheme.activeNavBg }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close Navigation"
                >
                  <MaterialCommunityIcons name="close" size={20} color={activeTheme.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* KPI Ribbon (Services, Orders, Balance) */}
              {providerUser && (
                <View style={[styles.drawerQuickRibbon, { backgroundColor: activeTheme.tableHeaderBg, borderBottomColor: activeTheme.cardBorder }]}>
                  <View style={styles.drawerRibbonItem}>
                    <Text style={[styles.drawerRibbonVal, { color: '#0084FF' }]}>{services.length}</Text>
                    <Text style={[styles.drawerRibbonLabel, { color: activeTheme.textSecondary }]}>Services</Text>
                  </View>
                  <View style={[styles.drawerRibbonDivider, { backgroundColor: activeTheme.cardBorder }]} />
                  <View style={styles.drawerRibbonItem}>
                    <Text style={[styles.drawerRibbonVal, { color: '#30D158' }]}>{bookings.length}</Text>
                    <Text style={[styles.drawerRibbonLabel, { color: activeTheme.textSecondary }]}>Orders</Text>
                  </View>
                  <View style={[styles.drawerRibbonDivider, { backgroundColor: activeTheme.cardBorder }]} />
                  <View style={styles.drawerRibbonItem}>
                    <Text style={[styles.drawerRibbonVal, { color: '#FF9F0A' }]}>₹{walletBalance.toFixed(0)}</Text>
                    <Text style={[styles.drawerRibbonLabel, { color: activeTheme.textSecondary }]}>Wallet</Text>
                  </View>
                </View>
              )}

              {/* Drawer Scrollable Content */}
              <ScrollView
                style={styles.drawerScrollView}
                contentContainerStyle={styles.drawerScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Section Header: PROVIDER PAGES */}
                <Text style={[styles.drawerSectionHeader, { color: activeTheme.textSecondary }]}>
                  PROVIDER PAGES
                </Text>

                {/* 1. Dashboard Overview */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'dashboard' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('dashboard');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'dashboard' ? '#0084FF' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="view-dashboard-outline"
                      size={20}
                      color={activeSection === 'dashboard' ? '#FFFFFF' : activeTheme.activeNavText}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'dashboard' ? '#0084FF' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'dashboard' ? '700' : '600',
                        },
                      ]}
                    >
                      Dashboard Overview
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      KPIs, earnings & order stream
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'dashboard' ? '#0084FF' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* 2. My Services */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'services' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('services');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'services' ? '#0084FF' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="briefcase-outline"
                      size={20}
                      color={activeSection === 'services' ? '#FFFFFF' : activeTheme.activeNavText}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'services' ? '#0084FF' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'services' ? '700' : '600',
                        },
                      ]}
                    >
                      My Services
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Service catalog & pricing
                    </Text>
                  </View>
                  {services.length > 0 && (
                    <View style={[styles.drawerCountBadge, { backgroundColor: activeTheme.cardBorder }]}>
                      <Text style={[styles.drawerCountBadgeText, { color: activeTheme.textPrimary }]}>
                        {services.length}
                      </Text>
                    </View>
                  )}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'services' ? '#0084FF' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* 3. Live Bookings Manager */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'bookings' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('bookings');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'bookings' ? '#0084FF' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="calendar-check-outline"
                      size={20}
                      color={activeSection === 'bookings' ? '#FFFFFF' : activeTheme.activeNavText}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'bookings' ? '#0084FF' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'bookings' ? '700' : '600',
                        },
                      ]}
                    >
                      Live Bookings
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      {pendingCount > 0 ? `${pendingCount} pending requests` : 'Accept, manage & dispatch'}
                    </Text>
                  </View>
                  {pendingCount > 0 ? (
                    <View style={[styles.drawerCountBadge, { backgroundColor: '#FF453A' }]}>
                      <Text style={[styles.drawerCountBadgeText, { color: '#FFFFFF' }]}>
                        {pendingCount}
                      </Text>
                    </View>
                  ) : (
                    bookings.length > 0 && (
                      <View style={[styles.drawerCountBadge, { backgroundColor: activeTheme.cardBorder }]}>
                        <Text style={[styles.drawerCountBadgeText, { color: activeTheme.textPrimary }]}>
                          {bookings.length}
                        </Text>
                      </View>
                    )
                  )}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'bookings' ? '#0084FF' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* 4. My Wallet & Payouts */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'wallet' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('wallet');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'wallet' ? '#0084FF' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="wallet-outline"
                      size={20}
                      color={activeSection === 'wallet' ? '#FFFFFF' : activeTheme.activeNavText}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'wallet' ? '#0084FF' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'wallet' ? '700' : '600',
                        },
                      ]}
                    >
                      My Wallet & Payouts
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      ₹{walletBalance.toFixed(2)} available
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'wallet' ? '#0084FF' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* 5. Provider Profile & Business */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'profile' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('profile');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'profile' ? '#0084FF' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account-outline"
                      size={20}
                      color={activeSection === 'profile' ? '#FFFFFF' : activeTheme.activeNavText}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'profile' ? '#0084FF' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'profile' ? '700' : '600',
                        },
                      ]}
                    >
                      My Account & Profile
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Contact, address & banking
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'profile' ? '#0084FF' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* 6. ID Verification */}
                <TouchableOpacity
                  style={[
                    styles.drawerMenuItem,
                    activeSection === 'verification' && [styles.drawerMenuItemActive, { backgroundColor: activeTheme.activeNavBg }],
                  ]}
                  onPress={() => {
                    setActiveSection('verification');
                    closeRightDrawer();
                  }}
                >
                  <View
                    style={[
                      styles.drawerMenuIconBox,
                      {
                        backgroundColor: activeSection === 'verification' ? '#30D158' : activeTheme.tableHeaderBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={20}
                      color={activeSection === 'verification' ? '#FFFFFF' : (completionPercent >= 100 ? '#30D158' : activeTheme.activeNavText)}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text
                      style={[
                        styles.drawerMenuTitle,
                        {
                          color: activeSection === 'verification' ? '#30D158' : activeTheme.textPrimary,
                          fontWeight: activeSection === 'verification' ? '700' : '600',
                        },
                      ]}
                    >
                      ID Verification
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      {completionPercent >= 100 ? 'All 4 pillars verified' : `${completionPercent}% completed`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.drawerCountBadge,
                      { backgroundColor: completionPercent >= 100 ? 'rgba(48, 209, 88, 0.2)' : 'rgba(0, 132, 255, 0.2)' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.drawerCountBadgeText,
                        { color: completionPercent >= 100 ? '#30D158' : '#0084FF', fontWeight: '700' },
                      ]}
                    >
                      {completionPercent}%
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={18}
                    color={activeSection === 'verification' ? '#30D158' : activeTheme.textSecondary}
                  />
                </TouchableOpacity>

                {/* Section Header: QUICK ACTIONS */}
                <Text style={[styles.drawerSectionHeader, { color: activeTheme.textSecondary, marginTop: 16 }]}>
                  QUICK ACTIONS & TOOLS
                </Text>

                {/* Quick Action: Pay Site Service Charges */}
                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    closeRightDrawer();
                    setShowPayDuesModal(true);
                  }}
                >
                  <View style={[styles.drawerActionIconBox, { backgroundColor: serviceChargeDue > 0 ? 'rgba(255, 69, 58, 0.15)' : 'rgba(48, 209, 88, 0.15)' }]}>
                    <MaterialCommunityIcons
                      name="credit-card-outline"
                      size={18}
                      color={serviceChargeDue > 0 ? '#FF453A' : '#30D158'}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text style={[styles.drawerMenuTitle, { color: activeTheme.textPrimary }]}>
                      Pay Service Charges
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: serviceChargeDue > 0 ? '#FF453A' : activeTheme.textSecondary }]}>
                      {serviceChargeDue > 0 ? `₹${serviceChargeDue.toFixed(2)} due now` : 'All fees fully settled'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="arrow-top-right" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>

                {/* Quick Action: Add New Service */}
                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    closeRightDrawer();
                    setAddServiceModalVisible(true);
                  }}
                >
                  <View style={[styles.drawerActionIconBox, { backgroundColor: 'rgba(0, 132, 255, 0.15)' }]}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#0084FF" />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text style={[styles.drawerMenuTitle, { color: activeTheme.textPrimary }]}>
                      Add New Service
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Expand your service offerings
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="arrow-top-right" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>

                {/* Quick Action: Sync Live Data */}
                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    closeRightDrawer();
                    loadLiveData(true);
                  }}
                >
                  <View style={[styles.drawerActionIconBox, { backgroundColor: activeTheme.tableHeaderBg }]}>
                    <MaterialCommunityIcons name="sync" size={18} color={activeTheme.iconColor} />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text style={[styles.drawerMenuTitle, { color: activeTheme.textPrimary }]}>
                      Sync Live Data
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Fetch latest bookings & charges
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="refresh" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>

                {/* Quick Action: Live Booking Ringtone */}
                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => {
                    closeRightDrawer();
                    setRingtoneSettingsModalVisible(true);
                  }}
                >
                  <View style={[styles.drawerActionIconBox, { backgroundColor: 'rgba(0, 132, 255, 0.15)' }]}>
                    <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#0084FF" />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text style={[styles.drawerMenuTitle, { color: activeTheme.textPrimary }]}>
                      Live Booking Ringtone
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Default ringtone & custom music
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>

                {/* Quick Action: Toggle Dark/Light Theme */}
                <TouchableOpacity
                  style={styles.drawerActionItem}
                  onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  <View style={[styles.drawerActionIconBox, { backgroundColor: activeTheme.tableHeaderBg }]}>
                    <MaterialCommunityIcons
                      name={theme === 'dark' ? 'weather-sunny' : 'weather-night'}
                      size={18}
                      color={theme === 'dark' ? '#FFD60A' : '#0084FF'}
                    />
                  </View>
                  <View style={styles.drawerMenuTextBox}>
                    <Text style={[styles.drawerMenuTitle, { color: activeTheme.textPrimary }]}>
                      {theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                    </Text>
                    <Text style={[styles.drawerMenuSub, { color: activeTheme.textSecondary }]}>
                      Currently {theme.toUpperCase()} mode
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="theme-light-dark" size={16} color={activeTheme.textSecondary} />
                </TouchableOpacity>
              </ScrollView>

              {/* Drawer Footer */}
              <View style={[styles.drawerFooter, { borderTopColor: activeTheme.cardBorder, backgroundColor: activeTheme.tableHeaderBg }]}>
                {providerUser ? (
                  <TouchableOpacity
                    style={[styles.drawerLogoutBtn, { borderColor: '#FF453A33' }]}
                    onPress={() => {
                      closeRightDrawer();
                      handleLogout();
                    }}
                  >
                    <MaterialCommunityIcons name="logout" size={18} color="#FF453A" />
                    <Text style={styles.drawerLogoutBtnText}>Log Out</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.drawerSignInBtn}
                    onPress={() => {
                      closeRightDrawer();
                      setAuthModalVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" />
                    <Text style={styles.drawerSignInBtnText}>Sign In to Provider Portal</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </View>
        </Modal>
        
        {/* MODAL: PAY SITE SERVICE CHARGE DUES */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={showPayDuesModal}
          onRequestClose={() => {
            if (!isPayingDues) setShowPayDuesModal(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={activeTheme.glassIntensity}
              tint={theme}
              style={[
                styles.modalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(25, 27, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                  maxWidth: 400,
                  width: '92%',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View>
                  <Text style={[styles.modalTitle, { color: '#F59E0B', marginBottom: 2 }]}>Pay Site Service Charge</Text>
                  <Text style={{ fontSize: 12, color: activeTheme.textSecondary }}>
                    Platform Commission Clearance
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (!isPayingDues) setShowPayDuesModal(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons name="close" size={22} color={activeTheme.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingVertical: 14 }}>
                <View
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    marginBottom: 14,
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#F59E0B', fontWeight: '600' }}>Outstanding Dues</Text>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: '#F59E0B', marginTop: 4 }}>
                    ₹{serviceChargeDue.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: 11, color: activeTheme.textSecondary, marginTop: 4 }}>
                    Clearing this charge immediately allows you to accept new service bookings.
                  </Text>
                </View>

                {/* Option 1: Pay from Wallet */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: walletBalance >= serviceChargeDue ? '#0084FF' : activeTheme.cardBorder,
                    backgroundColor: walletBalance >= serviceChargeDue ? 'rgba(0, 132, 255, 0.08)' : activeTheme.tableHeaderBg,
                    marginBottom: 10,
                    opacity: walletBalance >= serviceChargeDue ? 1 : 0.6,
                  }}
                  disabled={walletBalance < serviceChargeDue || isPayingDues}
                  onPress={() => handlePayServiceCharge('wallet')}
                >
                  <MaterialCommunityIcons name="wallet-outline" size={22} color={walletBalance >= serviceChargeDue ? '#0084FF' : activeTheme.textSecondary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: activeTheme.textPrimary }}>
                      Pay from Wallet Balance
                    </Text>
                    <Text style={{ fontSize: 11, color: walletBalance >= serviceChargeDue ? '#30D158' : '#FF453A' }}>
                      Available: ₹{walletBalance.toFixed(2)} {walletBalance < serviceChargeDue ? '(Insufficient)' : ''}
                    </Text>
                  </View>
                  {walletBalance >= serviceChargeDue && (
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#0084FF" />
                  )}
                </TouchableOpacity>

                {/* Option 2: Pay Online */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  }}
                  disabled={isPayingDues}
                  onPress={() => handlePayServiceCharge('online')}
                >
                  <MaterialCommunityIcons name="credit-card-outline" size={22} color="#10B981" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: activeTheme.textPrimary }}>
                      Pay Online (UPI / Card / NetBanking)
                    </Text>
                    <Text style={{ fontSize: 11, color: activeTheme.textSecondary }}>
                      Instant clearance via payment gateway
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#10B981" />
                </TouchableOpacity>
              </View>

              {isPayingDues && (
                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={{ fontSize: 12, color: activeTheme.textSecondary, marginTop: 4 }}>
                    Processing clearance...
                  </Text>
                </View>
              )}
            </GlassWrapper>
          </View>
        </Modal>

      </SafeAreaView>

        {/* MODAL 1: PROVIDER OTP AUTH MODAL */}
        <ProviderAuthModal
          visible={authModalVisible}
          onClose={() => setAuthModalVisible(false)}
          theme={theme}
          activeTheme={activeTheme}
          onLoginSuccess={(user) => {
            setProviderUser(user);
            setActiveSection('dashboard');
            loadLiveData(true, user.id);
            setLiveToast({
              id: Date.now(),
              title: '🎉 Welcome Back!',
              message: `Logged in successfully as ${user.first_name || 'Service Provider'}.`,
              type: 'success',
            });
          }}
        />

        {/* MODAL: PRETTY LOGOUT CONFIRMATION MODAL */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={logoutModalVisible}
          onRequestClose={() => setLogoutModalVisible(false)}
        >
          <View style={styles.logoutModalOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.logoutModalBackdrop}
              onPress={() => setLogoutModalVisible(false)}
            />
            <GlassCard
              theme={theme}
              intensity={45}
              style={[
                styles.logoutModalCard,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(18, 20, 24, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              <View style={styles.logoutModalIconWrap}>
                <MaterialCommunityIcons name="logout" size={28} color="#FF453A" />
              </View>

              <Text style={[styles.logoutModalTitle, { color: activeTheme.textPrimary }]}>
                Log Out?
              </Text>

              <Text style={[styles.logoutModalSubtitle, { color: activeTheme.textSecondary }]}>
                Are you sure you want to log out from Provider Portal? You can sign back in anytime with your registered email.
              </Text>

              <View style={styles.logoutModalActions}>
                <TouchableOpacity
                  onPress={() => setLogoutModalVisible(false)}
                  style={[
                    styles.logoutModalCancelBtn,
                    {
                      backgroundColor: activeTheme.tableHeaderBg,
                      borderColor: activeTheme.cardBorder,
                    },
                  ]}
                >
                  <Text style={[styles.logoutModalCancelText, { color: activeTheme.textPrimary }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={confirmLogout}
                  style={styles.logoutModalConfirmBtn}
                >
                  <MaterialCommunityIcons name="logout" size={16} color="#FFFFFF" />
                  <Text style={styles.logoutModalConfirmText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        </Modal>

        {/* MODAL 2: LINKED BANK ACCOUNT MODAL */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={bankModalVisible}
          onRequestClose={() => setBankModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={30}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.modalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(20, 22, 26, 0.95)' : 'rgba(255, 255, 255, 0.96)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              <Text style={[styles.modalTitle, { color: activeTheme.textPrimary }]}>Payout Bank Account</Text>

              <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.55 }}>
                <View style={styles.formGroup}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Account Holder Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    value={bankHolderName}
                    onChangeText={setBankHolderName}
                    placeholder="Full Name as per Bank"
                    placeholderTextColor={activeTheme.textSecondary}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Bank Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="e.g. State Bank of India, HDFC"
                    placeholderTextColor={activeTheme.textSecondary}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Account Number</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    value={bankAccountNumber}
                    onChangeText={setBankAccountNumber}
                    keyboardType="number-pad"
                    placeholder="e.g. 012345678901"
                    placeholderTextColor={activeTheme.textSecondary}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>IFSC Code</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    value={bankIfsc}
                    onChangeText={(val) => setBankIfsc(val.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="e.g. SBIN0001234"
                    placeholderTextColor={activeTheme.textSecondary}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>UPI ID (Optional)</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    value={bankUpi}
                    onChangeText={setBankUpi}
                    autoCapitalize="none"
                    placeholder="e.g. provider@upi"
                    placeholderTextColor={activeTheme.textSecondary}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={handleSaveBankAccount}
                  disabled={isSavingBank}
                  style={[styles.modalBtn, styles.modalSubmitBtn, { backgroundColor: '#30D158' }]}
                >
                  {isSavingBank ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Save Bank Account</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBankModalVisible(false)} style={[styles.modalBtn, styles.modalCancelBtn]}>
                  <Text style={[styles.modalBtnText, { color: activeTheme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL 3: QUICK VIEW BOOKING DETAILS */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={quickViewBooking !== null}
          onRequestClose={() => setQuickViewBooking(null)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={30}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.quickViewModalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(20, 22, 26, 0.95)' : 'rgba(255, 255, 255, 0.96)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              {quickViewBooking && (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalSubHeader, { color: activeTheme.textSecondary }]}>
                        BOOKING DETAILS
                      </Text>
                      <Text style={[styles.modalTitleText, { color: activeTheme.textPrimary }]}>
                        {quickViewBooking.bookingNumber}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => setQuickViewBooking(null)}
                      style={[styles.modalCloseCircle, { backgroundColor: activeTheme.tableHeaderBg }]}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={activeTheme.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
                    <View style={[styles.modalStatusBanner, { backgroundColor: activeTheme.tableHeaderBg }]}>
                      <View>
                        <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>STATUS</Text>
                        <View style={[styles.bookingStatusBadge, { backgroundColor: getStatusBadgeStyle(quickViewBooking.status).bg, marginTop: 4 }]}>
                          <Text style={[styles.bookingStatusText, { color: getStatusBadgeStyle(quickViewBooking.status).text }]}>
                            {getStatusBadgeStyle(quickViewBooking.status).label}
                          </Text>
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>TOTAL AMOUNT</Text>
                        <Text style={[styles.modalPriceText, { color: '#30D158' }]}>
                          {formatCurrency(quickViewBooking.price)}
                        </Text>
                        <Text style={[styles.modalPayMode, { color: activeTheme.textSecondary }]}>
                          {quickViewBooking.paymentMethod} • {quickViewBooking.paymentStatus}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.modalSectionBox}>
                      <Text style={[styles.modalSectionTitle, { color: activeTheme.textPrimary }]}>
                        Customer Information
                      </Text>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="account" size={16} color={activeTheme.iconColor} />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          {quickViewBooking.customerName}
                        </Text>
                      </View>
                      {quickViewBooking.customerPhone && (
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="phone" size={16} color="#30D158" />
                          <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                            {quickViewBooking.customerPhone}
                          </Text>
                        </View>
                      )}
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="map-marker" size={16} color="#FF453A" />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          {quickViewBooking.address}
                          {quickViewBooking.landmark ? ` (Landmark: ${quickViewBooking.landmark})` : ''}
                          {quickViewBooking.pincode ? ` - ${quickViewBooking.pincode}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.openExternalMapBtn, { marginTop: 8, alignSelf: 'flex-start' }]}
                        onPress={() => {
                          if (quickViewBooking.latitude && quickViewBooking.longitude) {
                            const url = `https://www.google.com/maps/dir/?api=1&destination=${quickViewBooking.latitude},${quickViewBooking.longitude}`;
                            Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open Google Maps app.'));
                          } else {
                            const query = encodeURIComponent(`${quickViewBooking.address} ${quickViewBooking.pincode || ''}`.trim());
                            const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
                            Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open Google Maps app.'));
                          }
                        }}
                      >
                        <MaterialCommunityIcons name={quickViewBooking.latitude ? "navigation" : "google-maps"} size={14} color="#FFFFFF" />
                        <Text style={styles.openExternalMapBtnText}>
                          {quickViewBooking.latitude ? "Navigate to Customer" : "Search in Google Maps"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.modalSectionBox}>
                      <Text style={[styles.modalSectionTitle, { color: activeTheme.textPrimary }]}>
                        Service & Vehicle Details
                      </Text>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="car-wash" size={16} color={activeTheme.iconColor} />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          Service: <Text style={{ fontWeight: '700' }}>{quickViewBooking.serviceName}</Text>
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="calendar-clock" size={16} color={activeTheme.iconColor} />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          Schedule: <Text style={{ fontWeight: '700' }}>{quickViewBooking.date} at {quickViewBooking.time || 'Flexible'}</Text>
                        </Text>
                      </View>
                      {(quickViewBooking.vehicleBrand || quickViewBooking.vehicleModel || quickViewBooking.vehicleRegNo) && (
                        <View style={styles.infoRow}>
                          <MaterialCommunityIcons name="car-info" size={16} color={activeTheme.iconColor} />
                          <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                            Vehicle: {[quickViewBooking.vehicleBrand, quickViewBooking.vehicleModel, quickViewBooking.vehicleRegNo].filter(Boolean).join(' • ')}
                          </Text>
                        </View>
                      )}
                      {quickViewBooking.notes && (
                        <View style={[styles.infoRow, { alignItems: 'flex-start' }]}>
                          <MaterialCommunityIcons name="note-text-outline" size={16} color={activeTheme.textSecondary} style={{ marginTop: 2 }} />
                          <Text style={[styles.infoRowText, { color: activeTheme.textSecondary, fontStyle: 'italic' }]}>
                            "{quickViewBooking.notes}"
                          </Text>
                        </View>
                      )}
                    </View>
                  </ScrollView>

                  <View style={[styles.modalActionsFooter, { borderTopColor: activeTheme.cardBorder }]}>
                    {quickViewBooking.status === 'pending' && (
                      <View style={styles.modalActionButtonsWrap}>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            setQuickViewBooking(null);
                            handleRejectBooking(b);
                          }}
                          style={[styles.modalActionBtn, styles.declineBtn]}
                        >
                          <MaterialCommunityIcons name="close" size={16} color="#FF453A" />
                          <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            handleAcceptBooking(b);
                          }}
                          style={[styles.modalActionBtn, styles.acceptBtn]}
                        >
                          <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Accept Booking</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {quickViewBooking.status === 'accepted' && (
                      <View style={styles.modalActionButtonsWrap}>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            setQuickViewBooking(null);
                            handleRejectBooking(b);
                          }}
                          style={[styles.modalActionBtn, styles.declineBtn]}
                        >
                          <MaterialCommunityIcons name="close" size={16} color="#FF453A" />
                          <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            handleStartJob(b);
                          }}
                          style={[styles.modalActionBtn, styles.startJobBtn]}
                        >
                          <MaterialCommunityIcons name="play" size={18} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Start Job</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {quickViewBooking.status === 'in_progress' && (
                      <View style={styles.modalActionButtonsWrap}>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            setQuickViewBooking(null);
                            handleCancelBooking(b);
                          }}
                          style={[styles.modalActionBtn, styles.declineBtn]}
                        >
                          <MaterialCommunityIcons name="close" size={16} color="#FF453A" />
                          <Text style={[styles.actionBtnText, { color: '#FF453A' }]}>Cancel Job</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            handleCompleteJob(b);
                          }}
                          style={[styles.modalActionBtn, styles.completeBtn]}
                        >
                          <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Complete</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {quickViewBooking.status === 'completed' && quickViewBooking.paymentStatus !== 'PAID' && (
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            setQuickViewBooking(null);
                            handleShowQrModal(b);
                          }}
                          style={[styles.modalActionBtn, { backgroundColor: '#0084FF', flex: 1 }]}
                        >
                          <MaterialCommunityIcons name="qrcode-scan" size={16} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Show QR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            const b = quickViewBooking;
                            handleMarkBookingPaid(b);
                          }}
                          style={[styles.modalActionBtn, { backgroundColor: '#10B981', flex: 1.2 }]}
                        >
                          <MaterialCommunityIcons name="cash-check" size={16} color="#FFFFFF" />
                          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Mark Paid</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {(quickViewBooking.status === 'completed' || quickViewBooking.status === 'rejected' || quickViewBooking.status === 'cancelled') && (
                      <TouchableOpacity
                        onPress={() => setQuickViewBooking(null)}
                        style={[styles.modalFullBtn, { backgroundColor: activeTheme.tableHeaderBg }]}
                      >
                        <Text style={[styles.actionBtnText, { color: activeTheme.textPrimary }]}>Close</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL: COLLECT PAYMENT VIA DYNAMIC UPI QR CODE */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={qrModalBooking !== null}
          onRequestClose={() => setQrModalBooking(null)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={35}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.quickViewModalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(20, 22, 26, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                  maxWidth: 380,
                  alignItems: 'center',
                },
              ]}
            >
              {qrModalBooking && (() => {
                const amt = qrModalBooking.price || 0;
                const bNum = qrModalBooking.bookingNumber;
                const upiStr = `upi://pay?pa=serveasy@upi&pn=ServEasy%20Marketplace&am=${amt.toFixed(2)}&tr=${encodeURIComponent(bNum)}&tn=Booking%20Payment%20${encodeURIComponent(bNum)}&cu=INR`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiStr)}`;

                return (
                  <>
                    <View style={[styles.modalHeaderRow, { width: '100%', marginBottom: 12 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0, 132, 255, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialCommunityIcons name="qrcode-scan" size={20} color="#0084FF" />
                        </View>
                        <View>
                          <Text style={[styles.modalTitleText, { fontSize: 16, color: activeTheme.textPrimary }]}>Payment QR Code</Text>
                          <Text style={[styles.modalSubHeader, { fontSize: 11, color: activeTheme.textSecondary }]}>Ref: #{bNum}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setQrModalBooking(null)}
                        style={[styles.modalCloseCircle, { backgroundColor: activeTheme.tableHeaderBg }]}
                      >
                        <MaterialCommunityIcons name="close" size={18} color={activeTheme.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 12, color: activeTheme.textSecondary, marginBottom: 8, textAlign: 'center' }}>
                      Customer can scan using Google Pay, PhonePe, Paytm, or BHIM UPI
                    </Text>

                    <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: activeTheme.cardBorder, marginBottom: 14 }}>
                      <Image
                        source={{ uri: qrUrl }}
                        style={{ width: 200, height: 200, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                    </View>

                    <View style={{ alignItems: 'center', marginBottom: 16 }}>
                      <Text style={{ fontSize: 11, color: activeTheme.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>Amount to Collect</Text>
                      <Text style={{ fontSize: 26, fontWeight: '900', color: '#10B981', marginTop: 2 }}>₹{amt.toFixed(2)}</Text>
                      <Text style={{ fontSize: 12, color: activeTheme.textSecondary, marginTop: 4 }}>Customer: {qrModalBooking.customerName || 'Verified User'}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                      <TouchableOpacity
                        onPress={() => setQrModalBooking(null)}
                        style={[styles.modalActionBtn, { backgroundColor: activeTheme.tableHeaderBg, flex: 1 }]}
                      >
                        <Text style={[styles.actionBtnText, { color: activeTheme.textSecondary }]}>Close</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          const b = qrModalBooking;
                          setQrModalBooking(null);
                          handleMarkBookingPaid(b);
                        }}
                        style={[styles.modalActionBtn, { backgroundColor: '#10B981', flex: 1.6 }]}
                      >
                        <MaterialCommunityIcons name="cash-check" size={16} color="#FFFFFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Confirm Paid</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL: QUICK VIEW SERVICE DETAILS */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={quickViewService !== null}
          onRequestClose={() => setQuickViewService(null)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={30}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.quickViewModalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(20, 22, 26, 0.95)' : 'rgba(255, 255, 255, 0.96)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              {quickViewService && (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalSubHeader, { color: activeTheme.textSecondary }]}>
                        SERVICE DETAILS
                      </Text>
                      <Text style={[styles.modalTitleText, { color: activeTheme.textPrimary }]}>
                        {quickViewService.name}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setQuickViewService(null)}
                      style={[styles.modalCloseCircle, { backgroundColor: activeTheme.tableHeaderBg }]}
                    >
                      <MaterialCommunityIcons name="close" size={20} color={activeTheme.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
                    <View style={[styles.modalStatusBanner, { backgroundColor: activeTheme.tableHeaderBg }]}>
                      <View>
                        <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>SERVICE CATEGORY</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                          <MaterialCommunityIcons
                            name={
                              quickViewService.subcategory === 'Car Wash'
                                ? 'car-wash'
                                : quickViewService.subcategory.toLowerCase().includes('bike')
                                ? 'motorbike'
                                : 'layers-outline'
                            }
                            size={18}
                            color="#0084FF"
                          />
                          <Text style={{ color: activeTheme.textPrimary, fontWeight: '700', fontSize: 13 }}>
                            {quickViewService.subcategory}
                          </Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>STATUS</Text>
                        <View style={[styles.bookingStatusBadge, { backgroundColor: 'rgba(48, 209, 88, 0.15)', marginTop: 4 }]}>
                          <Text style={[styles.bookingStatusText, { color: '#30D158' }]}>
                            {quickViewService.approvalStatus ? quickViewService.approvalStatus.toUpperCase() : 'ACTIVE'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.modalSectionBox}>
                      <Text style={[styles.modalSectionTitle, { color: activeTheme.textPrimary }]}>Pricing & Duration</Text>
                      <View style={[styles.modalDetailRow, { borderBottomColor: activeTheme.cardBorder, borderBottomWidth: 1, paddingBottom: 10, marginBottom: 10 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>STANDARD RATE</Text>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#30D158', marginTop: 2 }}>
                            {quickViewService.rate}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.modalSectionLabel, { color: activeTheme.textSecondary }]}>ESTIMATED DURATION</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: activeTheme.textPrimary, marginTop: 4 }}>
                            {quickViewService.duration}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="identifier" size={16} color={activeTheme.iconColor} />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          Service Code: <Text style={{ fontWeight: '700' }}>{quickViewService.id}</Text>
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#30D158" />
                        <Text style={[styles.infoRowText, { color: activeTheme.textPrimary }]}>
                          State: <Text style={{ fontWeight: '700', color: quickViewService.isActive ? '#30D158' : '#FF453A' }}>
                            {quickViewService.isActive ? 'Available for Customer Bookings' : 'Paused / Inactive'}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  </ScrollView>

                  <View style={[styles.modalActionsFooter, { borderTopColor: activeTheme.cardBorder, flexDirection: 'row', gap: 8 }]}>
                    <TouchableOpacity
                      onPress={() => {
                        const item = quickViewService;
                        setQuickViewService(null);
                        handleOpenEditService(item);
                      }}
                      style={[styles.modalFullBtn, { flex: 1.2, backgroundColor: '#0084FF' }]}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={15} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const sId = quickViewService.id;
                        setQuickViewService(null);
                        handleDeleteService(sId);
                      }}
                      style={[styles.modalFullBtn, { flex: 1, backgroundColor: 'rgba(255, 69, 58, 0.15)', borderColor: '#FF453A', borderWidth: 1 }]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#FF453A" />
                      <Text style={{ color: '#FF453A', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setQuickViewService(null)}
                      style={[styles.modalFullBtn, { flex: 0.8, backgroundColor: activeTheme.tableHeaderBg }]}
                    >
                      <Text style={{ color: activeTheme.textPrimary, fontWeight: '700', fontSize: 13 }}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL: EDIT SERVICE */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={editingService !== null}
          onRequestClose={() => setEditingService(null)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={25}
              tint="dark"
              style={[
                styles.modalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(25, 27, 30, 0.96)' : 'rgba(255, 255, 255, 0.97)',
                  borderColor: activeTheme.cardBorder,
                  maxHeight: SCREEN_HEIGHT * 0.85,
                },
              ]}
            >
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalSubHeader, { color: activeTheme.textSecondary }]}>
                    EDIT SERVICE {editingService?.id}
                  </Text>
                  <Text style={[styles.modalTitleText, { color: activeTheme.textPrimary }]}>
                    Edit Service Details
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setEditingService(null)}
                  style={[styles.modalCloseCircle, { backgroundColor: activeTheme.tableHeaderBg }]}
                >
                  <MaterialCommunityIcons name="close" size={20} color={activeTheme.textPrimary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
                <View style={styles.modalForm}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Service Name</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="e.g. Bike Wash (Eco)"
                    placeholderTextColor={activeTheme.textSecondary}
                    value={editServiceName}
                    onChangeText={setEditServiceName}
                  />

                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Category / Subcategory</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="e.g. Bike Wash, Car Wash"
                    placeholderTextColor={activeTheme.textSecondary}
                    value={editServiceSub}
                    onChangeText={setEditServiceSub}
                  />

                  {/* Category Shortcut Chips */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {['Bike Wash', 'Car Wash', 'Vehicle Servicing', 'Vehicle Parts', 'Garage Service', 'Home Maintenance'].map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setEditServiceSub(cat)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: editServiceSub === cat ? '#0084FF' : activeTheme.tableHeaderBg,
                          borderWidth: 1,
                          borderColor: editServiceSub === cat ? '#0084FF' : activeTheme.cardBorder,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: editServiceSub === cat ? '#FFFFFF' : activeTheme.textSecondary }}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Rate (INR ₹)</Text>
                      <TextInput
                        style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                        placeholder="e.g. 25.00"
                        keyboardType="numeric"
                        placeholderTextColor={activeTheme.textSecondary}
                        value={editServiceRate}
                        onChangeText={setEditServiceRate}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Duration</Text>
                      <TextInput
                        style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                        placeholder="e.g. 60 mins"
                        placeholderTextColor={activeTheme.textSecondary}
                        value={editServiceDuration}
                        onChangeText={setEditServiceDuration}
                      />
                    </View>
                  </View>

                  {/* Status Toggle: Active vs Paused */}
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary, marginTop: 4 }]}>Service Status</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    <TouchableOpacity
                      onPress={() => setEditServiceIsActive(true)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: editServiceIsActive ? 'rgba(48, 209, 88, 0.15)' : activeTheme.tableHeaderBg,
                        borderWidth: 1,
                        borderColor: editServiceIsActive ? '#30D158' : activeTheme.cardBorder,
                        gap: 6,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={15}
                        color={editServiceIsActive ? '#30D158' : activeTheme.textSecondary}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: editServiceIsActive ? '#30D158' : activeTheme.textSecondary }}>
                        Active
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setEditServiceIsActive(false)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: !editServiceIsActive ? 'rgba(255, 69, 58, 0.15)' : activeTheme.tableHeaderBg,
                        borderWidth: 1,
                        borderColor: !editServiceIsActive ? '#FF453A' : activeTheme.cardBorder,
                        gap: 6,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="pause-circle"
                        size={15}
                        color={!editServiceIsActive ? '#FF453A' : activeTheme.textSecondary}
                      />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: !editServiceIsActive ? '#FF453A' : activeTheme.textSecondary }}>
                        Paused
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.modalActions, { marginTop: 10 }]}>
                <TouchableOpacity
                  onPress={handleSaveEditService}
                  style={[styles.modalBtn, styles.modalSubmitBtn, { backgroundColor: '#0084FF' }]}
                >
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Save Changes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (editingService) {
                      const sId = editingService.id;
                      setEditingService(null);
                      handleDeleteService(sId);
                    }
                  }}
                  style={[styles.modalBtn, { backgroundColor: 'rgba(255, 69, 58, 0.15)', borderColor: '#FF453A', borderWidth: 1 }]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={15} color="#FF453A" />
                  <Text style={[styles.modalBtnText, { color: '#FF453A', marginLeft: 4 }]}>Delete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setEditingService(null)}
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                >
                  <Text style={[styles.modalBtnText, { color: activeTheme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL 4: ADD SERVICE */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={addServiceModalVisible}
          onRequestClose={() => setAddServiceModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={25}
              tint="dark"
              style={[styles.modalContent, { backgroundColor: theme === 'dark' ? 'rgba(25, 27, 30, 0.9)' : 'rgba(255, 255, 255, 0.95)', borderColor: activeTheme.cardBorder }]}
            >
              <Text style={[styles.modalTitle, { color: activeTheme.textPrimary }]}>Add Cleaning Service</Text>

              <View style={styles.modalForm}>
                <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Service Name</Text>
                <TextInput
                  style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                  placeholder="e.g. Car Polish, Deep Clean"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={newServiceName}
                  onChangeText={setNewServiceName}
                />

                <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Subcategory</Text>
                <TextInput
                  style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                  placeholder="e.g. Car Wash, Bike Wash"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={newServiceSub}
                  onChangeText={setNewServiceSub}
                />

                <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Rate (INR)</Text>
                <TextInput
                  style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                  placeholder="e.g. 15.00"
                  keyboardType="numeric"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={newServiceRate}
                  onChangeText={setNewServiceRate}
                />

                <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Duration</Text>
                <TextInput
                  style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                  placeholder="e.g. 45 mins, 1 hour"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={newServiceDuration}
                  onChangeText={setNewServiceDuration}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={handleAddService}
                    style={[styles.modalBtn, styles.modalSubmitBtn, { backgroundColor: activeTheme.accentBtnBg }]}
                  >
                    <Text style={[styles.modalBtnText, { color: activeTheme.accentBtnText }]}>Create</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAddServiceModalVisible(false)}
                    style={[styles.modalBtn, styles.modalCancelBtn]}
                  >
                    <Text style={[styles.modalBtnText, { color: activeTheme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL 5: REGISTER COMPANY */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={companyModalVisible}
          onRequestClose={() => setCompanyModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={25}
              tint="dark"
              style={[
                styles.modalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(25, 27, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="office-building" size={20} color="#05c279" />
                <Text style={[styles.modalTitle, { color: activeTheme.textPrimary, marginLeft: 8 }]}>
                  Register Company Name
                </Text>
              </View>
              <Text style={[styles.modalSubDesc, { color: activeTheme.textSecondary, marginBottom: 16 }]}>
                Registering a company name will convert your account to a Company Provider and unlock multi-branch management.
              </Text>

              <View style={styles.modalForm}>
                <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Company / Business Name *</Text>
                <TextInput
                  style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                  placeholder="e.g. Apex Detailing Hub Pvt Ltd"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={newCompanyName}
                  onChangeText={setNewCompanyName}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={handleRegisterCompany}
                    disabled={isRegisteringCompany}
                    style={[styles.modalBtn, styles.modalSubmitBtn, { backgroundColor: '#05c279' }]}
                  >
                    {isRegisteringCompany ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Register Company</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCompanyModalVisible(false)}
                    style={[styles.modalBtn, styles.modalCancelBtn]}
                  >
                    <Text style={[styles.modalBtnText, { color: activeTheme.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </GlassWrapper>
          </View>
        </Modal>

        {/* MODAL 6: ADD BRANCH */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={branchModalVisible}
          onRequestClose={() => setBranchModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <GlassWrapper
              intensity={25}
              tint="dark"
              style={[
                styles.modalContent,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(25, 27, 30, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="source-branch" size={20} color="#05c279" />
                <Text style={[styles.modalTitle, { color: activeTheme.textPrimary, marginLeft: 8 }]}>
                  Add Branch Location
                </Text>
              </View>

              <ScrollView style={{ maxHeight: 380 }}>
                <View style={styles.modalForm}>
                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Branch Name *</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="e.g. Salt Lake Sector V Branch"
                    placeholderTextColor={activeTheme.textSecondary}
                    value={newBranchName}
                    onChangeText={setNewBranchName}
                  />

                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Branch Phone</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="+91 XXXXX XXXXX"
                    keyboardType="phone-pad"
                    placeholderTextColor={activeTheme.textSecondary}
                    value={newBranchPhone}
                    onChangeText={setNewBranchPhone}
                  />

                  <TouchableOpacity
                    onPress={handlePinBranchLocation}
                    disabled={isLocatingBranch}
                    style={[styles.singlePinLocationBtn, { marginVertical: 8, paddingVertical: 8 }]}
                    activeOpacity={0.8}
                  >
                    {isLocatingBranch ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#FFFFFF" />
                    )}
                    <Text style={[styles.singlePinLocationBtnText, { fontSize: 12 }]}>
                      {isLocatingBranch ? 'Locating Branch...' : 'Pin Current Branch Location'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Branch Address *</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="Full street address..."
                    placeholderTextColor={activeTheme.textSecondary}
                    value={newBranchAddress}
                    onChangeText={setNewBranchAddress}
                  />

                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Landmark</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="Nearby landmark..."
                    placeholderTextColor={activeTheme.textSecondary}
                    value={newBranchLandmark}
                    onChangeText={setNewBranchLandmark}
                  />

                  <Text style={[styles.modalInputLabel, { color: activeTheme.textSecondary }]}>Pincode</Text>
                  <TextInput
                    style={[styles.modalInput, { color: activeTheme.textPrimary, borderColor: activeTheme.cardBorder }]}
                    placeholder="6-digit pincode"
                    keyboardType="numeric"
                    placeholderTextColor={activeTheme.textSecondary}
                    value={newBranchPincode}
                    onChangeText={setNewBranchPincode}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={handleAddBranch}
                  disabled={isAddingBranch}
                  style={[styles.modalBtn, styles.modalSubmitBtn, { backgroundColor: '#05c279' }]}
                >
                  {isAddingBranch ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Add Branch</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setBranchModalVisible(false)}
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                >
                  <Text style={[styles.modalBtnText, { color: activeTheme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </GlassWrapper>
          </View>
        </Modal>

        {/* ─── STYLISH CUSTOM ALERT / CONFIRMATION MODAL ─── */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={customAlert !== null}
          onRequestClose={() => setCustomAlert(null)}
        >
          <View style={styles.alertModalOverlay}>
            <GlassWrapper
              intensity={35}
              tint={theme === 'dark' ? 'dark' : 'light'}
              style={[
                styles.stylishAlertCard,
                {
                  backgroundColor: theme === 'dark' ? 'rgba(18, 20, 26, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                  borderColor: activeTheme.cardBorder,
                },
              ]}
            >
              {customAlert && (
                <View style={styles.stylishAlertBody}>
                  {/* Glowing Top Icon Container */}
                  <View
                    style={[
                      styles.stylishAlertIconWrap,
                      {
                        backgroundColor:
                          customAlert.type === 'start'
                            ? 'rgba(0, 132, 255, 0.14)'
                            : customAlert.type === 'success'
                            ? 'rgba(48, 209, 88, 0.14)'
                            : customAlert.type === 'danger'
                            ? 'rgba(255, 69, 58, 0.14)'
                            : customAlert.type === 'warning'
                            ? 'rgba(255, 149, 0, 0.14)'
                            : 'rgba(0, 132, 255, 0.12)',
                        borderColor:
                          customAlert.type === 'start'
                            ? 'rgba(0, 132, 255, 0.35)'
                            : customAlert.type === 'success'
                            ? 'rgba(48, 209, 88, 0.35)'
                            : customAlert.type === 'danger'
                            ? 'rgba(255, 69, 58, 0.35)'
                            : customAlert.type === 'warning'
                            ? 'rgba(255, 149, 0, 0.35)'
                            : 'rgba(0, 132, 255, 0.3)',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={customAlert.icon as any}
                      size={28}
                      color={customAlert.iconColor}
                    />
                  </View>

                  {/* Title */}
                  <Text style={[styles.stylishAlertTitle, { color: activeTheme.textPrimary }]}>
                    {customAlert.title}
                  </Text>

                  {/* Message */}
                  {customAlert.message ? (
                    <Text style={[styles.stylishAlertMessage, { color: activeTheme.textSecondary }]}>
                      {customAlert.message}
                    </Text>
                  ) : null}

                  {/* Actions */}
                  <View
                    style={[
                      styles.stylishAlertActionsRow,
                      customAlert.buttons.length === 1 && { justifyContent: 'center' },
                    ]}
                  >
                    {customAlert.buttons.map((btn, idx) => {
                      const isCancel = btn.style === 'cancel' || btn.text?.toLowerCase() === 'cancel';
                      const isDestructive =
                        btn.style === 'destructive' ||
                        btn.text?.toLowerCase().includes('delete') ||
                        btn.text?.toLowerCase().includes('decline') ||
                        btn.text?.toLowerCase().includes('reject');
                      const isPrimary = !isCancel && !isDestructive;

                      return (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.8}
                          onPress={() => {
                            const action = btn.onPress;
                            setCustomAlert(null);
                            if (action) {
                              action();
                            }
                          }}
                          style={[
                            styles.stylishAlertBtn,
                            isCancel && [
                              styles.stylishAlertCancelBtn,
                              {
                                backgroundColor: activeTheme.tableHeaderBg,
                                borderColor: activeTheme.cardBorder,
                              },
                            ],
                            isDestructive && [
                              styles.stylishAlertDestructiveBtn,
                              { backgroundColor: '#FF453A' },
                            ],
                            isPrimary && [
                              styles.stylishAlertPrimaryBtn,
                              {
                                backgroundColor:
                                  customAlert.type === 'success'
                                    ? '#30D158'
                                    : customAlert.type === 'start'
                                    ? '#0084FF'
                                    : '#0084FF',
                              },
                            ],
                            customAlert.buttons.length === 1 && { flex: 1, maxWidth: '100%' },
                          ]}
                        >
                          {isDestructive && (
                            <MaterialCommunityIcons
                              name="trash-can-outline"
                              size={16}
                              color="#FFFFFF"
                              style={{ marginRight: 6 }}
                            />
                          )}
                          {customAlert.type === 'start' && !isCancel && (
                            <MaterialCommunityIcons
                              name="play"
                              size={16}
                              color="#FFFFFF"
                              style={{ marginRight: 6 }}
                            />
                          )}
                          {customAlert.type === 'success' && !isCancel && (
                            <MaterialCommunityIcons
                              name="check"
                              size={16}
                              color="#FFFFFF"
                              style={{ marginRight: 6 }}
                            />
                          )}
                          <Text
                            style={[
                              styles.stylishAlertBtnText,
                              isCancel && { color: activeTheme.textSecondary },
                              (isDestructive || isPrimary) && { color: '#FFFFFF', fontWeight: '800' },
                            ]}
                          >
                            {btn.text}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </GlassWrapper>
          </View>
        </Modal>

        {/* LIVE BOOKING RINGTONE & NOTIFICATION SETTINGS MODAL */}
        <RingtoneSettingsModal
          visible={ringtoneSettingsModalVisible}
          onClose={() => setRingtoneSettingsModalVisible(false)}
          theme={theme}
        />
      </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ProviderAppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
  },
  ambientCirclesContainer: {
    ...(StyleSheet.absoluteFill as any),
    overflow: 'hidden',
  },
  ambientCircle: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: (SCREEN_WIDTH * 0.9) / 2,
    opacity: 0.85,
  },
  circleLeft: {
    top: -SCREEN_HEIGHT * 0.05,
    left: -SCREEN_WIDTH * 0.25,
  },
  circleRight: {
    bottom: -SCREEN_HEIGHT * 0.05,
    right: -SCREEN_WIDTH * 0.25,
  },
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogoImage: {
    width: 140,
    height: 35,
    resizeMode: 'contain',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 16,
  },
  themeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileBadgeTextContainer: {
    marginRight: 10,
    alignItems: 'flex-end',
  },
  profileBadgeLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  profileBadgeName: {
    fontSize: 13,
    fontWeight: '700',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  mainLayoutMobile: {
    flexDirection: 'column',
  },
  sidebar: {
    height: '100%',
    borderRightWidth: 1,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  sidebarContent: {
    paddingHorizontal: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  navText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  sidebarToggleBtn: {
    alignSelf: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  scrollContent: {
    flex: 1,
    padding: 16,
  },
  scrollContentContainer: {
    paddingBottom: isMobile ? 110 : 40,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  providerSubHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 16,
  },
  syncButtonTop: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  dashboardView: {
    width: '100%',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    marginRight: 10,
    marginBottom: 10,
  },
  statCardMobile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    marginRight: 0,
    marginBottom: 0,
  },
  statsContainerMobile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
    width: '100%',
  },
  statTitleMobile: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    flexShrink: 1,
    marginRight: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  statValueMobile: {
    fontSize: 15,
    fontWeight: '800',
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48,209,88,0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#30D158',
    marginRight: 4,
  },
  liveIndicatorText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#30D158',
    letterSpacing: 0.5,
  },
  splitContentLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  splitContentLayoutMobile: {
    flexDirection: 'column',
  },
  liveGpsBroadcasterCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    width: '100%',
  },
  liveGpsBroadcasterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveGpsPulseIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveGpsTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  liveGpsSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  liveGpsCoordsText: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  liveGpsPingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#30D158',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  liveGpsPingBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dashboardFullWidthCard: {
    width: '100%',
    padding: 16,
    marginBottom: 16,
  },
  dashboardTableCard: {
    flex: 1.5,
    minWidth: 320,
    padding: 16,
    marginRight: 12,
    marginBottom: 16,
  },
  dashboardTableCardMobile: {
    marginRight: 0,
    width: '100%',
  },
  tableHeaderSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tableCardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  tableCardSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  viewAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    marginRight: 4,
  },
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  addServiceBtnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  thText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  tdText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tableRowSub: {
    fontSize: 10,
    marginTop: 1,
  },
  boldText: {
    fontWeight: '700',
  },
  emptyTable: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  emptyTableTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyTableSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
  },
  colId: {
    width: 45,
  },
  colName: {
    width: 140,
  },
  colRate: {
    width: 70,
    textAlign: 'right',
    paddingRight: 8,
  },
  colDuration: {
    width: 70,
  },
  colAction: {
    width: 50,
    alignItems: 'flex-end',
  },
  rowActionContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  tableActionDeleteBtn: {
    padding: 4,
  },
  dashboardProfileCard: {
    flex: 1,
    minWidth: 260,
    padding: 16,
    marginBottom: 16,
  },
  dashboardProfileCardMobile: {
    width: '100%',
  },
  profileCardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  fullWidthSection: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  sectionHeaderRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    maxWidth: '85%',
  },
  sectionSubtitleMobile: {
    maxWidth: '100%',
    marginBottom: 10,
  },
  refreshIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  refreshIconText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  sectionAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  sectionAddBtnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  serviceDetailCard: {
    width: '48.5%',
    padding: 12,
    marginBottom: 10,
  },
  serviceDetailCardMobile: {
    width: '48.5%',
    padding: 10,
    marginBottom: 10,
  },
  serviceDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceDetailIconContainer: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  serviceIdPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 70,
  },
  serviceDetailId: {
    fontSize: 10,
    fontWeight: '700',
  },
  serviceDetailName: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  serviceDetailSub: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 8,
  },
  serviceDetailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: '#8E8E93',
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 1,
  },
  serviceCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  serviceQuickViewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  serviceQuickViewBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  serviceCardEditBtnCompact: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(0, 132, 255, 0.12)',
    borderColor: 'rgba(0, 132, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardDeleteBtnCompact: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardDeleteBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  serviceCardDeleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF453A',
  },
  filterChipsContainer: {
    marginBottom: 14,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  bookingsList: {
    width: '100%',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    borderRadius: 16,
  },
  // Distinct Individual Booking Card Styles
  distinctBookingCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  cardStatusAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  bookingCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 2,
  },
  bookingCardIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
  },
  bookingIdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  bookingIdPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  locationTypePillNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  locationTypePillTextNew: {
    fontSize: 10,
    fontWeight: '700',
  },
  bookingStatusBadgeNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    gap: 5,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bookingStatusTextNew: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  customerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerNameTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  customerSubText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  serviceInsetBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  servicePriceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  serviceNameBold: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  priceHighlightText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#30D158',
    marginRight: 6,
  },
  paymentStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  paymentStatusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduleDateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  distinctCardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickViewButtonNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  quickViewButtonTextNew: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionButtonsGroupNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distinctActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 5,
  },
  distinctActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  acceptBtnNew: {
    backgroundColor: '#30D158',
  },
  declineBtnNew: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  startJobBtnNew: {
    backgroundColor: '#0084FF',
  },
  completeBtnNew: {
    backgroundColor: '#30D158',
  },
  doneTagNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  doneTagTextNew: {
    fontSize: 11,
    fontWeight: '700',
  },
  bookingCard: {
    padding: 14,
    marginBottom: 12,
  },
  dashboardBookingItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bookingId: {
    fontSize: 11,
    fontWeight: '700',
  },
  locationTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  locationTypePillText: {
    fontSize: 9,
    fontWeight: '700',
    marginLeft: 2,
  },
  bookingName: {
    fontSize: 15,
    fontWeight: '800',
  },
  bookingStatusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  bookingStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  bookingDetails: {
    flexDirection: isMobile ? 'column' : 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 0,
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    marginBottom: isMobile ? 4 : 0,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
    flexShrink: 1,
  },
  payStatusChip: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  payStatusChipText: {
    fontSize: 9,
    fontWeight: '800',
  },
  bookingActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  quickViewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickViewButtonText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 3,
  },
  actionButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  acceptBtn: {
    backgroundColor: '#30D158',
  },
  declineBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  startJobBtn: {
    backgroundColor: '#0084FF',
  },
  completeBtn: {
    backgroundColor: '#30D158',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  doneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  doneTagText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },

  // ─── PROFILE / MY ACCOUNT STYLES ─────────────────────────────────────────────
  progressCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  progressTitleText: {
    fontSize: 15,
    fontWeight: '800',
  },
  progressSubText: {
    fontSize: 11,
    marginTop: 2,
    maxWidth: 260,
  },
  progressPillBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  progressPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  missingItemsBox: {
    backgroundColor: 'rgba(255,69,58,0.12)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
  },
  missingItemsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF453A',
    marginBottom: 4,
  },
  missingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  missingItemText: {
    fontSize: 11,
    color: '#FFFFFF',
    marginLeft: 4,
  },
  pillarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  pillarBox: {
    flex: 1,
    minWidth: '47%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pillarName: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  pillarBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginBottom: 4,
  },
  pillarBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  pillarVal: {
    fontSize: 10,
    fontWeight: '500',
  },
  profileEditCard: {
    padding: 20,
    borderRadius: 18,
    marginBottom: 16,
  },
  profileEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileEditHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  profileAvatarLargeWrap: {
    position: 'relative',
  },
  profileEditAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#08090C',
  },
  profileEditAvatarInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileEditAvatarInfoMobile: {
    marginLeft: 0,
    marginTop: 12,
    alignItems: 'center',
  },
  profileEditTitleName: {
    fontSize: 18,
    fontWeight: '800',
  },
  badgeTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  typePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  typePillBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    marginLeft: 3,
  },
  memberSinceText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  formContainer: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  formInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
  },
  submitProfileBtn: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitProfileBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
  },
  bankHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editBankBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,132,255,0.15)',
  },
  editBankBtnText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  bankDetailsBox: {
    gap: 6,
  },
  bankInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  bankLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  bankValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  noBankBox: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  noBankText: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 260,
  },
  addBankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addBankBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.4)',
    backgroundColor: 'rgba(255,69,58,0.1)',
    marginBottom: 24,
  },
  logoutBtnText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },

  // Floating Toast
  floatingToastWrap: {
    position: 'absolute',
    top: 50,
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 10,
  },
  floatingToastCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  toastIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  toastMessage: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  toastCloseBtn: {
    padding: 4,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  stylishAlertCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
  stylishAlertBody: {
    width: '100%',
    alignItems: 'center',
  },
  stylishAlertIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  stylishAlertTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  stylishAlertMessage: {
    fontSize: 13.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  stylishAlertActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    justifyContent: 'space-between',
  },
  stylishAlertBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  stylishAlertCancelBtn: {
    borderWidth: 1,
  },
  stylishAlertPrimaryBtn: {
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  stylishAlertDestructiveBtn: {
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  stylishAlertBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalForm: {
    width: '100%',
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalInput: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalSubmitBtn: {
    backgroundColor: '#0084FF',
  },
  modalCancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickViewModalContent: {
    width: '92%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalSubHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalTitleText: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollBody: {
    maxHeight: SCREEN_HEIGHT * 0.5,
    marginBottom: 12,
  },
  modalStatusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalSectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalPriceText: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  modalPayMode: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  modalSectionBox: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoRowText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  modalActionsFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  modalActionButtonsWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  modalFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
    width: '100%',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    height: 60,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  bottomNavText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },

  // Header Sign In Buttons
  headerSignInPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 5,
  },
  headerSignInPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  topHeaderSignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  topHeaderSignInBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Benefits View (Logged Out on Index/Home)
  benefitsContainer: {
    paddingBottom: 24,
  },
  benefitsHeroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  benefitsHeroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 214, 10, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
    gap: 5,
  },
  benefitsHeroBadgeText: {
    color: '#FFD60A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  benefitsHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  benefitsHeroSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  benefitsHeroCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  benefitsHeroCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  benefitsSectionHeader: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  benefitsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  benefitsSectionSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  benefitsGrid: {
    gap: 12,
    marginBottom: 20,
  },
  benefitCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  benefitIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  benefitCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  benefitCardDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  stepsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  stepsTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 14,
  },
  stepsRow: {
    gap: 12,
  },
  stepItem: {
    flexDirection: 'column',
    position: 'relative',
    paddingLeft: 34,
  },
  stepNumberBadge: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepItemDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  bottomCtaCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    alignItems: 'center',
    textAlign: 'center',
  },
  bottomCtaTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  bottomCtaSubtitle: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 14,
  },
  bottomCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
    gap: 6,
  },
  bottomCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Locked State
  lockedContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    textAlign: 'center',
  },
  lockedIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockedSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  lockedSignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  lockedSignInBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  lockedBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lockedBackBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Pretty Logout Modal Styles
  logoutModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  logoutModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  logoutModalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoutModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  logoutModalSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  logoutModalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  logoutModalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutModalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  logoutModalConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FF453A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#FF453A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  logoutModalConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Web Profile Parity Styles
  completeBannerCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 16,
  },
  completeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completeBannerIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  completeBannerDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  completeBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#05c279',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  completeBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  webProfileCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  webAvatarContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  webAvatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#05c279',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 194, 121, 0.1)',
  },
  webAvatarImg: {
    width: '100%',
    height: '100%',
  },
  webAvatarName: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  webAvatarSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  webAvatarSubtitleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  webTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 14,
  },
  webTypePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  webDivider: {
    width: '100%',
    height: 1,
    marginBottom: 14,
  },
  webStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 4,
  },
  webStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  webStatValueGreen: {
    color: '#05c279',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  webStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  webStatDivider: {
    width: 1,
    height: 26,
  },
  webStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 2,
  },
  webStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  webStatValueSince: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  webCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  webCardHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  saveProfileBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  saveProfileBtnTopText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  regBadgePill: {
    backgroundColor: 'rgba(5, 194, 121, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  regBadgePillText: {
    color: '#05c279',
    fontSize: 10,
    fontWeight: '700',
  },
  webFormRow: {
    marginBottom: 12,
  },
  webFormLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  webFormInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  webSubheaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  webSubheaderTitle: {
    color: '#05c279',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  pinOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  pinOnMapBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  webStatusSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  webStatusTable: {
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
  },
  webStatusItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  webStatusItemLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  webBadgeGreenPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  webBadgeGreenPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  webIndividualBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  webIndividualBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  webIndividualBoxSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  webRegisterCompanyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 6,
    alignSelf: 'flex-start',
  },
  webRegisterCompanyBtnText: {
    color: '#05c279',
    fontSize: 12,
    fontWeight: '700',
  },
  webSaveProfileBtnBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  webSaveProfileBtnBottomText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  webBranchCountBadge: {
    backgroundColor: 'rgba(0, 132, 255, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  webBranchCountBadgeText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  webAddBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  webAddBranchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  webRegCompanyToBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  webRegCompanyToBranchBtnText: {
    color: '#f6c23e',
    fontSize: 11,
    fontWeight: '600',
  },
  webBranchLockAlert: {
    backgroundColor: 'rgba(246, 194, 62, 0.12)',
    borderWidth: 1,
    borderColor: '#f6c23e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 10,
  },
  webBranchLockAlertTitle: {
    color: '#f6c23e',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  webBranchLockAlertDesc: {
    color: '#dcdcdc',
    fontSize: 11,
    lineHeight: 16,
  },
  webBranchLockAlertBtn: {
    backgroundColor: '#f6c23e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    gap: 6,
  },
  webBranchLockAlertBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  webBranchTable: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  webBranchTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  webBranchTableTh: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  webBranchEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  webBranchEmptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  webBranchTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
  },
  webBranchTableCell: {
    fontSize: 11,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalSubDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  // Inline Profile Map Styles
  inlineMapContainer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  mapActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  singlePinLocationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05c279',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#05c279',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  singlePinLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mapDoorstepBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 15,
  },
  mapDoorstepText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  syncPinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(5, 194, 121, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(5, 194, 121, 0.3)',
  },
  syncPinBtnText: {
    color: '#05c279',
    fontSize: 10,
    fontWeight: '700',
  },
  liveLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#05c279',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  liveLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  openExternalMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0084FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  openExternalMapBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapViewport: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafletMapCanvas: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: '#E2E8F0',
  },
  leafletZoomControl: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  leafletZoomBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafletZoomDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  leafletZoomText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  leafletLayerBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  leafletCenterPinContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  leafletPopupWrapper: {
    alignItems: 'center',
    marginBottom: -4,
    zIndex: 25,
  },
  leafletPopupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  leafletPopupText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flexShrink: 1,
  },
  leafletPopupBeak: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 0,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    marginTop: -1,
  },
  leafletPinTouch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafletPinShadow: {
    width: 14,
    height: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    marginTop: -4,
  },
  leafletNudgePad: {
    position: 'absolute',
    bottom: 28,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    padding: 4,
    borderRadius: 8,
    alignItems: 'center',
    gap: 3,
    zIndex: 20,
  },
  leafletNudgeBtn: {
    width: 26,
    height: 26,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafletBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 15,
  },
  leafletStatusText: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '600',
  },
  leafletCoordsText: {
    color: '#38BDF8',
    fontSize: 9,
    fontWeight: '700',
  },
  leafletWatermarkText: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '500',
  },
  mapRoadH: {
    position: 'absolute',
    top: '48%',
    left: 0,
    right: 0,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  mapRoadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '46%',
    width: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  mapRoadDiag: {
    position: 'absolute',
    top: 20,
    left: -40,
    width: 320,
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    transform: [{ rotate: '35deg' }],
  },
  mapGreenPark: {
    position: 'absolute',
    top: 15,
    right: 20,
    width: 65,
    height: 55,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 194, 121, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(5, 194, 121, 0.3)',
  },
  mapCenterPinWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  mapPinPulseRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 59, 48, 0.22)',
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  mapPinShadow: {
    width: 12,
    height: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    marginTop: -4,
  },
  mapCoordinatesBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 15,
  },
  mapCoordinatesText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  mapNudgePad: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    padding: 6,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
    zIndex: 15,
  },
  mapNudgeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFooterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  mapFooterNoteText: {
    fontSize: 11,
    textAlign: 'center',
  },

  // Hamburger Menu on Header Styles
  headerHamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    borderWidth: 1,
    position: 'relative',
  },
  hamburgerAlertDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
  },

  // Right Sidebar Drawer Styles
  rightDrawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  rightDrawerContainer: {
    position: 'absolute',
    width: Math.min(340, SCREEN_WIDTH * 0.86),
    borderLeftWidth: 1,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 20,
  },
  rightDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  drawerHeaderProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0, 132, 255, 0.4)',
  },
  drawerProfileInfo: {
    marginLeft: 10,
    flex: 1,
  },
  drawerProviderName: {
    fontSize: 15,
    fontWeight: '700',
  },
  drawerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  drawerBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  drawerBadgePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerQuickRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  drawerRibbonItem: {
    alignItems: 'center',
    flex: 1,
  },
  drawerRibbonVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  drawerRibbonLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  drawerRibbonDivider: {
    width: 1,
    height: 22,
  },
  drawerScrollView: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  drawerSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  drawerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  drawerMenuItemActive: {
    borderRadius: 12,
  },
  drawerMenuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  drawerMenuTextBox: {
    flex: 1,
  },
  drawerMenuTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  drawerMenuSub: {
    fontSize: 11,
    fontWeight: '400',
    marginTop: 1,
  },
  drawerCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 6,
  },
  drawerCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  drawerActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 3,
  },
  drawerActionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  drawerFooter: {
    padding: 14,
    borderTopWidth: 1,
  },
  drawerLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 69, 58, 0.08)',
  },
  drawerLogoutBtnText: {
    color: '#FF453A',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerSignInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#0084FF',
  },
  drawerSignInBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
