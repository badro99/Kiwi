//! Synchronous port of bridge/server.js. Config mutations are serialized; printer
//! queues have independent locks so an offline printer cannot stall another one.
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    env, fs,
    io::{IsTerminal, Read, Write},
    net::{TcpStream, ToSocketAddrs},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
const VERSION: &str = env!("CARGO_PKG_VERSION");
const NAME: &str = "kiwi-printer-bridge";
const PAGE: &str = include_str!("local-page.html");
const WIN_RAW_PS: &str = include_str!("win-raw.ps1");
const ORIGINS: [&str; 4] = [
    "https://kiwi-maroc.pages.dev",
    "https://kiwi-os.com",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
];
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
fn ms(n: u64) -> Duration {
    Duration::from_millis(n)
}
fn string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        _ => v.to_string(),
    }
}
fn truth(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(_) => num(v) != 0.,
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn num(v: &Value) -> f64 {
    match v {
        Value::Null => 0.,
        Value::Bool(b) => {
            if *b {
                1.
            } else {
                0.
            }
        }
        Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                return 0.;
            }
            for (prefix, radix) in [
                ("0x", 16),
                ("0X", 16),
                ("0o", 8),
                ("0O", 8),
                ("0b", 2),
                ("0B", 2),
            ] {
                if let Some(n) = s.strip_prefix(prefix) {
                    return u64::from_str_radix(n, radix)
                        .map(|n| n as f64)
                        .unwrap_or(f64::NAN);
                }
            }
            s.parse().unwrap_or(f64::NAN)
        }
        Value::Array(a) if a.is_empty() => 0.,
        Value::Array(a) if a.len() == 1 => num(&json!(string(&a[0]))),
        _ => v.as_f64().unwrap_or(f64::NAN),
    }
}

fn port(v: &Value) -> f64 {
    let n = num(v);
    if n == 0. || n.is_nan() { 9100. } else { n }
}
fn plain_v4(h: &str) -> Option<std::net::Ipv4Addr> {
    let parts: Vec<&str> = h.split('.').collect();
    if parts.len() != 4
        || !parts.iter().all(|s| {
            !s.is_empty()
                && s.len() <= 3
                && s.bytes().all(|b| b.is_ascii_digit())
                && (s.len() == 1 || !s.starts_with('0'))
        })
    {
        return None;
    }
    h.parse().ok()
}

fn private_v4(ip: std::net::Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 10
        || o[0] == 127
        || (o[0] == 169 && o[1] == 254)
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        || (o[0] == 192 && o[1] == 168)
}

