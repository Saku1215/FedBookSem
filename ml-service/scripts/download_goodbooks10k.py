"""Download the goodbooks-10k dataset (permissive licence) into
ml-service/data/goodbooks-10k/goodbooks-10k-master/.

Idempotent: skips download if the ratings CSV already exists.
"""

import urllib.request
import zipfile
from pathlib import Path

URL = "https://github.com/zygmuntz/goodbooks-10k/archive/refs/heads/master.zip"
DEST = Path(__file__).parent.parent / "data" / "goodbooks-10k"
MARKER = DEST / "goodbooks-10k-master" / "ratings.csv"


def main() -> None:
    if MARKER.exists():
        print(f"Already present: {MARKER}")
        return

    DEST.mkdir(parents=True, exist_ok=True)
    zip_path = DEST / "master.zip"

    print(f"Downloading {URL} ...")
    urllib.request.urlretrieve(URL, zip_path)
    print(f"  -> {zip_path.stat().st_size / 1024 / 1024:.1f} MB")

    print("Extracting ...")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(DEST)
    zip_path.unlink()  # tidy up

    print(f"Done. ratings.csv at {MARKER}")


if __name__ == "__main__":
    main()
