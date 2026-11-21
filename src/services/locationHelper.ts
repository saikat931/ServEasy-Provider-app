/**
 * ServEasy Mobile - Doorstep Location & Reverse Geocoding Helper
 * Powered by Expo Location Hardware GPS + ArcGIS World Geocoder & Nominatim Doorstep Enrichment.
 * 100% Free, Zero API Keys, Zero Rate-Limit, Supported on all phones and laptops.
 */

import * as Location from 'expo-location';

export interface DoorstepAddressResult {
  address: string;
  landmark: string;
  pincode: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

export function formatFusionAddress(bdc: any, nom: any, lat: number, lng: number, arc?: any): DoorstepAddressResult {
  const a = nom?.address || {};
  const arcAddr = arc?.address || arc || {};

  // 1. Specific spot / building / apartment / POI
  let spot = arcAddr?.PlaceName || '';
  if (!spot && (arcAddr?.Addr_type === 'POI' || arcAddr?.Addr_type === 'PointAddress')) {
    spot = arcAddr?.ShortLabel || arcAddr?.Address || '';
  }
  if (!spot) {
    spot = a.building || a.house_name || a.amenity || a.shop || a.office || a.historic || a.leisure || a.tourism || '';
  }
  const houseNo = a.house_number || arcAddr?.AddNum || '';

  // 2. Road / Street
  let road = a.road || a.pedestrian || a.street || a.residential || '';
  if (!road && arcAddr?.Address && arcAddr.Address !== spot) {
    road = arcAddr.Address;
  }
  if (road === spot) road = '';

  // 3. Lane / Gali / Sector / Colony / Block (from ArcGIS Sector or Neighborhood or Block)
  const sector = arcAddr?.Sector || arcAddr?.Neighborhood || arcAddr?.Block || '';
  let laneGali = sector;
  if (laneGali === road || laneGali === spot) laneGali = '';

  // 4. Suburb / Local Area (from Nominatim or BigDataCloud locality or ArcGIS District)
  let suburb = a.suburb || a.neighbourhood || a.subdistrict || a.village || a.hamlet || bdc?.locality || arcAddr?.District || '';
  if (suburb === laneGali || suburb === road || suburb === spot) suburb = '';

  // 5. City / Town
  let city = bdc?.city || a.city || a.town || a.municipality || 'Kolkata';
  if (city.toLowerCase().indexOf('greater kolkata') !== -1) {
    city = 'Kolkata';
  }
  if (city === suburb || city === laneGali) city = '';

  // 6. State
  const state = bdc?.principalSubdivision || a.state || arcAddr?.Region || 'West Bengal';

  // 7. Pincode
  let pincode = a.postcode || arcAddr?.Postal || bdc?.postcode || '';
  if (!pincode && nom?.display_name) {
    const m = String(nom.display_name).match(/\b([1-9][0-9]{5})\b/);
    if (m) pincode = m[1];
  }

  // Assemble comprehensive clean doorstep parts (building, houseNo, road, lane/gali, suburb, city, state)
  const rawParts = [spot, houseNo, road, laneGali, suburb, city, state].filter(function (v) {
    return v && String(v).trim().length > 0;
  });

  const uniqueParts: string[] = [];
  rawParts.forEach((p) => {
    const s = String(p).trim();
    if (s && !uniqueParts.some((u) => u.toLowerCase() === s.toLowerCase())) {
      uniqueParts.push(s);
    }
  });

  let address = uniqueParts.join(', ');

  // Clean up broad administrative noise anywhere in the string
  address = address
    .replace(/,\s*(Greater\s*Kolkata|Barrackpur\s*[-–]\s*II|Barrackpore\s*[-–]?\s*[I|1|2|II]+|North\s*24\s*Parganas|South\s*24\s*Parganas|India)\b/gi, '')
    .replace(/\b(Greater\s*Kolkata|Barrackpur\s*[-–]\s*II|Barrackpore\s*[-–]?\s*[I|1|2|II]+|North\s*24\s*Parganas|South\s*24\s*Parganas|India),\s*/gi, '')
    .replace(/,\s*India$/gi, '')
    .replace(/\s*,\s*,+/g, ', ')
    .trim()
    .replace(/^,+|,+$/g, '')
    .trim();

  // Landmark: recognizable local doorstep reference
  let landmark = '';
  if (spot && laneGali && spot !== laneGali) {
    landmark = `Near ${spot}, ${laneGali}`;
  } else if (spot && road && spot !== road) {
    landmark = `Near ${spot}, ${road}`;
  } else if (spot) {
    landmark = `Near ${spot}`;
  } else if (laneGali) {
    landmark = `Near ${laneGali}`;
  } else if (road && suburb && road !== suburb) {
    landmark = `Near ${road}, ${suburb}`;
  } else if (road) {
    landmark = `Near ${road}`;
  } else if (suburb) {
    landmark = `Near ${suburb}`;
  }

  return {
    address: address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    landmark: landmark || '',
    pincode: pincode || '',
    city: city || 'Kolkata',
    state: state || 'West Bengal',
    latitude: lat,
    longitude: lng,
    displayName: address,
  };
}

export function getGoogleMapTileUrl(
  lat: number,
  lng: number,
  zoom: number = 16,
  layer: 'roadmap' | 'satellite' | 'terrain' = 'roadmap'
): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const lyrs = layer === 'satellite' ? 'y' : layer === 'terrain' ? 'p' : 'm';
  return `https://mt1.google.com/vt/lyrs=${lyrs}&x=${x}&y=${y}&z=${zoom}`;
}

