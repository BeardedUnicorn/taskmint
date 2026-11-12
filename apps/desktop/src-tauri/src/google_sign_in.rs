//! Google sign-in for cloud sync on the desktop, the way Google has
//! installed apps do it: the system browser opens Google's sign-in page, and
//! Google sends the browser back to a one-time listener on 127.0.0.1 with a
//! code, which is exchanged (with the PKCE verifier only this process knows)
//! for an ID token. The webview signs in to Firebase with that token. The
//! webview can't do it itself: Google refuses sign-in inside embedded
//! webviews, and Firebase's popup can't open from one.
//!
//! Once the browser is back, the app comes forward and the browser gets a
//! page in TaskMint's look saying how it went, which opens taskmint://open
//! when the browser kept the focus (macOS lets the app in front refuse
//! another app's request to come forward; a link the browser opens is
//! handed over).

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use taskmint_core::contract::{DEEP_LINK_OPEN, DEEP_LINK_SCHEME};

use crate::platform::Platform;

/// How long the browser has to come back.
pub const TIMEOUT: Duration = Duration::from_secs(300);

/// The app's "Desktop app" OAuth client (Google Cloud console → Credentials).
/// Google treats an installed app's secret as public; PKCE protects the flow.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleClient {
    pub client_id: String,
    pub client_secret: String,
}

/// The app's light or dark mode, for the page the browser comes back to.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ColorMode {
    Light,
    Dark,
}

/// Where Google's pages are, and where the browser comes back to (tests
/// use a stand-in token endpoint).
pub struct Endpoints<'a> {
    pub auth: &'a str,
    pub token: &'a str,
    /// The listener's addresses on this computer, the first free one taken.
    pub listen: &'a [&'a str],
}

pub const GOOGLE: Endpoints<'static> = Endpoints {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    // One port when it's free, so a browser's "always allow" for the page's
    // link to the app holds from one sign-in to the next (it's per origin,
    // port included); any free port otherwise. Google takes any port on a
    // loopback address.
    listen: &["127.0.0.1:43118", "127.0.0.1:0"],
};

/// What a cancelled sign-in says (the page says so too).
const CANCELLED: &str = "Google sign-in was cancelled.";

/// The page the browser comes back to, and what it shows.
const PAGE: &str = include_str!("google_sign_in.html");
const LOGO: &[u8] = include_bytes!("../../../../packages/client/public/taskmint-logo.png");
const LOGO_DARK: &[u8] =
    include_bytes!("../../../../packages/client/public/taskmint-logo-dark.png");
const FAVICON: &[u8] = include_bytes!("../../../../packages/client/public/favicon.png");

/// Material icons' CheckCircle, Cancel and Error, as the app's are.
const CHECK_ICON: &str = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z";
const CANCEL_ICON: &str = "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2m5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12z";
const ERROR_ICON: &str =
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-2h2zm0-4h-2V7h2z";

/// How the sign-in went, as the page tells it: fixed words, never the
/// error's (the app shows those), so nothing from the request reaches it.
#[derive(Debug, Clone, Copy, PartialEq)]
enum Outcome {
    SignedIn,
    Cancelled,
    Failed,
}

impl Outcome {
    fn of(result: &Result<String, String>) -> Outcome {
        match result {
            Ok(_) => Outcome::SignedIn,
            Err(error) if error == CANCELLED => Outcome::Cancelled,
            Err(_) => Outcome::Failed,
        }
    }
}

