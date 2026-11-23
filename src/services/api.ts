import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dynamically determine the backend API base endpoint
const getBaseApiUrl = (): string => {
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envApiUrl) {
    let clean = envApiUrl.replace(/\/+$/, '');
    if (!clean.endsWith('/api') && !clean.includes('/api/')) {
      clean = `${clean}/api`;
    }
    return clean;
  }
  return 'https://beige-curlew-610555.hostingersite.com/api';
};

export const API_BASE_URL = getBaseApiUrl();

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface ProviderBooking {
  id: string;
  numericId: number;
  bookingNumber: string;
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  packageName?: string;
  price: number;
  date: string;
  time: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
  paymentMethod: string;
  paymentStatus: string;
  locationType: 'doorstep' | 'shop';
  address: string;
  landmark?: string;
  pincode?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleRegNo?: string;
  vehicleColor?: string;
  extras?: any[];
  notes?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  latitude?: number;
  longitude?: number;
}

export interface ProviderServiceItem {
  id: string;
  numericId: number;
  name: string;
  subcategory: string;
  rate: string;
  duration: string;
  price: number;
  isActive: boolean;
  approvalStatus: string;
}

export interface ProviderStats {
  totalServices?: number;
  totalBookings?: number;
  totalRevenue?: number;
  pendingCount?: number;
  acceptedCount?: number;
  inProgressCount?: number;
  completedCount?: number;
  products?: number;
  orders?: number;
  sales?: string | number;
  total_services?: number;
  total_bookings?: number;
  total_sales?: number;
}

export interface LiveProviderEvent {
  id: number;
  event_name: 'booking.created' | 'booking.accepted' | 'booking.rejected' | 'booking.cancelled' | 'booking.updated';
  booking_id: number;
  payload: {
    booking_id: number;
    booking_number: string;
    status: string;
    remarks?: string | null;
    service_name?: string;
    customer_name?: string;
    total_amount?: string | number;
    [key: string]: any;
  };
  created_at: string;
}

export interface OtpConfig {
  email_otp_enabled: boolean;
  phone_otp_enabled: boolean;
  mode: 'email' | 'phone' | 'both';
  label: string;
  placeholder: string;
  validation_message: string;
  input_type: string;
}

export interface ProviderUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  access_token?: string;
  refresh_token?: string;
}

export interface ProfilePillar {
  name: string;
  done: boolean;
  val: string;
  percent: number;
  badge: string;
  badge_class: string;
  status?: string;
}

export interface ProfileProgress {
  percentage: number;
  is_100: boolean;
  pillars: {
    phone: ProfilePillar;
    email: ProfilePillar;
    address: ProfilePillar;
    id_proof: ProfilePillar;
  };
  missing: string[];
  id_status: string;
}

export interface ProviderBankAccount {
  id?: number;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  masked_account_number?: string;
  ifsc_code: string;
  upi_id?: string;
  is_verified?: number;
}

export interface ProviderBranchItem {
  id: number;
  branch_name: string;
  address: string;
  phone?: string;
  latitude?: string;
  longitude?: string;
}

export interface ProviderProfileData {
  id: number;
  full_name: string;
  display_name: string;
  email: string;
  phone: string;
  company_name: string;
  has_company: boolean;
  location_address: string;
  landmark: string;
  pincode: string;
  latitude?: string;
  longitude?: string;
  service_range_km: number;
  verified_status: string;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  progress: ProfileProgress;
  bank_account?: ProviderBankAccount | null;
  branches?: ProviderBranchItem[];
  stats?: {
    total_services: number;
    total_bookings: number;
    total_sales: number;
  };
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Helper to construct authenticated headers for provider requests
 */
async function getAuthHeaders(providerId?: number): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (providerId) {
    headers['X-Provider-Id'] = String(providerId);
  }
  try {
    const user = await getStoredProviderUser();
    if (user?.access_token) {
      headers['Authorization'] = `Bearer ${user.access_token}`;
    }
    if (!headers['X-Provider-Id'] && user?.id) {
      headers['X-Provider-Id'] = String(user.id);
    }
  } catch (e) {
    // Ignore storage read failures
  }
  return headers;
}

