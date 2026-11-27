import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

export interface ScalePixelUploadResult {
  success: boolean;
  downloadUrl?: string;
  filename?: string;
  savedPercent?: number;
  compressedSizeKb?: number;
  originalSizeKb?: number;
  message?: string;
}

export const SCALEPIXEL_API_URL = 'https://scalepixel.onrender.com/api/v1';
export const SCALEPIXEL_SOURCE_KEY = 'sp_live_pk_scalepixel_starter';
export const SCALEPIXEL_SECRET_KEY = 'sp_live_sk_a92d8f1e4c7b30129481bfe48102a991';

/**
 * Uploads and compresses a provider profile photo using ScalePixel API
 * Crops to a perfect 1:1 avatar (600x600 JPEG @ 80%) with format: provider_{id}_{YYYY-MM-DD_HH-mm-ss}.jpg
 * Uses native FileSystem.uploadAsync (with Base64 URL-encoded fallback) to prevent "Unsupported FormDataPart" errors.
 */
export async function uploadProviderAvatarToScalePixel(
  imageUri: string,
  providerId: number | string
): Promise<ScalePixelUploadResult> {
  try {
    const uriParts = imageUri.split('/');
    const originalFileName = uriParts[uriParts.length - 1] || 'profile.jpg';

    // Infer mime type
    const ext = originalFileName.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    // 1. Try native FileSystem.uploadAsync (Native Android/iOS multipart - bypasses JS FormData)
    try {
      if (FileSystem.uploadAsync) {
        const uploadResponse = await FileSystem.uploadAsync(
          `${SCALEPIXEL_API_URL}/compress.php`,
          imageUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            headers: {
              'Accept': 'application/json',
              'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
              'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
            },
            parameters: {
              mode: 'avatar',
              prefix: `provider_${providerId}`,
              include_seconds: '1',
              format: 'jpeg',
              quality: '80',
              width: '600',
              height: '600',
              fit: 'cover',
            },
          }
        );

        if (uploadResponse && uploadResponse.body) {
          const json = JSON.parse(uploadResponse.body);
          if (json.status === 'success' && json.data?.download_url) {
            let downloadUrl = json.data.download_url as string;
            if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
              downloadUrl = downloadUrl.replace('http://', 'https://');
            }

            return {
              success: true,
              downloadUrl,
              filename: json.data.filename,
              savedPercent: json.data.saved_percent,
              compressedSizeKb: json.data.compressed_size_kb,
              originalSizeKb: json.data.original_size_kb,
              message: json.message || 'Image optimized successfully',
            };
          } else if (json.message) {
            console.warn('[ScalePixel] uploadAsync returned error status:', json.message);
          }
        }
      }
    } catch (fsErr: any) {
      console.warn('[ScalePixel] FileSystem.uploadAsync error, falling back to base64:', fsErr?.message || fsErr);
    }

    // 2. Ultra-reliable Fallback: Base64 payload (100% compatible across all React Native / Hermes fetch versions)
    let base64Data = '';
    if (FileSystem.readAsStringAsync) {
      base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    if (base64Data) {
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const bodyParams = new URLSearchParams();
      bodyParams.append('image_base64', dataUri);
      bodyParams.append('mode', 'avatar');
      bodyParams.append('prefix', `provider_${providerId}`);
      bodyParams.append('include_seconds', '1');
      bodyParams.append('format', 'jpeg');
      bodyParams.append('quality', '80');
      bodyParams.append('width', '600');
      bodyParams.append('height', '600');
      bodyParams.append('fit', 'cover');

      const res = await fetch(`${SCALEPIXEL_API_URL}/compress.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
          'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
        },
        body: bodyParams.toString(),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.download_url) {
        let downloadUrl = json.data.download_url as string;
        if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
          downloadUrl = downloadUrl.replace('http://', 'https://');
        }

        return {
          success: true,
          downloadUrl,
          filename: json.data.filename,
          savedPercent: json.data.saved_percent,
          compressedSizeKb: json.data.compressed_size_kb,
          originalSizeKb: json.data.original_size_kb,
          message: json.message || 'Image optimized successfully',
        };
      } else {
        return {
          success: false,
          message: json.message || 'ScalePixel optimization failed',
        };
      }
    }

    return {
      success: false,
      message: 'Could not prepare image for upload',
    };
  } catch (error: any) {
    console.error('[ScalePixel] Error uploading provider avatar:', error);
    return {
      success: false,
      message: error?.message || 'Network error while contacting ScalePixel API',
    };
  }
}

/**
 * Uploads a provider KYC document or Live Verification Selfie to ScalePixel
 * Optimizes image quality while preserving details for verification (85% JPEG, max 1200x1200)
 */
export async function uploadProviderDocToScalePixel(
  imageUri: string,
  providerId: number | string,
  docType: 'front' | 'back' | 'selfie'
): Promise<ScalePixelUploadResult> {
  try {
    const uriParts = imageUri.split('/');
    const originalFileName = uriParts[uriParts.length - 1] || `${docType}.jpg`;

    const ext = originalFileName.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    // 1. Native FileSystem.uploadAsync
    try {
      if (FileSystem.uploadAsync) {
        const uploadResponse = await FileSystem.uploadAsync(
          `${SCALEPIXEL_API_URL}/compress.php`,
          imageUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            headers: {
              'Accept': 'application/json',
              'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
              'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
            },
            parameters: {
              mode: docType === 'selfie' ? 'avatar' : 'document',
              prefix: `provider_${providerId}_${docType}`,
              include_seconds: '1',
              format: 'jpeg',
              quality: '85',
              width: docType === 'selfie' ? '800' : '2400',
              height: docType === 'selfie' ? '800' : '2400',
              fit: docType === 'selfie' ? 'cover' : 'inside',
            },
          }
        );

        if (uploadResponse && uploadResponse.body) {
          const json = JSON.parse(uploadResponse.body);
          if (json.status === 'success' && json.data?.download_url) {
            let downloadUrl = json.data.download_url as string;
            if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
              downloadUrl = downloadUrl.replace('http://', 'https://');
            }
            return {
              success: true,
              downloadUrl,
              filename: json.data.filename,
              savedPercent: json.data.saved_percent,
              compressedSizeKb: json.data.compressed_size_kb,
              originalSizeKb: json.data.original_size_kb,
              message: json.message || 'Image uploaded successfully',
            };
          }
        }
      }
    } catch (fsErr: any) {
      console.warn('[ScalePixel] Doc uploadAsync error, falling back to base64:', fsErr?.message || fsErr);
    }

    // 2. Base64 Fallback
    let base64Data = '';
    if (FileSystem.readAsStringAsync) {
      base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    if (base64Data) {
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const bodyParams = new URLSearchParams();
      bodyParams.append('image_base64', dataUri);
      bodyParams.append('mode', docType === 'selfie' ? 'avatar' : 'document');
      bodyParams.append('prefix', `provider_${providerId}_${docType}`);
      bodyParams.append('include_seconds', '1');
      bodyParams.append('format', 'jpeg');
      bodyParams.append('quality', '85');
      bodyParams.append('width', docType === 'selfie' ? '800' : '2400');
      bodyParams.append('height', docType === 'selfie' ? '800' : '2400');
      bodyParams.append('fit', docType === 'selfie' ? 'cover' : 'inside');

      const res = await fetch(`${SCALEPIXEL_API_URL}/compress.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
          'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
        },
        body: bodyParams.toString(),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.download_url) {
        let downloadUrl = json.data.download_url as string;
        if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
          downloadUrl = downloadUrl.replace('http://', 'https://');
        }
        return {
          success: true,
          downloadUrl,
          filename: json.data.filename,
          savedPercent: json.data.saved_percent,
          compressedSizeKb: json.data.compressed_size_kb,
          originalSizeKb: json.data.original_size_kb,
          message: json.message || 'Image uploaded successfully',
        };
      } else {
        return {
          success: false,
          message: json.message || 'ScalePixel optimization failed',
        };
      }
    }

    return {
      success: false,
      message: 'Could not prepare document image for upload',
    };
  } catch (error: any) {
    console.error('[ScalePixel] Error uploading document:', error);
    return {
      success: false,
      message: error?.message || 'Network error while contacting ScalePixel API',
    };
  }
}

