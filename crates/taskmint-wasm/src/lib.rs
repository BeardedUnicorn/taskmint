//! taskmint-core for the web app, compiled to WebAssembly: its in-memory
//! host (taskmint_core::host::JsonHost) as a class JavaScript can hold.
//! Only calls live here; the coverage policy leaves the file out, and the
//! host is tested in core. scripts/build-wasm.mjs builds it into
//! apps/web/src/wasm.

use taskmint_core::host::JsonHost;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Core(JsonHost);

#[wasm_bindgen]
impl Core {
    /// `zone`: the browser's IANA time zone (`Intl`).
    #[wasm_bindgen(constructor)]
    pub fn new(zone: &str) -> Core {
        Core(JsonHost::new(zone))
    }

    /// Runs a command: its arguments as JSON, the time in milliseconds. The
    /// reply as JSON; an error throws the message.
    pub fn call(&mut self, name: &str, args: &str, now_ms: f64) -> Result<String, String> {
        self.0.call(name, args, now_ms)
    }

    /// The events since last asked, as JSON: `[{ name, payload }]`.
    #[wasm_bindgen(js_name = takeEvents)]
    pub fn take_events(&mut self) -> String {
        self.0.take_events()
    }
}
