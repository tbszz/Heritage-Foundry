import base64
import inspect
from io import BytesIO
import unittest
from unittest.mock import patch

from PIL import Image

try:
    from sidecar.triposr_sidecar.core import decode_image_data_url
except ModuleNotFoundError:
    decode_image_data_url = None


class DecodeImageDataUrlTests(unittest.TestCase):
    def test_rejects_oversized_base64_before_allocating_decoded_bytes(self):
        max_bytes = 8
        oversized = "data:image/png;base64," + ("A" * 16)

        with patch("sidecar.triposr_sidecar.core.base64.b64decode") as decoder:
            with self.assertRaisesRegex(ValueError, "decoded byte limit"):
                decode_image_data_url(oversized, max_bytes=max_bytes)

        decoder.assert_not_called()
    def test_decodes_an_allowed_png_data_url(self):
        self.assertIsNotNone(
            decode_image_data_url,
            "sidecar.triposr_sidecar.core.decode_image_data_url is not implemented",
        )
        buffer = BytesIO()
        Image.new("RGB", (2, 2), (200, 30, 20)).save(buffer, format="PNG")
        png = buffer.getvalue()
        encoded = base64.b64encode(png).decode("ascii")

        result = decode_image_data_url(f"data:image/png;base64,{encoded}", 1024)

        self.assertEqual(result.mime_type, "image/png")
        self.assertEqual(result.extension, ".png")
        self.assertEqual(result.bytes, png)

    def test_rejects_bytes_that_do_not_match_the_declared_image_type(self):
        encoded = base64.b64encode(b"not-a-png").decode("ascii")

        with self.assertRaisesRegex(ValueError, "signature"):
            decode_image_data_url(f"data:image/png;base64,{encoded}", 1024)

    def test_rejects_an_image_whose_decoded_pixel_count_exceeds_the_limit(self):
        self.assertIn("max_pixels", inspect.signature(decode_image_data_url).parameters)
        buffer = BytesIO()
        Image.new("RGB", (100, 100), (255, 255, 255)).save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

        with self.assertRaisesRegex(ValueError, "pixel"):
            decode_image_data_url(
                f"data:image/png;base64,{encoded}",
                max_bytes=1024 * 1024,
                max_pixels=1_000,
            )


if __name__ == "__main__":
    unittest.main()
