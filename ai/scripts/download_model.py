import os
import sys
import ssl
import urllib.request
import zipfile
from pathlib import Path

# Bypass SSL verification
ssl._create_default_https_context = ssl._create_unverified_context

MODEL_NAME = "scrfd_2.5g_bn_kps"
URL = f"https://github.com/deepinsight/insightface/releases/download/v0.7/{MODEL_NAME}.zip"
DEST_DIR = Path.home() / ".insightface" / "models"
ZIP_PATH = DEST_DIR / f"{MODEL_NAME}.zip"

def download_and_extract():
    print(f"Creating directory: {DEST_DIR}")
    DEST_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {MODEL_NAME} from GitHub...")
    try:
        urllib.request.urlretrieve(URL, ZIP_PATH)
        print("Download successful.")
    except Exception as e:
        print(f"Error downloading: {e}")
        return

    print("Extracting model...")
    try:
        with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
            zip_ref.extractall(DEST_DIR)
        print(f"Model extracted to {DEST_DIR / MODEL_NAME}")
    except Exception as e:
        print(f"Error extracting: {e}")
    finally:
        if ZIP_PATH.exists():
            ZIP_PATH.unlink()

if __name__ == "__main__":
    download_and_extract()