export async function reverseGeocodeCoords(lat: number, lng: number): Promise<DoorstepAddressResult> {
  let bdcData: any = null;
  let nomData: any = null;
  let arcData: any = null;

  // Run all 3 reverse geocoders in parallel for maximum doorstep precision (building, gali, lane, road, pincode)
  await Promise.allSettled([
    // 1. ArcGIS World Geocoder (Best for exact apartment, building, lane, sector, gali, and PIN)
    (async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(
          `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&f=pjson`,
          { signal: ctrl.signal }
        );
        clearTimeout(tid);
        if (res.ok) {
          const d = await res.json();
          arcData = d?.address || null;
        }
      } catch (e) {}
    })(),

    // 2. OSM Nominatim (Best for suburb, road, highway, municipality)
    (async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
          {
            headers: {
              'Accept': 'application/json',
              'Accept-Language': 'en',
              'User-Agent': 'ServEasyMobile/1.0',
            },
            signal: ctrl.signal,
          }
        );
        clearTimeout(tid);
        if (res.ok) {
          nomData = await res.json();
        }
      } catch (e) {}
    })(),

    // 3. BigDataCloud (Fast, zero rate-limit, official locality/city/state verification)
    (async () => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4500);
        const res = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
          { signal: ctrl.signal }
        );
        clearTimeout(tid);
        if (res.ok) {
          bdcData = await res.json();
        }
      } catch (e) {}
    })(),
  ]);

  return formatFusionAddress(bdcData, nomData, lat, lng, arcData);
}

/**
 * Acquire device location universally across all devices and platforms.
 * 1. Primary: True Native Hardware GPS via Expo Location (Same exact GPS Google Maps uses).
 * 2. Secondary: Web browser navigator.geolocation (when running in web/browser mode).
 * 3. Fallback: BigDataCloud Client Geolocation (if GPS is completely denied).
 * 4. Enriches detected coordinates with ArcGIS World Geocoder + Nominatim for exact doorstep building, lane, and road.
 */
export async function acquireDeviceLocation(): Promise<DoorstepAddressResult> {
  // 1. Primary: Native Device Hardware GPS (Exact same high-accuracy GPS chips Google Maps uses)
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (pos && pos.coords) {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        return await reverseGeocodeCoords(lat, lng);
      }
    }
  } catch (e) {
    // Expo Location not available in browser or permission denied; proceed to fallbacks
  }

  // 2. Secondary: Web browser navigator.geolocation
  const navGeo = (globalThis as any)?.navigator?.geolocation;
  if (navGeo && typeof navGeo.getCurrentPosition === 'function') {
    try {
      const pos: any = await new Promise((resolve, reject) => {
        navGeo.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 10000,
        });
      });
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      return await reverseGeocodeCoords(lat, lng);
    } catch (e) {
      // Browser GPS unavailable/denied; smoothly proceed to network fallback
    }
  }

  // 3. Fallback: BigDataCloud Client Geolocation (estimates network ISP coordinates if GPS is completely denied)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const bdcRes = await fetch(
      'https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (bdcRes.ok) {
      const bdc = await bdcRes.json();
      const lat = Number((bdc.latitude || 22.6280).toFixed(6));
      const lng = Number((bdc.longitude || 88.4440).toFixed(6));
      return await reverseGeocodeCoords(lat, lng);
    }
  } catch (err) {
    // Network failure
  }

  return {
    address: 'Kolkata, West Bengal',
    landmark: '',
    pincode: '700001',
    city: 'Kolkata',
    state: 'West Bengal',
    latitude: 22.57264,
    longitude: 88.36389,
    displayName: 'Kolkata, West Bengal',
  };
}
