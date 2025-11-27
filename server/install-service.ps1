param(
  [string]$Name = "SchemaPilot",
  [int]$Port = 4000
)
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$node = (Get-Command node).Source
$bin = "`"$node`" `"$root\server\server.js`""
sc.exe create $Name binPath= $bin start= auto | Out-Null
sc.exe description $Name "SchemaPilot Node Server" | Out-Null
$svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Running") { Start-Service -Name $Name }