/// The page for `outcome`, in `mode` (the browser's own without one).
fn page(outcome: Outcome, mode: Option<ColorMode>) -> String {
    let (class, title, message, icon) = match outcome {
        Outcome::SignedIn => (
            "done",
            "You're signed in",
            "Taking you back to TaskMint…",
            CHECK_ICON,
        ),
        Outcome::Cancelled => (
            "cancelled",
            "Sign-in cancelled",
            "Nothing changed. You can try again in TaskMint.",
            CANCEL_ICON,
        ),
        Outcome::Failed => (
            "failed",
            "Sign-in didn't finish",
            "TaskMint says what went wrong.",
            ERROR_ICON,
        ),
    };
    let theme = match mode {
        Some(ColorMode::Light) => r#" data-theme="light""#,
        Some(ColorMode::Dark) => r#" data-theme="dark""#,
        None => "",
    };
    PAGE.replace("{{theme}}", theme)
        .replace("{{outcome}}", class)
        .replace("{{title}}", title)
        .replace("{{message}}", message)
        .replace("{{icon}}", icon)
        .replace(
            "{{open}}",
            &format!("{}://{}", DEEP_LINK_SCHEME, DEEP_LINK_OPEN),
        )
        .replace("{{logo}}", &STANDARD.encode(LOGO))
        .replace("{{logo_dark}}", &STANDARD.encode(LOGO_DARK))
        .replace("{{favicon}}", &STANDARD.encode(FAVICON))
}

/// A random URL-safe text: 32 bytes of the system's randomness (v4 UUIDs).
fn random_text() -> String {
    let bytes: Vec<u8> = (0..2)
        .flat_map(|_| *uuid::Uuid::new_v4().as_bytes())
        .collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

/// PKCE's S256 challenge for `verifier` (RFC 7636 §4.2): the URL-safe
/// base64 of its SHA-256, unpadded.
fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

/// The browser's request: the code, or Google's error, once the state matches.
fn read_redirect(path: &str, state: &str) -> Option<Result<String, String>> {
    let url = url::Url::parse(&format!("http://127.0.0.1{}", path)).ok()?;
    let mut code = None;
    let mut error = None;
    let mut returned_state = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            "state" => returned_state = Some(value.into_owned()),
            _ => {}
        }
    }
    if returned_state.as_deref() != Some(state) {
        return None;
    }
    match (code, error) {
        (Some(code), _) => Some(Ok(code)),
        (None, Some(error)) if error == "access_denied" => Some(Err(CANCELLED.to_string())),
        (None, error) => Some(Err(format!(
            "Google sign-in failed: {}.",
            error.unwrap_or_else(|| "no code".to_string())
        ))),
    }
}

#[derive(Deserialize)]
struct TokenReply {
    id_token: String,
}

/// The ID token Google's `token` endpoint gives for `code`.
fn exchange(
    token: &str,
    client: &GoogleClient,
    code: &str,
    verifier: &str,
    redirect: &str,
) -> Result<String, String> {
    let reply: TokenReply = ureq::post(token)
        .timeout(Duration::from_secs(30))
        .send_form(&[
            ("code", code),
            ("client_id", client.client_id.as_str()),
            ("client_secret", client.client_secret.as_str()),
            ("code_verifier", verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect),
        ])
        .map_err(|e| format!("Google sign-in failed: {}", e))?
        .into_json()
        .map_err(|e| format!("Google sign-in failed: {}", e))?;
    Ok(reply.id_token)
}

/// google_sign_in: signs in with Google in the system browser, waiting up
/// to TIMEOUT for it to come back.
pub fn sign_in_with_google(
    platform: &dyn Platform,
    client: &GoogleClient,
    mode: Option<ColorMode>,
) -> Result<Value, String> {
    sign_in(platform, client, &GOOGLE, TIMEOUT, mode)
}

