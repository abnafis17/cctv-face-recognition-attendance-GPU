import requests
import traceback

url = "http://10.81.100.175:3001/api/v1/employees"
headers = {"X-Company-Id": "cmk9dp01a0000vpskicoq1gj0"}

print(f"Testing connection to {url}...")
try:
    res = requests.get(url, headers=headers, timeout=5.0)
    print(f"Status Code: {res.status_code}")
    print(f"Response (truncated): {res.text[:200]}")
except Exception as e:
    print(f"Connection failed: {e}")
    traceback.print_exc()