/**
 * Fetch all live bookings assigned to this provider from the backend API
 * Strictly returns only bookings assigned to the specified providerId
 */
export async function fetchProviderBookingsApi(providerId: number): Promise<ProviderBooking[]> {
  if (!providerId) return [];
  try {
    const authHeaders = await getAuthHeaders(providerId);
    const res = await fetch(`${API_BASE_URL}/bookings.php?provider_id=${providerId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        // Strict provider isolation: ONLY return bookings belonging to this provider
        const myBookings = json.data.filter((item: any) => Number(item.provider_id) === Number(providerId));
        return myBookings.map((item: any): ProviderBooking => {
          let parsedExtras: any[] = [];
          if (item.extras) {
            try {
              parsedExtras = typeof item.extras === 'string' ? JSON.parse(item.extras) : item.extras;
              if (!Array.isArray(parsedExtras)) parsedExtras = [];
            } catch {
              parsedExtras = [];
            }
          }

          const rawStatus = (item.status || 'pending').toLowerCase();
          const cleanStatus = (
            rawStatus === 'confirmed' ? 'accepted' :
            rawStatus === 'accepted' ? 'accepted' :
            rawStatus === 'in_progress' ? 'in_progress' :
            rawStatus === 'completed' ? 'completed' :
            rawStatus === 'rejected' ? 'rejected' :
            rawStatus === 'cancelled' ? 'cancelled' : 'pending'
          ) as ProviderBooking['status'];

          return {
            id: `#${item.booking_number || item.id}`,
            numericId: Number(item.id),
            bookingNumber: item.booking_number || `SN-${item.id}`,
            customerName: item.customer_first_name || 'Verified Customer',
            customerPhone: item.customer_phone || undefined,
            serviceName: item.service_name || 'Vehicle Service',
            packageName: item.vehicle_type ? `${item.vehicle_type} Service` : 'Standard Package',
            price: Number(item.total_amount) || 0,
            date: item.schedule_date || '',
            time: item.schedule_time ? item.schedule_time.substring(0, 5) : '',
            status: cleanStatus,
            paymentMethod: item.payment_method || 'COD',
            paymentStatus: (item.payment_status || 'PENDING').toUpperCase(),
            locationType: (item.location_type === 'shop' ? 'shop' : 'doorstep') as 'doorstep' | 'shop',
            address: item.address || 'Customer doorstep location',
            landmark: item.landmark || undefined,
            pincode: item.pincode || undefined,
            vehicleType: item.vehicle_type || undefined,
            vehicleBrand: item.vehicle_brand || undefined,
            vehicleModel: item.vehicle_model || undefined,
            vehicleRegNo: item.vehicle_reg_no || undefined,
            vehicleColor: item.vehicle_color || undefined,
            extras: parsedExtras,
            notes: item.notes || undefined,
            startedAt: item.started_at || null,
            completedAt: item.completed_at || null,
            createdAt: item.created_at || null,
            latitude: item.latitude && Number(item.latitude) !== 0 ? Number(item.latitude) : undefined,
            longitude: item.longitude && Number(item.longitude) !== 0 ? Number(item.longitude) : undefined,
          };
        });
      }
    }
  } catch (e) {
    console.log('[Provider API] Error fetching live bookings:', e);
  }
  return [];
}

/**
 * Update the booking status (accepted, in_progress, completed, rejected, cancelled)
 */
