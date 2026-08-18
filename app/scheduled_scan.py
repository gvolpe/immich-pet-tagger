"""One-shot background scan entrypoint for systemd timers."""

import logging
import os

import inference


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("scheduled_scan")

DATA_DIR = os.environ.get("DATA_DIR", "/var/lib/immich-pet-tagger")


def main() -> int:
    log.info("Starting scheduled scan. Data dir: %s", DATA_DIR)
    counts, low_conf, _review = inference.run_scan(DATA_DIR, migrate=True)
    log.info("Scheduled scan complete. counts=%s low_confidence=%d", counts, len(low_conf))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
