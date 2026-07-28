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

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

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