export async function updateProviderBookingStatusApi(
  bookingId: number,
  status: 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled',
  providerId: number,
  remarks?: string
): Promise<{ success: boolean; message: string }> {
  if (!providerId) return { success: false, message: 'Provider ID required' };
  try {
    const authHeaders = await getAuthHeaders(providerId);
    authHeaders['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE_URL}/bookings.php`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'update_status',
        id: bookingId,
        status: status,
        provider_id: providerId,
        remarks: remarks || `Status updated to ${status} via Provider App`,
      }),
    });

    const json = await res.json().catch(() => null);
    if (res.ok && (json?.success || json?.status === 'success')) {
      return {
        success: true,
        message: json?.message || `Booking status updated to ${status.replace('_', ' ').toUpperCase()}`,
      };
    }
    return { success: false, message: json?.message || 'Failed to update booking status' };
  } catch (e) {
    console.log('[Provider API] Error updating booking status:', e);
  }
  return { success: false, message: 'Network error updating booking status' };
}

/**
 * Mark a completed COD booking as PAID (cash collected by provider at doorstep)
 * Incurs ₹20 site service charge
 */
export async function markBookingPaidApi(
  bookingId: number,
  providerId: number
): Promise<{ success: boolean; message: string; serviceChargeDue?: number }> {
  if (!providerId) return { success: false, message: 'Provider ID required' };
  try {
    const authHeaders = await getAuthHeaders(providerId);
    authHeaders['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE_URL}/bookings.php`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'mark_paid',
        id: bookingId,
        provider_id: providerId,
      }),
    });

    const json = await res.json().catch(() => null);
    if (res.ok && (json?.success || json?.status === 'success')) {
      return {
        success: true,
        message: json?.message || 'Payment marked as PAID!',
        serviceChargeDue: json?.data?.service_charge_due || 20.0,
      };
    }
    return { success: false, message: json?.message || 'Failed to mark payment as paid' };
  } catch (e) {
    console.log('[Provider API] Error marking booking paid:', e);
  }
  return { success: false, message: 'Network error recording payment' };
}

/**
 * Clear outstanding site service charges (via wallet balance or online payment)
 */
export async function payProviderServiceChargeApi(
  providerId: number,
  method: 'wallet' | 'online' = 'wallet'
): Promise<{ success: boolean; message: string; clearedAmount?: number }> {
  if (!providerId) return { success: false, message: 'Provider ID required' };
  try {
    const authHeaders = await getAuthHeaders(providerId);
    authHeaders['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE_URL}/bookings.php`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        action: 'pay_service_charge',
        provider_id: providerId,
        payment_method: method,
      }),
    });

    const json = await res.json().catch(() => null);
    if (res.ok && (json?.success || json?.status === 'success')) {
      return {
        success: true,
        message: json?.message || 'Site service charge cleared successfully!',
        clearedAmount: json?.data?.cleared_amount || 0,
      };
    }
    return { success: false, message: json?.message || 'Failed to clear service charges' };
  } catch (e) {
    console.log('[Provider API] Error paying service charge:', e);
  }
  return { success: false, message: 'Network error processing service charge payment' };
}

/**
 * Fetch provider service charge dues and balance
 */
export async function getProviderServiceChargesApi(
  providerId: number
): Promise<{ success: boolean; totalDue: number; availableBalance: number; canAcceptBookings: boolean; charges: any[] }> {
  if (!providerId) {
    return { success: false, totalDue: 0, availableBalance: 0, canAcceptBookings: true, charges: [] };
  }
  try {
    const authHeaders = await getAuthHeaders(providerId);
    const res = await fetch(`${API_BASE_URL}/bookings.php?action=get_service_charges&provider_id=${providerId}`, {
      headers: authHeaders,
    });

    const json = await res.json().catch(() => null);
    if (res.ok && (json?.success || json?.status === 'success')) {
      const data = json.data || {};
      return {
        success: true,
        totalDue: Number(data.total_due) || 0,
        availableBalance: Number(data.available_balance) || 0,
        canAcceptBookings: Boolean(data.can_accept_bookings),
        charges: data.charges || [],
      };
    }
  } catch (e) {
    console.log('[Provider API] Error fetching service charges:', e);
  }
  return { success: false, totalDue: 0, availableBalance: 0, canAcceptBookings: true, charges: [] };
}

/**
 * Real-time SSE / push event stream poller for live provider booking alerts
 */
