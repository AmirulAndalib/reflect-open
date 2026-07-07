import AVFoundation
import Tauri
import UIKit
import WebKit

/// The payload of the plugin's ~10 Hz `recordingLevel` event.
struct RecordingLevel: Encodable {
  /// Linear input level 0…1, from the recorder's average power meter.
  let level: Float
  /// Recorded time so far in milliseconds (pauses excluded).
  let elapsedMs: Double
}

/// The payload of the `recordingStopped` event — a stop the *native* side
/// initiated (interruption, route change, backgrounding, the duration cap, or
/// an encoder error). A stop the webview asked for resolves its own invoke
/// instead and never fires this event.
struct RecordingStopped: Encodable {
  /// Absolute path of the staged `.m4a`.
  let path: String
  let durationMs: Double
  /// `interruption` | `routeChange` | `background` | `maxDuration` | `error`
  let reason: String
}

/// `stopRecording`'s response.
struct StopResponse: Encodable {
  let path: String
  let durationMs: Double
}

struct StagedFile: Encodable {
  let path: String
  /// Modification time in epoch milliseconds — effectively the stop time.
  let modifiedMs: Double
}

struct ListStagedResponse: Encodable {
  let files: [StagedFile]
}

struct ReadStagedResponse: Encodable {
  let base64: String
}

struct StartArgs: Decodable {
  /// Auto-stop cap in milliseconds, enforced natively via
  /// `record(forDuration:)` so it holds even if the webview never wakes.
  let maxDurationMs: Double
}

struct StagedPathArgs: Decodable {
  let path: String
}

/// Reflect's native audio-memo recorder (the mobile leg of the raw-first
/// pipeline in `packages/core/src/actions/audio-memo.ts`).
///
/// The V1 lesson this preserves: **capture must not depend on the webview.**
/// The recorder writes AAC mono 44.1 kHz `.m4a` straight into a staging
/// directory the plugin owns; audio-session interruptions (calls, Siri,
/// alarms), input-route loss (headphones unplugged), backgrounding, and the
/// duration cap all finalize the file natively, without JS involvement. The
/// webview ingests staged files into the graph when it can — including a
/// launch-time orphan scan for recordings whose stop it never saw — and only
/// then deletes them, so a crash anywhere in the chain loses nothing.
///
/// All state is confined to the main queue: invokes hop onto it, the meter
/// timer runs on it, and AVFoundation notifications are delivered to it.
class RecordingPlugin: Plugin {

  /// Why the native side is finalizing the file. `nil` while recording and
  /// for webview-initiated stops (which resolve their invoke instead).
  private enum NativeStopReason: String {
    case interruption
    case routeChange
    case background
    case maxDuration
    case error
  }

  private var recorder: AVAudioRecorder?
  private var meterTimer: Timer?
  private var delegateProxy: RecorderDelegateProxy?
  /// Recorded milliseconds, captured before `stop()` zeroes `currentTime`.
  private var stoppedDurationMs: Double = 0
  /// Refreshed by the meter timer — the duration fallback for stops that
  /// never pass through `finalize` (the cap firing the delegate directly),
  /// where `currentTime` already reads 0.
  private var lastMeteredDurationMs: Double = 0
  /// The webview's `stopRecording` invoke, resolved when the file finalizes.
  private var pendingStop: Invoke?
  /// The webview's `cancelRecording` invoke — finalize, then delete.
  private var pendingCancel: Invoke?
  private var nativeStopReason: NativeStopReason?
  /// Bumped by cancel so a permission grant arriving later starts nothing.
  private var startSession = 0

