use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};
#[cfg(windows)]
use std::os::windows::process::CommandExt;

// ---------------------------------------------------------------------------
// Engine process registry
// ---------------------------------------------------------------------------

struct EngineChild {
    stdin: ChildStdin,
    child: std::process::Child,
}

type Registry = Arc<Mutex<HashMap<u32, EngineChild>>>;

fn registry() -> Registry {
    static REG: std::sync::OnceLock<Registry> = std::sync::OnceLock::new();
    REG.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

static NEXT_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

/// Last stderr lines per engine id. Without this a dead engine is a black box:
/// Pikafish explains itself on stderr (missing net, bad option, SIGILL trap).
type StderrLog = Arc<Mutex<HashMap<u32, Vec<String>>>>;

fn stderr_log() -> StderrLog {
    static LOG: std::sync::OnceLock<StderrLog> = std::sync::OnceLock::new();
    LOG.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

const STDERR_KEEP_LINES: usize = 30;

// ---------------------------------------------------------------------------
// NNUE network file
// ---------------------------------------------------------------------------

/// Pikafish is NNUE-only: if it cannot load the network it prints an error and
/// calls `exit(EXIT_FAILURE)`, which surfaces as「引擎进程异常退出」. The real net
/// is ~17 MB (18,070,595 bytes for the 2023-03-05 build), so anything much
/// smaller is a broken/placeholder file and must not be handed to the engine.
const MIN_NNUE_BYTES: u64 = 15_000_000;

fn net_is_valid(p: &std::path::Path) -> bool {
    std::fs::metadata(p)
        .map(|m| m.is_file() && m.len() >= MIN_NNUE_BYTES)
        .unwrap_or(false)
}

/// Android: hand the engine a real file named `pikafish.nnue` under the app data
/// dir (which also becomes its cwd, so Pikafish's own default lookup succeeds).
///
/// The `libpikafish_nnue.so`-in-jniLibs trick cannot be relied on: Android only
/// guarantees extraction of entries under `lib/` that are actual ELF objects, and
/// the net is a raw data blob. So fall back to the embedded frontend asset.
#[cfg(target_os = "android")]
fn android_nnue(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dest = app
        .path()
        .app_data_dir()
        .ok()?
        .join("engines")
        .join("pikafish.nnue");
    if net_is_valid(&dest) {
        return Some(dest);
    }

    let write_dest = |bytes_from: &dyn Fn() -> Option<Vec<u8>>| -> Option<()> {
        let bytes = bytes_from()?;
        if bytes.len() as u64 >= MIN_NNUE_BYTES {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).ok()?;
            }
            std::fs::write(&dest, &bytes).ok()?;
            if net_is_valid(&dest) {
                return Some(());
            }
        }
        None
    };

    // 1) jniLibs copy, when the installer did extract it
    if let Some(dir) = get_android_native_library_dir() {
        let src = dir.join("libpikafish_nnue.so");
        if net_is_valid(&src) && write_dest(&|| std::fs::read(&src).ok()).is_some() {
            return Some(dest);
        }
    }

    // 2) embedded frontend asset (staged into public/ by build.js)
    let resolver = app.asset_resolver();
    if write_dest(&|| resolver.get("pikafish.nnue".to_string()).map(|a| a.bytes().to_vec())).is_some() {
        return Some(dest);
    }

    None
}

// ---------------------------------------------------------------------------
// Binary resolution
// ---------------------------------------------------------------------------

