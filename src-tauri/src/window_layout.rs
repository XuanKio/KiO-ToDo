use crate::{
    data::Data,
    desktop::{preferences, Mode},
};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc,
};
use std::time::Duration;
use tauri::{
    LogicalSize, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent,
};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
struct Placement {
    x: i32,
    y: i32,
    width: f64,
    height: f64,
}

#[derive(Default)]
pub struct Layout {
    generation: AtomicU64,
    animating: AtomicBool,
}

impl Mode {
    fn geometry_key(self) -> &'static str {
        match self {
            Self::Full => "geometry.full",
            Self::Widget => "geometry.widget",
            Self::Mini => "geometry.mini",
            Self::Bubble => "geometry.bubble",
        }
    }

    fn dimensions(self) -> LogicalSize<f64> {
        let (width, height) = match self {
            Self::Full => (1120.0, 740.0),
            Self::Widget => (320.0, 420.0),
            Self::Mini => (240.0, 48.0),
            Self::Bubble => (72.0, 72.0),
        };
        LogicalSize::new(width, height)
    }
}

fn position_in_work_area(
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    monitor: &Monitor,
    mode: Mode,
    snap: bool,
) -> PhysicalPosition<i32> {
    let area = monitor.work_area();
    let left = area.position.x;
    let top = area.position.y;
    let right = left + area.size.width.saturating_sub(size.width) as i32;
    let bottom = top + area.size.height.saturating_sub(size.height) as i32;
    let mut x = position.x.clamp(left, right);
    let mut y = position.y.clamp(top, bottom);
    if snap && mode != Mode::Full {
        let threshold = (22.0 * monitor.scale_factor()).round() as i32;
        let distances = [x - left, right - x, y - top, bottom - y];
        let nearest = *distances.iter().min().unwrap_or(&0);
        if distances[0] <= threshold || (mode == Mode::Bubble && nearest == distances[0]) {
            x = left;
        } else if distances[1] <= threshold || (mode == Mode::Bubble && nearest == distances[1]) {
            x = right;
        }
        if distances[2] <= threshold || (mode == Mode::Bubble && nearest == distances[2]) {
            y = top;
        } else if distances[3] <= threshold || (mode == Mode::Bubble && nearest == distances[3]) {
            y = bottom;
        }
    }
    PhysicalPosition::new(x, y)
}

fn restore_target(
    window: &WebviewWindow,
    data: &Data,
    mode: Mode,
) -> Result<(PhysicalPosition<i32>, PhysicalSize<u32>), String> {
    let saved = data.get_setting::<Placement>(mode.geometry_key())?;
    let current = window
        .current_monitor()
        .map_err(|error| error.to_string())?;
    let primary = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let saved_monitor = saved.and_then(|placement| {
        window
            .monitor_from_point(placement.x as f64 + 1.0, placement.y as f64 + 1.0)
            .ok()
            .flatten()
    });
    let monitor = saved_monitor
        .or(current)
        .or(primary)
        .ok_or("No display is available.")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let mut logical = mode.dimensions();
    if let Some(placement) = saved.filter(|_| mode == Mode::Full) {
        logical = LogicalSize::new(placement.width.max(720.0), placement.height.max(510.0));
    }
    let pixels = logical.to_physical::<u32>(scale);
    let size = PhysicalSize::new(
        pixels.width.min(area.size.width),
        pixels.height.min(area.size.height),
    );
    let free_x = area.size.width.saturating_sub(size.width) as i32;
    let free_y = area.size.height.saturating_sub(size.height) as i32;
    let margin = (18.0 * scale).round() as i32;
    let default = if mode == Mode::Full {
        PhysicalPosition::new(area.position.x + free_x / 2, area.position.y + free_y / 2)
    } else {
        PhysicalPosition::new(
            area.position.x + free_x - margin,
            area.position.y + free_y - margin,
        )
    };
    let position = saved.map_or(default, |value| PhysicalPosition::new(value.x, value.y));
    Ok((
        position_in_work_area(position, size, &monitor, mode, mode == Mode::Bubble),
        size,
    ))
}