/// Signs in with Google in the system browser: `{ idToken }`. The page the
/// browser comes back to is in `mode`.
pub fn sign_in(
    platform: &dyn Platform,
    client: &GoogleClient,
    endpoints: &Endpoints,
    timeout: Duration,
    mode: Option<ColorMode>,
) -> Result<Value, String> {
    let server = endpoints
        .listen
        .iter()
        .find_map(|address| tiny_http::Server::http(address).ok())
        .ok_or_else(|| "Google sign-in couldn't listen for the browser.".to_string())?;
    let port = server.server_addr().to_ip().expect("a TCP listener").port();
    let redirect = format!("http://127.0.0.1:{}", port);
    let verifier = random_text();
    let challenge = pkce_challenge(&verifier);
    let state = random_text();
    let url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        endpoints.auth,
        encode(&client.client_id),
        encode(&redirect),
        encode("openid email profile"),
        challenge,
        state
    );
    platform.open_url(&url)?;

    // The browser may ask for other things (a favicon) before or after
    let until = Instant::now() + timeout;
    let (request, answer) = loop {
        let left = until.saturating_duration_since(Instant::now());
        // (An error waiting counts as no answer)
        let Some(request) = server.recv_timeout(left).ok().flatten() else {
            return Err("Google sign-in timed out. Try again.".to_string());
        };
        match read_redirect(request.url(), &state) {
            Some(answer) => break (request, answer),
            None => {
                let _ = request.respond(tiny_http::Response::empty(404));
            }
        }
    };

    // The page waits for the exchange, so it says how the sign-in really
    // went, and for the window, so the app is forward before the page
    // looks at whether the browser still has the focus
    let result =
        answer.and_then(|code| exchange(endpoints.token, client, &code, &verifier, &redirect));
    platform.show_main_window();
    let page = tiny_http::Response::from_string(page(Outcome::of(&result), mode)).with_header(
        "Content-Type: text/html; charset=utf-8"
            .parse::<tiny_http::Header>()
            .expect("a valid header"),
    );
    let _ = request.respond(page);
    result.map(|id_token| serde_json::json!({ "idToken": id_token }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::fake::FakePlatform;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::Arc;

    const CLIENT: &str = "client-1.apps.googleusercontent.com";
    /// Any free port.
    const ANY_PORT: &[&str] = &["127.0.0.1:0"];

    fn client() -> GoogleClient {
        serde_json::from_value(serde_json::json!({ "clientId": CLIENT, "clientSecret": "s3cret" }))
            .unwrap()
    }

    /// A token endpoint that answers once with `status` and `body`, and
    /// hands back the request it got.
    fn token_endpoint(
        status: u16,
        body: &'static str,
    ) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/token", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut seen = Vec::new();
            let mut buffer = [0; 4096];
            // Read until the form body (the last part) has come in
            while !String::from_utf8_lossy(&seen).contains("redirect_uri=") {
                let read = stream.read(&mut buffer).unwrap();
                seen.extend_from_slice(&buffer[..read]);
            }
            let reply = format!(
                "HTTP/1.1 {} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                body.len(),
                body
            );
            stream.write_all(reply.as_bytes()).unwrap();
            String::from_utf8(seen).unwrap()
        });
        (url, handle)
    }

    /// Runs sign_in on a thread, listening on `listen`, with the browser
    /// played by `browse`, which gets the sign-in page's address. Hands back
    /// the platform too, to see what the app did.
    fn signing_in_on(
        listen: &[&str],
        token: &str,
        timeout: Duration,
        browse: impl FnOnce(url::Url) + Send + 'static,
    ) -> (Result<Value, String>, Arc<FakePlatform>) {
        let platform = Arc::new(FakePlatform::default());
        let watching = platform.clone();
        let browser = std::thread::spawn(move || {
            let opened = loop {
                if let Some(url) = watching.recorded().opened_urls.first().cloned() {
                    break url;
                }
                std::thread::sleep(Duration::from_millis(2));
            };
            browse(url::Url::parse(&opened).unwrap());
        });
        let endpoints = Endpoints {
            auth: "https://accounts.example.com/auth",
            token,
            listen,
        };
        let result = sign_in(
            platform.as_ref(),
            &client(),
            &endpoints,
            timeout,
            Some(ColorMode::Dark),
        );
        browser.join().unwrap();
        (result, platform)
    }

    fn signing_in(
        token: &str,
        timeout: Duration,
        browse: impl FnOnce(url::Url) + Send + 'static,
    ) -> (Result<Value, String>, Arc<FakePlatform>) {
        signing_in_on(ANY_PORT, token, timeout, browse)
    }

    fn param(url: &url::Url, name: &str) -> String {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
            .unwrap()
    }

    fn redirect_port(url: &url::Url) -> u16 {
        url::Url::parse(&param(url, "redirect_uri"))
            .unwrap()
            .port()
            .unwrap()
    }

    /// The browser coming back to the listener with `query`.
    fn come_back(url: &url::Url, query: &str) -> String {
        let redirect = url::Url::parse(&param(url, "redirect_uri")).unwrap();
        let mut stream = TcpStream::connect(redirect.socket_addrs(|| None).unwrap()[0]).unwrap();
        write!(
            stream,
            "GET /?{} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
            query
        )
        .unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).unwrap();
        reply
    }

    #[test]
    fn a_google_sign_in_comes_back_with_an_id_token() {
        let (token, endpoint) =
            token_endpoint(200, r#"{"id_token":"eyJ.id.token","access_token":"x"}"#);
        let (challenge_sent, challenge) = std::sync::mpsc::channel();
        let (result, platform) = signing_in(&token, TIMEOUT, move |url| {
            assert_eq!(url.path(), "/auth");
            assert_eq!(param(&url, "client_id"), CLIENT);
            assert_eq!(param(&url, "scope"), "openid email profile");
            assert_eq!(param(&url, "code_challenge_method"), "S256");
            challenge_sent.send(param(&url, "code_challenge")).unwrap();
            assert!(param(&url, "redirect_uri").starts_with("http://127.0.0.1:"));
            // A favicon first, then a wrong state: neither is the answer
            assert!(come_back(&url, "x=1").starts_with("HTTP/1.1 404"));
            assert!(come_back(&url, "code=c&state=forged").starts_with("HTTP/1.1 404"));
            let state = param(&url, "state");
            let page = come_back(&url, &format!("code=the-code&state={}", state));
            assert!(page.contains("text/html; charset=utf-8"));
            assert!(page.contains("<h1>You're signed in</h1>"));
            assert!(page.contains(r#"<body class="done">"#));
            // In the app's mode, with its way back to the app
            assert!(page.contains(r#"<html lang="en" data-theme="dark">"#));
            assert!(page.contains(r#"href="taskmint://open""#));
        });
        assert_eq!(result, Ok(serde_json::json!({ "idToken": "eyJ.id.token" })));
        assert_eq!(platform.recorded().windows_shown, 1);
        let request = endpoint.join().unwrap();
        assert!(request.contains("code=the-code"));
        assert!(request.contains("client_secret=s3cret"));
        assert!(request.contains("grant_type=authorization_code"));
        // Google was given the challenge for the verifier the exchange sends
        let verifier = request
            .split("code_verifier=")
            .nth(1)
            .and_then(|rest| rest.split('&').next())
            .unwrap();
        assert_eq!(challenge.recv().unwrap(), pkce_challenge(verifier));
    }

    #[test]
    fn the_challenge_is_rfc_7636s_s256() {
        // RFC 7636 Appendix B's example
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn a_cancelled_or_failed_sign_in_says_so() {
        for (error, message, title) in [
            (
                "access_denied",
                "Google sign-in was cancelled.",
                "Sign-in cancelled",
            ),
            (
                "server_error",
                "Google sign-in failed: server_error.",
                "Sign-in didn't finish",
            ),
            (
                "",
                "Google sign-in failed: no code.",
                "Sign-in didn't finish",
            ),
        ] {
            let (result, platform) = signing_in("http://127.0.0.1:9/token", TIMEOUT, move |url| {
                let state = param(&url, "state");
                let query = match error {
                    "" => format!("state={}", state),
                    error => format!("error={}&state={}", error, state),
                };
                let page = come_back(&url, &query);
                assert!(page.contains(&format!("<h1>{}</h1>", title)));
                assert!(!page.contains("You're signed in"));
                // Google's words stay off the page
                assert!(error.is_empty() || !page.contains(error));
            });
            assert_eq!(result, Err(message.to_string()));
            // Back to the app, which says what happened
            assert_eq!(platform.recorded().windows_shown, 1);
        }
    }

    #[test]
    fn a_refused_code_or_an_odd_reply_says_so() {
        for body in [
            r#"{"error":"invalid_grant"}"#,
            r#"{"access_token":"no id token"}"#,
        ] {
            let status = if body.contains("invalid_grant") {
                400
            } else {
                200
            };
            let (token, _) = token_endpoint(status, body);
            let (result, platform) = signing_in(&token, TIMEOUT, |url| {
                let page = come_back(&url, &format!("code=c&state={}", param(&url, "state")));
                // The page waited for the exchange: it didn't sign in
                assert!(page.contains("<h1>Sign-in didn't finish</h1>"));
                assert!(page.contains(r#"<body class="failed">"#));
            });
            assert!(result.unwrap_err().starts_with("Google sign-in failed: "));
            assert_eq!(platform.recorded().windows_shown, 1);
        }
    }

    #[test]
    fn a_browser_that_never_comes_back_times_out() {
        let (result, platform) = signing_in(
            "http://127.0.0.1:9/token",
            Duration::from_millis(50),
            |_| {},
        );
        assert_eq!(
            result,
            Err("Google sign-in timed out. Try again.".to_string())
        );
        assert_eq!(platform.recorded().windows_shown, 0);
    }

    #[test]
    fn the_first_free_address_is_the_one_listened_on() {
        // Free: that port
        let free = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = free.local_addr().unwrap().port();
        drop(free);
        let preferred = format!("127.0.0.1:{}", port);
        let (_, _) = signing_in_on(
            &[&preferred, "127.0.0.1:0"],
            "http://127.0.0.1:9/token",
            TIMEOUT,
            move |url| {
                assert_eq!(redirect_port(&url), port);
                come_back(&url, &format!("error=x&state={}", param(&url, "state")));
            },
        );

        // Taken: any other
        let taken = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = taken.local_addr().unwrap().port();
        let preferred = format!("127.0.0.1:{}", port);
        let (_, _) = signing_in_on(
            &[&preferred, "127.0.0.1:0"],
            "http://127.0.0.1:9/token",
            TIMEOUT,
            move |url| {
                assert_ne!(redirect_port(&url), port);
                come_back(&url, &format!("error=x&state={}", param(&url, "state")));
            },
        );
        drop(taken);
    }

    #[test]
    fn the_page_is_in_the_apps_mode_or_else_the_browsers() {
        let light = page(Outcome::SignedIn, Some(ColorMode::Light));
        assert!(light.contains(r#"<html lang="en" data-theme="light">"#));
        let browsers = page(Outcome::Cancelled, None);
        assert!(browsers.contains(r#"<html lang="en">"#));
        // Everything filled in, the logos and icon inline
        for page in [light, browsers, page(Outcome::Failed, None)] {
            assert!(!page.contains("{{"));
            assert!(page.contains("data:image/png;base64,iVBOR"));
        }
        let mode: ColorMode = serde_json::from_value(serde_json::json!("dark")).unwrap();
        assert_eq!(mode, ColorMode::Dark);
    }

    #[test]
    fn no_port_to_listen_on_is_an_error() {
        let endpoints = Endpoints {
            listen: &["not an address"],
            ..GOOGLE
        };
        assert_eq!(
            sign_in(
                &FakePlatform::default(),
                &client(),
                &endpoints,
                TIMEOUT,
                None
            ),
            Err("Google sign-in couldn't listen for the browser.".to_string())
        );
    }

    #[test]
    fn a_browser_that_cannot_open_is_an_error() {
        let platform = FakePlatform::default();
        platform.fail("open_url");
        assert!(sign_in(&platform, &client(), &GOOGLE, TIMEOUT, None).is_err());
        assert_eq!(platform.recorded().windows_shown, 0);
        // An address that isn't one is never the answer
        assert_eq!(read_redirect("not a path", "s"), None);
    }
}