fn resolve_binary(app: &AppHandle, profile: &str) -> Result<std::path::PathBuf, String> {
    // 0. Android: nativeLibraryDir (jniLibs) — libpikafish.so
    #[cfg(target_os = "android")]
    {
        if let Some(native_dir) = get_android_native_library_dir() {
            let p = native_dir.join(binary_name(profile));
            if p.exists() {
                return Ok(p);
            }
        }
        // Also try resource_dir as fallback (for dev)
        if let Ok(resource_dir) = app.path().resource_dir() {
            let p = resource_dir.join(binary_name(profile));
            if p.exists() {
                return Ok(p);
            }
        }
    }

    // 1. bundled resources (production): resource_dir()/engines/<name>
    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate: std::path::PathBuf = resource_dir.join("engines").join(binary_name(profile));
        if candidate.exists() {
            return Ok(candidate);
        }
        // also try with .exe extension on Windows (resource may have been copied with extension)
        let with_exe: std::path::PathBuf = resource_dir.join("engines").join(format!("{}.exe", profile));
        if with_exe.exists() {
            return Ok(with_exe);
        }
    }

    // 2. dev fallback: look next to the executable (target/debug/engines)
    //     and walk up a few parents to handle both `tauri dev` (exe in
    //     target/debug) and `cargo run` from various working dirs.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // direct sibling: target/debug/engines/<bin>
            for name in [binary_name(profile), format!("{}.exe", profile)] {
                let p = dir.join("engines").join(&name);
                if p.exists() {
                    return Ok(p);
                }
            }
            // walk up to 4 parents and try <ancestor>/engines and third_party
            let mut cur = dir.to_path_buf();
            for _ in 0..4 {
                if let Some(parent) = cur.parent().map(|p| p.to_path_buf()) {
                    cur = parent;
                    for engines_dir in [
                        cur.join("apps/desktop/engines"),
                        cur.join("apps/desktop/src-tauri/target/debug/engines"),
                        cur.join("third_party/engines/windows-x64/pikafish"),
                        cur.join("third_party/engines/windows-x64/pikafish/Windows"),
                    ] {
                        for name in [binary_name(profile), format!("{}.exe", profile)] {
                            let p = engines_dir.join(&name);
                            if p.exists() {
                                return Ok(p);
                            }
                        }
                        // Pikafish ships as pikafish-avx2.exe / avx512 variant;
                        // accept either when the canonical pikafish.exe is absent.
                        if profile == "pikafish" {
                            for alt in ["pikafish-avx2.exe", "pikafish-avx512.exe"] {
                                let p = engines_dir.join(alt);
                                if p.exists() {
                                    return Ok(p);
                                }
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }
    }

    // 3. cwd-based fallback (covers repo-root launches)
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut cur = cwd.clone();
    for _ in 0..5 {
        for base in [
            cur.join("third_party/engines/windows-x64/pikafish"),
            cur.join("third_party/engines/windows-x64/pikafish/Windows"),
            cur.join("apps/desktop/engines"),
        ] {
            for name in [binary_name(profile), format!("{}.exe", profile)] {
                let p = base.join(&name);
                if p.exists() {
                    return Ok(p);
                }
            }
            if profile == "pikafish" {
                for alt in ["pikafish-avx2.exe", "pikafish-avx512.exe"] {
                    let p = base.join(alt);
                    if p.exists() {
                        return Ok(p);
                    }
                }
            }
        }
        if let Some(parent) = cur.parent().map(|p| p.to_path_buf()) {
            cur = parent;
        } else {
            break;
        }
    }

    Err(format!(
        "engine binary not found for profile '{}' — expected at <resource_dir>/engines/{}",
        profile,
        binary_name(profile)
    ))
}

fn binary_name(profile: &str) -> String {
    #[cfg(target_os = "android")]
    {
        return match profile {
            "pikafish" => "libpikafish.so".to_string(),
            other => format!("lib{}.so", other),
        };
    }
    #[cfg(not(target_os = "android"))]
    {
        return match profile {
            "pikafish" => "pikafish.exe".to_string(),
            other => format!("{}.exe", other),
        };
    }
}

#[cfg(target_os = "android")]
fn get_android_native_library_dir() -> Option<std::path::PathBuf> {
    // 1) dladdr: locate this library's own path (robust, no JNI)
    unsafe {
        let mut info: libc::Dl_info = std::mem::zeroed();
        let addr = get_android_native_library_dir as *const () as *const libc::c_void;
        if libc::dladdr(addr, &mut info) != 0 && !info.dli_fname.is_null() {
            if let Ok(fname) = std::ffi::CStr::from_ptr(info.dli_fname).to_str() {
                let p = std::path::PathBuf::from(fname);
                if let Some(dir) = p.parent() {
                    // When extractNativeLibs=true, the .so lives directly in .../lib/arm64
                    if dir.join("libpikafish.so").exists() {
                        return Some(dir.to_path_buf());
                    }
                    // When the .so is inside the APK (extractNativeLibs=false fallback),
                    // dli_fname may be ".../base.apk!/lib/arm64-v8a/libchessnext_lib.so" — try sibling.
                }
            }
        }
    }

    // 2) /proc/self/maps fallback: find any line containing libchessnext_lib.so
    if let Ok(maps) = std::fs::read_to_string("/proc/self/maps") {
        for line in maps.lines() {
            if line.contains("libchessnext_lib.so") {
                if let Some(path) = line.rsplit(' ').next() {
                    let p = std::path::PathBuf::from(path.trim());
                    if let Some(dir) = p.parent() {
                        if dir.join("libpikafish.so").exists() {
                            return Some(dir.to_path_buf());
                        }
                    }
                }
            }
        }
    }

    // 3) current_exe parent (works on some ROMs where app_process is symlink? keep for completeness)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("libpikafish.so").exists() {
                return Some(dir.to_path_buf());
            }
        }
    }

    // 4) JNI fallback — must be panic-safe because ndk_context::android_context()
    // panics with "android context was not initialized" on JavaBridge threads.
    let ctx = match std::panic::catch_unwind(|| ndk_context::android_context()) {
        Ok(c) => c,
        Err(_) => return None,
    };
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.ok()?;
    let mut env = vm.attach_current_thread().ok()?;
    let activity = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };
    let app_ctx = env
        .call_method(&activity, "getApplicationContext", "()Landroid/content/Context;", &[])
        .ok()?
        .l()
        .ok()?;
    let app_info = env
        .call_method(&app_ctx, "getApplicationInfo", "()Landroid/content/pm/ApplicationInfo;", &[])
        .ok()?
        .l()
        .ok()?;
    let native_dir_jstr = env
        .get_field(&app_info, "nativeLibraryDir", "Ljava/lang/String;")
        .ok()?
        .l()
        .ok()?;
    let jstr: jni::objects::JString = native_dir_jstr.into();
    let rust_str: String = env.get_string(&jstr).ok()?.into();
    Some(std::path::PathBuf::from(rust_str))
}

