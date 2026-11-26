use serde::Deserialize;
use std::{io::Write, path::Path};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Csv,
    Markdown,
}

impl Format {
    fn filter(&self) -> (&'static str, &'static str) {
        match self {
            Self::Csv => ("CSV report", "csv"),
            Self::Markdown => ("Markdown report", "md"),
        }
    }
}

#[tauri::command]
pub async fn save_report(
    window: WebviewWindow,
    format: Format,
    contents: String,
    file_name: String,
) -> Result<Option<String>, String> {
    let (label, extension) = format.filter();
    if Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(file_name.as_str())
    {
        return Err("Use a file name without a folder path.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = window
            .dialog()
            .file()
            .set_title("Export Dev Focus report")
            .set_parent(&window)
            .set_file_name(file_name)
            .add_filter(label, &[extension])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let mut path = selected.into_path().map_err(|error| error.to_string())?;
        if path.extension().is_none() {
            path.set_extension(extension);
        }
        let directory = path.parent().ok_or("Choose an export folder.")?;
        let write_report = || -> std::io::Result<()> {
            let mut file = tempfile::NamedTempFile::new_in(directory)?;
            file.write_all(contents.as_bytes())?;
            file.as_file().sync_all()?;
            file.persist(&path)?;
            Ok(())
        };
        write_report()
            .map_err(|error| format!("Could not save the report to {}. {error}", path.display()))?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| error.to_string())?
}
