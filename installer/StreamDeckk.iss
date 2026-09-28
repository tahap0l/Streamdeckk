; StreamDeckk Windows kurulum sihirbazı (Inno Setup 6)
; Derleme: iscc /DAppVersion=2.0.0 installer\StreamDeckk.iss  (önce dist\StreamDeckk.exe üretilmiş olmalı)

#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif

[Setup]
AppId={{6F3A2C1E-8B5D-4E7A-9C2F-5D1B8A7E4C3D}
AppName=StreamDeckk
AppVersion={#AppVersion}
AppVerName=StreamDeckk {#AppVersion}
AppPublisher=StreamDeckk
DefaultDirName={autopf}\StreamDeckk
DefaultGroupName=StreamDeckk
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=StreamDeckk-Kurulum
SetupIconFile=..\src\StreamDeckk\app.ico
UninstallDisplayIcon={app}\StreamDeckk.exe
UninstallDisplayName=StreamDeckk
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaüstüne kısayol oluştur"
Name: "autostart"; Description: "Windows açılınca StreamDeckk'i otomatik başlat (arka planda)"; Flags: unchecked

[Files]
Source: "..\dist\StreamDeckk.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\StreamDeckk"; Filename: "{app}\StreamDeckk.exe"
Name: "{autoprograms}\StreamDeckk Öz-Test"; Filename: "{app}\StreamDeckk.exe"; Parameters: "--selftest"
Name: "{autodesktop}\StreamDeckk"; Filename: "{app}\StreamDeckk.exe"; Tasks: desktopicon
Name: "{userstartup}\StreamDeckk"; Filename: "{app}\StreamDeckk.exe"; Parameters: "--hidden"; Tasks: autostart

[Run]
; Telefonun bağlanabilmesi için güvenlik duvarı izni (eski kural varsa önce silinir)
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""StreamDeckk"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""StreamDeckk"" dir=in action=allow program=""{app}\StreamDeckk.exe"" enable=yes profile=any"; Flags: runhidden; StatusMsg: "Güvenlik duvarı izni ekleniyor..."
Filename: "{app}\StreamDeckk.exe"; Description: "StreamDeckk'i şimdi başlat"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im StreamDeckk.exe"; Flags: runhidden; RunOnceId: "StopApp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""StreamDeckk"""; Flags: runhidden; RunOnceId: "RemoveFirewall"
