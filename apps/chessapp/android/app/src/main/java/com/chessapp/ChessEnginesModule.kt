package com.chessapp

import android.annotation.SuppressLint
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventEmitter
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Spawns chess engine binaries as OS processes and streams their stdout to JS.
 *
 * Android 10+ (targetSdk >= 29) forbids exec() from the writable app home
 * directory (SELinux W^X), but explicitly allows it from the app's
 * `nativeLibraryDir`. We exploit the standard trick:
 *
 *   jniLibs/arm64-v8a/libstockfish.so   ->  <nativeLibraryDir>/libstockfish.so
 *   jniLibs/arm64-v8a/libpikafish.so    ->  <nativeLibraryDir>/libpikafish.so
 *   jniLibs/arm64-v8a/libpikafish_nnue.so -> readable NNUE file for EvalFile
 *
 * (`useLegacyPackaging = true` in build.gradle makes AGP extract them to disk.)
 *
 * Events emitted to JS:
 *   "chessEngineLine" { handle:number, line:string }
 *   "chessEngineExit" { handle:number, code:number|null }
 */
class ChessEnginesModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

  private val processes = ConcurrentHashMap<Int, Process>()
  private val handleGen = AtomicInteger(100)

  override fun getName(): String = "ChessEngines"

  /** Absolute directory containing our packaged engine binaries. */
  @SuppressLint("DiscouragedPrivateApi")
  @ReactMethod
  fun getNativeLibraryDir(promise: Promise) {
    try {
      promise.resolve(ctx.applicationInfo.nativeLibraryDir)
    } catch (t: Throwable) {
      promise.reject("NATIVE_DIR", t)
    }
  }

  @ReactMethod
  fun startEngine(spec: ReadableMap, promise: Promise) {
    try {
      val command = spec.getString("command") ?: throw IllegalArgumentException("command required")
      val args = mutableListOf(command)
      spec.getArray("args")?.let { arr ->
        for (i in 0 until arr.size()) arr.getString(i)?.let { args.add(it) }
      }

      val builder = ProcessBuilder(args)
      spec.getString("cwd")?.let { builder.directory(File(it)) }
      builder.redirectErrorStream(false)

      val process = builder.start()
      val handle = handleGen.incrementAndGet()
      processes[handle] = process

      // stdout -> JS events
      Thread({
        try {
          val reader = BufferedReader(InputStreamReader(process.inputStream))
          while (true) {
            val line = reader.readLine() ?: break
            val params = WritableNativeMap().apply {
              putInt("handle", handle)
              putString("line", line)
            }
            ctx.getJSModule(DeviceEventEmitter::class.java).emit("chessEngineLine", params)
          }
        } catch (_: Exception) {
          // stream closed
        }
        processes.remove(handle)
        val code = try { process.waitFor() } catch (_: InterruptedException) { null }
        val exit = WritableNativeMap().apply {
          putInt("handle", handle)
          putInt("code", code ?: -1)
        }
        ctx.getJSModule(DeviceEventEmitter::class.java).emit("chessEngineExit", exit)
      }, "engine-stdout-$handle").apply { isDaemon = true }.start()

      // Drain stderr so the pipe never fills up and blocks the engine.
      Thread({
        try {
          BufferedReader(InputStreamReader(process.errorStream)).forEachLine { /* discard */ }
        } catch (_: Exception) {
        }
      }, "engine-stderr-$handle").apply { isDaemon = true }.start()

      promise.resolve(handle)
    } catch (t: Throwable) {
      promise.reject("START_FAILED", t)
    }
  }

  @ReactMethod
  fun writeLine(handle: Int, line: String, promise: Promise) {
    val ok = processes[handle]?.let { proc ->
      try {
        proc.outputStream.write((line + "\n").toByteArray(Charsets.UTF_8))
        proc.outputStream.flush()
        true
      } catch (_: Exception) {
        false
      }
    } ?: false
    if (ok) promise.resolve(null) else promise.reject("WRITE_FAILED", "no such engine or stdin closed")
  }

  @ReactMethod
  fun stopEngine(handle: Int, promise: Promise) {
    processes.remove(handle)?.destroy()
    promise.resolve(null)
  }

  /** Kill every spawned engine when the JS context goes away. */
  override fun invalidate() {
    super.invalidate()
    for ((_, proc) in processes) proc.destroy()
    processes.clear()
  }
}
