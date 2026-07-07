use serde::{Deserialize, Serialize};

/// Options for `start_recording`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    /// Auto-stop cap in milliseconds; the native recorder enforces it even if
    /// the webview never wakes to ask for a stop.
    pub max_duration_ms: f64,
}

/// A finished recording, still in the plugin's staging directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopResponse {
    /// Absolute path of the staged `.m4a`.
    pub path: String,
    pub duration_ms: f64,
}

/// One file in the staging directory — a recording not yet moved into the
/// graph (an orphan from a crash, or one mid-ingest).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedFile {
    /// Absolute path of the staged `.m4a`.
    pub path: String,
    /// Modification time in epoch milliseconds — the recording's stop time.
    pub modified_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListStagedResponse {
    pub files: Vec<StagedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadStagedResponse {
    /// The staged file's bytes, base64-encoded.
    pub base64: String,
}

/// Path argument for `read_staged` / `delete_staged`. The native side rejects
/// paths outside its staging directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedPathRequest {
    pub path: String,
}
