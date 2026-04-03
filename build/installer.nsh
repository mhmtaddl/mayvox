; CylkSohbet — Custom NSIS installer hooks
; customInit: installer başlamadan önce çalışan uygulamayı kapat
; customCheckAppRunning preprocessor sırası nedeniyle çalışmadığı için
; customInit hook'u kullanılıyor.

!macro customInit
  ; 1. Graceful kapat (WM_CLOSE)
  nsExec::ExecToStack 'taskkill /IM "CylkSohbet.exe"'
  Sleep 2000

  ; 2. Force kill — tree kill dahil (child process'ler, GPU, renderer)
  nsExec::ExecToStack 'taskkill /F /T /IM "CylkSohbet.exe"'
  Sleep 3000
!macroend
