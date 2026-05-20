"""Wardrobe ML service.

One endpoint, /process, that runs the three image operations the cataloging
pipeline needs (SPEC section 9):
  1. background removal      -> transparent PNG cutout
  2. dominant color extraction -> palette for the color-harmony algorithm
  3. CLIP embedding          -> 512-d style vector
"""

import base64
import io
import os

import numpy as np
import open_clip
import torch
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from rembg import remove
from sklearn.cluster import KMeans

app = FastAPI(title="wardrobe-ml", version="0.1.0")

_device = "cuda" if torch.cuda.is_available() else "cpu"
_clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
    "ViT-B-32", pretrained="openai"
)
_clip_model = _clip_model.to(_device)
_clip_model.eval()


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/process")
async def process(file: UploadFile = File(...)) -> JSONResponse:
    """Run background removal + color extraction + CLIP on one item photo."""
    raw = await file.read()

    # Step 1: background removal -> RGBA PNG cutout
    cutout_bytes = remove(raw)
    cutout_img = Image.open(io.BytesIO(cutout_bytes)).convert("RGBA")

    # Step 2: dominant colors from non-transparent pixels via k-means
    arr = np.array(cutout_img)
    visible = arr[arr[:, :, 3] > 10, :3]  # RGB of opaque-ish pixels
    colors: list[dict] = []
    if len(visible) > 0:
        n_clusters = min(5, len(visible))
        km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        km.fit(visible)
        centers = km.cluster_centers_.astype(int)
        total = len(km.labels_)
        for i, center in enumerate(centers):
            proportion = float((km.labels_ == i).sum() / total)
            hex_color = "#{:02x}{:02x}{:02x}".format(center[0], center[1], center[2])
            colors.append({"hex": hex_color, "proportion": round(proportion, 4)})
        colors.sort(key=lambda c: c["proportion"], reverse=True)

    # Step 3: CLIP ViT-B/32 embedding (512-d, L2-normalised)
    tensor = _clip_preprocess(cutout_img.convert("RGB")).unsqueeze(0).to(_device)
    with torch.no_grad():
        feat = _clip_model.encode_image(tensor)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    embedding: list[float] = feat[0].cpu().tolist()

    # Encode cutout as base64 PNG for transport
    buf = io.BytesIO()
    cutout_img.save(buf, format="PNG")
    cutout_b64 = base64.b64encode(buf.getvalue()).decode()

    return JSONResponse(
        {
            "cutoutPngBase64": cutout_b64,
            "colors": colors,
            "embedding": embedding,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
