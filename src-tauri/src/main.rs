#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ── Windows 전용: 창 이동/리사이즈 시 한글(IME) "문자열 마무리" 팝업 회피 ──
//
// 배경: wry는 Windows에서 창이 움직이거나 크기가 바뀌기 "시작"하는 순간
// (WM_ENTERSIZEMOVE)에 드롭다운 위치 버그를 막기 위해 웹뷰에 포커스를 강제로
// 다시 준다. 이 강제 재포커스가 한글 조합 중이던 IME 세션을 끊어버려서
// "문자열 마무리" 팝업으로 이어진다. 순수하게 창 위치만 옮기는 경우(크기 변화
// 없음)에도 재현되는 것으로 확인됐다 — 즉 index.html의 JS(리사이즈에만 반응)는
// 전혀 관련이 없고, 100% 이 네이티브 동작이 원인이다. VS Code(Electron, 자체
// Chromium을 직접 들고 다니며 창을 관리)에서는 재현되지 않는 것도 이 진단과 일치한다.
//
// 이전 두 번의 시도는 "지금 한글을 조합 중인지"를 IMM32 레거시 API
// (ImmGetCompositionStringW)로 판단한 뒤 조합 중일 때만 이 메시지를 막으려
// 했는데, 효과가 없었다. WebView2 안의 Chromium은 조합 상태를 레거시 IMM32가
// 아니라 최신 TSF(Text Services Framework)로 관리하기 때문에, 그 IMM32 API로는
// 애초에 조합 여부를 제대로 읽어낼 수 없었던 것으로 보인다.
//
// 그래서 이번에는 조합 여부를 판단하려 하지 않고, WM_ENTERSIZEMOVE 메시지를
// 무조건 wry의 서브클래스로 넘기지 않는다(=강제 재포커스 자체가 아예 일어나지
// 않는다). 대가로 창을 드래그하는 바로 그 순간에 한해 드롭다운 메뉴 위치가
// 살짝 어긋날 수 있지만(이 앱은 네이티브 드롭다운을 거의 쓰지 않는다), 그보다
// 훨씬 자주 겪는 한글 입력 끊김 문제를 막는 쪽이 낫다는 판단이다.
#[cfg(target_os = "windows")]
mod win_ime_fix {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::WM_ENTERSIZEMOVE;

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uidsubclass: usize,
        _dwrefdata: usize,
    ) -> LRESULT {
        if msg == WM_ENTERSIZEMOVE {
            return LRESULT(0);
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    /// 메인 창 핸들에 서브클래스 프로시저를 설치한다. 앱이 실행되는 동안 계속 유지되며,
    /// 별도로 해제(RemoveWindowSubclass)하지 않아도 창이 파괴되면 자동으로 정리된다.
    pub fn install(hwnd: HWND) {
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 1, 0);
        }
    }
}

