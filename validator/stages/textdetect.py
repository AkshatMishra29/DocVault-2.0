"""
Stage 2: Text Detection, Readability & Tiny-Text Assessment.
Evaluates horizontal gradient band density, text line regularity, and character heights.
Distinguishes unreadably small document text from incidental non-document text.
"""
from typing import Dict, Any, List
import numpy as np
from PIL import Image

def detect_text_and_readability(img_resized: Image.Image, heuristics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates text structure, line consistency, and character readability on CPU.
    """
    gray = np.array(img_resized.convert("L"), dtype=np.uint8)
    h, w = gray.shape

    # 1. Horizontal gradient energy (Text lines produce strong horizontal edge frequency)
    sobel_h = np.abs(gray[:, 1:].astype(np.int16) - gray[:, :-1].astype(np.int16))
    sobel_v = np.abs(gray[1:, :].astype(np.int16) - gray[:-1, :].astype(np.int16))

    horizontal_edges = np.count_nonzero(sobel_h > 25)
    vertical_edges = np.count_nonzero(sobel_v > 25)
    total_pixels = h * w

    edge_density = (horizontal_edges + vertical_edges) / (total_pixels * 2)

    # 2. Row-wise projection profile for line detection
    # Text documents exhibit regular oscillating row variances
    row_means = np.mean(gray, axis=1)
    row_diffs = np.abs(np.diff(row_means))
    line_crossings = np.count_nonzero(row_diffs > 4.0)

    # Estimate line height and count
    estimated_lines = max(int(line_crossings // 2), 0)
    median_line_height = (h / max(estimated_lines, 1)) if estimated_lines > 0 else 0

    relative_line_height = median_line_height / (heuristics.get("orig_height") or h)

    # 3. Readability & Tiny Text Decision Rules
    # Case A: Document detected but text line height is microscopic (< 8px or < 0.6% of image height)
    is_tiny_text = (
        estimated_lines > 0
        and (median_line_height < 6 or relative_line_height < 0.005)
        and heuristics.get("paper_ratio", 0) > 0.20
    )

    # Case B: Unreadably blurry
    is_unreadably_blurry = heuristics.get("is_severe_blur", False) or heuristics.get("is_blurry", False)

    # Readability flag
    has_sufficient_text = estimated_lines >= 2 and edge_density > 0.02 and heuristics.get("text_ratio", 0) > 0.015

    return {
        "edge_density": round(float(edge_density), 4),
        "estimated_lines": estimated_lines,
        "median_line_height": round(float(median_line_height), 1),
        "relative_line_height": round(float(relative_line_height), 4),
        "has_sufficient_text": has_sufficient_text,
        "is_tiny_text": is_tiny_text,
        "is_unreadably_blurry": is_unreadably_blurry,
    }
