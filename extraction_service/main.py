import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.health_routes import router as health_router
from app.api.extraction_routes import router as extraction_router
from app.config import HOST, PORT

app = FastAPI(
    title="DocVault CPU Extraction Engine",
    description="Production-grade, CPU-optimized document extraction pipeline using PyMuPDF, OpenCV, and Tesseract OCR.",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(health_router)
app.include_router(extraction_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)