export async function pollProviderLiveEventsApi(
  providerId: number,
  lastEventId?: number
): Promise<{ success: boolean; events: LiveProviderEvent[]; lastEventId: number }> {
  if (!providerId) {
    return { success: false, events: [], lastEventId: lastEventId || 0 };
  }
  try {
    const user = await getStoredProviderUser();
    const query = new URLSearchParams({
      format: 'json',
      channel: 'provider',
      provider_id: String(providerId),
    });
    if (user?.access_token) {
      query.set('token', user.access_token);
    }
    if (lastEventId !== undefined && lastEventId !== null && lastEventId > 0) {
      query.set('last_event_id', String(lastEventId));
    }

    const authHeaders = await getAuthHeaders(providerId);
    const res = await fetch(`${API_BASE_URL}/sse-events.php?${query.toString()}`, {
      headers: authHeaders,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return {
          success: true,
          events: json.events || [],
          lastEventId: typeof json.last_event_id === 'number' ? json.last_event_id : (lastEventId || 0),
        };
      }
    }
  } catch (e) {
    // Background poller silent catch
  }
  return { success: false, events: [], lastEventId: lastEventId || 0 };
}

/**
 * Fetch provider services registered in serveasy-services
 * Strictly returns only services created by the specified providerId
 */
export async function fetchProviderServicesApi(providerId: number): Promise<ProviderServiceItem[]> {
  if (!providerId) return [];
  try {
    const authHeaders = await getAuthHeaders(providerId);
    const res = await fetch(`${API_BASE_URL}/services.php?provider_id=${providerId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        // Strict provider isolation: ONLY return services where provider_id matches this provider
        const filtered = json.data.filter((item: any) => Number(item.provider_id) === Number(providerId));
        return filtered.map((s: any): ProviderServiceItem => ({
          id: `#${s.id}`,
          numericId: Number(s.id),
          name: s.name,
          subcategory: s.subcategory_name || s.category_name || 'Vehicle Service',
          rate: `₹${Number(s.base_price).toFixed(2)}`,
          duration: `${s.duration_minutes || 60} mins`,
          price: Number(s.base_price) || 0,
          isActive: s.is_active == 1,
          approvalStatus: s.approval_status || 'approved',
        }));
      }
    }
  } catch (e) {
    console.log('[Provider API] Error fetching services:', e);
  }
  return [];
}

/**
 * Fetch provider live statistics directly from backend database
 */
