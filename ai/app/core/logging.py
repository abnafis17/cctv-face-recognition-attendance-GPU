import sys
import logging

# Setup clean production logs (WARNING level to make streaming log-free & lag-free)
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("LiteAIServer")
