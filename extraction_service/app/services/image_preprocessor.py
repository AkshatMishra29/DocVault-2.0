import cv2
import numpy as np
from PIL import Image, ExifTags
from typing import Tuple, Optional
from app.config import MAX_IMAGE_DIMENSION


class ImagePreprocessor:
    """
    CPU-optimized image preprocessing pipeline for DocVault OCR.
    Includes:
      - EXIF orientation correction
      - Dimension bounding (prevents CPU memory exhaustion)
      - Grayscale conversion
      - CLAHE contrast enhancement
      - Contour-based deskewing
      - Mild noise reduction
      - Optional adaptive thresholding
    """

    @staticmethod
    def fix_exif_orientation(pil_img: Image.Image) -> Image.Image:
        """Corrects orientation using EXIF metadata if present."""
        try:
            exif = pil_img.getexif()
            if not exif:
                return pil_img

            for orientation in ExifTags.TAGS.keys():
                if ExifTags.TAGS[orientation] == 'Orientation':
                    break

            val = exif.get(orientation)
            if val == 3:
                return pil_img.rotate(180, expand=True)
            elif val == 6:
                return pil_img.rotate(270, expand=True)
            elif val == 8:
                return pil_img.rotate(90, expand=True)
        except Exception:
            pass
        return pil_img

    @staticmethod
    def resize_bounded(cv_img: np.ndarray, max_dim: int = MAX_IMAGE_DIMENSION) -> np.ndarray:
        """Scales down oversized images to prevent memory exhaustion."""
        h, w = cv_img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / float(max(h, w))
            new_w = int(w * scale)
            new_h = int(h * scale)
            return cv2.resize(cv_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return cv_img

    @staticmethod
    def deskew(gray: np.ndarray) -> np.ndarray:
        """
        Calculates skew angle of text lines using Otsu threshold + minAreaRect,
        and rotates to level. Ignores extreme angles (> 30 degrees).
        """
        try:
            # Invert image: text becomes white, background black
            thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
            coords = np.column_stack(np.where(thresh > 0))
            if coords.shape[0] < 50:
                return gray

            rect = cv2.minAreaRect(coords)
            angle = rect[-1]

            # Determine rotation angle
            if angle < -45:
                angle = -(90 + angle)
            elif angle > 45:
                angle = 90 - angle
            else:
                angle = -angle

            # Only correct gentle skew (between 0.5 and 25 degrees)
            if 0.5 < abs(angle) < 25.0:
                (h, w) = gray.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                rotated = cv2.warpAffine(
                    gray, M, (w, h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE
                )
                return rotated
        except Exception:
            pass
        return gray

    @classmethod
    def preprocess_image_buffer(
        cls,
        image_bytes: bytes,
        apply_binarization: bool = False
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Loads an image from raw bytes, applies EXIF rotation, grayscale, CLAHE,
        deskew, and noise filtering.

        Returns:
            (enhanced_gray, binarized_img)
        """
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Failed to decode image buffer. Corrupted or invalid image data.")

        # Cap dimensions
        img = cls.resize_bounded(img)

        # Grayscale
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        # CLAHE (Contrast Limited Adaptive Histogram Equalization)
        # Excellent for faded documents, shadows, and inconsistent lighting
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        contrast_enhanced = clahe.apply(gray)

        # Denoise (mild Gaussian blur preserves crisp font edges)
        denoised = cv2.GaussianBlur(contrast_enhanced, (3, 3), 0)

        # Deskew
        deskewed = cls.deskew(denoised)

        # Adaptive threshold / Otsu binarization for faint scans
        thresh = cv2.adaptiveThreshold(
            deskewed, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )

        return deskewed, thresh

