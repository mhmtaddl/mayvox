; PigeVox — Custom NSIS installer hooks
; customInit: installer başlamadan önce çalışan uygulamayı kapat
; customCheckAppRunning preprocessor sırası nedeniyle çalışmadığı için
; customInit hook'u kullanılıyor.

!macro customInit
  ; ── Diagnostic log — davranış değişikliği yok ──
  FileOpen $0 "$TEMP\PigeVox-installer.log" a
  FileWrite $0 "=== PigeVox Installer Diagnostic ===$\r$\n"
  FileWrite $0 "INSTDIR: $INSTDIR$\r$\n"
  FileWrite $0 "TEMP: $TEMP$\r$\n"
  FileWrite $0 "LOCALAPPDATA: $LOCALAPPDATA$\r$\n"
  FileWrite $0 "PROGRAMFILES: $PROGRAMFILES$\r$\n"
  FileWrite $0 "PROGRAMFILES64: $PROGRAMFILES64$\r$\n"
  FileClose $0

  ; Eski kurulum yollarını kontrol et
  FileOpen $0 "$TEMP\PigeVox-installer.log" a
  FileSeek $0 0 END
  IfFileExists "$PROGRAMFILES\PigeVox\PigeVox.exe" 0 +2
    FileWrite $0 "FOUND: $PROGRAMFILES\PigeVox\PigeVox.exe$\r$\n"
  IfFileExists "$PROGRAMFILES64\PigeVox\PigeVox.exe" 0 +2
    FileWrite $0 "FOUND: $PROGRAMFILES64\PigeVox\PigeVox.exe$\r$\n"
  IfFileExists "$LOCALAPPDATA\PigeVox\PigeVox.exe" 0 +2
    FileWrite $0 "FOUND: $LOCALAPPDATA\PigeVox\PigeVox.exe$\r$\n"
  IfFileExists "$LOCALAPPDATA\Programs\PigeVox\PigeVox.exe" 0 +2
    FileWrite $0 "FOUND: $LOCALAPPDATA\Programs\PigeVox\PigeVox.exe$\r$\n"
  IfFileExists "$APPDATA\PigeVox\PigeVox.exe" 0 +2
    FileWrite $0 "FOUND: $APPDATA\PigeVox\PigeVox.exe$\r$\n"

  FileWrite $0 "taskkill basliyor$\r$\n"
  FileClose $0

  ; --- Mevcut taskkill akışı (DEĞİŞMEDİ) ---
  ; 1. Graceful kapat (WM_CLOSE)
  nsExec::ExecToStack 'taskkill /IM "PigeVox.exe"'
  Sleep 2000

  ; 2. Force kill — tree kill dahil (child process'ler, GPU, renderer)
  nsExec::ExecToStack 'taskkill /F /T /IM "PigeVox.exe"'
  Sleep 3000

  ; Taskkill sonrası log
  FileOpen $0 "$TEMP\PigeVox-installer.log" a
  FileSeek $0 0 END
  FileWrite $0 "taskkill tamamlandi, kuruluma devam$\r$\n"
  FileClose $0
!macroend

; Eski sürüm uninstall başarısız olursa installer'ı durdurma,
; overwrite ile devam et (auto-update senaryosu için)
!macro customUnInstallCheck
!macroend
