"""
Stage 1: Preprocessing, Blur/Sharpness, Color Heuristics & Scenery Detection.
Downscales images to 640px for low-latency CPU analysis.
Evaluates paper saturation vs. natural vibrant colors to reject landscapes immediately.
"""
from typing import Dict, Any, Tuple
from PIL import Image, ImageStat
import numpy as np
import io

TARGET_ANALYSIS_DIM = 640

def analyze_image_heuristics(img: Image.Image) -> Dict[str, Any]:
    """
    Performs fast heuristic and visual analysis on a PIL Image.
    Downscales to ~640px for optimal speed and memory efficiency.
    """
    orig_w, orig_h = img.size

    # Dimension bounds
    if orig_w < 120 or orig_h < 120:
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "RESOLUTION_TOO_LOW",
            "reason": f"Image resolution ({orig_w}x{orig_h}) is too low to be a readable document. Minimum size is 120x120 pixels.",
        }

    if (orig_w * orig_h) > 40_000_000:
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "IMAGE_TOO_LARGE",
            "reason": "Image dimensions exceed safe processing thresholds (max 40 megapixels).",
        }

    # Downscale for analysis (proportional resize to max 640px)
    scale = min(TARGET_ANALYSIS_DIM / max(orig_w, orig_h), 1.0)
    proc_w = max(int(orig_w * scale), 1)
    proc_h = max(int(orig_h * scale), 1)

    img_rgb = img.convert("RGB")
    img_resized = img_rgb.resize((proc_w, proc_h), Image.Resampling.BILINEAR)
    img_np = np.array(img_resized, dtype=np.uint8)

    # 1. Color distribution analysis (Vectorized NumPy)
    r = img_np[:, :, 0].astype(np.int16)
    g = img_np[:, :, 1].astype(np.int16)
    b = img_np[:, :, 2].astype(np.int16)

    max_val = np.maximum(np.maximum(r, g), b)
    min_val = np.minimum(np.minimum(r, g), b)
    diff = max_val - min_val

    total_pixels = proc_w * proc_h

    # Paper-like pixels: low saturation, bright neutral
    paper_mask = (diff < 50) & (min_val > 90)
    paper_pixels = np.count_nonzero(paper_mask)
    paper_ratio = paper_pixels / total_pixels

    # Text-like dark pixels
    text_mask = (diff < 40) & (max_val < 90)
    text_pixels = np.count_nonzero(text_mask)
    text_ratio = text_pixels / total_pixels

    # Vibrant color pixels: outdoor sky, grass, scenery, colorful clothing
    vibrant_mask = diff > 50
    vibrant_pixels = np.count_nonzero(vibrant_mask)
    vibrant_ratio = vibrant_pixels / total_pixels

    # Skin tone pixels: human face / portrait detection
    skin_mask = (r > 95) & (g > 40) & (b > 20) & (diff > 15) & (r > g) & (r > b)
    skin_pixels = np.count_nonzero(skin_mask)
    skin_ratio = skin_pixels / total_pixels

    # 2. Blank / Solid Color detection
    stat = ImageStat.Stat(img_rgb)
    is_solid = all(std < 2.0 for std in stat.stddev) and (max(stat.mean) - min(stat.mean) < 8.0)
    luminance = stat.mean[0] * 0.299 + stat.mean[1] * 0.587 + stat.mean[2] * 0.114

    if is_solid or (luminance > 248 and paper_ratio > 0.98 and text_ratio < 0.005):
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "BLANK_IMAGE",
            "reason": "This image appears blank or contains a solid background with no readable content.",
        }

    # 3. Fast Sharpness & Edge Variance (Discrete Laplacian approximation)
    gray = (0.299 * r + 0.587 * g + 0.114 * b).astype(np.float32)
    # 3x3 Laplacian kernel convolution via slice indexing
    lap = (
        -4 * gray[1:-1, 1:-1]
        + gray[:-2, 1:-1]
        + gray[2:, 1:-1]
        + gray[1:-1, :-2]
        + gray[1:-1, 2:]
    )
    sharpness = float(np.std(lap)) if lap.size > 0 else 0.0
    contrast = float(np.max(gray) - np.min(gray))

    is_blurry = sharpness < 3.5

    # 4. Critical Scenery & Casual Landscape Detection
    is_natural_scenery = (vibrant_ratio > 0.55 and paper_ratio < 0.35) or (vibrant_ratio > 0.30 and paper_ratio < 0.30)
    is_casual_portrait = (skin_ratio > 0.15 and paper_ratio < 0.70)

    return {
        "passed": True,
        "orig_width": orig_w,
        "orig_height": orig_h,
        "aspect_ratio": round(orig_w / orig_h, 2),
        "paper_ratio": round(paper_ratio, 3),
        "text_ratio": round(text_ratio, 3),
        "vibrant_ratio": round(vibrant_ratio, 3),
        "skin_ratio": round(skin_ratio, 3),
        "sharpness": round(sharpness, 2),
        "contrast": round(contrast, 2),
        "luminance": round(luminance, 1),
        "is_blurry": is_blurry,
        "is_natural_scenery": is_natural_scenery,
        "is_casual_portrait": is_casual_portrait,
        "processed_image": img_resized,
    }
