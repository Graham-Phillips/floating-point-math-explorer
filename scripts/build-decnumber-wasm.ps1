$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path "$PSScriptRoot\.."
$emsdkRoot = if ($env:EMSDK) { $env:EMSDK } else { "C:\tmp\emsdk" }
$emsdkEnv = Join-Path $emsdkRoot "emsdk_env.bat"

if (!(Test-Path $emsdkEnv)) {
  throw "Emscripten SDK was not found at $emsdkRoot. Install it with emsdk, or set EMSDK to the SDK path."
}

$outputDir = Join-Path $repoRoot "public\decnumber"
New-Item -ItemType Directory -Force $outputDir | Out-Null

$emccArgs = @(
  "emcc",
  "src/app/wasm/decnumber_bridge.c",
  "src/decNumber/decNumber/decNumber-main/decNumber-icu-368/decNumber.c",
  "src/decNumber/decNumber/decNumber-main/decNumber-icu-368/decContext.c",
  "-I src/decNumber/decNumber/decNumber-main/decNumber-icu-368",
  "-DDECNUMDIGITS=128",
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  "-sEXPORT_NAME=createDecNumberModule",
  "-sENVIRONMENT=web,worker",
  "-sEXPORTED_FUNCTIONS=_decnumber_add,_decnumber_subtract,_decnumber_multiply,_decnumber_divide,_decnumber_round",
  "-sEXPORTED_RUNTIME_METHODS=ccall",
  "-sSTACK_SIZE=1048576",
  "-O2",
  "-o public/decnumber/decnumber.mjs"
) -join " "

$command = "call `"$emsdkEnv`" > nul && $emccArgs"

Push-Location $repoRoot
try {
  cmd /c $command
} finally {
  Pop-Location
}
