# Define destination directory
$destDir = "public/sherpa"
$proxy = "http://127.0.0.1:7897"

# Create the directory if it doesn't exist
if (-not (Test-Path -Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir | Out-Null
    Write-Host "Created directory: $destDir"
}

# Cleanup previous partial downloads
Remove-Item -Path "$destDir/*.js" -ErrorAction SilentlyContinue
Remove-Item -Path "$destDir/*.wasm" -ErrorAction SilentlyContinue
Remove-Item -Path "$destDir/*.bz2" -ErrorAction SilentlyContinue

# Define the files to download (Hugging Face Space URLs for WASM)
$files = @(
    @{
        Url  = "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main.js"
        Name = "sherpa-onnx-wasm-main.js"
    },
    @{
        Url  = "https://huggingface.co/spaces/k2-fsa/web-assembly-asr-sherpa-onnx-en/resolve/main/sherpa-onnx-wasm-main.wasm"
        Name = "sherpa-onnx-wasm-main.wasm"
    },
    @{
        Url  = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-02-21.tar.bz2"
        Name = "model.tar.bz2"
    }
)

# Download each file using curl.exe
foreach ($file in $files) {
    $destPath = Join-Path $destDir $file.Name
    Write-Host "Downloading $($file.Name) using curl..."
    
    # Use curl.exe explicitly to avoid PowerShell alias
    # -L: Follow redirects
    # -k: Insecure (skip SSL check, useful for some proxies)
    # -x: Proxy
    # -o: Output file
    $curlArgs = @("-L", "-k", "-x", $proxy, "-o", $destPath, $file.Url)
    
    Start-Process -FilePath "curl.exe" -ArgumentList $curlArgs -Wait -NoNewWindow
    
    if (Test-Path $destPath) {
        Write-Host "Downloaded: $($file.Name)"
    }
    else {
        Write-Error "Failed to download $($file.Name)"
    }
}

# Extract the model archive
$modelArchive = Join-Path $destDir "model.tar.bz2"
if (Test-Path $modelArchive) {
    Write-Host "Extracting model..."
    try {
        # Extract to public/sherpa
        tar -xjf $modelArchive -C $destDir
        
        # Move files from the extracted folder to the root of public/sherpa
        $extractedFolder = Join-Path $destDir "sherpa-onnx-streaming-zipformer-en-2023-02-21"
        if (Test-Path $extractedFolder) {
            Move-Item -Path "$extractedFolder/*" -Destination $destDir -Force
            Remove-Item -Path $extractedFolder -Recurse -Force
            Write-Host "Model files moved to $destDir"
        }
        
        # Clean up archive
        Remove-Item -Path $modelArchive
        Write-Host "Extraction complete."
    }
    catch {
        Write-Error "Failed to extract model: $_"
        Write-Host "Please manually extract $modelArchive to $destDir"
    }
}

Write-Host "Done! Sherpa-onnx files are ready in $destDir"
