import sys
import unittest

# Ensure extraction_service is on sys.path
from pathlib import Path
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from tests.test_extraction_service import (
    test_health_endpoint,
    test_verhoeff_and_privacy_gate,
    test_universal_date_normalizer,
    test_digital_pdf_extraction,
    test_mixed_pdf_extraction,
    test_api_extract_endpoint,
    test_standalone_image_extraction
)

class TestExtractionSuite(unittest.TestCase):
    def test_01_health_endpoint(self):
        test_health_endpoint()

    def test_02_verhoeff_and_privacy_gate(self):
        test_verhoeff_and_privacy_gate()

    def test_03_universal_date_normalizer(self):
        test_universal_date_normalizer()

    def test_04_digital_pdf_extraction(self):
        test_digital_pdf_extraction()

    def test_05_mixed_pdf_extraction(self):
        test_mixed_pdf_extraction()

    def test_06_api_extract_endpoint(self):
        test_api_extract_endpoint()

    def test_07_standalone_image_extraction(self):
        test_standalone_image_extraction()

if __name__ == "__main__":
    unittest.main()
