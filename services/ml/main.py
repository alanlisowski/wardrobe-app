"""Wardrobe ML service.

One endpoint, /process, that runs the three image operations the cataloging
pipeline needs (SPEC section 9):
  1. background removal      -> transparent PNG cutout
  2. dominant color extraction -> palette for the color-harmony algorithm
  3. CLIP embedding          -> 512-d style vector

All three are stubbed below. Implement them one at a time.
"""

import os

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="wardrobe-ml", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/process")
async def process(file: UploadFile = File(...)) -> JSONResponse:
    """Run background removal + color extraction + CLIP on one item photo.

    TODO (SPEC section 9):
      1. rembg / BiRefNet -> transparent PNG cutout
      2. k-means over non-transparent pixels -> dominant colors
      3. CLIP ViT-B/32 -> 512-d embedding
    """
    raw = await file.read()
    return JSONResponse(
        {
            "cutoutPngBase64": None,  # TODO: background-removed PNG, base64
            "colors": [],            # TODO: [{"hex": "#...", "proportion": 0.0}]
            "embedding": [],         # TODO: 512 floats
            "bytesReceived": len(raw),
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
