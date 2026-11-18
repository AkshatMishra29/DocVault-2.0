# DocVault Document Validation Service Dockerfile
# Hardened, non-root, isolated internal container for CPU-based ML validation.

FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=2
ENV ONNX_NUM_THREADS=2

# Install lightweight system dependencies for image processing (libglib for cv2, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r docvault && useradd -r -g docvault -u 1001 -m docvault

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Setup quarantine mount directory with restricted permissions
RUN mkdir -p /quarantine /tmp/quarantine && \
    chown -R docvault:docvault /app /quarantine /tmp/quarantine

USER docvault

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
