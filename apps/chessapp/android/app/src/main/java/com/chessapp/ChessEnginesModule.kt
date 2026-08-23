package com.chessapp

import com.chessapp.spec.NativeChessEnginesSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Codegen TurboModule implementation (extends the generated NativeChessEnginesSpec).
 *
 * Android 10+ (targetSdk >= 29) forbids exec() from the writable app home
 * directory (SELinux W^X), but allows it from `nativeLibraryDir`. Engines are
 * therefore packaged as jniLibs/arm64-v8a/lib<name>.so with
 * `useLegacyPackaging = true`, and launched from nativeLibraryDir at runtime.
 * Pikafish's NNUE rides along as libpikafish_nnue.so (readable via EvalFile).
 *
 * Events emitted to JS (via RCTDeviceEventEmitter):
 *   "chessEngineLine" { handle:number, line:string }
 *   "chessEngineExit" { handle:number, code:number }
 */
@Suppress("UNUSED_PARAMETER")
class ChessEnginesModule(reactContext: ReactApplicationContext) :
    NativeChessEnginesSpec(reactContext) {

  private val processes = ConcurrentHashMap<Int, Process>()
  private val handleGen = AtomicInteger(100)

  override fun getName(): String = "ChessEngines"

  override fun getEnginesDir(promise: Promise) {
    // Android uses nativeLibraryDir; desktop override handled by WinRT module.
    promise.resolve(reactApplicationContext.applicationInfo.nativeLibraryDir)
  }

  override fun getNativeLibraryDir(promise: Promise) {
    promise.resolve(reactApplicationContext.applicationInfo.nativeLibraryDir)
  }

  override fun startEngine(spec: ReadableMap?, promise: Promise) {
    try {
      val command =
        spec?.getString("command")
          ?: throw IllegalArgumentException("spec.command is required")
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

      Thread({
        try {
          val reader = BufferedReader(InputStreamReader(process.inputStream))
          while (true) {
            val line = reader.readLine() ?: break
            val params = WritableNativeMap().apply {
              putInt("handle", handle)
              putString("line", line)
            }
            emit("chessEngineLine", params)
          }
        } catch (_: Exception) {
          // stream closed
        }
        processes.remove(handle)
        val code = try { process.waitFor() } catch (_: InterruptedException) { -1 }
        val exit = WritableNativeMap().apply {
          putInt("handle", handle)
          putInt("code", code)
        }
        emit("chessEngineExit", exit)
      }, "engine-stdout-$handle").apply { isDaemon = true }.start()

      Thread({
        try {
          BufferedReader(InputStreamReader(process.errorStream)).forEachLine { }
        } catch (_: Exception) {
        }
      }, "engine-stderr-$handle").apply { isDaemon = true }.start()

      promise.resolve(handle)
    } catch (t: Throwable) {
      promise.reject("START_FAILED", t)
    }
  }

  override fun writeLine(handle: Double, line: String?, promise: Promise) {
    val proc = processes[handle.toInt()]
    if (proc == null || line == null) {
      promise.reject("WRITE_FAILED", "no such engine or empty line")
      return
    }
    try {
      proc.outputStream.write((line + "\n").toByteArray(Charsets.UTF_8))
      proc.outputStream.flush()
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("WRITE_FAILED", t)
    }
  }

  override fun stopEngine(handle: Double, promise: Promise) {
    processes.remove(handle.toInt())?.destroy()
    promise.resolve(null)
  }

  override fun addListener(_eventName: String) {}

  override fun removeListeners(_count: Double) {}

  override fun invalidate() {
    super.invalidate()
    for ((_, proc) in processes) proc.destroy()
    processes.clear()
  }

  private fun emit(name: String, params: WritableNativeMap) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }
}