/// 다른 작품을 새 창(webview)으로 연다. 같은 label의 창이 이미 있으면 포커스만 준다.
///
/// 시도 1: 열 작품 경로를 `index.html?open=...` 같은 URL 쿼리 문자열로 넘겼는데,
/// Tauri의 WebviewUrl::App(PathBuf)는 쿼리 문자열을 안전하게 다루지 못해 페이지
/// 로딩 자체가 깨지고 흰 화면만 뜨는 문제가 있었다.
///
/// 시도 2: URL 대신 initialization_script로 전역 변수를 심는 방식으로 바꿨지만,
/// 여전히 흰 화면이었고 이번엔 개발자 도구(우클릭 검사/F12)조차 뜨지 않았다 —
/// 웹뷰(WebView2) 자체가 그 창에 정상적으로 붙어있지 않다는 신호였다. 그래서
/// `app.run_on_main_thread`로 실제 창/웹뷰 생성을 메인 스레드에 위임하고 채널로
/// 결과를 기다리게 했는데(시도 3), 이번엔 앱 전체(기존 창까지)가 완전히
/// 멈춰버렸다 — Tauri에서 동기(non-async) 커맨드는 기본적으로 메인 스레드에서
/// 그대로 실행되기 때문에, 이미 메인 스레드 위에서 "메인 스레드에서 실행해줘"를
/// 요청하고 그 결과를 기다리는 자기 자신 데드락이었던 것이다.
///
/// 그래서 이 커맨드를 `async fn`으로 바꿨다. Tauri는 async 커맨드를 별도의
/// 비동기 런타임 태스크(메인/UI 스레드가 아닌 스레드)에서 실행하므로, 그 안에서
/// `run_on_main_thread` + 채널 대기를 쓰는 게 이제는 안전하다 — 대기하는 쪽과
/// 실행하는 쪽이 서로 다른 스레드가 된다.
#[tauri::command]
async fn open_work_window(
    app: tauri::AppHandle,
    label: String,
    path: String,
    disp: Option<String>,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(());
    }
    let path_json = serde_json::to_string(&path).map_err(|e| e.to_string())?;
    let disp_json = serde_json::to_string(&disp).map_err(|e| e.to_string())?;
    let init_script = format!(
        "window.__STORYSEED_OPEN_PATH__={};window.__STORYSEED_OPEN_DISP__={};",
        path_json, disp_json
    );

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let app_main = app.clone();
    let label_main = label.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            // tauri.conf.json의 메인 창은 dragDropEnabled:false로 설정되어 있다 — 이게
            // 꺼져 있어야 바인더의 자체 HTML5 드래그(draggable+dragstart/drop)가 정상
            // 동작한다(켜져 있으면 Tauri/OS 레벨 네이티브 드래그가 그 이벤트를 먼저
            // 가로채 버린다). Rust로 동적 생성하는 창은 이 설정을 자동으로 물려받지
            // 않는데, 게다가 빌더에 `.drag_and_drop(false)`를 직접 체이닝하는 방식은
            // Tauri 쪽에 알려진 버그(tauri-apps/tauri#13761)로 간헐적으로 안 먹는다.
            // 그래서 메인 창과 완전히 동일한 방식 — WindowConfig를 통째로 만들어
            // from_config로 창을 생성 — 으로 우회한다.
            let webview_url = tauri::WebviewUrl::App("index.html".into());
            let mut win_config = tauri::utils::config::WindowConfig::default();
            win_config.label = label_main.clone();
            win_config.url = webview_url;
            win_config.title = "스토리시드 Beta".into();
            win_config.width = 1320.0;
            win_config.height = 840.0;
            win_config.min_width = Some(400.0);
            win_config.min_height = Some(520.0);
            win_config.drag_drop_enabled = false;
            let window = tauri::WebviewWindowBuilder::from_config(&app_main, &win_config)
                .map_err(|e| e.to_string())?
                .initialization_script(&init_script)
                .build()
                .map_err(|e| e.to_string())?;
            #[cfg(target_os = "windows")]
            {
                if let Ok(hwnd) = window.hwnd() {
                    win_ime_fix::install(hwnd);
                }
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())?
}

/// 내부 관리용 파일/폴더(점(.)으로 시작하는 이름)에 Windows의 실제 숨김 속성
/// (FILE_ATTRIBUTE_HIDDEN)을 걸어준다. 점 접두사만으로는 탐색기가 자동으로
/// 숨겨주지 않기 때문에 필요하다. 기존에 켜져 있던 다른 속성 비트는 그대로 보존한다.
#[cfg(target_os = "windows")]
#[tauri::command]
fn set_hidden_attribute(path: String) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, INVALID_FILE_ATTRIBUTES,
    };

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let pcwstr = PCWSTR(wide.as_ptr());

    unsafe {
        let attrs = GetFileAttributesW(pcwstr);
        if attrs == INVALID_FILE_ATTRIBUTES {
            return Err(format!("경로를 찾을 수 없습니다: {path}"));
        }
        let new_attrs = windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(
            attrs | FILE_ATTRIBUTE_HIDDEN.0,
        );
        SetFileAttributesW(pcwstr, new_attrs).map_err(|e| e.to_string())
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_hidden_attribute(_path: String) -> Result<(), String> {
    Ok(())
}

fn main() {
    // 단일 인스턴스 보장(데스크톱 전용): 앱이 이미 실행 중일 때 아이콘을 다시
    // 클릭하면 새 프로세스/새 창을 만드는 대신 기존 창에 포커스만 준다.
    // 공식 문서 요구사항: 이 플러그인은 반드시 다른 어떤 .plugin(...) 호출보다도
    // 먼저 등록되어야 한다.
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            let window = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().values().next().cloned());
            if let Some(w) = window {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }

    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_work_window, set_hidden_attribute]);

    // 자동 업데이트(데스크톱 전용): GitHub Releases의 latest.json을 확인해 새 버전을 내려받아 설치
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(target_os = "windows")]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(hwnd) = window.hwnd() {
                win_ime_fix::install(hwnd);
            }
        }
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("스토리시드 실행 중 오류가 발생했습니다");
}
