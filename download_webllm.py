import os
import time
import requests
from urllib.parse import urlencode

REPO = "mlc-ai/Qwen2.5-3B-Instruct-q4f16_1-MLC"
TARGET_DIR = "public/models/Qwen2.5-3B-Instruct-q4f16_1-MLC"

FILES = [
    "mlc-chat-config.json",
    "ndarray-cache.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "tensor-cache.json"
]
for i in range(62):
    FILES.append(f"params_shard_{i}.bin")
    
# WASM
WASM_URL = "https://fastly.jsdelivr.net/gh/mlc-ai/binary-mlc-llm-libs@main/web-llm-models/v0_2_80/Qwen2.5-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm"

os.makedirs(TARGET_DIR, exist_ok=True)

def download_file_with_resume(url, filepath):
    max_retries = 50
    for attempt in range(max_retries):
        try:
            head_res = requests.head(url, timeout=10, allow_redirects=True)
            total_size = int(head_res.headers.get('content-length', 0))
            
            initial_size = 0
            if os.path.exists(filepath):
                initial_size = os.path.getsize(filepath)
                if total_size > 0 and initial_size == total_size:
                    print(f"[OK] {os.path.basename(filepath)}")
                    return True
                
            headers = {}
            if initial_size > 0:
                headers['Range'] = f'bytes={initial_size}-'
                
            print(f"[DOWNLOADING] {os.path.basename(filepath)} (Attempt {attempt+1}) - {initial_size}/{total_size} bytes")
            res = requests.get(url, headers=headers, stream=True, timeout=15)
            
            if res.status_code not in (200, 206):
                print(f"Error {res.status_code}")
                time.sleep(2)
                continue
                
            mode = 'ab' if initial_size > 0 else 'wb'
            with open(filepath, mode) as f:
                for chunk in res.iter_content(chunk_size=1024*1024):
                    if chunk:
                        f.write(chunk)
                        
            # Verify after download
            final_size = os.path.getsize(filepath)
            if total_size > 0 and final_size != total_size:
                raise Exception("Incomplete download")
                
            print(f"[SUCCESS] {os.path.basename(filepath)}")
            return True
            
        except Exception as e:
            print(f"Failed: {str(e)}")
            time.sleep(2)
            
    return False

for f in FILES:
    url = f"https://modelscope.cn/api/v1/models/{REPO}/repo?Revision=master&FilePath={f}"
    download_file_with_resume(url, os.path.join(TARGET_DIR, f))

download_file_with_resume(WASM_URL, os.path.join(TARGET_DIR, "Qwen2.5-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm"))
print("ALL DONE!")