export async function fetchProviderStatsApi(providerId: number): Promise<ProviderStats | null> {
  if (!providerId) return null;
  try {
    const authHeaders = await getAuthHeaders(providerId);
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php?action=get_stats&provider_id=${providerId}`, {
      method: 'GET',
      headers: authHeaders,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        return json.data as ProviderStats;
      }
    }
  } catch (e) {
    console.log('[Provider API] Error fetching provider stats:', e);
  }
  return null;
}

/**
 * Create a new service for the provider in serveasy-services
 */
export async function createProviderServiceApi(
  providerId: number,
  serviceData: {
    name: string;
    subcategory_id?: number;
    subcategory_name?: string;
    base_price: number;
    duration_minutes?: number;
  }
): Promise<{ success: boolean; message: string; service?: any }> {
  if (!providerId) return { success: false, message: 'Provider ID required' };
  try {
    const authHeaders = await getAuthHeaders(providerId);
    authHeaders['Content-Type'] = 'application/json';
    const res = await fetch(`${API_BASE_URL}/services.php`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        provider_id: providerId,
        subcategory_id: serviceData.subcategory_id || 1,
        name: serviceData.name,
        base_price: serviceData.base_price,
        duration_minutes: serviceData.duration_minutes || 60,
      }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) {
      return { success: true, message: json?.message || 'Service created successfully!', service: json?.data };
    }
    return { success: false, message: json?.message || 'Failed to create service' };
  } catch (e) {
    return { success: false, message: 'Network error creating service' };
  }
}

let cachedOtpConfig: OtpConfig | null = null;

/**
 * Fetch global OTP configuration managed by Super Admin
 */
export async function fetchOtpConfigApi(): Promise<OtpConfig | null> {
  if (!API_BASE_URL) return null;
  if (cachedOtpConfig) return cachedOtpConfig;
  try {
    const res = await fetch(`${API_BASE_URL}/platform-settings.php?action=get_otp_config`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      const data = json?.data || (json?.success ? json : null);
      if (data && (json?.status === 'success' || json?.success || data?.mode)) {
        cachedOtpConfig = (json.data || data) as OtpConfig;
        return cachedOtpConfig;
      }
    }
  } catch (e) {
    console.log('[Provider API] Error fetching OTP config:', e);
  }
  return null;
}

/**
 * Send OTP for Provider Login (dealer-auth-api.php)
 */
export async function sendProviderOtpApi(
  identity: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string; otp?: string; attempt?: number; max_attempts?: number }> {
  if (!API_BASE_URL) {
    return { success: false, message: 'Failed to connect with server' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `action=send_otp&identity=${encodeURIComponent(identity.trim())}`,
      signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        return {
          success: true,
          message: json.message || 'OTP sent successfully',
          otp: json.otp,
          attempt: json.attempt,
          max_attempts: json.max_attempts,
        };
      }
      return { success: false, message: json.message || 'Failed to send OTP' };
    }
    return { success: false, message: 'Failed to connect with server' };
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal?.aborted) {
      return { success: false, message: 'Request cancelled.' };
    }
    console.log('[Provider API] Send OTP error:', e);
    return { success: false, message: 'Failed to connect with server' };
  }
}

/**
 * Verify OTP for Provider Login (dealer-auth-api.php)
 */
export async function verifyProviderOtpApi(
  identity: string,
  otp: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string; user?: ProviderUser; access_token?: string }> {
  if (!API_BASE_URL) {
    return { success: false, message: 'Failed to connect with server' };
  }
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `action=verify_otp&identity=${encodeURIComponent(identity.trim())}&otp=${encodeURIComponent(otp.trim())}`,
      signal,
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        const fullUser: ProviderUser | undefined = json.user
          ? {
              ...json.user,
              access_token: json.access_token || undefined,
            }
          : undefined;
        return {
          success: true,
          message: json.message || 'Login successful',
          user: fullUser,
          access_token: json.access_token,
        };
      }
      return { success: false, message: json.message || 'Invalid verification code' };
    }
    return { success: false, message: 'Failed to connect with server' };
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal?.aborted) {
      return { success: false, message: 'Request cancelled.' };
    }
    console.log('[Provider API] Verify OTP error:', e);
    return { success: false, message: 'Failed to connect with server' };
  }
}

/**
 * Fetch Provider Account Profile strictly matching Service Provider index.php
 */
export async function fetchProviderProfileApi(providerId: number): Promise<ProviderProfileData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php?action=get_profile&provider_id=${providerId}`, {
      headers: {
        'Accept': 'application/json',
        'X-Provider-Id': String(providerId),
      },
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        return json.data as ProviderProfileData;
      }
    }
  } catch (e) {
    console.log('[Provider API] Error fetching provider profile:', e);
  }
  return null;
}

/**
 * Save Provider Profile details matching Service Provider portal
 */
export async function saveProviderProfileApi(
  providerId: number,
  data: {
    full_name: string;
    company_name?: string;
    email: string;
    phone: string;
    location_address?: string;
    landmark?: string;
    pincode?: string;
    service_range_km?: number;
    latitude?: string;
    longitude?: string;
  }
): Promise<{ success: boolean; message: string; progress?: ProfileProgress }> {
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Provider-Id': String(providerId),
      },
      body: JSON.stringify({
        action: 'save_profile',
        provider_id: providerId,
        ...data,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        return {
          success: true,
          message: json.message || 'Profile saved successfully!',
          progress: json.progress,
        };
      }
      return { success: false, message: json.message || 'Failed to save profile' };
    }
  } catch (e) {
    console.log('[Provider API] Error saving provider profile:', e);
  }
  return { success: false, message: 'Network error saving profile' };
}

