// ChessEnginesModule.h  Windows engine-process bridge (attributed TurboModule).
//
// Spawns engine binaries (Stockfish / Pikafish) as Win32 child processes and
// streams their stdout to JS over RCTDeviceEventEmitter, mirroring the Android
// Kotlin module contract exactly:
//   methods : getEnginesDir(), startEngine(spec), writeLine(handle,line),
//             stopEngine(handle)
//   events  : "chessEngineLine" {handle,line}, "chessEngineExit" {handle,code}
//
// Desktop distribution note: unlike Android there is no W^X restriction here,
// so engines ship as plain executables under <exeDir>\engines\.

#pragma once

#include "pch.h"

#include "NativeModules.h"

#include <Windows.h>

#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <thread>

namespace ChessLab {

inline std::wstring Utf8ToWide(const std::string &s) {
  if (s.empty()) return {};
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
  std::wstring out(static_cast<size_t>(n > 0 ? n : 0), L'\0');
  if (n > 0) {
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), n, out.data(), n);
  }
  return out;
}

REACT_MODULE(ChessEnginesModule);
struct ChessEnginesModule {
  struct Child {
    HANDLE hProcess = nullptr;
    HANDLE hStdinWr = nullptr;
  };

  winrt::Microsoft::ReactNative::ReactContext m_reactContext{nullptr};
  std::mutex m_mutex;
  std::map<int, Child> m_children;
  std::atomic<int> m_nextHandle{100};
  std::atomic<bool> m_shuttingDown{false};

