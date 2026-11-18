import unittest
import os
import hashlib
import tempfile

class TestValidatorMicroservice(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_stage0_safety_magic_bytes(self):
        """Verifies Stage 0 strictly blocks non-allowed file signatures."""
        from stages.safety import check_file_safety

        # 1. Executable ELF magic bytes
        elf_path = os.path.join(self.test_dir, "malicious.bin")
        with open(elf_path, "wb") as f:
            f.write(b"\x7fELF\x02\x01\x01\x00" + b"\x00" * 100)

        res = check_file_safety(elf_path)
        self.assertFalse(res["passed"])
        self.assertEqual(res["reason_code"], "UNSUPPORTED_OR_CORRUPT_FORMAT")

        # 2. Oversized file check (> 40MB limit)
        oversized_path = os.path.join(self.test_dir, "huge.pdf")
        with open(oversized_path, "wb") as f:
            f.seek(41 * 1024 * 1024)
            f.write(b"\x00")

        res_oversized = check_file_safety(oversized_path)
        self.assertFalse(res_oversized["passed"])
        self.assertEqual(res_oversized["reason_code"], "FILE_TOO_LARGE")

    def test_stage0_valid_pdf_magic(self):
        """Valid PDF magic header passes Stage 0."""
        from stages.safety import check_file_safety

        pdf_path = os.path.join(self.test_dir, "sample.pdf")
        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")

        res = check_file_safety(pdf_path)
        self.assertTrue(res["passed"])
        self.assertEqual(res["mimetype"], "application/pdf")

    def test_stage0_dangerous_javascript_pdf(self):
        """Active JS embedded in PDF is rejected by Stage 0."""
        from stages.safety import check_file_safety

        pdf_path = os.path.join(self.test_dir, "exploit.pdf")
        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.4\n1 0 obj\n<</S /JavaScript /JS (app.alert('pwned'))>>\nendobj\n%%EOF")

        res = check_file_safety(pdf_path)
        self.assertFalse(res["passed"])
        self.assertEqual(res["reason_code"], "MALICIOUS_PDF_SCRIPTS")

    def test_model_manifest_checksums(self):
        """Validates model manifest checksum rules."""
        from models.manifest import PINNED_MODELS, verify_model_integrity
        self.assertIn("mobilenetv3_doc_classifier", PINNED_MODELS)
        self.assertIn("sha256", PINNED_MODELS["mobilenetv3_doc_classifier"])
        # Non-existent file should report False
        self.assertFalse(verify_model_integrity("/non/existent/path.onnx", "dummyhash"))

if __name__ == "__main__":
    unittest.main()
