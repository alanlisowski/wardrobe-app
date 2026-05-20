"""Quick functional test for the /process pipeline — runs without uvicorn."""
import asyncio
import base64
import io
import sys

from PIL import Image


def _make_test_image() -> bytes:
    """Create a simple JPEG with clothing-like coloured blocks."""
    img = Image.new("RGB", (320, 400), color=(220, 180, 140))  # tan background
    # Draw a rough blue shirt shape in the centre
    from PIL import ImageDraw

    draw = ImageDraw.Draw(img)
    draw.rectangle([80, 60, 240, 340], fill=(40, 80, 160))   # shirt body
    draw.rectangle([40, 60, 100, 200], fill=(40, 80, 160))   # left sleeve
    draw.rectangle([220, 60, 280, 200], fill=(40, 80, 160))  # right sleeve
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


async def main() -> None:
    print("Generating test image…")
    img_bytes = _make_test_image()
    print(f"  generated {len(img_bytes):,} bytes")

    # Write bytes into a fake UploadFile-like object and call process()
    from fastapi import UploadFile
    from io import BytesIO

    fake_file = UploadFile(filename="test.jpg", file=BytesIO(img_bytes))

    print("Running /process pipeline (rembg + k-means + CLIP)…")
    from main import process  # noqa: E402

    result = await process(file=fake_file)
    data = result.body
    import json

    out = json.loads(data)

    # Validate cutout
    assert out["cutoutPngBase64"], "cutoutPngBase64 is empty"
    cutout_bytes = base64.b64decode(out["cutoutPngBase64"])
    assert len(cutout_bytes) > 1000, f"cutout too small: {len(cutout_bytes)} bytes"
    print(f"  cutout PNG: {len(cutout_bytes):,} bytes  OK")

    # Validate colors
    colors = out["colors"]
    assert len(colors) > 0, "no colors returned"
    for c in colors:
        assert c["hex"].startswith("#"), f"bad hex: {c['hex']}"
        assert 0 < c["proportion"] <= 1, f"bad proportion: {c['proportion']}"
    proportions_sum = sum(c["proportion"] for c in colors)
    print(f"  colors ({len(colors)}): {[c['hex'] for c in colors]}  sum={proportions_sum:.3f}  OK")

    # Validate embedding
    emb = out["embedding"]
    assert len(emb) == 512, f"embedding length {len(emb)}, expected 512"
    import math
    norm = math.sqrt(sum(x * x for x in emb))
    assert abs(norm - 1.0) < 1e-3, f"embedding not L2-normalised, norm={norm:.4f}"
    print(f"  embedding: 512 floats, L2-norm={norm:.4f}  OK")

    print("\nAll checks passed.")


if __name__ == "__main__":
    sys.path.insert(0, ".")
    asyncio.run(main())
