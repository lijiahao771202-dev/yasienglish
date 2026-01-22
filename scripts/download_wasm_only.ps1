# Define destination directory
$destDir = "public/sherpa"
$proxy = "http://127.0.0.1:7897"

# Define the WASM files to download (GitHub Raw URLs - gh-pages branch)
$files = @(
    @{
        Url  = "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/gh-pages/wasm/asr/sherpa-onnx-wasm-main.js"
        Name = "sherpa-onnx-wasm-main.js"
    },
    @{
        Url  = "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/gh-pages/wasm/asr/sherpa-onnx-wasm-main.wasm"
        Name = "sherpa-onnx-wasm-main.wasm"
    }
)

# Download each file using curl.exe
foreach ($file in $files) {
    $destPath = Join-Path $destDir $file.Name
    Write-Host "Downloading $($file.Name) using curl..."
    
    # Use curl.exe explicitly
    $curlArgs = @("-L", "-k", "-x", $proxy, "-o", $destPath, $file.Url)
    
    Start-Process -FilePath "curl.exe" -ArgumentList $curlArgs -Wait -NoNewWindow
    
    if (Test-Path $destPath) {
        $item = Get-Item $destPath
        Write-Host "Downloaded: $($file.Name) ($($item.Length) bytes)"
    }
    else {
        Write-Error "Failed to download $($file.Name)"
    }
}

Write-Host "WASM files update complete."