fn nnue_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(target_os = "android")]
    {
        // Materialised copy under the app data dir (see android_nnue).
        if let Some(p) = android_nnue(app) {
            return Some(p);
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let p: std::path::PathBuf = resource_dir.join("engines").join("pikafish.nnue");
        if net_is_valid(&p) {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("engines").join("pikafish.nnue");
            if p.exists() {
                return Some(p);
            }
            // walk up looking for bundled or third_party copy
            let mut cur = dir.to_path_buf();
            for _ in 0..4 {
                if let Some(parent) = cur.parent().map(|p| p.to_path_buf()) {
                    cur = parent;
                    for base in [
                        cur.join("apps/desktop/engines"),
                        cur.join("third_party/engines/windows-x64/pikafish"),
                    ] {
                        let p = base.join("pikafish.nnue");
                        if p.exists() {
                            return Some(p);
                        }
                    }
                } else {
                    break;
                }
            }
        }
    }
    // cwd walk
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut cur = cwd;
    for _ in 0..5 {
        for base in [
            cur.join("third_party/engines/windows-x64/pikafish"),
            cur.join("apps/desktop/engines"),
        ] {
            let p = base.join("pikafish.nnue");
            if p.exists() {
                return Some(p);
            }
        }
        if let Some(parent) = cur.parent().map(|p| p.to_path_buf()) {
            cur = parent;
        } else {
            break;
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn spawn_engine(app: AppHandle, profile: String) -> Result<u32, String> {
    let bin = resolve_binary(&app, &profile)?;
    let mut cmd = Command::new(&bin);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    // Pikafish looks for `pikafish.nnue` in its working directory when EvalFile
    // is not set, so prefer the directory that actually holds a valid net. The
    // JS layer still sends `setoption name EvalFile` with the absolute path.
    let net_dir = nnue_path(&app).and_then(|p| p.parent().map(|d| d.to_path_buf()));
    match net_dir.or_else(|| bin.parent().map(|d| d.to_path_buf())) {
        Some(dir) => {
            cmd.current_dir(&dir);
        }
        None => {}
    }

    let mut child = cmd.spawn().map_err(|e| format!("failed to spawn {}: {}", bin.display(), e))?;

    let stdin = child.stdin.take().ok_or("failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("failed to open stderr")?;

    let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    // Drain stderr (so the pipe cannot block the child) while keeping the tail:
    // it is the only explanation a dying engine gives us.
    let stderr_reg = stderr_log();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut kept: Vec<String> = Vec::new();
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let t = l.trim();
                    if !t.is_empty() {
                        kept.push(t.to_string());
                        if kept.len() > STDERR_KEEP_LINES {
                            kept.remove(0);
                        }
                    }
                }
                Err(_) => break,
            }
        }
        if !kept.is_empty() {
            stderr_reg
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(id, kept);
        }
    });

    // stdout reader -> events
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let ev = format!("engine://line/{}", id);
                    // best-effort emit; ignore if webview is gone
                    let _ = app_clone.emit(&ev, serde_json::json!({ "line": l }));
                }
                Err(_) => break,
            }
        }
        // Process exited — wait for exit code
        // We cannot easily get the exit code from the BufReader thread since we
        // moved `child`'s stdout; the main child handle is in the registry.
        // Instead, emit a generic exit event; the registry's wait thread will
        // emit the actual code.
    });

    // Wait for exit in a separate thread to emit engine://exit/<id>
    let app_clone2 = app.clone();
    let reg = registry();
    // We need to keep the `child` handle to wait; move it into the registry
    // and spawn a waiter that locks the registry to wait.
    {
        let mut map = reg.lock().unwrap_or_else(|e| e.into_inner());
        map.insert(id, EngineChild { stdin, child });
    }

    // Spawn a thread that waits for the child to exit and emits the event.
    // We poll the registry entry; when the child exits, `wait()` returns.
    std::thread::spawn(move || {
        // Poll by trying to lock and wait with timeout; simpler: just wait
        // on a copy of the child handle by removing it from the registry
        // when `engine_stop` is called. For the natural exit case (crash),
        // the stdout thread will have already exited and the child will be
        // wait()able.
        // We implement a simple poll: every 200ms, check if the process is gone.
        loop {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let mut map = reg.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(entry) = map.get_mut(&id) {
                match entry.child.try_wait() {
                    Ok(Some(status)) => {
                        let code = status.code();
                        // Give the stderr thread a moment to flush its tail so a
                        // fatal message is not lost in the race.
                        std::thread::sleep(std::time::Duration::from_millis(60));
                        let tail = stderr_log()
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .get(&id)
                            .cloned()
                            .unwrap_or_default()
                            .join("\n");
                        let _ = app_clone2.emit(
                            &format!("engine://exit/{}", id),
                            serde_json::json!({ "code": code, "stderr": tail }),
                        );
                        map.remove(&id);
                        break;
                    }
                    Ok(None) => {
                        // still running
                    }
                    Err(_) => {
                        map.remove(&id);
                        break;
                    }
                }
            } else {
                // already removed (via engine_stop)
                break;
            }
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn engine_write(id: u32, line: String) -> Result<(), String> {
    let reg = registry();
    let mut map = reg.lock().unwrap_or_else(|e| e.into_inner());
    let entry = map
        .get_mut(&id)
        .ok_or_else(|| format!("engine {} not found", id))?;
    let payload = format!("{}\n", line);
    entry
        .stdin
        .write_all(payload.as_bytes())
        .map_err(|e| format!("write to engine {} failed: {}", id, e))?;
    entry
        .stdin
        .flush()
        .map_err(|e| format!("flush engine {} failed: {}", id, e))?;
    Ok(())
}

#[tauri::command]
pub fn engine_stop(id: u32) -> Result<(), String> {
    let reg = registry();
    let mut map = reg.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut entry) = map.remove(&id) {
        let _ = entry.child.kill();
        let _ = entry.child.wait();
        // Emit exit event so JS can clean up listeners
        // Note: the waiter thread will also try to remove, but it's already gone
        drop(map);
        // We need an AppHandle to emit; we don't have one here. The JS side
        // will treat `engine_stop` as also cleaning up its listeners, and the
        // Rust waiter thread would have emitted already if the process exited
        // naturally. For explicit stop, the JS should just drop its listeners.
        // To still notify, we could try to get the app handle via global, but
        // Tauri commands don't have it unless we pass it. For now, just kill.
        // The JS transport's `kill()` will not wait for the exit event.
        Ok(())
    } else {
        // Already gone — treat as success
        Ok(())
    }
}

#[tauri::command]
pub fn engine_nnue_path(app: AppHandle) -> Result<Option<String>, String> {
    Ok(nnue_path(&app).map(|p| p.to_string_lossy().to_string()))
}

/// Last stderr lines of an engine process (diagnostics; empty once it exits).
#[tauri::command]
pub fn engine_stderr(id: u32) -> Result<String, String> {
    Ok(stderr_log()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&id)
        .cloned()
        .unwrap_or_default()
        .join("\n"))
}