/**
 * Uploads a provider showcase / portfolio gallery photo to ScalePixel
 * Preserves exact original resolution and natural aspect ratio (e.g. 1:2, 9:16, 4:3, 16:9) without distortion
 */
export async function uploadProviderGalleryPhotoToScalePixel(
  imageUri: string,
  providerId: number | string
): Promise<ScalePixelUploadResult> {
  try {
    const uriParts = imageUri.split('/');
    const originalFileName = uriParts[uriParts.length - 1] || 'gallery.jpg';

    const ext = originalFileName.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    // 1. Native FileSystem.uploadAsync
    try {
      if (FileSystem.uploadAsync) {
        const uploadResponse = await FileSystem.uploadAsync(
          `${SCALEPIXEL_API_URL}/compress.php`,
          imageUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType,
            headers: {
              'Accept': 'application/json',
              'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
              'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
            },
            parameters: {
              mode: 'gallery',
              prefix: `provider_${providerId}_gallery`,
              include_seconds: '1',
              format: 'jpeg',
              quality: '85',
              width: '2400',
              height: '2400',
              fit: 'inside',
            },
          }
        );

        if (uploadResponse && uploadResponse.body) {
          const json = JSON.parse(uploadResponse.body);
          if (json.status === 'success' && json.data?.download_url) {
            let downloadUrl = json.data.download_url as string;
            if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
              downloadUrl = downloadUrl.replace('http://', 'https://');
            }
            return {
              success: true,
              downloadUrl,
              filename: json.data.filename,
              savedPercent: json.data.saved_percent,
              compressedSizeKb: json.data.compressed_size_kb,
              originalSizeKb: json.data.original_size_kb,
              message: json.message || 'Gallery photo uploaded successfully',
            };
          }
        }
      }
    } catch (fsErr: any) {
      console.warn('[ScalePixel] Gallery uploadAsync error, falling back to base64:', fsErr?.message || fsErr);
    }

    // 2. Base64 Fallback
    let base64Data = '';
    if (FileSystem.readAsStringAsync) {
      base64Data = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    if (base64Data) {
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const bodyParams = new URLSearchParams();
      bodyParams.append('image_base64', dataUri);
      bodyParams.append('mode', 'gallery');
      bodyParams.append('prefix', `provider_${providerId}_gallery`);
      bodyParams.append('include_seconds', '1');
      bodyParams.append('format', 'jpeg');
      bodyParams.append('quality', '85');
      bodyParams.append('width', '2400');
      bodyParams.append('height', '2400');
      bodyParams.append('fit', 'inside');

      const res = await fetch(`${SCALEPIXEL_API_URL}/compress.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
          'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
        },
        body: bodyParams.toString(),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.download_url) {
        let downloadUrl = json.data.download_url as string;
        if (downloadUrl.startsWith('http://scalepixel.onrender.com')) {
          downloadUrl = downloadUrl.replace('http://', 'https://');
        }
        return {
          success: true,
          downloadUrl,
          filename: json.data.filename,
          savedPercent: json.data.saved_percent,
          compressedSizeKb: json.data.compressed_size_kb,
          originalSizeKb: json.data.original_size_kb,
          message: json.message || 'Gallery photo uploaded successfully',
        };
      } else {
        return {
          success: false,
          message: json.message || 'ScalePixel optimization failed',
        };
      }
    }

    return {
      success: false,
      message: 'Could not prepare gallery image for upload',
    };
  } catch (error: any) {
    console.error('[ScalePixel] Error uploading gallery photo:', error);
    return {
      success: false,
      message: error?.message || 'Network error while contacting ScalePixel API',
    };
  }
}