/**
 * Save Provider Linked Bank Account details
 */
export async function saveProviderBankAccountApi(
  providerId: number,
  data: ProviderBankAccount
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Provider-Id': String(providerId),
      },
      body: JSON.stringify({
        action: 'save_bank_account',
        provider_id: providerId,
        ...data,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        return { success: true, message: json.message || 'Bank account details saved successfully!' };
      }
      return { success: false, message: json.message || 'Failed to save bank account' };
    }
  } catch (e) {
    console.log('[Provider API] Error saving bank account:', e);
  }
  return { success: false, message: 'Network error saving bank account' };
}

/**
 * Register Company for Provider
 */
export async function registerCompanyApi(
  providerId: number,
  companyName: string
): Promise<{ success: boolean; message: string; company_name?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Provider-Id': String(providerId),
      },
      body: JSON.stringify({
        action: 'register_company',
        provider_id: providerId,
        company_name: companyName.trim(),
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        return {
          success: true,
          message: json.message || 'Company registered successfully!',
          company_name: json.company_name,
        };
      }
      return { success: false, message: json.message || 'Failed to register company' };
    }
  } catch (e) {
    console.log('[Provider API] Error registering company:', e);
  }
  return { success: false, message: 'Network error registering company' };
}

/**
 * Add Branch Location for Provider
 */
export async function addBranchApi(
  providerId: number,
  branchData: {
    branch_name: string;
    phone?: string;
    address?: string;
    landmark?: string;
    pincode?: string;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/dealer-auth-api.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Provider-Id': String(providerId),
      },
      body: JSON.stringify({
        action: 'add_branch',
        provider_id: providerId,
        ...branchData,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success') {
        return { success: true, message: json.message || 'Branch added successfully!' };
      }
      return { success: false, message: json.message || 'Failed to add branch' };
    }
  } catch (e) {
    console.log('[Provider API] Error adding branch:', e);
  }
  return { success: false, message: 'Network error adding branch' };
}

// ─── AsyncStorage Helpers for Persistent Provider Login ──────────────────────
const STORAGE_KEY_PROVIDER = '@serveasy_provider_user';

export async function getStoredProviderUser(): Promise<ProviderUser | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PROVIDER);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('[Provider API] Error reading stored provider user:', e);
  }
  return null;
}

export async function storeProviderUser(user: ProviderUser): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_PROVIDER, JSON.stringify(user));
  } catch (e) {
    console.log('[Provider API] Error storing provider user:', e);
  }
}

export async function clearStoredProviderUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_PROVIDER);
  } catch (e) {
    console.log('[Provider API] Error clearing provider user:', e);
  }
}

// ─── Live GPS Location Streaming & Retrieval ─────────────────────────────────
export interface ProviderLiveLocationPayload {
  provider_id: number;
  booking_id?: number;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  status?: string;
}

export async function updateProviderLiveLocationApi(
  payload: ProviderLiveLocationPayload
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const res = await fetch(`${API_BASE_URL}/provider-location.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Provider-Id': String(payload.provider_id),
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' || json.success) {
        return { success: true, message: json.message || 'Location updated', data: json.data };
      }
      return { success: false, message: json.message || 'Failed to update location' };
    }
  } catch (e) {
    console.log('[Provider API] Error updating live location:', e);
  }
  return { success: false, message: 'Network error updating location' };
}

export async function fetchProviderLiveLocationApi(
  providerId?: number,
  bookingId?: number
): Promise<{ success: boolean; data?: any; message?: string }> {
  try {
    const params = new URLSearchParams();
    if (providerId) params.append('provider_id', String(providerId));
    if (bookingId) params.append('booking_id', String(bookingId));
    const res = await fetch(`${API_BASE_URL}/provider-location.php?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' || json.success) {
        return { success: true, data: json.data };
      }
      return { success: false, message: json.message || 'Failed to fetch location' };
    }
  } catch (e) {
    console.log('[Provider API] Error fetching live location:', e);
  }
  return { success: false, message: 'Network error fetching location' };
}


