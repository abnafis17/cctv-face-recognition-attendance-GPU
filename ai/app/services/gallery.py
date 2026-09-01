import threading
import requests
import numpy as np
from app.core.config import BACKEND_BASE_URL
from app.core.logging import logger
from app.services.model_manager import get_l2_norm

gallery_templates = []
gallery_lock = threading.Lock()

def sync_gallery(company_id: str):
    global gallery_templates
    url = f"{BACKEND_BASE_URL}/api/v1/gallery/templates"
    headers = {"x-company-id": company_id}
    try:
        res = requests.get(url, headers=headers, timeout=5.0)
        if res.status_code == 200:
            templates = res.json()
            loaded = []
            for t in templates:
                emp_id = t.get("employeeId") or t.get("employee_id") or ""
                name = t.get("employeeName") or t.get("employee_name") or emp_id
                emb_list = t.get("embedding")
                if emb_list and len(emb_list) >= 128:
                    emb = np.asarray(emb_list, dtype=np.float32)
                    emb = get_l2_norm(emb)
                    loaded.append({
                        "employee_id": emp_id,
                        "name": name,
                        "embedding": emb
                    })
            with gallery_lock:
                gallery_templates = loaded
        else:
            logger.error(f"Failed to load templates. Status: {res.status_code}")
    except Exception as e:
        logger.error(f"Gallery template sync failed: {e}. Running with empty/stale cache.")

def get_gallery_templates():
    with gallery_lock:
        return list(gallery_templates)