fn private_host(h: &str) -> bool {
    let h = h.trim().to_lowercase();
    // A plain private IPv4, or a .local/.lan name (checked again once resolved).
    // Octets are plain decimal only: Windows and glibc read "010" as octal.
    if let Some(ip) = plain_v4(&h) {
        return private_v4(ip);
    }
    let labels: Vec<_> = h.split('.').collect();
    labels.len() > 1
        && ["local", "lan"].contains(labels.last().unwrap())
        && labels[..labels.len() - 1].iter().all(|s| {
            !s.is_empty()
                && s.len() <= 63
                && s.as_bytes()[0].is_ascii_alphanumeric()
                && s.as_bytes()[s.len() - 1].is_ascii_alphanumeric()
                && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
}
fn clean(t: &Value) -> Option<Value> {
    if truth(&t["osPrinter"]) {
        let n: String = string(&t["osPrinter"])
            .chars()
            .filter(|c| *c > '\u{1f}')
            .collect::<String>()
            .trim()
            .chars()
            .take(120)
            .collect();
        return if n.is_empty() {
            None
        } else {
            Some(json!({"osPrinter":n}))
        };
    }
    let ip: String = string(&t["ip"]).trim().chars().take(253).collect();
    let p = port(&t["port"]);
    if !private_host(&ip) || !p.is_finite() || p.fract() != 0. || !(1. ..=65535.).contains(&p) {
        None
    } else {
        Some(json!({"ip":ip,"port":p as u16}))
    }
}
fn key(t: &Value) -> String {
    if let Some(n) = t["osPrinter"].as_str() {
        format!("os:{n}")
    } else {
        format!("tcp:{}:{}", string(&t["ip"]), t["port"])
    }
}
fn targets(c: &Value) -> Vec<Value> {
    let mut a: Vec<_> = c["allowedTargets"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(clean)
        .collect();
    if a.is_empty()
        && let Some(t) = clean(&c["warmPrinter"])
    {
        a.push(t);
    }
    a
}
fn allowed(c: &Value, t: &Value) -> bool {
    targets(c).iter().any(|s| key(s) == key(t))
}
fn local_host(host: &str, p: u16) -> bool {
    let h = host.strip_prefix('[').unwrap_or(host);
    let h = if let Some(prefix) = h.strip_suffix(']') {
        prefix
    } else if let Some((prefix, suffix)) = h.rsplit_once("]:") {
        if !suffix.is_empty() && suffix.bytes().all(|b| b.is_ascii_digit()) {
            prefix
        } else {
            h
        }
    } else {
        h
    };
    let hostname = h.split(':').next().unwrap_or("").to_lowercase();
    if hostname != "127.0.0.1" && hostname != "localhost" {
        return false;
    }
    match host
        .rsplit_once(':')
        .map(|(_, s)| s)
        .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
    {
        Some(s) => num(&json!(s)) == p as f64,
        None => true,
    }
}

fn local_origin(o: &str, h: &str) -> bool {
    let Ok(u) = url::Url::parse(o) else {
        return false;
    };
    u.scheme() == "http"
        && matches!(u.host_str(), Some("127.0.0.1" | "localhost"))
        && u.port().is_some_and(|p| (9110..=9114).contains(&p))
        && h.trim_start_matches('[')
            .split(']')
            .next()
            .unwrap_or("")
            .split(':')
            .next()
            == u.host_str()
}
fn trusted(o: &str, h: &str, referer: &str) -> bool {
    ORIGINS.contains(&o) || local_origin(o, h) || (o.is_empty() && local_origin(referer, h))
}
fn platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "macos") {
        "darwin"
    } else {
        "linux"
    }
}
fn random() -> String {
    let mut b = [0; 32];
    getrandom::fill(&mut b).expect("OS random unavailable");
    b.iter().map(|n| format!("{n:02x}")).collect()
}
fn valid_cap(s: &str) -> bool {
    s.len() == 68
        && s.starts_with("kbc_")
        && s[4..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
struct Config {
    path: PathBuf,
    lock: Mutex<()>,
}
impl Config {
    fn read(&self) -> Value {
        fs::read(&self.path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .filter(Value::is_object)
            .unwrap_or(json!({}))
    }
    fn write(&self, c: &Value) -> bool {
        (|| -> std::io::Result<()> {
            let dir = self
                .path
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(std::path::Path::new("."));
            let mut f = tempfile::NamedTempFile::new_in(dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                f.as_file()
                    .set_permissions(fs::Permissions::from_mode(0o600))?;
            }
            f.write_all(&serde_json::to_vec_pretty(c)?)?;
            f.as_file().sync_all()?;
            f.persist(&self.path).map_err(|e| e.error)?;
            Ok(())
        })()
        .is_ok()
    }
    fn edit(&self, f: impl FnOnce(&mut Value)) -> bool {
        let _g = self.lock.lock().unwrap();
        let mut c = self.read();
        f(&mut c);
        self.write(&c)
    }
    fn capability(&self) -> String {
        let _g = self.lock.lock().unwrap();
        let mut c = self.read();
        let s = string(&c["capability"]);
        if valid_cap(&s) {
            return s;
        }
        let s = format!("kbc_{}", random());
        c["capability"] = json!(s);
        if self.write(&c) { s } else { String::new() }
    }
}
struct Channel {
    socket: Option<TcpStream>,
    last: u64,
    real: u64,
    due: u64,
    misses: u32,
}
type Channels = Mutex<HashMap<String, Arc<Mutex<Channel>>>>;
#[derive(Default)]
struct Relay {
    online: bool,
    last_poll: u64,
    last_job: u64,
    error: String,
    printed: u64,
    failed: u64,
    unauthorized: u32,
}
struct App {
    cfg: Config,
    relay: Mutex<Relay>,
    channels: Channels,
    timing: Mutex<Value>,
    scan: AtomicBool,
    url: String,
    keep: u64,
    window: u64,
    persisted: Mutex<u64>,
    win_query: Mutex<Option<usize>>,
}
impl App {
    fn status(&self) -> Value {
        let c = self.cfg.read();
        let r = self.relay.lock().unwrap();
        json!({"ok":true,"paired":c["relay"]["token"].as_str().is_some_and(|s|!s.is_empty()),"merchant":c["relay"]["merchant"].as_str().unwrap_or(""),"name":c["relay"]["name"].as_str().unwrap_or(""),"bridgeId":c["relay"]["bridgeId"].as_str().unwrap_or(""),"url":self.url,"online":r.online,"lastPollTs":r.last_poll,"lastJobTs":r.last_job,"lastError":r.error,"printed":r.printed,"failed":r.failed,"version":VERSION,"lastTiming":*self.timing.lock().unwrap()})
    }
    fn channel(&self, t: &Value) -> Arc<Mutex<Channel>> {
        self.channels
            .lock()
            .unwrap()
            .entry(key(t))
            .or_insert_with(|| {
                Arc::new(Mutex::new(Channel {
                    socket: None,
                    last: 0,
                    real: 0,
                    due: 0,
                    misses: 0,
                }))
            })
            .clone()
    }
    fn open(&self, t: &Value, c: &mut Channel) -> Result<(bool, u64), String> {
        if let Some(socket) = c.socket.as_mut() {
            // Node drains status bytes and observes close/error even while idle.
            // Drain without blocking before reusing a connection.
            let _ = socket.set_nonblocking(true);
            let mut b = [0; 256];
            let alive = loop {
                match socket.read(&mut b) {
                    Ok(0) => break false,
                    Ok(_) => continue,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break true,
                    Err(_) => break false,
                }
            };
            let _ = socket.set_nonblocking(false);
            if alive {
                return Ok((true, 0));
            }
            c.socket = None;
        }
        let start = now();
        let addr = (string(&t["ip"]), t["port"].as_u64().unwrap_or(9100) as u16)
            .to_socket_addrs()
            .map_err(|e| e.to_string())?
            .find(|a| matches!(a.ip(), std::net::IpAddr::V4(v4) if private_v4(v4)))
            .ok_or("printer address is not on the local network")?;
        let s = TcpStream::connect_timeout(&addr, ms(8000))
            .map_err(|e| tcp_error(e, &addr.to_string()))?;
        let _ = s.set_write_timeout(Some(ms(8000)));
        let _ = socket2::SockRef::from(&s)
            .set_tcp_keepalive(&socket2::TcpKeepalive::new().with_time(ms(self.keep)));
        c.socket = Some(s);
        Ok((false, now() - start))
    }
    fn warm(&self, t: &Value) -> bool {
        let ch = self.channel(t);
        let mut c = ch.lock().unwrap();
        if self.open(t, &mut c).is_err() {
            return false;
        }
        let s = c.socket.as_mut().unwrap();
        let _ = s.set_read_timeout(Some(ms(2500)));
        let mut b = [0; 256];
        let alive = s.write_all(&[0x10, 0x04, 0x01]).is_ok() && s.read(&mut b).is_ok_and(|n| n > 0);
        if alive {
            c.last = now();
            true
        } else {
            c.socket = None;
            self.open(t, &mut c).is_ok()
        }
    }
    fn tcp(&self, t: &Value, b: &[u8]) -> Result<usize, String> {
        let ch = self.channel(t);
        let mut c = ch.lock().unwrap();
        let (reused, connect) = self.open(t, &mut c)?;
        let start = now();
        if let Err(e) = c.socket.as_mut().unwrap().write_all(b) {
            c.socket = None;
            return Err(tcp_error(e, &format!("{}:{}", string(&t["ip"]), t["port"])));
        }
        let at = now();
        let write = at - start;
        *self.timing.lock().unwrap() = json!({"connectMs":connect,"writeMs":write,"reused":reused,"idleMs":if c.last>0{at-c.last}else{0},"totalMs":connect+write,"target":format!("{}:{}",string(&t["ip"]),t["port"]),"at":at});
        c.last = at;
        c.real = at;
        c.misses = 0;
        c.due = at + self.keep;
        drop(c);
        let mut persisted = self.persisted.lock().unwrap();
        if at.saturating_sub(*persisted) >= 300000 {
            let saved = self.cfg.read()["warmPrinter"].clone();
            if !(saved["ip"] == t["ip"]
                && saved["port"] == t["port"]
                && at.saturating_sub(saved["at"].as_u64().unwrap_or(0)) < 300000)
                && self.cfg.edit(|cfg| {
                    cfg["warmPrinter"] = t.clone();
                    cfg["warmPrinter"]["at"] = json!(at);
                })
            {
                *persisted = at;
            }
        }
        Ok(b.len())
    }
    fn http(
        &self,
        method: &str,
        path: &str,
        token: &str,
        body: Option<Value>,
        timeout: u64,
    ) -> (u16, Value, String) {
        let agent = ureq::AgentBuilder::new()
            .timeout(ms(timeout))
            .redirects(0)
            .build();
        let mut req = agent
            .request(method, &format!("{}{}", self.url, path))
            .set("Accept", "application/json")
            .set("User-Agent", &format!("{NAME}/{VERSION}"));
        if !token.is_empty() {
            req = req.set("Authorization", &format!("Bearer {token}"));
        }
        let result = if let Some(b) = body {
            req.send_json(b)
        } else {
            req.call()
        };
        match result {
            Ok(r) | Err(ureq::Error::Status(_, r)) => {
                let status = r.status();
                (status, r.into_json().unwrap_or(Value::Null), String::new())
            }
            Err(ureq::Error::Transport(e)) => {
                use std::error::Error;
                let u = url::Url::parse(&self.url).ok();
                let host = u.as_ref().and_then(|u| u.host_str()).unwrap_or("");
                let port = u
                    .as_ref()
                    .and_then(|u| u.port_or_known_default())
                    .unwrap_or(80);
                let mut message = match e.kind() {
                    ureq::ErrorKind::InvalidUrl => "bad-url".to_string(),
                    ureq::ErrorKind::Dns => format!("getaddrinfo ENOTFOUND {host}"),
                    _ => e.message().unwrap_or("erreur-serveur").to_string(),
                };
                let mut source = e.source();
                while let Some(cause) = source {
                    if let Some(io) = cause.downcast_ref::<std::io::Error>() {
                        message = match io.kind() {
                            std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => {
                                "timeout".into()
                            }
                            std::io::ErrorKind::ConnectionRefused => {
                                format!("connect ECONNREFUSED {host}:{port}")
                            }
                            std::io::ErrorKind::ConnectionReset
                            | std::io::ErrorKind::UnexpectedEof => "socket hang up".into(),
                            _ => io.to_string(),
                        };
                    }
                    source = cause.source();
                }
                (0, Value::Null, message)
            }
        }
    }
    fn pair(&self, code: &Value, name: &Value) -> Value {
        let code: String = string(code)
            .chars()
            .filter(char::is_ascii_digit)
            .take(6)
            .collect();
        if code.len() != 6 {
            return err("code-invalide");
        }
        let name = if string(name).is_empty() {
            env::var("COMPUTERNAME")
                .or_else(|_| env::var("HOSTNAME"))
                .unwrap_or_else(|_| run(&mut Command::new("hostname")).1.trim().to_string())
        } else {
            string(name)
        };
        let (st,j,_)=self.http("POST","/api/print/bridges","",Some(json!({"action":"redeem","code":code,"name":name,"platform":platform(),"version":VERSION})),12000);
        if st == 200 && j["ok"] == true && j["token"].as_str().is_some_and(|s| !s.is_empty()) {
            if self.cfg.edit(|c|c["relay"]=json!({"token":j["token"],"merchant":j["merchant"],"name":j["name"],"bridgeId":j["bridgeId"],"at":now()})){json!({"ok":true,"merchant":j["merchant"]})}else{err("ecriture-config-impossible")}
        } else {
            err(j["error"].as_str().unwrap_or("erreur-serveur"))
        }
    }
    fn unpair(&self) {
        self.cfg.edit(|c| {
            c.as_object_mut().unwrap().remove("relay");
        });
        self.relay.lock().unwrap().online = false;
    }
    fn relay_edit(&self, token: &str, f: impl FnOnce(&mut Value)) -> bool {
        let mut matched = false;
        let written = self.cfg.edit(|c| {
            if c["relay"]["token"] == token {
                matched = true;
                f(&mut c["relay"]);
            }
        });
        written && matched
    }
    fn flush(&self, token: &str) {
        let a = self.cfg.read()["relay"]["pendingAcks"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        for ack in a {
            if self
                .http("POST", "/api/print/jobs", token, Some(ack.clone()), 12000)
                .0
                == 200
            {
                self.relay_edit(token, |r| {
                    for k in ["pendingAcks", "inFlight"] {
                        let a = r[k]
                            .as_array()
                            .cloned()
                            .unwrap_or_default()
                            .into_iter()
                            .filter(|x| x["id"] != ack["id"])
                            .collect::<Vec<_>>();
                        r[k] = json!(a);
                    }
                });
            }
        }
    }
    fn print_job(self: &Arc<Self>, j: &Value) -> Result<usize, String> {
        let t = clean(&j["target"]).ok_or("printer-target-not-local")?;
        if j["kind"] == "wake" {
            if t["ip"].is_null() || !allowed(&self.cfg.read(), &t) {
                return Err("printer-target-not-saved".into());
            }
            let a = self.clone();
            thread::spawn(move || a.warm(&t));
            return Ok(0);
        }
        let b = decode(&string(&j["dataB64"]));
        if b.is_empty() {
            return Err("ticket vide".into());
        }
        if !allowed(&self.cfg.read(), &t) {
            return Err("printer-target-not-saved".into());
        }
        self.print(&t, &b)
    }
    fn print(&self, t: &Value, b: &[u8]) -> Result<usize, String> {
        if let Some(n) = t["osPrinter"].as_str() {
            self.os_print(n, b)
        } else {
            self.tcp(t, b)
        }
    }
}
fn err(s: &str) -> Value {
    json!({"ok":false,"error":s})
}
fn tcp_error(e: std::io::Error, addr: &str) -> String {
    match e.kind() {
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock => "printer timeout".into(),
        std::io::ErrorKind::ConnectionRefused => {
            format!("connect ECONNREFUSED {}", addr)
        }
        _ => e.to_string(),
    }
}
// Node's Buffer.from(base64) ignores non-alphabet characters and accepts missing padding.
fn decode(s: &str) -> Vec<u8> {
    let mut out = Vec::new();
    let mut bits = 0u32;
    let mut count = 0;
    for b in s.bytes() {
        let n = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            _ => continue,
        };
        bits = (bits << 6) | n as u32;
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8)
        }
    }
    out
}
// Drain pipes concurrently and enforce the same 15-second child deadline, without a shell.
fn run(cmd: &mut Command) -> (bool, String, String) {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    run_input(cmd, None)
}
fn run_input(cmd: &mut Command, input: Option<&str>) -> (bool, String, String) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return (false, String::new(), e.to_string()),
    };
    let out = child.stdout.take();
    let stderr = child.stderr.take();
    let reader = |p: Option<std::process::ChildStdout>| {
        thread::spawn(move || {
            let mut b = String::new();
            if let Some(mut p) = p {
                let _ = p.read_to_string(&mut b);
            }
            b
        })
    };
    let a = reader(out);
    let b = thread::spawn(move || {
        let mut s = String::new();
        if let Some(mut p) = stderr {
            let _ = p.read_to_string(&mut s);
        }
        s
    });
    if let Some(input) = input
        && let Some(mut p) = child.stdin.take()
    {
        let _ = p.write_all(input.as_bytes());
    }
    let start = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(s)) => break s.success(),
            Err(_) => break false,
            _ => {
                if start.elapsed() > ms(15000) {
                    let _ = child.kill();
                    let _ = child.wait();
                    break false;
                }
                thread::sleep(ms(10));
            }
        }
    };
    (
        success,
        a.join().unwrap_or_default(),
        b.join().unwrap_or_default(),
    )
}
fn ps(script: &str) -> (bool, String, String) {
    run(Command::new("powershell").args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]))
}
impl App {
    fn printers(&self) -> Vec<String> {
        if cfg!(windows) {
            let attempts = [
                "Get-Printer | ForEach-Object { $_.Name }",
                "Get-CimInstance -ClassName Win32_Printer | ForEach-Object { $_.Name }",
                "Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }",
            ];
            let mut memo = self.win_query.lock().unwrap();
            let mut order = vec![0, 1, 2];
            if let Some(i) = *memo {
                order.retain(|x| *x != i);
                order.insert(0, i)
            }
            for i in order {
                let names: Vec<_> = ps(attempts[i])
                    .1
                    .lines()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect();
                if !names.is_empty() {
                    *memo = Some(i);
                    return names;
                }
            }
            *memo = None;
            vec![]
        } else {
            run(Command::new("lpstat").arg("-p"))
                .1
                .lines()
                .filter_map(|s| {
                    let mut p = s.split_whitespace();
                    if p.next() == Some("printer") {
                        p.next().map(str::to_string)
                    } else {
                        None
                    }
                })
                .collect()
        }
    }
    fn default_printer(&self) -> String {
        if cfg!(windows) {
            for s in [
                "(Get-CimInstance -ClassName Win32_Printer -Filter \"Default=True\").Name",
                "(Get-WmiObject -Class Win32_Printer -Filter \"Default=True\").Name",
            ] {
                if let Some(n) = ps(s).1.lines().map(str::trim).find(|s| !s.is_empty()) {
                    return n.into();
                }
            }
            String::new()
        } else {
            run(Command::new("lpstat").arg("-d"))
                .1
                .split_once(':')
                .and_then(|(_, s)| s.split_whitespace().next())
                .unwrap_or("")
                .into()
        }
    }
    fn os_print(&self, n: &str, b: &[u8]) -> Result<usize, String> {
        let installed = self.printers();
        if installed.is_empty() {
            return Err("aucune imprimante installée sur cet ordinateur".into());
        }
        if !installed.iter().any(|s| s == n) {
            return Err(format!(
                "imprimante « {n} » introuvable · installées : {}",
                installed.join(", ")
            ));
        }
        let stamp = format!("kiwi-{}-{}.bin", now(), &random()[..6]);
        let mut file = None;
        for dir in [
            env::temp_dir(),
            env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default(),
            env::current_dir().unwrap_or_default(),
        ] {
            if dir.to_string_lossy().starts_with("undefined") {
                continue;
            }
            let p = dir.join(&stamp);
            if fs::write(&p, b).is_ok() {
                file = Some(p);
                break;
            }
        }
        let file = file
            .ok_or("impossible d'écrire le ticket dans un dossier temporaire sur cet ordinateur")?;
        let result = if cfg!(windows) {
            let mut cmd = Command::new("powershell");
            cmd.args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "-",
            ])
            .env("KIWI_PRINTER", n)
            .env("KIWI_DATA", &file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
            let (ok, out, e) = run_input(&mut cmd, Some(WIN_RAW_PS));
            if ok {
                Ok(out
                    .split("KIWI_WROTE=")
                    .nth(1)
                    .and_then(|s| s.lines().next())
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0))
            } else {
                Err(e.trim().lines().next().unwrap_or(out.trim()).to_string())
            }
        } else {
            let (ok, _, e) = run(Command::new("lp").args(["-d", n, "-o", "raw"]).arg(&file));
            if ok {
                Ok(b.len())
            } else {
                Err(e.trim().lines().next().unwrap_or("").into())
            }
        };
        let _ = fs::remove_file(file);
        result
    }
}
fn scan_hosts(addresses: &[String]) -> Vec<String> {
    let mut bases = Vec::new();
    for ip in addresses {
        let p: Vec<_> = ip.split('.').collect();
        if p.len() != 4 {
            continue;
        }
        let a = p[0].parse::<u8>().unwrap_or(0);
        let b = p[1].parse::<u8>().unwrap_or(0);
        if a == 10 || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168) {
            let base = p[..3].join(".");
            if !bases.contains(&base) {
                bases.push(base)
            }
        }
    }
    let mut hosts = Vec::new();
    for base in bases {
        for h in 1..=254 {
            let ip = format!("{base}.{h}");
            if hosts.len() < 1024 && !addresses.contains(&ip) {
                hosts.push(ip)
            }
        }
    }
    hosts
}
fn scan() -> Value {
    let at = now();
    let addresses = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|a| !a.is_loopback())
        .filter_map(|a| match a.ip() {
            std::net::IpAddr::V4(ip) => Some(ip.to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let hosts = scan_hosts(&addresses);
    let index = std::sync::atomic::AtomicUsize::new(0);
    let found = Mutex::new(Vec::new());
    thread::scope(|s| {
        for _ in 0..48.min(hosts.len()) {
            let hosts = &hosts;
            let index = &index;
            let found = &found;
            s.spawn(move || {
                loop {
                    let i = index.fetch_add(1, Ordering::Relaxed);
                    let Some(ip) = hosts.get(i) else { break };
                    if TcpStream::connect_timeout(&format!("{ip}:9100").parse().unwrap(), ms(450))
                        .is_ok()
                    {
                        found.lock().unwrap().push(ip.clone());
                    }
                }
            });
        }
    });
    let mut found = found.into_inner().unwrap();
    found.sort_by_key(|s| s.parse::<std::net::Ipv4Addr>().unwrap());
    json!({"ok":true,"printers":found.iter().map(|ip|json!({"ip":ip,"port":9100})).collect::<Vec<_>>(),"scanned":hosts.len(),"ms":now()-at})
}
fn relay_loop(a: Arc<App>) {
    let mut backoff = 1000;
    loop {
        let c = a.cfg.read();
        let token = string(&c["relay"]["token"]);
        if token.is_empty() {
            thread::sleep(ms(10));
            continue;
        }
        let (status, j, error) = a.http("GET", "/api/print/jobs", &token, None, 3000);
        if a.cfg.read()["relay"]["token"] != token {
            continue;
        }
        let mut next = 1000;
        {
            let mut r = a.relay.lock().unwrap();
            r.last_poll = now();
            if status == 401 {
                r.unauthorized += 1;
                r.online = false;
                r.error = "jeton refusé par kiwi-os.com".into();
                if r.unauthorized >= 3 {
                    r.error = "jeton révoqué · ré-appairez ce pont depuis Kiwi".into();
                    drop(r);
                    a.unpair();
                    continue;
                }
                drop(r);
                thread::sleep(ms(2000));
                continue;
            }
            r.unauthorized = 0;
            if status != 200 || j["ok"] != true {
                r.online = false;
                r.error = j["error"].as_str().map(str::to_string).unwrap_or_else(|| {
                    if error.is_empty() {
                        format!("http-{status}")
                    } else {
                        error
                    }
                });
                backoff = ((backoff as f64 * 1.8).round() as u64).min(3000);
                next = backoff;
            } else {
                r.online = true;
                r.error.clear();
                backoff = 1000;
            }
        }
        if status == 200 && j["ok"] == true {
            a.flush(&token);
            for job in j["jobs"].as_array().into_iter().flatten() {
                if !a.relay_edit(&token, |r| {
                    let mut flights = r["inFlight"].as_array().cloned().unwrap_or_default();
                    flights.retain(|x| x["id"] != job["id"]);
                    flights.push(json!({"id":string(&job["id"]),"at":now()}));
                    let len = flights.len();
                    r["inFlight"] = json!(&flights[len.saturating_sub(16)..]);
                }) {
                    a.relay.lock().unwrap().error =
                        "impossible de persister l’état du ticket · impression suspendue".into();
                    break;
                }
                let mut ack = match a.print_job(job) {
                    Ok(bytes) => {
                        let mut r = a.relay.lock().unwrap();
                        r.printed += 1;
                        r.last_job = now();
                        json!({"action":"ack","id":job["id"],"ok":true,"outcome":"printed","bytes":bytes})
                    }
                    Err(e) => {
                        let mut r = a.relay.lock().unwrap();
                        r.failed += 1;
                        r.error = e.clone();
                        json!({"action":"ack","id":job["id"],"ok":false,"outcome":"failed","error":e.chars().take(300).collect::<String>()})
                    }
                };
                let timing = a.timing.lock().unwrap().clone();
                if !timing.is_null() {
                    ack["timing"] = timing
                }
                if !a.relay_edit(&token, |r| {
                    let mut pending = r["pendingAcks"].as_array().cloned().unwrap_or_default();
                    pending.retain(|x| x["id"] != ack["id"]);
                    pending.push(ack);
                    let len = pending.len();
                    r["pendingAcks"] = json!(&pending[len.saturating_sub(32)..]);
                }) {
                    a.relay.lock().unwrap().error="impossible de persister l’acquittement · ticket conservé en état incertain".into();
                    break;
                }
                a.flush(&token);
            }
            let poll = num(&j["poll"]);
            if poll > 0. {
                next = poll.clamp(200., 5000.) as u64;
            }
        }
        thread::sleep(ms(next));
    }
}
fn warm_loop(a: Arc<App>) {
    let saved = a.cfg.read()["warmPrinter"].clone();
    let at = saved["at"].as_u64().unwrap_or(0);
    if at > 0 && now().saturating_sub(at) <= a.window && !saved["ip"].is_null() {
        let t = json!({"ip":saved["ip"],"port":port(&saved["port"]) as u16});
        {
            let ch = a.channel(&t);
            let mut c = ch.lock().unwrap();
            c.real = at;
            c.due = now() + a.keep;
        }
        a.warm(&t);
    }
    loop {
        thread::sleep(ms(50));
        let channels = a
            .channels
            .lock()
            .unwrap()
            .iter()
            .map(|(k, c)| (k.clone(), c.clone()))
            .collect::<Vec<_>>();
        for (k, ch) in channels {
            let due = {
                let mut c = ch.lock().unwrap();
                if c.real == 0 || now().saturating_sub(c.real) > a.window {
                    c.due = 0;
                    false
                } else {
                    c.due > 0 && now() >= c.due
                }
            };
            if due {
                let Some((ip, p)) = k.strip_prefix("tcp:").and_then(|s| s.rsplit_once(':')) else {
                    continue;
                };
                let t = json!({"ip":ip,"port":p.parse::<u16>().unwrap_or(9100)});
                let app = a.clone();
                {
                    ch.lock().unwrap().due = 0;
                }
                thread::spawn(move || {
                    let alive = app.warm(&t);
                    let mut c = ch.lock().unwrap();
                    c.misses = if alive { 0 } else { c.misses.saturating_add(1) };
                    c.due = now()
                        + app
                            .keep
                            .saturating_mul(2u64.saturating_pow(c.misses))
                            .min(300000);
                });
            }
        }
    }
}
fn header(req: &tiny_http::Request, name: &str) -> String {
    req.headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default()
}
fn reply(req: tiny_http::Request, status: u16, body: Vec<u8>, origin: &str, html: bool) {
    let mut res = tiny_http::Response::from_data(body).with_status_code(status);
    let mut headers = vec![
        (
            "Content-Type",
            if html {
                "text/html; charset=utf-8"
            } else {
                "application/json"
            },
        ),
        ("Cache-Control", "no-store"),
    ];
    if !html && (ORIGINS.contains(&origin) || local_origin(origin, "127.0.0.1:9110")) {
        headers.extend([
            ("Access-Control-Allow-Origin", origin),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            (
                "Access-Control-Allow-Headers",
                "Content-Type, X-Kiwi-Bridge-Capability",
            ),
            ("Access-Control-Allow-Private-Network", "true"),
            ("Vary", "Origin"),
        ]);
    }
    for (k, v) in headers {
        res.add_header(tiny_http::Header::from_bytes(k, v).unwrap());
    }
    let _ = req.respond(res);
}
fn handle(a: Arc<App>, mut req: tiny_http::Request, p: u16) {
    let origin = header(&req, "origin");
    let host = header(&req, "host");
    let method = req.method().as_str().to_string();
    let path = req.url().split('?').next().unwrap_or("").to_string();
    let send =
        |req, status, v: Value| reply(req, status, serde_json::to_vec(&v).unwrap(), &origin, false);
    if !local_host(&host, p) {
        send(req, 400, err("invalid-host"));
        return;
    }
    let trust = trusted(&origin, &host, &header(&req, "referer"));
    if !origin.is_empty() && !trust {
        send(req, 403, err("origin-not-allowed"));
        return;
    }
    if method == "OPTIONS" {
        if trust {
            reply(req, 204, vec![], &origin, false)
        } else {
            send(req, 403, err("origin-not-allowed"))
        }
        return;
    }
    if method == "GET" && path == "/kiwi/ping" {
        let r = a.status();
        send(
            req,
            200,
            json!({"ok":true,"name":NAME,"version":VERSION,"capabilityRequired":true,"capability":if trust{a.cfg.capability()}else{String::new()},"lastTiming":*a.timing.lock().unwrap(),"relay":{"paired":r["paired"],"online":r["online"],"merchant":r["merchant"],"name":r["name"],"bridgeId":r["bridgeId"]}}),
        );
        return;
    }
    if method == "GET" && (path == "/" || path == "/index.html") {
        reply(req, 200, PAGE.as_bytes().to_vec(), &origin, true);
        return;
    }
    let protected = path == "/kiwi/relay"
        || path.starts_with("/kiwi/relay/")
        || [
            "/kiwi/printers",
            "/kiwi/scan",
            "/kiwi/print",
            "/kiwi/wake",
            "/kiwi/targets",
        ]
        .contains(&path.as_str());
    if protected {
        let cap = header(&req, "x-kiwi-bridge-capability").trim().to_string();
        let expected = a.cfg.capability();
        if expected.is_empty() || !valid_cap(&cap) || cap != expected {
            send(req, 401, err("bridge-capability-required"));
            return;
        }
    }
    if method == "GET" {
        match path.as_str() {
            "/kiwi/relay" => send(req, 200, a.status()),
            "/kiwi/printers" => send(
                req,
                200,
                json!({"ok":true,"platform":platform(),"printers":a.printers(),"default":a.default_printer()}),
            ),
            "/kiwi/scan" => {
                if a.scan.swap(true, Ordering::SeqCst) {
                    send(req, 429, err("scan-busy"));
                    return;
                }
                let result = scan();
                a.scan.store(false, Ordering::SeqCst);
                send(req, 200, result)
            }
            _ => send(req, 404, err("not-found")),
        }
        return;
    }
    if method != "POST" {
        send(req, 404, err("not-found"));
        return;
    }
    if path == "/kiwi/relay/unpair" {
        a.unpair();
        send(req, 200, json!({"ok":true}));
        return;
    }
    if ![
        "/kiwi/targets",
        "/kiwi/relay/pair",
        "/kiwi/print",
        "/kiwi/wake",
    ]
    .contains(&path.as_str())
    {
        send(req, 404, err("not-found"));
        return;
    }
    let mut body = Vec::new();
    if req
        .as_reader()
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut body)
        .is_err()
        || body.len() > 2 * 1024 * 1024
    {
        // Taking the raw writer suppresses tiny_http's automatic 500 response.
        // The Node bridge destroys the request on a body-limit violation.
        drop(req.into_writer());
        return;
    }
    let parsed = if body.is_empty() {
        Ok(json!({}))
    } else {
        serde_json::from_slice::<Value>(&body)
    };
    let Ok(b) = parsed else {
        send(req, 400, err("bad-json"));
        return;
    };
    match path.as_str() {
        "/kiwi/relay/pair" => {
            let r = a.pair(&b["code"], &b["name"]);
            send(req, if r["ok"] == true { 200 } else { 422 }, r)
        }
        "/kiwi/targets" => {
            let action = string(&b["action"]);
            if !action.is_empty() && action != "save" {
                send(req, 400, err("unknown-action"));
                return;
            }
            let Some(t) = clean(&b["target"]) else {
                send(req, 422, err("printer-target-not-local"));
                return;
            };
            let ok = a.cfg.edit(|c| {
                let mut ts: Vec<_> = c["allowedTargets"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(clean)
                    .collect();
                if !ts.iter().any(|x| key(x) == key(&t)) {
                    ts.push(t.clone())
                }
                let len = ts.len();
                c["allowedTargets"] = json!(&ts[len.saturating_sub(32)..]);
            });
            if ok {
                send(req, 200, json!({"ok":true,"target":t}))
            } else {
                send(req, 422, err("bridge-config-unwritable"))
            }
        }
        _ => {
            let ip = string(&b["printerIp"]).trim().to_string();
            let name = if path == "/kiwi/wake" {
                String::new()
            } else {
                string(&b["printerName"]).trim().to_string()
            };
            if ip.is_empty() && name.is_empty() {
                send(
                    req,
                    400,
                    err(if path == "/kiwi/wake" {
                        "printer-ip-required"
                    } else {
                        "printer-ip-or-name-required"
                    }),
                );
                return;
            }
            let data = string(&b["dataB64"]);
            if path == "/kiwi/print" && data.is_empty() {
                send(req, 400, err("data-required"));
                return;
            }
            let t = if name.is_empty() {
                json!({"ip":ip,"port":port(&b["port"])})
            } else {
                json!({"osPrinter":name})
            };
            let Some(t) = clean(&t) else {
                send(req, 422, err("printer-target-not-local"));
                return;
            };
            if !allowed(&a.cfg.read(), &t) {
                send(req, 409, err("printer-target-not-saved"));
                return;
            }
            if path == "/kiwi/wake" {
                let app = a.clone();
                thread::spawn(move || app.warm(&t));
                send(
                    req,
                    200,
                    json!({"ok":true,"warm":true,"waking":true,"timing":*a.timing.lock().unwrap()}),
                );
                return;
            }
            match a.print(&t, &decode(&data)) {
                Ok(bytes) => send(
                    req,
                    200,
                    json!({"ok":true,"bytes":bytes,"via":if name.is_empty(){"tcp"}else{"os"},"timing":*a.timing.lock().unwrap()}),
                ),
                Err(e) => send(req, 502, err(&e)),
            }
        }
    }
}
fn hold_open() -> ! {
    if std::io::stdin().is_terminal() {
        eprintln!("\nAppuyez sur une touche pour fermer cette fenêtre…");
        let _ = std::io::stdin().read(&mut [0]);
    }
    std::process::exit(1)
}
fn main() {
    let args: Vec<_> = env::args().collect();
    if args.iter().any(|s| s == "--version") {
        println!("{VERSION}");
        return;
    }
    let path = env::var_os("KIWI_BRIDGE_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .map(PathBuf::from)
                .unwrap_or_else(|| env::current_dir().unwrap())
                .join(".kiwi-printer-bridge.json")
        });
    let cfg = Config {
        path,
        lock: Mutex::new(()),
    };
    let c = cfg.read();
    let setting = |env_name: &str, key: &str, default: u64| {
        [
            env::var(env_name)
                .ok()
                .map(|s| num(&json!(s)))
                .unwrap_or(0.),
            num(&c[key]),
            default as f64,
        ]
        .into_iter()
        .find(|n| n.is_finite() && *n != 0.)
        .unwrap_or(default as f64)
        .max(1.) as u64
    };
    let a = Arc::new(App {
        keep: setting("KIWI_PRINTER_KEEPALIVE_MS", "printerKeepaliveMs", 10000),
        window: setting(
            "KIWI_PRINTER_WARM_WINDOW_MS",
            "printerWarmWindowMs",
            7 * 24 * 60 * 60 * 1000,
        ),
        cfg,
        relay: Mutex::new(Relay::default()),
        channels: Mutex::new(HashMap::new()),
        timing: Mutex::new(Value::Null),
        scan: AtomicBool::new(false),
        url: env::var("KIWI_RELAY_URL")
            .unwrap_or("https://kiwi-os.com".into())
            .trim_end_matches('/')
            .into(),
        persisted: Mutex::new(0),
        win_query: Mutex::new(None),
    });
    if args.iter().any(|s| s == "--unpair") {
        a.unpair()
    }
    let code = args
        .iter()
        .position(|s| s == "--pair")
        .and_then(|i| args.get(i + 1).cloned())
        .or_else(|| env::var("KIWI_RELAY_CODE").ok());
    if let Some(code) = code {
        let app = a.clone();
        thread::spawn(move || {
            let result = app.pair(&json!(code), &Value::Null);
            if result["ok"] != true {
                eprintln!("[relais] appairage refusé : {}", string(&result["error"]));
            }
        });
    }
    let candidates = if env::var("KIWI_BRIDGE_PORT").is_ok_and(|s| !s.is_empty()) {
        vec![
            env::var("KIWI_BRIDGE_PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .filter(|p| *p > 0)
                .unwrap_or(9110),
        ]
    } else {
        vec![9110, 9111, 9112, 9113, 9114]
    };
    let mut server = None;
    for (i, p) in candidates.iter().enumerate() {
        match tiny_http::Server::http(("127.0.0.1", *p)) {
            Ok(s) => {
                server = Some((s, *p));
                break;
            }
            Err(e) => {
                if i + 1 < candidates.len()
                    && e.downcast_ref::<std::io::Error>()
                        .is_some_and(|e| e.kind() == std::io::ErrorKind::AddrInUse)
                {
                    println!("Port {p} occupé, essai sur {}…", candidates[i + 1]);
                } else {
                    eprintln!("Le pont n'a pas pu démarrer : {e}");
                    hold_open()
                }
            }
        }
    }
    let (server, p) = server.unwrap();
    println!("{NAME} v{VERSION} listening on http://127.0.0.1:{p}");
    println!(
        "Laissez cette fenêtre ouverte. Elle relaie les impressions Kiwi vers votre imprimante."
    );
    println!("Page du pont : http://127.0.0.1:{p}/");
    let token = string(&a.cfg.read()["relay"]["token"]);
    if !token.is_empty() {
        a.relay_edit(&token,|r|{let mut pending=r["pendingAcks"].as_array().cloned().unwrap_or_default();for flight in r["inFlight"].as_array().into_iter().flatten(){if !flight["id"].is_null()&&!pending.iter().any(|ack|ack["id"]==flight["id"]){pending.push(json!({"action":"ack","id":flight["id"],"ok":false,"outcome":"uncertain","error":"output-unknown-after-bridge-restart"}));}}let len=pending.len();r["pendingAcks"]=json!(&pending[len.saturating_sub(32)..]);r["inFlight"]=json!([]);});
    }
    let app = a.clone();
    thread::spawn(move || relay_loop(app));
    let app = a.clone();
    thread::spawn(move || warm_loop(app));
    for req in server.incoming_requests() {
        let app = a.clone();
        thread::spawn(move || handle(app, req, p));
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins() {
        assert!(trusted("https://kiwi-os.com", "127.0.0.1:9110", ""));
        assert!(local_origin("http://localhost:9114/path", "localhost:9112"));
        assert!(!local_origin("http://localhost:9115", "localhost:9115"));
        assert!(!trusted("https://evil.example", "127.0.0.1:9110", ""));
        assert!(!trusted("", "127.0.0.1:9110", ""));
        assert!(trusted("", "127.0.0.1:9110", "http://127.0.0.1:9110/"));
    }
    #[test]
    fn hosts() {
        assert!(local_host("LOCALHOST:9110", 9110));
        assert!(!local_host("localhost:9111", 9110));
        assert!(!local_host("evil.example:9110", 9110));
        assert!(!local_host("[::1]:9110", 9110));
        assert!(!local_host("127.0.0.1]evil", 9110));
        assert!(!local_host("[127.0.0.1]:9111", 9110));
    }
    #[test]
    fn private() {
        for h in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.1.1",
            "172.31.0.1",
            "192.168.1.1",
            "printer.local",
            "a.b.lan",
        ] {
            assert!(private_host(h), "{h}")
        }
        for h in [
            "8.8.8.8",
            "172.32.0.1",
            "printer.com",
            "localhost",
            "bad-.local",
            "010.0.0.1",
            "0x0a.0.0.1",
            "10.0.0.1e0",
            "1e1.0.0.1",
            "10.0.0.01",
            "10.0.0.+1",
            "256.1.1.1",
        ] {
            assert!(!private_host(h), "{h}")
        }
    }
    #[test]
    fn cleaning() {
        assert_eq!(
            clean(&json!({"osPrinter":" \u{0}Queue\n "})),
            Some(json!({"osPrinter":"Queue"}))
        );
        assert_eq!(
            clean(&json!({"ip":"127.0.0.1","port":0})),
            Some(json!({"ip":"127.0.0.1","port":9100}))
        );
        assert!(clean(&json!({"ip":"127.0.0.1","port":1.2})).is_none());
        assert!(clean(&json!({"ip":"8.8.8.8"})).is_none());
    }
    #[test]
    fn config_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let c = Config {
            path: dir.path().join("cfg"),
            lock: Mutex::new(()),
        };
        let v = json!({"unknown":{"retained":true},"warmPrinter":{"ip":"127.0.0.1","port":9100}});
        assert!(c.write(&v));
        let cap = c.capability();
        assert!(valid_cap(&cap));
        assert_eq!(c.capability(), cap);
        assert_eq!(c.read()["unknown"], v["unknown"]);
        assert!(allowed(&c.read(), &v["warmPrinter"]));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&c.path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn scan_list() {
        let hosts = scan_hosts(&[
            "192.168.1.20".into(),
            "192.168.1.30".into(),
            "127.0.0.1".into(),
            "8.8.8.8".into(),
        ]);
        assert_eq!(hosts.len(), 252);
        assert!(!hosts.contains(&"192.168.1.20".into()));
        assert_eq!(hosts[0], "192.168.1.1");
        assert_eq!(
            scan_hosts(&(0..6).map(|n| format!("10.0.{n}.1")).collect::<Vec<_>>()).len(),
            1024
        );
    }
    #[test]
    fn base64() {
        assert_eq!(decode("S0lX\nSQ"), b"KIWI");
        assert_eq!(decode("!"), b"");
    }
}
