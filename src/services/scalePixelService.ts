import { Platform } from 'react-native';

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
 */
export async function uploadProviderAvatarToScalePixel(
  imageUri: string,
  providerId: number | string
): Promise<ScalePixelUploadResult> {
  try {
    const formData = new FormData();
    const uriParts = imageUri.split('/');
    const originalFileName = uriParts[uriParts.length - 1] || 'profile.jpg';

    // Infer mime type
    const ext = originalFileName.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    formData.append('file', {
      uri: Platform.OS === 'ios' ? imageUri.replace('file://', '') : imageUri,
      name: originalFileName,
      type: mimeType,
    } as any);

    formData.append('mode', 'avatar');
    formData.append('prefix', `provider_${providerId}`);
    formData.append('include_seconds', '1');
    formData.append('format', 'jpeg');
    formData.append('quality', '80');
    formData.append('width', '600');
    formData.append('height', '600');
    formData.append('fit', 'cover');

    const res = await fetch(`${SCALEPIXEL_API_URL}/compress.php`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-ScalePixel-Key': SCALEPIXEL_SOURCE_KEY,
        'X-ScalePixel-Secret': SCALEPIXEL_SECRET_KEY,
      },
      body: formData,
    });

    const json = await res.json();
    if (json.status === 'success' && json.data?.download_url) {
      let downloadUrl = json.data.download_url as string;
      // Guarantee HTTPS for mobile clients
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
  } catch (error: any) {
    console.error('[ScalePixel] Error uploading provider avatar:', error);
    return {
      success: false,
      message: error?.message || 'Network error while contacting ScalePixel API',
    };
  }
}