  ~ChessEnginesModule() { KillAll(); }

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
    m_reactContext = reactContext;
  }

  /** Directory where desktop engine binaries are deployed next to the exe. */
  REACT_SYNC_METHOD(GetEnginesDir)
  std::wstring GetEnginesDir() noexcept {
    wchar_t path[MAX_PATH] = {};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    wchar_t *slash = wcsrchr(path, L'\\');
    if (slash) *slash = L'\0';
    return std::wstring(path) + L"\\engines";
  }

  REACT_METHOD(StartEngine)
  void StartEngine(
      winrt::Microsoft::ReactNative::JSValue &&spec,
      winrt::Microsoft::ReactNative::ReactPromise<int> const &promise) noexcept {
    try {
      if (spec["command"].Type() != winrt::Microsoft::ReactNative::JSValueType::String) {
        promise.Reject("spec.command must be a string");
        return;
      }
      std::wstring commandLine = L"\"" + Utf8ToWide(spec["command"].AsString()) + L"\"";

      if (spec["args"].Type() == winrt::Microsoft::ReactNative::JSValueType::Array) {
        for (auto const &a : spec["args"].AsArray()) {
          if (a.Type() == winrt::Microsoft::ReactNative::JSValueType::String) {
            commandLine += L" \"" + Utf8ToWide(a.AsString()) + L"\"";
          }
        }
      }

      std::wstring workingDir;
      if (spec["cwd"].Type() == winrt::Microsoft::ReactNative::JSValueType::String) {
        workingDir = Utf8ToWide(spec["cwd"].AsString());
      }

      SECURITY_ATTRIBUTES sa{sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};

      HANDLE stdinRd = nullptr, stdinWr = nullptr;
      HANDLE stdoutRd = nullptr, stdoutWr = nullptr;
      HANDLE stderrRd = nullptr, stderrWr = nullptr;

      BOOL ok = CreatePipe(&stdinRd, &stdinWr, &sa, 0) &&
                CreatePipe(&stdoutRd, &stdoutWr, &sa, 0) &&
                CreatePipe(&stderrRd, &stderrWr, &sa, 0);
      if (ok) SetHandleInformation(stdoutRd, HANDLE_FLAG_INHERIT, 0);
      if (ok) SetHandleInformation(stderrRd, HANDLE_FLAG_INHERIT, 0);

      STARTUPINFOW si{};
      si.cb = sizeof(si);
      si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
      si.wShowWindow = SW_HIDE;
      si.hStdInput = stdinRd;
      si.hStdOutput = stdoutWr;
      si.hStdError = stderrWr;

      PROCESS_INFORMATION pi{};
      ok = CreateProcessW(
          nullptr,
          commandLine.data(), // CreateProcessW needs a mutable buffer
          nullptr,
          nullptr,
          TRUE,
          CREATE_NO_WINDOW,
          nullptr,
          workingDir.empty() ? nullptr : workingDir.c_str(),
          &si,
          &pi);

      CloseHandle(stdinRd);
      CloseHandle(stdoutWr);
      CloseHandle(stderrWr);

      if (!ok) {
        DWORD err = GetLastError();
        CloseHandle(stdinWr);
        CloseHandle(stdoutRd);
        CloseHandle(stderrRd);
        promise.Reject(("CreateProcess failed with error " + std::to_string(err)).c_str());
        return;
      }

      const int handle = m_nextHandle.fetch_add(1);
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        Child child;
        child.hProcess = pi.hProcess;
        child.hStdinWr = stdinWr;
        m_children.emplace(handle, child);
      }
      CloseHandle(pi.hThread);

      // stdout pump: raw bytes -> line buffer -> JS events
      HANDLE stdoutForThread = stdoutRd;
      std::thread([this, handle, stdoutForThread]() { StdoutPump(handle, stdoutForThread); })
          .detach();

      // stderr drain (prevents pipe-full deadlock); contents discarded.
      HANDLE stderrForThread = stderrRd;
      std::thread([this, stderrForThread]() {
        char buf[4096];
        DWORD n = 0;
        while (ReadFile(stderrForThread, buf, sizeof(buf), &n, nullptr) && n > 0) {
        }
        CloseHandle(stderrForThread);
      }).detach();

      // exit watcher: emits chessEngineExit and releases handles
      HANDLE procForThread = pi.hProcess;
      std::thread([this, handle, procForThread]() {
        WaitForSingleObject(procForThread, INFINITE);
        DWORD code = static_cast<DWORD>(-1);
        GetExitCodeProcess(procForThread, &code);
        {
          std::lock_guard<std::mutex> lock(m_mutex);
          auto it = m_children.find(handle);
          if (it != m_children.end()) {
            if (it->second.hStdinWr) CloseHandle(it->second.hStdinWr);
            m_children.erase(it);
          }
        }
        EmitIntEvent(L"chessEngineExit", handle, static_cast<int>(code));
        CloseHandle(procForThread);
      }).detach();

      promise.Resolve(handle);
    } catch (const std::exception &e) {
      promise.Reject(e.what());
    } catch (...) {
      promise.Reject("unknown failure in StartEngine");
    }
  }

  REACT_METHOD(WriteLine)
  void WriteLine(
      int handle,
      std::string line,
      winrt::Microsoft::ReactNative::ReactPromise<void> const &promise) noexcept {
    HANDLE wr = nullptr;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      auto it = m_children.find(handle);
      if (it != m_children.end()) wr = it->second.hStdinWr;
    }
    if (!wr) {
      promise.Reject("write failed: unknown engine handle");
      return;
    }
    line += "\r\n";
    DWORD written = 0;
    BOOL ok = WriteFile(wr, line.c_str(), static_cast<DWORD>(line.size()), &written, nullptr);
    if (ok) promise.Resolve();
    else promise.Reject("WriteFile failed");
  }

  REACT_METHOD(StopEngine)
  void StopEngine(int handle,
                  winrt::Microsoft::ReactNative::ReactPromise<void> const &promise) noexcept {
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      auto it = m_children.find(handle);
      if (it != m_children.end() && it->second.hProcess) {
        TerminateProcess(it->second.hProcess, 1);
      }
    }
    promise.Resolve();
  }

 private:
  void StdoutPump(int handle, HANDLE rd) {
    std::string buffer;
    char buf[8192];
    DWORD n = 0;
    while (ReadFile(rd, buf, sizeof(buf), &n, nullptr) && n > 0) {
      buffer.append(buf, buf + n);
      size_t idx;
      while ((idx = buffer.find('\n')) != std::string::npos) {
        std::string line = buffer.substr(0, idx);
        if (!line.empty() && line.back() == '\r') line.pop_back();
        buffer.erase(0, idx + 1);
        if (line.empty()) continue;
        EmitLineEvent(handle, line);
      }
    }
    CloseHandle(rd);
  }

  void EmitLineEvent(int handle, const std::string &lineUtf8) {
    if (m_shuttingDown || !m_reactContext) return;
    const std::wstring line = Utf8ToWide(lineUtf8);
    m_reactContext.EmitJSEvent(
        L"RCTDeviceEventEmitter",
        L"chessEngineLine",
        [handle, line](winrt::Microsoft::ReactNative::IJSValueWriter const &writer) noexcept {
          writer.WriteObjectBegin();
          winrt::Microsoft::ReactNative::WriteProperty(writer, L"handle", handle);
          winrt::Microsoft::ReactNative::WriteProperty(writer, L"line", line);
          writer.WriteObjectEnd();
        });
  }

  void EmitIntEvent(const wchar_t *name, int handle, int code) {
    if (m_shuttingDown || !m_reactContext) return;
    m_reactContext.EmitJSEvent(
        L"RCTDeviceEventEmitter",
        name,
        [handle, code](winrt::Microsoft::ReactNative::IJSValueWriter const &writer) noexcept {
          writer.WriteObjectBegin();
          winrt::Microsoft::ReactNative::WriteProperty(writer, L"handle", handle);
          winrt::Microsoft::ReactNative::WriteProperty(writer, L"code", code);
          writer.WriteObjectEnd();
        });
  }

  void KillAll() {
    m_shuttingDown = true;
    std::lock_guard<std::mutex> lock(m_mutex);
    for (auto &kv : m_children) {
      if (kv.second.hProcess) TerminateProcess(kv.second.hProcess, 1);
      if (kv.second.hStdinWr) CloseHandle(kv.second.hStdinWr);
    }
    m_children.clear();
  }
};

} // namespace ChessLab