pub fn save(window: &WebviewWindow, data: &Data, mode: Mode, snap: bool) -> Result<(), String> {
    let layout = window.state::<Arc<Layout>>();
    let result = (|| -> tauri::Result<Option<Placement>> {
        if layout.animating.load(Ordering::Relaxed)
            || !window.is_visible()?
            || window.is_maximized()?
            || window.is_minimized()?
        {
            return Ok(None);
        }
        let mut position = window.outer_position()?;
        let size = window.inner_size()?;
        if let Some(monitor) = window.current_monitor()? {
            let fitted = position_in_work_area(position, size, &monitor, mode, snap);
            if fitted != position && snap {
                window.set_position(fitted)?;
                position = fitted;
            }
        }
        let logical = size.to_logical::<f64>(window.scale_factor()?);
        Ok(Some(Placement {
            x: position.x,
            y: position.y,
            width: logical.width,
            height: logical.height,
        }))
    })()
    .map_err(|error| error.to_string())?;
    if let Some(placement) = result {
        let key = mode.geometry_key();
        if data.get_setting::<Placement>(key)? != Some(placement) {
            data.set_setting(key, &placement)?;
        }
    }
    Ok(())
}

pub fn configure(
    window: &WebviewWindow,
    data: &Data,
    mode: Mode,
    pinned: bool,
    animate: bool,
) -> Result<(), String> {
    let (target_position, target_size) = restore_target(window, data, mode)?;
    let layout = window.state::<Arc<Layout>>().inner().clone();
    let generation = layout.generation.fetch_add(1, Ordering::Relaxed) + 1;
    let full = mode == Mode::Full;
    let result = (|| -> tauri::Result<_> {
        if window.is_maximized()? {
            window.unmaximize()?;
        }
        window.set_min_size(None::<LogicalSize<f64>>)?;
        window.set_resizable(true)?;
        window.set_focusable(full)?;
        window.set_always_on_top(!full && pinned)?;
        window.set_skip_taskbar(!full)?;
        Ok((
            window.outer_position()?,
            window.inner_size()?,
            animate && window.is_visible()?,
        ))
    })()
    .map_err(|error| error.to_string())?;

    if !result.2 {
        layout.animating.store(false, Ordering::Relaxed);
        window
            .set_position(target_position)
            .map_err(|error| error.to_string())?;
        window
            .set_size(target_size)
            .map_err(|error| error.to_string())?;
        return finish(window, full).map_err(|error| error.to_string());
    }

    layout.animating.store(true, Ordering::Relaxed);
    let window = window.clone();
    let (initial_position, initial_size, _) = result;
    std::thread::spawn(move || {
        const FRAMES: u32 = 8;
        for frame in 1..=FRAMES {
            std::thread::sleep(Duration::from_millis(16));
            if layout.generation.load(Ordering::Relaxed) != generation {
                break;
            }
            let progress = 1.0 - (1.0 - frame as f64 / FRAMES as f64).powi(3);
            let interpolate = |from: f64, to: f64| (from + (to - from) * progress).round();
            let position = PhysicalPosition::new(
                interpolate(initial_position.x as f64, target_position.x as f64) as i32,
                interpolate(initial_position.y as f64, target_position.y as f64) as i32,
            );
            let size = PhysicalSize::new(
                interpolate(initial_size.width as f64, target_size.width as f64) as u32,
                interpolate(initial_size.height as f64, target_size.height as f64) as u32,
            );
            let target = window.clone();
            let layout = layout.clone();
            if window
                .run_on_main_thread(move || {
                    if layout.generation.load(Ordering::Relaxed) != generation {
                        return;
                    }
                    let _ = target.set_position(position);
                    let _ = target.set_size(size);
                    if frame == FRAMES {
                        let _ = finish(&target, full);
                        layout.animating.store(false, Ordering::Relaxed);
                    }
                })
                .is_err()
            {
                break;
            }
        }
    });
    Ok(())
}

fn finish(window: &WebviewWindow, full: bool) -> tauri::Result<()> {
    if full {
        let monitor = window.current_monitor()?;
        let (width, height) = monitor.map_or((720.0, 510.0), |item| {
            let work = item.work_area().size.to_logical::<f64>(item.scale_factor());
            (720.0_f64.min(work.width), 510.0_f64.min(work.height))
        });
        window.set_min_size(Some(LogicalSize::new(width, height)))?;
    }
    window.set_resizable(full)
}

pub fn watch(window: &WebviewWindow) {
    let (send, receive) = mpsc::sync_channel::<()>(1);
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            let _ = send.try_send(());
        }
    });
    let window = window.clone();
    std::thread::spawn(move || {
        while receive.recv().is_ok() {
            while receive.recv_timeout(Duration::from_millis(180)).is_ok() {}
            let target = window.clone();
            if window
                .run_on_main_thread(move || {
                    let data = target.state::<Data>();
                    if let Ok(state) = preferences(&data) {
                        let _ = save(&target, &data, state.mode, true);
                    }
                })
                .is_err()
            {
                break;
            }
        }
    });
}
