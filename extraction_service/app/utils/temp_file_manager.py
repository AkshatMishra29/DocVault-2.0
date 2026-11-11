import os
import tempfile
from contextlib import contextmanager
from typing import Generator


@contextmanager
def temporary_file(suffix: str = "", prefix: str = "docvault_") -> Generator[str, None, None]:
    """
    Context manager that creates a secure temporary file and guarantees its deletion
    upon block completion, even if an exception occurs.
    """
    temp_fd, temp_path = tempfile.mkstemp(suffix=suffix, prefix=prefix)
    os.close(temp_fd)
    try:
        yield temp_path
    finally:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


@contextmanager
def temporary_buffer_file(buffer: bytes, suffix: str = "") -> Generator[str, None, None]:
    """
    Writes buffer to a temporary file and guarantees cleanup on block exit.
    """
    with temporary_file(suffix=suffix) as temp_path:
        with open(temp_path, "wb") as f:
            f.write(buffer)
        yield temp_path

