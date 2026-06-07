# decNumber WASM bridge

`decnumber_bridge.c` is a small C ABI around the vendored decNumber sources in `src/decNumber`.

Build with Emscripten from the repository root:

```sh
emcc src/app/wasm/decnumber_bridge.c \
  src/decNumber/decNumber/decNumber-main/decNumber-icu-368/decNumber.c \
  src/decNumber/decNumber/decNumber-main/decNumber-icu-368/decContext.c \
  -I src/decNumber/decNumber/decNumber-main/decNumber-icu-368 \
  -DDECNUMDIGITS=128 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createDecNumberModule \
  -sENVIRONMENT=web,worker \
  -sEXPORTED_FUNCTIONS=_decnumber_add,_decnumber_subtract,_decnumber_multiply,_decnumber_divide \
  -sEXPORTED_RUNTIME_METHODS=ccall \
  -sSTACK_SIZE=1048576 \
  -O2 \
  -o public/decnumber/decnumber.mjs
```

The browser app imports this ES module from the worker and registers the adapter.