  @objc public override func load(webview: WKWebView) {
    let center = NotificationCenter.default
    center.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance()
    )
    center.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance()
    )
    // Wave 1 records in the foreground only (no background-audio entitlement
    // yet): backgrounding finalizes the memo instead of letting the OS
    // suspend the process mid-write and corrupt the container.
    center.addObserver(
      self,
      selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
  }

  // MARK: - Commands

  @objc public func startRecording(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StartArgs.self)
    DispatchQueue.main.async {
      guard self.recorder == nil else {
        invoke.reject("already recording")
        return
      }
      let session = self.startSession
      let audioSession = AVAudioSession.sharedInstance()
      audioSession.requestRecordPermission { granted in
        DispatchQueue.main.async {
          guard self.startSession == session, self.recorder == nil else {
            // Cancelled while the permission prompt was up, or a retry beat
            // this grant — nothing to start.
            invoke.reject("recording start was cancelled")
            return
          }
          guard granted else {
            invoke.reject("microphone access denied")
            return
          }
          do {
            try self.beginRecording(maxDurationMs: args.maxDurationMs)
            invoke.resolve()
          } catch {
            self.deactivateAudioSession()
            invoke.reject("recording failed to start: \(error.localizedDescription)")
          }
        }
      }
    }
  }

  @objc public func stopRecording(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard let recorder = self.recorder else {
        invoke.reject("no active recording")
        return
      }
      guard self.pendingStop == nil, self.pendingCancel == nil else {
        invoke.reject("a stop is already in flight")
        return
      }
      self.pendingStop = invoke
      self.finalize(recorder)
    }
  }

  @objc public func cancelRecording(_ invoke: Invoke) {
    DispatchQueue.main.async {
      // Cancel during the permission prompt: invalidate the pending start.
      self.startSession += 1
      guard let recorder = self.recorder else {
        invoke.resolve()
        return
      }
      guard self.pendingStop == nil, self.pendingCancel == nil else {
        invoke.reject("a stop is already in flight")
        return
      }
      self.pendingCancel = invoke
      self.finalize(recorder)
    }
  }

  @objc public func listStaged(_ invoke: Invoke) {
    DispatchQueue.main.async {
      do {
        let directory = try self.stagingDirectory()
        let live = self.recorder?.url.standardizedFileURL.path
        let urls = try FileManager.default.contentsOfDirectory(
          at: directory,
          includingPropertiesForKeys: [.contentModificationDateKey],
          options: [.skipsHiddenFiles]
        )
        let files: [StagedFile] = urls.compactMap { url in
          // The in-flight recording's file is not staged output yet.
          guard url.standardizedFileURL.path != live else { return nil }
          let modified =
            (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
            .contentModificationDate ?? Date(timeIntervalSince1970: 0)
          return StagedFile(
            path: url.standardizedFileURL.path,
            modifiedMs: modified.timeIntervalSince1970 * 1000
          )
        }
        invoke.resolve(ListStagedResponse(files: files.sorted { $0.path < $1.path }))
      } catch {
        invoke.reject("listing staged recordings failed: \(error.localizedDescription)")
      }
    }
  }

  @objc public func readStaged(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StagedPathArgs.self)
    DispatchQueue.main.async {
      do {
        let url = try self.stagedURL(for: args.path)
        let data = try Data(contentsOf: url)
        invoke.resolve(ReadStagedResponse(base64: data.base64EncodedString()))
      } catch {
        invoke.reject("reading staged recording failed: \(error.localizedDescription)")
      }
    }
  }

  @objc public func deleteStaged(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StagedPathArgs.self)
    DispatchQueue.main.async {
      do {
        let url = try self.stagedURL(for: args.path)
        if FileManager.default.fileExists(atPath: url.path) {
          try FileManager.default.removeItem(at: url)
        }
        invoke.resolve()
      } catch {
        invoke.reject("deleting staged recording failed: \(error.localizedDescription)")
      }
    }
  }

  // MARK: - Recording lifecycle (main queue)

  private func beginRecording(maxDurationMs: Double) throws {
    let audioSession = AVAudioSession.sharedInstance()
    try audioSession.setCategory(.record, mode: .default)
    try audioSession.setActive(true)

    let directory = try stagingDirectory()
    let name = "recording-\(Int(Date().timeIntervalSince1970 * 1000)).m4a"
    let url = directory.appendingPathComponent(name)
    // AAC mono 44.1 kHz — the V1 recorder's format, and the `.m4a` container
    // the transcription providers accept (`AUDIO_EXTENSION_BY_MIME`).
    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44_100.0,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
    ]
    let recorder = try AVAudioRecorder(url: url, settings: settings)
    let proxy = RecorderDelegateProxy(
      onFinish: { [weak self] successfully in
        self?.recorderDidFinish(successfully: successfully)
      },
      onEncodeError: { [weak self] in
        self?.nativeStopReason = self?.nativeStopReason ?? .error
      }
    )
    recorder.delegate = proxy
    recorder.isMeteringEnabled = true
    guard recorder.record(forDuration: maxDurationMs / 1000) else {
      deactivateAudioSession()
      throw NSError(
        domain: "app.reflect.recording", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "the audio recorder refused to start"])
    }

    self.recorder = recorder
    self.delegateProxy = proxy
    self.nativeStopReason = nil
    self.stoppedDurationMs = 0
    self.lastMeteredDurationMs = 0
    // The screen must not sleep mid-memo (V1 parity).
    UIApplication.shared.isIdleTimerDisabled = true
    self.meterTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) {
      [weak self] _ in
      self?.emitLevel()
    }
  }

  /// Capture the duration and ask the recorder to finalize the file; the
  /// delegate callback (`recorderDidFinish`) settles whoever is waiting.
  private func finalize(_ recorder: AVAudioRecorder, native reason: NativeStopReason? = nil) {
    nativeStopReason = reason
    stoppedDurationMs = recorder.currentTime * 1000
    meterTimer?.invalidate()
    meterTimer = nil
    recorder.stop()
  }

  private func recorderDidFinish(successfully: Bool) {
    guard let recorder = self.recorder else { return }
    let path = recorder.url.standardizedFileURL.path
    // `record(forDuration:)` hitting the cap lands here with no local cause
    // recorded — every other path set its reason (or a pending invoke) first.
    let reason =
      nativeStopReason ?? (!successfully ? .error : .maxDuration)
    let durationMs = stoppedDurationMs > 0 ? stoppedDurationMs : lastMeteredDurationMs

    self.recorder = nil
    self.delegateProxy = nil
    self.nativeStopReason = nil
    self.meterTimer?.invalidate()
    self.meterTimer = nil
    UIApplication.shared.isIdleTimerDisabled = false
    deactivateAudioSession()

    if let cancel = pendingCancel {
      pendingCancel = nil
      try? FileManager.default.removeItem(atPath: path)
      cancel.resolve()
      return
    }
    if let stop = pendingStop {
      pendingStop = nil
      stop.resolve(StopResponse(path: path, durationMs: durationMs))
      return
    }
    // A native-initiated stop: the file is staged output now — tell the
    // webview if it is alive; the orphan scan covers it if it is not.
    do {
      try trigger(
        "recordingStopped",
        data: RecordingStopped(path: path, durationMs: durationMs, reason: reason.rawValue))
    } catch {
      Logger.error("recordingStopped event failed to serialize: \(error)")
    }
  }

  private func emitLevel() {
    guard let recorder = self.recorder, recorder.isRecording else { return }
    recorder.updateMeters()
    lastMeteredDurationMs = recorder.currentTime * 1000
    // Average power is dBFS (−160…0); linearize for the waveform.
    let level = pow(10, recorder.averagePower(forChannel: 0) / 20)
    do {
      try trigger(
        "recordingLevel",
        data: RecordingLevel(level: level, elapsedMs: lastMeteredDurationMs))
    } catch {
      Logger.error("recordingLevel event failed to serialize: \(error)")
    }
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: - Session notifications

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let recorder = self.recorder,
      let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      AVAudioSession.InterruptionType(rawValue: rawType) == .began
    else { return }
    // A call, Siri, or an alarm took the session: keep what was recorded
    // rather than gambling on a resume that may never come (V1 parity).
    finalize(recorder, native: .interruption)
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    guard
      let recorder = self.recorder,
      let rawReason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      AVAudioSession.RouteChangeReason(rawValue: rawReason) == .oldDeviceUnavailable
    else { return }
    // The input device went away (headset unplugged, Bluetooth mic dropped):
    // stop instead of silently recording the wrong microphone.
    finalize(recorder, native: .routeChange)
  }

  @objc private func handleDidEnterBackground() {
    guard let recorder = self.recorder else { return }
    finalize(recorder, native: .background)
  }

  // MARK: - Staging directory

  private func stagingDirectory() throws -> URL {
    let base = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let directory = base.appendingPathComponent("audio-memo-staging", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  /// Resolve a caller-supplied path, refusing anything outside staging — the
  /// webview must not be able to read or delete arbitrary sandbox files.
  private func stagedURL(for path: String) throws -> URL {
    let directory = try stagingDirectory().standardizedFileURL
    let url = URL(fileURLWithPath: path).standardizedFileURL
    guard url.path.hasPrefix(directory.path + "/") else {
      throw NSError(
        domain: "app.reflect.recording", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "path is outside the recording staging directory"])
    }
    return url
  }
}

/// `AVAudioRecorderDelegate` requires `NSObject`; a tiny proxy keeps the
/// plugin class free of that conformance and the callbacks on closures.
private class RecorderDelegateProxy: NSObject, AVAudioRecorderDelegate {
  private let onFinish: (Bool) -> Void
  private let onEncodeError: () -> Void

  init(onFinish: @escaping (Bool) -> Void, onEncodeError: @escaping () -> Void) {
    self.onFinish = onFinish
    self.onEncodeError = onEncodeError
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    onFinish(flag)
  }

  func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
    onEncodeError()
  }
}

@_cdecl("init_plugin_recording")
func initPlugin() -> Plugin {
  return RecordingPlugin()
}
